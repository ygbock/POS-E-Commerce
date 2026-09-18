import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseClient } from '../db/client';
import { resolveStorefrontTenant, TenantStorefrontConfig } from '../services/tenantResolver';
import { ApiError } from '../utils/errorSanitizer';
import { StorefrontCartService, StorefrontCartValidationError } from '../services/storefrontCartService';
import { OrderService } from '../services/orderService';
import { SubscriptionService } from '../services/subscriptionService';
import { PERMISSIONS } from '../auth/roles';
import { requireAuth, requirePermission, requireTenantAccess } from '../middleware/auth';

export function createStorefrontRouter(db: DatabaseClient, orderService?: OrderService, subscriptionService?: SubscriptionService): Router {
  const orders = orderService || new OrderService(undefined, undefined, undefined, undefined, db);
  const router = Router();

  // Helper for error handling in storefront routes
  const handleStorefrontError = (res: Response, err: any) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      });
    }
    const code = err?.code || 'INTERNAL_ERROR';
    const domainClientCodes = new Set([
      'VALIDATION_ERROR',
      'ORDER_NOT_FOUND',
      'ORDER_ITEMS_NOT_FOUND',
      'ORDER_ITEM_NOT_FOUND',
      'PRODUCT_NOT_FOUND',
      'PAYMENT_NOT_FOUND',
      'PAYMENT_REQUIRED',
      'PAYMENT_AMOUNT_MISMATCH',
      'INVALID_ORDER_STATE',
      'INVALID_PAYMENT_STATE',
      'NOTHING_TO_RETURN',
      'RETURN_QUANTITY_EXCEEDED',
      'REFUND_AMOUNT_EXCEEDED',
      'ALREADY_REFUNDED',
    ]);
    const status = err?.status || (
      domainClientCodes.has(code)
        ? (code.endsWith('_NOT_FOUND') || code === 'ORDER_NOT_FOUND' || code === 'PRODUCT_NOT_FOUND' ? 404
          : code === 'RETURN_QUANTITY_EXCEEDED' || code === 'REFUND_AMOUNT_EXCEEDED' ? 422
          : code === 'INVALID_ORDER_STATE' || code === 'INVALID_PAYMENT_STATE' || code === 'ALREADY_REFUNDED' ? 409
          : 400)
        : 500
    );
    const message = err?.message || 'An unexpected error occurred.';
    return res.status(status).json({
      success: false,
      error: { code, message },
    });
  };

  // --------------------------------------------------------------------------
  // 1. PUBLIC STOREFRONT CONTEXT ENDPOINT
  // --------------------------------------------------------------------------

  // GET /api/storefront/context (Resolves via Host header, query, or canonical default)
  router.get('/context', async (req: Request, res: Response) => {
    try {
      const config = await resolveStorefrontTenant(req, db);
      res.json({ success: true, data: config });
    } catch (err) {
      handleStorefrontError(res, err);
    }
  });

  // GET /api/storefront/:tenantSlug/context
  router.get('/:tenantSlug/context', async (req: Request, res: Response) => {
    try {
      const config = await resolveStorefrontTenant(req, db, {
        explicitSlug: req.params.tenantSlug,
      });
      res.json({ success: true, data: config });
    } catch (err) {
      handleStorefrontError(res, err);
    }
  });

  // --------------------------------------------------------------------------
  // 2. TENANT-SCOPED CATEGORIES & BRANDS
  // --------------------------------------------------------------------------

  // GET /api/storefront/:tenantSlug/categories
  router.get('/:tenantSlug/categories', async (req: Request, res: Response) => {
    try {
      const config = await resolveStorefrontTenant(req, db, {
        explicitSlug: req.params.tenantSlug,
      });
      const orgId = config.tenant.id;

      const result = await db.query(
        `SELECT id, organization_id, name, slug, description, icon_name, accent_color, display_order
         FROM categories
         WHERE organization_id = $1
         ORDER BY display_order ASC, name ASC`,
        [orgId]
      );

      res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (err) {
      handleStorefrontError(res, err);
    }
  });

  // GET /api/storefront/:tenantSlug/brands
  router.get('/:tenantSlug/brands', async (req: Request, res: Response) => {
    try {
      const config = await resolveStorefrontTenant(req, db, {
        explicitSlug: req.params.tenantSlug,
      });
      const orgId = config.tenant.id;

      const result = await db.query(
        `SELECT id, organization_id, name, slug, logo_url, country_of_origin, website, description
         FROM brands
         WHERE organization_id = $1 AND is_active = true
         ORDER BY name ASC`,
        [orgId]
      );

      res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (err) {
      handleStorefrontError(res, err);
    }
  });

  // GET /api/storefront/:tenantSlug/locations
  router.get('/:tenantSlug/locations', async (req: Request, res: Response) => {
    try {
      const config = await resolveStorefrontTenant(req, db, {
        explicitSlug: req.params.tenantSlug,
      });
      res.json({
        success: true,
        count: config.pickupLocations.length,
        data: config.pickupLocations,
      });
    } catch (err) {
      handleStorefrontError(res, err);
    }
  });

  // --------------------------------------------------------------------------
  // 3. TENANT-SCOPED CATALOG PRODUCTS (FACETED & PAGINATED)
  // --------------------------------------------------------------------------

  // GET /api/storefront/:tenantSlug/products
  router.get('/:tenantSlug/products', async (req: Request, res: Response) => {
    try {
      const config = await resolveStorefrontTenant(req, db, {
        explicitSlug: req.params.tenantSlug,
      });
      const orgId = config.tenant.id;

      const {
        category,
        brand,
        search,
        minPrice,
        maxPrice,
        inStock,
        onSale,
        sortBy = 'featured',
        page = '1',
        limit = '24',
      } = req.query;

      const conditions: string[] = ['p.organization_id = $1', "p.status = 'active'", 'p.channels_ecommerce = true', '(b.id IS NULL OR b.is_active = true)'];
      const params: any[] = [orgId];

      if (category && category !== 'All') {
        params.push(category);
        conditions.push(
          `(c.slug = $${params.length} OR c.id = $${params.length} OR p.category_id = $${params.length})`
        );
      }

      if (brand && brand !== 'All') {
        params.push(brand);
        conditions.push(
          `(b.slug = $${params.length} OR b.id = $${params.length} OR p.brand_id = $${params.length})`
        );
      }

      if (search && typeof search === 'string' && search.trim()) {
        params.push(`%${search.trim().toLowerCase()}%`);
        conditions.push(
          `(LOWER(p.name) LIKE $${params.length} OR LOWER(p.slug) LIKE $${params.length} OR LOWER(p.description) LIKE $${params.length})`
        );
      }

      if (minPrice && !isNaN(Number(minPrice))) {
        params.push(Number(minPrice));
        conditions.push(
          `EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.retail_price >= $${params.length})`
        );
      }

      if (maxPrice && !isNaN(Number(maxPrice))) {
        params.push(Number(maxPrice));
        conditions.push(
          `EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.retail_price <= $${params.length})`
        );
      }

      if (inStock === 'true') {
        conditions.push(`EXISTS (
          SELECT 1 FROM inventory_balances ib
          JOIN product_variants pv ON ib.variant_id = pv.id
          WHERE pv.product_id = p.id AND ib.organization_id = p.organization_id
            AND (ib.on_hand - ib.reserved - ib.damaged - ib.expired) > 0
        )`);
      }

      if (onSale === 'true') {
        conditions.push(`(p.compare_at_price IS NOT NULL AND p.compare_at_price > (
          SELECT MIN(pv.retail_price) FROM product_variants pv WHERE pv.product_id = p.id
        ))`);
      }

      let orderByClause = 'p.featured DESC, p.created_at DESC';
      if (sortBy === 'price-low') {
        orderByClause = '(SELECT MIN(pv.retail_price) FROM product_variants pv WHERE pv.product_id = p.id) ASC';
      } else if (sortBy === 'price-high') {
        orderByClause = '(SELECT MIN(pv.retail_price) FROM product_variants pv WHERE pv.product_id = p.id) DESC';
      } else if (sortBy === 'rating') {
        orderByClause = 'p.rating DESC NULLS LAST';
      } else if (sortBy === 'best-sellers') {
        orderByClause = 'p.sales_count DESC NULLS LAST';
      } else if (sortBy === 'newest') {
        orderByClause = 'p.created_at DESC';
      }

      const countSql = `
        SELECT COUNT(DISTINCT p.id) as total
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE ${conditions.join(' AND ')}
      `;
      const countRes = await db.query<{ total: string | number }>(countSql, params);
      const total = Number(countRes.rows[0]?.total || 0);

      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 24));
      const offset = (pageNum - 1) * limitNum;

      params.push(limitNum, offset);
      const dataSql = `
        SELECT 
          p.id, p.organization_id, p.category_id, p.brand_id, p.name, p.slug, p.description,
          p.short_description, p.unit_code, p.product_type, p.status, p.tax_rate, p.rating,
          p.review_count, p.tags, p.images, p.featured, p.compare_at_price, p.sales_count,
          c.name as category_name, c.slug as category_slug,
          b.name as brand_name, b.slug as brand_slug,
          (
            SELECT json_agg(json_build_object(
              'id', pv.id,
              'sku', pv.sku,
              'barcode', pv.barcode,
              'name', pv.name,
              'attributes', pv.attributes,
              'retailPrice', pv.retail_price::text,
              'compareAtPrice', p.compare_at_price::text,
              'imageUrl', pv.image_url,
              'availableStock', COALESCE((
                SELECT SUM(ib.on_hand - ib.reserved - ib.damaged - ib.expired)
                FROM inventory_balances ib
                WHERE ib.variant_id = pv.id AND ib.organization_id = p.organization_id
              ), 0)
            ) ORDER BY pv.retail_price ASC)
            FROM product_variants pv
            WHERE pv.product_id = p.id AND pv.organization_id = p.organization_id
          ) as variants
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${orderByClause}
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;

      const dataRes = await db.query<any>(dataSql, params);
      const products = dataRes.rows.map((row: any) => {
        const variants = Array.isArray(row.variants) ? row.variants : [];
        const primaryVariant = variants[0] || null;
        const totalStock = variants.reduce(
          (sum: number, v: any) => sum + Math.max(0, Number(v.availableStock || 0)),
          0
        );

        return {
          id: row.id,
          organization_id: row.organization_id,
          name: row.name,
          slug: row.slug,
          description: row.description,
          category: row.category_name || 'Uncategorized',
          categorySlug: row.category_slug || '',
          brand: row.brand_name || 'Generic',
          brandSlug: row.brand_slug || '',
          rating: Number(row.rating || 0),
          reviewCount: Number(row.review_count || 0),
          tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []),
          images: typeof row.images === 'string' ? JSON.parse(row.images) : (row.images || []),
          featured: Boolean(row.featured),
          compareAtPrice: row.compare_at_price ? Number(row.compare_at_price) : null,
          salesCount: Number(row.sales_count || 0),
          variants,
          primaryVariant,
          availableStock: totalStock,
          isOutOfStock: totalStock <= 0,
        };
      });

      res.json({
        success: true,
        count: products.length,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        pagination: {
          page: pageNum,
          pageSize: limitNum,
          totalCount: total,
          totalPages: Math.ceil(total / limitNum),
          hasMore: pageNum * limitNum < total,
        },
        data: products,
      });
    } catch (err) {
      handleStorefrontError(res, err);
    }
  });

  // GET /api/storefront/:tenantSlug/products/:slugOrId
  router.get('/:tenantSlug/products/:slugOrId', async (req: Request, res: Response) => {
    try {
      const config = await resolveStorefrontTenant(req, db, {
        explicitSlug: req.params.tenantSlug,
      });
      const orgId = config.tenant.id;
      const { slugOrId } = req.params;

      const prodRes = await db.query<any>(
        `SELECT 
          p.*,
          c.name as category_name, c.slug as category_slug,
          b.name as brand_name, b.slug as brand_slug
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN brands b ON p.brand_id = b.id
         WHERE (p.slug = $1 OR p.id = $1) AND p.organization_id = $2 AND p.status = 'active' AND p.channels_ecommerce = true AND (b.id IS NULL OR b.is_active = true)`,
        [slugOrId, orgId]
      );

      if (prodRes.rows.length === 0) {
        throw new ApiError('PRODUCT_NOT_FOUND', `Product '${slugOrId}' not found.`, 404);
      }

      const product = prodRes.rows[0];

      // Fetch variants with location balances
      const varRes = await db.query<any>(
        `SELECT 
          pv.*,
          COALESCE((
            SELECT json_agg(json_build_object(
              'locationId', loc.id,
              'locationCode', loc.code,
              'locationName', loc.name,
              'available', (ib.on_hand - ib.reserved - ib.damaged - ib.expired)
            ))
            FROM inventory_balances ib
            JOIN locations loc ON ib.location_id = loc.id
            WHERE ib.variant_id = pv.id AND ib.organization_id = pv.organization_id AND loc.is_active = true
          ), '[]'::json) as location_balances
         FROM product_variants pv
         WHERE pv.product_id = $1 AND pv.organization_id = $2
         ORDER BY pv.retail_price ASC`,
        [product.id, orgId]
      );

      const variants = varRes.rows.map((v: any) => {
        const locBalances = Array.isArray(v.location_balances) ? v.location_balances : [];
        const totalStock = locBalances.reduce(
          (sum: number, b: any) => sum + Math.max(0, Number(b.available || 0)),
          0
        );

        return {
          id: v.id,
          sku: v.sku,
          barcode: v.barcode,
          name: v.name,
          attributes: typeof v.attributes === 'string' ? JSON.parse(v.attributes) : (v.attributes || {}),
          retail_price: v.retail_price ? v.retail_price.toString() : '0.00',
          cost_price: v.cost_price ? v.cost_price.toString() : '0.00',
          compareAtPrice: product.compare_at_price ? product.compare_at_price.toString() : null,
          availableStock: totalStock,
          isOutOfStock: totalStock <= 0,
          locationBalances: locBalances,
        };
      });

      const totalProductStock = variants.reduce((sum, v) => sum + v.availableStock, 0);

      res.json({
        success: true,
        data: {
          id: product.id,
          organization_id: product.organization_id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          shortDescription: product.short_description,
          category: product.category_name || 'Uncategorized',
          categorySlug: product.category_slug || '',
          brand: product.brand_name || 'Generic',
          brandSlug: product.brand_slug || '',
          rating: Number(product.rating || 0),
          reviewCount: Number(product.review_count || 0),
          tags: typeof product.tags === 'string' ? JSON.parse(product.tags) : (product.tags || []),
          images: typeof product.images === 'string' ? JSON.parse(product.images) : (product.images || []),
          specifications: typeof product.specifications === 'string' ? JSON.parse(product.specifications) : (product.specifications || []),
          featured: Boolean(product.featured),
          compareAtPrice: product.compare_at_price ? Number(product.compare_at_price) : null,
          variants,
          primaryVariant: variants[0] || null,
          availableStock: totalProductStock,
          isOutOfStock: totalProductStock <= 0,
        },
      });
    } catch (err) {
      handleStorefrontError(res, err);
    }
  });

  // --------------------------------------------------------------------------
  // 4. SERVER-AUTHORITATIVE CART VALIDATION
  // --------------------------------------------------------------------------

  // Cart validation is intentionally a read-only snapshot. Checkout MUST repeat
  // pricing and stock validation inside its own database transaction.
  // POST /api/storefront/:tenantSlug/cart/validate
  router.post('/:tenantSlug/cart/validate', async (req: Request, res: Response) => {
    try {
      const config = await resolveStorefrontTenant(req, db, {
        explicitSlug: req.params.tenantSlug,
      });

      const result = await new StorefrontCartService(db).validate({
        organizationId: config.tenant.id,
        config,
        items: req.body?.items,
        fulfillmentLocationId: req.body?.fulfillmentLocationId,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof StorefrontCartValidationError) {
        return res.status(err.status).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }
      handleStorefrontError(res, err);
    }
  });


  // --------------------------------------------------------------------------
  // 5. PUBLIC STOREFRONT ORDER CREATION
  // --------------------------------------------------------------------------

  // Public checkout resolves the tenant from either the canonical URL slug or
  // the request host. Customer IDs are never accepted from an unauthenticated
  // request. OrderService recalculates price, tax, shipping and stock atomically.
  const placePublicStorefrontOrder = async (req: Request, res: Response, explicitSlug?: string) => {
    try {
      const config = await resolveStorefrontTenant(req, db, explicitSlug ? { explicitSlug } : undefined);

      if (subscriptionService) {
        await subscriptionService.assertFeatureEnabled(config.tenant.id, 'storefront');
        await subscriptionService.assertCanCreateOrder(config.tenant.id, db);
      }

      const customer = req.body?.customer;
      const result = await orders.placeStorefrontOrder({
        organization_id: config.tenant.id,
        actor_name: 'Guest Storefront Customer',
        actor_role: 'storefront_customer',
        idempotency_key: req.body?.idempotency_key,
        customer_id: null,
        customer_details: customer ? {
          name: String(customer.name || '').trim(),
          email: String(customer.email || '').trim(),
          phone: String(customer.phone || '').trim(),
          address: customer.address,
        } : null,
        fulfillment_method: req.body?.fulfillmentMethod,
        payment_method: req.body?.paymentMethod,
        cart_items: Array.isArray(req.body?.cart_items)
          ? req.body.cart_items.map((item: any) => ({
              variant_id: String(item?.variantId || item?.variant_id || ''),
              quantity: String(item?.quantity ?? ''),
            }))
          : req.body?.cart_items,
        discount_code: req.body?.discount_code,
        location_id: req.body?.location_id,
      });
      return res.status(201).json({ success: true, data: { ...result.order, items: result.items, payments: result.payments } });
    } catch (err: any) {
      const code = err?.code;
      const status = code === 'IDEMPOTENCY_CONFLICT' ? 409
        : code === 'PRODUCT_NOT_FOUND' ? 404
        : code === 'VALIDATION_ERROR' || code === 'INSUFFICIENT_STOCK' ? 400
        : code === 'SUBSCRIPTION_LIMIT_REACHED' || code === 'FEATURE_NOT_AVAILABLE' || code === 'SUBSCRIPTION_NOT_FOUND' || code === 'SUBSCRIPTION_INACTIVE' ? 403
        : 500;
      if (status === 500) console.error('[Public Storefront Checkout Error]:', { message: err?.message, stack: err?.stack });
      return res.status(status).json({
        success: false,
        error: {
          code: code || 'INTERNAL_SERVER_ERROR',
          message: status === 500 ? 'Unable to place storefront order. Please try again later.' : (err?.message || 'Unable to place storefront order.'),
        },
      });
    }
  };

  // Host-resolved storefront checkout: POST /api/storefront/orders
  router.post('/orders', (req: Request, res: Response) => placePublicStorefrontOrder(req, res));

  // Canonical tenant-scoped storefront checkout: POST /api/storefront/:tenantSlug/orders
  router.post('/:tenantSlug/orders', (req: Request, res: Response) => placePublicStorefrontOrder(req, res, req.params.tenantSlug));

  // --------------------------------------------------------------------------
  // 6. PUBLIC ORDER TRACKING (CONTACT VERIFIED)
  // --------------------------------------------------------------------------

  const trackPublicOrder = async (req: Request, res: Response, explicitSlug?: string) => {
    try {
      const config = await resolveStorefrontTenant(req, db, explicitSlug ? { explicitSlug } : undefined);
      const contact = String(req.query.contact || '').trim();
      const orderNumber = String(req.params.orderNumber || '').trim();
      if (!orderNumber || !contact) {
        return res.status(404).json({
          success: false,
          error: { code: 'ORDER_VERIFICATION_FAILED', message: 'Order not found or contact verification failed.' },
        });
      }

      const orderRes = await db.query<any>(
        `SELECT o.id, o.order_number, o.status, o.payment_status, o.fulfillment_method,
                o.carrier_name, o.tracking_number, o.created_at,
                o.subtotal, o.shipping_fee, o.tax_amount, o.total_amount,
                c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id
         WHERE o.organization_id = $1
           AND (o.order_number = $2 OR o.id = $2)
         LIMIT 1`,
        [config.tenant.id, orderNumber],
      );
      const order = orderRes.rows[0];
      const normalizedContact = contact.toLowerCase().replace(/\\s+/g, '');
      const normalizedPhone = contact.replace(/[^0-9]/g, '');
      const emailMatches = order?.customer_email
        ? String(order.customer_email).trim().toLowerCase() === normalizedContact
        : false;
      const phoneMatches = order?.customer_phone
        ? String(order.customer_phone).replace(/[^0-9]/g, '') === normalizedPhone
        : false;

      if (!order || (!emailMatches && (!normalizedPhone || !phoneMatches))) {
        return res.status(404).json({
          success: false,
          error: { code: 'ORDER_VERIFICATION_FAILED', message: 'Order not found or contact verification failed.' },
        });
      }

      const itemsRes = await db.query<any>(
        `SELECT oi.product_name AS name, oi.sku, oi.quantity, oi.unit_price, oi.total_amount AS line_total,
                p.images
         FROM order_items oi
         LEFT JOIN product_variants pv ON pv.id = oi.variant_id AND pv.organization_id = $1
         LEFT JOIN products p ON p.id = pv.product_id AND p.organization_id = $1
         WHERE oi.order_id = $2
         ORDER BY oi.created_at ASC, oi.id ASC`,
        [config.tenant.id, order.id],
      );

      const maskEmail = (email: string | null) => {
        if (!email) return '';
        const [local, domain] = email.split('@');
        if (!domain) return '***';
        return `${(local?.[0] || '*')}***@${domain}`;
      };

      const items = itemsRes.rows.map((item: any) => {
        let images: unknown = item.images;
        if (typeof images === 'string') {
          try { images = JSON.parse(images); } catch { images = []; }
        }
        return {
          name: String(item.name || 'Item'),
          sku: item.sku || undefined,
          quantity: String(item.quantity),
          unitPrice: String(item.unit_price),
          lineTotal: String(item.line_total),
          image: Array.isArray(images) && typeof images[0] === 'string' ? images[0] : undefined,
        };
      });

      return res.json({
        success: true,
        data: {
          id: order.id,
          orderNumber: order.order_number,
          status: order.status,
          paymentStatus: order.payment_status,
          fulfillmentMethod: order.fulfillment_method,
          carrierName: order.carrier_name || undefined,
          trackingNumber: order.tracking_number || undefined,
          createdAt: order.created_at,
          items,
          totals: {
            subtotal: String(order.subtotal),
            shippingFee: String(order.shipping_fee),
            taxAmount: String(order.tax_amount),
            totalAmount: String(order.total_amount),
          },
          customerName: String(order.customer_name || 'Customer'),
          maskedEmail: maskEmail(order.customer_email),
        },
      });
    } catch (err) {
      handleStorefrontError(res, err);
    }
  };

  router.get('/orders/:orderNumber', (req: Request, res: Response) => trackPublicOrder(req, res));
  router.get('/:tenantSlug/orders/:orderNumber', (req: Request, res: Response) =>
    trackPublicOrder(req, res, req.params.tenantSlug)
  );

  // --------------------------------------------------------------------------
  // 5. AUTHENTICATED ADMIN ORDER LIFECYCLE
  // --------------------------------------------------------------------------

  // POST /api/storefront/orders/:id/cancel
  router.post('/orders/:id/cancel', requireAuth(), requirePermission(PERMISSIONS.ORDERS_CANCEL), requireTenantAccess(), async (req: Request, res: Response) => {
    try {
      const organizationId = req.auth!.organizationId;
      const order = await orders.cancelStorefrontOrder(organizationId, req.params.id, req.auth!.userId);
      res.json({ success: true, data: order });
    } catch (err) {
      handleStorefrontError(res, err);
    }
  });

  // POST /api/storefront/orders/:id/refund
  // Body may omit returnItems for a full remaining return, or provide
  // returnItems: [{ variant_id, quantity }] for a partial return.
  router.post('/orders/:id/refund', requireAuth(), requirePermission(PERMISSIONS.ORDERS_REFUND), requireTenantAccess(), async (req: Request, res: Response) => {
    try {
      const organizationId = req.auth!.organizationId;
      const returnItems = req.body?.returnItems === undefined
        ? undefined
        : Array.isArray(req.body.returnItems)
          ? req.body.returnItems.map((item: any) => ({
              variant_id: String(item?.variant_id ?? item?.variantId ?? ''),
              quantity: String(item?.quantity ?? ''),
            }))
          : req.body.returnItems;

      const order = await orders.refundOrder(
        organizationId,
        req.params.id,
        req.auth!.userId,
        req.body?.reason ? String(req.body.reason) : undefined,
        returnItems,
        req.body?.refundMethod ? String(req.body.refundMethod) : undefined,
        req.header('Idempotency-Key') || (req.body?.idempotencyKey ? String(req.body.idempotencyKey) : undefined),
      );
      res.json({ success: true, data: order });
    } catch (err) {
      handleStorefrontError(res, err);
    }
  });

  // POST /api/storefront/orders/:id/payment/confirm
  router.post('/orders/:id/payment/confirm', requireAuth(), requirePermission(PERMISSIONS.ORDERS_PAYMENT_CONFIRM), requireTenantAccess(), async (req: Request, res: Response) => {
    try {
      const organizationId = req.auth!.organizationId;
      const result = await orders.confirmStorefrontPayment(
        organizationId,
        req.params.id,
        req.body?.paymentReference ? String(req.body.paymentReference) : null,
        req.body?.transactionPayload && typeof req.body.transactionPayload === 'object' ? req.body.transactionPayload : undefined,
        req.auth!.userId,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      handleStorefrontError(res, err);
    }
  });

  // POST /api/storefront/orders/:id/fulfill
  router.post('/orders/:id/fulfill', requireAuth(), requirePermission(PERMISSIONS.ORDERS_FULFILL), requireTenantAccess(), async (req: Request, res: Response) => {
    try {
      const organizationId = req.auth!.organizationId;
      const order = await orders.fulfillStorefrontOrder(organizationId, req.params.id, req.auth!.userId);
      res.json({ success: true, data: order });
    } catch (err) {
      handleStorefrontError(res, err);
    }
  });

  return router;
}
