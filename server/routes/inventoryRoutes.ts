import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission, requireTenantAccess } from '../middleware/auth';
import { PERMISSIONS } from '../auth/roles';
import { InventoryRepository } from '../repositories/inventoryRepository';
import { InventoryService } from '../inventory/inventoryService';
import { ReservationService } from '../inventory/reservationService';
import { TransferService } from '../inventory/transferService';
import { StockCountService } from '../inventory/stockCountService';
import { DatabaseClient } from '../db/client';

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
        const isSuperAdmin = req.auth!.role === 'super_admin';
        const orgId = isSuperAdmin && typeof req.query.orgId === 'string' ? req.query.orgId : req.auth!.organizationId;
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
        res.status(500).json({
          success: false,
          error: {
            code: 'INVENTORY_ERROR',
            message: err.message,
          },
        });
      }
    }
  );

  router.get(
    '/balances/:locationId/:variantId',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_VIEW),
    async (req: Request, res: Response) => {
      try {
        const isSuperAdmin = req.auth!.role === 'super_admin';
        const orgId = isSuperAdmin && typeof req.query.orgId === 'string' ? req.query.orgId : req.auth!.organizationId;
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
        res.status(500).json({
          success: false,
          error: {
            code: 'INVENTORY_ERROR',
            message: err.message,
          },
        });
      }
    }
  );

  router.get(
    '/movements',
    requireAuth(),
    requirePermission(PERMISSIONS.INVENTORY_VIEW),
    async (req: Request, res: Response) => {
      try {
        const isSuperAdmin = req.auth!.role === 'super_admin';
        const orgId = isSuperAdmin && typeof req.query.orgId === 'string' ? req.query.orgId : req.auth!.organizationId;
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
        res.status(500).json({
          success: false,
          error: {
            code: 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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

        const result = await inventoryService.recordOpeningBalance(
          orgId,
          { location_id, variant_id, quantity: Number(quantity), unit_cost, notes, idempotency_key },
          actor
        );

        res.status(201).json({
          success: true,
          data: result,
        });
      } catch (err: any) {
        const isTenant = err.message?.includes('TENANT_ACCESS_DENIED');
        const isDup = err.message?.includes('DUPLICATE_MOVEMENT');
        const status = isTenant ? 403 : isDup ? 409 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isTenant ? 'TENANT_ACCESS_DENIED' : isDup ? 'DUPLICATE_MOVEMENT' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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

        const result = await inventoryService.recordAdjustment(
          orgId,
          {
            location_id,
            variant_id,
            quantity_change: Number(quantity_change),
            reason,
            unit_cost,
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
        const isTenant = err.message?.includes('TENANT_ACCESS_DENIED');
        const isInsufficient = err.message?.includes('INSUFFICIENT_STOCK');
        const isDup = err.message?.includes('DUPLICATE_MOVEMENT');
        const status = isTenant ? 403 : isInsufficient ? 422 : isDup ? 409 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isTenant ? 'TENANT_ACCESS_DENIED' : isInsufficient ? 'INSUFFICIENT_STOCK' : isDup ? 'DUPLICATE_MOVEMENT' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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

        const balance = await inventoryService.quarantineStock(
          orgId,
          { location_id, variant_id, quantity: Number(quantity), type, reason, notes },
          actor
        );

        res.json({
          success: true,
          data: balance,
        });
      } catch (err: any) {
        const isTenant = err.message?.includes('TENANT_ACCESS_DENIED');
        const isInsufficient = err.message?.includes('INSUFFICIENT_AVAILABLE_STOCK');
        const status = isTenant ? 403 : isInsufficient ? 422 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isTenant ? 'TENANT_ACCESS_DENIED' : isInsufficient ? 'INSUFFICIENT_STOCK' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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

        const result = await inventoryService.writeOffStock(
          orgId,
          { location_id, variant_id, quantity: Number(quantity), type, reason, notes },
          actor
        );

        res.json({
          success: true,
          data: result,
        });
      } catch (err: any) {
        const isTenant = err.message?.includes('TENANT_ACCESS_DENIED');
        const isInsufficient = err.message?.includes('INSUFFICIENT_QUARANTINED_STOCK');
        const status = isTenant ? 403 : isInsufficient ? 422 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isTenant ? 'TENANT_ACCESS_DENIED' : isInsufficient ? 'INSUFFICIENT_STOCK' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const { location_id, variant_id, quantity, reference_type, reference_id, notes, expires_at } = req.body;

        if (!location_id || !variant_id || !quantity || !reference_type || !reference_id) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing required fields: location_id, variant_id, quantity, reference_type, reference_id.',
            },
          });
        }

        const reservation = await reservationService.createReservation(
          orgId,
          { location_id, variant_id, quantity: Number(quantity), reference_type, reference_id, notes, expires_at },
          actor
        );

        res.status(201).json({
          success: true,
          data: reservation,
        });
      } catch (err: any) {
        const isTenant = err.message?.includes('TENANT_ACCESS_DENIED');
        const isInsufficient = err.message?.includes('INSUFFICIENT_STOCK');
        const status = isTenant ? 403 : isInsufficient ? 422 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isTenant ? 'TENANT_ACCESS_DENIED' : isInsufficient ? 'INSUFFICIENT_STOCK' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        res.status(500).json({
          success: false,
          error: {
            code: 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        res.status(500).json({
          success: false,
          error: {
            code: 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const isNotFound = err.message?.includes('RESERVATION_NOT_FOUND');
        const status = isNotFound ? 404 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const isNotFound = err.message?.includes('RESERVATION_NOT_FOUND');
        const status = isNotFound ? 404 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const isNotFound = err.message?.includes('RESERVATION_NOT_FOUND');
        const status = isNotFound ? 404 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const isTenant = err.message?.includes('TENANT_ACCESS_DENIED') || err.message?.includes('LOCATION_ACCESS_DENIED') || err.message?.includes('VARIANT_ACCESS_DENIED');
        const status = isTenant ? 403 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isTenant ? 'ACCESS_DENIED' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        res.status(500).json({
          success: false,
          error: {
            code: 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        res.status(500).json({
          success: false,
          error: {
            code: 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        res.status(500).json({
          success: false,
          error: {
            code: 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const isNotFound = err.message?.includes('TRANSFER_NOT_FOUND');
        const status = isNotFound ? 404 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const isNotFound = err.message?.includes('TRANSFER_NOT_FOUND');
        const status = isNotFound ? 404 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const isNotFound = err.message?.includes('TRANSFER_NOT_FOUND');
        const status = isNotFound ? 404 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const isNotFound = err.message?.includes('TRANSFER_NOT_FOUND');
        const isInsufficient = err.message?.includes('INSUFFICIENT_STOCK');
        const status = isNotFound ? 404 : isInsufficient ? 422 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : isInsufficient ? 'INSUFFICIENT_STOCK' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const isNotFound = err.message?.includes('TRANSFER_NOT_FOUND');
        const status = isNotFound ? 404 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const isNotFound = err.message?.includes('TRANSFER_NOT_FOUND');
        const status = isNotFound ? 404 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const isTenant = err.message?.includes('TENANT_ACCESS_DENIED');
        const status = isTenant ? 403 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isTenant ? 'TENANT_ACCESS_DENIED' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        res.status(500).json({
          success: false,
          error: {
            code: 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        res.status(500).json({
          success: false,
          error: {
            code: 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const isNotFound = err.message?.includes('STOCK_COUNT_NOT_FOUND');
        const status = isNotFound ? 404 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
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
        const isNotFound = err.message?.includes('STOCK_COUNT_NOT_FOUND');
        const status = isNotFound ? 404 : 400;
        res.status(status).json({
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'INVENTORY_ERROR',
            message: err.message,
          },
        });
      }
    }
  );

  return router;
}
