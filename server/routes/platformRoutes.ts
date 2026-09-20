import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { DatabaseClient } from '../db/client.ts';
import { requireAuth, requirePlatformPermission } from '../middleware/auth.ts';
import { PERMISSIONS } from '../auth/roles.ts';
import { SubscriptionService, SubscriptionLimitError } from '../services/subscriptionService.ts';
import { SubscriptionRepository } from '../repositories/subscriptionRepository.ts';
import {
  TenantProvisioningService,
  TenantProvisioningError,
  TenantListStatusFilter,
} from '../services/tenantProvisioningService.ts';


function badRequest(res: Response, code: string, message: string) {
  return res.status(422).json({ success: false, error: { code, message } });
}

export function createPlatformRouter(db: DatabaseClient, injectedSubscriptionService?: SubscriptionService): Router {
  const router = Router();

  function getSubscriptionService(req?: Request): SubscriptionService {
    if (injectedSubscriptionService) return injectedSubscriptionService;
    if (req?.app?.get('subscriptionService')) {
      return req.app.get('subscriptionService') as SubscriptionService;
    }
    return new SubscriptionService(new SubscriptionRepository(db), db);
  }

  function getTenantProvisioningService(req?: Request): TenantProvisioningService {
    if (req?.app?.get('tenantProvisioningService')) {
      return req.app.get('tenantProvisioningService') as TenantProvisioningService;
    }
    return new TenantProvisioningService(db);
  }

  router.get('/overview', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_VIEW), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const tenants = await db.query<any>(
        'SELECT id, name, slug, code, is_active, lifecycle_status, plan_tier, created_at FROM organizations ORDER BY created_at DESC'
      );
      const activeUsers = await db.query<any>(
        'SELECT COUNT(*)::int AS count FROM users WHERE is_active = true'
      );
      res.json({
        success: true,
        data: {
          tenants: tenants.rows.map((t) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            code: t.code,
            status: t.lifecycle_status || (t.is_active ? 'active' : 'suspended'),
            plan: t.plan_tier,
            createdAt: t.created_at,
          })),
          activeUsers: activeUsers.rows[0]?.count ?? 0,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/tenants', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_TENANTS), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const svc = getTenantProvisioningService(req);
      const validStatuses: TenantListStatusFilter[] = ['active', 'suspended', 'archived', 'all'];
      const statusQuery = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
      if (statusQuery && !validStatuses.includes(statusQuery as TenantListStatusFilter)) {
        return badRequest(res, 'INVALID_TENANT_STATUS', "Status must be 'active', 'suspended', 'archived', or 'all'.");
      }
      const status = statusQuery ? (statusQuery as TenantListStatusFilter) : undefined;
      const planTier = typeof req.query.planTier === 'string' ? req.query.planTier.trim().toLowerCase() : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;

      const rawLimit = Number(req.query.limit);
      const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
      const rawOffset = Number(req.query.offset);
      const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

      const result = await svc.listTenants({ status, planTier, search, limit, offset });
      res.json({
        success: true,
        count: result.tenants.length,
        total: result.total,
        data: result.tenants,
        pagination: { limit: result.limit, offset: result.offset, total: result.total },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tenants', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_TENANTS), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const svc = getTenantProvisioningService(req);
      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const result = await svc.provisionTenant(
        {
          name: req.body?.name,
          slug: req.body?.slug,
          code: req.body?.code,
          planTier: req.body?.planTier,
          adminEmail: req.body?.adminEmail,
          adminName: req.body?.adminName,
          adminPassword: req.body?.adminPassword,
          metadata: req.body?.metadata,
        },
        actor,
        typeof (req.headers['x-idempotency-key'] || req.headers['idempotency-key']) === 'string'
          ? String(req.headers['x-idempotency-key'] || req.headers['idempotency-key'])
          : undefined,
      );

      return res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      if (err instanceof TenantProvisioningError) {
        return res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  router.patch('/tenants/:id', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_TENANTS), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const svc = getTenantProvisioningService(req);
      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const updated = await svc.updateTenant(req.params.id, req.body, actor);
      return res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof TenantProvisioningError) {
        return res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  // ------------------------------------------------------------------
  // TENANT DETAIL & LIFECYCLE MANAGEMENT (TASK-5.6.4)
  // Guarded strictly by PERMISSIONS.PLATFORM_TENANTS
  // ------------------------------------------------------------------

  router.get('/tenants/:id', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_TENANTS), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const svc = getTenantProvisioningService(req);
      const orgId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Tenant ID is required.');

      const detail = await svc.getTenantDetail(orgId);
      if (!detail) {
        return res.status(404).json({ success: false, error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found.' } });
      }
      res.json({ success: true, data: detail });
    } catch (err: any) {
      if (err instanceof TenantProvisioningError) {
        return res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  router.post('/tenants/:id/suspend', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_TENANTS), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const svc = getTenantProvisioningService(req);
      const orgId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Tenant ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.body?.idempotencyKey) as string | undefined;
      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const result = await svc.suspendTenant(orgId, actor, reason, idempotencyKey);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err instanceof TenantProvisioningError) {
        return res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  router.post('/tenants/:id/reactivate', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_TENANTS), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const svc = getTenantProvisioningService(req);
      const orgId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Tenant ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.body?.idempotencyKey) as string | undefined;
      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const result = await svc.reactivateTenant(orgId, actor, reason, idempotencyKey);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err instanceof TenantProvisioningError) {
        return res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  router.post('/tenants/:id/archive', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_TENANTS), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const svc = getTenantProvisioningService(req);
      const orgId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Tenant ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;
      const result = await svc.archiveTenant(orgId, actor, reason, idempotencyKey);
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err instanceof TenantProvisioningError) {
        return res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  // ------------------------------------------------------------------
  // DISCOVERY SEARCH GOVERNANCE
  // Platform operators can review aliases and search-quality signals without
  // bypassing the same publication/tenant visibility rules used by Discovery.
  // ------------------------------------------------------------------
  router.get('/discovery/search-aliases', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_DISCOVERY), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entityType = typeof req.query.entityType === 'string' ? req.query.entityType.trim().toUpperCase() : undefined;
      if (entityType && !['BUSINESS', 'PRODUCT', 'SERVICE'].includes(entityType)) {
        return badRequest(res, 'INVALID_ENTITY_TYPE', 'entityType must be BUSINESS, PRODUCT, or SERVICE.');
      }
      const activeOnly = req.query.activeOnly !== 'false';
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 180) : '';
      const limitRaw = Number(req.query.limit);
      const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
      const offsetRaw = Number(req.query.offset);
      const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
      const params: any[] = [];
      const where: string[] = [];
      const add = (sql: string, value: any) => { params.push(value); where.push(sql.replace('$X', ' (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        success: true,
        data: {
          queueStatus: 'operational',
          activeTickets: 0,
          criticalAlerts: 0,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------------
  // SAAS BILLING & SUBSCRIPTION MANAGEMENT (TASK-5.6.3)
  // Guarded strictly by PERMISSIONS.PLATFORM_BILLING
  // ------------------------------------------------------------------

  router.get('/billing', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const overview = await subSvc.getBillingOverview();
      res.json({
        success: true,
        data: overview,
      });
    } catch (err) {
      next(err);
    }
  });

  // Plans Management
  router.get('/plans', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const includeInactive = req.query.includeInactive === 'false' ? false : true;
      const plans = await subSvc.getPlans(includeInactive);
      res.json({
        success: true,
        data: plans,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/plans/:codeOrId', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const plan = await subSvc.getPlan(req.params.codeOrId);
      if (!plan) {
        return res.status(404).json({ success: false, error: { code: 'PLAN_NOT_FOUND', message: `Plan '${req.params.codeOrId}' not found.` } });
      }
      res.json({
        success: true,
        data: plan,
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/plans/:codeOrId', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const codeOrId = typeof req.params.codeOrId === 'string' ? req.params.codeOrId.trim() : '';
      if (!codeOrId) return badRequest(res, 'PLAN_IDENTIFIER_REQUIRED', 'Plan code or ID is required.');

      const subSvc = getSubscriptionService(req);
      const updates: any = {};

      if (req.body?.name !== undefined) {
        if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0 || req.body.name.trim().length > 255) {
          return badRequest(res, 'INVALID_PLAN_NAME', 'Plan name must be between 1 and 255 characters.');
        }
        updates.name = req.body.name.trim();
      }

      if (req.body?.description !== undefined) {
        if (req.body.description !== null && typeof req.body.description !== 'string') {
          return badRequest(res, 'INVALID_PLAN_DESCRIPTION', 'Plan description must be a string or null.');
        }
        updates.description = req.body.description ? req.body.description.trim() : null;
      }

      if (req.body?.amount !== undefined) {
        const amt = Number(req.body.amount);
        if (!Number.isFinite(amt) || amt < 0) {
          return badRequest(res, 'INVALID_PLAN_AMOUNT', 'Plan amount must be a non-negative number.');
        }
        updates.amount = amt;
      }

      if (req.body?.currency !== undefined) {
        if (typeof req.body.currency !== 'string' || req.body.currency.trim().length < 2 || req.body.currency.trim().length > 10) {
          return badRequest(res, 'INVALID_PLAN_CURRENCY', 'Plan currency must be a valid currency code.');
        }
        updates.currency = req.body.currency.trim().toUpperCase();
      }

      if (req.body?.billing_interval !== undefined || req.body?.billingInterval !== undefined) {
        const interval = req.body.billing_interval || req.body.billingInterval;
        if (interval !== 'monthly' && interval !== 'yearly') {
          return badRequest(res, 'INVALID_BILLING_INTERVAL', "Billing interval must be 'monthly' or 'yearly'.");
        }
        updates.billing_interval = interval;
      }

      if (req.body?.trial_days !== undefined || req.body?.trialDays !== undefined) {
        const td = Number(req.body.trial_days ?? req.body.trialDays);
        if (!Number.isInteger(td) || td < 0 || td > 365) {
          return badRequest(res, 'INVALID_TRIAL_DAYS', 'Trial days must be an integer between 0 and 365.');
        }
        updates.trial_days = td;
      }

      if (req.body?.limits !== undefined) {
        if (typeof req.body.limits !== 'object' || req.body.limits === null || Array.isArray(req.body.limits)) {
          return badRequest(res, 'INVALID_PLAN_LIMITS', 'Plan limits must be a valid JSON object.');
        }
        for (const [key, val] of Object.entries(req.body.limits)) {
          if (typeof val !== 'number' || !Number.isFinite(val) || (val as number) < 0) {
            return badRequest(res, 'INVALID_PLAN_LIMITS', `Limit '${key}' must be a non-negative number.`);
          }
        }
        updates.limits = req.body.limits;
      }

      if (req.body?.features !== undefined) {
        if (typeof req.body.features !== 'object' || req.body.features === null || Array.isArray(req.body.features)) {
          return badRequest(res, 'INVALID_PLAN_FEATURES', 'Plan features must be a valid JSON object.');
        }
        for (const [key, val] of Object.entries(req.body.features)) {
          if (typeof val !== 'boolean') {
            return badRequest(res, 'INVALID_PLAN_FEATURES', `Feature '${key}' must be a boolean.`);
          }
        }
        updates.features = req.body.features;
      }

      if (req.body?.isActive !== undefined || req.body?.is_active !== undefined) {
        const active = req.body.isActive ?? req.body.is_active;
        if (typeof active !== 'boolean') {
          return badRequest(res, 'INVALID_ACTIVE_STATE', 'isActive must be a boolean.');
        }
        updates.is_active = active;
      }

      if (req.body?.displayOrder !== undefined || req.body?.display_order !== undefined) {
        const ord = Number(req.body.displayOrder ?? req.body.display_order);
        if (!Number.isInteger(ord)) {
          return badRequest(res, 'INVALID_DISPLAY_ORDER', 'Display order must be an integer.');
        }
        updates.display_order = ord;
      }

      if (Object.keys(updates).length === 0) {
        return badRequest(res, 'NO_MUTATIONS', 'No supported plan changes were supplied.');
      }

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const updatedPlan = await subSvc.updatePlan(codeOrId, updates, actor);
      res.json({
        success: true,
        data: updatedPlan,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  // Tenant Subscriptions Management
  router.get('/subscriptions', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const plan = typeof req.query.plan === 'string' ? req.query.plan : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const result = await subSvc.listSubscriptions({ status, plan, search, limit, offset });
      res.json({
        success: true,
        data: result.subscriptions,
        pagination: {
          total: result.total,
          limit,
          offset,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/subscriptions/:organizationId', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const details = await subSvc.getSubscriptionDetails(orgId);
      res.json({
        success: true,
        data: details,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.get('/subscriptions/:organizationId/history', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const history = await subSvc.getSubscriptionAuditHistory(orgId);
      res.json({
        success: true,
        data: history,
      });
    } catch (err: any) {
      next(err);
    }
  });

  // Lifecycle Mutations
  router.post('/subscriptions/:organizationId/change-plan', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const targetPlan = typeof (req.body?.planCodeOrId || req.body?.newPlanCodeOrId) === 'string'
        ? (req.body.planCodeOrId || req.body.newPlanCodeOrId).trim()
        : '';
      if (!targetPlan) return badRequest(res, 'PLAN_REQUIRED', 'Target plan code or ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.changePlan(orgId, targetPlan, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/extend-trial', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const days = Number(req.body?.days ?? req.body?.additionalDays);
      if (!Number.isInteger(days) || days <= 0 || days > 365) {
        return badRequest(res, 'INVALID_TRIAL_DAYS', 'Trial days must be a positive integer between 1 and 365.');
      }

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.extendTrial(orgId, days, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/suspend', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.suspendSubscription(orgId, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/reactivate', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.reactivateSubscription(orgId, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/cancel', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const immediate = Boolean(req.body?.immediate);
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.cancelSubscription(orgId, immediate, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/restore', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.restoreSubscription(orgId, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  return router;
}
 + params.length)); };
      if (entityType) add('a.entity_type = $X', entityType);
      if (activeOnly) where.push('a.is_active = TRUE');
      if (search) params.push('%' + search + '%'); const searchParam = '
      const count = await db.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM discovery_search_aliases a ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`, params,
      );
      params.push(limit, offset);
      const rows = await db.query<any>(
        `SELECT a.id, a.entity_type, a.entity_id, a.alias, a.normalized_alias, a.is_active, a.created_at, a.updated_at,
                b.name AS business_name, b.listing_status, b.is_discoverable
           FROM discovery_search_aliases a
           LEFT JOIN discovery_businesses b ON a.entity_type = 'BUSINESS' AND b.id = a.entity_id
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY a.updated_at DESC, a.id ASC
          LIMIT ${params.length - 1} OFFSET ${params.length}`, params,
      );
      return res.json({ success: true, data: rows.rows, pagination: { total: count.rows[0]?.total ?? 0, limit, offset } });
    } catch (err) { next(err); }
  });

  router.patch('/discovery/search-aliases/:id', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_DISCOVERY), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const aliasId = String(req.params.id || '').trim();
      if (!aliasId) return badRequest(res, 'ALIAS_ID_REQUIRED', 'Alias ID is required.');
      if (req.body?.isActive !== undefined && typeof req.body.isActive !== 'boolean') {
        return badRequest(res, 'INVALID_ACTIVE_STATE', 'isActive must be a boolean.');
      }
      const result = await db.query<any>(
        `UPDATE discovery_search_aliases
            SET is_active = COALESCE($2, is_active), updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING id, entity_type, entity_id, alias, normalized_alias, is_active, created_at, updated_at`,
        [aliasId, req.body?.isActive === undefined ? null : req.body.isActive],
      );
      if (!result.rows[0]) return res.status(404).json({ success: false, error: { code: 'ALIAS_NOT_FOUND', message: 'Search alias not found.' } });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
  });

  router.delete('/discovery/search-aliases/:id', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_DISCOVERY), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const aliasId = String(req.params.id || '').trim();
      if (!aliasId) return badRequest(res, 'ALIAS_ID_REQUIRED', 'Alias ID is required.');
      const result = await db.query<any>('DELETE FROM discovery_search_aliases WHERE id = $1 RETURNING id', [aliasId]);
      if (!result.rows[0]) return res.status(404).json({ success: false, error: { code: 'ALIAS_NOT_FOUND', message: 'Search alias not found.' } });
      return res.json({ success: true, data: { id: aliasId } });
    } catch (err) { next(err); }
  });

  router.get('/discovery/search-analytics', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_DISCOVERY), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const daysRaw = Number(req.query.days);
      const days = Number.isInteger(daysRaw) ? Math.min(Math.max(daysRaw, 1), 90) : 30;
      const result = await db.query<any>(
        `SELECT
           COUNT(*) FILTER (WHERE event_type = 'SEARCH')::int AS searches,
           COUNT(*) FILTER (WHERE event_type = 'SEARCH' AND (metadata->>'zeroResults')::boolean = TRUE)::int AS zero_result_searches,
           COUNT(DISTINCT metadata->>'queryHash') FILTER (WHERE event_type = 'SEARCH' AND metadata->>'queryHash' IS NOT NULL)::int AS unique_queries,
           COUNT(*) FILTER (WHERE event_type = 'IMPRESSION')::int AS impressions,
           COUNT(*) FILTER (WHERE event_type IN ('VIEW','STORE_CLICK','PRODUCT_VIEW','SERVICE_VIEW'))::int AS result_engagements
         FROM discovery_analytics_events
         WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * $1`,
        [days],
      );
      const popular = await db.query<any>(
        `SELECT metadata->>'queryHash' AS query_hash,
                COUNT(*)::int AS searches,
                COUNT(*) FILTER (WHERE (metadata->>'zeroResults')::boolean = TRUE)::int AS zero_results
           FROM discovery_analytics_events
          WHERE event_type = 'SEARCH'
            AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * $1
            AND metadata->>'queryHash' IS NOT NULL
          GROUP BY metadata->>'queryHash'
          ORDER BY searches DESC, query_hash ASC
          LIMIT 25`,
        [days],
      );
      return res.json({
        success: true,
        data: {
          windowDays: days,
          summary: result.rows[0] || {},
          popularQueries: popular.rows,
          queryPrivacy: 'Only SHA-256 query hashes are returned; raw search queries are not stored.',
        },
      });
    } catch (err) { next(err); }
  });

  router.get('/support', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_SUPPORT), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        success: true,
        data: {
          queueStatus: 'operational',
          activeTickets: 0,
          criticalAlerts: 0,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------------
  // SAAS BILLING & SUBSCRIPTION MANAGEMENT (TASK-5.6.3)
  // Guarded strictly by PERMISSIONS.PLATFORM_BILLING
  // ------------------------------------------------------------------

  router.get('/billing', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const overview = await subSvc.getBillingOverview();
      res.json({
        success: true,
        data: overview,
      });
    } catch (err) {
      next(err);
    }
  });

  // Plans Management
  router.get('/plans', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const includeInactive = req.query.includeInactive === 'false' ? false : true;
      const plans = await subSvc.getPlans(includeInactive);
      res.json({
        success: true,
        data: plans,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/plans/:codeOrId', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const plan = await subSvc.getPlan(req.params.codeOrId);
      if (!plan) {
        return res.status(404).json({ success: false, error: { code: 'PLAN_NOT_FOUND', message: `Plan '${req.params.codeOrId}' not found.` } });
      }
      res.json({
        success: true,
        data: plan,
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/plans/:codeOrId', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const codeOrId = typeof req.params.codeOrId === 'string' ? req.params.codeOrId.trim() : '';
      if (!codeOrId) return badRequest(res, 'PLAN_IDENTIFIER_REQUIRED', 'Plan code or ID is required.');

      const subSvc = getSubscriptionService(req);
      const updates: any = {};

      if (req.body?.name !== undefined) {
        if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0 || req.body.name.trim().length > 255) {
          return badRequest(res, 'INVALID_PLAN_NAME', 'Plan name must be between 1 and 255 characters.');
        }
        updates.name = req.body.name.trim();
      }

      if (req.body?.description !== undefined) {
        if (req.body.description !== null && typeof req.body.description !== 'string') {
          return badRequest(res, 'INVALID_PLAN_DESCRIPTION', 'Plan description must be a string or null.');
        }
        updates.description = req.body.description ? req.body.description.trim() : null;
      }

      if (req.body?.amount !== undefined) {
        const amt = Number(req.body.amount);
        if (!Number.isFinite(amt) || amt < 0) {
          return badRequest(res, 'INVALID_PLAN_AMOUNT', 'Plan amount must be a non-negative number.');
        }
        updates.amount = amt;
      }

      if (req.body?.currency !== undefined) {
        if (typeof req.body.currency !== 'string' || req.body.currency.trim().length < 2 || req.body.currency.trim().length > 10) {
          return badRequest(res, 'INVALID_PLAN_CURRENCY', 'Plan currency must be a valid currency code.');
        }
        updates.currency = req.body.currency.trim().toUpperCase();
      }

      if (req.body?.billing_interval !== undefined || req.body?.billingInterval !== undefined) {
        const interval = req.body.billing_interval || req.body.billingInterval;
        if (interval !== 'monthly' && interval !== 'yearly') {
          return badRequest(res, 'INVALID_BILLING_INTERVAL', "Billing interval must be 'monthly' or 'yearly'.");
        }
        updates.billing_interval = interval;
      }

      if (req.body?.trial_days !== undefined || req.body?.trialDays !== undefined) {
        const td = Number(req.body.trial_days ?? req.body.trialDays);
        if (!Number.isInteger(td) || td < 0 || td > 365) {
          return badRequest(res, 'INVALID_TRIAL_DAYS', 'Trial days must be an integer between 0 and 365.');
        }
        updates.trial_days = td;
      }

      if (req.body?.limits !== undefined) {
        if (typeof req.body.limits !== 'object' || req.body.limits === null || Array.isArray(req.body.limits)) {
          return badRequest(res, 'INVALID_PLAN_LIMITS', 'Plan limits must be a valid JSON object.');
        }
        for (const [key, val] of Object.entries(req.body.limits)) {
          if (typeof val !== 'number' || !Number.isFinite(val) || (val as number) < 0) {
            return badRequest(res, 'INVALID_PLAN_LIMITS', `Limit '${key}' must be a non-negative number.`);
          }
        }
        updates.limits = req.body.limits;
      }

      if (req.body?.features !== undefined) {
        if (typeof req.body.features !== 'object' || req.body.features === null || Array.isArray(req.body.features)) {
          return badRequest(res, 'INVALID_PLAN_FEATURES', 'Plan features must be a valid JSON object.');
        }
        for (const [key, val] of Object.entries(req.body.features)) {
          if (typeof val !== 'boolean') {
            return badRequest(res, 'INVALID_PLAN_FEATURES', `Feature '${key}' must be a boolean.`);
          }
        }
        updates.features = req.body.features;
      }

      if (req.body?.isActive !== undefined || req.body?.is_active !== undefined) {
        const active = req.body.isActive ?? req.body.is_active;
        if (typeof active !== 'boolean') {
          return badRequest(res, 'INVALID_ACTIVE_STATE', 'isActive must be a boolean.');
        }
        updates.is_active = active;
      }

      if (req.body?.displayOrder !== undefined || req.body?.display_order !== undefined) {
        const ord = Number(req.body.displayOrder ?? req.body.display_order);
        if (!Number.isInteger(ord)) {
          return badRequest(res, 'INVALID_DISPLAY_ORDER', 'Display order must be an integer.');
        }
        updates.display_order = ord;
      }

      if (Object.keys(updates).length === 0) {
        return badRequest(res, 'NO_MUTATIONS', 'No supported plan changes were supplied.');
      }

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const updatedPlan = await subSvc.updatePlan(codeOrId, updates, actor);
      res.json({
        success: true,
        data: updatedPlan,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  // Tenant Subscriptions Management
  router.get('/subscriptions', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const plan = typeof req.query.plan === 'string' ? req.query.plan : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const result = await subSvc.listSubscriptions({ status, plan, search, limit, offset });
      res.json({
        success: true,
        data: result.subscriptions,
        pagination: {
          total: result.total,
          limit,
          offset,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/subscriptions/:organizationId', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const details = await subSvc.getSubscriptionDetails(orgId);
      res.json({
        success: true,
        data: details,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.get('/subscriptions/:organizationId/history', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const history = await subSvc.getSubscriptionAuditHistory(orgId);
      res.json({
        success: true,
        data: history,
      });
    } catch (err: any) {
      next(err);
    }
  });

  // Lifecycle Mutations
  router.post('/subscriptions/:organizationId/change-plan', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const targetPlan = typeof (req.body?.planCodeOrId || req.body?.newPlanCodeOrId) === 'string'
        ? (req.body.planCodeOrId || req.body.newPlanCodeOrId).trim()
        : '';
      if (!targetPlan) return badRequest(res, 'PLAN_REQUIRED', 'Target plan code or ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.changePlan(orgId, targetPlan, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/extend-trial', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const days = Number(req.body?.days ?? req.body?.additionalDays);
      if (!Number.isInteger(days) || days <= 0 || days > 365) {
        return badRequest(res, 'INVALID_TRIAL_DAYS', 'Trial days must be a positive integer between 1 and 365.');
      }

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.extendTrial(orgId, days, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/suspend', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.suspendSubscription(orgId, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/reactivate', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.reactivateSubscription(orgId, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/cancel', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const immediate = Boolean(req.body?.immediate);
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.cancelSubscription(orgId, immediate, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/restore', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.restoreSubscription(orgId, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  return router;
}
 + params.length; where.push('(LOWER(a.alias) LIKE LOWER(' + searchParam + ') OR LOWER(a.normalized_alias) LIKE LOWER(' + searchParam + '))');
      const count = await db.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM discovery_search_aliases a ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`, params,
      );
      params.push(limit, offset);
      const rows = await db.query<any>(
        `SELECT a.id, a.entity_type, a.entity_id, a.alias, a.normalized_alias, a.is_active, a.created_at, a.updated_at,
                b.name AS business_name, b.listing_status, b.is_discoverable
           FROM discovery_search_aliases a
           LEFT JOIN discovery_businesses b ON a.entity_type = 'BUSINESS' AND b.id = a.entity_id
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY a.updated_at DESC, a.id ASC
          LIMIT ${params.length - 1} OFFSET ${params.length}`, params,
      );
      return res.json({ success: true, data: rows.rows, pagination: { total: count.rows[0]?.total ?? 0, limit, offset } });
    } catch (err) { next(err); }
  });

  router.patch('/discovery/search-aliases/:id', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_DISCOVERY), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const aliasId = String(req.params.id || '').trim();
      if (!aliasId) return badRequest(res, 'ALIAS_ID_REQUIRED', 'Alias ID is required.');
      if (req.body?.isActive !== undefined && typeof req.body.isActive !== 'boolean') {
        return badRequest(res, 'INVALID_ACTIVE_STATE', 'isActive must be a boolean.');
      }
      const result = await db.query<any>(
        `UPDATE discovery_search_aliases
            SET is_active = COALESCE($2, is_active), updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING id, entity_type, entity_id, alias, normalized_alias, is_active, created_at, updated_at`,
        [aliasId, req.body?.isActive === undefined ? null : req.body.isActive],
      );
      if (!result.rows[0]) return res.status(404).json({ success: false, error: { code: 'ALIAS_NOT_FOUND', message: 'Search alias not found.' } });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
  });

  router.delete('/discovery/search-aliases/:id', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_DISCOVERY), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const aliasId = String(req.params.id || '').trim();
      if (!aliasId) return badRequest(res, 'ALIAS_ID_REQUIRED', 'Alias ID is required.');
      const result = await db.query<any>('DELETE FROM discovery_search_aliases WHERE id = $1 RETURNING id', [aliasId]);
      if (!result.rows[0]) return res.status(404).json({ success: false, error: { code: 'ALIAS_NOT_FOUND', message: 'Search alias not found.' } });
      return res.json({ success: true, data: { id: aliasId } });
    } catch (err) { next(err); }
  });

  router.get('/discovery/search-analytics', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_DISCOVERY), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const daysRaw = Number(req.query.days);
      const days = Number.isInteger(daysRaw) ? Math.min(Math.max(daysRaw, 1), 90) : 30;
      const result = await db.query<any>(
        `SELECT
           COUNT(*) FILTER (WHERE event_type = 'SEARCH')::int AS searches,
           COUNT(*) FILTER (WHERE event_type = 'SEARCH' AND (metadata->>'zeroResults')::boolean = TRUE)::int AS zero_result_searches,
           COUNT(DISTINCT metadata->>'queryHash') FILTER (WHERE event_type = 'SEARCH' AND metadata->>'queryHash' IS NOT NULL)::int AS unique_queries,
           COUNT(*) FILTER (WHERE event_type = 'IMPRESSION')::int AS impressions,
           COUNT(*) FILTER (WHERE event_type IN ('VIEW','STORE_CLICK','PRODUCT_VIEW','SERVICE_VIEW'))::int AS result_engagements
         FROM discovery_analytics_events
         WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * $1`,
        [days],
      );
      const popular = await db.query<any>(
        `SELECT metadata->>'queryHash' AS query_hash,
                COUNT(*)::int AS searches,
                COUNT(*) FILTER (WHERE (metadata->>'zeroResults')::boolean = TRUE)::int AS zero_results
           FROM discovery_analytics_events
          WHERE event_type = 'SEARCH'
            AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * $1
            AND metadata->>'queryHash' IS NOT NULL
          GROUP BY metadata->>'queryHash'
          ORDER BY searches DESC, query_hash ASC
          LIMIT 25`,
        [days],
      );
      return res.json({
        success: true,
        data: {
          windowDays: days,
          summary: result.rows[0] || {},
          popularQueries: popular.rows,
          queryPrivacy: 'Only SHA-256 query hashes are returned; raw search queries are not stored.',
        },
      });
    } catch (err) { next(err); }
  });

  router.get('/support', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_SUPPORT), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        success: true,
        data: {
          queueStatus: 'operational',
          activeTickets: 0,
          criticalAlerts: 0,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------------
  // SAAS BILLING & SUBSCRIPTION MANAGEMENT (TASK-5.6.3)
  // Guarded strictly by PERMISSIONS.PLATFORM_BILLING
  // ------------------------------------------------------------------

  router.get('/billing', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const overview = await subSvc.getBillingOverview();
      res.json({
        success: true,
        data: overview,
      });
    } catch (err) {
      next(err);
    }
  });

  // Plans Management
  router.get('/plans', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const includeInactive = req.query.includeInactive === 'false' ? false : true;
      const plans = await subSvc.getPlans(includeInactive);
      res.json({
        success: true,
        data: plans,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/plans/:codeOrId', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const plan = await subSvc.getPlan(req.params.codeOrId);
      if (!plan) {
        return res.status(404).json({ success: false, error: { code: 'PLAN_NOT_FOUND', message: `Plan '${req.params.codeOrId}' not found.` } });
      }
      res.json({
        success: true,
        data: plan,
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/plans/:codeOrId', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const codeOrId = typeof req.params.codeOrId === 'string' ? req.params.codeOrId.trim() : '';
      if (!codeOrId) return badRequest(res, 'PLAN_IDENTIFIER_REQUIRED', 'Plan code or ID is required.');

      const subSvc = getSubscriptionService(req);
      const updates: any = {};

      if (req.body?.name !== undefined) {
        if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0 || req.body.name.trim().length > 255) {
          return badRequest(res, 'INVALID_PLAN_NAME', 'Plan name must be between 1 and 255 characters.');
        }
        updates.name = req.body.name.trim();
      }

      if (req.body?.description !== undefined) {
        if (req.body.description !== null && typeof req.body.description !== 'string') {
          return badRequest(res, 'INVALID_PLAN_DESCRIPTION', 'Plan description must be a string or null.');
        }
        updates.description = req.body.description ? req.body.description.trim() : null;
      }

      if (req.body?.amount !== undefined) {
        const amt = Number(req.body.amount);
        if (!Number.isFinite(amt) || amt < 0) {
          return badRequest(res, 'INVALID_PLAN_AMOUNT', 'Plan amount must be a non-negative number.');
        }
        updates.amount = amt;
      }

      if (req.body?.currency !== undefined) {
        if (typeof req.body.currency !== 'string' || req.body.currency.trim().length < 2 || req.body.currency.trim().length > 10) {
          return badRequest(res, 'INVALID_PLAN_CURRENCY', 'Plan currency must be a valid currency code.');
        }
        updates.currency = req.body.currency.trim().toUpperCase();
      }

      if (req.body?.billing_interval !== undefined || req.body?.billingInterval !== undefined) {
        const interval = req.body.billing_interval || req.body.billingInterval;
        if (interval !== 'monthly' && interval !== 'yearly') {
          return badRequest(res, 'INVALID_BILLING_INTERVAL', "Billing interval must be 'monthly' or 'yearly'.");
        }
        updates.billing_interval = interval;
      }

      if (req.body?.trial_days !== undefined || req.body?.trialDays !== undefined) {
        const td = Number(req.body.trial_days ?? req.body.trialDays);
        if (!Number.isInteger(td) || td < 0 || td > 365) {
          return badRequest(res, 'INVALID_TRIAL_DAYS', 'Trial days must be an integer between 0 and 365.');
        }
        updates.trial_days = td;
      }

      if (req.body?.limits !== undefined) {
        if (typeof req.body.limits !== 'object' || req.body.limits === null || Array.isArray(req.body.limits)) {
          return badRequest(res, 'INVALID_PLAN_LIMITS', 'Plan limits must be a valid JSON object.');
        }
        for (const [key, val] of Object.entries(req.body.limits)) {
          if (typeof val !== 'number' || !Number.isFinite(val) || (val as number) < 0) {
            return badRequest(res, 'INVALID_PLAN_LIMITS', `Limit '${key}' must be a non-negative number.`);
          }
        }
        updates.limits = req.body.limits;
      }

      if (req.body?.features !== undefined) {
        if (typeof req.body.features !== 'object' || req.body.features === null || Array.isArray(req.body.features)) {
          return badRequest(res, 'INVALID_PLAN_FEATURES', 'Plan features must be a valid JSON object.');
        }
        for (const [key, val] of Object.entries(req.body.features)) {
          if (typeof val !== 'boolean') {
            return badRequest(res, 'INVALID_PLAN_FEATURES', `Feature '${key}' must be a boolean.`);
          }
        }
        updates.features = req.body.features;
      }

      if (req.body?.isActive !== undefined || req.body?.is_active !== undefined) {
        const active = req.body.isActive ?? req.body.is_active;
        if (typeof active !== 'boolean') {
          return badRequest(res, 'INVALID_ACTIVE_STATE', 'isActive must be a boolean.');
        }
        updates.is_active = active;
      }

      if (req.body?.displayOrder !== undefined || req.body?.display_order !== undefined) {
        const ord = Number(req.body.displayOrder ?? req.body.display_order);
        if (!Number.isInteger(ord)) {
          return badRequest(res, 'INVALID_DISPLAY_ORDER', 'Display order must be an integer.');
        }
        updates.display_order = ord;
      }

      if (Object.keys(updates).length === 0) {
        return badRequest(res, 'NO_MUTATIONS', 'No supported plan changes were supplied.');
      }

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const updatedPlan = await subSvc.updatePlan(codeOrId, updates, actor);
      res.json({
        success: true,
        data: updatedPlan,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  // Tenant Subscriptions Management
  router.get('/subscriptions', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const plan = typeof req.query.plan === 'string' ? req.query.plan : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const result = await subSvc.listSubscriptions({ status, plan, search, limit, offset });
      res.json({
        success: true,
        data: result.subscriptions,
        pagination: {
          total: result.total,
          limit,
          offset,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/subscriptions/:organizationId', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const details = await subSvc.getSubscriptionDetails(orgId);
      res.json({
        success: true,
        data: details,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.get('/subscriptions/:organizationId/history', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subSvc = getSubscriptionService(req);
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const history = await subSvc.getSubscriptionAuditHistory(orgId);
      res.json({
        success: true,
        data: history,
      });
    } catch (err: any) {
      next(err);
    }
  });

  // Lifecycle Mutations
  router.post('/subscriptions/:organizationId/change-plan', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const targetPlan = typeof (req.body?.planCodeOrId || req.body?.newPlanCodeOrId) === 'string'
        ? (req.body.planCodeOrId || req.body.newPlanCodeOrId).trim()
        : '';
      if (!targetPlan) return badRequest(res, 'PLAN_REQUIRED', 'Target plan code or ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.changePlan(orgId, targetPlan, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/extend-trial', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const days = Number(req.body?.days ?? req.body?.additionalDays);
      if (!Number.isInteger(days) || days <= 0 || days > 365) {
        return badRequest(res, 'INVALID_TRIAL_DAYS', 'Trial days must be a positive integer between 1 and 365.');
      }

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.extendTrial(orgId, days, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/suspend', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.suspendSubscription(orgId, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/reactivate', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.reactivateSubscription(orgId, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/cancel', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const immediate = Boolean(req.body?.immediate);
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.cancelSubscription(orgId, immediate, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  router.post('/subscriptions/:organizationId/restore', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = typeof req.params.organizationId === 'string' ? req.params.organizationId.trim() : '';
      if (!orgId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Organization ID is required.');

      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
      const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotencyKey) as string | undefined;

      const actor = {
        id: req.auth?.userId || 'system',
        name: req.auth?.email || 'platform-operator',
        role: req.auth?.role || 'system_owner',
      };

      const subSvc = getSubscriptionService(req);
      const updated = await subSvc.restoreSubscription(orgId, actor, reason, idempotencyKey);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      if (err instanceof SubscriptionLimitError || err?.statusCode) {
        return res.status(err.statusCode || err.status || 400).json({
          success: false,
          error: { code: err.code, message: err.message },
        });
      }
      next(err);
    }
  });

  return router;
}
