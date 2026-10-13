import crypto from 'node:crypto';
import { DatabaseClient } from '../db/client';
import { decryptTotpSecret, encryptTotpSecret } from '../auth/platformMfa';

export interface PlatformEmailSettingsStatus {
  provider: 'resend';
  configured: boolean;
  fromEmail: string | null;
  updatedAt: string | null;
}

export interface StoredResendConfig {
  apiKey?: string;
  fromEmail?: string;
}

export async function getPlatformEmailSettingsStatus(db: DatabaseClient): Promise<PlatformEmailSettingsStatus> {
  const result = await db.query<any>(
    "SELECT api_key_ciphertext, from_email, updated_at FROM platform_email_settings WHERE id='resend' LIMIT 1",
  );
  const row = result.rows[0];
  return {
    provider: 'resend',
    configured: Boolean(row?.api_key_ciphertext),
    fromEmail: row?.from_email || null,
    updatedAt: row?.updated_at || null,
  };
}

/** Resolve the encrypted credential only for server-side delivery. Never expose it to HTTP callers. */
export async function getStoredResendConfig(db: DatabaseClient): Promise<StoredResendConfig> {
  const result = await db.query<any>(
    "SELECT api_key_ciphertext, api_key_iv, api_key_auth_tag, from_email FROM platform_email_settings WHERE id='resend' LIMIT 1",
  );
  const row = result.rows[0];
  if (!row) return {};
  let apiKey: string | undefined;
  if (row.api_key_ciphertext && row.api_key_iv && row.api_key_auth_tag) {
    apiKey = decryptTotpSecret(row.api_key_ciphertext, row.api_key_iv, row.api_key_auth_tag);
  }
  return { apiKey, fromEmail: row.from_email || undefined };
}

export async function savePlatformEmailSettings(
  db: DatabaseClient,
  input: { apiKey?: string; fromEmail: string; actorId: string },
): Promise<PlatformEmailSettingsStatus> {
  const fromEmail = input.fromEmail.trim();
  if (!fromEmail || fromEmail.length > 254 || /[\r\n]/.test(fromEmail) ||
      !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(fromEmail.replace(/^.*<([^<>]+)>$/, '$1'))) {
    throw new Error('INVALID_RESEND_FROM_EMAIL');
  }
  const apiKey = input.apiKey?.trim();
  if (apiKey && (apiKey.length > 512 || !/^re_[A-Za-z0-9_-]+$/.test(apiKey))) {
    throw new Error('INVALID_RESEND_API_KEY');
  }

  const existing = await db.query<any>(
    "SELECT api_key_ciphertext FROM platform_email_settings WHERE id='resend' LIMIT 1",
  );
  if (!existing.rows[0]?.api_key_ciphertext && !apiKey) {
    throw new Error('RESEND_API_KEY_REQUIRED');
  }

  let encrypted: { ciphertext: string; iv: string; authTag: string } | undefined;
  if (apiKey) encrypted = encryptTotpSecret(apiKey);
  await db.query(
    `INSERT INTO platform_email_settings
      (id, api_key_ciphertext, api_key_iv, api_key_auth_tag, from_email, updated_by, updated_at)
     VALUES ('resend', $1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       api_key_ciphertext = COALESCE(EXCLUDED.api_key_ciphertext, platform_email_settings.api_key_ciphertext),
       api_key_iv = COALESCE(EXCLUDED.api_key_iv, platform_email_settings.api_key_iv),
       api_key_auth_tag = COALESCE(EXCLUDED.api_key_auth_tag, platform_email_settings.api_key_auth_tag),
       from_email = EXCLUDED.from_email,
       updated_by = EXCLUDED.updated_by,
       updated_at = CURRENT_TIMESTAMP`,
    [encrypted?.ciphertext ?? null, encrypted?.iv ?? null, encrypted?.authTag ?? null, fromEmail, input.actorId],
  );
  return getPlatformEmailSettingsStatus(db);
}

export async function clearPlatformEmailSettings(db: DatabaseClient): Promise<void> {
  await db.query("DELETE FROM platform_email_settings WHERE id='resend'");
}

export function encryptEmailSecretForTest(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
