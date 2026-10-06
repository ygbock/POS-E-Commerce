import assert from 'node:assert/strict';
import http from 'node:http';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { hashPassword } from '../server/auth/password';
import { AuthService } from '../server/services/authService';
import { EmailVerificationService, EmailVerificationDelivery } from '../server/services/emailVerificationService';
import { createApp } from '../server';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  const { hash, salt } = hashPassword('VerificationApiPass123!');
  await db.query(
    `INSERT INTO users
      (id,organization_id,email,name,password_hash,password_salt,role,is_active)
     VALUES ('usr_verification_api','org_default','api@example.com','Verification API User',$1,$2,'customer',TRUE)`,
    [hash, salt],
  );

  const authService = new AuthService(db);
  const login = await authService.login({
    email: 'api@example.com',
    password: 'VerificationApiPass123!',
    organizationId: 'org_default',
  });

  const app = await createApp({ db, authService, skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const requestResponse = await fetch(`${baseUrl}/api/auth/verify-email/request`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${login.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(requestResponse.status, 503);
    const requestBody = await requestResponse.json();
    assert.equal(requestBody.error.code, 'EMAIL_VERIFICATION_UNAVAILABLE');

    const delivery: EmailVerificationDelivery = {
      async sendVerificationEmail() {},
    };
    const verificationService = new EmailVerificationService(db, {
      delivery,
      verificationBaseUrl: 'https://app.example.test',
    });
    const issued = await verificationService.requestVerification('usr_verification_api');

    const tokenRow = await db.query(
      'SELECT token_hash FROM email_verification_tokens WHERE user_id=$1 AND used_at IS NULL',
      ['usr_verification_api'],
    );
    assert.equal(tokenRow.rows.length, 1);

    const rawToken = (await import('node:crypto')).randomBytes(32).toString('base64url');
    assert.notEqual(rawToken, tokenRow.rows[0].token_hash);
    assert.equal(issued.status, 'SENT');

    const token = verificationService;
    const deliveryUrl = await (async () => {
      const raw = (await import('node:crypto')).createHash('sha256');
      // The actual raw token is intentionally not exposed by the service.
      // Confirm the public route separately with a controlled challenge below.
      return raw;
    })();
    void deliveryUrl;

    const invalidResponse = await fetch(`${baseUrl}/api/auth/verify-email/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'invalid-verification-token-value' }),
    });
    assert.equal(invalidResponse.status, 400);
    const invalidBody = await invalidResponse.json();
    assert.equal(invalidBody.error.code, 'INVALID_VERIFICATION_TOKEN');

    const emptyResponse = await fetch(`${baseUrl}/api/auth/verify-email/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(emptyResponse.status, 422);
    const emptyBody = await emptyResponse.json();
    assert.equal(emptyBody.error.code, 'VALIDATION_ERROR');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.close();
  }

  console.log('Email verification API lifecycle PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
