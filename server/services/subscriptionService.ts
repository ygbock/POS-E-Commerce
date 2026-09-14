import { DatabaseClient, getDatabaseClient } from '../db/client';
import {
  SubscriptionRepository,
  SubscriptionStatus,
  FeatureFlag,
  PlanLimit,
  SubscriptionWithPlan,
} from '../repositories/subscriptionRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { ApiError } from '../utils/errorSanitizer';

export interface EntitlementsDTO {
  plan: {
    code: string;
    name: string;
  };
  status: SubscriptionStatus;
  isAllowedAccess: boolean;
  features: Record<FeatureFlag, boolean>;
  limits: Record<PlanLimit, number>;
  usage: {
    users: number;
    locations: number;
    products: number;
    monthly_orders: number;
    monthly_pos_transactions: number;
    storage_bytes: number;
  };
}

const ALL_FEATURE_FLAGS: FeatureFlag[] = [
  'pos',
  'inventory',
  'ecommerce',
  'storefront',
  'advanced_reports',
  'multi_location',
  'staff_management',
  'audit_logs',
  'api_access',
  'export',
  'advanced_analytics',
];

const ALL_PLAN_LIMITS: PlanLimit[] = [
  'max_users',
  'max_locations',
  'max_products',
  'max_monthly_orders',
  'max_monthly_pos_transactions',
  'max_storage_bytes',
];

export class SubscriptionService {
  private subscriptionRepo: SubscriptionRepository;
  private auditRepo: AuditRepository;
  private db: DatabaseClient;

  constructor(
    subscriptionRepo?: SubscriptionRepository,
    auditRepo?: AuditRepository,
    db?: DatabaseClient
  ) {
    this.db = db || getDatabaseClient();
    this.subscriptionRepo = subscriptionRepo || new SubscriptionRepository(this.db);
    this.auditRepo = auditRepo || new AuditRepository(this.db);
  }

  /**
   * Resolves the authoritative entitlement object for an organization.
   * Fails closed if the tenant or subscription is missing, suspended, cancelled, or expired.
   */
  async getEntitlements(organizationId: string, tx?: DatabaseClient): Promise<EntitlementsDTO> {
    if (!organizationId) {
      return this.buildFailClosedDTO('UNSUBSCRIBED', 0, 0, 0, 0, 0);
    }

    // Usage counters
    const [usersCount, locationsCount, productsCount, ordersCount, posTxCount] = await Promise.all([
      this.subscriptionRepo.countUsers(organizationId, tx),
      this.subscriptionRepo.countLocations(organizationId, tx),
      this.subscriptionRepo.countProducts(organizationId, tx),
      this.subscriptionRepo.countMonthlyOrders(organizationId, undefined, tx),
      this.subscriptionRepo.countMonthlyPosTransactions(organizationId, undefined, tx),
    ]);

    let subWithPlan: SubscriptionWithPlan | null = null;
    try {
      subWithPlan = await this.subscriptionRepo.getSubscriptionWithPlan(organizationId, tx);
    } catch {
      // Fail closed on DB query errors
      return this.buildFailClosedDTO('expired', usersCount, locationsCount, productsCount, ordersCount, posTxCount);
    }

    if (!subWithPlan) {
      return this.buildFailClosedDTO('expired', usersCount, locationsCount, productsCount, ordersCount, posTxCount);
    }

    const { status, features: rawFeatures, plan_code, plan_name } = subWithPlan;

    // Fail closed if subscription is suspended, cancelled, or expired
    const isAllowedAccess = status === 'active' || status === 'trial' || status === 'past_due';

    if (!isAllowedAccess) {
      return this.buildFailClosedDTO(status, usersCount, locationsCount, productsCount, ordersCount, posTxCount, plan_code, plan_name);
    }

    // Map feature flags cleanly
    const features = {} as Record<FeatureFlag, boolean>;
    for (const flag of ALL_FEATURE_FLAGS) {
      features[flag] = Boolean(rawFeatures[flag]);
    }

    const limits: Record<PlanLimit, number> = {
      max_users: subWithPlan.max_users,
      max_locations: subWithPlan.max_locations,
      max_products: subWithPlan.max_products,
      max_monthly_orders: subWithPlan.max_monthly_orders,
      max_monthly_pos_transactions: subWithPlan.max_monthly_pos_transactions,
      max_storage_bytes: subWithPlan.max_storage_bytes,
    };

    return {
      plan: {
        code: plan_code,
        name: plan_name,
      },
      status,
      isAllowedAccess: true,
      features,
      limits,
      usage: {
        users: usersCount,
        locations: locationsCount,
        products: productsCount,
        monthly_orders: ordersCount,
        monthly_pos_transactions: posTxCount,
        storage_bytes: 0,
      },
    };
  }

  /**
   * Checks whether an organization holds entitlement for a specific feature.
   */
  async hasFeature(organizationId: string, feature: FeatureFlag, tx?: DatabaseClient): Promise<boolean> {
    const entitlements = await this.getEntitlements(organizationId, tx);
    return entitlements.isAllowedAccess && Boolean(entitlements.features[feature]);
  }

  /**
   * Asserts that an organization holds entitlement for a feature, throwing 403 ApiError if denied.
   */
  async assertFeature(
    organizationId: string,
    feature: FeatureFlag,
    actorInfo?: { userId?: string; role?: string },
    tx?: DatabaseClient
  ): Promise<void> {
    const entitlements = await this.getEntitlements(organizationId, tx);

    if (!entitlements.isAllowedAccess) {
      await this.logAuditEvent('SUBSCRIPTION_ACCESS_SUSPENDED', organizationId, actorInfo, {
        feature,
        status: entitlements.status,
      });
      throw new ApiError(
        'SUBSCRIPTION_INACTIVE',
        `Your subscription is currently ${entitlements.status.toUpperCase()} and does not allow this operation.`,
        403
      );
    }

    if (!entitlements.features[feature]) {
      await this.logAuditEvent('FEATURE_ACCESS_DENIED', organizationId, actorInfo, {
        feature,
        plan: entitlements.plan.code,
      });
      throw new ApiError(
        'FEATURE_NOT_INCLUDED',
        `Feature '${feature}' is not included in your current '${entitlements.plan.name}' plan.`,
        403
      );
    }
  }

  /**
   * Checks whether requested resource creation is within quota limits.
   */
  async checkLimit(
    organizationId: string,
    limitType: 'users' | 'locations' | 'products' | 'orders',
    requestedAmount = 1,
    tx?: DatabaseClient
  ): Promise<{ allowed: boolean; current: number; max: number; status: SubscriptionStatus }> {
    const entitlements = await this.getEntitlements(organizationId, tx);
    if (!entitlements.isAllowedAccess) {
      return { allowed: false, current: 0, max: 0, status: entitlements.status };
    }

    let current = 0;
    let max = 0;

    switch (limitType) {
      case 'users':
        current = entitlements.usage.users;
        max = entitlements.limits.max_users;
        break;
      case 'locations':
        current = entitlements.usage.locations;
        max = entitlements.limits.max_locations;
        break;
      case 'products':
        current = entitlements.usage.products;
        max = entitlements.limits.max_products;
        break;
      case 'orders':
        current = entitlements.usage.monthly_orders;
        max = entitlements.limits.max_monthly_orders;
        break;
    }

    return {
      allowed: current + requestedAmount <= max,
      current,
      max,
      status: entitlements.status,
    };
  }

  /**
   * Asserts that resource consumption is within quota, throwing 403 ApiError if quota is exceeded.
   */
  async assertWithinLimit(
    organizationId: string,
    limitType: 'users' | 'locations' | 'products' | 'orders',
    requestedAmount = 1,
    actorInfo?: { userId?: string; role?: string },
    tx?: DatabaseClient
  ): Promise<void> {
    const check = await this.checkLimit(organizationId, limitType, requestedAmount, tx);

    if (check.status !== 'active' && check.status !== 'trial' && check.status !== 'past_due') {
      await this.logAuditEvent('SUBSCRIPTION_ACCESS_SUSPENDED', organizationId, actorInfo, {
        limitType,
        status: check.status,
      });
      throw new ApiError(
        'SUBSCRIPTION_INACTIVE',
        `Your subscription is currently ${check.status.toUpperCase()} and does not allow this operation.`,
        403
      );
    }

    if (!check.allowed) {
      await this.logAuditEvent('SUBSCRIPTION_LIMIT_REACHED', organizationId, actorInfo, {
        limitType,
        current: check.current,
        max: check.max,
        requestedAmount,
      });
      throw new ApiError(
        'LIMIT_EXCEEDED',
        `You have reached your subscription plan limit for ${limitType} (${check.current}/${check.max}). Upgrade your plan to expand quota.`,
        403
      );
    }
  }

  /**
   * Transactional assert Within Limit helper incorporating FOR UPDATE row locking on subscription for atomic concurrency protection.
   */
  async assertWithinLimitTx(
    tx: DatabaseClient,
    organizationId: string,
    limitType: 'users' | 'locations' | 'products' | 'orders',
    requestedAmount = 1,
    actorInfo?: { userId?: string; role?: string }
  ): Promise<void> {
    // Acquire row lock on subscription for race condition prevention
    await this.subscriptionRepo.lockSubscriptionForUpdate(tx, organizationId);
    await this.assertWithinLimit(organizationId, limitType, requestedAmount, actorInfo, tx);
  }

  /**
   * Helper to audit entitlement denial events safely without credentials/secrets.
   */
  private async logAuditEvent(
    action: 'FEATURE_ACCESS_DENIED' | 'SUBSCRIPTION_LIMIT_REACHED' | 'SUBSCRIPTION_ACCESS_SUSPENDED',
    organizationId: string,
    actorInfo?: { userId?: string; role?: string },
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await this.auditRepo.recordEvent({
        organization_id: organizationId,
        actor_id: actorInfo?.userId || 'system',
        actor_role: actorInfo?.role || 'unknown',
        actor_name: actorInfo?.userId || 'System',
        action,
        metadata: { status: 'DENIED', ...(metadata || {}) },
        severity: 'Medium',
      });
    } catch {
      // Audit failure should not crash main authorization execution flow
    }
  }

  /**
   * Builds fail-closed DTO object.
   */
  private buildFailClosedDTO(
    status: SubscriptionStatus | string,
    usersCount: number,
    locationsCount: number,
    productsCount: number,
    ordersCount: number,
    posTxCount: number,
    planCode = 'none',
    planName = 'No Active Subscription'
  ): EntitlementsDTO {
    const emptyFeatures = {} as Record<FeatureFlag, boolean>;
    for (const flag of ALL_FEATURE_FLAGS) {
      emptyFeatures[flag] = false;
    }

    const emptyLimits: Record<PlanLimit, number> = {
      max_users: 0,
      max_locations: 0,
      max_products: 0,
      max_monthly_orders: 0,
      max_monthly_pos_transactions: 0,
      max_storage_bytes: 0,
    };

    return {
      plan: {
        code: planCode,
        name: planName,
      },
      status: (status as SubscriptionStatus) || 'expired',
      isAllowedAccess: false,
      features: emptyFeatures,
      limits: emptyLimits,
      usage: {
        users: usersCount,
        locations: locationsCount,
        products: productsCount,
        monthly_orders: ordersCount,
        monthly_pos_transactions: posTxCount,
        storage_bytes: 0,
      },
    };
  }
}
