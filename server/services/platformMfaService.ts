import crypto from 'node:crypto';
import { DatabaseClient } from '../db/client';
import { UserRecord } from '../repositories/userRepository';
import { isPlatformRole } from '../auth/roles';
import {
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateMfaChallenge,
  generateRecoveryCodeSalt,
  generateRecoveryCodes,
  generateTotpSecret,
  hashMfaChallenge,
  hashRecoveryCode,
  recoveryCodeMatches,
  verifyTotpCode,
} from '../auth/platformMfa';

const CHALLENGE_TTL_SECONDS = 5 * 60;
const MAX_CHALLENGE_ATTEMPTS = 5;

export interface PlatformMfaEnrollment {
  secret: string;
  otpauthUri: string;
}

export interface PlatformMfaChallenge {
  challenge: string;
  expiresAt: string;
}

export class PlatformMfaService {
  constructor(private readonly db: DatabaseClient) {}

  private async getPlatformUser(userId: string): Promise<UserRecord> {
    const result = await this.db.query<UserRecord>(
      `SELECT * FROM users
        WHERE id=$1 AND is_active=TRUE
          AND role IN ('system_owner','platform_admin','platform_support','platform_finance')
        LIMIT 1`,
      [userId],
    );
    const user = result.rows[0];
    if (!user || !isPlatformRole(user.role)) throw new Error('PLATFORM_ACCESS_DENIED');
    return user;
  }

  async isEnabled(userId: string): Promise<boolean> {
    const result = await this.db.query<{ enabled_at: string | null }>(
      'SELECT enabled_at FROM platform_mfa_credentials WHERE user_id=$1 LIMIT 1',
      [userId],
    );
    return Boolean(result.rows[0]?.enabled_at);
  }

  async beginEnrollment(userId: string): Promise<PlatformMfaEnrollment> {
    const user = await this.getPlatformUser(userId);
    if (await this.isEnabled(userId)) throw new Error('MFA_ALREADY_ENABLED');

    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);

    await this.db.query(
      `INSERT INTO platform_mfa_credentials
        (user_id,secret_ciphertext,secret_iv,secret_auth_tag,algorithm,digits,period_seconds,enabled_at,last_used_counter)
       VALUES ($1,$2,$3,$4,'SHA1',6,30,NULL,NULL)
       ON CONFLICT (user_id) DO UPDATE
       SET secret_ciphertext=EXCLUDED.secret_ciphertext,
           secret_iv=EXCLUDED.secret_iv,
           secret_auth_tag=EXCLUDED.secret_auth_tag,
           algorithm='SHA1',
           digits=6,
           period_seconds=30,
           enabled_at=NULL,
           last_used_counter=NULL,
           updated_at=CURRENT_TIMESTAMP`,
      [userId, encrypted.ciphertext, encrypted.iv, encrypted.authTag],
    );

    return {
      secret,
      otpauthUri: buildOtpAuthUri({ secret, email: user.email }),
    };
  }

  async confirmEnrollment(userId: string, code: string): Promise<string[]> {
    await this.getPlatformUser(userId);

    await this.db.query('BEGIN');
    try {
      const result = await this.db.query<any>(
        `SELECT *
           FROM platform_mfa_credentials
          WHERE user_id=$1
          FOR UPDATE`,
        [userId],
      );
      const credential = result.rows[0];
      if (!credential) throw new Error('MFA_ENROLLMENT_NOT_STARTED');
      if (credential.enabled_at) throw new Error('MFA_ALREADY_ENABLED');

      const secret = decryptTotpSecret(
        credential.secret_ciphertext,
        credential.secret_iv,
        credential.secret_auth_tag,
      );
      const verification = verifyTotpCode(secret, code);
      if (!verification.valid) throw new Error('INVALID_MFA_CODE');

      const recoveryCodes = generateRecoveryCodes();
      for (const codeValue of recoveryCodes) {
        const salt = generateRecoveryCodeSalt();
        await this.db.query(
          `INSERT INTO platform_mfa_recovery_codes (id,user_id,code_hash,code_salt)
           VALUES ($1,$2,$3,$4)`,
          [
            `mrc_${crypto.randomBytes(16).toString('hex')}`,
            userId,
            hashRecoveryCode(codeValue, salt),
            salt,
          ],
        );
      }

      await this.db.query(
        `UPDATE platform_mfa_credentials
            SET enabled_at=CURRENT_TIMESTAMP,
                last_used_counter=$2,
                updated_at=CURRENT_TIMESTAMP
          WHERE user_id=$1`,
        [userId, verification.counter],
      );

      await this.db.query('COMMIT');
      return recoveryCodes;
    } catch (error) {
      try { await this.db.query('ROLLBACK'); } catch {}
      throw error;
    }
  }

  async createChallenge(userId: string): Promise<PlatformMfaChallenge> {
    await this.getPlatformUser(userId);

    if (!(await this.isEnabled(userId))) throw new Error('MFA_NOT_ENABLED');

    const challenge = generateMfaChallenge();
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000);

    await this.db.query(
      `INSERT INTO platform_mfa_challenges
        (id,user_id,challenge_hash,expires_at)
       VALUES ($1,$2,$3,$4)`,
      [
        `mfc_${crypto.randomBytes(16).toString('hex')}`,
        userId,
        hashMfaChallenge(challenge),
        expiresAt.toISOString(),
      ],
    );

    return { challenge, expiresAt: expiresAt.toISOString() };
  }

  async verifyChallenge(challenge: string, code: string): Promise<UserRecord> {
    if (!challenge || !code) throw new Error('INVALID_MFA_CHALLENGE');

    await this.db.query('BEGIN');
    try {
      const challengeResult = await this.db.query<any>(
        `SELECT *
           FROM platform_mfa_challenges
          WHERE challenge_hash=$1
            AND used_at IS NULL
            AND expires_at>CURRENT_TIMESTAMP
          FOR UPDATE`,
        [hashMfaChallenge(challenge)],
      );
      const challengeRow = challengeResult.rows[0];
      if (!challengeRow) {
        await this.db.query('ROLLBACK');
        throw new Error('INVALID_MFA_CHALLENGE');
      }
      if (challengeRow.attempts >= MAX_CHALLENGE_ATTEMPTS) {
        await this.db.query('ROLLBACK');
        throw new Error('MFA_CHALLENGE_LOCKED');
      }

      const user = await this.getPlatformUser(challengeRow.user_id);
      const credentialResult = await this.db.query<any>(
        `SELECT * FROM platform_mfa_credentials
          WHERE user_id=$1 AND enabled_at IS NOT NULL
          FOR UPDATE`,
        [user.id],
      );
      const credential = credentialResult.rows[0];
      if (!credential) throw new Error('MFA_NOT_ENABLED');

      const recovery = code.replace(/[-\s]/g, '').toUpperCase();
      let accepted = false;

      const secret = decryptTotpSecret(
        credential.secret_ciphertext,
        credential.secret_iv,
        credential.secret_auth_tag,
      );
      const totp = verifyTotpCode(secret, code);
      if (totp.valid && (credential.last_used_counter === null || totp.counter > Number(credential.last_used_counter))) {
        accepted = true;
        await this.db.query(
          `UPDATE platform_mfa_credentials
              SET last_used_counter=$2, updated_at=CURRENT_TIMESTAMP
            WHERE user_id=$1`,
          [user.id, totp.counter],
        );
      }

      if (!accepted) {
        const recoveryResult = await this.db.query<any>(
          `SELECT id,code_hash,code_salt
             FROM platform_mfa_recovery_codes
            WHERE user_id=$1 AND used_at IS NULL
            FOR UPDATE`,
          [user.id],
        );
        for (const recoveryRow of recoveryResult.rows) {
          if (recoveryCodeMatches(recovery, recoveryRow.code_salt, recoveryRow.code_hash)) {
            accepted = true;
            await this.db.query(
              'UPDATE platform_mfa_recovery_codes SET used_at=CURRENT_TIMESTAMP WHERE id=$1 AND used_at IS NULL',
              [recoveryRow.id],
            );
            break;
          }
        }
      }

      if (!accepted) {
        await this.db.query(
          'UPDATE platform_mfa_challenges SET attempts=attempts+1 WHERE id=$1',
          [challengeRow.id],
        );
        await this.db.query('COMMIT');
        throw new Error('INVALID_MFA_CODE');
      }

      await this.db.query(
        'UPDATE platform_mfa_challenges SET used_at=CURRENT_TIMESTAMP WHERE id=$1 AND used_at IS NULL',
        [challengeRow.id],
      );
      await this.db.query('COMMIT');
      return user;
    } catch (error) {
      try { await this.db.query('ROLLBACK'); } catch {}
      throw error;
    }
  }
}
