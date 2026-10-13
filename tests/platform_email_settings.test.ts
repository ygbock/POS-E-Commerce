import assert from 'node:assert/strict';
import { createIsolatedTestClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import {
  clearPlatformEmailSettings,
  getPlatformEmailSettingsStatus,
  getStoredResendConfig,
  savePlatformEmailSettings,
} from '../server/services/platformEmailSettings';

async function main() {
  process.env.MFA_ENCRYPTION_KEY = '11'.repeat(32);
  const db = createIsolatedTestClient();
  await runMigrations(db);

  const key = 're_test_key_1234567890';
  const saved = await savePlatformEmailSettings(db, {
    apiKey: key,
    fromEmail: 'AbaCha <no-reply@example.test>',
    actorId: null as any,
  });
  assert.equal(saved.configured, true);
  assert.equal(saved.fromEmail, 'AbaCha <no-reply@example.test>');
  assert.equal('apiKey' in saved, false, 'Public status must never contain the API key');

  const storedRow = await db.query<any>(
    "SELECT api_key_ciphertext, api_key_iv, api_key_auth_tag FROM platform_email_settings WHERE id='resend'",
  );
  assert.equal(storedRow.rows.length, 1);
  assert.notEqual(storedRow.rows[0].api_key_ciphertext, key, 'API key must be encrypted at rest');
  assert.ok(storedRow.rows[0].api_key_iv);
  assert.ok(storedRow.rows[0].api_key_auth_tag);
  assert.deepEqual(await getStoredResendConfig(db), {
    apiKey: key,
    fromEmail: 'AbaCha <no-reply@example.test>',
  });

  const updated = await savePlatformEmailSettings(db, {
    fromEmail: 'no-reply@example.test',
    actorId: null as any,
  });
  assert.equal(updated.configured, true, 'Saving sender changes without a new key should preserve the stored key');
  assert.deepEqual(await getStoredResendConfig(db), {
    apiKey: key,
    fromEmail: 'no-reply@example.test',
  });

  await assert.rejects(
    savePlatformEmailSettings(db, { apiKey: '', fromEmail: 'no-reply@example.test', actorId: null as any }),
    /RESEND_API_KEY_REQUIRED/,
    'Initial setup must require a key',
  );
  await assert.rejects(
    savePlatformEmailSettings(db, { apiKey: 'not-a-resend-key', fromEmail: 'no-reply@example.test', actorId: null as any }),
    /INVALID_RESEND_API_KEY/,
  );
  await assert.rejects(
    savePlatformEmailSettings(db, { apiKey: key, fromEmail: 'invalid sender', actorId: null as any }),
    /INVALID_RESEND_FROM_EMAIL/,
  );

  await clearPlatformEmailSettings(db);
  assert.deepEqual(await getPlatformEmailSettingsStatus(db), {
    provider: 'resend',
    configured: false,
    fromEmail: null,
    updatedAt: null,
  });
  assert.deepEqual(await getStoredResendConfig(db), {});
  await db.close();
  console.log('Platform email settings tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
