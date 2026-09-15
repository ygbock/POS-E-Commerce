import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { DatabaseClient } from '../db/client.ts';
import { requireAuth, requirePlatformPermission } from '../middleware/auth.ts';
import { PERMISSIONS } from '../auth/roles.ts';
import { hashPassword } from '../auth/password.ts';
import { SubscriptionService, SubscriptionLimitError } from '../services/subscriptionService.ts';
import { SubscriptionRepository } from '../repositories/subscriptionRepository.ts';
import { TenantProvisioningService, TenantProvisioningError } from '../services/tenantProvisioningService.ts';

const RESERVED_TENANT_SLUGS = new Set([
  'api',
  'admin',
  'app',
  'platform',
  'www',
  'support',
  'billing',
  'security',
  'login',
  'logout',
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PlanTier = 'starter' | 'professional' | 'enterprise';

function normalizeSlug(value: unknown): string {
  if (typeof value !== 'string') throw new Error('TENANT_SLUG_REQUIRED');
  const slug = value.trim().toLowerCase();
  if (slug.length < 3 || slug.length > 63 || !SLUG_PATTERN.test(slug)) {
    throw new Error('INVALID_TENANT_SLUG');
  }
  if (RESERVED_TENANT_SLUGS.has(slug)) {
    throw new Error('RESERVED_TENANT_SLUG');
  }
  return slug;
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('TENANT_NAME_REQUIRED');
  const name = value.trim();
  if (name.length < 2 || name.length > 255) throw new Error('INVALID_TENANT_NAME');
  return name;
}

function normalizeCode(value: unknown, slug: string): string {
  const code = typeof value === 'string' && value.trim()
    ? value.trim().toUpperCase()
    : slug.replace(/-/g, '_').toUpperCase();
  if (!/^[A-Z0-9_]{3,64}$/.test(code)) throw new Error('INVALID_TENANT_CODE');
  return code;
}

function normalizePlanTier(value: unknown): PlanTier {
  if (value === undefined || value === null || value === '') return 'starter';
  if (value !== 'starter' && value !== 'professional' && value !== 'enterprise') {
    throw new Error('INVALID_PLAN_TIER');
  }
  return value;
}

function normalizeAdminPayload(body: any) {
  const email = typeof body?.adminEmail === 'string' ? body.adminEmail.trim().toLowerCase() : '';
  const name = typeof body?.adminName === 'string' ? body.adminName.trim() : '';
  const password = typeof body?.adminPassword === 'string' ? body.adminPassword : '';

  if (!EMAIL_PATTERN.test(email) || email.length > 255) throw new Error('INVALID_ADMIN_EMAIL');
  if (name.length < 2 || name.length > 255) throw new Error('INVALID_ADMIN_NAME');
  if (password.length < 12 || password.length > 128) throw new Error('ADMIN_PASSWORD_POLICY');
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('ADMIN_PASSWORD_POLICY');
  }

  return { email, name, password };
}

function badRequest(res: Response, code: string, message: string) {
  return res.status(422).json({ success: false, error: { code, message } });
}

function auditTenantMutation(
  client: DatabaseClient,
  req: Request,
  action: string,
  tenantId: string,
  beforeState: unknown,
  afterState: unknown,
) {
  return client.query(
    `INSERT INTO audit_events (
      id, organization_id, actor_id, actor_name, actor_role,
      action, entity_type, entity_id, before_state, after_state, metadata, severity
    ) VALUES ($1, NULL, $2, $3, $4, $5, 'organization', $6, $7::jsonb, $8::jsonb, $9::jsonb, 'High')`,
    [
      `audit_${randomUUID()}`,
      req.auth?.userId || null,
      req.auth?.email || 'platform-operator',
      req.auth?.role || 'system_owner',
      action,
      tenantId,
      JSON.stringify(beforeState ?? null),
      JSON.stringify(afterState ?? null),
      JSON.stringify({ source: 'platform-control-plane', ip: req.ip }),
    ],
  );
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
        'SELECT id, name, slug, code, is_active, plan_tier, created_at FROM organizations ORDER BY created_at DESC'
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
            status: t.is_active ? 'active' : 'suspended',
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
      const status = typeof req.query.status === 'string' && ['active', 'suspended', 'all'].includes(req.query.status)
        ? req.query.status as 'active' | 'suspended' | 'all'
        : undefined;
      const planTier = typeof req.query.planTier === 'string' ? req.query.planTier : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const result = await svc.listTenants({ status, planTier, search, limit, offset });
      res.json({
        success: true,
        count: result.tenants.length,
        total: result.total,
        data: result.tenants,
        pagination: { limit, offset, total: result.total },
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
      const tenantId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!tenantId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Tenant ID is required.');

      const before = await db.query<any>(
        'SELECT id, name, slug, code, is_active, lifecycle_status, plan_tier FROM organizations WHERE id = $1 LIMIT 1',
        [tenantId],
      );
      if (before.rows.length === 0) {
        return res.status(404).json({ success: false, error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found.' } });
      }

      const current = before.rows[0];
      const updates: string[] = [];
      const params: any[] = [];
      let index = 1;

      if (req.body?.isActive !== undefined) {
        if (typeof req.body.isActive !== 'boolean') return badRequest(res, 'INVALID_ACTIVE_STATE', 'isActive must be boolean.');
        updates.push(`is_active = $${index++}`);
        params.push(req.body.isActive);
      }

      if (req.body?.planTier !== undefined) {
        const tier = normalizePlanTier(req.body.planTier);
        updates.push(`plan_tier = $${index++}`);
        params.push(tier);
      }

      if (req.body?.name !== undefined) {
        updates.push(`name = $${index++}`);
        params.push(normalizeName(req.body.name));
      }

      if (req.body?.slug !== undefined) {
        const slug = normalizeSlug(req.body.slug);
        const conflict = await db.query<{ id: string }>(
          'SELECT id FROM organizations WHERE slug = $1 AND id <> $2 LIMIT 1',
          [slug, tenantId],
        );
        if (conflict.rows.length > 0) return res.status(409).json({ success: false, error: { code: 'TENANT_SLUG_EXISTS', message: 'Tenant slug is already in use.' } });
        updates.push(`slug = $${index++}`);
        params.push(slug);
      }

      if (updates.length === 0) {
        return res.status(422).json({ success: false, error: { code: 'NO_MUTATIONS', message: 'No supported tenant changes were supplied.' } });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(tenantId);

      const after = await db.withTransaction(async (tx) => {
        const updated = await tx.query<any>(
          `UPDATE organizations SET ${updates.join(', ')}
           WHERE id = $${index}
           RETURNING id, name, slug, code, is_active, plan_tier, created_at, updated_at`,
          params,
        );
        if (!updated.rows[0]) return null;

        await auditTenantMutation(tx, req, 'PLATFORM_TENANT_UPDATED', tenantId, current, updated.rows[0]);
        return updated.rows[0];
      });

      return res.json({
        success: true,
        data: {
          id: after.id,
          name: after.name,
          slug: after.slug,
          code: after.code,
          plan: after.plan_tier,
          status: after.is_active ? 'active' : 'suspended',
          createdAt: after.created_at,
          updatedAt: after.updated_at,
        },
      });
    } catch (err: any) {
      if (err?.message === 'INVALID_TENANT_SLUG') return badRequest(res, 'INVALID_TENANT_SLUG', 'Tenant slug must be 3–63 lowercase URL-safe characters.');
      if (err?.message === 'RESERVED_TENANT_SLUG') return badRequest(res, 'RESERVED_TENANT_SLUG', 'That tenant slug is reserved by the platform.');
      if (err?.message === 'INVALID_TENANT_NAME') return badRequest(res, 'INVALID_TENANT_NAME', 'Tenant name must be 2–255 characters.');
      if (err?.message === 'INVALID_PLAN_TIER') return badRequest(res, 'INVALID_PLAN_TIER', 'Plan tier must be starter, professional, or enterprise.');
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
