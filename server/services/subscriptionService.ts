import { DatabaseClient, getDatabaseClient } from '../db/client';
import { SubscriptionRepository, OrganizationSubscription, SubscriptionPlan } from '../repositories/subscriptionRepository';

export class SubscriptionLimitError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly statusCode: number;
  public readonly metric?: string;
  public readonly limit?: number;
  public readonly current?: number;

  constructor(
    code: string,
    message: string,
    status = 403,
    details?: { metric?: string; limit?: number; current?: number }
  ) {
    super(message);
    this.name = 'SubscriptionLimitError';
    this.code = code;
    this.status = status;
    this.statusCode = status;
    this.metric = details?.metric;
    this.limit = details?.limit;
    this.current = details?.current;
  }
}

export function normalizeFeatureName(feature: string): string {
  const f = feature.trim().toLowerCase();
  if (f === 'advanced_reports') return 'reports_advanced';
  if (f === 'basic_reports') return 'reports_basic';
  if (f === 'ecommerce') return 'storefront';
  return f;
}

export interface SubscriptionSnapshot extends OrganizationSubscription {
  plan: {
    id: string;
    code: string;
    name: string;
    amount: string;
    currency: string;
    billingInterval: 'monthly' | 'yearly';
    limits: Record<string, number>;
    features: Record<string, boolean>;
  };
}

export class SubscriptionService {
  private readonly db?: DatabaseClient;

  constructor(
    private readonly repository: SubscriptionRepository = new SubscriptionRepository(),
    db?: DatabaseClient
  ) {
    this.db = db;
  }

  async getTenantSubscription(
    organizationId: string,
    client?: DatabaseClient,
    forUpdate = false
  ): Promise<SubscriptionSnapshot | null> {
    if (!organizationId?.trim()) throw new Error('TENANT_REQUIRED: organizationId is required');
    const record = await this.repository.getForOrganization(organizationId.trim(), client, forUpdate);
    if (!record) return null;
    return {
      ...record,
      plan: {
        id: record.plan.id,
        code: record.plan.code,
        name: record.plan.name,
        amount: record.plan.amount,
        currency: record.plan.currency,
        billingInterval: record.plan.billing_interval,
        limits: record.plan.limits,
        features: record.plan.features,
      },
    };
  }

  async hasFeature(organizationId: string, feature: string): Promise<boolean> {
    if (!organizationId?.trim()) return false;
    try {
      const subscription = await this.getTenantSubscription(organizationId.trim());
      if (!subscription || !['trialing', 'active'].includes(subscription.status)) {
        return false;
      }
      const normalized = normalizeFeatureName(feature);
      return subscription.plan.features[normalized] === true || subscription.plan.features[feature] === true;
    } catch {
      return false;
    }
  }

  async assertFeatureEnabled(organizationId: string, feature: string): Promise<void> {
    if (!organizationId?.trim()) {
      throw new SubscriptionLimitError('TENANT_REQUIRED', 'TENANT_REQUIRED: organizationId is required', 403);
    }
    const subscription = await this.getTenantSubscription(organizationId.trim());
    if (!subscription) {
      throw new SubscriptionLimitError('SUBSCRIPTION_NOT_FOUND', 'SUBSCRIPTION_NOT_FOUND: Organization subscription not found', 403);
    }
    if (!['trialing', 'active'].includes(subscription.status)) {
      throw new SubscriptionLimitError('SUBSCRIPTION_INACTIVE', `SUBSCRIPTION_INACTIVE: Subscription status is '${subscription.status}'`, 403);
    }
    const normalized = normalizeFeatureName(feature);
    const enabled = subscription.plan.features[normalized] === true || subscription.plan.features[feature] === true;
    if (!enabled) {
      throw new SubscriptionLimitError(
        'FEATURE_NOT_AVAILABLE',
        `FEATURE_NOT_INCLUDED: Feature '${feature}' is not included in plan '${subscription.plan.code}'. Upgrade to access this feature.`,
        403
      );
    }
  }

  async getLimit(organizationId: string, metric: string): Promise<number | null> {
    const subscription = await this.getTenantSubscription(organizationId);
    if (!subscription) return null;
    const value = subscription.plan.limits[metric];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  async assertWithinLimit(
    organizationId: string,
    metric: 'users' | 'locations' | 'products' | 'monthly_orders',
    currentCount = 0,
    client?: DatabaseClient,
    forUpdate = false
  ): Promise<SubscriptionSnapshot> {
    if (!organizationId?.trim()) {
      throw new SubscriptionLimitError('TENANT_REQUIRED', 'TENANT_REQUIRED: organizationId is required', 403);
    }
    const subscription = await this.getTenantSubscription(organizationId.trim(), client, forUpdate);
    if (!subscription) {
      throw new SubscriptionLimitError('SUBSCRIPTION_NOT_FOUND', 'SUBSCRIPTION_NOT_FOUND: Organization subscription not found', 403);
    }
    if (!['trialing', 'active'].includes(subscription.status)) {
      throw new SubscriptionLimitError('SUBSCRIPTION_INACTIVE', `SUBSCRIPTION_INACTIVE: Subscription status is '${subscription.status}'`, 403);
    }
    const limit = subscription.plan.limits[metric];
    if (typeof limit === 'number' && Number.isFinite(limit) && currentCount >= limit) {
      throw new SubscriptionLimitError(
        'SUBSCRIPTION_LIMIT_REACHED',
        `SUBSCRIPTION_LIMIT_REACHED: Organization reached maximum allowed ${metric} limit of ${limit} for plan '${subscription.plan.code}'.`,
        403,
        { metric, limit, current: currentCount }
      );
    }
    return subscription;
  }

  async assertCanCreateUser(organizationId: string, client?: DatabaseClient): Promise<void> {
    const subscription = await this.getTenantSubscription(organizationId, client, Boolean(client));
    if (!subscription) {
      throw new SubscriptionLimitError('SUBSCRIPTION_NOT_FOUND', 'SUBSCRIPTION_NOT_FOUND: Organization subscription not found', 403);
    }
    if (!['trialing', 'active'].includes(subscription.status)) {
      throw new SubscriptionLimitError('SUBSCRIPTION_INACTIVE', `SUBSCRIPTION_INACTIVE: Subscription status is '${subscription.status}'`, 403);
    }
    const limit = subscription.plan.limits.users;
    if (typeof limit === 'number' && Number.isFinite(limit)) {
      const count = await this.repository.countUsers(organizationId, client);
      if (count >= limit) {
        throw new SubscriptionLimitError(
          'SUBSCRIPTION_LIMIT_REACHED',
          `SUBSCRIPTION_LIMIT_REACHED: Organization reached maximum user limit of ${limit} for plan '${subscription.plan.code}'.`,
          403,
          { metric: 'users', limit, current: count }
        );
      }
    }
  }

  async assertCanCreateLocation(organizationId: string, client?: DatabaseClient): Promise<void> {
    const subscription = await this.getTenantSubscription(organizationId, client, Boolean(client));
    if (!subscription) {
      throw new SubscriptionLimitError('SUBSCRIPTION_NOT_FOUND', 'SUBSCRIPTION_NOT_FOUND: Organization subscription not found', 403);
    }
    if (!['trialing', 'active'].includes(subscription.status)) {
      throw new SubscriptionLimitError('SUBSCRIPTION_INACTIVE', `SUBSCRIPTION_INACTIVE: Subscription status is '${subscription.status}'`, 403);
    }
    const count = await this.repository.countLocations(organizationId, client);
    const limit = subscription.plan.limits.locations;
    if (typeof limit === 'number' && Number.isFinite(limit) && count >= limit) {
      throw new SubscriptionLimitError(
        'SUBSCRIPTION_LIMIT_REACHED',
        `SUBSCRIPTION_LIMIT_REACHED: Organization reached maximum location limit of ${limit} for plan '${subscription.plan.code}'.`,
        403,
        { metric: 'locations', limit, current: count }
      );
    }
    if (count >= 1 && subscription.plan.features.multi_location !== true) {
      throw new SubscriptionLimitError(
        'FEATURE_NOT_AVAILABLE',
        `FEATURE_NOT_INCLUDED: Multi-location feature is not included in plan '${subscription.plan.code}'. Upgrade to Professional or Enterprise to add more locations.`,
        403
      );
    }
  }

  async assertCanCreateProduct(organizationId: string, currentCount?: number, client?: DatabaseClient): Promise<void> {
    const count = typeof currentCount === 'number'
      ? currentCount
      : await this.repository.countProducts(organizationId, client);
    await this.assertWithinLimit(organizationId, 'products', count, client, Boolean(client));
  }

  async assertCanCreateOrder(organizationId: string, client?: DatabaseClient): Promise<void> {
    const subscription = await this.getTenantSubscription(organizationId, client, Boolean(client));
    if (!subscription) {
      throw new SubscriptionLimitError('SUBSCRIPTION_NOT_FOUND', 'SUBSCRIPTION_NOT_FOUND: Organization subscription not found', 403);
    }
    if (!['trialing', 'active'].includes(subscription.status)) {
      throw new SubscriptionLimitError('SUBSCRIPTION_INACTIVE', `SUBSCRIPTION_INACTIVE: Subscription status is '${subscription.status}'`, 403);
    }
    const limit = subscription.plan.limits.monthly_orders;
    if (typeof limit === 'number' && Number.isFinite(limit)) {
      const periodStart = new Date(subscription.current_period_start);
      const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : undefined;
      const count = await this.repository.countMonthlyOrders(organizationId, periodStart, periodEnd, client);
      if (count >= limit) {
        throw new SubscriptionLimitError(
          'SUBSCRIPTION_LIMIT_REACHED',
          `SUBSCRIPTION_LIMIT_REACHED: Organization reached monthly order limit of ${limit} for plan '${subscription.plan.code}'.`,
          403,
          { metric: 'monthly_orders', limit, current: count }
        );
      }
    }
  }

  private getDb(client?: DatabaseClient): DatabaseClient {
    return client || this.db || (this.repository as any).db || getDatabaseClient();
  }

  async getPlans(includeInactive = false, client?: DatabaseClient): Promise<SubscriptionPlan[]> {
    return this.repository.listPlans(includeInactive);
  }

  async getPlan(codeOrId: string, client?: DatabaseClient): Promise<SubscriptionPlan | null> {
    return this.repository.getPlanByIdOrCode(codeOrId, client);
  }

  async updatePlan(
    codeOrId: string,
    updates: {
      name?: string;
      description?: string | null;
      amount?: number | string;
      currency?: string;
      billing_interval?: 'monthly' | 'yearly';
      trial_days?: number;
      limits?: Record<string, number>;
      features?: Record<string, boolean>;
      is_active?: boolean;
      display_order?: number;
    },
    actor: { id: string; name?: string; role?: string },
    client?: DatabaseClient
  ): Promise<SubscriptionPlan> {
    const db = this.getDb(client);
    return db.withTransaction(async (tx) => {
      const existing = await this.repository.getPlanByIdOrCode(codeOrId, tx);
      if (!existing) {
        throw new SubscriptionLimitError('PLAN_NOT_FOUND', `Subscription plan '${codeOrId}' not found.`, 404);
      }

      const updated = await this.repository.updatePlan(codeOrId, updates, tx);
      if (!updated) {
        throw new SubscriptionLimitError('PLAN_NOT_FOUND', `Subscription plan '${codeOrId}' not found.`, 404);
      }

      await tx.query(
        `INSERT INTO audit_events (
          id, organization_id, actor_id, actor_name, actor_role, action,
          entity_type, entity_id, before_state, after_state, metadata, severity, result
        ) VALUES (
          $1, NULL, $2, $3, $4, 'PLATFORM_PLAN_UPDATED',
          'PLAN', $5, $6, $7, $8, 'High', 'SUCCESS'
        )`,
        [
          'aud_' + (await import('node:crypto')).randomUUID(),
          actor.id,
          actor.name || actor.id,
          actor.role || 'system_owner',
          updated.id,
          JSON.stringify(existing),
          JSON.stringify(updated),
          JSON.stringify({ updatedFields: Object.keys(updates) }),
        ]
      );

      return updated;
    });
  }

  async listSubscriptions(
    filters: { status?: string; plan?: string; search?: string; limit?: number; offset?: number } = {},
    client?: DatabaseClient
  ): Promise<{ subscriptions: any[]; total: number }> {
    return this.repository.listAllSubscriptions(filters, client);
  }

  async getSubscriptionDetails(organizationId: string, client?: DatabaseClient): Promise<any> {
    const details = await this.repository.getSubscriptionDetails(organizationId, client);
    if (!details) {
      throw new SubscriptionLimitError('SUBSCRIPTION_NOT_FOUND', `Subscription not found for organization '${organizationId}'.`, 404);
    }
    return details;
  }

  async getSubscriptionAuditHistory(organizationId: string, client?: DatabaseClient): Promise<any[]> {
    return this.repository.getSubscriptionAuditHistory(organizationId, client);
  }

  async changePlan(
    organizationId: string,
    newPlanCodeOrId: string,
    actor: { id: string; name?: string; role?: string },
    reason?: string,
    idempotencyKey?: string,
    client?: DatabaseClient
  ): Promise<any> {
    if (!organizationId?.trim()) {
      throw new SubscriptionLimitError('TENANT_REQUIRED', 'Organization ID is required.', 400);
    }
    const db = this.getDb(client);

    return db.withTransaction(async (tx) => {
      // 1. Validate new plan
      const newPlan = await this.repository.getPlanByIdOrCode(newPlanCodeOrId, tx);
      if (!newPlan) {
        throw new SubscriptionLimitError('PLAN_NOT_FOUND', `Target plan '${newPlanCodeOrId}' not found.`, 404);
      }
      if (!newPlan.is_active) {
        throw new SubscriptionLimitError('INACTIVE_PLAN', `Plan '${newPlan.code}' is currently inactive.`, 422);
      }

      // 2. Lock organization row
      const orgRes = await tx.query<any>(
        'SELECT id, name, plan_tier, is_active FROM organizations WHERE id = $1 FOR UPDATE',
        [organizationId.trim()]
      );
      if (orgRes.rows.length === 0) {
        throw new SubscriptionLimitError('TENANT_NOT_FOUND', `Organization '${organizationId}' not found.`, 404);
      }

      // 3. Lock subscription row
      const current = await this.repository.getForOrganization(organizationId.trim(), tx, true);
      if (!current) {
        throw new SubscriptionLimitError('SUBSCRIPTION_NOT_FOUND', `No subscription found for organization '${organizationId}'.`, 404);
      }

      if (['cancelled', 'expired'].includes(current.status)) {
        throw new SubscriptionLimitError(
          'INVALID_STATE_TRANSITION',
          `Cannot change plan on subscription with status '${current.status}'. Restore subscription first.`,
          422
        );
      }

      // Idempotency check: already on target plan
      if (current.plan_id === newPlan.id) {
        return this.repository.getSubscriptionDetails(organizationId.trim(), tx);
      }

      // 4. Update subscription
      await tx.query(
        'UPDATE organization_subscriptions SET plan_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newPlan.id, current.id]
      );

      // 5. Update organization plan_tier
      await tx.query(
        'UPDATE organizations SET plan_tier = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newPlan.code, organizationId.trim()]
      );

      // 6. Record transactional audit event
      const afterState = {
        subscriptionId: current.id,
        planId: newPlan.id,
        planCode: newPlan.code,
        status: current.status,
      };

      await this.repository.recordSubscriptionAudit(tx, {
        organizationId: organizationId.trim(),
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'PLATFORM_SUBSCRIPTION_PLAN_CHANGED',
        beforeState: { planId: current.plan_id, planCode: current.plan.code, status: current.status },
        afterState,
        reason,
        idempotencyKey,
      });

      return this.repository.getSubscriptionDetails(organizationId.trim(), tx);
    });
  }

  async extendTrial(
    organizationId: string,
    additionalDays: number,
    actor: { id: string; name?: string; role?: string },
    reason?: string,
    idempotencyKey?: string,
    client?: DatabaseClient
  ): Promise<any> {
    const days = Number(additionalDays);
    if (!Number.isFinite(days) || days <= 0 || !Number.isInteger(days)) {
      throw new SubscriptionLimitError('INVALID_TRIAL_DAYS', 'Additional trial days must be a positive integer.', 422);
    }
    const db = this.getDb(client);

    return db.withTransaction(async (tx) => {
      // 1. Lock org
      await tx.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [organizationId.trim()]);

      // 2. Lock subscription
      const current = await this.repository.getForOrganization(organizationId.trim(), tx, true);
      if (!current) {
        throw new SubscriptionLimitError('SUBSCRIPTION_NOT_FOUND', `Subscription not found for organization '${organizationId}'.`, 404);
      }

      if (['cancelled', 'expired'].includes(current.status)) {
        throw new SubscriptionLimitError(
          'INVALID_STATE_TRANSITION',
          `Cannot extend trial on subscription with status '${current.status}'.`,
          422
        );
      }

      // Calculate extended dates
      const baseTime = current.trial_ends_at && new Date(current.trial_ends_at).getTime() > Date.now()
        ? new Date(current.trial_ends_at).getTime()
        : Date.now();
      const newTrialEndsAt = new Date(baseTime + days * 24 * 60 * 60 * 1000);

      const currentPeriodEndTime = new Date(current.current_period_end).getTime();
      const newPeriodEnd = currentPeriodEndTime < newTrialEndsAt.getTime()
        ? newTrialEndsAt
        : new Date(currentPeriodEndTime);

      await tx.query(
        `UPDATE organization_subscriptions
         SET status = 'trialing',
             trial_ends_at = $1,
             current_period_end = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [newTrialEndsAt.toISOString(), newPeriodEnd.toISOString(), current.id]
      );

      const afterState = {
        subscriptionId: current.id,
        status: 'trialing',
        trial_ends_at: newTrialEndsAt.toISOString(),
        current_period_end: newPeriodEnd.toISOString(),
      };

      await this.repository.recordSubscriptionAudit(tx, {
        organizationId: organizationId.trim(),
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'PLATFORM_SUBSCRIPTION_TRIAL_EXTENDED',
        beforeState: {
          status: current.status,
          trial_ends_at: current.trial_ends_at,
          current_period_end: current.current_period_end,
        },
        afterState,
        reason,
        idempotencyKey,
      });

      return this.repository.getSubscriptionDetails(organizationId.trim(), tx);
    });
  }

  async suspendSubscription(
    organizationId: string,
    actor: { id: string; name?: string; role?: string },
    reason?: string,
    idempotencyKey?: string,
    client?: DatabaseClient
  ): Promise<any> {
    const db = this.getDb(client);

    return db.withTransaction(async (tx) => {
      await tx.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [organizationId.trim()]);

      const current = await this.repository.getForOrganization(organizationId.trim(), tx, true);
      if (!current) {
        throw new SubscriptionLimitError('SUBSCRIPTION_NOT_FOUND', `Subscription not found for organization '${organizationId}'.`, 404);
      }

      if (current.status === 'paused') {
        return this.repository.getSubscriptionDetails(organizationId.trim(), tx);
      }

      if (['cancelled', 'expired'].includes(current.status)) {
        throw new SubscriptionLimitError(
          'INVALID_STATE_TRANSITION',
          `Cannot suspend an already ${current.status} subscription.`,
          422
        );
      }

      await tx.query(
        "UPDATE organization_subscriptions SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [current.id]
      );

      await this.repository.recordSubscriptionAudit(tx, {
        organizationId: organizationId.trim(),
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'PLATFORM_SUBSCRIPTION_SUSPENDED',
        beforeState: { status: current.status },
        afterState: { status: 'paused' },
        reason,
        idempotencyKey,
      });

      return this.repository.getSubscriptionDetails(organizationId.trim(), tx);
    });
  }

  async reactivateSubscription(
    organizationId: string,
    actor: { id: string; name?: string; role?: string },
    reason?: string,
    idempotencyKey?: string,
    client?: DatabaseClient
  ): Promise<any> {
    const db = this.getDb(client);

    return db.withTransaction(async (tx) => {
      await tx.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [organizationId.trim()]);

      const current = await this.repository.getForOrganization(organizationId.trim(), tx, true);
      if (!current) {
        throw new SubscriptionLimitError('SUBSCRIPTION_NOT_FOUND', `Subscription not found for organization '${organizationId}'.`, 404);
      }

      if (['active', 'trialing'].includes(current.status)) {
        return this.repository.getSubscriptionDetails(organizationId.trim(), tx);
      }

      if (['cancelled', 'expired'].includes(current.status)) {
        throw new SubscriptionLimitError(
          'INVALID_STATE_TRANSITION',
          `Cannot reactivate a ${current.status} subscription. Use restore instead.`,
          422
        );
      }

      const isTrialStillActive = current.trial_ends_at && new Date(current.trial_ends_at).getTime() > Date.now();
      const newStatus = isTrialStillActive ? 'trialing' : 'active';

      await tx.query(
        'UPDATE organization_subscriptions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newStatus, current.id]
      );

      await this.repository.recordSubscriptionAudit(tx, {
        organizationId: organizationId.trim(),
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'PLATFORM_SUBSCRIPTION_REACTIVATED',
        beforeState: { status: current.status },
        afterState: { status: newStatus },
        reason,
        idempotencyKey,
      });

      return this.repository.getSubscriptionDetails(organizationId.trim(), tx);
    });
  }

  async cancelSubscription(
    organizationId: string,
    immediate: boolean,
    actor: { id: string; name?: string; role?: string },
    reason?: string,
    idempotencyKey?: string,
    client?: DatabaseClient
  ): Promise<any> {
    const db = this.getDb(client);

    return db.withTransaction(async (tx) => {
      await tx.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [organizationId.trim()]);

      const current = await this.repository.getForOrganization(organizationId.trim(), tx, true);
      if (!current) {
        throw new SubscriptionLimitError('SUBSCRIPTION_NOT_FOUND', `Subscription not found for organization '${organizationId}'.`, 404);
      }

      if (immediate) {
        if (current.status === 'cancelled') {
          return this.repository.getSubscriptionDetails(organizationId.trim(), tx);
        }

        await tx.query(
          `UPDATE organization_subscriptions
           SET status = 'cancelled',
               cancelled_at = CURRENT_TIMESTAMP,
               cancel_at_period_end = false,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [current.id]
        );

        await this.repository.recordSubscriptionAudit(tx, {
          organizationId: organizationId.trim(),
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          action: 'PLATFORM_SUBSCRIPTION_CANCELLED',
          beforeState: { status: current.status, cancel_at_period_end: current.cancel_at_period_end },
          afterState: { status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_at_period_end: false },
          reason,
          idempotencyKey,
        });
      } else {
        // Scheduled cancellation at period end (User correction #3)
        if (current.cancel_at_period_end) {
          return this.repository.getSubscriptionDetails(organizationId.trim(), tx);
        }

        await tx.query(
          'UPDATE organization_subscriptions SET cancel_at_period_end = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [current.id]
        );

        await this.repository.recordSubscriptionAudit(tx, {
          organizationId: organizationId.trim(),
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          action: 'PLATFORM_SUBSCRIPTION_CANCELLED',
          beforeState: { cancel_at_period_end: false },
          afterState: { cancel_at_period_end: true, effectiveAt: current.current_period_end },
          reason,
          idempotencyKey,
        });
      }

      return this.repository.getSubscriptionDetails(organizationId.trim(), tx);
    });
  }

  async restoreSubscription(
    organizationId: string,
    actor: { id: string; name?: string; role?: string },
    reason?: string,
    idempotencyKey?: string,
    client?: DatabaseClient
  ): Promise<any> {
    const db = this.getDb(client);

    return db.withTransaction(async (tx) => {
      await tx.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [organizationId.trim()]);

      const current = await this.repository.getForOrganization(organizationId.trim(), tx, true);
      if (!current) {
        throw new SubscriptionLimitError('SUBSCRIPTION_NOT_FOUND', `Subscription not found for organization '${organizationId}'.`, 404);
      }

      if (['active', 'trialing'].includes(current.status)) {
        return this.repository.getSubscriptionDetails(organizationId.trim(), tx);
      }

      // User correction #4: Restore semantics validation
      if (!['cancelled', 'expired', 'paused'].includes(current.status)) {
        throw new SubscriptionLimitError('INVALID_STATE_TRANSITION', `Cannot restore subscription with status '${current.status}'.`, 422);
      }

      // Validate plan is still active
      if (!current.plan.is_active) {
        throw new SubscriptionLimitError(
          'INVALID_PLAN_STATE',
          `Cannot restore subscription: assigned plan '${current.plan.code}' is no longer active. Assign an active plan first.`,
          422
        );
      }

      // Check if tenant already has another active billable subscription
      const conflictRes = await tx.query<any>(
        "SELECT id FROM organization_subscriptions WHERE organization_id = $1 AND id <> $2 AND status IN ('active', 'trialing', 'paused') LIMIT 1",
        [organizationId.trim(), current.id]
      );
      if (conflictRes.rows.length > 0) {
        throw new SubscriptionLimitError('ACTIVE_SUBSCRIPTION_CONFLICT', 'Tenant already has an active or trialing subscription.', 409);
      }

      // Ensure billing period is coherent
      let periodStart = current.current_period_start;
      let periodEnd = current.current_period_end;
      if (new Date(current.current_period_end).getTime() <= Date.now()) {
        const now = new Date();
        const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        periodStart = now.toISOString();
        periodEnd = thirtyDaysLater.toISOString();
      }

      await tx.query(
        `UPDATE organization_subscriptions
         SET status = 'active',
             cancelled_at = NULL,
             cancel_at_period_end = false,
             current_period_start = $1,
             current_period_end = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [periodStart, periodEnd, current.id]
      );

      await this.repository.recordSubscriptionAudit(tx, {
        organizationId: organizationId.trim(),
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'PLATFORM_SUBSCRIPTION_RESTORED',
        beforeState: { status: current.status, cancelled_at: current.cancelled_at },
        afterState: { status: 'active', current_period_start: periodStart, current_period_end: periodEnd },
        reason,
        idempotencyKey,
      });

      return this.repository.getSubscriptionDetails(organizationId.trim(), tx);
    });
  }

  async getBillingOverview(client?: DatabaseClient): Promise<{
    status: string;
    mrr: number;
    currency: string;
    activeCount: number;
    trialingCount: number;
    pausedCount: number;
    cancelledCount: number;
    planDistribution: Array<{
      code: string;
      name: string;
      amount: string;
      currency: string;
      totalSubscriptions: number;
      activeSubscriptions: number;
      trialingSubscriptions: number;
    }>;
    lastUpdated: string;
  }> {
    const db = this.getDb(client);

    // User correction #6:
    // Active paid subscriptions only, normalized monthly equivalent, exclude trials, paused, cancelled.
    const aggRes = await db.query<any>(`
      SELECT
        COUNT(CASE WHEN os.status = 'active' THEN 1 END)::int AS active_count,
        COUNT(CASE WHEN os.status = 'trialing' OR (os.status = 'active' AND os.trial_ends_at > CURRENT_TIMESTAMP) THEN 1 END)::int AS trialing_count,
        COUNT(CASE WHEN os.status = 'paused' THEN 1 END)::int AS paused_count,
        COUNT(CASE WHEN os.status IN ('cancelled', 'expired') THEN 1 END)::int AS cancelled_count,
        COALESCE(SUM(
          CASE
            WHEN os.status = 'active' AND (os.trial_ends_at IS NULL OR os.trial_ends_at <= CURRENT_TIMESTAMP) AND sp.amount > 0
            THEN (CASE WHEN sp.billing_interval = 'yearly' THEN sp.amount / 12.0 ELSE sp.amount END)
            ELSE 0
          END
        ), 0)::numeric(15, 2) AS mrr
      FROM organization_subscriptions os
      JOIN subscription_plans sp ON sp.id = os.plan_id
    `);

    const distRes = await db.query<any>(`
      SELECT
        sp.code,
        sp.name,
        sp.amount::text AS amount,
        sp.currency,
        COUNT(os.id)::int AS total_subscriptions,
        COUNT(CASE WHEN os.status = 'active' THEN 1 END)::int AS active_subscriptions,
        COUNT(CASE WHEN os.status = 'trialing' THEN 1 END)::int AS trialing_subscriptions
      FROM subscription_plans sp
      LEFT JOIN organization_subscriptions os ON os.plan_id = sp.id
      GROUP BY sp.id, sp.code, sp.name, sp.amount, sp.currency, sp.display_order
      ORDER BY sp.display_order ASC, sp.amount ASC
    `);

    const row = aggRes.rows[0];
    return {
      status: 'operational',
      mrr: Number(row?.mrr || 0),
      currency: 'SLE',
      activeCount: Number(row?.active_count || 0),
      trialingCount: Number(row?.trialing_count || 0),
      pausedCount: Number(row?.paused_count || 0),
      cancelledCount: Number(row?.cancelled_count || 0),
      planDistribution: distRes.rows.map((r: any) => ({
        code: r.code,
        name: r.name,
        amount: r.amount,
        currency: r.currency,
        totalSubscriptions: Number(r.total_subscriptions),
        activeSubscriptions: Number(r.active_subscriptions),
        trialingSubscriptions: Number(r.trialing_subscriptions),
      })),
      lastUpdated: new Date().toISOString(),
    };
  }
}
