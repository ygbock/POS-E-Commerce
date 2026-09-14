import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useStorefrontRoute } from '../router/StorefrontRouter';

export interface StorefrontTenantConfig {
  id: string; name: string; slug: string;
  currency: { code: string; symbol: string }; locale: string; timezone: string;
  branding: Record<string, unknown>; policies: Record<string, unknown>;
  catalogPolicy: Record<string, unknown>; featureFlags: Record<string, boolean>;
  pickupLocations: Array<{ id: string; code: string; name: string; type: string; address: string | null; phone: string | null; isPosEnabled: boolean }>;
}
export interface StoreCartItem {
  variantId: string;
  productId: string;
  name: string;
  variantName?: string;
  sku?: string;
  price: number;
  quantity: number;
  image?: string;
  maxStock?: number;
}

interface StorefrontContextValue {
  tenant: StorefrontTenantConfig | null; loading: boolean; error: string | null;
  cartToken: string | null; setCartToken: (token: string | null) => void;
  storeCart: StoreCartItem[];
  addToStoreCart: (
    product: { id: string; name: string; images?: string[] },
    variant: { id: string; name?: string; sku?: string; retailPrice?: number; retail_price?: string; imageUrl?: string },
    quantity?: number,
  ) => void;
  updateStoreCartQty: (variantId: string, quantity: number) => void;
  removeFromStoreCart: (variantId: string) => void;
  clearStoreCart: () => void;
  cartCount: number;
  wishlistIds: string[]; setWishlistIds: React.Dispatch<React.SetStateAction<string[]>>;
  formatCurrency: (amount: number) => string; reloadTenant: () => Promise<void>;
}
const Context = createContext<StorefrontContextValue | undefined>(undefined);
const key = (slug: string | undefined, suffix: string) => slug ? `storefront:${encodeURIComponent(slug)}:${suffix}` : null;
async function loadContext(slug?: string): Promise<StorefrontTenantConfig> {
  const path = slug ? `/api/storefront/${encodeURIComponent(slug)}/context` : '/api/storefront/context';
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || body?.message || 'Storefront unavailable');
  const data = body?.data ?? body?.context ?? body;
  if (!data?.tenant || !data?.localization) throw new Error('Invalid storefront context response');
  return {
    id: data.tenant.id,
    name: data.tenant.name,
    slug: data.tenant.slug,
    currency: { code: data.localization.currencyCode, symbol: data.localization.currencySymbol },
    locale: data.localization.locale,
    timezone: data.localization.timezone,
    branding: data.branding || {},
    policies: data.policies || {},
    catalogPolicy: data.catalogPolicy || {},
    featureFlags: data.featureFlags || {},
    pickupLocations: Array.isArray(data.pickupLocations) ? data.pickupLocations : [],
  };
}
export const StorefrontProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { route } = useStorefrontRoute(); const slug = route.tenantSlug;
  const [tenant, setTenant] = useState<StorefrontTenantConfig | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [cartToken, setCartTokenState] = useState<string | null>(null);
  const [storeCart, setStoreCart] = useState<StoreCartItem[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const reloadTenant = useCallback(async () => {
    setLoading(true); setError(null);
    try { setTenant(await loadContext(slug)); } catch (e) { setTenant(null); setError(e instanceof Error ? e.message : 'Storefront unavailable'); }
    finally { setLoading(false); }
  }, [slug]);
  useEffect(() => {
    void reloadTenant();
    const cartKey = key(slug, 'cart-token'), wishKey = key(slug, 'wishlist');
    setCartTokenState(cartKey ? window.localStorage.getItem(cartKey) : null);
    if (cartKey) {
      try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(cartKey) || '[]');
        setStoreCart(Array.isArray(parsed) ? parsed.filter((item): item is StoreCartItem =>
          !!item && typeof item === 'object' &&
          typeof (item as StoreCartItem).variantId === 'string' &&
          typeof (item as StoreCartItem).productId === 'string' &&
          typeof (item as StoreCartItem).name === 'string' &&
          typeof (item as StoreCartItem).price === 'number' &&
          typeof (item as StoreCartItem).quantity === 'number'
        ) : []);
      } catch { setStoreCart([]); }
    } else {
      setStoreCart([]);
    }
    if (!wishKey) { setWishlistIds([]); return; }
    try { const parsed: unknown = JSON.parse(window.localStorage.getItem(wishKey) || '[]'); setWishlistIds(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []); }
    catch { setWishlistIds([]); }
  }, [reloadTenant, slug]);
  const setCartToken = useCallback((token: string | null) => {
    setCartTokenState(token); const k = key(slug, 'cart-token'); if (!k) return;
    if (token) window.localStorage.setItem(k, token); else window.localStorage.removeItem(k);
  }, [slug]);
  useEffect(() => {
    const k = key(slug, 'cart');
    if (k) window.localStorage.setItem(k, JSON.stringify(storeCart));
  }, [slug, storeCart]);

  const addToStoreCart = useCallback((product: { id: string; name: string; images?: string[] }, variant: { id: string; name?: string; sku?: string; retailPrice?: number; retail_price?: string; imageUrl?: string }, quantity = 1) => {
    const price = Number(variant.retailPrice ?? variant.retail_price ?? 0);
    const safeQuantity = Math.max(1, Math.floor(quantity));
    setStoreCart(current => {
      const existing = current.find(item => item.variantId === variant.id);
      if (existing) return current.map(item => item.variantId === variant.id ? { ...item, quantity: item.quantity + safeQuantity, price } : item);
      return [...current, {
        variantId: variant.id, productId: product.id, name: product.name,
        variantName: variant.name, sku: variant.sku, price, quantity: safeQuantity,
        image: variant.imageUrl || product.images?.[0],
      }];
    });
  }, []);

  const updateStoreCartQty = useCallback((variantId: string, quantity: number) => {
    setStoreCart(current => quantity <= 0 ? current.filter(item => item.variantId !== variantId) : current.map(item => item.variantId === variantId ? { ...item, quantity: Math.floor(quantity) } : item));
  }, []);

  const removeFromStoreCart = useCallback((variantId: string) => {
    setStoreCart(current => current.filter(item => item.variantId !== variantId));
  }, []);

  const clearStoreCart = useCallback(() => setStoreCart([]), []);

  const cartCount = useMemo(() => storeCart.reduce((sum, item) => sum + item.quantity, 0), [storeCart]);

  const setCartToken = useCallback  const formatCurrency = useCallback((amount: number) => new Intl.NumberFormat(tenant?.locale || 'en-US', { style: 'currency', currency: tenant?.currency?.code || 'USD' }).format(amount), [tenant]);
  const value = useMemo(() => ({
    tenant, loading, error, cartToken, setCartToken, storeCart,
    addToStoreCart, updateStoreCartQty, removeFromStoreCart, clearStoreCart, cartCount,
    wishlistIds, setWishlistIds, formatCurrency, reloadTenant,
  }), [tenant, loading, error, cartToken, setCartToken, storeCart, addToStoreCart, updateStoreCartQty, removeFromStoreCart, clearStoreCart, cartCount, wishlistIds, formatCurrency, reloadTenant]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
};
export function useStorefrontContext(): StorefrontContextValue {
  const value = useContext(Context); if (!value) throw new Error('useStorefrontContext must be used within StorefrontProvider'); return value;
}
