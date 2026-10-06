import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { AuthService } from '../server/services/authService';

async function main() {
  process.env.PASSWORD_RESET_URL = 'https://app.example.test/reset';

  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  const auth = new AuthService(db);
  await auth.seedDefaultUsers();

  // Request flow: unknown accounts remain non-enumerating and known accounts
  // create a single active challenge without placing the credential in audit logs.
  await auth.requestPasswordReset('does-not-exist@example.test', 'org_default');

  await auth.requestPasswordReset('superadmin@abacha.internal', 'org_default');
  const firstToken = await db.query(
    `SELECT id, token_hash, created_at, used_at
       FROM password_reset_tokens
      WHERE user_id='usr_super_admin' AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
  );
  assert.equal(firstToken.rows.length, 1);
  assert.equal(firstToken.rows[0].token_hash.length, 64);

  const requestedAudit = await db.query(
    `SELECT metadata::text AS details
       FROM audit_events
      WHERE organization_id='org_default' AND entity_id='usr_super_admin' AND action='password_reset_requested'
      ORDER BY created_at DESC
      LIMIT 1`,
  );
  assert.equal(requestedAudit.rows.length, 1);
  assert.ok(!requestedAudit.rows[0].details.includes('token='));
  assert.ok(!requestedAudit.rows[0].details.includes(firstToken.rows[0].token_hash));

  // Cooldown prevents repeated challenge rotation/mailbox flooding.
  await auth.requestPasswordReset('superadmin@abacha.internal', 'org_default');
  const activeCount = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM password_reset_tokens
      WHERE user_id='usr_super_admin' AND used_at IS NULL`,
  );
  assert.equal(Number(activeCount.rows[0].count), 1);

  // Create a deterministic challenge so the test can exercise the complete
  // credential-reset path without requiring a real email provider.
  const knownToken = 'phase3c-known-reset-token';
  const knownHash = crypto.createHash('sha256').update(knownToken).digest('hex');
  await db.query(
    `UPDATE password_reset_tokens
        SET used_at=CURRENT_TIMESTAMP
      WHERE user_id='usr_super_admin' AND used_at IS NULL`,
  );
  await db.query(
    `INSERT INTO password_reset_tokens
      (id,user_id,token_hash,expires_at)
     VALUES ($1,'usr_super_admin',$2,CURRENT_TIMESTAMP + INTERVAL '30 minutes')`,
    ['phase3c-reset-test', knownHash],
  );

  const login = await auth.login({
    email: 'superadmin@abacha.internal',
    password: 'SuperAdmin123!',
    organizationId: 'org_default',
  });
  assert.ok(login.token);

  await auth.resetPassword(knownToken, 'Phase3C-NewPassword!123');

  // The reset challenge is one-time.
  const consumed = await db.query(
    `SELECT used_at FROM password_reset_tokens WHERE id='phase3c-reset-test'`,
  );
  assert.ok(consumed.rows[0]?.used_at);

  // Password reset must revoke every durable authenticated session.
  await assert.rejects(
    () => auth.verifySession(login.token),
    (err: any) => err?.code === 'REVOKED',
  );

  // The new password works, while the old credential no longer does.
  const renewed = await auth.login({
    email: 'superadmin@abacha.internal',
    password: 'Phase3C-NewPassword!123',
    organizationId: 'org_default',
  });
  assert.ok(renewed.token);

  await assert.rejects(
    () => auth.login({
      email: 'superadmin@abacha.internal',
      password: 'SuperAdmin123!',
      organizationId: 'org_default',
    }),
    (err: any) => err?.message === 'Invalid email or password',
  );

  // Completion audit contains only non-sensitive state.
  const completedAudit = await db.query(
    `SELECT details::text AS details
       FROM audit_events
      WHERE organization_id='org_default' AND entity_id='usr_super_admin' AND action='password_reset_completed'
      ORDER BY created_at DESC
      LIMIT 1`,
  );
  assert.equal(completedAudit.rows.length, 1);
  assert.ok(completedAudit.rows[0].details.includes('tokenConsumed'));
  assert.ok(!completedAudit.rows[0].details.includes(knownToken));
  assert.ok(!completedAudit.rows[0].details.includes(knownHash));

  // Replay is rejected.
  await assert.rejects(
    () => auth.resetPassword(knownToken, 'Phase3C-ReplayPassword!123'),
    (err: any) => err?.message === 'INVALID_RESET_TOKEN',
  );

  console.log('Password recovery hardening PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
