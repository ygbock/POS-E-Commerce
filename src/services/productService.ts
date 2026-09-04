import { Product, ProductVariant, CatalogAttribute } from '../types';
import { authClient } from './authClient';

export interface ProductListResponse {
  success: boolean;
  count: number;
  total: number;
  page: number;
  totalPages: number;
  data: Product[];
}

export interface SkuLookupResponse {
  success: boolean;
  found: boolean;
  product?: {
    id: string;
    name: string;
    brand: string;
    category: string;
    taxRate: number;
    channels?: { pos: boolean; ecommerce: boolean; wholesale: boolean };
  };
  variant?: ProductVariant;
  totalStock?: number;
  stockByLocation?: Record<string, number>;
  error?: string;
}

export interface SyncStatusResponse {
  success: boolean;
  serviceName: string;
  isSingleSourceOfTruth: boolean;
  catalogMetrics: {
    totalProducts: number;
    totalVariants: number;
    totalCategories: number;
    totalBrands: number;
    totalAttributes: number;
  };
  moduleIntegrations: Array<{
    name: string;
    status: string;
    lastPing: string;
    latencyMs: number;
  }>;
  recentAuditLogs: Array<{
    id: string;
    timestamp: string;
    action: string;
    target: string;
    affectedModules: string[];
    status: string;
  }>;
}

class ProductService {
  private baseUrl = '/api';

  /**
   * Fetch products with optional filtering parameters
   */
  async getProducts(params?: {
    category?: string;
    brand?: string;
    search?: string;
    channel?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<ProductListResponse> {
    const query = new URLSearchParams();
    if (params?.category) query.append('category', params.category);
    if (params?.brand) query.append('brand', params.brand);
    if (params?.search) query.append('search', params.search);
    if (params?.channel) query.append('channel', params.channel);
    if (params?.status) query.append('status', params.status);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.limit) query.append('limit', params.limit.toString());

    const res = await fetch(`${this.baseUrl}/products?${query.toString()}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch products: ${res.statusText}`);
    }
    return res.json();
  }

  /**
   * Fetch single product by ID or slug
   */
  async getProductById(id: string): Promise<{ success: boolean; data: Product }> {
    const res = await fetch(`${this.baseUrl}/products/${encodeURIComponent(id)}`);
    if (!res.ok) {
      throw new Error(`Product ${id} not found`);
    }
    return res.json();
  }

  /**
   * Create new product in master catalog
   */
  async createProduct(product: Partial<Product>): Promise<{ success: boolean; message: string; data: Product }> {
    const res = await fetch(`${this.baseUrl}/products`, {
      method: 'POST',
      headers: authClient.getAuthHeaders(),
      body: JSON.stringify(product),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to create product');
    }
    return res.json();
  }

  /**
   * Update existing product details
   */
  async updateProduct(id: string, product: Partial<Product>): Promise<{ success: boolean; message: string; data: Product }> {
    const res = await fetch(`${this.baseUrl}/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: authClient.getAuthHeaders(),
      body: JSON.stringify(product),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to update product');
    }
    return res.json();
  }

  /**
   * Delete product from master catalog
   */
  async deleteProduct(id: string): Promise<{ success: boolean; message: string; deletedId: string }> {
    const res = await fetch(`${this.baseUrl}/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authClient.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to delete product');
    }
    return res.json();
  }

  /**
   * Create new variant SKU for product
   */
  async createVariant(productId: string, variant: Partial<ProductVariant>): Promise<{ success: boolean; message: string; data: ProductVariant }> {
    const res = await fetch(`${this.baseUrl}/products/${encodeURIComponent(productId)}/variants`, {
      method: 'POST',
      headers: authClient.getAuthHeaders(),
      body: JSON.stringify(variant),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to create variant');
    }
    return res.json();
  }

  /**
   * Update variant SKU details
   */
  async updateVariant(productId: string, variantId: string, variant: Partial<ProductVariant>): Promise<{ success: boolean; message: string; data: ProductVariant }> {
    const res = await fetch(`${this.baseUrl}/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`, {
      method: 'PUT',
      headers: authClient.getAuthHeaders(),
      body: JSON.stringify(variant),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to update variant');
    }
    return res.json();
  }

  /**
   * Delete variant SKU
   */
  async deleteVariant(productId: string, variantId: string): Promise<{ success: boolean; message: string; deletedVariantId: string }> {
    const res = await fetch(`${this.baseUrl}/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`, {
      method: 'DELETE',
      headers: authClient.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to delete variant');
    }
    return res.json();
  }

  /**
   * SKU and Barcode lookup for POS & Inventory scanners
   */
  async lookupSkuOrBarcode(skuOrBarcode: string): Promise<SkuLookupResponse> {
    const res = await fetch(`${this.baseUrl}/skus/lookup/${encodeURIComponent(skuOrBarcode)}`, {
      headers: authClient.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'SKU not found' }));
      return { success: false, found: false, error: err.error || 'SKU not found' };
    }
    return res.json();
  }

  /**
   * Fetch catalog attributes master list
   */
  async getAttributes(): Promise<{ success: boolean; count: number; data: CatalogAttribute[] }> {
    const res = await fetch(`${this.baseUrl}/attributes`, {
      headers: authClient.getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error('Failed to fetch attributes');
    }
    return res.json();
  }

  /**
   * Create new catalog attribute
   */
  async createAttribute(attribute: Partial<CatalogAttribute>): Promise<{ success: boolean; message: string; data: CatalogAttribute }> {
    const res = await fetch(`${this.baseUrl}/attributes`, {
      method: 'POST',
      headers: authClient.getAuthHeaders(),
      body: JSON.stringify(attribute),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to create attribute');
    }
    return res.json();
  }

  /**
   * Update catalog attribute
   */
  async updateAttribute(id: string, attribute: Partial<CatalogAttribute>): Promise<{ success: boolean; message: string; data: CatalogAttribute }> {
    const res = await fetch(`${this.baseUrl}/attributes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: authClient.getAuthHeaders(),
      body: JSON.stringify(attribute),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to update attribute');
    }
    return res.json();
  }

  /**
   * Delete catalog attribute
   */
  async deleteAttribute(id: string): Promise<{ success: boolean; message: string; deletedId: string }> {
    const res = await fetch(`${this.baseUrl}/attributes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authClient.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to delete attribute');
    }
    return res.json();
  }

  /**
   * Get single source of truth sync status
   */
  async getSyncStatus(): Promise<SyncStatusResponse> {
    const res = await fetch(`${this.baseUrl}/catalog/sync-status`, {
      headers: authClient.getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error('Failed to fetch sync status');
    }
    return res.json();
  }

  /**
   * Trigger catalog force sync across POS, E-Commerce, and Inventory
   */
  async forceSync(action?: string, target?: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/catalog/sync`, {
      method: 'POST',
      headers: authClient.getAuthHeaders(),
      body: JSON.stringify({ action, target }),
    });
    if (!res.ok) {
      throw new Error('Sync failed');
    }
    return res.json();
  }
}

export const productService = new ProductService();
