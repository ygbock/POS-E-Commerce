import assert from 'node:assert/strict';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import {
  MFA_CONSTANTS,
  base32Encode,
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpCode,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpCode,
} from '../server/auth/platformMfa';

async function main() {
  process.env.MFA_ENCRYPTION_KEY = '11'.repeat(32);

  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  const tableChecks = await db.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_name IN ('platform_mfa_credentials','platform_mfa_recovery_codes','platform_mfa_challenges')
      ORDER BY table_name`,
  );
  assert.deepEqual(
    tableChecks.rows.map((row: any) => row.table_name),
    ['platform_mfa_challenges', 'platform_mfa_credentials', 'platform_mfa_recovery_codes'],
  );

  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  assert.equal(Buffer.from(secret).length >= 32, true);

  const timestamp = 1_000_000_000_000;
  const code = generateTotpCode(secret, timestamp);
  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotpCode(secret, code, timestamp).valid, true);
  assert.equal(verifyTotpCode(secret, code, timestamp + 30_000).valid, true);
  assert.equal(verifyTotpCode(secret, code, timestamp + 90_000).valid, false);

  const encrypted = encryptTotpSecret(secret);
  assert.notEqual(encrypted.ciphertext, secret);
  assert.equal(decryptTotpSecret(encrypted.ciphertext, encrypted.iv, encrypted.authTag), secret);

  const uri = buildOtpAuthUri({ secret, email: 'admin@example.test' });
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /algorithm=SHA1/);
  assert.match(uri, /digits=6/);
  assert.match(uri, /period=30/);

  const recoveryCodes = generateRecoveryCodes();
  assert.equal(recoveryCodes.length, MFA_CONSTANTS.recoveryCodeCount);
  assert.ok(new Set(recoveryCodes).size === recoveryCodes.length);
  assert.ok(recoveryCodes.every((code) => /^[A-F0-9]{12}$/.test(code)));
  assert.notEqual(hashRecoveryCode(recoveryCodes[0]), recoveryCodes[0]);

  // RFC 6238 SHA-1 test vector at T=59.
  const rfcSecret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
  assert.equal(generateTotpCode(rfcSecret, 59_000), '287082');

  console.log('Platform MFA foundation PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
