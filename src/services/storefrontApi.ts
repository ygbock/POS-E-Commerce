import type { StorefrontTenantConfig } from '../context/StorefrontContext';

export interface StorefrontCartItem {
  variantId: string;
  quantity: number | string;
}

export interface StorefrontPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

export interface StorefrontProductVariant {
  id: string;
  sku?: string;
  barcode?: string | null;
  name?: string;
  attributes?: Record<string, unknown>;
  retailPrice?: string;
  retail_price?: string;
  compareAtPrice?: string | null;
  imageUrl?: string | null;
  availableStock: number;
  isOutOfStock?: boolean;
  locationBalances?: Array<{
    locationId: string;
    locationCode: string;
    locationName: string;
    available: number;
  }>;
}

export interface StorefrontProduct {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description?: string | null;
  shortDescription?: string | null;
  category: string;
  categorySlug: string;
  brand: string;
  brandSlug: string;
  rating: number;
  reviewCount: number;
  tags: string[];
  images: string[];
  featured: boolean;
  compareAtPrice?: number | null;
  salesCount: number;
  variants: StorefrontProductVariant[];
  primaryVariant?: StorefrontProductVariant | null;
  availableStock: number;
  isOutOfStock: boolean;
}

export interface StorefrontContextResponse {
  tenant: { id: string; name: string; code: string; slug: string; customDomain?: string | null };
  localization: { currencyCode: string; currencySymbol: string; locale: string; timezone: string };
  branding: StorefrontTenantConfig['branding'];
  policies: StorefrontTenantConfig['policies'];
  catalogPolicy: Record<string, unknown>;
  featureFlags: Record<string, boolean>;
  pickupLocations: StorefrontTenantConfig['pickupLocations'];
}

export interface StorefrontProductQuery {
  category?: string;
  brand?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
  sortBy?: 'featured' | 'price-low' | 'price-high' | 'rating' | 'best-sellers' | 'newest';
  page?: number;
  limit?: number;
}

export interface StorefrontProductList {
  products: StorefrontProduct[];
  pagination: StorefrontPagination;
}

export interface StorefrontCartValidation {
  items: Array<{
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
  }>;
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
export class StorefrontApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = 'STOREFRONT_API_ERROR', status = 500) {
    super(message);
    this.name = 'StorefrontApiError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
    credentials: 'same-origin',
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error;
    throw new StorefrontApiError(
      error?.message || body?.message || 'Storefront request failed.',
      error?.code || 'STOREFRONT_API_ERROR',
      response.status,
    );
  }

  return (body?.data ?? body) as T;
}

const tenantBase = (tenantSlug?: string) =>
  tenantSlug
    ? `/api/storefront/${encodeURIComponent(tenantSlug)}`
    : '/api/storefront';

export const storefrontApi = {
  getContext(tenantSlug?: string) {
    return request<StorefrontContextResponse>(`${tenantBase(tenantSlug)}/context`);
  },

  getCategories(tenantSlug: string) {
    return request<unknown[]>(`${tenantBase(tenantSlug)}/categories`);
  },

  getBrands(tenantSlug: string) {
    return request<unknown[]>(`${tenantBase(tenantSlug)}/brands`);
  },

  getLocations(tenantSlug: string) {
    return request<StorefrontTenantConfig['pickupLocations']>(`${tenantBase(tenantSlug)}/locations`);
  },

  getProducts(tenantSlug: string, query: StorefrontProductQuery = {}) {
    const params = new URLSearchParams();
    if (query.category && query.category !== 'All') params.set('category', query.category);
    if (query.brand && query.brand !== 'All') params.set('brand', query.brand);
    if (query.search?.trim()) params.set('search', query.search.trim());
    if (query.minPrice !== undefined) params.set('minPrice', String(query.minPrice));
    if (query.maxPrice !== undefined) params.set('maxPrice', String(query.maxPrice));
    if (query.inStock !== undefined) params.set('inStock', String(query.inStock));
    if (query.onSale !== undefined) params.set('onSale', String(query.onSale));
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.limit !== undefined) params.set('limit', String(query.limit));

    return request<{
      products: StorefrontProduct[];
      data?: StorefrontProduct[];
      pagination: StorefrontPagination;
    }>(`${tenantBase(tenantSlug)}/products?${params.toString()}`).then((body) => ({
      products: body.products || body.data || [],
      pagination: body.pagination,
    }));
  },

  getProduct(tenantSlug: string, slugOrId: string) {
    return request<StorefrontProduct>(
      `${tenantBase(tenantSlug)}/products/${encodeURIComponent(slugOrId)}`,
    );
  },

  validateCart(tenantSlug: string, items: StorefrontCartItem[], fulfillmentLocationId?: string) {
    return request<StorefrontCartValidation>(
      `${tenantBase(tenantSlug)}/cart/validate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item) => ({
            variantId: item.variantId,
            quantity: String(item.quantity),
          })),
          ...(fulfillmentLocationId ? { fulfillmentLocationId } : {}),
        }),
      },
    );
  },
};
