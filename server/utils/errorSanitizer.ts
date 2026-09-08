import { Request, Response } from 'express';

/**
 * Centralized REST API Error Sanitization & Standardization Layer (API-001)
 *
 * Enforces:
 * 1. Safe error messages (no raw SQL, constraint diagnostics, table/column names, credentials, filesystem paths, or stack traces)
 * 2. Standardized error envelope format: { success: false, error: { code, message, details?, requestId? } }
 * 3. Consistent HTTP status mapping
 * 4. Request/Correlation ID propagation
 */

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export interface StandardApiError {
  code: string;
  message: string;
  details?: any;
  requestId?: string;
}

export interface StandardApiErrorResponse {
  success: false;
  error: StandardApiError;
}

/**
 * Standard Application Error with explicit code and HTTP status
 */
export class ApiError extends Error {
  code: string;
  status: number;
  details?: any;

  constructor(code: string, message: string, status = 500, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Sanitizes error messages to prevent leaking SQL statements, database constraint details,
 * file paths, stack traces, connection strings, credentials, or table/column names.
 */
export function sanitizeApiErrorMessage(rawMessage: string): string {
  if (!rawMessage) return 'An unexpected error occurred.';

  return rawMessage
    // Credentials, passwords, keys, tokens, secrets
    .replace(/\b(?:password|secret|key|token|bearer|credential|authorization|auth_token)\s*[:=]\s*["']?[^&;\s,}'"]+["']?/gi, '***')
    // Connection strings (postgresql, redis, http, etc.)
    .replace(/\b[a-zA-Z0-9_+.-]+:\/\/[^\s"',;]+/gi, '[REDACTED_CONN_URI]')
    // SQL comments
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Entire SQL statements & clauses
    .replace(/\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b[\s\S]*?(?=(?:violates|error|at\s+|\n|$))/gi, '[REDACTED_SQL] ')
    .replace(/\b(?:WHERE|FROM|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|CROSS JOIN|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|UNION)\b[\s\S]*?(?=(?:violates|error|at\s+|\n|$))/gi, '[REDACTED_SQL] ')
    // Database constraint & diagnostic details
    .replace(/(?:duplicate key value violates unique constraint|violates foreign key constraint|violates not-null constraint|violates check constraint)[^\n;]*/gi, '[REDACTED_DB_CONSTRAINT]')
    .replace(/(?:value too long for type character varying|syntax error at or near)[^\n;]*/gi, '[REDACTED_DB_SYNTAX]')
    // Explicit relation, table, column mentions
    .replace(/\b(?:relation|table|column)\s+["']?[a-zA-Z0-9_]+["']?/gi, '[REDACTED_DB_SCHEMA]')
    // Specific table names
    .replace(/\b(?:pos_sessions|pos_cash_movements|pos_returns|pos_return_items|inventory_balances|inventory_movements|inventory_transfers|inventory_transfer_items|inventory_transfer_events|inventory_reservations|inventory_stock_counts|inventory_stock_count_items|product_variants|products|organizations|locations|users|orders|order_items|payments|customers|audit_events|schema_migrations|revoked_tokens|categories|brands|catalog_attributes)\b/g, '[REDACTED_TABLE]')
    // Sensitive column names
    .replace(/\b(?:on_hand|available|reserved|in_transit|damaged|expired|unit_cost|weighted_average_cost|password_hash|password_salt|token_hash)\b/g, '[REDACTED_COLUMN]')
    // File paths (Unix and Windows)
    .replace(/(?:\/[a-zA-Z0-9_\-\.]+){2,}/g, '[REDACTED_PATH]')
    .replace(/[a-zA-Z]:\\[a-zA-Z0-9_\-\.\\]+/g, '[REDACTED_PATH]')
    // Stack traces
    .replace(/\s+at\s+[^\n]+/g, '')
    .replace(/\n\s*at\s+.*$/gm, '')
    // Trace identifiers (except the official request ID in envelope)
    .replace(/\b(?:trace[-_]?id|request[-_]?id|span[-_]?id|correlation[-_]?id)[:=]?\s*["']?[a-zA-Z0-9_\-]+["']?/gi, '[REDACTED_TRACE]')
    .trim();
}

/**
 * Classifies an error and maps it to a canonical HTTP status and error code.
 */
export function classifyApiError(
  err: any,
  forceProduction?: boolean
): { status: number; code: string; message: string } {
  const msg: string = String(err?.message || '');
  const errCode: string = String(err?.code || '');
  const status: number = err?.status || err?.statusCode || 500;
  const isProduction = forceProduction !== undefined ? forceProduction : process.env.NODE_ENV === 'production';

  // 0. Explicit Domain / ApiError instances
  if (err instanceof ApiError) {
    return {
      status: err.status,
      code: err.code,
      message: err.message,
    };
  }

  // 1. Tenant boundary violations
  if (msg.includes('TENANT_REQUIRED') || errCode === 'TENANT_REQUIRED') {
    return {
      status: err?.status || 403,
      code: 'TENANT_REQUIRED',
      message: 'Authenticated tenant context is required.',
    };
  }

  if (
    msg.includes('TENANT_ACCESS_DENIED') ||
    msg.includes('LOCATION_ACCESS_DENIED') ||
    msg.includes('VARIANT_ACCESS_DENIED') ||
    msg.includes('TENANT_MISMATCH') ||
    msg.includes('LOCATION_MISMATCH')
  ) {
    return {
      status: 403,
      code: msg.includes('TENANT_ACCESS_DENIED') ? 'TENANT_ACCESS_DENIED' : 'FORBIDDEN',
      message: 'Access to the specified resource is denied.',
    };
  }

  // 2. Authentication & Authorization
  if (msg.includes('UNAUTHORIZED') || status === 401) {
    return {
      status: 401,
      code: err?.code || 'UNAUTHORIZED',
      message: 'Authentication required.',
    };
  }

  if (msg.includes('FORBIDDEN') || status === 403) {
    return {
      status: 403,
      code: err?.code || 'FORBIDDEN',
      message: 'Insufficient permissions.',
    };
  }

  // 3. Validation errors
  if (
    msg.includes('VALIDATION_ERROR') ||
    msg.includes('INVALID_MONEY') ||
    msg.includes('INVALID_QUANTITY') ||
    err?.name === 'ValidationError' ||
    status === 422
  ) {
    return {
      status: status === 400 ? 400 : 422,
      code: 'VALIDATION_ERROR',
      message: sanitizeApiErrorMessage(msg),
    };
  }

  // 4. Resource Not Found
  if (
    errCode === 'NOT_FOUND' ||
    msg.includes('NOT_FOUND') ||
    msg.includes('SESSION_NOT_FOUND') ||
    msg.includes('PRODUCT_NOT_FOUND') ||
    /not found/i.test(msg) ||
    /does not exist/i.test(msg) ||
    status === 404
  ) {
    return {
      status: 404,
      code: err?.code || (msg.includes('SESSION_NOT_FOUND') ? 'SESSION_NOT_FOUND' : 'NOT_FOUND'),
      message: sanitizeApiErrorMessage(msg),
    };
  }

  // 5. Concurrency / Idempotency Conflict & Unique Violations
  if (
    errCode === '23505' ||
    errCode === 'CONFLICT' ||
    errCode === 'IDEMPOTENCY_CONFLICT' ||
    msg.includes('IDEMPOTENCY_CONFLICT') ||
    msg.includes('DUPLICATE_RESERVATION') ||
    msg.includes('DUPLICATE_MOVEMENT') ||
    /duplicate key/i.test(msg) ||
    /violates unique constraint/i.test(msg) ||
    status === 409
  ) {
    return {
      status: 409,
      code: errCode === '23505' ? 'CONFLICT' : (err?.code || 'IDEMPOTENCY_CONFLICT'),
      message: sanitizeApiErrorMessage(msg),
    };
  }

  // 6. Business logic errors (400)
  if (msg.includes('SESSION_CLOSED') || status === 400) {
    return {
      status: 400,
      code: err?.code || 'BAD_REQUEST',
      message: sanitizeApiErrorMessage(msg),
    };
  }

  // 7. Rate Limiting (429)
  if (status === 429) {
    return {
      status: 429,
      code: err?.code || 'RATE_LIMIT_EXCEEDED',
      message: sanitizeApiErrorMessage(msg),
    };
  }

  // 8. Service Unavailable (503)
  if (status === 503) {
    return {
      status: 503,
      code: err?.code || 'SERVICE_UNAVAILABLE',
      message: 'Service temporarily unavailable.',
    };
  }

  // 9. Unhandled internal server error (500)
  const safeMessage = isProduction
    ? 'An unexpected internal server error occurred.'
    : sanitizeApiErrorMessage(msg || 'An unexpected internal server error occurred.');

  return {
    status: 500,
    code: err?.code || 'INTERNAL_SERVER_ERROR',
    message: safeMessage,
  };
}

/**
 * Sanitizes validation error details to ensure only safe field-level messages are returned,
 * completely preventing leakage of arbitrary internal objects, SQL errors, or stack traces.
 */
export function sanitizeErrorDetails(details: any): ValidationErrorDetail[] | undefined {
  if (!details) return undefined;
  if (!Array.isArray(details)) return undefined;
  const sanitized: ValidationErrorDetail[] = [];
  for (const item of details) {
    if (!item || typeof item !== 'object') continue;
    const rawField = typeof item.field === 'string' ? item.field.slice(0, 100) : 'unknown';
    const rawMessage = typeof item.message === 'string' ? item.message : 'Invalid value';
    const cleanMessage = sanitizeApiErrorMessage(rawMessage);
    const cleanField = rawField.replace(/[^a-zA-Z0-9_.\[\]-]/g, '');
    sanitized.push({
      field: cleanField,
      message: cleanMessage,
    });
  }
  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * Builds a standardized API error response envelope.
 */
export function buildApiErrorResponse(
  err: any,
  req?: Request,
  forceProduction?: boolean
): { status: number; body: StandardApiErrorResponse } {
  const classification = classifyApiError(err, forceProduction);
  const requestId = (req as any)?.id || (req?.headers?.['x-request-id'] as string) || undefined;
  const safeDetails = sanitizeErrorDetails(err?.details);

  const errorObj: StandardApiError = {
    code: classification.code,
    message: classification.message,
    ...(safeDetails ? { details: safeDetails } : {}),
    ...(requestId ? { requestId } : {}),
  };

  return {
    status: classification.status,
    body: {
      success: false,
      error: errorObj,
    },
  };
}

/**
 * Express error-handling middleware that guarantees strict error sanitization,
 * standardized JSON envelope, and prevention of credential or DB leakage.
 */
export function apiErrorHandler(err: any, req: Request, res: Response, _next?: any) {
  const { status, body } = buildApiErrorResponse(err, req);

  // Always log server-side with context, never leak stack to client
  if (status >= 500) {
    console.error(`[AbaCha API Error] [${req.method} ${req.originalUrl || req.url}] Status: ${status}`, {
      code: body.error.code,
      message: err?.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
      requestId: body.error.requestId,
      caller: (req as any).auth ? { userId: (req as any).auth.userId, orgId: (req as any).auth.organizationId } : 'unauthenticated',
    });
  }

  return res.status(status).json(body);
}
