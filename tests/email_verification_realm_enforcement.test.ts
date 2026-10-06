import assert from 'node:assert/strict';
import http from 'node:http';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { hashPassword } from '../server/auth/password';
import { AuthService } from '../server/services/authService';
import { createApp } from '../server';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  const authService = new AuthService(db);
  const owner = await authService.registerBusinessOwner({
    name: 'Verification Owner',
    email: 'verification-owner@example.test',
    password: 'VerificationOwner123!',
    businessName: 'Verification Commerce Hub',
    businessMode: 'DISCOVERY_AND_STORE',
  });

  const ownerMeBefore = await db.query(
    'SELECT email_verified_at,identity_type FROM users WHERE id=$1',
    [owner.user.id],
  );
  assert.equal(ownerMeBefore.rows[0].email_verified_at, null);
  assert.equal(ownerMeBefore.rows[0].identity_type, 'business_owner');

  // Login remains available while unverified so the account can reach verification.
  const unverifiedLogin = await authService.login({
    email: 'verification-owner@example.test',
    password: 'VerificationOwner123!',
    organizationId: owner.user.organizationId,
  });
  assert.equal(unverifiedLogin.user.identityType, 'business_owner');
  assert.ok(unverifiedLogin.token);

  const { hash: staffHash, salt: staffSalt } = hashPassword('VerificationStaff123!');
  const staffId = 'usr_verification_staff';
  await db.query(
    `INSERT INTO users
      (id,organization_id,email,name,password_hash,password_salt,role,is_active)
     VALUES ($1,$2,$3,$4,$5,$6,'viewer',TRUE)`,
    [staffId, owner.user.organizationId, 'verification-staff@example.test', 'Verification Staff', staffHash, staffSalt],
  );

  const app = await createApp({ db, authService, skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // /me remains available so an unverified owner can see verification state and
    // reach the verification flow; operational merchant access is gated.
    const meResponse = await fetch(`${baseUrl}/api/merchant/me`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert.equal(meResponse.status, 200);

    const overviewBefore = await fetch(
      `${baseUrl}/api/merchant/businesses/${owner.business!.id}/overview`,
      { headers: { Authorization: `Bearer ${owner.token}` } },
    );
    assert.equal(overviewBefore.status, 403);
    const overviewBeforeBody = await overviewBefore.json();
    assert.equal(overviewBeforeBody.error.code, 'EMAIL_VERIFICATION_REQUIRED');

    const createBusinessBefore = await fetch(`${baseUrl}/api/merchant/businesses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${owner.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ businessName: 'Blocked Business', businessMode: 'DISCOVERY_ONLY' }),
    });
    assert.equal(createBusinessBefore.status, 403);
    const createBusinessBody = await createBusinessBefore.json();
    assert.equal(createBusinessBody.error.code, 'EMAIL_VERIFICATION_REQUIRED');

    // Verification is authoritative in the users table, not the JWT. Once verified,
    // the same session can access the protected merchant operation.
    await db.query(
      'UPDATE users SET email_verified_at=CURRENT_TIMESTAMP WHERE id=$1',
      [owner.user.id],
    );

    const overviewAfter = await fetch(
      `${baseUrl}/api/merchant/businesses/${owner.business!.id}/overview`,
      { headers: { Authorization: `Bearer ${owner.token}` } },
    );
    assert.equal(overviewAfter.status, 200);

    const invitation = await db.query(
      `INSERT INTO discovery_business_invitations
        (id,business_id,invited_email,role,invited_by_user_id,status,expires_at)
       VALUES ($1,$2,$3,'STAFF',$4,'PENDING',CURRENT_TIMESTAMP + INTERVAL '7 days')
       RETURNING id`,
      ['d_inv_verification_staff', owner.business!.id, 'verification-staff@example.test', owner.user.id],
    );

    const staffLogin = await authService.login({
      email: 'verification-staff@example.test',
      password: 'VerificationStaff123!',
      organizationId: owner.user.organizationId,
    });
    assert.equal(staffLogin.user.identityType, 'staff');

    const staffAcceptBefore = await fetch(
      `${baseUrl}/api/merchant/businesses/${owner.business!.id}/team/invitations/${invitation.rows[0].id}/accept`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffLogin.token}` },
      },
    );
    assert.equal(staffAcceptBefore.status, 403);
    const staffAcceptBody = await staffAcceptBefore.json();
    assert.equal(staffAcceptBody.error.code, 'EMAIL_VERIFICATION_REQUIRED');

    await db.query(
      'UPDATE users SET email_verified_at=CURRENT_TIMESTAMP WHERE id=$1',
      [staffId],
    );

    const staffAcceptAfter = await fetch(
      `${baseUrl}/api/merchant/businesses/${owner.business!.id}/team/invitations/${invitation.rows[0].id}/accept`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffLogin.token}` },
      },
    );
    assert.equal(staffAcceptAfter.status, 200);
    const staffAcceptAfterBody = await staffAcceptAfter.json();
    assert.equal(staffAcceptAfterBody.data.status, 'ACCEPTED');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.close();
  }

  console.log('Email verification realm enforcement PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
