import { DatabaseClient, getDatabaseClient } from '../db/client';

export interface CategoryRecord {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon_name?: string | null;
  accent_color?: string | null;
  subcategories?: string[];
  display_order?: number;
  is_pos_quick_access?: boolean;
  parent_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BrandRecord {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  country_of_origin?: string | null;
  website?: string | null;
  description?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ProductRecord {
  id: string;
  organization_id: string;
  category_id?: string | null;
  brand_id?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  short_description?: string | null;
  unit_code: string;
  product_type?: 'standard' | 'variant' | 'bundle' | 'composite';
  status?: 'active' | 'inactive' | 'discontinued';
  channels_pos?: boolean;
  channels_ecommerce?: boolean;
  channels_wholesale?: boolean;
  is_bundle?: boolean;
  bundle_items?: any[];
  is_composite?: boolean;
  bom_items?: any[];
  assembly_labor_cost?: number;
  is_track_serial?: boolean;
  is_track_batch?: boolean;
  tax_rate?: number;
  rating?: number;
  review_count?: number;
  tags?: string[];
  images?: string[];
  featured?: boolean;
  compare_at_price?: number | null;
  sales_count?: number;
  specifications?: any[];
  created_at?: string;
  updated_at?: string;
}

export interface ProductVariantRecord {
  id: string;
  organization_id: string;
  product_id: string;
  sku: string;
  barcode: string;
  qr_code?: string | null;
  name: string;
  attributes?: Record<string, any>;
  cost_price: number;
  retail_price: number;
  wholesale_price?: number;
  member_price?: number;
  min_selling_price?: number;
  weight_kg?: number | null;
  dimensions?: any;
  low_stock_threshold?: number;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export class CatalogRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  // Categories
  async listCategories(orgId = 'org_default', client?: DatabaseClient): Promise<CategoryRecord[]> {
    const db = this.getClient(client);
    const res = await db.query<CategoryRecord>(
      'SELECT * FROM categories WHERE organization_id = $1 ORDER BY display_order ASC, name ASC',
      [orgId]
    );
    return res.rows;
  }

  async findCategoryById(id: string, orgIdOrClient?: string | DatabaseClient, client?: DatabaseClient): Promise<CategoryRecord | null> {
    const orgId = typeof orgIdOrClient === 'string' ? orgIdOrClient : undefined;
    const db = this.getClient(typeof orgIdOrClient === 'object' ? orgIdOrClient : client);
    const query = orgId
      ? 'SELECT * FROM categories WHERE id = $1 AND organization_id = $2'
      : 'SELECT * FROM categories WHERE id = $1';
    const params = orgId ? [id, orgId] : [id];
    const res = await db.query<CategoryRecord>(query, params);
    return res.rows[0] || null;
  }

  async createCategory(data: CategoryRecord, client?: DatabaseClient): Promise<CategoryRecord> {
    const db = this.getClient(client);
    const res = await db.query<CategoryRecord>(
      `INSERT INTO categories (
        id, organization_id, name, slug, description, icon_name, accent_color,
        subcategories, display_order, is_pos_quick_access, parent_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        data.id,
        data.organization_id || 'org_default',
        data.name,
        data.slug,
        data.description || null,
        data.icon_name || null,
        data.accent_color || null,
        JSON.stringify(data.subcategories || []),
        data.display_order ?? 0,
        data.is_pos_quick_access ?? false,
        data.parent_id || null,
      ]
    );
    return res.rows[0];
  }

  // Brands
  async listBrands(orgId = 'org_default', client?: DatabaseClient): Promise<BrandRecord[]> {
    const db = this.getClient(client);
    const res = await db.query<BrandRecord>(
      'SELECT * FROM brands WHERE organization_id = $1 ORDER BY name ASC',
      [orgId]
    );
    return res.rows;
  }

  async findBrandById(id: string, orgIdOrClient?: string | DatabaseClient, client?: DatabaseClient): Promise<BrandRecord | null> {
    const orgId = typeof orgIdOrClient === 'string' ? orgIdOrClient : undefined;
    const db = this.getClient(typeof orgIdOrClient === 'object' ? orgIdOrClient : client);
    const query = orgId
      ? 'SELECT * FROM brands WHERE id = $1 AND organization_id = $2'
      : 'SELECT * FROM brands WHERE id = $1';
    const params = orgId ? [id, orgId] : [id];
    const res = await db.query<BrandRecord>(query, params);
    return res.rows[0] || null;
  }

  async createBrand(data: BrandRecord, client?: DatabaseClient): Promise<BrandRecord> {
    const db = this.getClient(client);
    const res = await db.query<BrandRecord>(
      `INSERT INTO brands (
        id, organization_id, name, slug, logo_url, country_of_origin, website, description, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        data.id,
        data.organization_id || 'org_default',
        data.name,
        data.slug,
        data.logo_url || null,
        data.country_of_origin || null,
        data.website || null,
        data.description || null,
        data.is_active ?? true,
      ]
    );
    return res.rows[0];
  }

  // Products & Variants
  async listProducts(
    options: {
      orgId?: string;
      categoryId?: string;
      brandId?: string;
      status?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
    client?: DatabaseClient
  ): Promise<ProductRecord[]> {
    const db = this.getClient(client);
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [options.orgId || 'org_default'];

    if (options.categoryId) {
      params.push(options.categoryId);
      conditions.push(`category_id = $${params.length}`);
    }
    if (options.brandId) {
      params.push(options.brandId);
      conditions.push(`brand_id = $${params.length}`);
    }
    if (options.status) {
      params.push(options.status);
      conditions.push(`status = $${params.length}`);
    }
    if (options.search) {
      params.push(`%${options.search}%`);
      conditions.push(`(name ILIKE $${params.length} OR slug ILIKE $${params.length})`);
    }

    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const query = `
      SELECT * FROM products
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const res = await db.query<ProductRecord>(query, params);
    return res.rows;
  }

  async findProductById(id: string, orgIdOrClient?: string | DatabaseClient, client?: DatabaseClient): Promise<ProductRecord | null> {
    const orgId = typeof orgIdOrClient === 'string' ? orgIdOrClient : undefined;
    const db = this.getClient(typeof orgIdOrClient === 'object' ? orgIdOrClient : client);
    const query = orgId
      ? 'SELECT * FROM products WHERE id = $1 AND organization_id = $2'
      : 'SELECT * FROM products WHERE id = $1';
    const params = orgId ? [id, orgId] : [id];
    const res = await db.query<ProductRecord>(query, params);
    return res.rows[0] || null;
  }

  async findProductBySlug(slug: string, orgId = 'org_default', client?: DatabaseClient): Promise<ProductRecord | null> {
    const db = this.getClient(client);
    const res = await db.query<ProductRecord>(
      'SELECT * FROM products WHERE slug = $1 AND organization_id = $2',
      [slug, orgId]
    );
    return res.rows[0] || null;
  }

  async createProductWithVariants(
    product: ProductRecord,
    variants: ProductVariantRecord[],
    client?: DatabaseClient
  ): Promise<{ product: ProductRecord; variants: ProductVariantRecord[] }> {
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      const prodRes = await tx.query<ProductRecord>(
        `INSERT INTO products (
          id, organization_id, category_id, brand_id, name, slug, description, short_description,
          unit_code, product_type, status, channels_pos, channels_ecommerce, channels_wholesale,
          is_bundle, bundle_items, is_composite, bom_items, assembly_labor_cost, is_track_serial,
          is_track_batch, tax_rate, rating, review_count, tags, images, featured, compare_at_price,
          sales_count, specifications
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
        ) RETURNING *`,
        [
          product.id,
          product.organization_id || 'org_default',
          product.category_id || null,
          product.brand_id || null,
          product.name,
          product.slug,
          product.description || null,
          product.short_description || null,
          product.unit_code,
          product.product_type || 'standard',
          product.status || 'active',
          product.channels_pos ?? true,
          product.channels_ecommerce ?? true,
          product.channels_wholesale ?? false,
          product.is_bundle ?? false,
          JSON.stringify(product.bundle_items || []),
          product.is_composite ?? false,
          JSON.stringify(product.bom_items || []),
          product.assembly_labor_cost ?? 0,
          product.is_track_serial ?? false,
          product.is_track_batch ?? false,
          product.tax_rate ?? 0,
          product.rating ?? 0,
          product.review_count ?? 0,
          JSON.stringify(product.tags || []),
          JSON.stringify(product.images || []),
          product.featured ?? false,
          product.compare_at_price || null,
          product.sales_count ?? 0,
          JSON.stringify(product.specifications || []),
        ]
      );

      const createdVariants: ProductVariantRecord[] = [];
      for (const variant of variants) {
        const varRes = await tx.query<ProductVariantRecord>(
          `INSERT INTO product_variants (
            id, organization_id, product_id, sku, barcode, qr_code, name, attributes,
            cost_price, retail_price, wholesale_price, member_price, min_selling_price,
            weight_kg, dimensions, low_stock_threshold, image_url
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
          ) RETURNING *`,
          [
            variant.id,
            variant.organization_id || product.organization_id || 'org_default',
            product.id,
            variant.sku,
            variant.barcode,
            variant.qr_code || null,
            variant.name,
            JSON.stringify(variant.attributes || {}),
            variant.cost_price,
            variant.retail_price,
            variant.wholesale_price ?? variant.retail_price,
            variant.member_price ?? variant.retail_price,
            variant.min_selling_price ?? variant.cost_price,
            variant.weight_kg || null,
            variant.dimensions ? JSON.stringify(variant.dimensions) : null,
            variant.low_stock_threshold ?? 10,
            variant.image_url || null,
          ]
        );
        createdVariants.push(varRes.rows[0]);
      }

      return {
        product: prodRes.rows[0],
        variants: createdVariants,
      };
    });
  }

  async findVariantsByProductId(productId: string, orgIdOrClient?: string | DatabaseClient, client?: DatabaseClient): Promise<ProductVariantRecord[]> {
    const orgId = typeof orgIdOrClient === 'string' ? orgIdOrClient : undefined;
    const db = this.getClient(typeof orgIdOrClient === 'object' ? orgIdOrClient : client);
    const query = orgId
      ? 'SELECT * FROM product_variants WHERE product_id = $1 AND organization_id = $2 ORDER BY name ASC'
      : 'SELECT * FROM product_variants WHERE product_id = $1 ORDER BY name ASC';
    const params = orgId ? [productId, orgId] : [productId];
    const res = await db.query<ProductVariantRecord>(query, params);
    return res.rows;
  }

  async findVariantBySku(sku: string, orgId = 'org_default', client?: DatabaseClient): Promise<ProductVariantRecord | null> {
    const db = this.getClient(client);
    const res = await db.query<ProductVariantRecord>(
      'SELECT * FROM product_variants WHERE sku = $1 AND organization_id = $2',
      [sku, orgId]
    );
    return res.rows[0] || null;
  }

  async findVariantByBarcode(barcode: string, orgId = 'org_default', client?: DatabaseClient): Promise<ProductVariantRecord | null> {
    const db = this.getClient(client);
    const res = await db.query<ProductVariantRecord>(
      'SELECT * FROM product_variants WHERE barcode = $1 AND organization_id = $2',
      [barcode, orgId]
    );
    return res.rows[0] || null;
  }
}
