import express, { Request, Response, NextFunction } from 'express';
import { randomUUID, randomInt } from 'node:crypto';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { INITIAL_PRODUCTS, INITIAL_CATEGORIES, INITIAL_BRANDS, INITIAL_COUPONS } from './src/data/initialData.ts';
import { Product, ProductVariant, CatalogAttribute, Category, Brand } from './src/types/index.ts';
import { getDatabaseClient, DatabaseClient } from './server/db/client.ts';
import { runMigrations, getAppliedMigrations } from './server/db/migrator.ts';
import { AuthService } from './server/services/authService.ts';
import { UserRepository } from './server/repositories/userRepository.ts';
import { OrderRepository, OrderRecord, OrderItemRecord, PaymentRecord } from './server/repositories/orderRepository.ts';
import { CustomerRepository } from './server/repositories/customerRepository.ts';
import { InventoryRepository } from './server/repositories/inventoryRepository.ts';
import { AuditRepository } from './server/repositories/auditRepository.ts';
import { SubscriptionRepository } from './server/repositories/subscriptionRepository.ts';
import { SubscriptionService, SubscriptionLimitError } from './server/services/subscriptionService.ts';
import { createInventoryRouter } from './server/routes/inventoryRoutes.ts';
import { createPosRouter } from './server/routes/posRoutes.ts';
import { createStorefrontRouter } from './server/routes/storefrontRoutes.ts';
import { createPlatformRouter } from './server/routes/platformRoutes.ts';
import { createDiscoveryBusinessRouter } from './server/routes/discoveryBusinessRoutes.ts';
import { createDiscoveryRouter } from './server/routes/discoveryRoutes.ts';
import { createMerchantRouter } from './server/routes/merchantRoutes.ts';
import { PosService } from './server/services/posService.ts';
import { OrderService, DomainError } from './server/services/orderService.ts';
import { startReservationExpiryWorker } from './server/inventory/reservationExpiryWorker.ts';
import {
  parseExactMoney,
  parseExactQuantity,
  parseQtyToScaled,
  formatScaledToQtyString,
} from './server/inventory/inventoryPolicies.ts';
import {
  createAuthenticateMiddleware,
  requireAuth,
  requirePermission,
  requireTenantAccess,
} from './server/middleware/auth.ts';
import { authRateLimiter, adminRateLimiter } from './server/middleware/rateLimiter.ts';
import { requestIdMiddleware } from './server/middleware/requestId.ts';
import {
  validateLoginPayload,
  validateProductPayload,
  validateVariantPayload,
  validateUserPayload,
  validateLocationPayload,
  validateCustomerPayload,
  validateCategoryPayload,
  validateBrandPayload,
  validateAttributePayload,
  validateBody,
  ValidationError,
} from './server/validation/index.ts';
import { apiErrorHandler, buildApiErrorResponse, ApiError } from './server/utils/errorSanitizer.ts';
import { hashPassword } from './server/auth/password.ts';
import { PERMISSIONS, ROLE_PERMISSIONS, VALID_ROLES, isPlatformRole } from './server/auth/roles.ts';

import { validateEnvironment } from './server/config/environment.ts';

export interface CreateAppOptions {
  db?: DatabaseClient;
  authService?: AuthService;
  skipVite?: boolean;
  initialProducts?: Product[];
}

export async function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  // Centralized Environment & Runtime Contract Validation (UPG-001)
  validateEnvironment();

  // Initialize Database Persistence Layer
  const dbStatus = {
    connected: false,
    engine: 'unknown',
    version: 'none',
    migrationsApplied: [] as string[],
    error: null as string | null,
  };

  let db: DatabaseClient;
  let authService: AuthService;

  if (options.db) {
    db = options.db;
    authService = options.authService || new AuthService(db);
    try {
      await db.query('SELECT 1 as val');
      dbStatus.connected = true;
      dbStatus.engine = db.isEmbedded() ? 'embedded-pglite' : 'postgresql';
      try {
        const applied = await getAppliedMigrations(db);
        dbStatus.migrationsApplied = Array.from(applied);
        dbStatus.version = Array.from(applied).pop() || '000';
      } catch {
        // Migrations may be handled externally by caller
      }
    } catch (err: any) {
      dbStatus.connected = false;
      dbStatus.error = err.message || 'Database connection error';
    }
  } else {
    try {
      db = getDatabaseClient();
      authService = options.authService || new AuthService(db);
      const ping = await db.query('SELECT 1 as val');
      if (ping.rows.length > 0) {
        dbStatus.connected = true;
        dbStatus.engine = db.isEmbedded() ? 'embedded-pglite' : 'postgresql';
        await runMigrations(db);
        const applied = await getAppliedMigrations(db);
        dbStatus.migrationsApplied = Array.from(applied);
        dbStatus.version = Array.from(applied).pop() || '000';
        if (!isProd) {
          try {
            await authService.seedDefaultUsers();
            console.log(`[AbaCha DB] Development seed users initialized successfully on startup.`);
          } catch (seedErr: any) {
            console.warn(`[AbaCha DB] Development seed failed (non-blocking):`, seedErr.message);
          }
        }
        // Production/server startup is decoupled from fixture seeding. Fixture seeding lives exclusively in CLI seed scripts.
        console.log(`[AbaCha DB] Connected (${dbStatus.engine}). Schema: ${dbStatus.version}`);
      }
    } catch (dbErr: any) {
      dbStatus.error = dbErr.message || 'Database initialization error';
      db = getDatabaseClient();
      authService = options.authService || new AuthService();
      if (isProd) {
        console.error('[AbaCha DB Fatal] Production PostgreSQL startup failed:', dbStatus.error);
        throw new Error(`[AbaCha DB Fatal] Production PostgreSQL startup failed: ${dbStatus.error}`);
      } else {
        console.warn('[AbaCha DB] Non-production running in degraded persistence mode:', dbStatus.error);
      }
    }
  }

  // Repositories
  const userRepo = new UserRepository(db);
  const orderRepo = new OrderRepository(db);
  const customerRepo = new CustomerRepository(db);
  const inventoryRepo = new InventoryRepository(db);
  const auditRepo = new AuditRepository(db);
  app.set('auditRepo', auditRepo);
  const subscriptionRepo = new SubscriptionRepository(db);
  const subscriptionService = new SubscriptionService(subscriptionRepo);
  app.set('subscriptionRepo', subscriptionRepo);
  app.set('subscriptionService', subscriptionService);

  // Ensure any existing organizations have baseline subscription records (TASK-5.6.1 / TASK-5.6.2)
  try {
    await db.query(`
      INSERT INTO organization_subscriptions (
        id, organization_id, plan_id, status, current_period_start, current_period_end, trial_ends_at, metadata
      )
      SELECT
        'sub_' || md5(o.id || ':initial'),
        o.id,
        COALESCE((SELECT sp.id FROM subscription_plans sp WHERE sp.code = lower(COALESCE(o.plan_tier, 'starter')) LIMIT 1), 'plan_starter'),
        'trialing',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP + INTERVAL '14 days',
        CURRENT_TIMESTAMP + INTERVAL '14 days',
        jsonb_build_object('source', 'create_app_bootstrap')
      FROM organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM organization_subscriptions os WHERE os.organization_id = o.id
      )
    `);
  } catch {
    // Non-blocking in degraded persistence or unmigrated tests
  }

  const posService = new PosService(undefined, orderRepo, inventoryRepo, auditRepo, db);
  const orderService = new OrderService(orderRepo, customerRepo, inventoryRepo, auditRepo, db);

  // In-Memory Master Data Stores (Transitional catalog state protected by server auth boundaries)
  const masterProductsStore: Product[] = options.initialProducts
    ? JSON.parse(JSON.stringify(options.initialProducts))
    : JSON.parse(JSON.stringify(INITIAL_PRODUCTS));

  // Stamp initial products with default tenant
  masterProductsStore.forEach((p) => {
    if (!p.organizationId) {
      p.organizationId = 'org_default';
    }
  });

  const masterCategoriesStore: Category[] = JSON.parse(JSON.stringify(INITIAL_CATEGORIES));
  masterCategoriesStore.forEach((c) => {
    if (!c.organizationId) c.organizationId = 'org_default';
  });

  const masterBrandsStore: Brand[] = JSON.parse(JSON.stringify(INITIAL_BRANDS));
  masterBrandsStore.forEach((b) => {
    if (!b.organizationId) b.organizationId = 'org_default';
  });

  const masterAttributesStore: CatalogAttribute[] = [
    {
      id: 'attr-color',
      organizationId: 'org_default',
      name: 'Color',
      code: 'color',
      type: 'select',
      options: ['Midnight Black', 'Silver Cloud', 'Space Gray', 'Navy Blue', 'Forest Green', 'Titanium Gold', 'Matte White'],
      required: false,
      description: 'Product visual color variant selection',
      usageCount: 24,
    },
    {
      id: 'attr-size',
      organizationId: 'org_default',
      name: 'Size',
      code: 'size',
      type: 'select',
      options: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One Size'],
      required: false,
      description: 'Standard apparel and accessory dimensions',
      usageCount: 18,
    },
    {
      id: 'attr-material',
      organizationId: 'org_default',
      name: 'Material',
      code: 'material',
      type: 'select',
      options: ['Recycled Aluminum', 'Merino Wool', 'Japanese Ceramic', 'Stainless Steel', 'Titanium Grade 5', 'Organic Cotton'],
      required: false,
      description: 'Primary structural build material',
      usageCount: 12,
    },
    {
      id: 'attr-storage',
      organizationId: 'org_default',
      name: 'Storage Capacity',
      code: 'storage',
      type: 'select',
      options: ['128GB', '256GB', '512GB', '1TB', '2TB SSD'],
      required: false,
      description: 'Onboard memory and disk storage',
      usageCount: 8,
    },
    {
      id: 'attr-weight',
      organizationId: 'org_default',
      name: 'Pack Weight',
      code: 'weight',
      type: 'select',
      options: ['250g', '500g', '1kg Whole Bean', '2.5kg Bulk Bag'],
      required: false,
      description: 'Gourmet consumables packaging weight',
      usageCount: 15,
    },
  ];

  const syncAuditLogs: Array<{
    id: string;
    timestamp: string;
    action: string;
    target: string;
    affectedModules: string[];
    status: 'SYNCED' | 'PENDING' | 'RECONCILED';
    actorId?: string;
    actorRole?: string;
    organizationId?: string;
  }> = [
    {
      id: 'sync-101',
      timestamp: new Date().toISOString(),
      action: 'INITIAL_BOOTSTRAP',
      target: 'Product Catalog Service',
      affectedModules: ['POS Terminal', 'E-commerce Storefront', 'Multi-Branch Inventory'],
      status: 'SYNCED',
      organizationId: 'org_default',
    },
  ];

  // Global API Middleware
  app.use(express.json({ limit: '10mb' }));

  // Request / Correlation ID Middleware (API-001R1)
  app.use('/api', requestIdMiddleware);

  /**
   * Resolves the authoritative tenant context for a request (Super Admin Cross-Tenant Access Model B).
   * - Fail-Closed: An authenticated caller MUST have an organizationId. If missing, fails with 403 TENANT_REQUIRED.
   * - Non-Super-Admins: Cannot specify a different tenant. Attempting to pass ?orgId= or ?organizationId=
   *   targeting another tenant fails with 403 TENANT_ACCESS_DENIED.
   * - Super Admins: Have a designated home organization. Cross-tenant access is permitted via explicit
   *   ?orgId= or ?organizationId= query parameter. Any cross-tenant access is audited with method-specific
   *   action taxonomy (READ, CREATE, UPDATE, DELETE).
   */
  async function resolveAuthorizedTenant(
    req: Request,
    auditRepository?: AuditRepository,
    entityType = 'RESOURCE'
  ): Promise<string> {
    if (!req.auth?.organizationId) {
      throw new ApiError('TENANT_REQUIRED', 'Authenticated tenant context is required.', 403);
    }
    const callerOrg = req.auth.organizationId;
    const isSuperAdmin = req.auth.role === 'super_admin';

    const targetOrgParam = (req.query.orgId || req.query.organizationId) as string | undefined;

    if (!isSuperAdmin) {
      if (targetOrgParam && typeof targetOrgParam === 'string' && targetOrgParam.trim() !== '') {
        const requested = targetOrgParam.trim();
        if (requested !== callerOrg) {
          if (auditRepository) {
            try {
              await auditRepository.recordEvent({
                organization_id: callerOrg,
                actor_id: req.auth.userId,
                actor_name: (req.auth as any)?.name || req.auth.email || req.auth.userId,
                actor_role: req.auth.role,
                action: 'SECURITY_CROSS_TENANT_DENIED',
                entity_type: entityType,
                entity_id: requested,
                metadata: {
                  callerTenant: callerOrg,
                  attemptedTenant: requested,
                  path: req.originalUrl || req.url,
                  method: req.method,
                },
                severity: 'Critical',
                result: 'DENIED',
              });
            } catch (auditErr) {
              console.warn('[Audit] Failed to log cross-tenant denial:', auditErr);
            }
          }
          throw new ApiError('TENANT_ACCESS_DENIED', 'Cross-tenant access forbidden.', 403);
        }
      }
      return callerOrg;
    }

    // Model B: Super Admin explicit cross-tenant override
    if (targetOrgParam && typeof targetOrgParam === 'string' && targetOrgParam.trim() !== '') {
      const targetOrg = targetOrgParam.trim();
      if (targetOrg !== callerOrg) {
        // Fail-closed: Ensure the target tenant exists and is active
        try {
          const orgRes = await db.query<any>('SELECT id, is_active FROM organizations WHERE id = $1', [targetOrg]);
          if (orgRes.rows.length === 0) {
            throw new ApiError('TENANT_NOT_FOUND', `Target organization '${targetOrg}' not found.`, 404);
          }
          if (!orgRes.rows[0].is_active) {
            throw new ApiError('TENANT_ACCESS_DENIED', `Target organization '${targetOrg}' is inactive.`, 403);
          }
        } catch (err: any) {
          if (err instanceof ApiError) throw err;
          throw new ApiError('TENANT_ACCESS_DENIED', 'Failed to verify target organization status.', 403);
        }

        if (auditRepository) {
          let auditAction = 'SUPER_ADMIN_CROSS_TENANT_READ';
          const method = req.method.toUpperCase();
          if (method === 'POST') {
            auditAction = 'SUPER_ADMIN_CROSS_TENANT_CREATE';
          } else if (method === 'PUT' || method === 'PATCH') {
            auditAction = 'SUPER_ADMIN_CROSS_TENANT_UPDATE';
          } else if (method === 'DELETE') {
            auditAction = 'SUPER_ADMIN_CROSS_TENANT_DELETE';
          }

          await auditRepository.recordEvent({
            organization_id: targetOrg,
            actor_id: req.auth!.userId,
            actor_name: (req.auth as any)?.name || req.auth!.userId,
            actor_role: req.auth!.role,
            action: auditAction,
            entity_type: entityType,
            entity_id: targetOrg,
            metadata: {
              homeOrganization: callerOrg,
              targetOrganization: targetOrg,
              path: req.originalUrl || req.url,
              method: req.method,
              requestId: (req as any)?.id || (req.headers?.['x-request-id'] as string) || undefined,
            },
          });
        }
      }
      return targetOrg;
    }

    return callerOrg;
  }

  // Central Cryptographic Authentication Extraction (SEC-001)
  app.use('/api', createAuthenticateMiddleware(authService));

  // SaaS control-plane routes. Authorization is enforced inside the router.
  app.use('/api/platform', createPlatformRouter(db, subscriptionService));

  // Business-owner identity, merchant workspace, and business ownership API.
  app.use('/api/merchant', createMerchantRouter(db, authService));

  // Discovery business directory and listing lifecycle API.
  app.use('/api/discovery', createDiscoveryBusinessRouter(db));

  // Discovery search, product/service discovery, marketplace, reviews and analytics.
  app.use('/api/discovery', createDiscoveryRouter(db));

  // Request Header Metadata
  app.use('/api', (req, res, next) => {
    res.setHeader('X-Product-Service-Version', 'v2.4-Enterprise');
    res.setHeader('X-Catalog-Source-Of-Truth', 'Active');
    next();
  });

  // ------------------------------------------------------------------
  // 1. AUTHENTICATION & IDENTITY ENDPOINTS (SEC-001)
  // ------------------------------------------------------------------
  app.post('/api/auth/forgot-password', authRateLimiter, async (req: Request, res: Response) => {
    try {
      await authService.requestPasswordReset(String(req.body?.email || ''), req.body?.organizationId ? String(req.body.organizationId) : undefined);
      return res.status(202).json({ success: true, message: 'If the account exists, password reset instructions have been sent.' });
    } catch (err: any) {
      if (err?.message === 'PASSWORD_RESET_DELIVERY_NOT_CONFIGURED') {
        return res.status(503).json({ success: false, error: { code: 'PASSWORD_RESET_UNAVAILABLE', message: 'Password reset is temporarily unavailable.' } });
      }
      return res.status(202).json({ success: true, message: 'If the account exists, password reset instructions have been sent.' });
    }
  });

  app.post('/api/auth/reset-password', authRateLimiter, async (req: Request, res: Response) => {
    try {
      await authService.resetPassword(String(req.body?.token || ''), String(req.body?.password || ''));
      return res.status(200).json({ success: true, message: 'Password reset successfully. Please sign in again.' });
    } catch (err: any) {
      const msg = err?.message || '';
      const status = msg.startsWith('VALIDATION_ERROR') ? 422 : 400;
      return res.status(status).json({ success: false, error: { code: msg.split(':')[0] || 'PASSWORD_RESET_FAILED', message: msg } });
    }
  });

  app.post(
    '/api/auth/bootstrap',
    authRateLimiter,
    validateBody(validateLoginPayload),
    async (req: Request, res: Response) => {
      try {
        const user = await authService.bootstrapInitialAdmin({
          bootstrapSecret: String(req.headers['x-admin-bootstrap-secret'] || req.body?.bootstrapSecret || ''),
          email: String(req.body?.email || ''),
          name: String(req.body?.name || ''),
          password: String(req.body?.password || ''),
          organizationId: req.body?.organizationId ? String(req.body.organizationId) : 'org_default',
        });
        return res.status(201).json({
          success: true,
          data: user,
          message: 'Initial administrator provisioned. Remove ADMIN_BOOTSTRAP_SECRET from the environment now.',
        });
      } catch (err: any) {
        const msg = err?.message || 'Bootstrap failed';
        const status =
          msg.startsWith('BOOTSTRAP_FORBIDDEN') || msg.startsWith('BOOTSTRAP_DISABLED') ? 403 :
          msg.startsWith('BOOTSTRAP_ALREADY_COMPLETED') || msg.startsWith('BOOTSTRAP_USER_EXISTS') ? 409 :
          msg.startsWith('VALIDATION_ERROR') ? 422 :
          msg.startsWith('INACTIVE_ORGANIZATION') ? 403 : 400;
        return res.status(status).json({
          success: false,
          error: {
            code: msg.split(':')[0] || 'BOOTSTRAP_FAILED',
            message: msg,
          },
        });
      }
    }
  );

  app.post(
    '/api/auth/login',
    authRateLimiter,
    validateBody((body) => {
      // organizationId is optional for normal sign-in. AuthService resolves the
      // user's active organization from the email when there is exactly one.
      return validateLoginPayload(body);
    }),
    async (req: Request, res: Response) => {
      try {
        const result = await authService.login(req.body);
        return res.json({
          success: true,
          data: result,
        });
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('TENANT_SELECTION_REQUIRED')) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'TENANT_SELECTION_REQUIRED',
              message: 'This account belongs to multiple organizations. Select an organization to continue.',
            },
          });
        }
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password.',
          },
        });
      }
    }
  );

  app.get('/api/auth/me', requireAuth(), (req: Request, res: Response) => {
    res.json({
      success: true,
      data: req.auth,
    });
  });

  app.post('/api/auth/logout', requireAuth(), async (req: Request, res: Response) => {
    const token = req.headers.authorization?.replace('Bearer ', '').trim();
    if (token) {
      await authService.logout(token);
    }
    res.json({
      success: true,
      message: 'Session successfully revoked',
    });
  });

  // ------------------------------------------------------------------
  // 2. SYSTEM HEALTH & DIAGNOSTICS ENDPOINTS
  // ------------------------------------------------------------------
  const runtimeRevision = (
    process.env.GIT_COMMIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.APP_REVISION ||
    ''
  ).trim();

  app.get('/api/version', (req: Request, res: Response) => {
    res.json({
      service: 'Centralized Product Service',
      version: '2.6.0',
      revision: runtimeRevision,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/health', async (req: Request, res: Response) => {
    let isDbHealthy = false;
    try {
      if (dbStatus.connected) {
        await db.query('SELECT 1 as val');
        isDbHealthy = true;
      }
    } catch (err: any) {
      isDbHealthy = false;
      dbStatus.connected = false;
      dbStatus.error = err.message || 'Database ping error';
      console.error('[AbaCha Health Check] Database connection failure:', dbStatus.error);
    }

    if (!isDbHealthy) {
      return res.status(503).json({
        status: 'unhealthy',
        ready: false,
        service: 'Centralized Product Service',
        version: '2.6.0',
        revision: runtimeRevision,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: {
          connected: false,
        },
      });
    }

    res.json({
      status: 'ok',
      ready: true,
      service: 'Centralized Product Service',
      version: '2.6.0',
      revision: runtimeRevision,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        engine: dbStatus.engine,
        schemaVersion: dbStatus.version,
        migrationsCount: dbStatus.migrationsApplied.length,
      },
    });
  });

  app.get('/api/ready', async (req: Request, res: Response) => {
    let isDbHealthy = false;
    try {
      if (dbStatus.connected) {
        await db.query('SELECT 1 as val');
        isDbHealthy = true;
      }
    } catch (err: any) {
      isDbHealthy = false;
      dbStatus.connected = false;
      dbStatus.error = err.message || 'Database ping error';
      console.error('[AbaCha Ready Check] Database unavailable:', dbStatus.error);
    }

    if (!isDbHealthy) {
      return res.status(503).json({
        ready: false,
        status: 'unready',
        database: {
          connected: false,
        },
      });
    }
    res.json({
      ready: true,
      status: 'ready',
      database: {
        connected: true,
        engine: dbStatus.engine,
        schemaVersion: dbStatus.version,
      },
    });
  });

  // Authenticated Admin Diagnostic Endpoint (SEC-001)
  // Protected by admin rate limiting, authentication, and ADMIN_DIAGNOSTICS permission
  app.get(
    '/api/admin/db-status',
    adminRateLimiter,
    requireAuth(),
    requirePermission(PERMISSIONS.ADMIN_DIAGNOSTICS),
    (req: Request, res: Response) => {
      // Explicitly sanitize database credentials: never expose connection strings or passwords
      res.json({
        success: true,
        data: {
          connected: dbStatus.connected,
          engine: dbStatus.engine,
          schemaVersion: dbStatus.version,
          migrationsApplied: dbStatus.migrationsApplied,
          hasError: Boolean(dbStatus.error),
          error: dbStatus.error ? 'Database connectivity issue detected' : null,
          caller: {
            userId: req.auth?.userId,
            role: req.auth?.role,
            organizationId: req.auth?.organizationId,
          },
        },
      });
    }
  );

  // ------------------------------------------------------------------
  // 3. CATALOG SYNCHRONIZATION & AUDIT ENDPOINTS
  // ------------------------------------------------------------------
  app.get(
    '/api/catalog/sync-status',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_VIEW),
    (req: Request, res: Response) => {
      const isSuperAdmin = req.auth?.role === 'super_admin';
      const callerOrg = req.auth?.organizationId;

      const filteredProducts = isSuperAdmin
        ? masterProductsStore
        : masterProductsStore.filter((p) => p.organizationId === callerOrg);

      const totalVariants = filteredProducts.reduce((sum, p) => sum + (p.variants?.length || 0), 0);

      // Audit logs strictly filtered by caller tenant
      const filteredLogs = isSuperAdmin
        ? syncAuditLogs.slice(-10)
        : syncAuditLogs.filter((l) => l.organizationId === callerOrg).slice(-10);

      res.json({
        success: true,
        serviceName: 'Master Product Service API',
        isSingleSourceOfTruth: true,
        catalogMetrics: {
          totalProducts: filteredProducts.length,
          totalVariants: totalVariants,
          totalCategories: masterCategoriesStore.length,
          totalBrands: masterBrandsStore.length,
          totalAttributes: masterAttributesStore.length,
        },
        moduleIntegrations: [
          { name: 'POS Terminal Engine', status: 'ACTIVE_SYNC', lastPing: 'Just now', latencyMs: 1.2 },
          { name: 'E-commerce Storefront', status: 'ACTIVE_SYNC', lastPing: 'Just now', latencyMs: 2.4 },
          { name: 'Multi-Branch Inventory', status: 'ACTIVE_SYNC', lastPing: 'Just now', latencyMs: 0.8 },
        ],
        recentAuditLogs: filteredLogs,
      });
    }
  );

  app.post(
    '/api/catalog/sync',
    adminRateLimiter,
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_UPDATE),
    requireTenantAccess(),
    (req: Request, res: Response) => {
      // Authoritative actor identity bound to authenticated claims, ignoring client body overrides
      const logEntry = {
        id: `sync-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: req.body.action || 'CATALOG_FORCE_SYNC',
        target: req.body.target || 'All Modules',
        affectedModules: ['POS Terminal', 'E-commerce Storefront', 'Multi-Branch Inventory'],
        status: 'SYNCED' as const,
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        organizationId: req.auth!.organizationId,
      };
      syncAuditLogs.push(logEntry);
      res.json({
        success: true,
        message: 'Master product catalog successfully synchronized across POS, E-Commerce, and Inventory modules.',
        auditLog: logEntry,
      });
    }
  );

  // ------------------------------------------------------------------
  // 3. AUDIT & SECURITY ADMINISTRATION ENDPOINTS (AUD-001)
  // ------------------------------------------------------------------
  const handleAuditQuery = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = await resolveAuthorizedTenant(req, auditRepo, 'AUDIT');

      const rawPage = parseInt(req.query.page as string, 10);
      const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

      const rawLimit = parseInt((req.query.pageSize || req.query.limit) as string, 10);
      const pageSize = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 100);

      const result = await auditRepo.queryAuditEvents({
        organizationId: orgId,
        page,
        pageSize,
        startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
        endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
        action: typeof req.query.action === 'string' ? req.query.action : undefined,
        entityType: typeof (req.query.entityType || req.query.module) === 'string' ? (req.query.entityType || req.query.module) as string : undefined,
        entityId: typeof (req.query.entityId || req.query.targetId || req.query.target) === 'string' ? (req.query.entityId || req.query.targetId || req.query.target) as string : undefined,
        actorId: typeof (req.query.actorId || req.query.actor) === 'string' ? (req.query.actorId || req.query.actor) as string : undefined,
        severity: typeof req.query.severity === 'string' ? (req.query.severity as any) : undefined,
        result: typeof req.query.result === 'string' ? (req.query.result as any) : undefined,
        search: typeof (req.query.search || req.query.q) === 'string' ? (req.query.search || req.query.q) as string : undefined,
      });

      res.json({
        success: true,
        count: result.items.length,
        data: result.items,
        pagination: {
          totalCount: result.totalCount,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
          hasMore: result.hasMore,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  // Authoritative Security Metrics Overview
  app.get(
    '/api/tenant/audit/overview',
    requireAuth(),
    requirePermission(PERMISSIONS.AUDIT_VIEW),
    requireTenantAccess(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const orgId = await resolveAuthorizedTenant(req, auditRepo, 'AUDIT');
        const metrics = await auditRepo.getSecurityMetrics(orgId);
        res.json({
          success: true,
          data: metrics,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Authoritative Audit Logs Query Endpoints
  app.get(
    '/api/tenant/audit',
    requireAuth(),
    requirePermission(PERMISSIONS.AUDIT_VIEW),
    requireTenantAccess(),
    handleAuditQuery
  );

  app.get(
    '/api/audit-logs',
    requireAuth(),
    requirePermission(PERMISSIONS.AUDIT_VIEW),
    requireTenantAccess(),
    handleAuditQuery
  );

  // ------------------------------------------------------------------
  // 4. MASTER PRODUCTS CRUD API (TENANT-ISOLATED & PERMISSION-PROTECTED)
  // ------------------------------------------------------------------

  // GET /api/products - List products with tenant isolation
  app.get('/api/products', (req: Request, res: Response) => {
    if (req.auth && req.auth.organizationActive === false && !isPlatformRole(req.auth.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_ACCESS_DENIED',
          message: 'This organization is currently inactive.',
        },
      });
    }

    const { category, brand, search, channel, status, page = '1', limit = '100' } = req.query;

    let result = [...masterProductsStore];

    // Multi-tenant isolation:
    // If authenticated and not super_admin, caller sees ONLY their organization's catalog.
    // If unauthenticated public caller (e.g. storefront), caller sees default tenant's active catalog.
    if (req.auth && req.auth.role !== 'super_admin') {
      result = result.filter((p) => (p.organizationId || 'org_default') === req.auth!.organizationId);
    } else if (!req.auth) {
      result = result.filter((p) => (p.organizationId || 'org_default') === 'org_default' && p.status === 'active');
    }

    if (category && category !== 'All') {
      result = result.filter((p) => p.category.toLowerCase() === (category as string).toLowerCase());
    }

    if (brand && brand !== 'All') {
      result = result.filter((p) => p.brand.toLowerCase() === (brand as string).toLowerCase());
    }

    if (status && status !== 'All') {
      result = result.filter((p) => p.status === status);
    }

    if (channel && channel !== 'All') {
      if (channel === 'pos') result = result.filter((p) => p.channels?.pos);
      if (channel === 'ecommerce') result = result.filter((p) => p.channels?.ecommerce);
      if (channel === 'wholesale') result = result.filter((p) => p.channels?.wholesale);
    }

    if (search) {
      const q = (search as string).toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.variants.some((v) => v.sku.toLowerCase().includes(q) || v.barcode.toLowerCase().includes(q))
      );
    }

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 100;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = result.slice(startIndex, startIndex + limitNum);

    res.json({
      success: true,
      count: paginated.length,
      total: result.length,
      page: pageNum,
      totalPages: Math.ceil(result.length / limitNum),
      data: paginated,
    });
  });

  // GET /api/products/:id - Single product view with tenant validation
  app.get('/api/products/:id', (req: Request, res: Response) => {
    const product = masterProductsStore.find((p) => p.id === req.params.id || p.slug === req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found in master catalog' });
    }

    const productOrg = product.organizationId || 'org_default';

    // Tenant boundary: If authenticated non-super_admin, accessing another org's product is forbidden
    if (req.auth && req.auth.role !== 'super_admin' && productOrg !== req.auth.organizationId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_ACCESS_DENIED',
          message: 'Cross-tenant resource access forbidden.',
        },
      });
    }

    // Public access only permits default tenant products
    if (!req.auth && productOrg !== 'org_default') {
      return res.status(404).json({ success: false, error: 'Product not found in master catalog' });
    }

    res.json({ success: true, data: product });
  });

  // POST /api/products - Create product (Permission-protected, tenant-stamped)
  app.post(
    '/api/products',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_CREATE),
    requireTenantAccess(),
    validateBody(validateProductPayload),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body;
        const id = `prod-${randomUUID().slice(0, 8)}`;
        const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        // Server-authoritative tenant assignment: stamped from authenticated context
        const authoritativeOrg = await resolveAuthorizedTenant(req, auditRepo, 'PRODUCT');

        // Subscription plan product limit enforcement (TASK-5.6.2)
        const tenantProductsCount = masterProductsStore.filter((p) => (p.organizationId || 'org_default') === authoritativeOrg).length;
        await subscriptionService.assertCanCreateProduct(authoritativeOrg, tenantProductsCount);

        const newProduct: Product = {
          id,
          organizationId: authoritativeOrg,
        name: body.name,
        slug,
        brand: body.brand || 'Generic',
        category: body.category || 'Electronics',
        subcategory: body.subcategory || 'General',
        description: body.description || '',
        shortDescription: body.shortDescription || body.name,
        unit: body.unit || 'pcs',
        productType: body.productType || 'standard',
        status: body.status || 'active',
        channels: body.channels || { pos: true, ecommerce: true, wholesale: false },
        taxRate: body.taxRate ?? 10,
        rating: body.rating || 5.0,
        reviewCount: body.reviewCount || 0,
        tags: body.tags || [],
        images: body.images || ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80'],
        variants:
          body.variants && body.variants.length > 0
            ? body.variants.map((v: any, idx: number) => ({
                id: `var-${id}-${idx + 1}`,
                sku: v.sku || `SKU-${id.toUpperCase()}-${idx + 1}`,
                barcode: v.barcode || `8809${randomInt(10000000, 99999999)}`,
                name: v.name || 'Variant',
                attributes: v.attributes || {},
                costPrice: v.costPrice || '0.00',
                retailPrice: v.retailPrice || '100.00',
                wholesalePrice: v.wholesalePrice || v.retailPrice || '80.00',
                memberPrice: v.memberPrice || v.retailPrice || '90.00',
                minSellingPrice: v.minSellingPrice || v.retailPrice || '70.00',
                weightKg: v.weightKg,
                dimensionsCm: v.dimensionsCm,
                unit: v.unit,
                stockByLocation: v.stockByLocation || {},
                lowStockThreshold: v.lowStockThreshold || 10,
                image: v.image,
                isActive: v.isActive !== false,
                trackInventory: v.trackInventory !== false,
              }))
            : [
                {
                  id: `var-${id}-default`,
                  sku: body.sku || `SKU-${id.toUpperCase()}`,
                  barcode: body.barcode || `8809${randomInt(10000000, 99999999)}`,
                  name: 'Default Variant',
                  attributes: { Standard: 'Default' },
                  costPrice: body.costPrice || '0.00',
                  retailPrice: body.retailPrice || '100.00',
                  wholesalePrice: body.wholesalePrice || body.retailPrice || '80.00',
                  memberPrice: body.memberPrice || body.retailPrice || '90.00',
                  minSellingPrice: body.minSellingPrice || body.retailPrice || '70.00',
                  stockByLocation: body.stockByLocation || {
                    'loc-main-wh': 50,
                    'loc-store-downtown': 25,
                    'loc-branch-north': 15,
                    'loc-dist-center': 100,
                  },
                  lowStockThreshold: body.lowStockThreshold || 10,
                },
              ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      masterProductsStore.unshift(newProduct);

      syncAuditLogs.push({
        id: `sync-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'CREATE_PRODUCT',
        target: `Product: ${newProduct.name} (${newProduct.id})`,
        affectedModules: ['POS Terminal', 'E-commerce Storefront', 'Multi-Branch Inventory'],
        status: 'SYNCED',
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        organizationId: req.auth!.organizationId,
      });

      res.status(201).json({ success: true, message: 'Product created successfully in Master Catalog', data: newProduct });
      } catch (err) {
        next(err);
      }
    }
  );

  // PUT /api/products/:id - Update product (Cross-tenant modification forbidden)
  app.put(
    '/api/products/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_UPDATE),
    requireTenantAccess(),
    validateBody((b: any) => validateProductPayload(b, true)),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const index = masterProductsStore.findIndex((p) => p.id === req.params.id);
        if (index === -1) {
          return res.status(404).json({ success: false, error: 'Product not found in master catalog' });
        }

        const existing = masterProductsStore[index];
        const existingOrg = existing.organizationId || 'org_default';

        const orgId = await resolveAuthorizedTenant(req, auditRepo, 'PRODUCT');

        // Enforce tenant boundary: cannot modify another tenant's product
        if (existingOrg !== orgId) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'TENANT_ACCESS_DENIED',
              message: 'Cross-tenant resource modification forbidden.',
            },
          });
        }

      const updated: Product = {
        ...existing,
        ...req.body,
        id: existing.id,
        organizationId: existing.organizationId,
        updatedAt: new Date().toISOString(),
      };

      masterProductsStore[index] = updated;

      syncAuditLogs.push({
        id: `sync-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'UPDATE_PRODUCT',
        target: `Product: ${updated.name} (${updated.id})`,
        affectedModules: ['POS Terminal', 'E-commerce Storefront', 'Multi-Branch Inventory'],
        status: 'SYNCED',
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        organizationId: req.auth!.organizationId,
      });

      res.json({ success: true, message: 'Master Product updated successfully', data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  // DELETE /api/products/:id - Delete product (Cross-tenant deletion forbidden)
  app.delete(
    '/api/products/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_DELETE),
    requireTenantAccess(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const index = masterProductsStore.findIndex((p) => p.id === req.params.id);
        if (index === -1) {
          return res.status(404).json({ success: false, error: 'Product not found' });
        }

        const existing = masterProductsStore[index];
        const existingOrg = existing.organizationId || 'org_default';

        const orgId = await resolveAuthorizedTenant(req, auditRepo, 'PRODUCT');

        // Enforce tenant boundary: cannot delete another tenant's product
        if (existingOrg !== orgId) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'TENANT_ACCESS_DENIED',
              message: 'Cross-tenant resource deletion forbidden.',
            },
          });
        }

      const removed = masterProductsStore.splice(index, 1)[0];

      syncAuditLogs.push({
        id: `sync-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'DELETE_PRODUCT',
        target: `Product: ${removed.name} (${removed.id})`,
        affectedModules: ['POS Terminal', 'E-commerce Storefront', 'Multi-Branch Inventory'],
        status: 'SYNCED',
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        organizationId: req.auth!.organizationId,
      });

      res.json({ success: true, message: 'Product deleted from Master Catalog', deletedId: req.params.id });
      } catch (err) {
        next(err);
      }
    }
  );

  // ------------------------------------------------------------------
  // 5. VARIANTS & SKU MANAGEMENT CRUD API
  // ------------------------------------------------------------------

  // GET /api/products/:productId/variants
  app.get('/api/products/:productId/variants', (req: Request, res: Response) => {
    const product = masterProductsStore.find((p) => p.id === req.params.productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const productOrg = product.organizationId;
    if (req.auth && req.auth.role !== 'super_admin' && productOrg !== req.auth.organizationId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_ACCESS_DENIED',
          message: 'Cross-tenant resource access forbidden.',
        },
      });
    }

    res.json({ success: true, data: product.variants });
  });

  // POST /api/products/:productId/variants
  app.post(
    '/api/products/:productId/variants',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_CREATE),
    requireTenantAccess(),
    validateBody(validateVariantPayload),
    (req: Request, res: Response) => {
      const product = masterProductsStore.find((p) => p.id === req.params.productId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      const isSuperAdmin = req.auth!.role === 'super_admin';
      const productOrg = product.organizationId;
      if (!isSuperAdmin && productOrg !== req.auth!.organizationId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'TENANT_ACCESS_DENIED',
            message: 'Cross-tenant variant creation forbidden.',
          },
        });
      }

      const body = req.body;
      const variantId = `var-${randomUUID().slice(0, 8)}`;
      const newVariant: ProductVariant = {
        id: variantId,
        sku: body.sku || `SKU-${product.brand.slice(0, 3).toUpperCase()}-${randomInt(1000, 9999)}`,
        barcode: body.barcode || `8809${randomInt(10000000, 99999999)}`,
        name: body.name || 'New Variant',
        attributes: body.attributes || {},
        costPrice: body.costPrice || '0.00',
        retailPrice: body.retailPrice,
        wholesalePrice: body.wholesalePrice || body.retailPrice,
        memberPrice: body.memberPrice || body.retailPrice,
        minSellingPrice: body.minSellingPrice || body.retailPrice,
        stockByLocation: body.stockByLocation || { 'loc-main-wh': 20, 'loc-store-downtown': 10 },
        lowStockThreshold: body.lowStockThreshold !== undefined ? Number(body.lowStockThreshold) : 5,
        image: body.image,
      };

      product.variants.push(newVariant);
      product.updatedAt = new Date().toISOString();

      syncAuditLogs.push({
        id: `sync-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'CREATE_VARIANT',
        target: `SKU: ${newVariant.sku} (${product.name})`,
        affectedModules: ['POS Terminal', 'E-commerce Storefront', 'Multi-Branch Inventory'],
        status: 'SYNCED',
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        organizationId: req.auth!.organizationId,
      });

      res.status(201).json({ success: true, message: 'Variant SKU created', data: newVariant });
    }
  );

  // PUT /api/products/:productId/variants/:variantId
  app.put(
    '/api/products/:productId/variants/:variantId',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_UPDATE),
    requireTenantAccess(),
    validateBody((b: any) => validateVariantPayload(b, true)),
    (req: Request, res: Response) => {
      const product = masterProductsStore.find((p) => p.id === req.params.productId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      const isSuperAdmin = req.auth!.role === 'super_admin';
      const productOrg = product.organizationId;
      if (!isSuperAdmin && productOrg !== req.auth!.organizationId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'TENANT_ACCESS_DENIED',
            message: 'Cross-tenant variant modification forbidden.',
          },
        });
      }

      const varIndex = product.variants.findIndex((v) => v.id === req.params.variantId);
      if (varIndex === -1) {
        return res.status(404).json({ success: false, error: 'Variant not found' });
      }

      const existing = product.variants[varIndex];
      const sanitizedBody = req.body;
      delete sanitizedBody.id;

      const updated = { ...existing, ...sanitizedBody, id: existing.id };
      product.variants[varIndex] = updated;
      product.updatedAt = new Date().toISOString();

      syncAuditLogs.push({
        id: `sync-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'UPDATE_VARIANT',
        target: `SKU: ${updated.sku} (${product.name})`,
        affectedModules: ['POS Terminal', 'E-commerce Storefront', 'Multi-Branch Inventory'],
        status: 'SYNCED',
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        organizationId: req.auth!.organizationId,
      });

      res.json({ success: true, message: 'Variant SKU updated', data: updated });
    }
  );

  // DELETE /api/products/:productId/variants/:variantId
  app.delete(
    '/api/products/:productId/variants/:variantId',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_DELETE),
    requireTenantAccess(),
    (req: Request, res: Response) => {
      const product = masterProductsStore.find((p) => p.id === req.params.productId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      const isSuperAdmin = req.auth!.role === 'super_admin';
      const productOrg = product.organizationId;
      if (!isSuperAdmin && productOrg !== req.auth!.organizationId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'TENANT_ACCESS_DENIED',
            message: 'Cross-tenant variant deletion forbidden.',
          },
        });
      }

      if (product.variants.length <= 1) {
        return res.status(400).json({ success: false, error: 'Cannot delete the only variant of a master product' });
      }

      const varIndex = product.variants.findIndex((v) => v.id === req.params.variantId);
      if (varIndex === -1) {
        return res.status(404).json({ success: false, error: 'Variant not found' });
      }

      const removed = product.variants.splice(varIndex, 1)[0];
      product.updatedAt = new Date().toISOString();

      syncAuditLogs.push({
        id: `sync-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'DELETE_VARIANT',
        target: `SKU: ${removed.sku} (${product.name})`,
        affectedModules: ['POS Terminal', 'E-commerce Storefront', 'Multi-Branch Inventory'],
        status: 'SYNCED',
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        organizationId: req.auth!.organizationId,
      });

      res.json({ success: true, message: 'Variant SKU removed', deletedVariantId: removed.id });
    }
  );

  // GET /api/skus/lookup/:sku
  app.get('/api/skus/lookup/:sku', (req: Request, res: Response) => {
    const query = req.params.sku.toLowerCase().trim();
    const isSuperAdmin = req.auth?.role === 'super_admin';
    const callerOrg = req.auth?.organizationId;

    for (const prod of masterProductsStore) {
      const prodOrg = prod.organizationId || 'org_default';
      // Tenant filtering
      if (req.auth && !isSuperAdmin && prodOrg !== callerOrg) continue;
      if (!req.auth && prodOrg !== 'org_default') continue;

      for (const variant of prod.variants) {
        if (
          variant.sku.toLowerCase() === query ||
          variant.barcode.toLowerCase() === query ||
          variant.id.toLowerCase() === query
        ) {
          const totalStock = Object.values(variant.stockByLocation || {}).reduce((a, b) => a + (b || 0), 0);
          return res.json({
            success: true,
            found: true,
            product: {
              id: prod.id,
              name: prod.name,
              brand: prod.brand,
              category: prod.category,
              taxRate: prod.taxRate,
              channels: prod.channels,
            },
            variant: variant,
            totalStock: totalStock,
            stockByLocation: variant.stockByLocation,
          });
        }
      }
    }

    res.status(404).json({ success: false, found: false, error: `SKU or Barcode '${req.params.sku}' not found in Product Master Catalog` });
  });

  // ------------------------------------------------------------------
  // 6. CATALOG ATTRIBUTES CRUD API
  // ------------------------------------------------------------------
  app.get('/api/attributes', (req: Request, res: Response) => {
    const isSuperAdmin = req.auth?.role === 'super_admin';
    const callerOrg = req.auth?.organizationId;

    const filtered = req.auth && !isSuperAdmin
      ? masterAttributesStore.filter((a) => a.organizationId === callerOrg)
      : masterAttributesStore;

    res.json({ success: true, count: filtered.length, data: filtered });
  });

  app.post(
    '/api/attributes',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_CREATE),
    requireTenantAccess(),
    validateBody(validateAttributePayload),
    (req: Request, res: Response) => {
      const body = req.body;
      const id = `attr-${randomUUID().slice(0, 8)}`;
      const newAttr: CatalogAttribute = {
        id,
        organizationId: req.auth!.organizationId,
        name: body.name,
        code: body.code || body.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        type: body.type || 'select',
        options: body.values || body.options || [],
        required: body.required || false,
        description: body.description || '',
        usageCount: 0,
      };

      masterAttributesStore.push(newAttr);

      syncAuditLogs.push({
        id: `sync-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'CREATE_ATTRIBUTE',
        target: `Attr: ${newAttr.name} (${newAttr.code})`,
        affectedModules: ['POS Terminal', 'E-commerce Storefront'],
        status: 'SYNCED',
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        organizationId: req.auth!.organizationId,
      });

      res.status(201).json({ success: true, message: 'Catalog Attribute created', data: newAttr });
    }
  );

  app.put(
    '/api/attributes/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_UPDATE),
    requireTenantAccess(),
    validateBody((b: any) => validateAttributePayload(b, true)),
    (req: Request, res: Response) => {
      const index = masterAttributesStore.findIndex((a) => a.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ success: false, error: 'Attribute not found' });
      }

      const existing = masterAttributesStore[index];
      const isSuperAdmin = req.auth!.role === 'super_admin';
      const attrOrg = existing.organizationId;

      if (!isSuperAdmin && attrOrg !== req.auth!.organizationId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'TENANT_ACCESS_DENIED',
            message: 'Cross-tenant attribute modification forbidden.',
          },
        });
      }

      const updated = {
        ...existing,
        ...req.body,
        id: existing.id,
        organizationId: existing.organizationId,
      };
      masterAttributesStore[index] = updated;

      syncAuditLogs.push({
        id: `sync-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'UPDATE_ATTRIBUTE',
        target: `Attr: ${updated.name} (${updated.id})`,
        affectedModules: ['POS Terminal', 'E-commerce Storefront'],
        status: 'SYNCED',
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        organizationId: req.auth!.organizationId,
      });

      res.json({ success: true, message: 'Attribute updated', data: updated });
    }
  );

  app.delete(
    '/api/attributes/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_DELETE),
    requireTenantAccess(),
    (req: Request, res: Response) => {
      const index = masterAttributesStore.findIndex((a) => a.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ success: false, error: 'Attribute not found' });
      }

      const existing = masterAttributesStore[index];
      const isSuperAdmin = req.auth!.role === 'super_admin';
      const attrOrg = existing.organizationId;

      if (!isSuperAdmin && attrOrg !== req.auth!.organizationId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'TENANT_ACCESS_DENIED',
            message: 'Cross-tenant attribute deletion forbidden.',
          },
        });
      }

      const removed = masterAttributesStore.splice(index, 1)[0];

      syncAuditLogs.push({
        id: `sync-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'DELETE_ATTRIBUTE',
        target: `Attr: ${removed.name} (${removed.id})`,
        affectedModules: ['POS Terminal', 'E-commerce Storefront'],
        status: 'SYNCED',
        actorId: req.auth!.userId,
        actorRole: req.auth!.role,
        organizationId: req.auth!.organizationId,
      });

      res.json({ success: true, message: 'Attribute removed', deletedId: req.params.id });
    }
  );

  // ------------------------------------------------------------------
  // 7. MASTER CATEGORIES & BRANDS ENDPOINTS
  // ------------------------------------------------------------------
  app.get('/api/categories', (req: Request, res: Response) => {
    const callerOrg = req.auth?.organizationId;
    const isSuperAdmin = req.auth?.role === 'super_admin';
    const filtered = isSuperAdmin
      ? masterCategoriesStore
      : masterCategoriesStore.filter((c) => c.organizationId === callerOrg);
    res.json({ success: true, count: filtered.length, data: filtered });
  });

  app.post(
    '/api/categories',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_CREATE),
    requireTenantAccess(),
    validateBody(validateCategoryPayload),
    (req: Request, res: Response) => {
      const body = req.body;
      const newCat: Category = {
        id: `cat-${randomUUID().slice(0, 8)}`,
        organizationId: req.auth!.organizationId,
        name: body.name,
        slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        description: body.description || '',
        subcategories: body.subcategories || [],
        displayOrder: body.displayOrder || masterCategoriesStore.length + 1,
        isPosQuickAccess: body.isPosQuickAccess || false,
      };
      masterCategoriesStore.push(newCat);
      res.status(201).json({ success: true, data: newCat });
    }
  );

  app.get('/api/brands', (req: Request, res: Response) => {
    const callerOrg = req.auth?.organizationId;
    const isSuperAdmin = req.auth?.role === 'super_admin';
    const filtered = isSuperAdmin
      ? masterBrandsStore
      : masterBrandsStore.filter((b) => b.organizationId === callerOrg);
    res.json({ success: true, count: filtered.length, data: filtered });
  });

  app.post(
    '/api/brands',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_CREATE),
    requireTenantAccess(),
    validateBody(validateBrandPayload),
    (req: Request, res: Response) => {
      const body = req.body;
      const newBrand: Brand = {
        id: `brand-${randomUUID().slice(0, 8)}`,
        organizationId: req.auth!.organizationId,
        name: body.name,
        slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        isActive: body.isActive !== false,
      };
      masterBrandsStore.push(newBrand);
      res.status(201).json({ success: true, data: newBrand });
    }
  );

  // ------------------------------------------------------------------
  // 8. DATA REPOSITORY BOUNDARIES (LOCATIONS, INVENTORY, ORDERS, CUSTOMERS, USERS)
  // ------------------------------------------------------------------

  // Locations Query (Tenant-scoped at SQL boundary)
  app.get(
    '/api/locations',
    requireAuth(),
    requireTenantAccess(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const orgId = await resolveAuthorizedTenant(req, auditRepo, 'LOCATION');

        const result = await db.query(
          'SELECT id, organization_id, code, name, type, address, phone, is_pos_enabled, is_active FROM locations WHERE organization_id = $1 ORDER BY name ASC',
          [orgId]
        );
        res.json({ success: true, count: result.rows.length, data: result.rows });
      } catch (err) {
        next(err);
      }
    }
  );


  app.post(
    '/api/locations',
    requireAuth(),
    requirePermission(PERMISSIONS.LOCATIONS_MANAGE),
    requireTenantAccess(),
    validateBody(validateLocationPayload),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const orgId = await resolveAuthorizedTenant(req, auditRepo, 'LOCATION');
        // Subscription plan location limit & multi-location feature gating (TASK-5.6.2)
        await subscriptionService.assertCanCreateLocation(orgId, db);
        const { code, name, type, address, phone, manager_name, is_pos_enabled, is_active } = req.body;
        const id = `loc-${randomUUID()}`;
        const result = await db.query(
          `INSERT INTO locations
            (id, organization_id, code, name, type, address, phone, manager_name, is_pos_enabled, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id, organization_id, code, name, type, address, phone, manager_name, is_pos_enabled, is_active, created_at, updated_at`,
          [id, orgId, code, name, type, address ?? null, phone ?? null, manager_name ?? null, is_pos_enabled ?? false, is_active ?? true]
        );
        const created = result.rows[0];
        await auditRepo.recordEvent({
          organization_id: orgId, actor_id: req.auth!.userId,
          actor_name: (req.auth as any)?.name || req.auth!.userId,
          actor_role: req.auth!.role, action: 'CREATE_LOCATION',
          entity_type: 'LOCATION', entity_id: id,
          metadata: { code, name, type }
        });
        return res.status(201).json({ success: true, data: created });
      } catch (err: any) {
        if (err?.code === '23505') {
          return res.status(409).json({ success: false, error: { code: 'DUPLICATE_LOCATION_CODE', message: 'A location with this code already exists in this tenant.' } });
        }
        next(err);
      }
    }
  );

  app.put(
    '/api/locations/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.LOCATIONS_MANAGE),
    requireTenantAccess(),
    validateBody((body: any) => validateLocationPayload(body, true)),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const orgId = await resolveAuthorizedTenant(req, auditRepo, 'LOCATION');
        const existing = await db.query('SELECT id FROM locations WHERE id = $1 AND organization_id = $2', [req.params.id, orgId]);
        if (existing.rows.length === 0) {
          const other = await db.query('SELECT 1 FROM locations WHERE id = $1 AND organization_id <> $2', [req.params.id, orgId]);
          if (other.rows.length > 0) {
            return res.status(403).json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Cross-tenant location modification forbidden.' } });
          }
          return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Location not found.' } });
        }
        const allowed = ['code','name','type','address','phone','manager_name','is_pos_enabled','is_active'];
        const sets: string[] = [];
        const values: any[] = [];
        for (const key of allowed) {
          if (Object.prototype.hasOwnProperty.call(req.body, key)) {
            values.push(req.body[key] ?? null);
            sets.push(`${key} = ${values.length}`);
          }
        }
        if (sets.length === 0) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'At least one mutable location field is required.' } });
        values.push(req.params.id, orgId);
        const result = await db.query(
          `UPDATE locations SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
           WHERE id = ${values.length - 1} AND organization_id = ${values.length}
           RETURNING id, organization_id, code, name, type, address, phone, manager_name, is_pos_enabled, is_active, created_at, updated_at`,
          values
        );
        const updated = result.rows[0];
        await auditRepo.recordEvent({
          organization_id: orgId, actor_id: req.auth!.userId,
          actor_name: (req.auth as any)?.name || req.auth!.userId,
          actor_role: req.auth!.role, action: 'UPDATE_LOCATION',
          entity_type: 'LOCATION', entity_id: req.params.id,
          metadata: { changedFields: Object.keys(req.body) }
        });
        return res.json({ success: true, data: updated });
      } catch (err: any) {
        if (err?.code === '23505') {
          return res.status(409).json({ success: false, error: { code: 'DUPLICATE_LOCATION_CODE', message: 'A location with this code already exists in this tenant.' } });
        }
        next(err);
      }
    }
  );

  // Inventory Management API (INV-001: Balances, Movements, Reservations, Transfers, Stock Counts)
  app.use('/api/inventory', createInventoryRouter(db, inventoryRepo, subscriptionService));
  app.use('/api/pos', createPosRouter(db, posService, subscriptionService));
  app.use('/api/storefront', createStorefrontRouter(db, orderService, subscriptionService));
  if (process.env.NODE_ENV !== 'test') {
    app.locals.reservationExpiryWorker = startReservationExpiryWorker({ db });
  }

  // Orders Query (Tenant-scoped)
  app.get(
    '/api/orders',
    requireAuth(),
    requirePermission(PERMISSIONS.ORDERS_VIEW),
    requireTenantAccess(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const orgId = await resolveAuthorizedTenant(req, auditRepo, 'ORDER');

        const orders = await orderRepo.listOrders({ orgId, limit: 50 });
        res.json({ success: true, count: orders.length, data: orders });
      } catch (err) {
        next(err);
      }
    }
  );

  // Storefront / E-commerce and POS Order Creation API (UX-001 Phase 2.2 Phase C)
  app.post(
    '/api/orders',
    requireAuth(),
    requireTenantAccess(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const orgId = await resolveAuthorizedTenant(req, auditRepo, 'ORDER');
        // Subscription plan order limit & storefront feature gating (TASK-5.6.2)
        await subscriptionService.assertFeatureEnabled(orgId, 'storefront');
        await subscriptionService.assertCanCreateOrder(orgId, db);
        const actorName = (req.auth as any)?.name || req.auth!.userId;

        // Secure authentication/role boundary check
        const isStorefrontUser = req.auth!.role === 'viewer';
        const hasOrderCreatePermission = req.auth!.permissions?.includes(PERMISSIONS.ORDERS_CREATE);
        if (!isStorefrontUser && !hasOrderCreatePermission) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You do not have permission to create orders.',
            },
          });
        }

        const {
          customer,
          fulfillmentMethod,
          paymentMethod,
          cart_items,
          idempotency_key,
          discount_code,
          location_id,
        } = req.body;

        const result = await orderService.placeStorefrontOrder({
          organization_id: orgId,
          actor_name: actorName,
          actor_role: req.auth!.role,
          idempotency_key,
          customer_id: customer?.id || null,
          customer_details: customer ? {
            name: customer.name || '',
            email: customer.email || '',
            phone: customer.phone || '',
          } : null,
          fulfillment_method: fulfillmentMethod,
          payment_method: paymentMethod,
          cart_items,
          discount_code,
          location_id,
        });

        res.status(201).json({
          success: true,
          data: {
            ...result.order,
            items: result.items,
            payments: result.payments,
          },
        });
      } catch (err: any) {
        let code = 'INTERNAL_SERVER_ERROR';
        let status = 500;
        let message = 'An internal server error occurred while processing the order. Please try again later.';

        if (err instanceof DomainError) {
          code = err.code;
          message = err.message;
          if (code === 'IDEMPOTENCY_CONFLICT') {
            status = 409;
          } else if (code === 'PRODUCT_NOT_FOUND') {
            status = 404;
          } else if (code === 'VALIDATION_ERROR' || code === 'INSUFFICIENT_STOCK') {
            status = 400;
          } else if (code === 'FORBIDDEN') {
            status = 403;
          } else {
            status = 400;
          }
        } else {
          // It is an arbitrary exception (database error, etc.). DO NOT return err.message!
          console.error('[Storefront Checkout Internal Error]:', {
            message: err?.message,
            stack: err?.stack,
          });
        }

        return res.status(status).json({
          success: false,
          error: {
            code,
            message,
          },
        });
      }
    }
  );

  app.get(
    '/api/orders/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.ORDERS_VIEW),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerOrg = req.auth!.organizationId;
        const isSuperAdmin = req.auth!.role === 'super_admin';
        const targetOrg = await resolveAuthorizedTenant(req, auditRepo, 'ORDER');

        // Scoped directly at repository level with mandatory organizationId
        let order = await orderRepo.findOrderById(req.params.id, targetOrg);

        if (!order && isSuperAdmin) {
          const orgLookup = await db.query<any>('SELECT organization_id FROM orders WHERE id = $1', [req.params.id]);
          if (orgLookup.rows.length > 0) {
            const foundOrg = orgLookup.rows[0].organization_id;
            order = await orderRepo.findOrderById(req.params.id, foundOrg);
            if (order && auditRepo) {
              await auditRepo.recordEvent({
                organization_id: foundOrg,
                actor_id: req.auth!.userId,
                actor_name: (req.auth as any)?.name || req.auth!.userId,
                actor_role: req.auth!.role,
                action: 'SUPER_ADMIN_CROSS_TENANT_READ',
                entity_type: 'ORDER',
                entity_id: req.params.id,
                metadata: {
                  homeOrganization: callerOrg,
                  targetOrganization: foundOrg,
                  path: req.originalUrl || req.url,
                  method: req.method,
                },
              });
            }
          }
        }

        if (!order) {
          if (!isSuperAdmin) {
            // If the resource belongs to another tenant, return explicit 403 TENANT_ACCESS_DENIED
            // Note: never exposes or selects the other tenant's organization ID.
            const otherRes = await db.query<any>(
              `SELECT 1 FROM orders WHERE id = $1 AND organization_id != $2`,
              [req.params.id, callerOrg]
            );
            if (otherRes.rows.length > 0) {
              return res.status(403).json({
                success: false,
                error: {
                  code: 'TENANT_ACCESS_DENIED',
                  message: 'Cross-tenant order access forbidden.',
                },
              });
            }
          }
          return res.status(404).json({ success: false, error: 'Order not found' });
        }

        res.json({ success: true, data: order });
      } catch (err) {
        next(err);
      }
    }
  );

  // Customers Query (Tenant-scoped)
  app.get(
    '/api/customers',
    requireAuth(),
    requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
    requireTenantAccess(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const targetOrg = await resolveAuthorizedTenant(req, auditRepo);
        const customers = await customerRepo.listCustomers(targetOrg);
        res.json({ success: true, count: customers.length, data: customers });
      } catch (err) {
        next(err);
      }
    }
  );

  app.get(
    '/api/customers/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const callerOrg = req.auth!.organizationId;
        const isSuperAdmin = req.auth!.role === 'super_admin';
        const targetOrg = await resolveAuthorizedTenant(req, auditRepo, 'CUSTOMER');

        // Scoped directly at repository level
        let customer = await customerRepo.findCustomerById(req.params.id, targetOrg);

        if (!customer && isSuperAdmin) {
          const orgLookup = await db.query<any>('SELECT organization_id FROM customers WHERE id = $1', [req.params.id]);
          if (orgLookup.rows.length > 0) {
            const foundOrg = orgLookup.rows[0].organization_id;
            customer = await customerRepo.findCustomerById(req.params.id, foundOrg);
            if (customer && auditRepo) {
              await auditRepo.recordEvent({
                organization_id: foundOrg,
                actor_id: req.auth!.userId,
                actor_name: (req.auth as any)?.name || req.auth!.userId,
                actor_role: req.auth!.role,
                action: 'SUPER_ADMIN_CROSS_TENANT_READ',
                entity_type: 'CUSTOMER',
                entity_id: req.params.id,
                metadata: {
                  homeOrganization: callerOrg,
                  targetOrganization: foundOrg,
                  path: req.originalUrl || req.url,
                  method: req.method,
                },
              });
            }
          }
        }

        if (!customer) {
          if (!isSuperAdmin) {
            // If the resource belongs to another tenant, return explicit 403 TENANT_ACCESS_DENIED
            // Note: never exposes or selects the other tenant's organization ID.
            const otherRes = await db.query<any>(
              `SELECT 1 FROM customers WHERE id = $1 AND organization_id != $2`,
              [req.params.id, callerOrg]
            );
            if (otherRes.rows.length > 0) {
              return res.status(403).json({
                success: false,
                error: {
                  code: 'TENANT_ACCESS_DENIED',
                  message: 'Cross-tenant customer access forbidden.',
                },
              });
            }
          }
          return res.status(404).json({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Customer not found',
            },
          });
        }

        res.json({ success: true, data: customer });
      } catch (err) {
        next(err);
      }
    }
  );


  app.post(
    '/api/customers',
    requireAuth(),
    requirePermission(PERMISSIONS.CUSTOMERS_CREATE),
    requireTenantAccess(),
    validateBody(validateCustomerPayload),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const orgId = await resolveAuthorizedTenant(req, auditRepo, 'CUSTOMER');
        const id = `cust-${randomUUID()}`;
        const body = req.body;
        const created = await customerRepo.createCustomer({
          id,
          organization_id: orgId,
          name: body.name.trim(),
          email: body.email || null,
          phone: body.phone || null,
          tier: body.tier || 'Bronze',
          store_credit_balance: body.store_credit_balance || '0.00',
          credit_limit: body.credit_limit || '0.00',
          notes: body.notes || null,
        });
        await auditRepo.recordEvent({
          organization_id: orgId, actor_id: req.auth!.userId,
          actor_name: (req.auth as any)?.name || req.auth!.userId,
          actor_role: req.auth!.role, action: 'CREATE_CUSTOMER',
          entity_type: 'CUSTOMER', entity_id: id, metadata: { name: body.name }
        });
        return res.status(201).json({ success: true, data: created });
      } catch (err) { next(err); }
    }
  );

  app.put(
    '/api/customers/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.CUSTOMERS_UPDATE),
    requireTenantAccess(),
    validateBody((body: any) => validateCustomerPayload(body, true)),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const orgId = await resolveAuthorizedTenant(req, auditRepo, 'CUSTOMER');
        const existing = await customerRepo.findCustomerById(req.params.id, orgId);
        if (!existing) {
          const other = await db.query('SELECT 1 FROM customers WHERE id = $1 AND organization_id <> $2', [req.params.id, orgId]);
          if (other.rows.length > 0) return res.status(403).json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Cross-tenant customer modification forbidden.' } });
          return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
        }
        const b = req.body;
        const sets: string[] = [];
        const values: any[] = [];
        for (const key of ['name','email','phone','tier','store_credit_balance','credit_limit','notes']) {
          if (Object.prototype.hasOwnProperty.call(b, key)) {
            values.push(b[key] === '' ? null : b[key]);
            sets.push(`${key} = ${values.length}`);
          }
        }
        if (sets.length === 0) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'At least one mutable customer field is required.' } });
        values.push(req.params.id, orgId);
        const result = await db.query(
          `UPDATE customers SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ${values.length - 1} AND organization_id = ${values.length} RETURNING id, organization_id, name, email, phone, tier, loyalty_points, store_credit_balance, credit_limit, customer_group, notes, registered_at, created_at, updated_at`,
          values
        );
        const updated = result.rows[0];
        await auditRepo.recordEvent({
          organization_id: orgId, actor_id: req.auth!.userId,
          actor_name: (req.auth as any)?.name || req.auth!.userId,
          actor_role: req.auth!.role, action: 'UPDATE_CUSTOMER',
          entity_type: 'CUSTOMER', entity_id: req.params.id,
          metadata: { changedFields: Object.keys(b) }
        });
        return res.json({ success: true, data: updated });
      } catch (err) { next(err); }
    }
  );

  // User Management
  app.get(
    '/api/users',
    requireAuth(),
    requirePermission(PERMISSIONS.USERS_VIEW),
    requireTenantAccess(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const orgId = await resolveAuthorizedTenant(req, auditRepo, 'USER');

        const users = await userRepo.listByOrg(orgId);
        const sanitized = users.map((u) => ({
          id: u.id,
          organizationId: u.organization_id,
          email: u.email,
          name: u.name,
          role: u.role,
          locationId: u.location_id,
          isActive: u.is_active,
          createdAt: u.created_at,
        }));

        res.json({ success: true, count: sanitized.length, data: sanitized });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/users',
    requireAuth(),
    requirePermission(PERMISSIONS.USERS_CREATE),
    requireTenantAccess(),
    validateBody(validateUserPayload),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { email, name, password, role, locationId } = req.body;
        const isSuperAdmin = req.auth!.role === 'super_admin';

        // Tenant user creation can never create platform identities or privilege-escalate into super_admin.
        const tenantAssignableRoles = ['admin', 'manager', 'cashier', 'inventory_manager', 'purchasing_manager', 'sales_user', 'viewer'];
        if (!tenantAssignableRoles.includes(role) && !(isSuperAdmin && role === 'admin')) {
          return res.status(403).json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'The requested role is not assignable as a tenant user.' } });
        }
        if (role === 'admin' && !isSuperAdmin) {
          return res.status(403).json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Only super_admin can assign the admin role.' } });
        }

        // Server-authoritative tenant assignment via Model B
        const targetOrgId = await resolveAuthorizedTenant(req, auditRepo, 'USER');

        // Subscription plan user limit enforcement (TASK-5.6.2)
        await subscriptionService.assertCanCreateUser(targetOrgId, db);

        const { hash, salt } = hashPassword(password);
        const created = await userRepo.createUser({
          organizationId: targetOrgId,
          email,
          name,
          passwordHash: hash,
          passwordSalt: salt,
          role,
          locationId: locationId || undefined,
        });

        await auditRepo.recordEvent({
          organization_id: targetOrgId,
          actor_id: req.auth!.userId,
          actor_name: (req.auth as any)?.name || req.auth!.email || req.auth!.userId,
          actor_role: req.auth!.role,
          action: 'USER_CREATED',
          entity_type: 'USER',
          entity_id: created.id,
          after_state: {
            id: created.id,
            email: created.email,
            name: created.name,
            role: created.role,
            location_id: created.location_id,
            is_active: created.is_active,
          },
          metadata: {
            createdUserEmail: created.email,
            createdUserRole: created.role,
          },
          severity: 'Medium',
          result: 'SUCCESS',
        });

        res.status(201).json({
          success: true,
          data: {
            id: created.id,
            organizationId: created.organization_id,
            email: created.email,
            name: created.name,
            role: created.role,
            locationId: created.location_id,
            isActive: created.is_active,
            createdAt: created.created_at,
          },
        });
      } catch (err: any) {
        next(err);
      }
    }
  );

  app.patch(
    '/api/users/:id/status',
    requireAuth(),
    requirePermission(PERMISSIONS.USERS_UPDATE),
    requireTenantAccess(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const targetOrgId = await resolveAuthorizedTenant(req, auditRepo, 'USER');

        const existing = await userRepo.findById(id, targetOrgId);
        if (!existing) {
          return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found in organization.' } });
        }

        let targetIsActive: boolean;
        if (typeof req.body.isActive === 'boolean') {
          targetIsActive = req.body.isActive;
        } else if (typeof req.body.status === 'string') {
          targetIsActive = req.body.status.toLowerCase() === 'active';
        } else {
          return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'isActive (boolean) or status (string) is required.' } });
        }

        if (!targetIsActive && (existing.role === 'admin' || existing.role === 'super_admin')) {
          const activeAdmins = await userRepo.countActiveAdmins(targetOrgId);
          if (activeAdmins <= 1) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'OWNER_PROTECTION_VIOLATION',
                message: 'Cannot deactivate the organization owner or last active administrator.',
              },
            });
          }
          if (req.auth!.userId === existing.id) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'SELF_DEACTIVATION_FORBIDDEN',
                message: 'Administrators cannot deactivate their own account.',
              },
            });
          }
        }

        const updated = await userRepo.updateUser(id, targetOrgId, { is_active: targetIsActive });
        if (!updated) {
          return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
        }

        if (!targetIsActive) {
          try {
            await userRepo.revokeToken(`rev_user_${id}_${Date.now()}`, id, new Date(Date.now() + 86400000 * 30), 'User suspended');
          } catch (tokErr) {
            console.warn('[Auth] Failed to revoke user token on suspension:', tokErr);
          }
        }

        await auditRepo.recordEvent({
          organization_id: targetOrgId,
          actor_id: req.auth!.userId,
          actor_name: (req.auth as any)?.name || req.auth!.email || req.auth!.userId,
          actor_role: req.auth!.role,
          action: targetIsActive ? 'USER_REACTIVATED' : 'USER_SUSPENDED',
          entity_type: 'USER',
          entity_id: updated.id,
          before_state: { is_active: existing.is_active },
          after_state: { is_active: updated.is_active },
          metadata: {
            targetEmail: updated.email,
            targetName: updated.name,
            reason: req.body.reason || (targetIsActive ? 'Staff reactivated' : 'Staff suspended'),
          },
          severity: targetIsActive ? 'Medium' : 'High',
          result: 'SUCCESS',
        });

        res.json({
          success: true,
          data: {
            id: updated.id,
            organizationId: updated.organization_id,
            email: updated.email,
            name: updated.name,
            role: updated.role,
            locationId: updated.location_id,
            isActive: updated.is_active,
            updatedAt: updated.updated_at,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.put(
    '/api/users/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.USERS_UPDATE),
    requireTenantAccess(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const targetOrgId = await resolveAuthorizedTenant(req, auditRepo, 'USER');
        const isSuperAdmin = req.auth!.role === 'super_admin';

        const existing = await userRepo.findById(id, targetOrgId);
        if (!existing) {
          return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found in organization.' } });
        }

        const { name, role, locationId } = req.body;
        const targetRole = role || existing.role;

        const tenantAssignableRoles = ['admin', 'manager', 'cashier', 'inventory_manager', 'purchasing_manager', 'sales_user', 'viewer'];
        if (!tenantAssignableRoles.includes(targetRole) && !(isSuperAdmin && targetRole === 'admin')) {
          return res.status(403).json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'The requested role is not assignable as a tenant user.' } });
        }
        if (targetRole === 'admin' && existing.role !== 'admin' && !isSuperAdmin) {
          return res.status(403).json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Only super_admin can assign the admin role.' } });
        }

        if (existing.role === 'admin' && targetRole !== 'admin') {
          const activeAdmins = await userRepo.countActiveAdmins(targetOrgId);
          if (activeAdmins <= 1) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'OWNER_PROTECTION_VIOLATION',
                message: 'Cannot demote the organization owner or last active administrator.',
              },
            });
          }
        }

        const updated = await userRepo.updateUser(id, targetOrgId, {
          name: typeof name === 'string' && name.trim() ? name.trim() : existing.name,
          role: targetRole,
          location_id: locationId !== undefined ? (locationId || null) : existing.location_id,
        });

        if (!updated) {
          return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
        }

        const roleChanged = existing.role !== updated.role;

        await auditRepo.recordEvent({
          organization_id: targetOrgId,
          actor_id: req.auth!.userId,
          actor_name: (req.auth as any)?.name || req.auth!.email || req.auth!.userId,
          actor_role: req.auth!.role,
          action: roleChanged ? 'USER_ROLE_CHANGED' : 'USER_UPDATED',
          entity_type: 'USER',
          entity_id: updated.id,
          before_state: { name: existing.name, role: existing.role, location_id: existing.location_id },
          after_state: { name: updated.name, role: updated.role, location_id: updated.location_id },
          metadata: {
            targetEmail: updated.email,
            previousRole: existing.role,
            newRole: updated.role,
          },
          severity: roleChanged ? 'High' : 'Low',
          result: 'SUCCESS',
        });

        res.json({
          success: true,
          data: {
            id: updated.id,
            organizationId: updated.organization_id,
            email: updated.email,
            name: updated.name,
            role: updated.role,
            locationId: updated.location_id,
            isActive: updated.is_active,
            updatedAt: updated.updated_at,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.delete(
    '/api/users/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.USERS_DELETE),
    requireTenantAccess(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const targetOrgId = await resolveAuthorizedTenant(req, auditRepo, 'USER');

        const existing = await userRepo.findById(id, targetOrgId);
        if (!existing) {
          return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found in organization.' } });
        }

        if (req.auth!.userId === existing.id) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'SELF_DELETION_FORBIDDEN',
              message: 'Users cannot delete their own account.',
            },
          });
        }

        if (existing.role === 'admin' || existing.role === 'super_admin') {
          const activeAdmins = await userRepo.countActiveAdmins(targetOrgId);
          if (activeAdmins <= 1) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'OWNER_PROTECTION_VIOLATION',
                message: 'Cannot delete the organization owner or last active administrator.',
              },
            });
          }
        }

        try {
          await userRepo.revokeToken(`rev_del_${id}_${Date.now()}`, id, new Date(Date.now() + 86400000 * 30), 'User deleted');
        } catch (tokErr) {
          console.warn('[Auth] Failed to revoke user token on deletion:', tokErr);
        }

        const deleted = await userRepo.deleteUser(id, targetOrgId);
        if (!deleted) {
          return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
        }

        await auditRepo.recordEvent({
          organization_id: targetOrgId,
          actor_id: req.auth!.userId,
          actor_name: (req.auth as any)?.name || req.auth!.email || req.auth!.userId,
          actor_role: req.auth!.role,
          action: 'USER_DELETED',
          entity_type: 'USER',
          entity_id: id,
          before_state: {
            email: existing.email,
            name: existing.name,
            role: existing.role,
            location_id: existing.location_id,
          },
          metadata: {
            deletedUserEmail: existing.email,
            deletedUserRole: existing.role,
          },
          severity: 'High',
          result: 'SUCCESS',
        });

        res.json({
          success: true,
          message: 'User successfully deleted.',
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Role Permissions Matrix
  app.get('/api/roles/permissions', requireAuth(), (req: Request, res: Response) => {
    res.json({ success: true, data: ROLE_PERMISSIONS });
  });

  // Advanced Reports API (Gated by 'reports_advanced' / 'advanced_reports' subscription feature - TASK-5.6.2)
  app.get(
    '/api/reports/advanced',
    requireAuth(),
    requirePermission(PERMISSIONS.REPORTS_VIEW),
    requireTenantAccess(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const orgId = await resolveAuthorizedTenant(req, auditRepo, 'REPORT');
        await subscriptionService.assertFeatureEnabled(orgId, 'reports_advanced');
        res.json({
          success: true,
          data: {
            organizationId: orgId,
            reportType: 'advanced_analytics',
            generatedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Diagnostic Test Error Route (Non-production test harness for error sanitization validation)
  if (process.env.NODE_ENV !== 'production') {
    app.get('/api/test-error-trigger', (req: Request, res: Response, next: NextFunction) => {
      const syntheticCredential = ['CI', 'REDACTION', 'TEST'].join('-');
      const err: any = new Error('Database connection string: postgres://admin:' + syntheticCredential + '@db.internal:5432/abacha');
      err.status = 500;
      next(err);
    });
  }

  // ------------------------------------------------------------------
  // 9. CENTRALIZED API ERROR HANDLER (API-001 / SEC-001)
  // ------------------------------------------------------------------
  app.use('/api', (err: any, req: Request, res: Response, _next: NextFunction) => {
    return apiErrorHandler(err, req, res);
  });

  // ------------------------------------------------------------------
  // 10. VITE MIDDLEWARE SETUP (DEV & PROD FALLBACK)
  // ------------------------------------------------------------------
  if (!options.skipVite) {
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      // Security Hardening (UPG-001): Block public access to source maps
      app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.path.endsWith('.map')) {
          return res.status(404).send('Not Found');
        }
        next();
      });

      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return {
    app,
    db,
    authService,
    dbStatus,
    stores: {
      masterProductsStore,
      masterCategoriesStore,
      masterBrandsStore,
      masterAttributesStore,
      syncAuditLogs,
    },
    repositories: {
      userRepo,
      orderRepo,
      customerRepo,
      inventoryRepo,
      auditRepo,
      subscriptionRepo,
    },
    services: {
      posService,
      orderService,
      subscriptionService,
    },
  };
}

export async function startServer() {
  const PORT = parseInt(process.env.PORT || '3000', 10);

  const { app } = await createApp();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Product Service API] Server running on http://0.0.0.0:${PORT}`);
  });
}

// Auto-start server when executed directly as entrypoint
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') ||
    process.argv[1].endsWith('server.js') ||
    process.argv[1].endsWith('server.cjs'));

if (isMain && process.env.NODE_ENV !== 'test') {
  startServer();
}
