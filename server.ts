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
import { createInventoryRouter } from './server/routes/inventoryRoutes.ts';
import { createPosRouter } from './server/routes/posRoutes.ts';
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
  validateCustomerPayload,
  validateCategoryPayload,
  validateBrandPayload,
  validateAttributePayload,
  validateBody,
} from './server/validation/index.ts';
import { apiErrorHandler, buildApiErrorResponse, ApiError } from './server/utils/errorSanitizer.ts';
import { hashPassword } from './server/auth/password.ts';
import { PERMISSIONS, ROLE_PERMISSIONS, VALID_ROLES } from './server/auth/roles.ts';

export interface CreateAppOptions {
  db?: DatabaseClient;
  authService?: AuthService;
  skipVite?: boolean;
  initialProducts?: Product[];
}

export async function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

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

  // Request Header Metadata
  app.use('/api', (req, res, next) => {
    res.setHeader('X-Product-Service-Version', 'v2.4-Enterprise');
    res.setHeader('X-Catalog-Source-Of-Truth', 'Active');
    next();
  });

  // ------------------------------------------------------------------
  // 1. AUTHENTICATION & IDENTITY ENDPOINTS (SEC-001)
  // ------------------------------------------------------------------
  app.post(
    '/api/auth/login',
    authRateLimiter,
    validateBody(validateLoginPayload),
    async (req: Request, res: Response) => {
      try {
        const result = await authService.login(req.body);
        return res.json({
          success: true,
          data: result,
        });
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('ORGANIZATION_REQUIRED')) {
          return res.status(422).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'organizationId is required and must be a non-empty string',
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
        version: '2.4.0',
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
      version: '2.4.0',
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

  // Authoritative Audit Logs Query Endpoint
  app.get(
    '/api/audit-logs',
    requireAuth(),
    requirePermission(PERMISSIONS.AUDIT_VIEW),
    requireTenantAccess(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const isSuperAdmin = req.auth!.role === 'super_admin';
        const orgId = isSuperAdmin && req.query.orgId ? (req.query.orgId as string) : req.auth!.organizationId;

        const dbEvents = await auditRepo.listRecentEvents({ orgId, limit: 50 });
        res.json({
          success: true,
          count: dbEvents.length,
          data: dbEvents,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ------------------------------------------------------------------
  // 4. MASTER PRODUCTS CRUD API (TENANT-ISOLATED & PERMISSION-PROTECTED)
  // ------------------------------------------------------------------

  // GET /api/products - List products with tenant isolation
  app.get('/api/products', (req: Request, res: Response) => {
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

  // Inventory Management API (INV-001: Balances, Movements, Reservations, Transfers, Stock Counts)
  app.use('/api/inventory', createInventoryRouter(db, inventoryRepo));
  app.use('/api/pos', createPosRouter(db, posService));
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

        // Privilege escalation guard: ordinary admins/managers cannot assign super_admin role
        if (role === 'super_admin' && !isSuperAdmin) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'PERMISSION_DENIED',
              message: 'Only super_admin can assign the super_admin role.',
            },
          });
        }

        // Server-authoritative tenant assignment via Model B
        const targetOrgId = await resolveAuthorizedTenant(req, auditRepo, 'USER');

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

  // Role Permissions Matrix
  app.get('/api/roles/permissions', requireAuth(), (req: Request, res: Response) => {
    res.json({ success: true, data: ROLE_PERMISSIONS });
  });

  // Diagnostic Test Error Route (Non-production test harness for error sanitization validation)
  if (process.env.NODE_ENV !== 'production') {
    app.get('/api/test-error-trigger', (req: Request, res: Response, next: NextFunction) => {
      const err: any = new Error('Database connection string: postgres://admin:SuperSecretSecretPassword@db.internal:5432/abacha');
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
    },
  };
}

export async function startServer() {
  const PORT = 3000;

  // In cloud sandbox containers without external PostgreSQL configured, enable embedded persistent PostgreSQL engine
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    console.warn('[AbaCha DB] No external DATABASE_URL or PGHOST detected in container environment. Booting persistent embedded PostgreSQL engine (.data/postgres).');
    process.env.ALLOW_EMBEDDED_POSTGRES = 'true';
  }

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
