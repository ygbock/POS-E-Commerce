import { Request, Response, NextFunction } from 'express';

/**
 * Rate Limiting Middleware (SEC-001)
 * 
 * TRANSITIONAL PROCESS-LOCAL IMPLEMENTATION:
 * This sliding-window rate limiter maintains state in a local in-process JavaScript Map.
 * It provides basic brute-force and resource exhaustion mitigation on a single container instance.
 * 
 * ARCHITECTURAL LIMITATION & PRODUCTION WARNING:
 * - This implementation is PROCESS-LOCAL and DOES NOT provide distributed rate limiting.
 * - In horizontally scaled or multi-instance deployments (e.g. multiple Cloud Run containers or
 *   Kubernetes pods behind a load balancer), rate limit counters are not shared across instances.
 * - Production multi-instance architecture requires an external shared store (e.g., Redis or Valkey)
 *   to maintain synchronized sliding window counters across replicas (tracked as RISK-013).
 */

interface RateLimitRecord {
  timestamps: number[];
}

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const store = new Map<string, RateLimitRecord>();
  const { windowMs, maxRequests, message, keyGenerator } = options;

  // Periodic cleanup of stale entries every 5 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      record.timestamps = record.timestamps.filter(ts => now - ts < windowMs);
      if (record.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // Unref interval to not block process exit during tests
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = keyGenerator
      ? keyGenerator(req)
      : (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket.remoteAddress ||
        'anonymous';

    let record = store.get(key);
    if (!record) {
      record = { timestamps: [] };
      store.set(key, record);
    }

    // Filter out timestamps outside the active window
    record.timestamps = record.timestamps.filter(ts => now - ts < windowMs);

    const count = record.timestamps.length;
    const remaining = Math.max(0, maxRequests - count);
    const resetTime = Math.ceil((windowMs - (now - (record.timestamps[0] || now))) / 1000);

    res.setHeader('RateLimit-Limit', maxRequests);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetTime > 0 ? resetTime : Math.ceil(windowMs / 1000));

    if (count >= maxRequests) {
      const retryAfter = Math.max(1, resetTime);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: message || 'Too many requests. Please slow down and try again later.',
          retryAfterSeconds: retryAfter,
        },
      });
    }

    record.timestamps.push(now);
    next();
  };
}

/**
 * Authentication Endpoint Limiter
 * Max 10 login attempts per 60 seconds per IP
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  message: 'Too many authentication attempts. Please try again after one minute.',
});

/**
 * Sensitive Admin Operations Limiter
 * Max 30 requests per 60 seconds
 */
export const adminRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Too many administrative requests. Rate limit enforced.',
});
