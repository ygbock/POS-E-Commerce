import crypto from 'node:crypto';
import { DatabaseClient } from '../db/client';

export const EMAIL_VERIFICATION_TTL_SECONDS = 30 * 60;

export interface EmailVerificationTokenRecord {
  id: string;
  user_id: string;
  email_snapshot: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export function generateEmailVerificationToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashEmailVerificationToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateEmailVerificationTokenId(): string {
  return `evt_${crypto.randomBytes(24).toString('hex')}`;
}

export async function createEmailVerificationToken(
  db: DatabaseClient,
  input: {
    userId: string;
    email: string;
    token: string;
    expiresAt?: Date;
  },
): Promise<EmailVerificationTokenRecord> {
  const id = generateEmailVerificationTokenId();
  const expiresAt = input.expiresAt || new Date(Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000);

  // Issuing a new challenge invalidates any previously active challenge.
  // This is deliberately represented as used_at so the audit history remains.
  await db.query(
    `UPDATE email_verification_tokens
        SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
      WHERE user_id = $1 AND used_at IS NULL`,
    [input.userId],
  );

  const result = await db.query<EmailVerificationTokenRecord>(
    `INSERT INTO email_verification_tokens
      (id,user_id,email_snapshot,token_hash,expires_at)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [
      id,
      input.userId,
      input.email.toLowerCase().trim(),
      hashEmailVerificationToken(input.token),
      expiresAt.toISOString(),
    ],
  );

  return result.rows[0];
}

export async function findEmailVerificationToken(
  db: DatabaseClient,
  rawToken: string,
): Promise<EmailVerificationTokenRecord | null> {
  if (!rawToken || rawToken.length < 20) return null;

  const result = await db.query<EmailVerificationTokenRecord>(
    `SELECT *
       FROM email_verification_tokens
      WHERE token_hash = $1
      LIMIT 1`,
    [hashEmailVerificationToken(rawToken)],
  );

  return result.rows[0] || null;
}

export async function consumeEmailVerificationToken(
  db: DatabaseClient,
  rawToken: string,
): Promise<EmailVerificationTokenRecord | null> {
  if (!rawToken || rawToken.length < 20) return null;

  const result = await db.query<EmailVerificationTokenRecord>(
    `UPDATE email_verification_tokens
        SET used_at = CURRENT_TIMESTAMP
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      RETURNING *`,
    [hashEmailVerificationToken(rawToken)],
  );

  return result.rows[0] || null;
}
