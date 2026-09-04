import crypto from 'crypto';

/**
 * Password Security Utilities (SEC-001)
 * 
 * Uses Node.js native crypto.pbkdf2Sync with cryptographically random salts
 * and timingSafeEqual comparison to prevent timing attacks.
 */

const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';
const SALT_BYTES = 16;

export interface HashResult {
  hash: string;
  salt: string;
  combined: string;
}

/**
 * Hash a plain-text password using PBKDF2-HMAC-SHA512 with a random salt.
 * Returns an enhanced String holding { hash, salt, combined } while being
 * fully compatible with string operations and standard crypt format.
 */
export function hashPassword(password: string): HashResult & string {
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  const combined = `pbkdf2:${DIGEST}:${ITERATIONS}:${salt}:${hash}`;

  const result = new String(combined) as any;
  result.hash = hash;
  result.salt = salt;
  result.combined = combined;
  return result;
}

/**
 * Verify a plain-text password against stored PBKDF2 hash and salt using timingSafeEqual.
 * Supports both standalone salt parameter and combined modular crypt string format.
 */
export function verifyPassword(password: string, storedHashOrResult: string | { hash: string; salt: string }, optionalSalt?: string): boolean {
  if (!password || !storedHashOrResult) {
    return false;
  }

  let hash = '';
  let salt = '';

  if (typeof storedHashOrResult === 'string' || storedHashOrResult instanceof String) {
    const str = storedHashOrResult.toString();
    if (str.startsWith('pbkdf2:sha512:')) {
      const parts = str.split(':');
      if (parts.length >= 5) {
        salt = parts[3];
        hash = parts[4];
      }
    } else {
      hash = str;
      salt = optionalSalt || '';
    }
  } else if (typeof storedHashOrResult === 'object') {
    hash = (storedHashOrResult as any).hash || '';
    salt = (storedHashOrResult as any).salt || optionalSalt || '';
  }

  if (!hash || !salt) {
    return false;
  }

  try {
    const computedHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
    const computedBuffer = Buffer.from(computedHash, 'hex');
    const storedBuffer = Buffer.from(hash, 'hex');

    if (computedBuffer.length !== storedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuffer, storedBuffer);
  } catch {
    return false;
  }
}
