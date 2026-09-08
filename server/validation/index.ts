import { Request, Response, NextFunction } from 'express';
import { VALID_ROLES } from '../auth/roles';

/**
 * Runtime Input Validation & Anti-Spoofing Layer (SEC-001 / API-001)
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
export const FORBIDDEN_CLIENT_KEYS = [
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

export const DANGEROUS_PROTO_KEYS = ['__proto__', 'constructor', 'prototype'];

export const IMMUTABLE_RECORD_KEYS = [
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
    if (!IMMUTABLE_RECORD_KEYS.includes(key) && !DANGEROUS_PROTO_KEYS.includes(key)) {
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
 * User Creation Request Validator
 */
export function validateUserPayload(body: any): {
  email: string;
  name: string;
  password: string;
  role: string;
  locationId?: string | null;
  organizationId?: string;
} {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
  }

  if (!body.email || typeof body.email !== 'string' || !body.email.includes('@')) {
    errors.push({ field: 'email', message: 'A valid email address is required' });
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'User name is required' });
  }

  if (!body.password || typeof body.password !== 'string' || body.password.length < 8) {
    errors.push({ field: 'password', message: 'Password is required and must be at least 8 characters' });
  }

  if (!body.role || !VALID_ROLES.includes(body.role)) {
    errors.push({ field: 'role', message: `Role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  if (errors.length > 0) {
    throw new ValidationError('User validation failed', errors);
  }

  return {
    email: String(body.email).toLowerCase().trim(),
    name: String(body.name).trim(),
    password: String(body.password),
    role: body.role,
    locationId: body.locationId ? String(body.locationId).trim() : null,
    organizationId: body.organizationId ? String(body.organizationId).trim() : undefined,
  };
}

/**
 * Customer Creation / Update Validator
 */
export function validateCustomerPayload(body: any, isUpdate = false): Record<string, any> {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
  }

  if (!isUpdate && (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0)) {
    errors.push({ field: 'name', message: 'Customer name is required' });
  }

  if (body.email !== undefined && body.email !== null && (typeof body.email !== 'string' || !body.email.includes('@'))) {
    errors.push({ field: 'email', message: 'Email must be a valid email address' });
  }

  if (body.store_credit_balance !== undefined && body.store_credit_balance !== null) {
    if (typeof body.store_credit_balance !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(body.store_credit_balance)) {
      errors.push({ field: 'store_credit_balance', message: 'Store credit balance must be a valid non-negative decimal string (up to 2 decimals)' });
    }
  }

  if (body.credit_limit !== undefined && body.credit_limit !== null) {
    if (typeof body.credit_limit !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(body.credit_limit)) {
      errors.push({ field: 'credit_limit', message: 'Credit limit must be a valid non-negative decimal string (up to 2 decimals)' });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Customer validation failed', errors);
  }

  return sanitizeClientBody(body);
}

/**
 * Category Creation / Update Validator
 */
export function validateCategoryPayload(body: any): Record<string, any> {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Category name is required' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Category validation failed', errors);
  }

  return sanitizeClientBody(body);
}

/**
 * Brand Creation / Update Validator
 */
export function validateBrandPayload(body: any): Record<string, any> {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Brand name is required' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Brand validation failed', errors);
  }

  return sanitizeClientBody(body);
}

/**
 * Attribute Creation Validator
 */
export function validateAttributePayload(body: any): Record<string, any> {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Attribute name is required' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Attribute validation failed', errors);
  }

  return sanitizeClientBody(body);
}

/**
 * Product Create / Update Validator
 */
export function validateProductPayload(body: any, isUpdate = false): Record<string, any> {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
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
      const requestId = (req as any)?.id || (req?.headers?.['x-request-id'] as string) || undefined;
      if (err instanceof ValidationError) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: err.message,
            details: err.details,
            ...(requestId ? { requestId } : {}),
          },
        });
      }
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: err.message || 'Invalid request format',
          ...(requestId ? { requestId } : {}),
        },
      });
    }
  };
}
