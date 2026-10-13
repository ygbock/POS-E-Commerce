import type { EmailVerificationDelivery } from './emailVerificationService';
import type { PasswordResetDelivery } from './passwordResetDelivery';

export interface ResendEmailDeliveryOptions {
  apiKey?: string;
  from?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Resend-backed delivery for account verification and password reset.
 *
 * The API key is optional at application startup so a deployment can be
 * prepared before Resend is configured. Actual delivery fails closed until
 * RESEND_API_KEY and RESEND_FROM_EMAIL are set in the runtime environment.
 */
export class ResendEmailDelivery implements EmailVerificationDelivery, PasswordResetDelivery {
  private readonly apiKey?: string;
  private readonly from?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ResendEmailDeliveryOptions = {}) {
    this.apiKey = (options.apiKey ?? process.env.RESEND_API_KEY)?.trim() || undefined;
    this.from = (options.from ?? process.env.RESEND_FROM_EMAIL)?.trim() || undefined;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async sendVerificationEmail(input: {
    userId: string;
    email: string;
    verificationUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.send({
      to: input.email,
      subject: 'Verify your AbaCha account',
      text: [
        'Please verify your email address to finish setting up your AbaCha account.',
        '',
        input.verificationUrl,
        '',
        `This link expires at ${input.expiresAt.toISOString()}.`,
        'If you did not create this account, you can ignore this email.',
      ].join('\n'),
      html: this.htmlEmail(
        'Verify your email address',
        'Please verify your email address to finish setting up your AbaCha account.',
        input.verificationUrl,
        input.expiresAt,
        'Verify email',
      ),
    });
  }

  async sendPasswordResetEmail(input: {
    userId: string;
    email: string;
    resetUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.send({
      to: input.email,
      subject: 'Reset your AbaCha password',
      text: [
        'A request was made to reset the password for your AbaCha account.',
        '',
        input.resetUrl,
        '',
        `This link expires at ${input.expiresAt.toISOString()}.`,
        'If you did not request a password reset, you can ignore this email.',
      ].join('\n'),
      html: this.htmlEmail(
        'Reset your password',
        'A request was made to reset the password for your AbaCha account.',
        input.resetUrl,
        input.expiresAt,
        'Reset password',
      ),
    });
  }

  private htmlEmail(title: string, message: string, url: string, expiresAt: Date, action: string): string {
    const escapeHtml = (value: string) => value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const safeUrl = escapeHtml(url);
    return `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222">
      <h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
      <p><a href="${safeUrl}">${escapeHtml(action)}</a></p>
      <p>If the button does not work, copy this link into your browser:<br><a href="${safeUrl}">${safeUrl}</a></p>
      <p>This link expires at ${escapeHtml(expiresAt.toISOString())}.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </body></html>`;
  }

  private async send(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
    if (!this.apiKey) {
      throw new Error('RESEND_API_KEY_NOT_CONFIGURED: Add RESEND_API_KEY in the deployment environment to enable email delivery.');
    }
    if (!this.from) {
      throw new Error('RESEND_FROM_EMAIL_NOT_CONFIGURED: Add a verified sender address in RESEND_FROM_EMAIL.');
    }

    let response: Response;
    try {
      response = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
    } catch {
      throw new Error('RESEND_DELIVERY_FAILED: Email provider could not be reached.');
    }

    if (!response.ok) {
      // Do not expose provider response bodies, request details, or credentials.
      throw new Error(`RESEND_DELIVERY_FAILED: Email provider returned HTTP ${response.status}.`);
    }
  }
}
