import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storefrontApi } from '../services/storefrontApi';

export interface StorefrontBranding {
  storeName?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  announcement?: string;
}

export interface StorefrontPolicies {
  freeShippingThreshold?: number;
  returnWindowDays?: number;
  [key: string]: unknown;
}

export interface StorefrontTenantConfig {
  id: string;
  name: string;
  code: string;
  slug: string;
  customDomain?: string | null;
  currency: { code: string; symbol: string };
  locale: string;
  timezone: string;
  branding: StorefrontBranding;
  policies: StorefrontPolicies;
  catalogPolicy: Record<string, unknown>;
  featureFlags: Record<string, boolean>;
  locations: Array<{ id: string; name: string; type?: string; isActive?: boolean }>;
}

export interface StorefrontCartItem {
  variantId: string;
  quantity: number;
}

interface StorefrontContextValue {
  tenant: StorefrontTenantConfig | null;
  loading: boolean;
  error: string | null;
  cart: StorefrontCartItem[];
  wishlist: string[];
  refreshTenant: () => Promise<void>;
  setCart: React.Dispatch<React.SetStateAction<StorefrontCartItem[]>>;
  setWishlist: React.Dispatch<React.SetStateAction<string[]>>;
  toggleWishlist: (productId: string) => void;
  formatCurrency: (amount: number) => string;
  api: typeof storefrontApi;
}

const StorefrontContext = createContext<StorefrontContextValue | undefined>(undefined);

const storageKey = (tenantId: string, kind: string) => `abacha_storefront_${tenantId}_${kind}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export const StorefrontProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<StorefrontTenantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<StorefrontCartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);

  const resolveContextUrl = useCallback(() => {
    const segments = window.location.pathname.split('/').filter(Boolean);
    const tenantSlug = segments[0] === 'store' ? segments[1] : undefined;
    return tenantSlug
      ? `/api/storefront/${encodeURIComponent(tenantSlug)}/context`
      : '/api/storefront/context';
  }, []);

  const refreshTenant = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(resolveContextUrl(), {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || body?.message || 'Storefront is unavailable.');
      }
      const body = await response.json();
      const data = (body?.data ?? body?.context ?? body) as Record<string, unknown>;
      const tenantRecord = data.tenant as Record<string, unknown> | undefined;
      const localization = data.localization as Record<string, unknown> | undefined;
      const nextTenant: StorefrontTenantConfig = {
        id: String(tenantRecord?.id || ''),
        name: String(tenantRecord?.name || ''),
        code: String(tenantRecord?.code || ''),
        slug: String(tenantRecord?.slug || ''),
        customDomain: (tenantRecord?.customDomain as string | null | undefined) ?? null,
        currency: {
          code: String(localization?.currencyCode || ''),
          symbol: String(localization?.currencySymbol || ''),
        },
        locale: String(localization?.locale || 'en-US'),
        timezone: String(localization?.timezone || 'UTC'),
        branding: (data.branding || {}) as StorefrontBranding,
        policies: (data.policies || {}) as StorefrontPolicies,
        catalogPolicy: (data.catalogPolicy || {}) as Record<string, unknown>,
        featureFlags: (data.featureFlags || {}) as Record<string, boolean>,
        locations: Array.isArray(data.pickupLocations) ? data.pickupLocations as StorefrontTenantConfig['locations'] : [],
      };
      if (!nextTenant.id || !nextTenant.slug) throw new Error('Invalid storefront context received from server.');
      setTenant(nextTenant);
    } catch (err) {
      setTenant(null);
      setError(err instanceof Error ? err.message : 'Unable to load storefront.');
    } finally {
      setLoading(false);
    }
  }, [resolveContextUrl]);

  useEffect(() => { void refreshTenant(); }, [refreshTenant]);

  useEffect(() => {
    if (!tenant) {
      setCart([]);
      setWishlist([]);
      return;
    }
    setCart(readJson(storageKey(tenant.id, 'cart'), []));
    setWishlist(readJson(storageKey(tenant.id, 'wishlist'), []));
  }, [tenant]);

  useEffect(() => {
    if (tenant) window.localStorage.setItem(storageKey(tenant.id, 'cart'), JSON.stringify(cart));
  }, [tenant, cart]);

  useEffect(() => {
    if (tenant) window.localStorage.setItem(storageKey(tenant.id, 'wishlist'), JSON.stringify(wishlist));
  }, [tenant, wishlist]);

  const toggleWishlist = useCallback((productId: string) => {
    setWishlist(current => current.includes(productId)
      ? current.filter(id => id !== productId)
      : [...current, productId]);
  }, []);

  const formatCurrency = useCallback((amount: number) => {
    if (!tenant) return String(amount);
    return new Intl.NumberFormat(tenant.locale || 'en-US', {
      style: 'currency',
      currency: tenant.currency.code,
      currencyDisplay: 'symbol',
    }).format(amount);
  }, [tenant]);

  const value = useMemo(() => ({
    tenant, loading, error, cart, wishlist, refreshTenant, setCart, setWishlist, toggleWishlist, formatCurrency, api: storefrontApi,
  }), [tenant, loading, error, cart, wishlist, refreshTenant, toggleWishlist, formatCurrency]);

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
};

export function useStorefront() {
  const context = useContext(StorefrontContext);
  if (!context) throw new Error('useStorefront must be used inside StorefrontProvider');
  return context;
}
