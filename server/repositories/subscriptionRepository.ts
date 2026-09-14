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

  async getForOrganization(organizationId: string): Promise<(OrganizationSubscription & { plan: SubscriptionPlan }) | null> {
    const result = await this.db.query<any>(
      'SELECT os.*, sp.code AS plan_code, sp.name AS plan_name, sp.description AS plan_description, ' +
      'sp.amount::text AS plan_amount, sp.currency AS plan_currency, sp.billing_interval AS plan_billing_interval, ' +
      'sp.trial_days AS plan_trial_days, sp.limits AS plan_limits, sp.features AS plan_features, ' +
      'sp.is_active AS plan_is_active, sp.display_order AS plan_display_order, sp.created_at AS plan_created_at, sp.updated_at AS plan_updated_at ' +
      'FROM organization_subscriptions os JOIN subscription_plans sp ON sp.id = os.plan_id ' +
      'WHERE os.organization_id = $1 ORDER BY os.created_at DESC LIMIT 1',
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

  async createSubscription(
    organizationId: string, planId: string, periodStart: Date, periodEnd: Date,
    trialEndsAt: Date | null = null, client?: DatabaseClient
  ): Promise<OrganizationSubscription> {
    const db = client || this.db;
    const id = 'sub_' + randomUUID();
    const result = await db.query<OrganizationSubscription>(
      'INSERT INTO organization_subscriptions (id, organization_id, plan_id, status, current_period_start, current_period_end, trial_ends_at) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [id, organizationId, planId, trialEndsAt ? 'trialing' : 'active', periodStart, periodEnd, trialEndsAt]
    );
    return result.rows[0];
  }
}
