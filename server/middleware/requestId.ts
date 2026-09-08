import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Validates whether an incoming request ID meets security requirements:
 * - String type only
 * - Bounded length (1 to 128 characters)
 * - Safe character set: alphanumeric, hyphen, underscore only
 */
export function isValidRequestId(id: any): boolean {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (trimmed.length < 1 || trimmed.length > 128) return false;
  return /^[a-zA-Z0-9_-]{1,128}$/.test(trimmed);
}

/**
 * Generates a cryptographically secure request ID using Node's crypto.randomUUID().
 */
export function generateRequestId(): string {
  return `req-${randomUUID()}`;
}

/**
 * Request / Correlation ID Middleware (API-001R1)
 * 
 * - Replaces Math.random() with crypto.randomUUID()
 * - Strictly validates caller-supplied X-Request-Id or X-Correlation-Id
 * - Replaces malformed or oversized IDs with freshly generated UUIDs
 * - Echoes the effective request ID in standard response headers
 * - Attaches requestId to request context for audit logs and error sanitization
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const rawIncoming = (req.headers['x-request-id'] || req.headers['x-correlation-id']) as string | undefined;

  let requestId: string;
  if (rawIncoming && isValidRequestId(rawIncoming)) {
    requestId = rawIncoming.trim();
  } else {
    requestId = generateRequestId();
  }

  (req as any).id = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', requestId);
  next();
}
