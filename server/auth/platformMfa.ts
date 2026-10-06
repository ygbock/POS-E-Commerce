import crypto from 'node:crypto';

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const RECOVERY_CODE_COUNT = 10;

function requireMfaEncryptionKey(): Buffer {
  const configured = process.env.MFA_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new Error('MFA_ENCRYPTION_KEY_NOT_CONFIGURED');
  }

  if (/^[0-9a-fA-F]{64}$/.test(configured)) {
    return Buffer.from(configured, 'hex');
  }

  const raw = Buffer.from(configured, 'base64');
  if (raw.length === 32) return raw;

  throw new Error('MFA_ENCRYPTION_KEY_INVALID: expected 32-byte base64 or 64-character hex key');
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function base32Encode(input: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('INVALID_TOTP_SECRET');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function normalizeTotpSecret(secret: string): string {
  return base32Encode(base32Decode(secret));
}

export function generateTotpCode(secret: string, timestampMs = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function verifyTotpCode(
  secret: string,
  code: string,
  timestampMs = Date.now(),
): { valid: boolean; counter: number } {
  if (!/^\d{6}$/.test(code)) return { valid: false, counter: -1 };

  const currentCounter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const counter = currentCounter + offset;
    const expected = generateTotpCode(secret, counter * TOTP_PERIOD_SECONDS * 1000);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) {
      return { valid: true, counter };
    }
  }
  return { valid: false, counter: -1 };
}

export function encryptTotpSecret(secret: string): {
  ciphertext: string;
  iv: string;
  authTag: string;
} {
  const key = requireMfaEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

export function decryptTotpSecret(ciphertext: string, ivHex: string, authTagHex: string): string {
  const key = requireMfaEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function buildOtpAuthUri(input: {
  secret: string;
  email: string;
  issuer?: string;
}): string {
  const issuer = input.issuer || 'AbaCha';
  const label = encodeURIComponent(`${issuer}:${input.email}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(input.secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    crypto.randomBytes(6).toString('hex').toUpperCase(),
  );
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase(), 'utf8').digest('hex');
}

export function hashMfaChallenge(challenge: string): string {
  return crypto.createHash('sha256').update(challenge, 'utf8').digest('hex');
}

export function generateMfaChallenge(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export const MFA_CONSTANTS = {
  periodSeconds: TOTP_PERIOD_SECONDS,
  digits: TOTP_DIGITS,
  window: TOTP_WINDOW,
  recoveryCodeCount: RECOVERY_CODE_COUNT,
} as const;
