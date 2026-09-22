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
import { AuditRepository } from '../repositories/auditRepository.ts';

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
  private readonly auditRepository: AuditRepository;

  constructor(repository?: DiscoveryBusinessRepository, db?: DatabaseClient) {
    this.db = db || getDatabaseClient();
    this.repository = repository || new DiscoveryBusinessRepository(this.db);
    this.auditRepository = new AuditRepository(this.db);
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

  async create(input: DiscoveryBusinessCreateInput, actor?: { userId?: string; role?: string; organizationId?: string }, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    const name = normalizeText(input.name, 255, 'name', true)!;
    const mode = this.validateMode(input);
    // Discovery-only listings are intentionally self-service: an authenticated user may create
    // an unbound draft and submit it for platform moderation. Tenant-bound store mode still
    // requires the caller's active organization through the route/service boundary.
    if (mode === 'DISCOVERY_AND_STORE' && !input.organizationId) throw new Error('TENANT_REQUIRED:organizationId is required.');

    const db = client || this.db;
    return db.withTransaction(async (tx) => {
      const slug = await this.uniqueSlug(name, undefined, tx);
      const status: DiscoveryListingStatus = 'DRAFT';
      const verification: DiscoveryVerificationStatus = 'UNVERIFIED';
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
      if (actor?.userId) {
        await tx.query(
          `INSERT INTO discovery_business_memberships (business_id,user_id,role,is_active)
           VALUES ($1,$2,'OWNER',TRUE)`,
          [record.id, actor.userId],
        );
      }
      await this.repository.addListingEvent({ businessId: record.id, fromStatus: null, toStatus: status, actorUserId: actor?.userId }, tx);
      if (actor?.userId && actor.role && (input.organizationId || actor.organizationId)) {
        await this.auditRepository.recordEvent({
          organization_id: input.organizationId || actor.organizationId,
          actor_id: actor.userId,
          actor_name: actor.userId,
          actor_role: actor.role,
          action: 'DISCOVERY_BUSINESS_CREATED',
          entity_type: 'DISCOVERY_BUSINESS',
          entity_id: record.id,
          after_state: { business_mode: record.business_mode, listing_status: record.listing_status, name: record.name },
          metadata: { businessMode: record.business_mode },
          severity: 'Info', result: 'SUCCESS',
        }, tx);
      }
      if (input.submitImmediately) {
        const readiness = await this.getListingReadiness(record.id, tx);
        if (!readiness.ready) {
          const missing = readiness.items.filter((item) => item.required && !item.done).map((item) => item.label);
          throw new Error(`VALIDATION_ERROR:Complete the listing readiness requirements: ${missing.join(', ')}.`);
        }
        const submitted = await this.repository.updateBusiness(record.id, { listing_status: 'SUBMITTED' }, tx);
        if (!submitted) throw new Error('NOT_FOUND:Discovery business not found.');
        await this.repository.addListingEvent({ businessId: record.id, fromStatus: 'DRAFT', toStatus: 'SUBMITTED', reason: 'Listing submitted during onboarding.', actorUserId: actor?.userId }, tx);
        return submitted;
      }
      return record;
    });
  }

  async getById(id: string, options?: { publicOnly?: boolean }, client?: DatabaseClient): Promise<DiscoveryBusinessRecord | null> {
    if (!id?.trim()) return null;
    const business = await this.repository.findById(id, client);
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
    await this.assertCanManageScoped(existing, actor, client);
    if (existing.listing_status === 'ARCHIVED') throw new Error('DISCOVERY_ARCHIVED:Archived listings cannot be edited.');

    const nextMode = patch.businessMode ?? existing.business_mode;
    const nextOrganizationId = patch.organizationId !== undefined ? (patch.organizationId || null) : existing.organization_id;
    if (!['DISCOVERY_ONLY', 'DISCOVERY_AND_STORE'].includes(nextMode)) throw new Error('VALIDATION_ERROR:Invalid businessMode.');
    if (nextMode === 'DISCOVERY_ONLY' && nextOrganizationId) {
      throw new Error('VALIDATION_ERROR:organizationId must be empty for DISCOVERY_ONLY businesses.');
    }
    if (nextMode === 'DISCOVERY_AND_STORE' && !nextOrganizationId) {
      throw new Error('VALIDATION_ERROR:organizationId is required for DISCOVERY_AND_STORE businesses.');
    }
    if (patch.organizationId !== undefined && nextOrganizationId !== existing.organization_id && actor.role !== 'super_admin') {
      if (!nextOrganizationId || actor.organizationId !== nextOrganizationId) {
        throw new Error('TENANT_ACCESS_DENIED:You cannot attach a discovery business to another organization.');
      }
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
        ...(patch.businessMode !== undefined ? { business_mode: nextMode } : {}),
        ...(patch.organizationId !== undefined ? { organization_id: nextOrganizationId } : {}),
        ...(patch.name !== undefined ? { slug: nextSlug } : {}),
      } as any, tx);
      if (!updated) throw new Error('NOT_FOUND:Discovery business not found.');
      if (actor.userId && (actor.organizationId || updated.organization_id)) {
        await this.auditRepository.recordEvent({
          organization_id: actor.organizationId || updated.organization_id!,
          actor_id: actor.userId,
          actor_name: actor.userId,
          actor_role: actor.role,
          action: 'DISCOVERY_BUSINESS_UPDATED',
          entity_type: 'DISCOVERY_BUSINESS',
          entity_id: id,
          before_state: { name: existing.name, business_mode: existing.business_mode, organization_id: existing.organization_id },
          after_state: { name: updated.name, business_mode: updated.business_mode, organization_id: updated.organization_id },
          metadata: { fields: Object.keys(patch) },
          severity: 'Low', result: 'SUCCESS',
        }, tx);
      }
      return updated;
    });
  }

  async getListingReadiness(id: string, client?: DatabaseClient): Promise<{ ready: boolean; items: Array<{ key: string; label: string; done: boolean; required: boolean; detail?: string }> }> {
    const business = await this.repository.findById(id, client);
    if (!business) throw new Error('NOT_FOUND:Discovery business not found.');
    const db = client || this.db;
    const [categories, primaryLocation, service] = await Promise.all([
      db.query(`SELECT 1 FROM discovery_business_category_map bcm JOIN discovery_business_categories c ON c.id=bcm.category_id WHERE bcm.business_id=$1 AND c.is_active=TRUE LIMIT 1`, [id]),
      db.query(`SELECT * FROM discovery_business_locations WHERE business_id=$1 AND is_active=TRUE AND is_primary=TRUE LIMIT 1`, [id]),
      db.query(`SELECT 1 FROM discovery_services WHERE business_id=$1 AND is_active=TRUE LIMIT 1`, [id]),
    ]);
    const loc = primaryLocation.rows[0];
    const contactDone = Boolean(business.phone?.trim() || business.whatsapp?.trim() || business.email?.trim());
    const categoryDone = categories.rows.length > 0;
    const locationDone = Boolean(loc);
    const coordinatesDone = Boolean(loc && loc.latitude != null && loc.longitude != null);
    const descriptionDone = Boolean(business.short_description?.trim() || business.description?.trim());
    const offeringDone = service.rows.length > 0 || business.business_mode === 'DISCOVERY_AND_STORE';
    const items = [
      { key: 'identity', label: 'Business identity', done: Boolean(business.name?.trim() && business.slug?.trim()), required: true },
      { key: 'description', label: 'Business description', done: descriptionDone, required: true },
      { key: 'contact', label: 'Primary contact', done: contactDone, required: true },
      { key: 'category', label: 'At least one active category', done: categoryDone, required: true },
      { key: 'location', label: 'Primary location', done: locationDone, required: true },
      { key: 'coordinates', label: 'Map coordinates', done: coordinatesDone, required: true },
      { key: 'offering', label: 'Service or store offering', done: offeringDone, required: business.business_mode === 'DISCOVERY_AND_STORE' },
    ];
    return { ready: items.every((item) => !item.required || item.done), items };
  }

  async getListingManagementWorkspace(id: string, actor: { userId: string; role: string; organizationId?: string }, client?: DatabaseClient): Promise<any> {
    const business = await this.repository.findById(id, client);
    if (!business) throw new Error('NOT_FOUND:Discovery business not found.');
    await this.assertCanManageScoped(business, actor, client);
    const db = client || this.db;
    const [readiness, locations, categories, settings, events, verification] = await Promise.all([
      this.getListingReadiness(id, client),
      this.repository.listLocations(id, { activeOnly: true }, client),
      this.repository.listCategories(id, client),
      this.repository.getSettings(id, client),
      db.query(`SELECT id,from_status,to_status,reason,actor_user_id,created_at FROM discovery_listing_events WHERE business_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]),
      db.query(`SELECT id,status,created_at,updated_at,reviewed_at,review_reason FROM discovery_verification_applications WHERE business_id=$1 ORDER BY created_at DESC LIMIT 10`, [id]),
    ]);
    const feedback = events.rows.filter((e:any) => e.to_status === 'REJECTED' && e.reason);
    return {
      business,
      readiness,
      locations,
      categories,
      settings,
      feedback,
      lifecycle: events.rows,
      verification: { status: business.verification_status, applications: verification.rows },
    };
  }

  async resubmit(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    const existing = await this.repository.findById(id, client);
    if (!existing) throw new Error('NOT_FOUND:Discovery business not found.');
    await this.assertCanManageScoped(existing, actor, client);
    if (existing.listing_status !== 'REJECTED') {
      throw new Error('INVALID_STATE_TRANSITION:Only a rejected listing can be resubmitted.');
    }
    const readiness = await this.getListingReadiness(id, client);
    if (!readiness.ready) {
      const missing = readiness.items.filter((item) => item.required && !item.done).map((item) => item.label);
      throw new Error(`VALIDATION_ERROR:Complete the listing readiness requirements: ${missing.join(', ')}.`);
    }
    const db = client || this.db;
    return db.withTransaction(async (tx) => {
      const updated = await this.repository.updateBusiness(id, { listing_status: 'SUBMITTED' }, tx);
      if (!updated) throw new Error('NOT_FOUND:Discovery business not found.');
      await this.repository.addListingEvent({ businessId: id, fromStatus: 'REJECTED', toStatus: 'SUBMITTED', reason: reason || 'Listing corrected and resubmitted for moderation.', actorUserId: actor.userId }, tx);
      if (actor.organizationId || updated.organization_id) {
        await this.auditRepository.recordEvent({
          organization_id: actor.organizationId || updated.organization_id!, actor_id: actor.userId, actor_name: actor.userId, actor_role: actor.role,
          action: 'DISCOVERY_LISTING_RESUBMITTED', entity_type: 'DISCOVERY_BUSINESS', entity_id: id,
          before_state: { listing_status: existing.listing_status }, after_state: { listing_status: updated.listing_status },
          metadata: { reason: reason || null }, severity: 'Medium', result: 'SUCCESS',
        }, tx);
      }
      return updated;
    });
  }

  async submit(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    const existing = await this.repository.findById(id, client);
    if (!existing) throw new Error('NOT_FOUND:Discovery business not found.');
    await this.assertCanManageScoped(existing, actor, client);
    await this.assertListingReadyForSubmission(existing, client);
    return this.transition(id, 'SUBMITTED', actor, reason || 'Listing submitted for review.', client);
  }

  /**
   * Submission readiness is server-authoritative. The UI may show the same checklist,
   * but a listing cannot enter moderation until its minimum public-discovery data exists.
   */
  private async assertListingReadyForSubmission(
    business: DiscoveryBusinessRecord,
    client?: DatabaseClient,
  ): Promise<void> {
    const readiness = await this.getListingReadiness(business.id, client);
    if (!readiness.ready) {
      const missing = readiness.items.filter((item) => item.required && !item.done).map((item) => item.label);
      throw new Error(`VALIDATION_ERROR:Complete the listing readiness requirements: ${missing.join(', ')}.`);
    }
  }

  async review(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    return this.transition(id, 'UNDER_REVIEW', actor, reason || 'Listing moved into moderation review.', client, true);
  }

  async approve(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    return this.transition(id, 'APPROVED', actor, reason || 'Listing approved.', client, true);
  }

  async publish(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    return this.transition(id, 'PUBLISHED', actor, reason || 'Listing published.', client, true);
  }

  async pause(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    return this.transition(id, 'PAUSED', actor, reason || 'Listing paused.', client);
  }

  async suspend(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    return this.transition(id, 'SUSPENDED', actor, reason || 'Listing suspended.', client, true);
  }

  async archive(id: string, actor: { userId: string; role: string; organizationId?: string }, reason?: string, client?: DatabaseClient): Promise<DiscoveryBusinessRecord> {
    return this.transition(id, 'ARCHIVED', actor, reason || 'Listing archived.', client);
  }

  private async transition(id: string, toStatus: DiscoveryListingStatus, actor: { userId: string; role: string; organizationId?: string }, reason: string, client?: DatabaseClient, moderatorOnly = false): Promise<DiscoveryBusinessRecord> {
    const existing = await this.repository.findById(id, client);
    if (!existing) throw new Error('NOT_FOUND:Discovery business not found.');
    if (moderatorOnly) this.assertModerator(actor, existing);
    else await this.assertCanManageScoped(existing, actor, client);
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
      if (actor.organizationId || updated.organization_id) {
        await this.auditRepository.recordEvent({
          organization_id: actor.organizationId || updated.organization_id!, actor_id: actor.userId, actor_name: actor.userId, actor_role: actor.role,
          action: `DISCOVERY_LISTING_${toStatus}`, entity_type: 'DISCOVERY_BUSINESS', entity_id: id,
          before_state: { listing_status: existing.listing_status, is_discoverable: existing.is_discoverable },
          after_state: { listing_status: updated.listing_status, is_discoverable: updated.is_discoverable },
          metadata: { reason }, severity: ['SUSPENDED','ARCHIVED'].includes(toStatus) ? 'High' : 'Medium', result: 'SUCCESS',
        }, tx);
      }
      return updated;
    });
  }

  private async isPubliclyVisible(business: DiscoveryBusinessRecord, client?: DatabaseClient): Promise<boolean> {
    if (business.listing_status !== 'PUBLISHED' || !business.is_discoverable) return false;
    if (!business.organization_id) return true;
    const result = await (client || this.db).query<{ is_active: boolean }>('SELECT is_active FROM organizations WHERE id = $1', [business.organization_id]);
    return result.rows[0]?.is_active === true;
  }

  async assertCanManageScoped(
    business: DiscoveryBusinessRecord,
    actor: { userId: string; role: string; organizationId?: string },
    client?: DatabaseClient,
  ): Promise<void> {
    if (actor.role === 'super_admin') return;

    // Membership is the authoritative business-scoped boundary for merchant users.
    const membership = await (client || this.db).query<{ role: 'OWNER' | 'MANAGER' | 'STAFF' }>(
      `SELECT role
         FROM discovery_business_memberships
        WHERE business_id=$1 AND user_id=$2 AND is_active=TRUE
        LIMIT 1`,
      [business.id, actor.userId],
    );
    const scopedRole = membership.rows[0]?.role;
    if (scopedRole === 'OWNER' || scopedRole === 'MANAGER') {
      if (business.organization_id && actor.organizationId !== business.organization_id) {
        throw new Error('PERMISSION_DENIED:Cross-tenant access to this discovery business is forbidden.');
      }
      return;
    }
    if (scopedRole === 'STAFF') {
      throw new Error('PERMISSION_DENIED:Staff members cannot manage the business listing.');
    }

    // Backward-compatible authorization for platform/tenant administrators and
    // legacy discovery-only creators that predate scoped memberships.
    if (!business.organization_id && business.created_by_user_id === actor.userId && business.business_mode === 'DISCOVERY_ONLY') return;
    if (business.organization_id && actor.organizationId === business.organization_id && ['admin', 'manager', 'business_owner'].includes(actor.role)) return;
    throw new Error('PERMISSION_DENIED:You are not authorized to manage this discovery business.');
  }

  assertCanManage(business: DiscoveryBusinessRecord, actor: { userId: string; role: string; organizationId?: string }): void {
    if (actor.role === 'super_admin') return;
    if (!business.organization_id && business.created_by_user_id === actor.userId && business.business_mode === 'DISCOVERY_ONLY') return;
    if (business.organization_id && actor.organizationId === business.organization_id && ['admin', 'manager', 'business_owner'].includes(actor.role)) return;
    throw new Error('PERMISSION_DENIED:You are not authorized to manage this discovery business.');
  }

  private assertModerator(actor: { role: string; organizationId?: string }, business?: DiscoveryBusinessRecord): void {
    if (actor.role === 'super_admin') return;
    if (actor.role !== 'admin') throw new Error('PERMISSION_DENIED:Discovery moderation requires administrator authorization.');
    if (!business?.organization_id || business.organization_id !== actor.organizationId) {
      throw new Error('TENANT_ACCESS_DENIED:Administrators may moderate only businesses belonging to their organization.');
    }
  }
}
