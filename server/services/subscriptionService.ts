import { SubscriptionRepository, OrganizationSubscription } from '../repositories/subscriptionRepository';

export interface SubscriptionSnapshot extends OrganizationSubscription {
  plan: {
    id: string; code: string; name: string; amount: string; currency: string;
    billingInterval: 'monthly' | 'yearly';
    limits: Record<string, number>; features: Record<string, boolean>;
  };
}

export class SubscriptionService {
  constructor(private readonly repository: SubscriptionRepository = new SubscriptionRepository()) {}

  async getTenantSubscription(organizationId: string): Promise<SubscriptionSnapshot | null> {
    if (!organizationId?.trim()) throw new Error('TENANT_REQUIRED: organizationId is required');
    const record = await this.repository.getForOrganization(organizationId.trim());
    if (!record) return null;
    return {
      ...record,
      plan: {
        id: record.plan.id, code: record.plan.code, name: record.plan.name,
        amount: record.plan.amount, currency: record.plan.currency,
        billingInterval: record.plan.billing_interval,
        limits: record.plan.limits, features: record.plan.features
      }
    };
  }

  async assertFeatureEnabled(organizationId: string, feature: string): Promise<void> {
    const subscription = await this.getTenantSubscription(organizationId);
    if (!subscription) throw new Error('SUBSCRIPTION_NOT_FOUND');
    if (!['trialing', 'active'].includes(subscription.status)) throw new Error('SUBSCRIPTION_INACTIVE');
    if (subscription.plan.features[feature] !== true) throw new Error('FEATURE_NOT_INCLUDED');
  }

  async getLimit(organizationId: string, metric: string): Promise<number | null> {
    const subscription = await this.getTenantSubscription(organizationId);
    if (!subscription) return null;
    const value = subscription.plan.limits[metric];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
}
