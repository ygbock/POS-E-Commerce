import crypto from 'node:crypto';
import { DatabaseClient } from '../db/client';
import { AuthIdentityType, UserRole } from './roles';

export const ACCESS_SESSION_TTL_SECONDS = 15 * 60;
export const REFRESH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const ACCESS_COOKIE = 'abacha_access';
export const REFRESH_COOKIE = 'abacha_refresh';

export interface SessionRecord {
  id: string;
  user_id: string;
  organization_id: string;
  identity_type: AuthIdentityType;
  role: UserRole;
  refresh_token_hash: string;
  refresh_token_family_id: string;
  access_jti: string;
  device_id: string | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  last_seen_at: string;
  access_expires_at: string;
  refresh_expires_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  replaced_by_session_id: string | null;
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function generateSessionId(): string {
  return `ses_${crypto.randomBytes(24).toString('hex')}`;
}

export function generateRefreshFamilyId(): string {
  return `fam_${crypto.randomBytes(24).toString('hex')}`;
}

export async function createAuthSession(
  db: DatabaseClient,
  input: {
    userId: string;
    organizationId: string;
    identityType: AuthIdentityType;
    role: UserRole;
    accessJti: string;
    refreshToken: string;
    refreshFamilyId?: string;
    deviceId?: string | null;
    userAgent?: string | null;
    ipAddress?: string | null;
    accessExpiresAt: Date;
    refreshExpiresAt: Date;
  },
): Promise<SessionRecord> {
  const id = generateSessionId();
  const familyId = input.refreshFamilyId || generateRefreshFamilyId();
  const result = await db.query<SessionRecord>(
    `INSERT INTO auth_sessions (
      id,user_id,organization_id,identity_type,role,refresh_token_hash,
      refresh_token_family_id,access_jti,device_id,user_agent,ip_address,
      access_expires_at,refresh_expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *`,
    [
      id,input.userId,input.organizationId,input.identityType,input.role,
      hashRefreshToken(input.refreshToken),familyId,input.accessJti,
      input.deviceId || null,input.userAgent || null,input.ipAddress || null,
      input.accessExpiresAt.toISOString(),input.refreshExpiresAt.toISOString(),
    ],
  );
  return result.rows[0];
}

export async function findSessionByRefreshToken(
  db: DatabaseClient,
  refreshToken: string,
): Promise<SessionRecord | null> {
  const result = await db.query<SessionRecord>(
    `SELECT * FROM auth_sessions
      WHERE refresh_token_hash = $1
      LIMIT 1`,
    [hashRefreshToken(refreshToken)],
  );
  return result.rows[0] || null;
}

export async function findSessionByAccessJti(
  db: DatabaseClient,
  accessJti: string,
): Promise<SessionRecord | null> {
  const result = await db.query<SessionRecord>(
    `SELECT * FROM auth_sessions WHERE access_jti = $1 LIMIT 1`,
    [accessJti],
  );
  return result.rows[0] || null;
}

export async function revokeAuthSession(
  db: DatabaseClient,
  sessionId: string,
  reason = 'logout',
): Promise<void> {
  await db.query(
    `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
           revoke_reason = COALESCE(revoke_reason, $2),
           last_seen_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [sessionId, reason],
  );
}

export async function revokeAuthSessionFamily(
  db: DatabaseClient,
  familyId: string,
  reason = 'refresh-token-reuse',
): Promise<void> {
  await db.query(
    `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
           revoke_reason = COALESCE(revoke_reason, $2)
     WHERE refresh_token_family_id = $1`,
    [familyId, reason],
  );
}

export async function revokeAllUserSessions(
  db: DatabaseClient,
  userId: string,
  reason = 'logout-all',
): Promise<void> {
  await db.query(
    `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
           revoke_reason = COALESCE(revoke_reason, $2)
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, reason],
  );
}

export async function touchAuthSession(db: DatabaseClient, sessionId: string): Promise<void> {
  await db.query(
    `UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId],
  );
}


export async function replaceAuthSession(
  db: DatabaseClient,
  oldSessionId: string,
  newSessionId: string,
): Promise<void> {
  await db.query(
    `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
           revoke_reason = COALESCE(revoke_reason, 'refresh-rotation'),
           replaced_by_session_id = $2,
           last_seen_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [oldSessionId, newSessionId],
  );
}


export async function listUserSessions(
  db: DatabaseClient,
  userId: string,
): Promise<SessionRecord[]> {
  const result = await db.query<SessionRecord>(
    `SELECT * FROM auth_sessions
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND refresh_expires_at > CURRENT_TIMESTAMP
      ORDER BY last_seen_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function revokeUserSession(
  db: DatabaseClient,
  userId: string,
  sessionId: string,
  reason = 'user-revoked',
): Promise<boolean> {
  const result = await db.query(
    `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
           revoke_reason = COALESCE(revoke_reason, $3)
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [sessionId, userId, reason],
  );
  return result.rows.length > 0;
}
