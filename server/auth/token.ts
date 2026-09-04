import crypto from 'crypto';
import { UserRole, getPermissionsForRole } from './roles';

/**
 * Token Management and Cryptographic Verification (SEC-001)
 * 
 * Standard RFC 7519 HMAC-SHA256 (HS256) implementation using native Node.js crypto.
 * Fails closed in production if JWT_SECRET is missing or insecure.
 */

export interface TokenClaims {
  sub: string;            // User ID
  email: string;          // User Email
  orgId: string;          // Organization ID (Tenant Isolation Boundary)
  role: UserRole;         // Server-authoritative role
  permissions: string[];  // Resolved permissions
  locId?: string | null;  // Branch location ID
  jti: string;            // Unique token identifier for revocation
  iat: number;            // Issued at (epoch seconds)
  exp: number;            // Expiration (epoch seconds)
}

export class TokenVerificationError extends Error {
  code: 'EXPIRED' | 'INVALID_SIGNATURE' | 'MALFORMED' | 'REVOKED' | 'CONFIG_ERROR';
  constructor(message: string, code: 'EXPIRED' | 'INVALID_SIGNATURE' | 'MALFORMED' | 'REVOKED' | 'CONFIG_ERROR') {
    super(message);
    this.name = 'TokenVerificationError';
    this.code = code;
  }
}

/**
 * Resolve the authoritative JWT signing secret.
 * In production, fails closed immediately if not configured.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProd) {
      throw new TokenVerificationError(
        '[Omnicore Security Fatal] JWT_SECRET environment variable is mandatory in production.',
        'CONFIG_ERROR'
      );
    }
    // Safe development fallback
    return 'omnicore-dev-local-jwt-insecure-secret-key-32-chars-min';
  }

  if (isProd && (secret.length < 32 || secret.includes('dev') || secret.includes('default'))) {
    throw new TokenVerificationError(
      '[Omnicore Security Fatal] Production JWT_SECRET must be a high-entropy string of at least 32 characters.',
      'CONFIG_ERROR'
    );
  }

  return secret;
}

function base64UrlEncode(strOrBuffer: string | Buffer): string {
  const buf = typeof strOrBuffer === 'string' ? Buffer.from(strOrBuffer, 'utf8') : strOrBuffer;
  return buf.toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

/**
 * Generate a cryptographically signed HMAC-SHA256 JWT.
 */
export function signToken(
  params: {
    userId: string;
    email: string;
    organizationId: string;
    role: UserRole;
    permissions?: string[];
    locationId?: string | null;
    expiresInSeconds?: number;
  },
  customSecret?: string
): string {
  const secret = customSecret || getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + (params.expiresInSeconds || parseInt(process.env.JWT_EXPIRY || '86400', 10));

  const permissions = params.permissions && params.permissions.length > 0
    ? params.permissions
    : getPermissionsForRole(params.role);

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload: TokenClaims = {
    sub: params.userId,
    email: params.email,
    orgId: params.organizationId,
    role: params.role,
    permissions,
    locId: params.locationId || null,
    jti: `tok_${crypto.randomBytes(16).toString('hex')}`,
    iat: now,
    exp: expiry,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64url');

  return `${signatureInput}.${signature}`;
}

/**
 * Cryptographically verify and decode an HMAC-SHA256 JWT.
 * Validates format, signature integrity, and expiration.
 */
export function verifyToken(token: string, customSecret?: string): TokenClaims {
  if (!token || typeof token !== 'string') {
    throw new TokenVerificationError('Token string is missing or invalid', 'MALFORMED');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new TokenVerificationError('Invalid token format: must contain 3 segments', 'MALFORMED');
  }

  const [encodedHeader, encodedPayload, receivedSignature] = parts;
  const secret = customSecret || getJwtSecret();

  // Verify Header
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      throw new TokenVerificationError('Unsupported token algorithm or type', 'MALFORMED');
    }
  } catch (err: any) {
    if (err instanceof TokenVerificationError) throw err;
    throw new TokenVerificationError('Malformed token header', 'MALFORMED');
  }

  // Verify Signature using Timing-Safe Comparison
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64url');

  const receivedSigBuffer = Buffer.from(receivedSignature, 'utf8');
  const expectedSigBuffer = Buffer.from(expectedSignature, 'utf8');

  if (
    receivedSigBuffer.length !== expectedSigBuffer.length ||
    !crypto.timingSafeEqual(receivedSigBuffer, expectedSigBuffer)
  ) {
    throw new TokenVerificationError('Cryptographic token signature verification failed', 'INVALID_SIGNATURE');
  }

  // Parse and verify Payload Claims
  let payload: TokenClaims;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new TokenVerificationError('Malformed token payload', 'MALFORMED');
  }

  const now = Math.floor(Date.now() / 1000);

  // Check Expiration
  if (!payload.exp || typeof payload.exp !== 'number' || payload.exp < now) {
    throw new TokenVerificationError('Token has expired', 'EXPIRED');
  }

  // Check Issued At (allow 60 seconds clock drift)
  if (payload.iat && typeof payload.iat === 'number' && payload.iat > now + 60) {
    throw new TokenVerificationError('Token issued in the future (clock skew error)', 'MALFORMED');
  }

  // Mandatory Subject and Organization
  if (!payload.sub || !payload.orgId || !payload.role) {
    throw new TokenVerificationError('Token payload missing mandatory claims (sub, orgId, role)', 'MALFORMED');
  }

  return payload;
}

export function generateTokenId(): string {
  return `tok_${crypto.randomBytes(16).toString('hex')}`;
}

export function issueToken(
  claims: {
    userId: string;
    email?: string;
    organizationId: string;
    role: UserRole;
    permissions?: string[];
    locationId?: string | null;
  },
  expiresIn?: string | number
): string {
  let seconds = 86400;
  if (typeof expiresIn === 'number') {
    seconds = expiresIn;
  } else if (typeof expiresIn === 'string') {
    if (expiresIn.endsWith('h')) seconds = parseInt(expiresIn, 10) * 3600;
    else if (expiresIn.endsWith('d')) seconds = parseInt(expiresIn, 10) * 86400;
    else if (expiresIn.endsWith('m')) seconds = parseInt(expiresIn, 10) * 60;
    else if (expiresIn.endsWith('s')) seconds = parseInt(expiresIn, 10);
  }
  return signToken({
    userId: claims.userId,
    email: claims.email || `${claims.userId}@omnicore.internal`,
    organizationId: claims.organizationId,
    role: claims.role,
    permissions: claims.permissions,
    locationId: claims.locationId,
    expiresInSeconds: seconds,
  });
}
