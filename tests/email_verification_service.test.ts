import assert from 'node:assert/strict';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { EmailVerificationService, EmailVerificationDelivery } from '../server/services/emailVerificationService';

class TestDelivery implements EmailVerificationDelivery {
  sent: Array<{ userId: string; email: string; verificationUrl: string; expiresAt: Date }> = [];

  async sendVerificationEmail(input: {
    userId: string;
    email: string;
    verificationUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    this.sent.push(input);
  }
}

class FailingDelivery implements EmailVerificationDelivery {
  async sendVerificationEmail(): Promise<void> {
    throw new Error('DELIVERY_FAILED: Test delivery failure');
  }
}

async function seedUser(db: DatabaseClient, id: string, email: string): Promise<void> {
  await db.query(
    `INSERT INTO users
      (id,organization_id,email,name,password_hash,password_salt,role,is_active)
     VALUES ($1,'org_default',$2,'Verification Service User','hash','salt','viewer',TRUE)`,
    [id, email],
  );
}

async function main() {
  const db = createIsolatedTestClient();
  await runMigrations(db);
  await seedUser(db, 'usr_verification_service', 'service@example.com');

  const delivery = new TestDelivery();
  const service = new EmailVerificationService(db, {
    delivery,
    verificationBaseUrl: 'https://app.example.test',
  });

  const requested = await service.requestVerification('usr_verification_service');
  assert.equal(requested.status, 'SENT');
  assert.equal(delivery.sent.length, 1);
  assert.equal(delivery.sent[0].email, 'service@example.com');
  assert.match(delivery.sent[0].verificationUrl, /^https:\/\/app\.example\.test\/verify-email\?token=/);

  const tokenMatch = delivery.sent[0].verificationUrl.match(/[?&]token=([^&]+)/);
  assert.ok(tokenMatch);
  const rawToken = decodeURIComponent(tokenMatch![1]);

  const pending = await db.query(
    'SELECT email_verified_at FROM users WHERE id=$1',
    ['usr_verification_service'],
  );
  assert.equal(pending.rows[0].email_verified_at, null);

  const confirmed = await service.confirmVerification(rawToken);
  assert.equal(confirmed.status, 'VERIFIED');
  assert.equal(confirmed.email, 'service@example.com');
  assert.ok(confirmed.verifiedAt);

  const verified = await db.query(
    'SELECT email_verified_at FROM users WHERE id=$1',
    ['usr_verification_service'],
  );
  assert.ok(verified.rows[0].email_verified_at);

  await assert.rejects(
    () => service.confirmVerification(rawToken),
    (error: any) => error?.message === 'INVALID_VERIFICATION_TOKEN',
  );

  const already = await service.requestVerification('usr_verification_service');
  assert.equal(already.status, 'ALREADY_VERIFIED');
  assert.equal(delivery.sent.length, 1);

  await seedUser(db, 'usr_verification_failure', 'failure@example.com');
  const failingService = new EmailVerificationService(db, { delivery: new FailingDelivery() });

  await assert.rejects(
    () => failingService.requestVerification('usr_verification_failure'),
    (error: any) => error?.message === 'DELIVERY_FAILED: Test delivery failure',
  );

  const failedChallenge = await db.query(
    `SELECT used_at FROM email_verification_tokens
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 1`,
    ['usr_verification_failure'],
  );
  assert.ok(failedChallenge.rows[0].used_at);

  const events = await db.query(
    `SELECT action, result, metadata
       FROM audit_events
      WHERE organization_id='org_default'
        AND entity_id IN ('usr_verification_service','usr_verification_failure')
        AND action LIKE 'EMAIL_VERIFICATION_%'
      ORDER BY timestamp ASC`,
  );
  const actions = events.rows.map((row: any) => row.action);
  assert.ok(actions.includes('EMAIL_VERIFICATION_REQUESTED'));
  assert.ok(actions.includes('EMAIL_VERIFICATION_COMPLETED'));
  assert.ok(actions.includes('EMAIL_VERIFICATION_DELIVERY_FAILED'));
  assert.ok(!JSON.stringify(events.rows).includes(rawToken));

  console.log('Email verification service lifecycle PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
