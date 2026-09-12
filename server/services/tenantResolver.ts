import { Request } from 'express';
import { DatabaseClient, getDatabaseClient } from '../db/client';
import { ApiError } from '../utils/errorSanitizer';

export interface TenantBranding {
  storeName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  heroTitle: string;
  heroSubtitle: string;
  trustBadges: Array<{ icon: string; title: string; subtitle: string }>;
}

export interface TenantLocalization {
  currencyCode: string;
  currencySymbol: string;
  locale: string;
  timezone: string;
}

export interface TenantPolicies {
  freeShippingThreshold: number;
  standardShippingFee: number;
  expressShippingFee: number;
  shippingPolicy: string;
  returnPolicy: string;
  warrantyPolicy: string;
  deliveryPromise: string;
  pickupEnabled: boolean;
  pickupInstructions: string;
}

export interface TenantCatalogPolicy {
  allowBackorders: boolean;
  showInventoryCount: boolean;
  lowStockThreshold: number;
  defaultSort: string;
}

export interface TenantFeatureFlags {
  reviewsEnabled: boolean;
  wishlistEnabled: boolean;
  couponsEnabled: boolean;
  pickupEnabled: boolean;
  guestCheckoutEnabled: boolean;
  orderTrackingEnabled: boolean;
}

export interface StorefrontLocationRecord {
  id: string;
  code: string;
  name: string;
  type: string;
  address: string | null;
  phone: string | null;
  is_pos_enabled: boolean;
  is_active: boolean;
}

export interface TenantStorefrontConfig {
  tenant: {
    id: string;
    code: string;
    slug: string;
    name: string;
  };
  branding: TenantBranding;
  localization: TenantLocalization;
  policies: TenantPolicies;
  catalogPolicy: TenantCatalogPolicy;
  featureFlags: TenantFeatureFlags;
  pickupLocations: StorefrontLocationRecord[];
}

/**
 * Validates whether query parameter tenant switching is permitted in the active environment.
 * - development: permitted
 * - test: permitted
 * - staging: permitted only if ALLOW_STAGING_TENANT_QUERY_OVERRIDE === 'true'
 * - production: strictly prohibited
 */
export function isQueryTenantOverridePermitted(): boolean {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  if (env === 'production') {
    return false;
  }
  if (env === 'staging') {
    return process.env.ALLOW_STAGING_TENANT_QUERY_OVERRIDE === 'true';
  }
  return env === 'development' || env === 'test';
}

/**
 * Checks whether a given host represents the canonical platform entry point.
 */
export function isCanonicalPlatformHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const rawHost = hostHeader.split(':')[0].toLowerCase().trim();
  const canonicalAppUrl = process.env.APP_URL ? process.env.APP_URL.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].toLowerCase() : null;

  return (
    rawHost === 'localhost' ||
    rawHost === '127.0.0.1' ||
    rawHost === 'shop.abacha.com' ||
    rawHost === 'abacha-app.onrender.com' ||
    (canonicalAppUrl !== null && rawHost === canonicalAppUrl)
  );
}

/**
 * Resolves the authoritative multi-tenant storefront context for an incoming public request.
 * 
 * FAIL-CLOSED INVARIANTS:
 * 1. An explicit identifier (slug, custom domain, or query override) that cannot be found MUST throw HTTP 404.
 * 2. An inactive organization MUST throw HTTP 404 (Store Unavailable).
 * 3. A mismatched custom domain + path slug MUST fail closed with HTTP 400.
 * 4. Production query parameters MUST NOT switch the tenant context.
 * 5. Default fallback to 'org_default' is allowed ONLY on the canonical entry point without an explicit tenant identifier.
 */
export async function resolveStorefrontTenant(
  req: Request,
  dbClient?: DatabaseClient,
  options?: { explicitSlug?: string }
): Promise<TenantStorefrontConfig> {
  const db = dbClient || getDatabaseClient();

  const rawHostHeader = (
    (req.headers['x-forwarded-host'] as string) ||
    (req.headers['x-tenant-domain'] as string) ||
    (req.headers.host || '')
  );
  const hostHeader = rawHostHeader.split(',')[0].split(':')[0].toLowerCase().trim();
  const rawQueryTenant = (req.query.tenant || req.query.store) as string | undefined;
  const explicitSlug = options?.explicitSlug || req.params.tenantSlug;

  let targetSlug: string | null = null;
  let targetDomain: string | null = null;
  let isExplicit = false;

  // 1. Environment-Gated Query Parameter Override
  if (rawQueryTenant && typeof rawQueryTenant === 'string' && rawQueryTenant.trim() !== '') {
    if (isQueryTenantOverridePermitted()) {
      targetSlug = rawQueryTenant.trim().toLowerCase();
      isExplicit = true;
    }
  }

  // 2. Explicit Path Slug (e.g. /api/storefront/:tenantSlug/...)
  if (!targetSlug && explicitSlug && typeof explicitSlug === 'string' && explicitSlug.trim() !== '') {
    const cleaned = explicitSlug.trim().toLowerCase();
    if (cleaned !== 'auto') {
      targetSlug = cleaned;
      isExplicit = true;
    }
  }

  // 3. Host / Subdomain / Custom Domain Resolution
  if (!targetSlug && hostHeader) {
    if (!isCanonicalPlatformHost(hostHeader)) {
      // Check if it's a subdomain on abacha.com or abacha.test
      if (hostHeader.endsWith('.abacha.com') || hostHeader.endsWith('.abacha.test')) {
        const sub = hostHeader.split('.')[0];
        if (sub && sub !== 'www' && sub !== 'shop' && sub !== 'api') {
          targetSlug = sub;
          isExplicit = true;
        }
      } else {
        // Treat as a custom domain
        targetDomain = hostHeader;
        isExplicit = true;
      }
    }
  }

  // 4. Canonical Default Entry Point Fallback
  // ONLY permitted if NO explicit identifier (slug or domain) was supplied
  if (!targetSlug && !targetDomain) {
    if (isCanonicalPlatformHost(hostHeader) || !hostHeader) {
      targetSlug = 'default';
    } else {
      // Unknown host that is not canonical platform host -> fail closed!
      throw new ApiError('DOMAIN_NOT_FOUND', `Store not found for domain '${hostHeader}'.`, 404);
    }
  }

  // 5. Query Organization from Database
  let orgRow: any = null;
  if (targetDomain) {
    const res = await db.query<any>(
      'SELECT * FROM organizations WHERE custom_domain = $1',
      [targetDomain]
    );
    if (res.rows.length === 0) {
      throw new ApiError('DOMAIN_NOT_FOUND', `Store not found for domain '${targetDomain}'.`, 404);
    }
    orgRow = res.rows[0];
  } else if (targetSlug) {
    const res = await db.query<any>(
      'SELECT * FROM organizations WHERE slug = $1 OR id = $1',
      [targetSlug]
    );
    if (res.rows.length === 0) {
      throw new ApiError('TENANT_NOT_FOUND', `Store not found for tenant '${targetSlug}'.`, 404);
    }
    orgRow = res.rows[0];
  }

  if (!orgRow) {
    throw new ApiError('TENANT_NOT_FOUND', 'Store not found.', 404);
  }

  // 6. Fail-Closed Inactive Verification
  if (!orgRow.is_active) {
    throw new ApiError('TENANT_INACTIVE', 'Store is temporarily unavailable.', 404);
  }

  // 7. Check Mismatched Custom Domain vs Path Slug
  if (targetDomain && explicitSlug && explicitSlug !== 'auto') {
    if (orgRow.slug !== explicitSlug && orgRow.id !== explicitSlug) {
      throw new ApiError('TENANT_MISMATCH', `Store domain '${targetDomain}' does not match path '${explicitSlug}'.`, 400);
    }
  }

  // 8. Fetch Active Pickup / Store Locations for Tenant
  const locRes = await db.query<any>(
    `SELECT id, code, name, type, address, phone, is_pos_enabled, is_active
     FROM locations 
     WHERE organization_id = $1 AND is_active = true 
     ORDER BY (CASE WHEN is_pos_enabled THEN 0 ELSE 1 END), name ASC`,
    [orgRow.id]
  );

  const rawBranding = typeof orgRow.branding === 'string' ? JSON.parse(orgRow.branding) : (orgRow.branding || {});
  const rawPolicies = typeof orgRow.policies === 'string' ? JSON.parse(orgRow.policies) : (orgRow.policies || {});
  const rawCatalogPolicy = typeof orgRow.catalog_policy === 'string' ? JSON.parse(orgRow.catalog_policy) : (orgRow.catalog_policy || {});
  const rawFeatureFlags = typeof orgRow.feature_flags === 'string' ? JSON.parse(orgRow.feature_flags) : (orgRow.feature_flags || {});

  return {
    tenant: {
      id: orgRow.id,
      code: orgRow.code,
      slug: orgRow.slug || orgRow.id,
      name: orgRow.name,
    },
    branding: {
      storeName: rawBranding.storeName || orgRow.name,
      logoUrl: rawBranding.logoUrl || null,
      faviconUrl: rawBranding.faviconUrl || null,
      primaryColor: rawBranding.primaryColor || '#4f46e5',
      accentColor: rawBranding.accentColor || '#f59e0b',
      heroTitle: rawBranding.heroTitle || 'Modern Unified Commerce',
      heroSubtitle: rawBranding.heroSubtitle || 'Engineered for speed, reliability, and precision inventory.',
      trustBadges: Array.isArray(rawBranding.trustBadges) ? rawBranding.trustBadges : [
        { icon: 'Truck', title: 'Free Delivery', subtitle: 'On qualifying orders' },
        { icon: 'ShieldCheck', title: 'Official Warranty', subtitle: 'Guaranteed quality' },
        { icon: 'RotateCcw', title: 'Hassle-Free Returns', subtitle: 'Customer first policy' },
      ],
    },
    localization: {
      currencyCode: orgRow.currency_code || 'USD',
      currencySymbol: orgRow.currency_symbol || '$',
      locale: orgRow.locale || 'en-US',
      timezone: orgRow.timezone || 'UTC',
    },
    policies: {
      freeShippingThreshold: typeof rawPolicies.freeShippingThreshold === 'number' ? rawPolicies.freeShippingThreshold : 75.0,
      standardShippingFee: typeof rawPolicies.standardShippingFee === 'number' ? rawPolicies.standardShippingFee : 9.99,
      expressShippingFee: typeof rawPolicies.expressShippingFee === 'number' ? rawPolicies.expressShippingFee : 19.99,
      shippingPolicy: rawPolicies.shippingPolicy || 'Standard shipping delivers within 3-5 business days.',
      returnPolicy: rawPolicies.returnPolicy || 'Returns accepted within 30 days of receipt in original condition.',
      warrantyPolicy: rawPolicies.warrantyPolicy || 'Standard 1-year manufacturer warranty applies to all electronics.',
      deliveryPromise: rawPolicies.deliveryPromise || 'Orders placed before 2 PM dispatch same-day.',
      pickupEnabled: rawPolicies.pickupEnabled !== false,
      pickupInstructions: rawPolicies.pickupInstructions || 'Ready for pickup within 2 hours at your selected branch.',
    },
    catalogPolicy: {
      allowBackorders: Boolean(rawCatalogPolicy.allowBackorders),
      showInventoryCount: rawCatalogPolicy.showInventoryCount !== false,
      lowStockThreshold: typeof rawCatalogPolicy.lowStockThreshold === 'number' ? rawCatalogPolicy.lowStockThreshold : 5,
      defaultSort: rawCatalogPolicy.defaultSort || 'featured',
    },
    featureFlags: {
      reviewsEnabled: rawFeatureFlags.reviewsEnabled !== false,
      wishlistEnabled: rawFeatureFlags.wishlistEnabled !== false,
      couponsEnabled: rawFeatureFlags.couponsEnabled !== false,
      pickupEnabled: rawFeatureFlags.pickupEnabled !== false,
      guestCheckoutEnabled: rawFeatureFlags.guestCheckoutEnabled !== false,
      orderTrackingEnabled: rawFeatureFlags.orderTrackingEnabled !== false,
    },
    pickupLocations: locRes.rows.map((row: any) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      address: row.address,
      phone: row.phone,
      is_pos_enabled: row.is_pos_enabled,
      is_active: row.is_active,
    })),
  };
}
