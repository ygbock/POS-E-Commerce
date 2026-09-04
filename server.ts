import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { INITIAL_PRODUCTS, INITIAL_CATEGORIES, INITIAL_BRANDS } from './src/data/initialData.ts';
import { Product, ProductVariant, CatalogAttribute } from './src/types/index.ts';
import { getDatabaseClient } from './server/db/client.ts';
import { runMigrations, getAppliedMigrations } from './server/db/migrator.ts';
import { AuthService } from './server/services/authService.ts';
import {
  createAuthenticateMiddleware,
  requireAuth,
  requirePermission,
  requireTenantAccess,
} from './server/middleware/auth.ts';
import { authRateLimiter, adminRateLimiter } from './server/middleware/rateLimiter.ts';
import {
  validateLoginPayload,
  validateProductPayload,
  validateBody,
  sanitizeClientBody,
} from './server/validation/index.ts';
import { PERMISSIONS } from './server/auth/roles.ts';

// Master Data Store (In-Memory Single Source of Truth for Product Service API)
let masterProductsStore: Product[] = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
let masterCategoriesStore = JSON.parse(JSON.stringify(INITIAL_CATEGORIES));
let masterBrandsStore = JSON.parse(JSON.stringify(INITIAL_BRANDS));

let masterAttributesStore: CatalogAttribute[] = [
  {
    id: 'attr-color',
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
    name: 'Pack Weight',
    code: 'weight',
    type: 'select',
    options: ['250g', '500g', '1kg Whole Bean', '2.5kg Bulk Bag'],
    required: false,
    description: 'Gourmet consumables packaging weight',
    usageCount: 15,
  },
];

let syncAuditLogs: Array<{
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
  },
];

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Initialize Database Persistence Layer
  const dbStatus = {
    connected: false,
    engine: 'unknown',
    version: 'none',
    migrationsApplied: [] as string[],
    error: null as string | null,
  };

  let authService: AuthService;

  try {
    const db = getDatabaseClient();
    authService = new AuthService(db);
    const ping = await db.query('SELECT 1 as val');
    if (ping.rows.length > 0) {
      dbStatus.connected = true;
      dbStatus.engine = db.isEmbedded() ? 'embedded-pglite' : 'postgresql';
      // Execute schema migrations ONLY. Demo seeds are never auto-executed on server startup.
      await runMigrations(db);
      const applied = await getAppliedMigrations(db);
      dbStatus.migrationsApplied = Array.from(applied);
      dbStatus.version = Array.from(applied).pop() || '000';
      // Seed default system users for role-based authentication (SEC-001)
      await authService.seedDefaultUsers();
      console.log(`[Omnicore DB] Connected (${dbStatus.engine}). Active schema migrations: ${Array.from(applied).join(', ')}`);
    }
  } catch (dbErr: any) {
    dbStatus.error = dbErr.message || 'Database initialization error';
    authService = new AuthService();
    if (isProd) {
      console.error('[Omnicore DB Fatal] Production PostgreSQL startup failed:', dbStatus.error);
      throw new Error(`[Omnicore DB Fatal] Production PostgreSQL startup failed: ${dbStatus.error}`);
    } else {
      console.warn('[Omnicore DB] Non-production running in degraded persistence mode:', dbStatus.error);
    }
  }

  app.use(express.json({ limit: '10mb' }));

  // Central Cryptographic Authentication Extraction (SEC-001)
  app.use('/api', createAuthenticateMiddleware(authService));

  // Request Logging Middleware for API Health Audit
  app.use('/api', (req, res, next) => {
    res.setHeader('X-Product-Service-Version', 'v2.4-Enterprise');
    res.setHeader('X-Catalog-Source-Of-Truth', 'Active');
    next();
  });

  // ------------------------------------------------------------------
  // AUTHENTICATION & IDENTITY ENDPOINTS (SEC-001)
  // ------------------------------------------------------------------
  app.post('/api/auth/login', authRateLimiter, validateBody(validateLoginPayload), async (req: Request, res: Response) => {
    try {
      const result = await authService.login(req.body);
      res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: err.message || 'Authentication failed',
        },
      });
    }
  });

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
  // 1. HEALTH & SYNC STATUS ENDPOINTS
  // ------------------------------------------------------------------
  app.get('/api/health', (req: Request, res: Response) => {
    // In production, an instance cannot appear healthy if its required PostgreSQL database is unavailable
    if (isProd && !dbStatus.connected) {
      return res.status(503).json({
        status: 'unhealthy',
        ready: false,
        service: 'Centralized Product Service',
        version: '2.4.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: {
          connected: false,
          engine: dbStatus.engine,
          error: dbStatus.error || 'Production PostgreSQL unavailable',
        },
      });
    }

    res.json({
      status: dbStatus.connected ? 'ok' : 'degraded',
      ready: dbStatus.connected,
      service: 'Centralized Product Service',
      version: '2.4.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: {
        connected: dbStatus.connected,
        engine: dbStatus.engine,
        schemaVersion: dbStatus.version,
        migrationsCount: dbStatus.migrationsApplied.length,
      },
    });
  });

  // Minimal readiness probe endpoint
  app.get('/api/ready', (req: Request, res: Response) => {
    if (!dbStatus.connected) {
      return res.status(503).json({
        ready: false,
        status: 'unready',
        error: dbStatus.error || 'Database unavailable',
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
  app.get(
    '/api/admin/db-status',
    adminRateLimiter,
    requireAuth(),
    requirePermission(PERMISSIONS.ADMIN_DIAGNOSTICS),
    (req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          connected: dbStatus.connected,
          engine: dbStatus.engine,
          schemaVersion: dbStatus.version,
          migrationsApplied: dbStatus.migrationsApplied,
          error: dbStatus.error,
          caller: {
            userId: req.auth?.userId,
            role: req.auth?.role,
            organizationId: req.auth?.organizationId,
          },
        },
      });
    }
  );

  app.get('/api/catalog/sync-status', (req: Request, res: Response) => {
    const totalVariants = masterProductsStore.reduce((sum, p) => sum + (p.variants?.length || 0), 0);
    res.json({
      success: true,
      serviceName: 'Master Product Service API',
      isSingleSourceOfTruth: true,
      catalogMetrics: {
        totalProducts: masterProductsStore.length,
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
      recentAuditLogs: syncAuditLogs.slice(-10),
    });
  });

  app.post(
    '/api/catalog/sync',
    adminRateLimiter,
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_UPDATE),
    requireTenantAccess(),
    (req: Request, res: Response) => {
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
  // 2. MASTER PRODUCTS CRUD API
  // ------------------------------------------------------------------

  // GET /api/products - List products with filters & pagination
  app.get('/api/products', (req: Request, res: Response) => {
    const { category, brand, search, channel, status, page = '1', limit = '100' } = req.query;

    let result = [...masterProductsStore];

    if (category && category !== 'All') {
      result = result.filter(p => p.category.toLowerCase() === (category as string).toLowerCase());
    }

    if (brand && brand !== 'All') {
      result = result.filter(p => p.brand.toLowerCase() === (brand as string).toLowerCase());
    }

    if (status && status !== 'All') {
      result = result.filter(p => p.status === status);
    }

    if (channel && channel !== 'All') {
      if (channel === 'pos') result = result.filter(p => p.channels?.pos);
      if (channel === 'ecommerce') result = result.filter(p => p.channels?.ecommerce);
      if (channel === 'wholesale') result = result.filter(p => p.channels?.wholesale);
    }

    if (search) {
      const q = (search as string).toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.variants.some(v => v.sku.toLowerCase().includes(q) || v.barcode.toLowerCase().includes(q))
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

  // GET /api/products/:id - Single product view by ID or slug
  app.get('/api/products/:id', (req: Request, res: Response) => {
    const product = masterProductsStore.find(p => p.id === req.params.id || p.slug === req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found in master catalog' });
    }
    res.json({ success: true, data: product });
  });

  // POST /api/products - Create new product
  app.post(
    '/api/products',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_CREATE),
    requireTenantAccess(),
    validateBody(validateProductPayload),
    (req: Request, res: Response) => {
      const body = req.body;
      if (!body.name) {
        return res.status(400).json({ success: false, error: 'Product name is required' });
      }

      const id = body.id || `prod-${Date.now().toString().slice(-6)}`;
      const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      const newProduct: Product = {
        id,
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
        variants: body.variants && body.variants.length > 0 ? body.variants : [
          {
            id: `var-${id}-default`,
            sku: body.sku || `SKU-${id.toUpperCase()}`,
            barcode: body.barcode || `8809${Math.floor(10000000 + Math.random() * 90000000)}`,
            name: 'Default Variant',
            attributes: { Standard: 'Default' },
            costPrice: body.costPrice || 50,
            retailPrice: body.retailPrice || 100,
            wholesalePrice: body.wholesalePrice || 80,
            memberPrice: body.memberPrice || 90,
            minSellingPrice: body.minSellingPrice || 70,
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
    }
  );

  // PUT /api/products/:id - Update product
  app.put(
    '/api/products/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_UPDATE),
    requireTenantAccess(),
    validateBody((b: any) => validateProductPayload(b, true)),
    (req: Request, res: Response) => {
      const index = masterProductsStore.findIndex(p => p.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ success: false, error: 'Product not found in master catalog' });
      }

      const existing = masterProductsStore[index];
      const updated: Product = {
        ...existing,
        ...req.body,
        id: existing.id, // Immutable ID
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
    }
  );

  // DELETE /api/products/:id - Delete product
  app.delete(
    '/api/products/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_DELETE),
    requireTenantAccess(),
    (req: Request, res: Response) => {
      const index = masterProductsStore.findIndex(p => p.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ success: false, error: 'Product not found' });
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
    }
  );

  // ------------------------------------------------------------------
  // 3. VARIANTS & SKU MANAGEMENT CRUD API
  // ------------------------------------------------------------------

  // GET /api/products/:productId/variants - Get variants for product
  app.get('/api/products/:productId/variants', (req: Request, res: Response) => {
    const product = masterProductsStore.find(p => p.id === req.params.productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: product.variants });
  });

  // POST /api/products/:productId/variants - Add new variant
  app.post(
    '/api/products/:productId/variants',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_CREATE),
    requireTenantAccess(),
    (req: Request, res: Response) => {
      const product = masterProductsStore.find(p => p.id === req.params.productId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      const body = sanitizeClientBody(req.body);
      const variantId = (body as any).id || `var-${Date.now().toString().slice(-6)}`;
      const newVariant: ProductVariant = {
        id: variantId,
        sku: (body as any).sku || `SKU-${product.brand.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
        barcode: (body as any).barcode || `8809${Math.floor(10000000 + Math.random() * 90000000)}`,
        name: (body as any).name || 'New Variant',
        attributes: (body as any).attributes || {},
        costPrice: Number((body as any).costPrice) || 50,
        retailPrice: Number((body as any).retailPrice) || 100,
        wholesalePrice: Number((body as any).wholesalePrice) || 80,
        memberPrice: Number((body as any).memberPrice) || 90,
        minSellingPrice: Number((body as any).minSellingPrice) || 70,
        stockByLocation: (body as any).stockByLocation || { 'loc-main-wh': 20, 'loc-store-downtown': 10 },
        lowStockThreshold: Number((body as any).lowStockThreshold) || 5,
        image: (body as any).image,
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

  // PUT /api/products/:productId/variants/:variantId - Update variant
  app.put(
    '/api/products/:productId/variants/:variantId',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_UPDATE),
    requireTenantAccess(),
    (req: Request, res: Response) => {
      const product = masterProductsStore.find(p => p.id === req.params.productId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      const varIndex = product.variants.findIndex(v => v.id === req.params.variantId);
      if (varIndex === -1) {
        return res.status(404).json({ success: false, error: 'Variant not found' });
      }

      const existing = product.variants[varIndex];
      const sanitizedBody = sanitizeClientBody(req.body);
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

  // DELETE /api/products/:productId/variants/:variantId - Delete variant
  app.delete(
    '/api/products/:productId/variants/:variantId',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_DELETE),
    requireTenantAccess(),
    (req: Request, res: Response) => {
      const product = masterProductsStore.find(p => p.id === req.params.productId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      if (product.variants.length <= 1) {
        return res.status(400).json({ success: false, error: 'Cannot delete the only variant of a master product' });
      }

      const varIndex = product.variants.findIndex(v => v.id === req.params.variantId);
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

  // GET /api/skus/lookup/:sku - Unified SKU / Barcode scanner lookup
  app.get('/api/skus/lookup/:sku', (req: Request, res: Response) => {
    const query = req.params.sku.toLowerCase().trim();

    for (const prod of masterProductsStore) {
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
  // 4. CATALOG ATTRIBUTES CRUD API
  // ------------------------------------------------------------------

  // GET /api/attributes - List catalog attributes
  app.get('/api/attributes', (req: Request, res: Response) => {
    res.json({ success: true, count: masterAttributesStore.length, data: masterAttributesStore });
  });

  // POST /api/attributes - Create new attribute
  app.post(
    '/api/attributes',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_CREATE),
    requireTenantAccess(),
    (req: Request, res: Response) => {
      const sanitizedBody = sanitizeClientBody(req.body);
      if (!(sanitizedBody as any).name) {
        return res.status(400).json({ success: false, error: 'Attribute name is required' });
      }

      const id = (sanitizedBody as any).id || `attr-${Date.now().toString().slice(-6)}`;
      const newAttr: CatalogAttribute = {
        id,
        name: (sanitizedBody as any).name,
        code: (sanitizedBody as any).code || (sanitizedBody as any).name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        type: (sanitizedBody as any).type || 'select',
        options: (sanitizedBody as any).options || [],
        required: (sanitizedBody as any).required || false,
        description: (sanitizedBody as any).description || '',
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

  // PUT /api/attributes/:id - Update attribute options
  app.put(
    '/api/attributes/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_UPDATE),
    requireTenantAccess(),
    (req: Request, res: Response) => {
      const index = masterAttributesStore.findIndex(a => a.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ success: false, error: 'Attribute not found' });
      }

      const sanitizedBody = sanitizeClientBody(req.body);
      const updated = { ...masterAttributesStore[index], ...sanitizedBody, id: masterAttributesStore[index].id };
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

  // DELETE /api/attributes/:id - Remove attribute
  app.delete(
    '/api/attributes/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.PRODUCTS_DELETE),
    requireTenantAccess(),
    (req: Request, res: Response) => {
      const index = masterAttributesStore.findIndex(a => a.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ success: false, error: 'Attribute not found' });
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
  // 5. MASTER CATEGORIES & BRANDS METADATA ENDPOINTS
  // ------------------------------------------------------------------
  app.get('/api/categories', (req: Request, res: Response) => {
    res.json({ success: true, data: masterCategoriesStore });
  });

  app.get('/api/brands', (req: Request, res: Response) => {
    res.json({ success: true, data: masterBrandsStore });
  });

  // ------------------------------------------------------------------
  // 6. VITE MIDDLEWARE SETUP (DEV & PROD FALLBACK)
  // ------------------------------------------------------------------
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Product Service API] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
