import { DatabaseClient } from '../db/client.ts';
import { parseExactMoney, parseExactQuantity, parseQtyToScaled, formatScaledToQtyString } from '../inventory/inventoryPolicies.ts';
import { TenantStorefrontConfig } from './tenantResolver.ts';

export interface StorefrontCartItemInput {
  variantId?: unknown;
  variant_id?: unknown;
  quantity?: unknown;
}

export interface ValidatedStorefrontCartItem {
  variantId: string;
  productId: string;
  name: string;
  sku: string;
  unitPrice: string;
  quantity: string;
  lineSubtotal: string;
  taxRate: string;
  lineTax: string;
  lineTotal: string;
  availableStock: string;
  isAvailable: boolean;
}

export interface StorefrontCartValidationResult {
  items: ValidatedStorefrontCartItem[];
  subtotal: string;
  tax: string;
  shippingFee: string;
  total: string;
  currency: string;
  currencySymbol: string;
  freeShippingThreshold: string;
  amountToFreeShipping: string;
  fulfillmentLocationId: string | null;
  stockSnapshotAt: string;
}

export class StorefrontCartValidationError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'StorefrontCartValidationError';
  }
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('Invalid arithmetic denominator.');
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const result = (absolute + denominator / 2n) / denominator;
  return negative ? -result : result;
}

function moneyToCents(value: unknown, field: string): bigint {
  const normalized = parseExactMoney(String(value), field, { allowNegative: false });
  const [whole, fraction = ''] = normalized.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2) || '0');
  return cents;
}

function centsToMoney(cents: bigint): string {
  const whole = cents / 100n;
  const fraction = (cents < 0n ? -cents : cents) % 100n;
  return `${whole}.${fraction.toString().padStart(2, '0')}`;
}

function normalizeQuantity(value: unknown): string {
  // Never coerce client numbers, booleans, null, or objects into quantities.
  if (typeof value !== 'string') {
    throw new StorefrontCartValidationError(
      'VALIDATION_ERROR',
      'Cart quantity must be supplied as an exact decimal string.'
    );
  }

  let normalized: string;
  try {
    normalized = parseExactQuantity(value, 'quantity', { allowNegative: false });
  } catch (err: any) {
    throw new StorefrontCartValidationError('VALIDATION_ERROR', err?.message || 'Invalid quantity.');
  }

  if (parseQtyToScaled(normalized) <= 0n) {
    throw new StorefrontCartValidationError('VALIDATION_ERROR', 'Cart quantity must be greater than zero.');
  }

  return normalized;
}

function policyMoney(value: unknown, field: string): bigint {
  // Tenant configuration is trusted server data; normalize it once at the domain boundary.
  return moneyToCents(value, field);
}

export class StorefrontCartService {
  constructor(private readonly db: DatabaseClient) {}

  async validate(params: {
    organizationId: string;
    config: TenantStorefrontConfig;
    items: StorefrontCartItemInput[];
    fulfillmentLocationId?: unknown;
  }): Promise<StorefrontCartValidationResult> {
    const { organizationId, config, items } = params;

    if (!organizationId) {
      throw new StorefrontCartValidationError('TENANT_REQUIRED', 'Storefront tenant context is required.', 403);
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new StorefrontCartValidationError('EMPTY_CART', 'Cart items array cannot be empty.');
    }
    if (items.length > 100) {
      throw new StorefrontCartValidationError('CART_TOO_LARGE', 'A cart cannot contain more than 100 distinct items.');
    }

    const requested = new Map<string, string>();
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        throw new StorefrontCartValidationError('VALIDATION_ERROR', 'Each cart item must be an object.');
      }

      const rawVariantId = item.variantId ?? item.variant_id;
      if (typeof rawVariantId !== 'string' || rawVariantId.trim() === '' || rawVariantId.length > 128) {
        throw new StorefrontCartValidationError('VALIDATION_ERROR', 'Each cart item must contain a valid variantId.');
      }

      if (requested.has(rawVariantId)) {
        throw new StorefrontCartValidationError(
          'DUPLICATE_CART_ITEM',
          `Variant '${rawVariantId}' appears more than once in the cart.`
        );
      }

      requested.set(rawVariantId, normalizeQuantity(item.quantity));
    }

    let locationId: string | null = null;
    if (params.fulfillmentLocationId !== undefined && params.fulfillmentLocationId !== null && params.fulfillmentLocationId !== '') {
      if (typeof params.fulfillmentLocationId !== 'string') {
        throw new StorefrontCartValidationError('VALIDATION_ERROR', 'fulfillmentLocationId must be a string.');
      }

      const location = await this.db.query<any>(
        `SELECT id, name, is_active
         FROM locations
         WHERE id = $1 AND organization_id = $2
         LIMIT 1`,
        [params.fulfillmentLocationId, organizationId]
      );

      if (location.rows.length === 0 || !location.rows[0].is_active) {
        throw new StorefrontCartValidationError(
          'INVALID_FULFILLMENT_LOCATION',
          'The selected fulfillment location is unavailable for this store.'
        );
      }
      locationId = location.rows[0].id;
    }

    let subtotalCents = 0n;
    let taxCents = 0n;
    const validatedItems: ValidatedStorefrontCartItem[] = [];

    for (const [variantId, quantity] of requested.entries()) {
      const variantRes = await this.db.query<any>(
        `SELECT
           pv.id,
           pv.product_id,
           pv.sku,
           pv.name,
           pv.retail_price::text AS retail_price,
           p.name AS product_name,
           p.status AS product_status,
           p.tax_rate::text AS tax_rate
         FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = $1
           AND pv.organization_id = $2
           AND p.organization_id = $2
         LIMIT 1`,
        [variantId, organizationId]
      );

      if (variantRes.rows.length === 0) {
        throw new StorefrontCartValidationError(
          'PRODUCT_NOT_FOUND',
          `Variant '${variantId}' was not found in this store.`,
          404
        );
      }

      const variant = variantRes.rows[0];
      if (variant.product_status !== 'active') {
        throw new StorefrontCartValidationError(
          'PRODUCT_INACTIVE',
          `Product '${variant.product_name}' is currently unavailable.`
        );
      }

      const quantityScaled = parseQtyToScaled(quantity);
      const unitPriceCents = moneyToCents(variant.retail_price, 'retailPrice');
      const taxRate = parseExactQuantity(variant.tax_rate || '0', 'taxRate', { allowNegative: false });
      const taxRateScaled = parseQtyToScaled(taxRate);

      const lineSubtotalCents = divideRoundHalfUp(unitPriceCents * quantityScaled, 10000n);
      const lineTaxCents = divideRoundHalfUp(lineSubtotalCents * taxRateScaled, 1000000n);
      const lineTotalCents = lineSubtotalCents + lineTaxCents;

      const stockQuery = locationId
        ? `SELECT COALESCE(on_hand - reserved - damaged - expired, 0)::text AS available
           FROM inventory_balances
           WHERE variant_id = $1 AND organization_id = $2 AND location_id = $3`
        : `SELECT COALESCE(SUM(on_hand - reserved - damaged - expired), 0)::text AS available
           FROM inventory_balances
           WHERE variant_id = $1 AND organization_id = $2`;

      const stockParams = locationId
        ? [variantId, organizationId, locationId]
        : [variantId, organizationId];

      const stockRes = await this.db.query<{ available: string }>(stockQuery, stockParams);
      const availableScaled = stockRes.rows.length
        ? parseQtyToScaled(stockRes.rows[0].available || '0')
        : 0n;

      subtotalCents += lineSubtotalCents;
      taxCents += lineTaxCents;

      validatedItems.push({
        variantId: variant.id,
        productId: variant.product_id,
        name: `${variant.product_name} - ${variant.name}`,
        sku: variant.sku,
        unitPrice: parseExactMoney(variant.retail_price, 'retailPrice'),
        quantity,
        lineSubtotal: centsToMoney(lineSubtotalCents),
        taxRate,
        lineTax: centsToMoney(lineTaxCents),
        lineTotal: centsToMoney(lineTotalCents),
        availableStock: formatScaledToQtyString(availableScaled < 0n ? 0n : availableScaled),
        isAvailable: availableScaled >= quantityScaled,
      });
    }

    const freeShippingThresholdCents = policyMoney(
      config.policies.freeShippingThreshold,
      'freeShippingThreshold'
    );
    const standardShippingCents = policyMoney(
      config.policies.standardShippingFee,
      'standardShippingFee'
    );

    const shippingCents = subtotalCents >= freeShippingThresholdCents
      ? 0n
      : standardShippingCents;

    const totalCents = subtotalCents + taxCents + shippingCents;
    const amountToFreeShippingCents =
      subtotalCents >= freeShippingThresholdCents
        ? 0n
        : freeShippingThresholdCents - subtotalCents;

    return {
      items: validatedItems,
      subtotal: centsToMoney(subtotalCents),
      tax: centsToMoney(taxCents),
      shippingFee: centsToMoney(shippingCents),
      total: centsToMoney(totalCents),
      currency: config.localization.currencyCode,
      currencySymbol: config.localization.currencySymbol,
      freeShippingThreshold: centsToMoney(freeShippingThresholdCents),
      amountToFreeShipping: centsToMoney(amountToFreeShippingCents),
      fulfillmentLocationId: locationId,
      stockSnapshotAt: new Date().toISOString(),
    };
  }
}
