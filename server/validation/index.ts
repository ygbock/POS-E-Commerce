import { Request, Response, NextFunction } from 'express';

/**
 * Runtime Input Validation & Anti-Spoofing Layer (SEC-001)
 * 
 * Enforces strict boundaries on external inputs.
 * Strips or rejects attempts to inject identity, role, or tenant overrides via request bodies.
 */

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export class ValidationError extends Error {
  details: ValidationErrorDetail[];
  constructor(message: string, details: ValidationErrorDetail[]) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Anti-Spoofing Filter:
 * Strips client-provided fields that attempt to control identity, tenant, or privileges.
 */
const FORBIDDEN_CLIENT_KEYS = [
  'role',
  'roles',
  'permissions',
  'isAdmin',
  'isSuperAdmin',
  'is_admin',
  'is_super_admin',
  'organizationId',
  'organization_id',
  'tenantId',
  'tenant_id',
  'userId',
  'user_id',
  'actor_id',
  'actor_role',
  'actorId',
  'actorRole',
];

const DANGEROUS_PROTO_KEYS = ['__proto__', 'constructor', 'prototype'];
const IMMUTABLE_RECORD_KEYS = [
  'id',
  'created_at',
  'updated_at',
  'createdAt',
  'updatedAt',
  'organization_id',
  'organizationId',
];

export function stripImmutableFields<T extends Record<string, any>>(obj: T): Partial<T> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!IMMUTABLE_RECORD_KEYS.includes(key)) {
      cleaned[key] = value;
    }
  }
  return cleaned as Partial<T>;
}

export function sanitizeInput<T>(input: T): T {
  if (typeof input === 'string') {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;') as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map(item => sanitizeInput(item)) as unknown as T;
  }
  if (input !== null && typeof input === 'object') {
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(input as Record<string, any>)) {
      if (DANGEROUS_PROTO_KEYS.includes(key)) {
        continue;
      }
      cleaned[key] = sanitizeInput((input as Record<string, any>)[key]);
    }
    return cleaned as T;
  }
  return input;
}

export function sanitizeClientBody<T extends Record<string, any>>(body: T): Partial<T> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!FORBIDDEN_CLIENT_KEYS.includes(key) && !DANGEROUS_PROTO_KEYS.includes(key)) {
      cleaned[key] = value;
    }
  }
  return cleaned as Partial<T>;
}

/**
 * Login Request Validator
 */
export function validateLoginPayload(body: any): { email: string; password: string; organizationId?: string } {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object') {
    throw new ValidationError('Invalid request body', [{ field: 'body', message: 'JSON body is required' }]);
  }

  if (!body.email || typeof body.email !== 'string' || !body.email.includes('@')) {
    errors.push({ field: 'email', message: 'A valid email address is required' });
  }

  if (!body.password || typeof body.password !== 'string' || body.password.length < 1) {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Authentication input validation failed', errors);
  }

  return {
    email: body.email.toLowerCase().trim(),
    password: body.password,
    organizationId: body.organizationId ? String(body.organizationId).trim() : undefined,
  };
}

/**
 * Product Create / Update Validator
 */
export function validateProductPayload(body: any, isUpdate = false): Record<string, any> {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
  }

  // Anti-spoofing check
  for (const forbiddenKey of FORBIDDEN_CLIENT_KEYS) {
    if (body[forbiddenKey] !== undefined) {
      // In strict mode, we strip or reject. Here we sanitize.
    }
  }

  if (!isUpdate && (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0)) {
    errors.push({ field: 'name', message: 'Product name is required and cannot be empty' });
  }

  if (body.taxRate !== undefined && (typeof body.taxRate !== 'number' || body.taxRate < 0 || body.taxRate > 100)) {
    errors.push({ field: 'taxRate', message: 'Tax rate must be a number between 0 and 100' });
  }

  if (body.variants && Array.isArray(body.variants)) {
    for (let i = 0; i < body.variants.length; i++) {
      const v = body.variants[i];
      if (v.retailPrice !== undefined && (typeof v.retailPrice !== 'number' || v.retailPrice < 0)) {
        errors.push({ field: `variants[${i}].retailPrice`, message: 'Retail price cannot be negative' });
      }
      if (v.costPrice !== undefined && (typeof v.costPrice !== 'number' || v.costPrice < 0)) {
        errors.push({ field: `variants[${i}].costPrice`, message: 'Cost price cannot be negative' });
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Product validation failed', errors);
  }

  return sanitizeClientBody(body);
}

/**
 * Express Middleware helper for validation errors
 */
export function validateBody(validator: (body: any) => any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = validator(req.body);
      next();
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: err.message,
            details: err.details,
          },
        });
      }
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: err.message || 'Invalid request format',
        },
      });
    }
  };
}
