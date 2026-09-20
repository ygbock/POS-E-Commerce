import { randomUUID } from 'node:crypto';
import { DatabaseClient, getDatabaseClient } from '../db/client.ts';

export type DiscoveryBusinessMode = 'DISCOVERY_ONLY' | 'DISCOVERY_AND_STORE';
export type DiscoveryListingStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'PAUSED' | 'SUSPENDED' | 'ARCHIVED';
export type DiscoveryVerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';

export interface DiscoveryBusinessRecord {
  id: string; public_id: string; organization_id: string | null; tenant_slug?: string | null; name: string; legal_name: string | null;
  slug: string; business_type: string | null; short_description: string | null; description: string | null;
  phone: string | null; email: string | null; whatsapp: string | null; website: string | null;
  logo_url: string | null; cover_image_url: string | null; business_mode: DiscoveryBusinessMode;
  listing_status: DiscoveryListingStatus; verification_status: DiscoveryVerificationStatus; is_discoverable: boolean;
  created_by_user_id: string | null; published_at: string | null; suspended_at: string | null; archived_at: string | null;
  created_at: string; updated_at: string;
}

export interface DiscoveryBusinessLocationRecord {
  id: string; business_id: string; name: string; location_type: string; address_line_1: string | null;
  address_line_2: string | null; city: string | null; district: string | null; region: string | null;
  country: string; postal_code: string | null; latitude: number | string | null; longitude: number | string | null;
  service_radius_km: number | string | null; phone: string | null; is_primary: boolean; is_active: boolean;
  created_at: string; updated_at: string;
}

export interface DiscoveryBusinessSettingsRecord {
  business_id: string; show_products: boolean; show_prices: boolean; show_stock_status: boolean;
  allow_phone_contact: boolean; allow_whatsapp_contact: boolean; allow_directions: boolean;
  allow_service_requests: boolean; allow_reviews: boolean; allow_public_store_link: boolean;
  created_at: string; updated_at: string;
}

export interface DiscoveryBusinessListFilter {
  categoryId?: string; city?: string; district?: string; region?: string; businessType?: string;
  verificationStatus?: DiscoveryVerificationStatus; limit?: number; offset?: number;
}

export class DiscoveryBusinessRepository {
  private readonly defaultClient: DatabaseClient;
  constructor(client?: DatabaseClient) { this.defaultClient = client || getDatabaseClient(); }
  private db(client?: DatabaseClient): DatabaseClient { return client || this.defaultClient; }

  async createBusiness(data: Omit<DiscoveryBusinessRecord, 'created_at' | 'updated_at' | 'published_at' | 'suspended_at' | 'archived_at'>, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    const result = await this.db(client).query<DiscoveryBusinessRecord>(
      `INSERT INTO discovery_businesses (id, public_id, organization_id, name, legal_name, slug, business_type,
       short_description, description, phone, email, whatsapp, website, logo_url, cover_image_url, business_mode,
       listing_status, verification_status, is_discoverable, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [data.id, data.public_id, data.organization_id, data.name, data.legal_name, data.slug, data.business_type,
       data.short_description, data.description, data.phone, data.email, data.whatsapp, data.website, data.logo_url,
       data.cover_image_url, data.business_mode, data.listing_status, data.verification_status, data.is_discoverable,
       data.created_by_user_id],
    );
    return result.rows[0];
  }

  async updateBusiness(id: string, patch: Partial<Pick<DiscoveryBusinessRecord,
    'organization_id' | 'name' | 'legal_name' | 'slug' | 'business_type' | 'short_description' | 'description' |
    'phone' | 'email' | 'whatsapp' | 'website' | 'logo_url' | 'cover_image_url' | 'business_mode' |
    'listing_status' | 'verification_status' | 'is_discoverable' | 'published_at' | 'suspended_at' | 'archived_at'>>, client?: DatabaseClient): Promise<DiscoveryBusinessRecord | null> {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
    if (!entries.length) return this.findById(id, client);
    const allowed = new Set(['organization_id','name','legal_name','slug','business_type','short_description','description','phone','email','whatsapp','website','logo_url','cover_image_url','business_mode','listing_status','verification_status','is_discoverable','published_at','suspended_at','archived_at']);
    if (entries.some(([key]) => !allowed.has(key))) throw new Error('DISCOVERY_INVALID_PATCH');
    const assignments = entries.map(([key], index) => `${key} = $${index + 2}`).join(', ');
    const result = await this.db(client).query<DiscoveryBusinessRecord>(
      `UPDATE discovery_businesses SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id, ...entries.map(([, value]) => value)],
    );
    return result.rows[0] || null;
  }

  async findById(id: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord | null> {
    const result = await this.db(client).query<DiscoveryBusinessRecord>('SELECT * FROM discovery_businesses WHERE id = $1', [id]);
    return result.rows[0] || null;
  }
  async findByPublicId(publicId: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord | null> {
    const result = await this.db(client).query<DiscoveryBusinessRecord>('SELECT * FROM discovery_businesses WHERE public_id = $1', [publicId]);
    return result.rows[0] || null;
  }
  async findBySlug(slug: string, options?: { publicOnly?: boolean }, client?: DatabaseClient): Promise<DiscoveryBusinessRecord | null> {
    const sql = options?.publicOnly !== false
      ? `SELECT b.*, o.slug AS tenant_slug FROM discovery_businesses b LEFT JOIN organizations o ON o.id = b.organization_id
         WHERE LOWER(b.slug) = LOWER($1) AND b.listing_status = 'PUBLISHED' AND b.is_discoverable = TRUE
           AND (b.organization_id IS NULL OR o.is_active = TRUE) LIMIT 1`
      : 'SELECT * FROM discovery_businesses WHERE LOWER(slug) = LOWER($1) LIMIT 1';
    const result = await this.db(client).query<DiscoveryBusinessRecord>(sql, [slug]);
    return result.rows[0] || null;
  }
  async slugExists(slug: string, excludeId?: string, client?: DatabaseClient): Promise<boolean> {
    const result = await this.db(client).query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM discovery_businesses WHERE LOWER(slug) = LOWER($1) AND ($2::varchar IS NULL OR id <> $2)) AS exists`,
      [slug, excludeId || null],
    );
    return Boolean(result.rows[0]?.exists);
  }
  async listPublished(filter: DiscoveryBusinessListFilter = {}, client?: DatabaseClient): Promise<DiscoveryBusinessRecord[]> {
    const clauses = [`b.listing_status = 'PUBLISHED'`, `b.is_discoverable = TRUE`, `(b.organization_id IS NULL OR o.is_active = TRUE)`];
    const params: any[] = [];
    const add = (sql: string, value: any) => { params.push(value); clauses.push(sql.replace('$X', `$${params.length}`)); };
    if (filter.categoryId) add('EXISTS (SELECT 1 FROM discovery_business_category_map bcm JOIN discovery_business_categories c ON c.id=bcm.category_id WHERE bcm.business_id = b.id AND bcm.category_id = $X AND c.is_active = TRUE)', filter.categoryId);
    if (filter.city) add('EXISTS (SELECT 1 FROM discovery_business_locations l WHERE l.business_id = b.id AND l.is_active = TRUE AND LOWER(l.city) = LOWER($X))', filter.city);
    if (filter.district) add('EXISTS (SELECT 1 FROM discovery_business_locations l WHERE l.business_id = b.id AND l.is_active = TRUE AND LOWER(l.district) = LOWER($X))', filter.district);
    if (filter.region) add('EXISTS (SELECT 1 FROM discovery_business_locations l WHERE l.business_id = b.id AND l.is_active = TRUE AND LOWER(l.region) = LOWER($X))', filter.region);
    if (filter.businessType) add('LOWER(b.business_type) = LOWER($X)', filter.businessType);
    if (filter.verificationStatus) add('b.verification_status = $X', filter.verificationStatus);
    const limit = Math.min(Math.max(Number(filter.limit) || 50, 1), 200); const offset = Math.max(Number(filter.offset) || 0, 0);
    params.push(limit, offset);
    const result = await this.db(client).query<DiscoveryBusinessRecord>(
      `SELECT b.* FROM discovery_businesses b LEFT JOIN organizations o ON o.id = b.organization_id
       WHERE ${clauses.join(' AND ')} ORDER BY CASE WHEN b.verification_status = 'VERIFIED' THEN 0 ELSE 1 END,
       b.published_at DESC NULLS LAST, b.name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`, params,
    );
    return result.rows;
  }
  async listLocations(businessId: string, options?: { activeOnly?: boolean }, client?: DatabaseClient): Promise<DiscoveryBusinessLocationRecord[]> {
    const result = await this.db(client).query<DiscoveryBusinessLocationRecord>(
      `SELECT id, business_id, name, location_type, address_line_1, address_line_2, city, district, region, country, postal_code, latitude, longitude, service_radius_km, phone, is_primary, is_active, created_at, updated_at FROM discovery_business_locations WHERE business_id = $1 ${options?.activeOnly === false ? '' : 'AND is_active = TRUE'} ORDER BY is_primary DESC, name ASC`, [businessId]);
    return result.rows;
  }
  async listCategories(businessId: string, client?: DatabaseClient): Promise<Array<{ id: string; name: string; slug: string; is_primary: boolean }>> {
    const result = await this.db(client).query<any>(
      `SELECT c.id, c.name, c.slug, bcm.is_primary FROM discovery_business_category_map bcm
       JOIN discovery_business_categories c ON c.id = bcm.category_id WHERE bcm.business_id = $1 AND c.is_active = TRUE
       ORDER BY bcm.is_primary DESC, c.display_order ASC, c.name ASC`, [businessId]);
    return result.rows;
  }
  async getSettings(businessId: string, client?: DatabaseClient): Promise<DiscoveryBusinessSettingsRecord> {
    const result = await this.db(client).query<DiscoveryBusinessSettingsRecord>(
      `INSERT INTO discovery_business_settings (business_id) VALUES ($1)
       ON CONFLICT (business_id) DO UPDATE SET business_id = EXCLUDED.business_id RETURNING *`, [businessId]);
    return result.rows[0];
  }
  async addListingEvent(data: { businessId: string; fromStatus: DiscoveryListingStatus | null; toStatus: DiscoveryListingStatus; reason?: string | null; actorUserId?: string | null }, client?: DatabaseClient): Promise<void> {
    await this.db(client).query(
      `INSERT INTO discovery_listing_events (id, business_id, from_status, to_status, reason, actor_user_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), data.businessId, data.fromStatus, data.toStatus, data.reason || null, data.actorUserId || null]);
  }
}
