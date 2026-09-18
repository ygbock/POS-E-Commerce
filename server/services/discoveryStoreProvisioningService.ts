import { randomUUID } from 'node:crypto';
import { DatabaseClient } from '../db/client.ts';

export interface StoreProvisioningResult { businessId: string; organizationId: string; tenantSlug: string; createdTenantBinding: boolean; }

export class DiscoveryStoreProvisioningService {
  constructor(private readonly db: DatabaseClient) {}
  async provisionForDiscoveryBusiness(businessId: string, organizationId: string, businessSlug: string, businessName: string): Promise<StoreProvisioningResult> {
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
      const locationRes = await tx.query<{ id: string }>('SELECT id FROM locations WHERE organization_id = $1 AND is_active = TRUE LIMIT 1', [organizationId]);
      if (!locationRes.rows.length) throw new Error('STORE_NOT_READY:Organization needs an active commerce location before storefront checkout can be enabled.');
      return { businessId, organizationId, tenantSlug, createdTenantBinding: !business.organization_id };
    });
  }
}