import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission, requireTenantAccess } from '../middleware/auth';
import { PERMISSIONS } from '../auth/roles';
import { InventoryRepository } from '../repositories/inventoryRepository';
import { InventoryService } from '../inventory/inventoryService';
import { ReservationService } from '../inventory/reservationService';
import { TransferService } from '../inventory/transferService';
import { StockCountService } from '../inventory/stockCountService';
import { DatabaseClient } from '../db/client';
import { parseExactQuantity, parseExactMoney } from '../inventory/inventoryPolicies';

/**
 * Sanitizes error messages to prevent leaking SQL statements, database constraint details,
 * file paths, stack traces, connection strings, credentials, or table/column names.
 */
export function sanitizeInventoryErrorMessage(rawMessage: string): string {
  if (!rawMessage) return 'Unknown inventory error';

  return rawMessage
    // Credentials, passwords, keys, tokens, secrets
    .replace(/\b(?:password|secret|key|token|bearer|credential|authorization|auth_token)\s*[:=]\s*["']?[^&;\s,}'"]+["']?/gi, '***')
    // Connection strings
    .replace(/\b[a-zA-Z0-9_+.-]+:\/\/[^\s"',;]+/gi, '[REDACTED_CONN_URI]')
    // SQL comments
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Entire SQL statements & clauses
    .replace(/\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b[\s\S]*?(?=(?:violates|error|at\s+|\n|$))/gi, '[REDACTED_SQL] ')
    .replace(/\b(?:WHERE|FROM|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|CROSS JOIN|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|UNION)\b[\s\S]*?(?=(?:violates|error|at\s+|\n|$))/gi, '[REDACTED_SQL] ')
    // Database constraint & diagnostic details
    .replace(/(?:duplicate key value violates unique constraint|violates foreign key constraint|violates not-null constraint|violates check constraint)[^\n;]*/gi, '[REDACTED_DB_CONSTRAINT]')
    .replace(/(?:value too long for type character varying|syntax error at or near)[^\n;]*/gi, '[REDACTED_DB_SYNTAX]')
    // Explicit relation, table, column mentions
    .replace(/\b(?:relation|table|column)\s+["']?[a-zA-Z0-9_]+["']?/gi, '[REDACTED_DB_SCHEMA]')
    // Specific table names
    .replace(/\b(?:inventory_balances|inventory_movements|inventory_transfers|inventory_transfer_items|inventory_transfer_events|inventory_reservations|inventory_stock_counts|inventory_stock_count_items|product_variants|products|organizations|locations|users|orders|order_items|payments|customers|audit_events|schema_migrations)\b/g, '[REDACTED_TABLE]')
    // Sensitive column names
    .replace(/\b(?:on_hand|available|reserved|in_transit|damaged|expired|unit_cost|weighted_average_cost|password_hash|token_hash)\b/g, '[REDACTED_COLUMN]')
    // File paths (Unix and Windows)
    .replace(/(?:\/[a-zA-Z0-9_\-\.]+){2,}/g, '[REDACTED_PATH]')
    .replace(/[a-zA-Z]:\\[a-zA-Z0-9_\-\.\\]+/g, '[REDACTED_PATH]')
    // Stack traces
    .replace(/\s+at\s+[^\n]+/g, '')
    .replace(/\n\s*at\s+.*$/gm, '')
    // Trace identifiers
    .replace(/\b(?:trace[-_]?id|request[-_]?id|span[-_]?id|correlation[-_]?id)[:=]?\s*["']?[a-zA-Z0-9_\-]+["']?/gi, '[REDACTED_TRACE]')
    .trim();
}

/**
 * Centralized error handler for Inventory HTTP Routes (INV-001R4)
 * Guarantees safe error classification, status codes, and prevents internal DB leakage.
 */
export function handleInventoryRouteError(res: Response, err: any): Response {
  const msg: string = err?.message || 'Unknown inventory error';
  const safeMessage = sanitizeInventoryErrorMessage(msg);

  if (
    msg.includes('TENANT_ACCESS_DENIED') ||
    msg.includes('LOCATION_ACCESS_DENIED') ||
    msg.includes('VARIANT_ACCESS_DENIED') ||
    msg.includes('TENANT_MISMATCH')
  ) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'TENANT_ACCESS_DENIED',
        message: 'Access to the specified inventory resource is denied for this organization.',
      },
    });
  }

  if (msg.includes('TENANT_REQUIRED')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'TENANT_REQUIRED',
        message: 'Organization ID is required.',
      },
    });
  }

  if (
    msg.includes('INSUFFICIENT_STOCK') ||
    msg.includes('INSUFFICIENT_AVAILABLE_STOCK') ||
    msg.includes('INSUFFICIENT_QUARANTINED_STOCK')
  ) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'INSUFFICIENT_STOCK',
        message: safeMessage,
      },
    });
  }

  if (
    msg.includes('IDEMPOTENCY_CONFLICT') ||
    msg.includes('DUPLICATE_RESERVATION') ||
    msg.includes('DUPLICATE_MOVEMENT')
  ) {
    return res.status(409).json({
      success: false,
      error: {
        code: msg.includes('DUPLICATE_MOVEMENT') ? 'DUPLICATE_MOVEMENT' : 'IDEMPOTENCY_CONFLICT',
        message: safeMessage,
      },
    });
  }

  if (
    msg.includes('TRANSFER_NOT_FOUND') ||
    msg.includes('RESERVATION_NOT_FOUND') ||
    msg.includes('STOCK_COUNT_NOT_FOUND') ||
    msg.includes('BALANCE_NOT_FOUND') ||
    msg.includes('LOCATION_NOT_FOUND') ||
    msg.includes('VARIANT_NOT_FOUND')
  ) {
    return res.status(404).json({
      success: false,
      error: {
        code: msg.includes('TRANSFER_NOT_FOUND')
          ? 'TRANSFER_NOT_FOUND'
          : msg.includes('RESERVATION_NOT_FOUND')
          ? 'RESERVATION_NOT_FOUND'
          : msg.includes('STOCK_COUNT_NOT_FOUND')
          ? 'STOCK_COUNT_NOT_FOUND'
          : 'NOT_FOUND',
        message: safeMessage,
      },
    });
  }

  if (
    msg.includes('INVALID_QUANTITY') ||
    msg.includes('VALIDATION_ERROR') ||
    msg.includes('INVALID_STATE') ||
    msg.includes('INVALID_COUNT') ||
    msg.includes('INVALID_TRANSFER') ||
    msg.includes('INVALID_RESERVATION') ||
    msg.includes('INVALID_TRANSFER_ITEM') ||
    msg.includes('INVALID_MONEY') ||
    msg.includes('INVALID_COST') ||
    msg.includes('OVER_RECEIPT_PROHIBITED')
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: msg.includes('INVALID_QUANTITY') ? 'INVALID_QUANTITY' : 'VALIDATION_ERROR',
        message: safeMessage,
      },
    });
  }

  if (msg.includes('IMMUTABLE_RECORD')) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'IMMUTABLE_RECORD',
        message: 'Modification or deletion of immutable records is strictly rejected.',
      },
    });
  }

  const productionSafeMessage =
    process.env.NODE_ENV === 'production'
      ? 'An internal inventory processing error occurred.'
      : safeMessage;

  return res.status(500).json({
    success: false,
    error: {
      code: 'INVENTORY_ERROR',
      message: productionSafeMessage,
    },
  });
}

export function createInventoryRouter(db?: DatabaseClient, inventoryRepo?: InventoryRepository): Router {
  const router = Router();
  const repo = inventoryRepo || new InventoryRepository(db);
  const inventoryService = new InventoryService(repo, undefined, db);
  const reservationService = new ReservationService(repo, undefined, db);
  const transferService = new TransferService(repo, undefined, db);
  const stockCountService = new StockCountService(repo, undefined, db);

  // ------------------------------------------------------------------
  // 1. BALANCES & MOVEMENTS (Read-Only)
  // ------------------------------------------------------------------
  router.get(
    '/balances/:locationId',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_VIEW),
    requireTenantAccess(),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        if (!orgId) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'TENANT_REQUIRED',
              message: 'Organization ID is required.',
            },
          });
        }
        const balances = await repo.listBalancesByLocation(req.params.locationId, orgId);
        res.json({
          success: true,
          count: balances.length,
          data: balances,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.get(
    '/balances/:locationId/:variantId',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_VIEW),
    requireTenantAccess(),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        if (!orgId) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'TENANT_REQUIRED',
              message: 'Organization ID is required.',
            },
          });
        }
        const balance = await repo.getBalance(
          req.params.locationId,
          req.params.variantId,
          orgId
        );
        if (!balance) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'BALANCE_NOT_FOUND',
              message: `No balance record found for variant '${req.params.variantId}' at location '${req.params.locationId}'.`,
            },
          });
        }
        res.json({
          success: true,
          data: balance,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.get(
    '/movements',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_VIEW),
    requireTenantAccess(),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const { locationId, variantId, movementType, limit, offset } = req.query;
        const movements = await inventoryService.listMovements(orgId, {
          locationId: locationId as string,
          variantId: variantId as string,
          movementType: movementType as any,
          limit: limit ? parseInt(limit as string, 10) : undefined,
          offset: offset ? parseInt(offset as string, 10) : undefined,
        });
        res.json({
          success: true,
          count: movements.length,
          data: movements,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  // ------------------------------------------------------------------
  // 2. OPENING BALANCES & ADJUSTMENTS
  // ------------------------------------------------------------------
  router.post(
    '/opening-balance',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_ADJUST),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const { location_id, variant_id, quantity, unit_cost, notes, idempotency_key } = req.body;

        if (!location_id || !variant_id || quantity === undefined) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing required fields: location_id, variant_id, quantity.',
            },
          });
        }

        const exactQty = parseExactQuantity(quantity, 'quantity', { allowNegative: false });
        const exactUnitCost = unit_cost !== undefined ? parseExactMoney(unit_cost, 'unit_cost') : undefined;

        const result = await inventoryService.recordOpeningBalance(
          orgId,
          { location_id, variant_id, quantity: exactQty, unit_cost: exactUnitCost, notes, idempotency_key },
          actor
        );

        res.status(201).json({
          success: true,
          data: result,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/adjustments',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_ADJUST),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const { location_id, variant_id, quantity_change, reason, unit_cost, notes, idempotency_key, allowNegativeStock } = req.body;

        if (!location_id || !variant_id || quantity_change === undefined || !reason) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing required fields: location_id, variant_id, quantity_change, reason.',
            },
          });
        }

        const exactQtyChange = parseExactQuantity(quantity_change, 'quantity_change', { allowNegative: true });
        const exactUnitCost = unit_cost !== undefined ? parseExactMoney(unit_cost, 'unit_cost') : undefined;

        const result = await inventoryService.recordAdjustment(
          orgId,
          {
            location_id,
            variant_id,
            quantity_change: exactQtyChange,
            reason,
            unit_cost: exactUnitCost,
            notes,
            idempotency_key,
            allowNegativeStock,
          },
          actor
        );

        res.json({
          success: true,
          data: result,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/quarantine',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_ADJUST),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const { location_id, variant_id, quantity, type, reason, notes } = req.body;

        if (!location_id || !variant_id || !quantity || !type) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing required fields: location_id, variant_id, quantity, type.',
            },
          });
        }

        const exactQty = parseExactQuantity(quantity, 'quantity', { allowNegative: false });

        const balance = await inventoryService.quarantineStock(
          orgId,
          { location_id, variant_id, quantity: exactQty, type, reason, notes },
          actor
        );

        res.json({
          success: true,
          data: balance,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/write-off',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_ADJUST),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const { location_id, variant_id, quantity, type, reason, notes } = req.body;

        if (!location_id || !variant_id || !quantity || !type) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing required fields: location_id, variant_id, quantity, type.',
            },
          });
        }

        const exactQty = parseExactQuantity(quantity, 'quantity', { allowNegative: false });

        const result = await inventoryService.writeOffStock(
          orgId,
          { location_id, variant_id, quantity: exactQty, type, reason, notes },
          actor
        );

        res.json({
          success: true,
          data: result,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  // ------------------------------------------------------------------
  // 3. FIRST-CLASS RESERVATIONS
  // ------------------------------------------------------------------
  router.post(
    '/reservations',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.ORDERS_CREATE),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotency_key) as string | undefined;
        const { location_id, variant_id, quantity, reference_type, reference_id, notes, expires_at } = req.body;

        if (!location_id || !variant_id || quantity === undefined || !reference_type || !reference_id) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing required fields: location_id, variant_id, quantity, reference_type, reference_id.',
            },
          });
        }

        const exactQty = parseExactQuantity(quantity, 'quantity', { allowNegative: false });

        const reservation = await reservationService.createReservation(
          orgId,
          { location_id, variant_id, quantity: exactQty, reference_type, reference_id, notes, expires_at, idempotency_key: idempotencyKey },
          actor
        );

        res.status(201).json({
          success: true,
          data: reservation,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.get(
    '/reservations',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_VIEW),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const { locationId, variantId, referenceType, referenceId, status, limit, offset } = req.query;
        const reservations = await reservationService.listReservations(orgId, {
          locationId: locationId as string,
          variantId: variantId as string,
          referenceType: referenceType as string,
          referenceId: referenceId as string,
          status: status as any,
          limit: limit ? parseInt(limit as string, 10) : undefined,
          offset: offset ? parseInt(offset as string, 10) : undefined,
        });

        res.json({
          success: true,
          count: reservations.length,
          data: reservations,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.get(
    '/reservations/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_VIEW),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const reservation = await reservationService.getReservation(orgId, req.params.id);
        if (!reservation) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'RESERVATION_NOT_FOUND',
              message: `Reservation '${req.params.id}' not found.`,
            },
          });
        }
        res.json({
          success: true,
          data: reservation,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/reservations/:id/release',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.ORDERS_CREATE),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const updated = await reservationService.releaseReservation(orgId, req.params.id, actor);
        res.json({
          success: true,
          data: updated,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/reservations/:id/fulfill',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.ORDERS_CREATE),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const updated = await reservationService.fulfillReservation(orgId, req.params.id, actor);
        res.json({
          success: true,
          data: updated,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/reservations/:id/cancel',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.ORDERS_CREATE),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const updated = await reservationService.cancelReservation(orgId, req.params.id, actor);
        res.json({
          success: true,
          data: updated,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/reservations/expire-stale',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_ADJUST),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const result = await reservationService.expireStaleReservations(orgId);
        res.json({
          success: true,
          data: {
            ...result,
            expired_count: result.expiredCount,
          },
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  // ------------------------------------------------------------------
  // 4. MULTI-LOCATION STOCK TRANSFERS (INV-001)
  // ------------------------------------------------------------------
  router.post(
    '/transfers',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_TRANSFER),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotency_key) as string | undefined;
        const { transfer_number, source_location_id, destination_location_id, status, items, notes } = req.body;

        if (!source_location_id || !destination_location_id || !items || !Array.isArray(items)) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing required fields: source_location_id, destination_location_id, items array.',
            },
          });
        }

        const result = await transferService.createTransfer(
          orgId,
          { transfer_number, source_location_id, destination_location_id, status, items, notes, idempotency_key: idempotencyKey },
          actor
        );

        res.status(201).json({
          success: true,
          data: result,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.get(
    '/transfers',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_VIEW),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const { sourceLocationId, destinationLocationId, status, limit, offset } = req.query;
        const transfers = await transferService.listTransfers(orgId, {
          sourceLocationId: sourceLocationId as string,
          destinationLocationId: destinationLocationId as string,
          status: status as any,
          limit: limit ? parseInt(limit as string, 10) : undefined,
          offset: offset ? parseInt(offset as string, 10) : undefined,
        });

        res.json({
          success: true,
          count: transfers.length,
          data: transfers,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.get(
    '/transfers/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_VIEW),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const transfer = await transferService.getTransfer(orgId, req.params.id);
        if (!transfer) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'TRANSFER_NOT_FOUND',
              message: `Transfer '${req.params.id}' not found.`,
            },
          });
        }
        res.json({
          success: true,
          data: transfer,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.get(
    '/transfers/:id/events',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_VIEW),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const events = await transferService.getTransferEvents(orgId, req.params.id);
        res.json({
          success: true,
          count: events.length,
          data: events,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/transfers/:id/request',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_TRANSFER),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotency_key) as string | undefined;
        const updated = await transferService.requestTransfer(orgId, req.params.id, actor, idempotencyKey);
        res.json({
          success: true,
          data: updated,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/transfers/:id/approve',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_TRANSFER),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotency_key) as string | undefined;
        const updated = await transferService.approveTransfer(orgId, req.params.id, actor, idempotencyKey);
        res.json({
          success: true,
          data: updated,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/transfers/:id/reject',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_TRANSFER),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotency_key) as string | undefined;
        const { reason } = req.body;
        const updated = await transferService.rejectTransfer(orgId, req.params.id, actor, reason, idempotencyKey);
        res.json({
          success: true,
          data: updated,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/transfers/:id/dispatch',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_TRANSFER),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotency_key) as string | undefined;
        const { items } = req.body;

        const updated = await transferService.dispatchTransfer(orgId, req.params.id, items, actor, idempotencyKey);
        res.json({
          success: true,
          data: updated,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/transfers/:id/receive',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_RECEIVE),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotency_key) as string | undefined;
        const { items, allowOverReceive } = req.body;

        if (!items || typeof items !== 'object') {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing or invalid items object mapping variantId to received quantity.',
            },
          });
        }

        const updated = await transferService.receiveTransfer(
          orgId,
          req.params.id,
          items,
          actor,
          idempotencyKey,
          { allowOverReceive: Boolean(allowOverReceive) }
        );
        res.json({
          success: true,
          data: updated,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/transfers/:id/cancel',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_TRANSFER),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const idempotencyKey = (req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || req.body?.idempotency_key) as string | undefined;
        const { reason } = req.body;
        const updated = await transferService.cancelTransfer(orgId, req.params.id, actor, reason, idempotencyKey);
        res.json({
          success: true,
          data: updated,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  // ------------------------------------------------------------------
  // 5. STOCK COUNTS & PHYSICAL AUDIT
  // ------------------------------------------------------------------
  router.post(
    '/stock-counts',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_ADJUST),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const { location_id, count_number, variant_ids, notes } = req.body;

        if (!location_id || !variant_ids || !Array.isArray(variant_ids)) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing required fields: location_id, variant_ids array.',
            },
          });
        }

        const result = await stockCountService.createStockCount(
          orgId,
          { location_id, count_number, variant_ids, notes },
          actor
        );

        res.status(201).json({
          success: true,
          data: result,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.get(
    '/stock-counts',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_VIEW),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const { locationId, status, limit, offset } = req.query;
        const counts = await stockCountService.listStockCounts(orgId, {
          locationId: locationId as string,
          status: status as any,
          limit: limit ? parseInt(limit as string, 10) : undefined,
          offset: offset ? parseInt(offset as string, 10) : undefined,
        });

        res.json({
          success: true,
          count: counts.length,
          data: counts,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.get(
    '/stock-counts/:id',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_VIEW),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const count = await stockCountService.getStockCount(orgId, req.params.id);
        if (!count) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'STOCK_COUNT_NOT_FOUND',
              message: `Stock count '${req.params.id}' not found.`,
            },
          });
        }
        res.json({
          success: true,
          data: count,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/stock-counts/:id/submit',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_ADJUST),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const { items } = req.body;

        if (!items || typeof items !== 'object') {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing or invalid items object mapping variantId to counted quantity.',
            },
          });
        }

        const updated = await stockCountService.submitStockCount(orgId, req.params.id, items, actor);
        res.json({
          success: true,
          data: updated,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  router.post(
    '/stock-counts/:id/approve',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_ADJUST),
    async (req: Request, res: Response) => {
      try {
        const orgId = req.auth!.organizationId;
        const actor = req.auth!.userId;
        const updated = await stockCountService.approveStockCount(orgId, req.params.id, actor);
        res.json({
          success: true,
          data: updated,
        });
      } catch (err: any) {
        return handleInventoryRouteError(res, err);
      }
    }
  );

  return router;
}
