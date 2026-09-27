import { randomUUID } from 'node:crypto';
import { DatabaseClient } from '../db/client.ts';

export interface StoreProvisioningResult { businessId: string; organizationId: string; tenantSlug: string; createdTenantBinding: boolean; locationId: string; createdCommerceLocation: boolean; }

export interface StoreProvisioningOptions {
  storeName?: string;
  currency?: 'SLE' | 'USD';
  enableOnlineCheckout?: boolean;
  enablePOS?: boolean;
  enableInventoryLedger?: boolean;
}

export class DiscoveryStoreProvisioningService {
  constructor(private readonly db: DatabaseClient) {}
  async provisionForDiscoveryBusiness(businessId: string, organizationId: string, businessSlug: string, businessName: string, options: StoreProvisioningOptions = {}): Promise<StoreProvisioningResult> {
    return this.db.withTransaction(async (tx) => {
      const businessRes = await tx.query<any>('SELECT id, organization_id, business_mode, listing_status FROM discovery_businesses WHERE id = $1 FOR UPDATE', [businessId]);
      const business = businessRes.rows[0];
      if (!business) throw new Error('NOT_FOUND:Discovery business not found.');
      const orgRes = await tx.query<any>('SELECT id, slug, name, is_active FROM organizations WHERE id = $1 FOR UPDATE', [organizationId]);
      const org = orgRes.rows[0];
      if (!org) throw new Error('TENANT_NOT_FOUND:Organization not found.');
      if (!org.is_active) throw new Error('INACTIVE_ORGANIZATION:Organization is inactive.');
      if (business.organization_id && business.organization_id !== organizationId) throw new Error('TENANT_ACCESS_DENIED:Discovery business is already bound to another organization.');
      const normalizedBase = String(businessSlug || businessName || organizationId).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56) || ('store-' + randomUUID().slice(0, 8));
      let tenantSlug = String(org.slug || '').trim().toLowerCase();
      if (!tenantSlug) {
        const candidate = await tx.query<{ id: string }>('SELECT id FROM organizations WHERE LOWER(slug) = LOWER($1) AND id <> $2 LIMIT 1', [normalizedBase, organizationId]);
        tenantSlug = candidate.rows.length ? normalizedBase + '-' + organizationId.replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase() : normalizedBase;
        const collision = await tx.query<{ id: string }>('SELECT id FROM organizations WHERE LOWER(slug) = LOWER($1) AND id <> $2 LIMIT 1', [tenantSlug, organizationId]);
        if (collision.rows.length) throw new Error('CONFLICT:Unable to allocate a unique storefront slug for this organization.');
        await tx.query('UPDATE organizations SET slug = $1 WHERE id = $2', [tenantSlug, organizationId]);
      }
      await tx.query("UPDATE discovery_businesses SET organization_id = $1, business_mode = 'DISCOVERY_AND_STORE', updated_at = CURRENT_TIMESTAMP WHERE id = $2", [organizationId, businessId]);
      await tx.query('INSERT INTO discovery_business_settings (business_id) VALUES ($1) ON CONFLICT (business_id) DO NOTHING', [businessId]);
      await tx.query(
        "UPDATE organizations SET currency_code = $1, currency_symbol = $2, branding = jsonb_set(COALESCE(branding, '{}'::jsonb), '{storeName}', to_jsonb($3::text), true), feature_flags = jsonb_set(COALESCE(feature_flags, '{}'::jsonb), '{guestCheckoutEnabled}', to_jsonb($4::boolean), true), updated_at = CURRENT_TIMESTAMP WHERE id = $5",
        [options.currency === 'USD' ? 'USD' : 'SLE', options.currency === 'USD' ? '
      let locationRes = await tx.query<{ id: string }>('SELECT id FROM locations WHERE organization_id = $1 AND is_active = TRUE ORDER BY created_at ASC, id ASC LIMIT 1', [organizationId]);
      let createdCommerceLocation = false;

      // A Discovery-only owner already has the business location data needed to
      // bootstrap the first commerce location. Promote the primary Discovery
      // location instead of forcing the owner through a second location form.
      if (!locationRes.rows.length) {
        const discoveryLocation = await tx.query<any>(
          `SELECT id, name, address_line_1, address_line_2, city, district, region, country, phone
             FROM discovery_business_locations
            WHERE business_id = $1 AND is_active = TRUE
            ORDER BY is_primary DESC, created_at ASC, id ASC
            LIMIT 1`,
          [businessId],
        );
        const source = discoveryLocation.rows[0];
        if (!source) throw new Error('STORE_NOT_READY:Complete the Discovery business location before enabling store mode.');

        const locationId = `loc_${randomUUID().replace(/-/g, '')}`;
        const codeBase = String(source.name || businessName || 'store')
          .trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'STORE';
        const code = `${codeBase}_${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
        const address = [source.address_line_1, source.address_line_2, source.city, source.district, source.region, source.country]
          .filter(Boolean).join(', ') || null;

        await tx.query(
          `INSERT INTO locations
             (id, organization_id, code, name, type, address, phone, is_pos_enabled, is_active)
           VALUES ($1, $2, $3, $4, 'Retail Store', $5, $6, $7, TRUE)`,
          [locationId, organizationId, code, String(options.storeName || source.name || businessName).trim().slice(0, 255), address, source.phone || null, options.enablePOS !== false],
        );
        locationRes = { rows: [{ id: locationId }] };
        createdCommerceLocation = true;
      }

      return {
        businessId,
        organizationId,
        tenantSlug,
        createdTenantBinding: !business.organization_id,
        locationId: locationRes.rows[0].id,
        createdCommerceLocation,
      };
    });
  }
} : 'Le', String(options.storeName || businessName).trim().slice(0, 255), options.enableOnlineCheckout !== false, organizationId],
      );

      let locationRes = await tx.query<{ id: string }>('SELECT id FROM locations WHERE organization_id = $1 AND is_active = TRUE ORDER BY created_at ASC, id ASC LIMIT 1', [organizationId]);
      let createdCommerceLocation = false;

      // A Discovery-only owner already has the business location data needed to
      // bootstrap the first commerce location. Promote the primary Discovery
      // location instead of forcing the owner through a second location form.
      if (!locationRes.rows.length) {
        const discoveryLocation = await tx.query<any>(
          `SELECT id, name, address_line_1, address_line_2, city, district, region, country, phone
             FROM discovery_business_locations
            WHERE business_id = $1 AND is_active = TRUE
            ORDER BY is_primary DESC, created_at ASC, id ASC
            LIMIT 1`,
          [businessId],
        );
        const source = discoveryLocation.rows[0];
        if (!source) throw new Error('STORE_NOT_READY:Complete the Discovery business location before enabling store mode.');

        const locationId = `loc_${randomUUID().replace(/-/g, '')}`;
        const codeBase = String(source.name || businessName || 'store')
          .trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'STORE';
        const code = `${codeBase}_${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
        const address = [source.address_line_1, source.address_line_2, source.city, source.district, source.region, source.country]
          .filter(Boolean).join(', ') || null;

        await tx.query(
          `INSERT INTO locations
             (id, organization_id, code, name, type, address, phone, is_pos_enabled, is_active)
           VALUES ($1, $2, $3, $4, 'Retail Store', $5, $6, $7, TRUE)`,
          [locationId, organizationId, code, String(options.storeName || source.name || businessName).trim().slice(0, 255), address, source.phone || null, options.enablePOS !== false],
        );
        locationRes = { rows: [{ id: locationId }] };
        createdCommerceLocation = true;
      }

      return {
        businessId,
        organizationId,
        tenantSlug,
        createdTenantBinding: !business.organization_id,
        locationId: locationRes.rows[0].id,
        createdCommerceLocation,
      };
    });
  }
}