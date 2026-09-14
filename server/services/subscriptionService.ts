import { DatabaseClient } from '../db/client';
import { SubscriptionRepository, OrganizationSubscription } from '../repositories/subscriptionRepository';

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
  constructor(private readonly repository: SubscriptionRepository = new SubscriptionRepository()) {}

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
}
