import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { DatabaseClient } from '../db/client.ts';
import { requireAuth, requirePlatformPermission } from '../middleware/auth.ts';
import { PERMISSIONS } from '../auth/roles.ts';
import { hashPassword } from '../auth/password.ts';

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

export function createPlatformRouter(db: DatabaseClient): Router {
  const router = Router();

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

  router.get('/tenants', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_TENANTS), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await db.query<any>(
        'SELECT id, name, slug, code, is_active, plan_tier, created_at FROM organizations ORDER BY created_at DESC'
      );
      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          code: t.code,
          status: t.is_active ? 'active' : 'suspended',
          plan: t.plan_tier,
          createdAt: t.created_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tenants', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_TENANTS), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = normalizeName(req.body?.name);
      const slug = normalizeSlug(req.body?.slug);
      const code = normalizeCode(req.body?.code, slug);
      const planTier = normalizePlanTier(req.body?.planTier);
      const admin = normalizeAdminPayload(req.body);
      const tenantId = `org_${randomUUID()}`;
      const userId = `usr_${randomUUID()}`;
      const { hash, salt } = hashPassword(admin.password);

      const created = await db.withTransaction(async (tx) => {
        const duplicate = await tx.query<{ id: string }>(
          'SELECT id FROM organizations WHERE slug = $1 OR code = $2 LIMIT 1',
          [slug, code],
        );
        if (duplicate.rows.length > 0) {
          const error: any = new Error('TENANT_SLUG_OR_CODE_EXISTS');
          error.statusCode = 409;
          throw error;
        }

        const org = await tx.query<any>(
          `INSERT INTO organizations (id, name, slug, code, plan_tier, is_active)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           RETURNING id, name, slug, code, plan_tier, is_active, created_at`,
          [tenantId, name, slug, code, planTier],
        );

        const existingAdmin = await tx.query<{ id: string }>(
          'SELECT id FROM users WHERE organization_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1',
          [tenantId, admin.email],
        );
        if (existingAdmin.rows.length > 0) {
          const error: any = new Error('ADMIN_EMAIL_EXISTS');
          error.statusCode = 409;
          throw error;
        }

        await tx.query(
          `INSERT INTO users (
            id, organization_id, email, name, password_hash, password_salt, role, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, 'admin', TRUE)`,
          [userId, tenantId, admin.email, admin.name, hash, salt],
        );

        // Authoritative Subscription Provisioning (TASK-5.6.1 / TASK-5.6.2)
        const planCode = (planTier || 'starter').toLowerCase();
        const planRes = await tx.query<any>(
          'SELECT id, trial_days FROM subscription_plans WHERE code = $1 LIMIT 1',
          [planCode]
        );
        const planId = planRes.rows[0]?.id || 'plan_starter';
        const trialDays = Number(planRes.rows[0]?.trial_days || 14);

        await tx.query(
          `INSERT INTO organization_subscriptions (
            id, organization_id, plan_id, status, current_period_start, current_period_end, trial_ends_at, metadata
          ) VALUES (
            $1, $2, $3, 'trialing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($4 || ' days')::interval, CURRENT_TIMESTAMP + ($4 || ' days')::interval, $5
          )`,
          ['sub_' + randomUUID(), tenantId, planId, trialDays, JSON.stringify({ source: 'platform_provisioning' })]
        );

        await auditTenantMutation(
          tx,
          req,
          'PLATFORM_TENANT_CREATED',
          tenantId,
          null,
          { id: tenantId, name, slug, code, planTier, isActive: true, initialAdminUserId: userId },
        );

        return org.rows[0];
      });

      return res.status(201).json({
        success: true,
        data: {
          tenant: {
            id: created.id,
            name: created.name,
            slug: created.slug,
            code: created.code,
            plan: created.plan_tier,
            status: created.is_active ? 'active' : 'suspended',
            createdAt: created.created_at,
          },
          initialAdmin: {
            id: userId,
            email: admin.email,
            name: admin.name,
            role: 'admin',
          },
        },
      });
    } catch (err: any) {
      if (err?.statusCode === 409) {
        return res.status(409).json({ success: false, error: { code: err.message, message: 'Tenant already exists or the initial admin conflicts.' } });
      }
      const known: Record<string, [string, string]> = {
        TENANT_SLUG_REQUIRED: ['TENANT_SLUG_REQUIRED', 'A tenant slug is required.'],
        INVALID_TENANT_SLUG: ['INVALID_TENANT_SLUG', 'Tenant slug must be 3–63 lowercase URL-safe characters.'],
        RESERVED_TENANT_SLUG: ['RESERVED_TENANT_SLUG', 'That tenant slug is reserved by the platform.'],
        TENANT_NAME_REQUIRED: ['TENANT_NAME_REQUIRED', 'A tenant name is required.'],
        INVALID_TENANT_NAME: ['INVALID_TENANT_NAME', 'Tenant name must be 2–255 characters.'],
        INVALID_TENANT_CODE: ['INVALID_TENANT_CODE', 'Tenant code must contain only A–Z, 0–9, and underscores.'],
        INVALID_PLAN_TIER: ['INVALID_PLAN_TIER', 'Plan tier must be starter, professional, or enterprise.'],
        INVALID_ADMIN_EMAIL: ['INVALID_ADMIN_EMAIL', 'A valid initial administrator email is required.'],
        INVALID_ADMIN_NAME: ['INVALID_ADMIN_NAME', 'Initial administrator name must be 2–255 characters.'],
        ADMIN_PASSWORD_POLICY: ['ADMIN_PASSWORD_POLICY', 'Initial administrator password must be 12–128 characters and contain upper, lower, and numeric characters.'],
      };
      const code = err?.message;
      if (code && known[code]) return badRequest(res, known[code][0], known[code][1]);
      next(err);
    }
  });

  router.patch('/tenants/:id', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_TENANTS), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!tenantId) return badRequest(res, 'TENANT_ID_REQUIRED', 'Tenant ID is required.');

      const before = await db.query<any>(
        'SELECT id, name, slug, code, is_active, plan_tier FROM organizations WHERE id = $1 LIMIT 1',
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

  router.get('/billing', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        success: true,
        data: {
          status: 'operational',
          mrr: null,
          billingLedgerStatus: 'connected',
          subscriptions: [],
          currency: 'USD',
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
