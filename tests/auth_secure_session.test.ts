import assert from 'node:assert/strict';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { AuthService } from '../server/services/authService';
import { verifyToken } from '../server/auth/token';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);
  const auth = new AuthService(db);
  await auth.seedDefaultUsers();

  const login = await auth.login({
    email: 'superadmin@abacha.internal',
    password: 'SuperAdmin123!',
    organizationId: 'org_default',
  });

  assert.ok(login.token);
  assert.ok(login.refreshToken, 'refresh token must exist internally');
  assert.equal(Object.keys(login).includes('refreshToken'), false, 'refresh token must not be JSON-enumerable');

  const accessClaims = verifyToken(login.token);
  const session = await db.query(
    'SELECT * FROM auth_sessions WHERE access_jti=$1',
    [accessClaims.jti],
  );
  assert.equal(session.rows.length, 1, 'login must create a server-side session');
  assert.equal(session.rows[0].role, 'super_admin');
  assert.equal(session.rows[0].identity_type, 'staff');
  assert.ok(new Date(session.rows[0].refresh_expires_at).getTime() > Date.now());

  const refreshed = await auth.refreshSession(login.refreshToken!);
  assert.ok(refreshed.token);
  assert.ok(refreshed.refreshToken);
  assert.notEqual(refreshed.refreshToken, login.refreshToken, 'refresh token must rotate');

  await assert.rejects(
    () => auth.refreshSession(login.refreshToken!),
    (err: any) => err?.message === 'REFRESH_TOKEN_REUSE_DETECTED',
    'reuse of a rotated refresh token must revoke the family',
  );

  const family = await db.query(
    'SELECT COUNT(*)::int AS count FROM auth_sessions WHERE refresh_token_family_id=$1 AND revoked_at IS NOT NULL',
    [session.rows[0].refresh_token_family_id],
  );
  assert.ok(Number(family.rows[0].count) >= 2, 'refresh-token reuse must revoke the session family');

  // New login proves a clean session can still be established after family revocation.
  const second = await auth.login({
    email: 'superadmin@abacha.internal',
    password: 'SuperAdmin123!',
    organizationId: 'org_default',
  });
  const secondClaims = verifyToken(second.token);
  await auth.logout(second.token);
  await assert.rejects(
    () => auth.verifySession(second.token),
    (err: any) => err?.code === 'REVOKED',
    'logout must revoke the corresponding access session',
  );

  const secondSession = await db.query(
    'SELECT revoked_at FROM auth_sessions WHERE access_jti=$1',
    [secondClaims.jti],
  );
  assert.ok(secondSession.rows[0]?.revoked_at, 'logout must mark the server session revoked');

  console.log('Auth secure session lifecycle tests: PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
