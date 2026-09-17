import { randomUUID } from 'node:crypto';
import {
  DiscoveryBusinessRepository,
  DiscoveryBusinessRecord,
  DiscoveryBusinessMode,
  DiscoveryListingStatus,
  DiscoveryVerificationStatus,
  DiscoveryBusinessLocationRecord,
  DiscoveryBusinessSettingsRecord,
  DiscoveryBusinessListFilter,
} from '../repositories/discoveryBusinessRepository.ts';
import { DatabaseClient, getDatabaseClient } from '../db/client.ts';

export interface DiscoveryBusinessCreateInput {
  name: string;
  legalName?: string | null;
  businessType?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  businessMode?: DiscoveryBusinessMode;
  organizationId?: string | null;
  createdByUserId?: string | null;
  submitImmediately?: boolean;
}

export interface DiscoveryBusinessUpdateInput extends Partial<Omit<DiscoveryBusinessCreateInput, 'organizationId' | 'createdByUserId'>> {
  organizationId?: string | null;
}

export interface DiscoveryLocationInput {
  name: string;
  locationType?: DiscoveryBusinessLocationRecord['location_type'];
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  district?: string | null;
  region?: string | null;
  country?: string;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  serviceRadiusKm?: number | null;
  phone?: string | null;
  isPrimary?: boolean;
}

const TRANSITIONS: Record<DiscoveryListingStatus, DiscoveryListingStatus[]> = {
  DRAFT: ['SUBMITTED', 'ARCHIVED'],
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED', 'ARCHIVED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'ARCHIVED'],
  APPROVED: ['PUBLISHED', 'PAUSED', 'ARCHIVED'],
  PUBLISHED: ['PAUSED', 'SUSPENDED', 'ARCHIVED'],
  REJECTED: ['DRAFT', 'ARCHIVED'],
  PAUSED: ['PUBLISHED', 'ARCHIVED'],
  SUSPENDED: ['UNDER_REVIEW', 'ARCHIVED'],
  ARCHIVED: [],
};

function normalizeText(value: unknown, max: number, field: string, required = false): string | null {
  if (value == null) {
    if (required) throw new Error(`VALIDATION_ERROR:${field} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new Error(`VALIDATION_ERROR:${field} must be a string.`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (required && !normalized) throw new Error(`VALIDATION_ERROR:${field} is required.`);
  if (normalized.length > max) throw new Error(`VALIDATION_ERROR:${field} exceeds ${max} characters.`);
  return normalized || null;
}

export function slugifyDiscoveryName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || `business-${randomUUID().slice(0, 8)}`;
}

export class DiscoveryBusinessService {
  private readonly db: DatabaseClient;
  private readonly repository: DiscoveryBusinessRepository;

  constructor(repository?: DiscoveryBusinessRepository, db?: DatabaseClient) {
    this.db = db || getDatabaseClient();
    this.repository = repository || new DiscoveryBusinessRepository(this.db);
  }

  private async uniqueSlug(name: string, excludeId?: string, client?: DatabaseClient): Promise<string> {
    const base = slugifyDiscoveryName(name);
    let candidate = base;
    for (let i = 0; i < 100; i += 1) {
      if (!(await this.repository.slugExists(candidate, excludeId, client))) return candidate;
      candidate = `${base}-${i + 2}`.slice(0, 255);
    }
    throw new Error('DISCOVERY_SLUG_EXHAUSTED');
  }

  private validateMode(input: DiscoveryBusinessCreateInput): DiscoveryBusinessMode {
    const mode = input.businessMode || 'DISCOVERY_ONLY';
    if (!['DISCOVERY_ONLY', 'DISCOVERY_AND_STORE'].includes(mode)) throw new Error('VALIDATION_ERROR:Invalid businessMode.');
    if (mode === 'DISCOVERY_AND_STORE' && !input.organizationId) {
      throw new Error('VALIDATION_ERROR:organizationId is required for DISCOVERY_AND_STORE businesses.');
    }
    if (mode === 'DISCOVERY_ONLY' && input.organizationId) {
      throw new Error('VALIDATION_ERROR:organizationId must be empty for DISCOVERY_ONLY businesses.');
    }
    return mode;
  }

  async create(input: DiscoveryBusinessCreateInput, actor?: { userId?: string; role?: string }, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    const name = normalizeText(input.name, 255, 'name', true)!;
    const mode = this.validateMode(input);
    if (mode === 'DISCOVERY_ONLY' && actor?.role !== 'super_admin' && actor?.role !== 'admin') {
      throw new Error('PERMISSION_DENIED:Discovery-only business creation requires platform or administrator authorization.');
    }
    if (mode === 'DISCOVERY_AND_STORE' && !input.organizationId) throw new Error('TENANT_REQUIRED:organizationId is required.');

    const db = client || this.db;
    return db.withTransaction(async (tx) => {
      const slug = await this.uniqueSlug(name, undefined, tx);
      const status: DiscoveryListingStatus = input.submitImmediately ? 'SUBMITTED' : 'DRAFT';
      const verification: DiscoveryVerificationStatus = input.submitImmediately ? 'PENDING' : 'UNVERIFIED';
      const record = await this.repository.createBusiness({
        id: randomUUID(),
        public_id: `biz_${randomUUID().replace(/-/g, '')}`,
        organization_id: input.organizationId || null,
        name,
        legal_name: normalizeText(input.legalName, 255, 'legalName'),
        slug,
        business_type: normalizeText(input.businessType, 64, 'businessType'),
        short_description: normalizeText(input.shortDescription, 500, 'shortDescription'),
        description: normalizeText(input.description, 10000, 'description'),
        phone: normalizeText(input.phone, 64, 'phone'),
        email: normalizeText(input.email, 255, 'email'),
        whatsapp: normalizeText(input.whatsapp, 64, 'whatsapp'),
        website: normalizeText(input.website, 2048, 'website'),
        logo_url: normalizeText(input.logoUrl, 2048, 'logoUrl'),
        cover_image_url: normalizeText(input.coverImageUrl, 2048, 'coverImageUrl'),
        business_mode: mode,
        listing_status: status,
        verification_status: verification,
        is_discoverable: false,
        created_by_user_id: input.createdByUserId || actor?.userId || null,
      }, tx);
      await this.repository.getSettings(record.id, tx);
      await this.repository.addListingEvent({ businessId: record.id, fromStatus: null, toStatus: status, actorUserId: actor?.userId }, tx);
      return record;
    });
  }

  async getById(id: string, options?: { publicOnly?: boolean }, client?: DatabaseClient): Promise<DiscoveryBusinessRecord | null> {
    if (!id?.trim()) return null;
    const business = options?.publicOnly ? await this.repository.findById(id, client) : await this.repository.findById(id, client);
    if (!business) return null;
    if (options?.publicOnly && !(await this.isPubliclyVisible(business, client))) return null;
    return business;
  }

  async getBySlug(slug: string, publicOnly = true, client?: DatabaseClient): Promise<DiscoveryBusinessRecord | null> {
    return this.repository.findBySlug(slug, { publicOnly }, client);
  }

  async listPublished(filter: DiscoveryBusinessListFilter = {}, client?: DatabaseClient): Promise<DiscoveryBusinessRecord[]> {
    return this.repository.listPublished(filter, client);
  }

  async getPublicProfile(id: string, client?: DatabaseClient): Promise<{
    business: DiscoveryBusinessRecord;
    locations: DiscoveryBusinessLocationRecord[];
    categories: Array<{ id: string; name: string; slug: string; is_primary: boolean }>;
    settings: DiscoveryBusinessSettingsRecord;
  } | null> {
    const business = await this.repository.findById(id, client);
    if (!business || !(await this.isPubliclyVisible(business, client))) return null;
    const [locations, categories, settings] = await Promise.all([
      this.repository.listLocations(id, { activeOnly: true }, client),
      this.repository.listCategories(id, client),
      this.repository.getSettings(id, client),
    ]);
    return { business, locations, categories, settings };
  }

  async update(id: string, patch: DiscoveryBusinessUpdateInput, actor: { userId: string; role: string; organizationId?: string }, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    const existing = await this.repository.findById(id, client);
    if (!existing) throw new Error('NOT_FOUND:Discovery business not found.');
    this.assertCanManage(existing, actor);
    if (existing.listing_status === 'ARCHIVED') throw new Error('DISCOVERY_ARCHIVED:Archived listings cannot be edited.');
    if (patch.businessMode && patch.businessMode !== existing.business_mode) {
      if (patch.businessMode === 'DISCOVERY_AND_STORE' && !patch.organizationId && !existing.organization_id) throw new Error('VALIDATION_ERROR:organizationId is required when attaching a store.');
      if (patch.businessMode === 'DISCOVERY_ONLY' && (patch.organizationId || existing.organization_id)) throw new Error('VALIDATION_ERROR:Detach the organization before switching to DISCOVERY_ONLY.');
    }
    const db = client || this.db;
    return db.withTransaction(async (tx) => {
      const nextSlug = patch.name && patch.name.trim() !== existing.name ? await this.uniqueSlug(normalizeText(patch.name, 255, 'name', true)!, existing.id, tx) : existing.slug;
      const updated = await this.repository.updateBusiness(id, {
        ...(patch.name !== undefined ? { name: normalizeText(patch.name, 255, 'name', true) } : {}),
        ...(patch.legalName !== undefined ? { legal_name: normalizeText(patch.legalName, 255, 'legalName') } : {}),
        ...(patch.businessType !== undefined ? { business_type: normalizeText(patch.businessType, 64, 'businessType') } : {}),
        ...(patch.shortDescription !== undefined ? { short_description: normalizeText(patch.shortDescription, 500, 'shortDescription') } : {}),
        ...(patch.description !== undefined ? { description: normalizeText(patch.description, 10000, 'description') } : {}),
        ...(patch.phone !== undefined ? { phone: normalizeText(patch.phone, 64, 'phone') } : {}),
        ...(patch.email !== undefined ? { email: normalizeText(patch.email, 255, 'email') } : {}),
        ...(patch.whatsapp !== undefined ? { whatsapp: normalizeText(patch.whatsapp, 64, 'whatsapp') } : {}),
        ...(patch.website !== undefined ? { website: normalizeText(patch.website, 2048, 'website') } : {}),
        ...(patch.logoUrl !== undefined ? { logo_url: normalizeText(patch.logoUrl, 2048, 'logoUrl') } : {}),
        ...(patch.coverImageUrl !== undefined ? { cover_image_url: normalizeText(patch.coverImageUrl, 2048, 'coverImageUrl') } : {}),
        ...(patch.businessMode !== undefined ? { business_mode: patch.businessMode } : {}),
        ...(patch.organizationId !== undefined ? { organization_id: patch.organizationId } : {}),
        ...(patch.name !== undefined ? { slug: nextSlug } : {}),
      } as any, tx);
      if (!updated) throw new Error('NOT_FOUND:Discovery business not found.');
      return updated;
    });
  }

  async submit(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    return this.transition(id, 'SUBMITTED', actor, reason || 'Listing submitted for review.', client);
  }

  async approve(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    this.assertModerator(actor);
    return this.transition(id, 'APPROVED', actor, reason || 'Listing approved.', client, true);
  }

  async publish(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    this.assertModerator(actor);
    return this.transition(id, 'PUBLISHED', actor, reason || 'Listing published.', client, true);
  }

  async pause(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    return this.transition(id, 'PAUSED', actor, reason || 'Listing paused.', client);
  }

  async suspend(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    this.assertModerator(actor);
    return this.transition(id, 'SUSPENDED', actor, reason || 'Listing suspended.', client, true);
  }

  async archive(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    return this.transition(id, 'ARCHIVED', actor, reason || 'Listing archived.', client);
  }

  private async transition(id: string, toStatus: DiscoveryListingStatus, actor: { userId: string; role: string; organizationId?: string }, reason: string, client?: DatabaseClient, moderatorOnly = false): Promise<DiscoveryBusinessRecord> {
    const existing = await this.repository.findById(id, client);
    if (!existing) throw new Error('NOT_FOUND:Discovery business not found.');
    if (moderatorOnly) this.assertModerator(actor);
    else this.assertCanManage(existing, actor);
    if (!TRANSITIONS[existing.listing_status].includes(toStatus)) {
      throw new Error(`INVALID_STATE_TRANSITION:${existing.listing_status} cannot transition to ${toStatus}.`);
    }
    const db = client || this.db;
    return db.withTransaction(async (tx) => {
      const patch: any = { listing_status: toStatus };
      if (toStatus === 'PUBLISHED') {
        patch.is_discoverable = true;
        patch.published_at = new Date().toISOString();
        patch.suspended_at = null;
      } else if (toStatus === 'SUSPENDED' || toStatus === 'PAUSED' || toStatus === 'ARCHIVED') {
        patch.is_discoverable = false;
        if (toStatus === 'SUSPENDED') patch.suspended_at = new Date().toISOString();
        if (toStatus === 'ARCHIVED') patch.archived_at = new Date().toISOString();
      }
      const updated = await this.repository.updateBusiness(id, patch, tx);
      if (!updated) throw new Error('NOT_FOUND:Discovery business not found.');
      await this.repository.addListingEvent({ businessId: id, fromStatus: existing.listing_status, toStatus, reason, actorUserId: actor.userId }, tx);
      return updated;
    });
  }

  private async isPubliclyVisible(business: DiscoveryBusinessRecord, client?: DatabaseClient): Promise<boolean> {
    if (business.listing_status !== 'PUBLISHED' || !business.is_discoverable) return false;
    if (!business.organization_id) return true;
    const result = await (client || this.db).query<{ is_active: boolean }>('SELECT is_active FROM organizations WHERE id = $1', [business.organization_id]);
    return result.rows[0]?.is_active === true;
  }

  assertCanManage(business: DiscoveryBusinessRecord, actor: { userId: string; role: string; organizationId?: string }): void {
    if (actor.role === 'super_admin') return;
    if (business.created_by_user_id === actor.userId) return;
    if (business.organization_id && actor.organizationId === business.organization_id && ['admin', 'manager'].includes(actor.role)) return;
    throw new Error('PERMISSION_DENIED:You are not authorized to manage this discovery business.');
  }

  private assertModerator(actor: { role: string }): void {
    if (!['super_admin', 'admin'].includes(actor.role)) throw new Error('PERMISSION_DENIED:Discovery moderation requires administrator authorization.');
  }
}
