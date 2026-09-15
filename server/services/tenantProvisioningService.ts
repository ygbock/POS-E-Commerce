import { randomUUID } from 'node:crypto';
import { DatabaseClient, getDatabaseClient } from '../db/client';
import { hashPassword } from '../auth/password';
import { SubscriptionRepository } from '../repositories/subscriptionRepository';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESERVED_TENANT_SLUGS = new Set([
  'api', 'admin', 'app', 'platform', 'www', 'support',
  'billing', 'security', 'login', 'logout',
]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PLAN_TIERS = ['starter', 'professional', 'enterprise'] as const;
type PlanTier = (typeof VALID_PLAN_TIERS)[number];

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Thrown when a provisioning or lifecycle mutation fails due to a known,
 * recoverable business-rule violation.
 */
export class TenantProvisioningError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 422) {
    super(message);
    this.name = 'TenantProvisioningError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface ProvisionTenantParams {
  name: string;
  slug: string;
  /** Optional — derived from slug if omitted */
  code?: string;
  /** Defaults to 'starter' */
  planTier?: PlanTier | string;
  adminEmail: string;
  adminName: string;
  /** Never stored in plain-text or audit records */
  adminPassword: string;
  metadata?: Record<string, unknown>;
}

export interface ProvisionedTenant {
  tenant: {
    id: string;
    name: string;
    slug: string;
    code: string;
    plan: string;
    status: 'active';
    createdAt: string;
  };
  subscription: {
    id: string;
    planCode: string;
    status: 'trialing';
    trialEndsAt: string;
    currentPeriodEnd: string;
  };
  /** Plain-text password is NEVER returned */
  initialAdmin: {
    id: string;
    email: string;
    name: string;
    role: 'admin';
  };
}

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  code: string;
  planTier: string;
  status: 'active' | 'suspended' | 'archived';
  subscriptionStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  code: string;
  planTier: string;
  isActive: boolean;
  lifecycleStatus: 'active' | 'suspended' | 'archived';
  createdAt: string;
  updatedAt: string;
  subscription: any | null;
  userCount: number;
  locationCount: number;
}

export interface TenantListResult {
  tenants: TenantListItem[];
  total: number;
}

export interface TenantLifecycleResult {
  id: string;
  status: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Validation helpers (server-authoritative, private)
// ---------------------------------------------------------------------------

function validateSlug(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TenantProvisioningError('TENANT_SLUG_REQUIRED', 'A tenant slug is required.');
  }
  const slug = value.trim().toLowerCase();
  if (slug.length < 3 || slug.length > 63 || !SLUG_PATTERN.test(slug)) {
    throw new TenantProvisioningError(
      'INVALID_TENANT_SLUG',
      'Tenant slug must be 3-63 lowercase URL-safe characters (letters, numbers, hyphens; no consecutive or leading/trailing hyphens).',
    );
  }
  if (RESERVED_TENANT_SLUGS.has(slug)) {
    throw new TenantProvisioningError('RESERVED_TENANT_SLUG', 'That tenant slug is reserved by the platform.', 409);
  }
  return slug;
}

function validateName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TenantProvisioningError('TENANT_NAME_REQUIRED', 'A tenant name is required.');
  }
  const name = value.trim();
  if (name.length < 2 || name.length > 255) {
    throw new TenantProvisioningError('INVALID_TENANT_NAME', 'Tenant name must be 2-255 characters.');
  }
  return name;
}

function validateCode(value: unknown, slug: string): string {
  const code =
    typeof value === 'string' && value.trim()
      ? value.trim().toUpperCase()
      : slug.replace(/-/g, '_').toUpperCase();
  if (!/^[A-Z0-9_]{3,64}$/.test(code)) {
    throw new TenantProvisioningError(
      'INVALID_TENANT_CODE',
      'Tenant code must be 3-64 uppercase letters, numbers, or underscores.',
    );
  }
  return code;
}

function validatePlanTier(value: unknown): PlanTier {
  if (value === undefined || value === null || value === '') return 'starter';
  if (!VALID_PLAN_TIERS.includes(value as PlanTier)) {
    throw new TenantProvisioningError(
      'INVALID_PLAN_TIER',
      "Plan tier must be 'starter', 'professional', or 'enterprise'.",
    );
  }
  return value as PlanTier;
}

function validateAdminCredentials(
  adminEmail: unknown,
  adminName: unknown,
  adminPassword: unknown,
): { email: string; name: string; password: string } {
  const email = typeof adminEmail === 'string' ? adminEmail.trim().toLowerCase() : '';
  const name = typeof adminName === 'string' ? adminName.trim() : '';
  const password = typeof adminPassword === 'string' ? adminPassword : '';

  if (!EMAIL_PATTERN.test(email) || email.length > 255) {
    throw new TenantProvisioningError('INVALID_ADMIN_EMAIL', 'A valid initial administrator email is required.');
  }
  if (name.length < 2 || name.length > 255) {
    throw new TenantProvisioningError(
      'INVALID_ADMIN_NAME',
      'Initial administrator name must be 2-255 characters.',
    );
  }
  if (password.length < 12 || password.length > 128) {
    throw new TenantProvisioningError(
      'ADMIN_PASSWORD_POLICY',
      'Initial administrator password must be 12-128 characters.',
    );
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new TenantProvisioningError(
      'ADMIN_PASSWORD_POLICY',
      'Initial administrator password must contain at least one uppercase letter, one lowercase letter, and one digit.',
    );
  }

  return { email, name, password };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TenantProvisioningService {
  private readonly db: DatabaseClient;
  private readonly subscriptionRepo: SubscriptionRepository;

  constructor(db?: DatabaseClient, subscriptionRepo?: SubscriptionRepository) {
    this.db = db || getDatabaseClient();
    this.subscriptionRepo = subscriptionRepo || new SubscriptionRepository(this.db);
  }

  // -------------------------------------------------------------------------
  // provisionTenant
  // -------------------------------------------------------------------------

  /**
   * Atomically provisions a new tenant organization, creates the initial admin
   * user, and assigns a subscription to the canonical plan.
   *
   * SECURITY CONTRACT:
   *  - All IDs are generated server-side (never client-supplied).
   *  - Password is hashed before the transaction; the plain-text value is
   *    never stored, logged, or included in the returned payload.
   *  - Credentials are not present in any audit record.
   *  - If any step fails the entire transaction is rolled back.
   */
  async provisionTenant(
    params: ProvisionTenantParams,
    actor: { id: string; name?: string; role?: string },
    idempotencyKey?: string,
  ): Promise<ProvisionedTenant> {
    // 1. Server-authoritative validation (before transaction)
    const name = validateName(params.name);
    const slug = validateSlug(params.slug);
    const code = validateCode(params.code, slug);
    const planTier = validatePlanTier(params.planTier);
    const admin = validateAdminCredentials(params.adminEmail, params.adminName, params.adminPassword);

    // 2. Hash credential BEFORE entering the transaction
    const { hash, salt } = hashPassword(admin.password);

    // 3. Generate authoritative IDs server-side
    const tenantId = `org_${randomUUID()}`;
    const userId = `usr_${randomUUID()}`;
    const subscriptionId = `sub_${randomUUID()}`;

    return this.db.withTransaction(async (tx) => {
      // Idempotency is claimed before any mutation. ON CONFLICT DO NOTHING
      // allows a concurrent retry to wait for the first transaction and then
      // return its committed response.
      if (idempotencyKey?.trim()) {
        const claim = await tx.query<{ id: string; response: any }>(
          `INSERT INTO platform_idempotency_keys
             (id, operation, idempotency_key, actor_id, response)
           VALUES ($1, 'TENANT_PROVISION', $2, $3, '{"pending":true}'::jsonb)
           ON CONFLICT (operation, idempotency_key) DO NOTHING
           RETURNING id, response`,
          [`idem_${randomUUID()}`, idempotencyKey.trim(), actor.id],
        );
        if (claim.rows.length === 0) {
          const existing = await tx.query<{ response: any }>(
            `SELECT response FROM platform_idempotency_keys
             WHERE operation = 'TENANT_PROVISION' AND idempotency_key = $1`,
            [idempotencyKey.trim()],
          );
          const response = existing.rows[0]?.response;
          if (response && !response.pending) return response as ProvisionedTenant;
          throw new TenantProvisioningError('IDEMPOTENCY_IN_PROGRESS', 'An identical provisioning request is already in progress.', 409);
        }
      }

      // 4. Duplicate detection (slug OR code)
      const dup = await tx.query<{ id: string }>(
        'SELECT id FROM organizations WHERE slug = $1 OR code = $2 LIMIT 1',
        [slug, code],
      );
      if (dup.rows.length > 0) {
        const err: any = new TenantProvisioningError(
          'TENANT_SLUG_OR_CODE_EXISTS',
          'A tenant with this slug or code already exists.',
          409,
        );
        throw err;
      }

      // 5. Create organization
      const orgResult = await tx.query<any>(
        `INSERT INTO organizations (id, name, slug, code, plan_tier, is_active, lifecycle_status)
         VALUES ($1, $2, $3, $4, $5, TRUE, 'active')
         RETURNING id, name, slug, code, plan_tier, is_active, created_at`,
        [tenantId, name, slug, code, planTier],
      );
      const created = orgResult.rows[0];

      // 6. Admin email uniqueness within this tenant
      const dupAdmin = await tx.query<{ id: string }>(
        'SELECT id FROM users WHERE organization_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1',
        [tenantId, admin.email],
      );
      if (dupAdmin.rows.length > 0) {
        const err: any = new TenantProvisioningError(
          'ADMIN_EMAIL_EXISTS',
          'An administrator with this email already exists for this tenant.',
          409,
        );
        throw err;
      }

      // 7. Create initial admin user (password hash only — no plain-text)
      await tx.query(
        `INSERT INTO users (id, organization_id, email, name, password_hash, password_salt, role, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, 'admin', TRUE)`,
        [userId, tenantId, admin.email, admin.name, hash, salt],
      );

      // 8. Resolve the canonical active plan. Never silently fall back to a
      // different plan: that would create a billing/entitlement mismatch.
      const planRes = await tx.query<any>(
        'SELECT id, code, trial_days FROM subscription_plans WHERE code = $1 AND is_active = TRUE LIMIT 1',
        [planTier],
      );
      if (planRes.rows.length === 0) {
        throw new TenantProvisioningError(
          'PLAN_NOT_FOUND',
          `The requested plan '${planTier}' does not exist or is inactive.`,
          422,
        );
      }
      const planId = planRes.rows[0].id;
      const trialDays = Number(planRes.rows[0].trial_days ?? 14);
      const resolvedPlanCode = planRes.rows[0].code;

      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

      // 9. Create authoritative subscription record
      await tx.query(
        `INSERT INTO organization_subscriptions (
           id, organization_id, plan_id, status,
           current_period_start, current_period_end, trial_ends_at,
           metadata
         ) VALUES ($1, $2, $3, 'trialing', $4, $5, $5, $6)`,
        [
          subscriptionId,
          tenantId,
          planId,
          now.toISOString(),
          trialEndsAt.toISOString(),
          JSON.stringify({
            source: 'platform_provisioning',
            provisionedBy: actor.id,
            ...(params.metadata || {}),
          }),
        ],
      );

      // 10. Append-only audit event — NO credentials, NO password data
      await tx.query(
        `INSERT INTO audit_events (
           id, organization_id, actor_id, actor_name, actor_role,
           action, entity_type, entity_id,
           before_state, after_state, metadata, severity, result
         ) VALUES ($1, NULL, $2, $3, $4, 'PLATFORM_TENANT_PROVISIONED', 'organization', $5,
                   NULL, $6::jsonb, $7::jsonb, 'High', 'SUCCESS')`,
        [
          `aud_${randomUUID()}`,
          actor.id,
          actor.name || actor.id,
          actor.role || 'system_owner',
          tenantId,
          // after_state: tenant and subscription info only; no credentials
          JSON.stringify({
            id: tenantId,
            name,
            slug,
            code,
            planTier,
            isActive: true,
            initialAdminUserId: userId,
            subscriptionId,
            planCode: resolvedPlanCode,
            trialEndsAt: trialEndsAt.toISOString(),
          }),
          JSON.stringify({ source: 'platform-control-plane' }),
        ],
      );

      const response: ProvisionedTenant = {
        tenant: {
          id: created.id,
          name: created.name,
          slug: created.slug,
          code: created.code,
          plan: created.plan_tier,
          status: 'active',
          createdAt: created.created_at,
        },
        subscription: {
          id: subscriptionId,
          planCode: resolvedPlanCode,
          status: 'trialing',
          trialEndsAt: trialEndsAt.toISOString(),
          currentPeriodEnd: trialEndsAt.toISOString(),
        },
        initialAdmin: {
          id: userId,
          email: admin.email,
          name: admin.name,
          role: 'admin',
        },
      };

      if (idempotencyKey?.trim()) {
        await tx.query(
          `UPDATE platform_idempotency_keys
           SET organization_id = $1, response = $2::jsonb
           WHERE operation = 'TENANT_PROVISION' AND idempotency_key = $3`,
          [tenantId, JSON.stringify(response), idempotencyKey.trim()],
        );
      }

      return response;
    });
  }

  // -------------------------------------------------------------------------
  // suspendTenant
  // -------------------------------------------------------------------------

  /**
   * Atomically sets the organization to inactive and pauses its active
   * subscription. Idempotent: repeated calls on an already-suspended tenant
   * return success without additional side effects.
   */
  async suspendTenant(
    orgId: string,
    actor: { id: string; name?: string; role?: string },
    reason?: string,
    idempotencyKey?: string,
  ): Promise<TenantLifecycleResult> {
    if (!orgId?.trim()) {
      throw new TenantProvisioningError('TENANT_ID_REQUIRED', 'Organization ID is required.');
    }

    return this.db.withTransaction(async (tx) => {
      const orgRes = await tx.query<any>(
        'SELECT id, name, is_active, lifecycle_status FROM organizations WHERE id = $1 FOR UPDATE',
        [orgId.trim()],
      );
      if (orgRes.rows.length === 0) {
        throw new TenantProvisioningError('TENANT_NOT_FOUND', `Organization '${orgId}' not found.`, 404);
      }
      const org = orgRes.rows[0];

      // Only active tenants can transition to suspended. Archived is a
      // terminal state and must never be reactivated through this API.
      if (org.lifecycle_status === 'archived') {
        throw new TenantProvisioningError('TENANT_ARCHIVED', 'Archived tenants cannot be suspended.', 409);
      }
      if (org.lifecycle_status === 'suspended') {
        return { id: org.id, status: 'suspended', timestamp: new Date().toISOString() };
      }

      // Suspend organization
      await tx.query(
        'UPDATE organizations SET is_active = FALSE, lifecycle_status = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [orgId.trim()],
      );

      // Pause active subscriptions (trialing, active, past_due -> paused)
      await tx.query(
        `UPDATE organization_subscriptions
         SET status = 'paused', updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = $1 AND status IN ('trialing', 'active', 'past_due')`,
        [orgId.trim()],
      );

      // Audit
      await tx.query(
        `INSERT INTO audit_events (
           id, organization_id, actor_id, actor_name, actor_role,
           action, entity_type, entity_id,
           before_state, after_state, metadata, severity, result
         ) VALUES ($1, NULL, $2, $3, $4, 'PLATFORM_TENANT_SUSPENDED', 'organization', $5,
                   $6::jsonb, $7::jsonb, $8::jsonb, 'High', 'SUCCESS')`,
        [
          `aud_${randomUUID()}`,
          actor.id,
          actor.name || actor.id,
          actor.role || 'system_owner',
          orgId.trim(),
          JSON.stringify({ isActive: true }),
          JSON.stringify({ isActive: false }),
          JSON.stringify({
            reason: reason || null,
            idempotencyKey: idempotencyKey || null,
            source: 'platform-control-plane',
          }),
        ],
      );

      return { id: orgId.trim(), status: 'suspended', timestamp: new Date().toISOString() };
    });
  }

  // -------------------------------------------------------------------------
  // reactivateTenant
  // -------------------------------------------------------------------------

  /**
   * Atomically sets the organization back to active and reactivates its paused
   * subscription. Idempotent: repeated calls on an already-active tenant return
   * success without additional side effects.
   */
  async reactivateTenant(
    orgId: string,
    actor: { id: string; name?: string; role?: string },
    reason?: string,
    idempotencyKey?: string,
  ): Promise<TenantLifecycleResult> {
    if (!orgId?.trim()) {
      throw new TenantProvisioningError('TENANT_ID_REQUIRED', 'Organization ID is required.');
    }

    return this.db.withTransaction(async (tx) => {
      const orgRes = await tx.query<any>(
        'SELECT id, name, is_active, lifecycle_status FROM organizations WHERE id = $1 FOR UPDATE',
        [orgId.trim()],
      );
      if (orgRes.rows.length === 0) {
        throw new TenantProvisioningError('TENANT_NOT_FOUND', `Organization '${orgId}' not found.`, 404);
      }
      const org = orgRes.rows[0];

      if (org.lifecycle_status === 'archived') {
        throw new TenantProvisioningError('TENANT_ARCHIVED', 'Archived tenants cannot be reactivated.', 409);
      }
      // Idempotent: already active
      if (org.lifecycle_status === 'active') {
        return { id: org.id, status: 'active', timestamp: new Date().toISOString() };
      }

      // Reactivate organization
      await tx.query(
        'UPDATE organizations SET is_active = TRUE, lifecycle_status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [orgId.trim()],
      );

      // Restore the most recently paused subscription
      const subRes = await tx.query<any>(
        `SELECT id, status, trial_ends_at
         FROM organization_subscriptions
         WHERE organization_id = $1 AND status = 'paused'
         ORDER BY updated_at DESC LIMIT 1`,
        [orgId.trim()],
      );
      if (subRes.rows.length > 0) {
        const sub = subRes.rows[0];
        const isTrialActive = sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > Date.now();
        const newStatus = isTrialActive ? 'trialing' : 'active';
        await tx.query(
          'UPDATE organization_subscriptions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newStatus, sub.id],
        );
      }

      // Audit
      await tx.query(
        `INSERT INTO audit_events (
           id, organization_id, actor_id, actor_name, actor_role,
           action, entity_type, entity_id,
           before_state, after_state, metadata, severity, result
         ) VALUES ($1, NULL, $2, $3, $4, 'PLATFORM_TENANT_REACTIVATED', 'organization', $5,
                   $6::jsonb, $7::jsonb, $8::jsonb, 'High', 'SUCCESS')`,
        [
          `aud_${randomUUID()}`,
          actor.id,
          actor.name || actor.id,
          actor.role || 'system_owner',
          orgId.trim(),
          JSON.stringify({ isActive: false }),
          JSON.stringify({ isActive: true }),
          JSON.stringify({
            reason: reason || null,
            idempotencyKey: idempotencyKey || null,
            source: 'platform-control-plane',
          }),
        ],
      );

      return { id: orgId.trim(), status: 'active', timestamp: new Date().toISOString() };
    });
  }

  // -------------------------------------------------------------------------
  // archiveTenant
  // -------------------------------------------------------------------------

  /**
   * Permanently deactivates a tenant and cancels all of its subscriptions.
   * This is a destructive, irreversible operation logged at Critical severity.
   */
  async archiveTenant(
    orgId: string,
    actor: { id: string; name?: string; role?: string },
    reason?: string,
  ): Promise<TenantLifecycleResult> {
    if (!orgId?.trim()) {
      throw new TenantProvisioningError('TENANT_ID_REQUIRED', 'Organization ID is required.');
    }

    return this.db.withTransaction(async (tx) => {
      const orgRes = await tx.query<any>(
        'SELECT id, name, is_active, lifecycle_status FROM organizations WHERE id = $1 FOR UPDATE',
        [orgId.trim()],
      );
      if (orgRes.rows.length === 0) {
        throw new TenantProvisioningError('TENANT_NOT_FOUND', `Organization '${orgId}' not found.`, 404);
      }
      const org = orgRes.rows[0];

      // Deactivate organization
      await tx.query(
        'UPDATE organizations SET is_active = FALSE, lifecycle_status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [orgId.trim()],
      );

      // Cancel all non-terminal subscriptions
      await tx.query(
        `UPDATE organization_subscriptions
         SET status = 'cancelled',
             cancelled_at = CURRENT_TIMESTAMP,
             cancel_at_period_end = FALSE,
             updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = $1 AND status NOT IN ('cancelled', 'expired')`,
        [orgId.trim()],
      );

      // Critical-severity audit
      await tx.query(
        `INSERT INTO audit_events (
           id, organization_id, actor_id, actor_name, actor_role,
           action, entity_type, entity_id,
           before_state, after_state, metadata, severity, result
         ) VALUES ($1, NULL, $2, $3, $4, 'PLATFORM_TENANT_ARCHIVED', 'organization', $5,
                   $6::jsonb, $7::jsonb, $8::jsonb, 'Critical', 'SUCCESS')`,
        [
          `aud_${randomUUID()}`,
          actor.id,
          actor.name || actor.id,
          actor.role || 'system_owner',
          orgId.trim(),
          JSON.stringify({ isActive: org.is_active }),
          JSON.stringify({ isActive: false, archived: true }),
          JSON.stringify({ reason: reason || null, source: 'platform-control-plane' }),
        ],
      );

      return { id: orgId.trim(), status: 'archived', timestamp: new Date().toISOString() };
    });
  }

  // -------------------------------------------------------------------------
  // getTenantDetail
  // -------------------------------------------------------------------------

  /**
   * Returns a detailed view of a single tenant including subscription state
   * and resource usage counters.
   */
  async getTenantDetail(orgId: string): Promise<TenantDetail | null> {
    if (!orgId?.trim()) {
      throw new TenantProvisioningError('TENANT_ID_REQUIRED', 'Organization ID is required.');
    }

    const orgRes = await this.db.query<any>(
      `SELECT id, name, slug, code, plan_tier, is_active, lifecycle_status, created_at, updated_at
       FROM organizations WHERE id = $1 LIMIT 1`,
      [orgId.trim()],
    );
    if (orgRes.rows.length === 0) return null;
    const org = orgRes.rows[0];

    // Subscription details (best-effort)
    let subscription: any = null;
    try {
      subscription = await this.subscriptionRepo.getSubscriptionDetails(orgId.trim());
    } catch {
      subscription = null;
    }

    // Resource usage counters
    const [userCountRes, locationCountRes] = await Promise.all([
      this.db.query<{ count: string }>(
        'SELECT COUNT(*)::int AS count FROM users WHERE organization_id = $1',
        [orgId.trim()],
      ),
      this.db.query<{ count: string }>(
        'SELECT COUNT(*)::int AS count FROM locations WHERE organization_id = $1',
        [orgId.trim()],
      ),
    ]);

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      code: org.code,
      planTier: org.plan_tier,
      isActive: Boolean(org.is_active),
      lifecycleStatus: org.lifecycle_status,
      createdAt: org.created_at,
      updatedAt: org.updated_at,
      subscription,
      userCount: Number(userCountRes.rows[0]?.count || 0),
      locationCount: Number(locationCountRes.rows[0]?.count || 0),
    };
  }

  // -------------------------------------------------------------------------
  // listTenants
  // -------------------------------------------------------------------------

  /**
   * Returns a filtered, paginated list of tenants with live subscription
   * status joined in.
   */
  async listTenants(
    filters: {
      status?: 'active' | 'suspended' | 'all';
      planTier?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<TenantListResult> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.status && filters.status !== 'all') {
      conditions.push(`o.is_active = $${idx++}`);
      params.push(filters.status === 'active');
    }

    if (filters.planTier && filters.planTier !== 'all') {
      conditions.push(`o.plan_tier = $${idx++}`);
      params.push(filters.planTier.trim().toLowerCase());
    }

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(`(o.name ILIKE $${idx} OR o.code ILIKE $${idx} OR o.slug ILIKE $${idx})`);
      params.push(term);
      idx++;
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM organizations o ${whereSql}`,
      params,
    );
    const total = Number(countRes.rows[0]?.count || 0);

    const limit = Math.min(Math.max(Number(filters.limit || 50), 1), 200);
    const offset = Math.max(Number(filters.offset || 0), 0);
    const dataParams = [...params, limit, offset];

    const dataRes = await this.db.query<any>(
      `SELECT
         o.id, o.name, o.slug, o.code, o.plan_tier, o.is_active, o.lifecycle_status,
         o.created_at, o.updated_at,
         os.status AS subscription_status
       FROM organizations o
       LEFT JOIN organization_subscriptions os
         ON os.organization_id = o.id
        AND os.status IN ('trialing', 'active', 'past_due', 'paused')
       ${whereSql}
       ORDER BY o.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams,
    );

    return {
      tenants: dataRes.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        code: r.code,
        planTier: r.plan_tier,
        status: r.lifecycle_status || (r.is_active ? 'active' : 'suspended'),
        subscriptionStatus: r.subscription_status || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total,
    };
  }
}
