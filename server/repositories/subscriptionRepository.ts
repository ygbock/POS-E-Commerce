import { randomUUID } from 'node:crypto';
import { DatabaseClient, getDatabaseClient } from '../db/client';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired';

export interface SubscriptionPlan {
  id: string; code: string; name: string; description: string | null;
  amount: string; currency: string; billing_interval: 'monthly' | 'yearly';
  trial_days: number; limits: Record<string, number>; features: Record<string, boolean>;
  is_active: boolean; display_order: number; created_at: string; updated_at: string;
}

export interface OrganizationSubscription {
  id: string; organization_id: string; plan_id: string; status: SubscriptionStatus;
  current_period_start: string; current_period_end: string; trial_ends_at: string | null;
  cancel_at_period_end: boolean; cancelled_at: string | null; provider: string | null;
  provider_customer_id: string | null; provider_subscription_id: string | null;
  metadata: Record<string, unknown>; created_at: string; updated_at: string;
}

export class SubscriptionRepository {
  private readonly db: DatabaseClient;
  constructor(db?: DatabaseClient) { this.db = db || getDatabaseClient(); }

  async listPlans(includeInactive = false): Promise<SubscriptionPlan[]> {
    const result = await this.db.query<SubscriptionPlan>(
      'SELECT id, code, name, description, amount::text, currency, billing_interval, trial_days, limits, features, is_active, display_order, created_at, updated_at ' +
      'FROM subscription_plans ' + (includeInactive ? '' : 'WHERE is_active = true ') +
      'ORDER BY display_order ASC, amount ASC, code ASC'
    );
    return result.rows;
  }

  async getPlanByCode(code: string): Promise<SubscriptionPlan | null> {
    const result = await this.db.query<SubscriptionPlan>(
      'SELECT id, code, name, description, amount::text, currency, billing_interval, trial_days, limits, features, is_active, display_order, created_at, updated_at ' +
      'FROM subscription_plans WHERE code = $1 LIMIT 1',
      [code.trim().toLowerCase()]
    );
    return result.rows[0] || null;
  }

  async getForOrganization(organizationId: string, client?: DatabaseClient, forUpdate = false): Promise<(OrganizationSubscription & { plan: SubscriptionPlan }) | null> {
    const db = client || this.db;
    const lockClause = forUpdate ? ' FOR UPDATE OF os' : '';
    const result = await db.query<any>(
      'SELECT os.*, sp.code AS plan_code, sp.name AS plan_name, sp.description AS plan_description, ' +
      'sp.amount::text AS plan_amount, sp.currency AS plan_currency, sp.billing_interval AS plan_billing_interval, ' +
      'sp.trial_days AS plan_trial_days, sp.limits AS plan_limits, sp.features AS plan_features, ' +
      'sp.is_active AS plan_is_active, sp.display_order AS plan_display_order, sp.created_at AS plan_created_at, sp.updated_at AS plan_updated_at ' +
      'FROM organization_subscriptions os JOIN subscription_plans sp ON sp.id = os.plan_id ' +
      'WHERE os.organization_id = $1 ORDER BY os.created_at DESC LIMIT 1' + lockClause,
      [organizationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id, organization_id: row.organization_id, plan_id: row.plan_id, status: row.status,
      current_period_start: row.current_period_start, current_period_end: row.current_period_end,
      trial_ends_at: row.trial_ends_at, cancel_at_period_end: row.cancel_at_period_end,
      cancelled_at: row.cancelled_at, provider: row.provider,
      provider_customer_id: row.provider_customer_id, provider_subscription_id: row.provider_subscription_id,
      metadata: row.metadata || {}, created_at: row.created_at, updated_at: row.updated_at,
      plan: {
        id: row.plan_id, code: row.plan_code, name: row.plan_name, description: row.plan_description,
        amount: row.plan_amount, currency: row.plan_currency, billing_interval: row.plan_billing_interval,
        trial_days: Number(row.plan_trial_days), limits: row.plan_limits || {}, features: row.plan_features || {},
        is_active: Boolean(row.plan_is_active), display_order: Number(row.plan_display_order),
        created_at: row.plan_created_at, updated_at: row.plan_updated_at
      }
    };
  }

  async countUsers(organizationId: string, client?: DatabaseClient): Promise<number> {
    const db = client || this.db;
    const result = await db.query<{ count: string | number }>(
      'SELECT COUNT(*)::int AS count FROM users WHERE organization_id = $1',
      [organizationId]
    );
    return Number(result.rows[0]?.count || 0);
  }

  async countLocations(organizationId: string, client?: DatabaseClient): Promise<number> {
    const db = client || this.db;
    const result = await db.query<{ count: string | number }>(
      'SELECT COUNT(*)::int AS count FROM locations WHERE organization_id = $1',
      [organizationId]
    );
    return Number(result.rows[0]?.count || 0);
  }

  async countProducts(organizationId: string, client?: DatabaseClient): Promise<number> {
    const db = client || this.db;
    const result = await db.query<{ count: string | number }>(
      'SELECT COUNT(*)::int AS count FROM products WHERE organization_id = $1',
      [organizationId]
    );
    return Number(result.rows[0]?.count || 0);
  }

  async countMonthlyOrders(organizationId: string, periodStart: Date, periodEnd?: Date, client?: DatabaseClient): Promise<number> {
    const db = client || this.db;
    const params: any[] = [organizationId, periodStart.toISOString()];
    let query = 'SELECT COUNT(*)::int AS count FROM orders WHERE organization_id = $1 AND created_at >= $2::timestamptz';
    if (periodEnd) {
      params.push(periodEnd.toISOString());
      query += ' AND created_at <= $3::timestamptz';
    }
    const result = await db.query<{ count: string | number }>(query, params);
    return Number(result.rows[0]?.count || 0);
  }

  async getPlanByIdOrCode(idOrCode: string, client?: DatabaseClient): Promise<SubscriptionPlan | null> {
    const db = client || this.db;
    const clean = idOrCode.trim().toLowerCase();
    const result = await db.query<SubscriptionPlan>(
      'SELECT id, code, name, description, amount::text, currency, billing_interval, trial_days, limits, features, is_active, display_order, created_at, updated_at ' +
      'FROM subscription_plans WHERE id = $1 OR code = $2 LIMIT 1',
      [idOrCode.trim(), clean]
    );
    return result.rows[0] || null;
  }

  async updatePlan(
    idOrCode: string,
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
    client?: DatabaseClient
  ): Promise<SubscriptionPlan | null> {
    const db = client || this.db;
    const existing = await this.getPlanByIdOrCode(idOrCode, db);
    if (!existing) return null;

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      values.push(updates.name.trim());
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${idx++}`);
      values.push(updates.description);
    }
    if (updates.amount !== undefined) {
      const amt = Number(updates.amount);
      if (!Number.isFinite(amt) || amt < 0) throw new Error('INVALID_PLAN_AMOUNT: Amount must be a non-negative number.');
      setClauses.push(`amount = $${idx++}`);
      values.push(amt.toFixed(2));
    }
    if (updates.currency !== undefined) {
      setClauses.push(`currency = $${idx++}`);
      values.push(updates.currency.trim().toUpperCase());
    }
    if (updates.billing_interval !== undefined) {
      if (!['monthly', 'yearly'].includes(updates.billing_interval)) {
        throw new Error("INVALID_BILLING_INTERVAL: Interval must be 'monthly' or 'yearly'.");
      }
      setClauses.push(`billing_interval = $${idx++}`);
      values.push(updates.billing_interval);
    }
    if (updates.trial_days !== undefined) {
      const days = Number(updates.trial_days);
      if (!Number.isFinite(days) || days < 0) throw new Error('INVALID_TRIAL_DAYS: Trial days must be non-negative integer.');
      setClauses.push(`trial_days = $${idx++}`);
      values.push(Math.floor(days));
    }
    if (updates.limits !== undefined) {
      setClauses.push(`limits = $${idx++}::jsonb`);
      values.push(JSON.stringify(updates.limits));
    }
    if (updates.features !== undefined) {
      setClauses.push(`features = $${idx++}::jsonb`);
      values.push(JSON.stringify(updates.features));
    }
    if (updates.is_active !== undefined) {
      setClauses.push(`is_active = $${idx++}`);
      values.push(Boolean(updates.is_active));
    }
    if (updates.display_order !== undefined) {
      setClauses.push(`display_order = $${idx++}`);
      values.push(Number(updates.display_order));
    }

    if (setClauses.length === 0) return existing;

    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    values.push(existing.id);

    const result = await db.query<SubscriptionPlan>(
      `UPDATE subscription_plans SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, code, name, description, amount::text, currency, billing_interval, trial_days, limits, features, is_active, display_order, created_at, updated_at`,
      values
    );
    return result.rows[0] || null;
  }

  async listAllSubscriptions(
    filters: {
      status?: string;
      plan?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
    client?: DatabaseClient
  ): Promise<{ subscriptions: any[]; total: number }> {
    const db = client || this.db;
    const whereClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.status && filters.status !== 'all') {
      whereClauses.push(`os.status = $${idx++}`);
      params.push(filters.status.trim().toLowerCase());
    }

    if (filters.plan && filters.plan !== 'all') {
      whereClauses.push(`sp.code = $${idx++}`);
      params.push(filters.plan.trim().toLowerCase());
    }

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      whereClauses.push(`(o.name ILIKE $${idx} OR o.code ILIKE $${idx} OR o.slug ILIKE $${idx})`);
      params.push(term);
      idx++;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await db.query<{ count: string | number }>(
      `SELECT COUNT(*)::int AS count
       FROM organization_subscriptions os
       JOIN subscription_plans sp ON sp.id = os.plan_id
       JOIN organizations o ON o.id = os.organization_id
       ${whereSql}`,
      params
    );
    const total = Number(countRes.rows[0]?.count || 0);

    const limit = Math.min(Math.max(Number(filters.limit || 50), 1), 200);
    const offset = Math.max(Number(filters.offset || 0), 0);

    const dataParams = [...params, limit, offset];
    const query = `
      SELECT
        os.id,
        os.organization_id,
        o.name AS organization_name,
        o.code AS organization_code,
        o.slug AS organization_slug,
        o.is_active AS organization_is_active,
        os.plan_id,
        sp.code AS plan_code,
        sp.name AS plan_name,
        sp.amount::text AS plan_amount,
        sp.currency AS plan_currency,
        sp.billing_interval AS plan_billing_interval,
        sp.limits AS plan_limits,
        sp.features AS plan_features,
        os.status,
        os.current_period_start,
        os.current_period_end,
        os.trial_ends_at,
        os.cancel_at_period_end,
        os.cancelled_at,
        os.provider,
        os.provider_customer_id,
        os.provider_subscription_id,
        os.metadata,
        os.created_at,
        os.updated_at
      FROM organization_subscriptions os
      JOIN subscription_plans sp ON sp.id = os.plan_id
      JOIN organizations o ON o.id = os.organization_id
      ${whereSql}
      ORDER BY os.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const result = await db.query<any>(query, dataParams);
    return { subscriptions: result.rows, total };
  }

  async getSubscriptionDetails(
    organizationId: string,
    client?: DatabaseClient,
    forUpdate = false
  ): Promise<any | null> {
    const db = client || this.db;
    const lockClause = forUpdate ? ' FOR UPDATE OF os' : '';
    const result = await db.query<any>(
      `SELECT
        os.*,
        o.name AS organization_name,
        o.code AS organization_code,
        o.slug AS organization_slug,
        o.is_active AS organization_is_active,
        sp.code AS plan_code,
        sp.name AS plan_name,
        sp.description AS plan_description,
        sp.amount::text AS plan_amount,
        sp.currency AS plan_currency,
        sp.billing_interval AS plan_billing_interval,
        sp.trial_days AS plan_trial_days,
        sp.limits AS plan_limits,
        sp.features AS plan_features,
        sp.is_active AS plan_is_active
      FROM organization_subscriptions os
      JOIN subscription_plans sp ON sp.id = os.plan_id
      JOIN organizations o ON o.id = os.organization_id
      WHERE os.organization_id = $1
      ORDER BY os.created_at DESC
      LIMIT 1${lockClause}`,
      [organizationId.trim()]
    );

    const row = result.rows[0];
    if (!row) return null;

    // Use authoritative counters from TASK-5.6.2
    const periodStart = new Date(row.current_period_start);
    const periodEnd = row.current_period_end ? new Date(row.current_period_end) : undefined;
    const [usersCount, locationsCount, productsCount, monthlyOrdersCount] = await Promise.all([
      this.countUsers(organizationId, db),
      this.countLocations(organizationId, db),
      this.countProducts(organizationId, db),
      this.countMonthlyOrders(organizationId, periodStart, periodEnd, db),
    ]);

    return {
      id: row.id,
      organization_id: row.organization_id,
      organization_name: row.organization_name,
      organization_code: row.organization_code,
      organization_slug: row.organization_slug,
      organization_is_active: Boolean(row.organization_is_active),
      plan: {
        id: row.plan_id,
        code: row.plan_code,
        name: row.plan_name,
        description: row.plan_description,
        amount: row.plan_amount,
        currency: row.plan_currency,
        billing_interval: row.plan_billing_interval,
        trial_days: Number(row.plan_trial_days),
        limits: row.plan_limits || {},
        features: row.plan_features || {},
        is_active: Boolean(row.plan_is_active),
      },
      status: row.status,
      current_period_start: row.current_period_start,
      current_period_end: row.current_period_end,
      trial_ends_at: row.trial_ends_at,
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
      cancelled_at: row.cancelled_at,
      provider: row.provider,
      provider_customer_id: row.provider_customer_id,
      provider_subscription_id: row.provider_subscription_id,
      metadata: row.metadata || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
      usage: {
        users: usersCount,
        locations: locationsCount,
        products: productsCount,
        monthly_orders: monthlyOrdersCount,
      },
    };
  }

  async getSubscriptionAuditHistory(organizationId: string, client?: DatabaseClient): Promise<any[]> {
    const db = client || this.db;
    const result = await db.query<any>(
      `SELECT id, organization_id, actor_id, actor_name, actor_role, action, entity_type, entity_id,
              before_state, after_state, metadata, severity, result, timestamp, timestamp AS created_at
       FROM audit_events
       WHERE organization_id = $1
         AND (entity_type = 'SUBSCRIPTION' OR action LIKE 'PLATFORM_SUBSCRIPTION_%' OR action LIKE 'SUBSCRIPTION_%')
       ORDER BY timestamp DESC
       LIMIT 50`,
      [organizationId.trim()]
    );
    return result.rows;
  }

  async recordSubscriptionAudit(
    client: DatabaseClient,
    params: {
      organizationId: string;
      actorId: string;
      actorName?: string;
      actorRole?: string;
      action: string;
      beforeState?: any;
      afterState?: any;
      reason?: string;
      metadata?: Record<string, unknown>;
      idempotencyKey?: string;
    }
  ): Promise<void> {
    const id = 'aud_' + randomUUID();
    const meta = {
      ...(params.metadata || {}),
      reason: params.reason || null,
      idempotencyKey: params.idempotencyKey || null,
    };
    await client.query(
      `INSERT INTO audit_events (
        id, organization_id, actor_id, actor_name, actor_role, action,
        entity_type, entity_id, before_state, after_state, metadata, severity, result
      ) VALUES ($1, $2, $3, $4, $5, $6, 'SUBSCRIPTION', $7, $8, $9, $10, 'Medium', 'SUCCESS')`,
      [
        id,
        params.organizationId,
        params.actorId,
        params.actorName || params.actorId,
        params.actorRole || 'system_owner',
        params.action,
        params.organizationId,
        params.beforeState ? JSON.stringify(params.beforeState) : null,
        params.afterState ? JSON.stringify(params.afterState) : null,
        JSON.stringify(meta),
      ]
    );
  }
}
