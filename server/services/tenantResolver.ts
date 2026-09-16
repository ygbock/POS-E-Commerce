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

export interface TenantLocalization {
  currencyCode: string;
  currencySymbol: string;
  locale: string;
  timezone: string;
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
  isPosEnabled: boolean;
}

export interface TenantStorefrontConfig {
  tenant: {
    id: string;
    name: string;
    code: string;
    slug: string;
    customDomain: string | null;
    isActive: boolean;
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
 * Determines whether reverse-proxy forwarding headers (X-Forwarded-Host, X-Tenant-Domain)
 * should be trusted for the current request.
 * 
 * TRUST MODEL:
 * In production / staging:
 * - Forwarding headers are UNTRUSTED by default to protect against client spoofing.
 * - Only trusted if TRUST_PROXY is explicitly enabled ('true' or '1') in environment configuration,
 *   signaling that an upstream edge proxy (e.g., Render, AWS ALB, Cloudflare) sanitizes client headers.
 * - X-Tenant-Domain is a private internal gateway header and is only honored if ALLOW_TENANT_DOMAIN_HEADER === 'true'
 *   AND TRUST_PROXY is enabled.
 * 
 * In development / test:
 * - Forwarding headers are trusted by default to facilitate local multi-domain emulation,
 *   UNLESS SIMULATE_UNTRUSTED_PROXY === 'true' or TRUST_PROXY === 'false'.
 */
export function isProxyTrusted(req?: Request): boolean {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  const trustProxyEnv = (process.env.TRUST_PROXY || '').toLowerCase().trim();

  if (trustProxyEnv === 'false' || trustProxyEnv === '0') {
    return false;
  }

  if (env === 'production' || env === 'staging') {
    return trustProxyEnv === 'true' || trustProxyEnv === '1';
  }

  if (process.env.SIMULATE_UNTRUSTED_PROXY === 'true') {
    return false;
  }

  return true;
}

export function isTenantDomainHeaderAllowed(): boolean {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  if (env === 'production' || env === 'staging') {
    return process.env.ALLOW_TENANT_DOMAIN_HEADER === 'true';
  }
  return process.env.SIMULATE_UNTRUSTED_PROXY !== 'true';
}

/**
 * Checks whether a given host represents the canonical platform entry point.
 * In production:
 * - localhost and 127.0.0.1 are NOT canonical platform hosts unless explicitly configured in APP_URL or CANONICAL_STOREFRONT_HOST.
 * - Only shop.abacha.com or explicitly configured CANONICAL_STOREFRONT_HOST / APP_URL are canonical.
 */
export function isCanonicalPlatformHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const rawHost = hostHeader.split(':')[0].toLowerCase().trim();
  const env = (process.env.NODE_ENV || 'development').toLowerCase();

  const canonicalAppUrl = process.env.APP_URL 
    ? process.env.APP_URL.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].toLowerCase() 
    : null;
  const explicitCanonicalHost = process.env.CANONICAL_STOREFRONT_HOST 
    ? process.env.CANONICAL_STOREFRONT_HOST.toLowerCase().trim() 
    : null;

  if (env === 'production') {
    return (
      rawHost === 'shop.abacha.com' ||
      (explicitCanonicalHost !== null && rawHost === explicitCanonicalHost) ||
      (canonicalAppUrl !== null && rawHost === canonicalAppUrl)
    );
  }

  return (
    rawHost === 'localhost' ||
    rawHost === '127.0.0.1' ||
    rawHost === 'shop.abacha.com' ||
    rawHost === 'abacha-app.onrender.com' ||
    (explicitCanonicalHost !== null && rawHost === explicitCanonicalHost) ||
    (canonicalAppUrl !== null && rawHost === canonicalAppUrl)
  );
}

/**
 * Resolves the authoritative multi-tenant storefront context for an incoming public request.
 * 
 * FAIL-CLOSED INVARIANTS:
 * 1. An explicit identifier (slug, custom domain, or query override) that cannot be found MUST throw HTTP 404.
 * 2. An inactive organization MUST throw HTTP 404 (Store Unavailable).
 * 3. A mismatched custom domain/host + path slug MUST fail closed with HTTP 400 (TENANT_MISMATCH).
 * 4. Production query parameters MUST NOT switch the tenant context.
 * 5. Default fallback to 'org_default' is allowed ONLY on the canonical entry point without an explicit tenant identifier.
 * 6. Reverse proxy headers (X-Forwarded-Host, X-Tenant-Domain) are strictly ignored when untrusted.
 */
export async function resolveStorefrontTenant(
  req: Request,
  dbClient?: DatabaseClient,
  options?: { explicitSlug?: string }
): Promise<TenantStorefrontConfig> {
  const db = dbClient || getDatabaseClient();

  // 1. Resolve host header subject to reverse-proxy trust boundary
  const proxyTrusted = isProxyTrusted(req);
  let rawHostHeader = req.headers.host || '';

  if (proxyTrusted) {
    const forwardedHost = req.headers['x-forwarded-host'] as string | undefined;
    const tenantDomain = isTenantDomainHeaderAllowed()
      ? (req.headers['x-tenant-domain'] as string | undefined)
      : undefined;
    rawHostHeader = tenantDomain || forwardedHost || req.headers.host || '';
  }

  const hostHeader = rawHostHeader.split(',')[0].split(':')[0].toLowerCase().trim();
  const rawQueryTenant = (req.query.tenant || req.query.store) as string | undefined;
  const explicitSlug = (options?.explicitSlug || req.params.tenantSlug || '').trim().toLowerCase();

  let targetSlug: string | null = null;
  let targetDomain: string | null = null;
  let hostIdentifiedSlug: string | null = null;
  let hostIdentifiedDomain: string | null = null;

  // 2. Identify host-level tenant binding (if any)
  if (hostHeader && !isCanonicalPlatformHost(hostHeader)) {
    if (hostHeader.endsWith('.abacha.com') || hostHeader.endsWith('.abacha.test')) {
      const sub = hostHeader.split('.')[0];
      if (sub && sub !== 'www' && sub !== 'shop' && sub !== 'api') {
        hostIdentifiedSlug = sub;
      }
    } else {
      hostIdentifiedDomain = hostHeader;
    }
  }

  // 3. Environment-Gated Query Parameter Override
  if (rawQueryTenant && typeof rawQueryTenant === 'string' && rawQueryTenant.trim() !== '') {
    if (isQueryTenantOverridePermitted()) {
      targetSlug = rawQueryTenant.trim().toLowerCase();
    }
  }

  // 4. Explicit Path Slug (e.g. /api/storefront/:tenantSlug/...)
  let hasExplicitPathSlug = false;
  if (!targetSlug && explicitSlug && explicitSlug !== '' && explicitSlug !== 'auto') {
    targetSlug = explicitSlug;
    hasExplicitPathSlug = true;
  }

  // 5. Host Binding (Subdomain or Custom Domain)
  if (!targetSlug) {
    if (hostIdentifiedSlug) {
      targetSlug = hostIdentifiedSlug;
    } else if (hostIdentifiedDomain) {
      targetDomain = hostIdentifiedDomain;
    }
  }

  // 6. Canonical Default Entry Point Fallback
  // ONLY permitted if NO explicit identifier (query, path slug, subdomain, custom domain) was supplied
  if (!targetSlug && !targetDomain) {
    if (isCanonicalPlatformHost(hostHeader) || !hostHeader) {
      targetSlug = 'default';
    } else {
      // Unknown host that is not canonical platform host -> fail closed!
      throw new ApiError('DOMAIN_NOT_FOUND', `Store not found for domain '${hostHeader}'.`, 404);
    }
  }

  // 7. Query Organization from Database
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

  // 8. Fail-Closed Inactive Verification
  if (!orgRow.is_active) {
    throw new ApiError('TENANT_INACTIVE', 'Store is temporarily unavailable.', 404);
  }

  // 9. Host vs Path Conflict Detection (Fail-Closed)
  // If request has both an explicit path slug AND a host-level tenant binding, they MUST match!
  if (hasExplicitPathSlug && (hostIdentifiedDomain || hostIdentifiedSlug)) {
    if (hostIdentifiedDomain && orgRow.custom_domain !== hostIdentifiedDomain) {
      throw new ApiError('TENANT_MISMATCH', `Store domain '${hostIdentifiedDomain}' does not match path '${explicitSlug}'.`, 400);
    }
    if (hostIdentifiedSlug && orgRow.slug !== hostIdentifiedSlug && orgRow.id !== hostIdentifiedSlug) {
      throw new ApiError('TENANT_MISMATCH', `Store host '${hostHeader}' does not match path '${explicitSlug}'.`, 400);
    }
  }

  // 10. Fetch Active Pickup / Store Locations for Tenant
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
      name: orgRow.name,
      code: orgRow.code,
      slug: orgRow.slug || orgRow.id,
      customDomain: orgRow.custom_domain || null,
      isActive: orgRow.is_active,
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
      freeShippingThreshold: Number(rawPolicies.freeShippingThreshold ?? 75.00),
      standardShippingFee: Number(rawPolicies.standardShippingFee ?? 9.99),
      expressShippingFee: Number(rawPolicies.expressShippingFee ?? 19.99),
      shippingPolicy: rawPolicies.shippingPolicy || 'Standard shipping delivers within 3-5 business days.',
      returnPolicy: rawPolicies.returnPolicy || 'Returns accepted within 30 days of receipt in original condition.',
      warrantyPolicy: rawPolicies.warrantyPolicy || 'Standard 1-year manufacturer warranty applies to all electronics.',
      deliveryPromise: rawPolicies.deliveryPromise || 'Orders placed before 2 PM dispatch same-day.',
      pickupEnabled: Boolean(rawPolicies.pickupEnabled ?? true),
      pickupInstructions: rawPolicies.pickupInstructions || 'Ready for pickup within 2 hours at your selected branch.',
    },
    catalogPolicy: {
      allowBackorders: Boolean(rawCatalogPolicy.allowBackorders ?? false),
      showInventoryCount: Boolean(rawCatalogPolicy.showInventoryCount ?? true),
      lowStockThreshold: Number(rawCatalogPolicy.lowStockThreshold ?? 5),
      defaultSort: rawCatalogPolicy.defaultSort || 'featured',
    },
    featureFlags: {
      reviewsEnabled: Boolean(rawFeatureFlags.reviewsEnabled ?? true),
      wishlistEnabled: Boolean(rawFeatureFlags.wishlistEnabled ?? true),
      couponsEnabled: Boolean(rawFeatureFlags.couponsEnabled ?? true),
      pickupEnabled: Boolean(rawFeatureFlags.pickupEnabled ?? true),
      guestCheckoutEnabled: Boolean(rawFeatureFlags.guestCheckoutEnabled ?? true),
      orderTrackingEnabled: Boolean(rawFeatureFlags.orderTrackingEnabled ?? true),
    },
    pickupLocations: locRes.rows.map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type,
      address: r.address,
      phone: r.phone,
      isPosEnabled: Boolean(r.is_pos_enabled),
    })),
  };
}
