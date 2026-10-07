import { DatabaseClient } from '../db/client';

export interface PasswordResetDelivery {
  sendPasswordResetEmail(input: {
    userId: string;
    email: string;
    resetUrl: string;
    expiresAt: Date;
  }): Promise<void>;
}

/**
 * Fail-closed default. Production must replace this boundary with a real,
 * approved email provider before password-reset credentials can be issued.
 */
export class UnconfiguredPasswordResetDelivery implements PasswordResetDelivery {
  async sendPasswordResetEmail(): Promise<void> {
    throw new Error(
      'PASSWORD_RESET_DELIVERY_NOT_CONFIGURED: Configure a production password reset delivery provider before issuing reset credentials.',
    );
  }
}

export function buildPasswordResetUrl(baseUrl: string, token: string): string {
  const url = new URL('/reset-password', baseUrl.replace(/\\/+$/, ''));
  url.searchParams.set('token', token);
  return url.toString();
}

export function normalizePasswordResetBaseUrl(value?: string): string {
  const base = value?.trim() || process.env.PASSWORD_RESET_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (!base) throw new Error('PASSWORD_RESET_DELIVERY_NOT_CONFIGURED');
  return base.replace(/\\/+$/, '');
}

export async function recordPasswordResetDeliveryFailure(
  db: DatabaseClient,
  input: { tokenId: string; organizationId: string; userId: string; reason: string },
): Promise<void> {
  await db.query(
    `UPDATE password_reset_tokens
        SET used_at=COALESCE(used_at,CURRENT_TIMESTAMP)
      WHERE id=$1 AND used_at IS NULL`,
    [input.tokenId],
  );
}
