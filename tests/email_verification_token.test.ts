import assert from 'node:assert/strict';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import {
  createEmailVerificationToken,
  consumeEmailVerificationToken,
  findEmailVerificationToken,
  generateEmailVerificationToken,
  hashEmailVerificationToken,
} from '../server/auth/emailVerification';

async function seedUser(db: DatabaseClient, id: string, email: string): Promise<void> {
  await db.query(
    `INSERT INTO users
      (id,organization_id,email,name,password_hash,password_salt,role,is_active)
     VALUES ($1,'org_default',$2,'Verification Test User','hash','salt','viewer',TRUE)`,
    [id, email],
  );
}

async function main() {
  const db = createIsolatedTestClient();

  await runMigrations(db);
  await seedUser(db, 'usr_email_verification', 'verify@example.com');

  const rawToken = generateEmailVerificationToken();
  assert.equal(rawToken.length >= 40, true);
  assert.notEqual(hashEmailVerificationToken(rawToken), rawToken);

  const created = await createEmailVerificationToken(db, {
    userId: 'usr_email_verification',
    email: 'VERIFY@EXAMPLE.COM',
    token: rawToken,
  });

  assert.equal(created.user_id, 'usr_email_verification');
  assert.equal(created.email_snapshot, 'verify@example.com');
  assert.equal(created.token_hash, hashEmailVerificationToken(rawToken));
  assert.equal(created.used_at, null);
  assert.ok(new Date(created.expires_at).getTime() > Date.now());

  const persisted = await db.query(
    'SELECT token_hash FROM email_verification_tokens WHERE id=$1',
    [created.id],
  );
  assert.equal(persisted.rows[0].token_hash, hashEmailVerificationToken(rawToken));
  assert.notEqual(persisted.rows[0].token_hash, rawToken);

  const found = await findEmailVerificationToken(db, rawToken);
  assert.equal(found?.id, created.id);

  const replacementToken = generateEmailVerificationToken();
  const replacement = await createEmailVerificationToken(db, {
    userId: 'usr_email_verification',
    email: 'verify@example.com',
    token: replacementToken,
  });

  const previous = await findEmailVerificationToken(db, rawToken);
  assert.equal(previous?.used_at !== null, true);
  assert.equal(replacement.used_at, null);

  const consumed = await consumeEmailVerificationToken(db, replacementToken);
  assert.equal(consumed?.id, replacement.id);
  assert.ok(consumed?.used_at);

  const replay = await consumeEmailVerificationToken(db, replacementToken);
  assert.equal(replay, null);

  const expiredToken = generateEmailVerificationToken();
  const expired = await createEmailVerificationToken(db, {
    userId: 'usr_email_verification',
    email: 'verify@example.com',
    token: expiredToken,
    expiresAt: new Date(Date.now() - 1000),
  });

  assert.equal(expired.used_at, null);
  assert.equal(await consumeEmailVerificationToken(db, expiredToken), null);

  console.log('Email verification token lifecycle PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
