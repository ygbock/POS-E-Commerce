import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission, requireTenantAccess } from '../middleware/auth';
import { PERMISSIONS } from '../auth/roles';
import { PosService } from '../services/posService';
import { PosRepository } from '../repositories/posRepository';
import { OrderRepository } from '../repositories/orderRepository';
import { DatabaseClient, getDatabaseClient } from '../db/client';

export function sanitizePosErrorMessage(rawMessage: string): string {
  if (!rawMessage) return 'Unknown POS error';

  return rawMessage
    .replace(/\b(?:password|secret|key|token|bearer|credential|authorization|auth_token)\s*[:=]\s*["']?[^&;\s,}'"]+["']?/gi, '***')
    .replace(/\b[a-zA-Z0-9_+.-]+:\/\/[^\s"',;]+/gi, '[REDACTED_CONN_URI]')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b[\s\S]*?(?=(?:violates|error|at\s+|\n|$))/gi, '[REDACTED_SQL] ')
    .replace(/\b(?:WHERE|FROM|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|CROSS JOIN|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|UNION)\b[\s\S]*?(?=(?:violates|error|at\s+|\n|$))/gi, '[REDACTED_SQL] ')
    .replace(/(?:duplicate key value violates unique constraint|violates foreign key constraint|violates not-null constraint|violates check constraint)[^\n;]*/gi, '[REDACTED_DB_CONSTRAINT]')
    .replace(/(?:value too long for type character varying|syntax error at or near)[^\n;]*/gi, '[REDACTED_DB_SYNTAX]')
    .replace(/\b(?:relation|table|column)\s+["']?[a-zA-Z0-9_]+["']?/gi, '[REDACTED_DB_SCHEMA]')
    .replace(/\b(?:pos_sessions|pos_cash_movements|pos_returns|pos_return_items|inventory_balances|inventory_movements|orders|order_items|payments|customers|audit_events|schema_migrations)\b/g, '[REDACTED_TABLE]')
    .replace(/(?:\/[a-zA-Z0-9_\-\.]+){2,}/g, '[REDACTED_PATH]')
    .replace(/[a-zA-Z]:\\[a-zA-Z0-9_\-\.\\]+/g, '[REDACTED_PATH]')
    .replace(/\s+at\s+[^\n]+/g, '')
    .trim();
}

export function handlePosRouteError(res: Response, err: any): Response {
  const msg: string = err?.message || 'Unknown POS error';
  const safeMessage = sanitizePosErrorMessage(msg);

  if (
    msg.includes('TENANT_ACCESS_DENIED') ||
    msg.includes('LOCATION_ACCESS_DENIED') ||
    msg.includes('LOCATION_MISMATCH')
  ) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Access to the specified POS resource is denied.',
      },
    });
  }

  if (msg.includes('SESSION_NOT_FOUND')) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'SESSION_NOT_FOUND',
        message: safeMessage,
      },
    });
  }

  if (msg.includes('SESSION_CLOSED')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'SESSION_CLOSED',
        message: safeMessage,
      },
    });
  }

  if (msg.includes('PRODUCT_NOT_FOUND')) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: safeMessage,
      },
    });
  }

  if (msg.includes('INSUFFICIENT_STOCK')) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'INSUFFICIENT_STOCK',
        message: safeMessage,
      },
    });
  }

  if (msg.includes('PAYMENT_INVALID')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'PAYMENT_INVALID',
        message: safeMessage,
      },
    });
  }

  if (msg.includes('RETURN_INVALID')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'RETURN_INVALID',
        message: safeMessage,
      },
    });
  }

  if (msg.includes('SALE_NOT_FOUND')) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'SALE_NOT_FOUND',
        message: safeMessage,
      },
    });
  }

  if (msg.includes('DUPLICATE_SESSION')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'DUPLICATE_SESSION',
        message: safeMessage,
      },
    });
  }

  return res.status(500).json({
    success: false,
    error: {
      code: 'SERVER_ERROR',
      message: safeMessage,
    },
  });
}

export function createPosRouter(db: DatabaseClient, posService: PosService): Router {
  const router = Router();
  const posRepo = new PosRepository(db);
  const orderRepo = new OrderRepository(db);

  /**
   * GET /api/pos/products/search
   * Search catalog products/variants for POS cashier flow
   */
  router.get(
    '/products/search',
    requireAuth,
    requirePermission(PERMISSIONS.POS_VIEW),
    requireTenantAccess,
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const query = (req.query.q || '').toString().trim();

        if (!query) {
          return res.json({ success: true, products: [] });
        }

        // Perform efficient tenant-scoped lookup joining product_variants and products
        const results = await db.query<any>(
          `SELECT pv.id as variant_id, pv.sku, pv.barcode, pv.name as variant_name, pv.cost_price::text, pv.retail_price::text,
                  p.id as product_id, p.name as product_name, p.tax_rate::text, p.status
           FROM product_variants pv
           JOIN products p ON pv.product_id = p.id
           WHERE p.organization_id = $1 
             AND p.status = 'active'
             AND (pv.sku ILIKE $2 OR pv.barcode = $3 OR p.name ILIKE $2 OR pv.name ILIKE $2)
           LIMIT 20`,
          [orgId, `%${query}%`, query]
        );

        res.json({
          success: true,
          products: results.rows.map((row) => ({
            ...row,
            cost_price: Number(row.cost_price),
            retail_price: Number(row.retail_price),
            tax_rate: Number(row.tax_rate),
          })),
        });
      } catch (err) {
        handlePosRouteError(res, err);
      }
    }
  );

  /**
   * GET /api/pos/sessions
   * List POS sessions
   */
  router.get(
    '/sessions',
    requireAuth,
    requirePermission(PERMISSIONS.POS_VIEW),
    requireTenantAccess,
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const locationId = req.query.locationId?.toString();
        const limit = req.query.limit ? parseInt(req.query.limit.toString(), 10) : 50;
        const offset = req.query.offset ? parseInt(req.query.offset.toString(), 10) : 0;

        const sessions = await posRepo.listSessions({ orgId, locationId, limit, offset });
        res.json({ success: true, sessions });
      } catch (err) {
        handlePosRouteError(res, err);
      }
    }
  );

  /**
   * POST /api/pos/sessions
   * Open POS cashier session
   */
  router.post(
    '/sessions',
    requireAuth,
    requirePermission(PERMISSIONS.POS_SESSION_OPEN),
    requireTenantAccess,
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const { locationId, terminalId, openingCash } = req.body;

        if (!locationId || !terminalId || openingCash === undefined) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'locationId, terminalId, and openingCash are required.' },
          });
        }

        const cashierName = req.auth!.email || 'Cashier';
        const session = await posService.openSession(orgId, locationId, terminalId, cashierName, Number(openingCash));

        res.json({ success: true, session });
      } catch (err) {
        handlePosRouteError(res, err);
      }
    }
  );

  /**
   * GET /api/pos/sessions/:id
   * Get session details with its cash movements
   */
  router.get(
    '/sessions/:id',
    requireAuth,
    requirePermission(PERMISSIONS.POS_VIEW),
    requireTenantAccess,
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const { id } = req.params;

        const session = await posRepo.findSessionById(id, orgId);
        if (!session) {
          throw new Error(`SESSION_NOT_FOUND: POS Session '${id}' not found.`);
        }

        const movements = await posRepo.listCashMovements(id);

        res.json({ success: true, session, movements });
      } catch (err) {
        handlePosRouteError(res, err);
      }
    }
  );

  /**
   * POST /api/pos/sessions/:id/close
   * Close session
   */
  router.post(
    '/sessions/:id/close',
    requireAuth,
    requirePermission(PERMISSIONS.POS_SESSION_CLOSE),
    requireTenantAccess,
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const { id } = req.params;
        const { countedCash } = req.body;

        if (countedCash === undefined) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'countedCash is required to close a session.' },
          });
        }

        const closingActor = req.auth!.email || 'Store Manager';
        const session = await posService.closeSession(id, orgId, Number(countedCash), closingActor);

        res.json({ success: true, session });
      } catch (err) {
        handlePosRouteError(res, err);
      }
    }
  );

  /**
   * POST /api/pos/sessions/:id/cash-movement
   * Record a Cash In / Cash Out drawer movement
   */
  router.post(
    '/sessions/:id/cash-movement',
    requireAuth,
    requirePermission(PERMISSIONS.POS_SELL),
    requireTenantAccess,
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const { id } = req.params;
        const { type, amount, reason } = req.body;

        if (!type || amount === undefined || !reason) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'type, amount, and reason are required.' },
          });
        }

        if (type !== 'Cash In' && type !== 'Cash Out') {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: "type must be 'Cash In' or 'Cash Out'." },
          });
        }

        const performedBy = req.auth!.email || 'Cashier';
        const movement = await posService.recordCashMovement(id, orgId, type, Number(amount), reason, performedBy);

        res.json({ success: true, movement });
      } catch (err) {
        handlePosRouteError(res, err);
      }
    }
  );

  /**
   * POST /api/pos/checkout
   * Checkout an active POS cart (creates sale + deductions)
   */
  router.post(
    '/checkout',
    requireAuth,
    requirePermission(PERMISSIONS.POS_SELL),
    requireTenantAccess,
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const { locationId, sessionId, customerId, cartItems, paymentMethod, amountPaid, notes } = req.body;

        if (!locationId || !sessionId || !cartItems || !paymentMethod || amountPaid === undefined) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'locationId, sessionId, cartItems, paymentMethod, and amountPaid are required.' },
          });
        }

        const cashierName = req.auth!.email || 'Cashier';
        const idempotencyKey = req.headers['idempotency-key']?.toString();

        const result = await posService.checkout({
          organization_id: orgId,
          location_id: locationId,
          session_id: sessionId,
          cashier_name: cashierName,
          customer_id: customerId,
          cart_items: cartItems,
          payment_method: paymentMethod,
          amount_paid: Number(amountPaid),
          notes,
          idempotency_key: idempotencyKey,
        });

        res.json({ success: true, ...result });
      } catch (err) {
        handlePosRouteError(res, err);
      }
    }
  );

  /**
   * GET /api/pos/sales/:id
   * Get transaction sale/order by ID
   */
  router.get(
    '/sales/:id',
    requireAuth,
    requirePermission(PERMISSIONS.POS_VIEW),
    requireTenantAccess,
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const { id } = req.params;

        const sale = await orderRepo.findOrderById(id, orgId);
        if (!sale) {
          throw new Error(`SALE_NOT_FOUND: POS Sale with ID '${id}' was not found.`);
        }

        const paymentsRes = await db.query<any>(
          `SELECT * FROM payments WHERE order_id = $1`,
          [id]
        );

        res.json({
          success: true,
          order: sale.order,
          items: sale.items,
          payment: paymentsRes.rows.length > 0 ? paymentsRes.rows[0] : undefined,
        });
      } catch (err) {
        handlePosRouteError(res, err);
      }
    }
  );

  /**
   * POST /api/pos/returns
   * Process product return and trigger inventory return movement
   */
  router.post(
    '/returns',
    requireAuth,
    requirePermission(PERMISSIONS.POS_RETURN),
    requireTenantAccess,
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const { orderId, refundMethod, reason, returnItems } = req.body;

        if (!orderId || !refundMethod || !reason || !returnItems) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'orderId, refundMethod, reason, and returnItems are required.' },
          });
        }

        const performedBy = req.auth!.email || 'Store Manager';
        const result = await posService.processReturn({
          organization_id: orgId,
          order_id: orderId,
          refund_method: refundMethod,
          performed_by: performedBy,
          reason,
          return_items: returnItems,
        });

        res.json({ success: true, ...result });
      } catch (err) {
        handlePosRouteError(res, err);
      }
    }
  );

  /**
   * GET /api/pos/receipts/:id
   * Fetch receipt details formatted for thermal printers / receipts
   */
  router.get(
    '/receipts/:id',
    requireAuth,
    requirePermission(PERMISSIONS.POS_VIEW),
    requireTenantAccess,
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const { id } = req.params;

        const sale = await orderRepo.findOrderById(id, orgId);
        if (!sale) {
          throw new Error(`SALE_NOT_FOUND: Receipt transaction '${id}' was not found.`);
        }

        const paymentsRes = await db.query<any>(
          `SELECT * FROM payments WHERE order_id = $1`,
          [id]
        );

        const orgRes = await db.query<any>(
          `SELECT * FROM organizations WHERE id = $1`,
          [orgId]
        );

        const locRes = await db.query<any>(
          `SELECT * FROM locations WHERE id = $1`,
          [sale.order.location_id]
        );

        res.json({
          success: true,
          receipt: {
            receipt_number: sale.order.order_number,
            transaction_date: sale.order.created_at,
            organization_name: orgRes.rows[0]?.name || 'AbaCha Org',
            location_name: locRes.rows[0]?.name || 'AbaCha Location',
            cashier_name: sale.order.cashier_name,
            line_items: sale.items,
            subtotal: sale.order.subtotal,
            discount: sale.order.discount_amount,
            tax: sale.order.tax_amount,
            total: sale.order.total_amount,
            payment_method: paymentsRes.rows[0]?.payment_method || 'N/A',
            amount_received: paymentsRes.rows[0]?.transaction_payload?.amount_paid || sale.order.total_amount,
            change_due: paymentsRes.rows[0]?.transaction_payload?.change_due || 0,
            status: sale.order.status,
          },
        });
      } catch (err) {
        handlePosRouteError(res, err);
      }
    }
  );

  return router;
}
