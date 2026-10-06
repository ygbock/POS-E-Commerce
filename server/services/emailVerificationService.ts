import { DatabaseClient } from '../db/client';
import { AuditRepository } from '../repositories/auditRepository';
import {
  createEmailVerificationToken,
  consumeEmailVerificationToken,
  generateEmailVerificationToken,
  EMAIL_VERIFICATION_TTL_SECONDS,
} from '../auth/emailVerification';

export interface EmailVerificationDelivery {
  sendVerificationEmail(input: {
    userId: string;
    email: string;
    verificationUrl: string;
    expiresAt: Date;
  }): Promise<void>;
}

export class UnconfiguredEmailVerificationDelivery implements EmailVerificationDelivery {
  async sendVerificationEmail(): Promise<void> {
    throw new Error(
      'EMAIL_DELIVERY_NOT_CONFIGURED: Configure a production email verification delivery provider before sending verification emails.',
    );
  }
}

export interface EmailVerificationServiceOptions {
  delivery: EmailVerificationDelivery;
  verificationBaseUrl?: string;
}

export interface RequestVerificationResult {
  status: 'SENT' | 'ALREADY_VERIFIED';
  userId: string;
  email: string;
  expiresAt?: string;
}

export interface ConfirmVerificationResult {
  status: 'VERIFIED' | 'ALREADY_VERIFIED';
  userId: string;
  email: string;
  verifiedAt: string | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getVerificationBaseUrl(explicit?: string): string {
  const value = explicit?.trim() || process.env.EMAIL_VERIFICATION_BASE_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (!value) {
    return 'http://localhost:5000';
  }
  return value.replace(/\/+$/, '');
}

function buildVerificationUrl(baseUrl: string, token: string): string {
  const url = new URL('/verify-email', baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

export class EmailVerificationService {
  private readonly db: DatabaseClient;
  private readonly audit: AuditRepository;
  private readonly delivery: EmailVerificationDelivery;
  private readonly verificationBaseUrl: string;

  constructor(db: DatabaseClient, options: EmailVerificationServiceOptions) {
    this.db = db;
    this.audit = new AuditRepository(db);
    this.delivery = options.delivery;
    this.verificationBaseUrl = getVerificationBaseUrl(options.verificationBaseUrl);
  }

  async requestVerification(userId: string): Promise<RequestVerificationResult> {
    const userResult = await this.db.query<{
      id: string;
      organization_id: string;
      email: string;
      is_active: boolean;
      email_verified_at: string | null;
    }>(
      `SELECT id,organization_id,email,is_active,email_verified_at
         FROM users
        WHERE id=$1
        LIMIT 1`,
      [userId],
    );

    const user = userResult.rows[0];
    if (!user || !user.is_active) {
      throw new Error('NOT_FOUND: Active user account not found.');
    }

    const email = normalizeEmail(user.email);
    if (user.email_verified_at) {
      return {
        status: 'ALREADY_VERIFIED',
        userId: user.id,
        email,
      };
    }

    const rawToken = generateEmailVerificationToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000);
    const verificationUrl = buildVerificationUrl(this.verificationBaseUrl, rawToken);

    const tokenRecord = await this.db.withTransaction(async (tx) => {
      const record = await createEmailVerificationToken(tx, {
        userId: user.id,
        email,
        token: rawToken,
        expiresAt,
      });

      await this.audit.recordEvent({
        organization_id: user.organization_id,
        actor_id: user.id,
        actor_name: email,
        actor_role: 'System',
        action: 'EMAIL_VERIFICATION_REQUESTED',
        entity_type: 'USER',
        entity_id: user.id,
        metadata: {
          email: email,
          expiresAt: record.expires_at,
          deliveryChannel: 'EMAIL',
        },
        severity: 'Info',
        result: 'SUCCESS',
      }, tx);

      return record;
    });

    try {
      await this.delivery.sendVerificationEmail({
        userId: user.id,
        email,
        verificationUrl,
        expiresAt: new Date(tokenRecord.expires_at),
      });
    } catch (error) {
      await this.db.query(
        `UPDATE email_verification_tokens
            SET used_at=COALESCE(used_at,CURRENT_TIMESTAMP)
          WHERE id=$1 AND used_at IS NULL`,
        [tokenRecord.id],
      );

      await this.audit.recordEvent({
        organization_id: user.organization_id,
        actor_id: user.id,
        actor_name: email,
        actor_role: 'System',
        action: 'EMAIL_VERIFICATION_DELIVERY_FAILED',
        entity_type: 'USER',
        entity_id: user.id,
        metadata: {
          deliveryChannel: 'EMAIL',
          reason: error instanceof Error ? error.message.split(':')[0] : 'DELIVERY_ERROR',
        },
        severity: 'High',
        result: 'FAILED',
      });

      throw error;
    }

    return {
      status: 'SENT',
      userId: user.id,
      email,
      expiresAt: tokenRecord.expires_at,
    };
  }

  async confirmVerification(rawToken: string): Promise<ConfirmVerificationResult> {
    if (!rawToken || rawToken.length < 20) {
      throw new Error('INVALID_VERIFICATION_TOKEN');
    }

    return this.db.withTransaction(async (tx) => {
      const tokenResult = await tx.query<{
        id: string;
        user_id: string;
        email_snapshot: string;
        expires_at: string;
        used_at: string | null;
      }>(
        `SELECT id,user_id,email_snapshot,expires_at,used_at
           FROM email_verification_tokens
          WHERE token_hash=$1
          LIMIT 1
          FOR UPDATE`,
        [
          (await import('node:crypto')).createHash('sha256').update(rawToken, 'utf8').digest('hex'),
        ],
      );

      const token = tokenResult.rows[0];
      if (!token || token.used_at || new Date(token.expires_at).getTime() <= Date.now()) {
        throw new Error('INVALID_VERIFICATION_TOKEN');
      }

      const userResult = await tx.query<{
        id: string;
        organization_id: string;
        email: string;
        email_verified_at: string | null;
        is_active: boolean;
      }>(
        `SELECT id,organization_id,email,email_verified_at,is_active
           FROM users
          WHERE id=$1
          LIMIT 1
          FOR UPDATE`,
        [token.user_id],
      );

      const user = userResult.rows[0];
      if (!user || !user.is_active) {
        throw new Error('INVALID_VERIFICATION_TOKEN');
      }

      if (normalizeEmail(user.email) !== normalizeEmail(token.email_snapshot)) {
        await tx.query(
          `UPDATE email_verification_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=$1 AND used_at IS NULL`,
          [token.id],
        );
        await this.audit.recordEvent({
          organization_id: user.organization_id,
          actor_id: user.id,
          actor_name: normalizeEmail(user.email),
          actor_role: 'System',
          action: 'EMAIL_VERIFICATION_REJECTED',
          entity_type: 'USER',
          entity_id: user.id,
          metadata: { reason: 'EMAIL_CHANGED' },
          severity: 'High',
          result: 'DENIED',
        }, tx);
        throw new Error('EMAIL_CHANGED: Verification link is no longer valid for this email address.');
      }

      const consumed = await consumeEmailVerificationToken(tx, rawToken);
      if (!consumed) {
        throw new Error('INVALID_VERIFICATION_TOKEN');
      }

      if (user.email_verified_at) {
        await this.audit.recordEvent({
          organization_id: user.organization_id,
          actor_id: user.id,
          actor_name: normalizeEmail(user.email),
          actor_role: 'System',
          action: 'EMAIL_VERIFICATION_ALREADY_COMPLETED',
          entity_type: 'USER',
          entity_id: user.id,
          metadata: { tokenId: token.id },
          severity: 'Info',
          result: 'SUCCESS',
        }, tx);

        return {
          status: 'ALREADY_VERIFIED' as const,
          userId: user.id,
          email: normalizeEmail(user.email),
          verifiedAt: user.email_verified_at,
        };
      }

      const updated = await tx.query<{ email_verified_at: string }>(
        `UPDATE users
            SET email_verified_at=CURRENT_TIMESTAMP,
                updated_at=CURRENT_TIMESTAMP
          WHERE id=$1
            AND LOWER(email)=LOWER($2)
            AND email_verified_at IS NULL
          RETURNING email_verified_at`,
        [user.id, token.email_snapshot],
      );

      if (!updated.rows[0]) {
        throw new Error('VERIFICATION_CONFLICT: Unable to complete email verification.');
      }

      await this.audit.recordEvent({
        organization_id: user.organization_id,
        actor_id: user.id,
        actor_name: normalizeEmail(user.email),
        actor_role: 'System',
        action: 'EMAIL_VERIFICATION_COMPLETED',
        entity_type: 'USER',
        entity_id: user.id,
        metadata: {
          tokenId: token.id,
          verifiedAt: updated.rows[0].email_verified_at,
        },
        severity: 'Info',
        result: 'SUCCESS',
      }, tx);

      return {
        status: 'VERIFIED' as const,
        userId: user.id,
        email: normalizeEmail(user.email),
        verifiedAt: updated.rows[0].email_verified_at,
      };
    });
  }
}
