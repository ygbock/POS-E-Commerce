import { Request, Response, NextFunction } from 'express';
import { VALID_ROLES } from '../auth/roles';

/**
 * Runtime Input Validation & Anti-Spoofing Layer (API-001R1)
 * 
 * Enforces strict DTO allowlisting and exact decimal contracts at the API boundary.
 * - Unknown fields produce 422 VALIDATION_ERROR.
 * - Money and quantity inputs must be string-based exact decimals; numeric floats/ints are rejected with 422.
 * - Identity fields (organizationId, userId, permissions, etc.) are strictly rejected if supplied by clients.
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

export const DANGEROUS_PROTO_KEYS = ['__proto__', 'constructor', 'prototype'];

export const IMMUTABLE_RECORD_KEYS = [
  'id',
  'organization_id',
  'organizationId',
  'created_at',
  'createdAt',
  'updated_at',
  'updatedAt',
];

export const FORBIDDEN_CLIENT_KEYS = [
  'id',
  'organization_id',
  'organizationId',
  'role',
  'permissions',
  'created_at',
  'updated_at',
  'token',
  'password_hash',
  'password_salt',
];

export const MONEY_REGEX = /^\d+(?:\.\d{1,2})?$/;
export const QUANTITY_REGEX = /^\d+(?:\.\d{1,4})?$/;

/**
 * Strict DTO Allowlist Checker:
 * Ensures only explicitly authorized properties exist on the request body.
 * Any extra, unexpected, or injected keys trigger a 422 VALIDATION_ERROR.
 */
export function assertAllowedKeys(
  data: Record<string, any>,
  allowedKeys: string[],
  contextName = 'request'
): ValidationErrorDetail[] {
  const allowedSet = new Set(allowedKeys);
  const errors: ValidationErrorDetail[] = [];

  const allKeys = new Set([
    ...Object.keys(data || {}),
    ...Object.getOwnPropertyNames(data || {}),
  ]);

  for (const key of allKeys) {
    if (DANGEROUS_PROTO_KEYS.includes(key)) {
      errors.push({
        field: key,
        message: 'Prototype pollution attempts are strictly rejected.',
      });
      continue;
    }
    if (!allowedSet.has(key)) {
      errors.push({
        field: key,
        message: `Unrecognized or forbidden field '${key}' is not allowed on ${contextName}.`,
      });
    }
  }

  return errors;
}

/**
 * Validates that a value is an exact money decimal string with at most 2 decimal places.
 * Numeric floats or integers are rejected with 422 to prevent binary floating-point distortion.
 */
export function validateMoneyDecimal(
  val: any,
  fieldName: string,
  required = false
): ValidationErrorDetail | null {
  if (val === undefined || val === null) {
    if (required) {
      return { field: fieldName, message: `${fieldName} is required and must be an exact decimal string (e.g. "12.50").` };
    }
    return null;
  }

  if (typeof val !== 'string') {
    return {
      field: fieldName,
      message: `${fieldName} must be an exact decimal string (e.g. "249.99"). Numeric numbers or floats are strictly rejected.`,
    };
  }

  if (!MONEY_REGEX.test(val)) {
    return {
      field: fieldName,
      message: `${fieldName} must be a valid non-negative decimal string with at most 2 decimal places (e.g. "12.50").`,
    };
  }

  return null;
}

/**
 * Validates that a value is an exact quantity decimal string with at most 4 decimal places.
 */
export function validateQuantityDecimal(
  val: any,
  fieldName: string,
  required = false
): ValidationErrorDetail | null {
  if (val === undefined || val === null) {
    if (required) {
      return { field: fieldName, message: `${fieldName} is required and must be an exact decimal string.` };
    }
    return null;
  }

  if (typeof val !== 'string') {
    return {
      field: fieldName,
      message: `${fieldName} must be an exact decimal string. Numeric numbers or floats are strictly rejected.`,
    };
  }

  if (!QUANTITY_REGEX.test(val)) {
    return {
      field: fieldName,
      message: `${fieldName} must be a valid non-negative decimal string with at most 4 decimal places.`,
    };
  }

  return null;
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

/**
 * Login Request Validator
 */
export function validateLoginPayload(body: any): { email: string; password: string; organizationId: string } {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Invalid request body', [{ field: 'body', message: 'JSON body object is required' }]);
  }

  const allowlistErrors = assertAllowedKeys(body, ['email', 'password', 'organizationId'], 'login payload');
  if (allowlistErrors.length > 0) {
    errors.push(...allowlistErrors);
  }

  if (!body.email || typeof body.email !== 'string' || !body.email.includes('@')) {
    errors.push({ field: 'email', message: 'A valid email address is required' });
  }

  if (!body.password || typeof body.password !== 'string' || body.password.length < 1) {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (!body.organizationId || typeof body.organizationId !== 'string' || body.organizationId.trim().length === 0) {
    errors.push({ field: 'organizationId', message: 'organizationId is required and must be a non-empty string' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Authentication input validation failed', errors);
  }

  return {
    email: body.email.toLowerCase().trim(),
    password: body.password,
    organizationId: String(body.organizationId).trim(),
  };
}

/**
 * User Creation Request Validator
 * Strict allowlist: email, name, password, role, locationId
 * Client-supplied organizationId or privilege escalation attempts trigger 422.
 */
export function validateUserPayload(body: any): {
  email: string;
  name: string;
  password: string;
  role: string;
  locationId?: string | null;
} {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
  }

  const allowlistErrors = assertAllowedKeys(
    body,
    ['email', 'name', 'password', 'role', 'locationId'],
    'user payload'
  );
  if (allowlistErrors.length > 0) {
    errors.push(...allowlistErrors);
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

  if (body.locationId !== undefined && body.locationId !== null && typeof body.locationId !== 'string') {
    errors.push({ field: 'locationId', message: 'locationId must be a string or null' });
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
  };
}

/**
 * Customer Creation / Update Validator
 */
export function validateCustomerPayload(body: any, isUpdate = false): Record<string, any> {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
  }

  const allowedKeys = [
    'name', 'email', 'phone', 'address', 'tier',
    'store_credit_balance', 'credit_limit', 'tax_exempt', 'notes'
  ];

  const allowlistErrors = assertAllowedKeys(body, allowedKeys, 'customer payload');
  if (allowlistErrors.length > 0) {
    errors.push(...allowlistErrors);
  }

  if (!isUpdate && (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0)) {
    errors.push({ field: 'name', message: 'Customer name is required' });
  }

  if (body.email !== undefined && body.email !== null && (typeof body.email !== 'string' || !body.email.includes('@'))) {
    errors.push({ field: 'email', message: 'Email must be a valid email address' });
  }

  const creditBalErr = validateMoneyDecimal(body.store_credit_balance, 'store_credit_balance');
  if (creditBalErr) errors.push(creditBalErr);

  const creditLimErr = validateMoneyDecimal(body.credit_limit, 'credit_limit');
  if (creditLimErr) errors.push(creditLimErr);

  if (errors.length > 0) {
    throw new ValidationError('Customer validation failed', errors);
  }

  const dto: Record<string, any> = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      dto[key] = body[key];
    }
  }
  return dto;
}

/**
 * Category Creation / Update Validator
 */
export function validateCategoryPayload(body: any, isUpdate = false): Record<string, any> {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
  }

  const allowedKeys = [
    'name', 'slug', 'description', 'iconName', 'accentColor',
    'subcategories', 'displayOrder', 'isPosQuickAccess', 'parentId'
  ];

  const allowlistErrors = assertAllowedKeys(body, allowedKeys, 'category payload');
  if (allowlistErrors.length > 0) {
    errors.push(...allowlistErrors);
  }

  if (!isUpdate && (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0)) {
    errors.push({ field: 'name', message: 'Category name is required' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Category validation failed', errors);
  }

  const dto: Record<string, any> = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      dto[key] = body[key];
    }
  }
  return dto;
}

/**
 * Brand Creation / Update Validator
 */
export function validateBrandPayload(body: any, isUpdate = false): Record<string, any> {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
  }

  const allowedKeys = [
    'name', 'slug', 'logoUrl', 'countryOfOrigin', 'website',
    'description', 'isActive'
  ];

  const allowlistErrors = assertAllowedKeys(body, allowedKeys, 'brand payload');
  if (allowlistErrors.length > 0) {
    errors.push(...allowlistErrors);
  }

  if (!isUpdate && (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0)) {
    errors.push({ field: 'name', message: 'Brand name is required' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Brand validation failed', errors);
  }

  const dto: Record<string, any> = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      dto[key] = body[key];
    }
  }
  return dto;
}

/**
 * Attribute Creation / Update Validator
 */
export function validateAttributePayload(body: any, isUpdate = false): Record<string, any> {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
  }

  const allowedKeys = [
    'name', 'code', 'type', 'values', 'required', 'isFilterable',
    'description', 'isActive'
  ];

  const allowlistErrors = assertAllowedKeys(body, allowedKeys, 'attribute payload');
  if (allowlistErrors.length > 0) {
    errors.push(...allowlistErrors);
  }

  if (!isUpdate && (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0)) {
    errors.push({ field: 'name', message: 'Attribute name is required' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Attribute validation failed', errors);
  }

  const dto: Record<string, any> = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      dto[key] = body[key];
    }
  }
  return dto;
}

/**
 * Product Variant Creation / Update Validator
 * Enforces string-based exact decimal prices and quantities.
 */
export function validateVariantPayload(body: any, isUpdate = false): Record<string, any> {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
  }

  const allowedKeys = [
    'sku', 'barcode', 'qrCode', 'name', 'attributes',
    'costPrice', 'retailPrice', 'wholesalePrice', 'memberPrice', 'minSellingPrice',
    'weightKg', 'dimensionsCm', 'unit', 'stockByLocation', 'lowStockThreshold',
    'image', 'isActive', 'trackInventory'
  ];

  const allowlistErrors = assertAllowedKeys(body, allowedKeys, 'variant payload');
  if (allowlistErrors.length > 0) {
    errors.push(...allowlistErrors);
  }

  // Exact Decimal Checks
  const retailErr = validateMoneyDecimal(body.retailPrice, 'retailPrice', !isUpdate);
  if (retailErr) errors.push(retailErr);

  const costErr = validateMoneyDecimal(body.costPrice, 'costPrice', false);
  if (costErr) errors.push(costErr);

  const wholesaleErr = validateMoneyDecimal(body.wholesalePrice, 'wholesalePrice', false);
  if (wholesaleErr) errors.push(wholesaleErr);

  const memberErr = validateMoneyDecimal(body.memberPrice, 'memberPrice', false);
  if (memberErr) errors.push(memberErr);

  const minSellErr = validateMoneyDecimal(body.minSellingPrice, 'minSellingPrice', false);
  if (minSellErr) errors.push(minSellErr);

  if (body.lowStockThreshold !== undefined && body.lowStockThreshold !== null) {
    if (typeof body.lowStockThreshold === 'number') {
      if (!Number.isInteger(body.lowStockThreshold) || body.lowStockThreshold < 0) {
        errors.push({ field: 'lowStockThreshold', message: 'lowStockThreshold must be a non-negative integer' });
      }
    } else if (typeof body.lowStockThreshold === 'string') {
      if (!/^\d+$/.test(body.lowStockThreshold.trim())) {
        errors.push({ field: 'lowStockThreshold', message: 'lowStockThreshold must be a non-negative integer string' });
      }
    } else {
      errors.push({ field: 'lowStockThreshold', message: 'lowStockThreshold must be an integer' });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Variant validation failed', errors);
  }

  const dto: Record<string, any> = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      dto[key] = body[key];
    }
  }
  return dto;
}

/**
 * Product Create / Update Validator
 * Enforces strict allowlisting and exact decimal prices across variants and top-level fields.
 */
export function validateProductPayload(body: any, isUpdate = false): Record<string, any> {
  const errors: ValidationErrorDetail[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a valid JSON object', [{ field: 'body', message: 'Object required' }]);
  }

  const allowedProductKeys = [
    'name', 'slug', 'brand', 'brandId', 'category', 'categoryId', 'subcategory',
    'description', 'shortDescription', 'unit', 'unitCode', 'productType', 'status',
    'channels', 'taxRate', 'rating', 'reviewCount', 'tags', 'images', 'featured',
    'variants', 'sku', 'barcode', 'costPrice', 'retailPrice', 'wholesalePrice',
    'memberPrice', 'minSellingPrice', 'stockByLocation', 'lowStockThreshold'
  ];

  const allowlistErrors = assertAllowedKeys(body, allowedProductKeys, 'product payload');
  if (allowlistErrors.length > 0) {
    errors.push(...allowlistErrors);
  }

  if (!isUpdate && (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0)) {
    errors.push({ field: 'name', message: 'Product name is required and cannot be empty' });
  }

  // Top-level financial decimal validation
  if (body.retailPrice !== undefined) {
    const err = validateMoneyDecimal(body.retailPrice, 'retailPrice');
    if (err) errors.push(err);
  }
  if (body.costPrice !== undefined) {
    const err = validateMoneyDecimal(body.costPrice, 'costPrice');
    if (err) errors.push(err);
  }
  if (body.wholesalePrice !== undefined) {
    const err = validateMoneyDecimal(body.wholesalePrice, 'wholesalePrice');
    if (err) errors.push(err);
  }
  if (body.memberPrice !== undefined) {
    const err = validateMoneyDecimal(body.memberPrice, 'memberPrice');
    if (err) errors.push(err);
  }
  if (body.minSellingPrice !== undefined) {
    const err = validateMoneyDecimal(body.minSellingPrice, 'minSellingPrice');
    if (err) errors.push(err);
  }

  let validatedVariants: any[] | undefined = undefined;
  if (body.variants !== undefined) {
    if (!Array.isArray(body.variants)) {
      errors.push({ field: 'variants', message: 'variants must be an array of variant objects' });
    } else {
      validatedVariants = [];
      for (let i = 0; i < body.variants.length; i++) {
        const v = body.variants[i];
        try {
          validatedVariants.push(validateVariantPayload(v, isUpdate));
        } catch (err: any) {
          if (err instanceof ValidationError) {
            for (const d of err.details) {
              errors.push({ field: `variants[${i}].${d.field}`, message: d.message });
            }
          } else {
            errors.push({ field: `variants[${i}]`, message: err.message || 'Invalid variant' });
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Product validation failed', errors);
  }

  const dto: Record<string, any> = {};
  for (const key of allowedProductKeys) {
    if (key === 'variants' && validatedVariants !== undefined) {
      dto.variants = validatedVariants;
    } else if (body[key] !== undefined) {
      dto[key] = body[key];
    }
  }
  return dto;
}

/**
 * Pagination & Query Parameter Validator
 * Strictly validates page, limit, offset, sort, and order against safe constraints and allowlists.
 */
export interface PaginationOptions {
  allowedSortFields?: string[];
  defaultSort?: string;
  defaultLimit?: number;
  maxLimit?: number;
}

export function validatePaginationQuery(query: any, options: PaginationOptions = {}) {
  const errors: ValidationErrorDetail[] = [];
  const maxLimit = options.maxLimit || 100;
  const defaultLimit = options.defaultLimit || 50;

  let page = 1;
  if (query.page !== undefined) {
    const num = Number(query.page);
    if (!Number.isInteger(num) || num < 1) {
      errors.push({ field: 'page', message: 'page must be a positive integer greater than or equal to 1' });
    } else {
      page = num;
    }
  }

  let limit = defaultLimit;
  if (query.limit !== undefined) {
    const num = Number(query.limit);
    if (!Number.isInteger(num) || num < 1) {
      errors.push({ field: 'limit', message: 'limit must be a positive integer greater than or equal to 1' });
    } else if (num > maxLimit) {
      errors.push({ field: 'limit', message: `limit cannot exceed maximum allowed limit of ${maxLimit}` });
    } else {
      limit = num;
    }
  }

  let offset = (page - 1) * limit;
  if (query.offset !== undefined) {
    const num = Number(query.offset);
    if (!Number.isInteger(num) || num < 0) {
      errors.push({ field: 'offset', message: 'offset must be a non-negative integer' });
    } else {
      offset = num;
    }
  }

  let sort = options.defaultSort || 'created_at';
  if (query.sort !== undefined) {
    if (typeof query.sort !== 'string' || (options.allowedSortFields && !options.allowedSortFields.includes(query.sort))) {
      errors.push({
        field: 'sort',
        message: `sort field '${query.sort}' is not permitted. Allowed: ${options.allowedSortFields?.join(', ') || 'none'}`,
      });
    } else {
      sort = query.sort;
    }
  }

  let order: 'asc' | 'desc' = 'desc';
  if (query.order !== undefined) {
    const lower = String(query.order).toLowerCase();
    if (lower !== 'asc' && lower !== 'desc') {
      errors.push({ field: 'order', message: 'order must be either "asc" or "desc"' });
    } else {
      order = lower as 'asc' | 'desc';
    }
  }

  if (query.search !== undefined && (typeof query.search !== 'string' || query.search.length > 100)) {
    errors.push({ field: 'search', message: 'search string must not exceed 100 characters' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Query parameters validation failed', errors);
  }

  return {
    page,
    limit,
    offset,
    sort,
    order,
    search: query.search ? String(query.search).trim() : undefined,
  };
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

/**
 * Strips server-immutable fields from a payload (e.g. id, organization_id, created_at, updated_at).
 */
export function stripImmutableFields<T extends Record<string, any>>(obj: T): Partial<T> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result = { ...obj };
  for (const key of IMMUTABLE_RECORD_KEYS) {
    delete (result as any)[key];
  }
  return result;
}
