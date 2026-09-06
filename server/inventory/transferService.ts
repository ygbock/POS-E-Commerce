import { DatabaseClient, getDatabaseClient } from '../db/client';
import { InventoryRepository } from '../repositories/inventoryRepository';
import { InventoryTransferRepository } from '../repositories/inventoryTransferRepository';
import {
  InventoryTransferRecord,
  InventoryTransferItemRecord,
  InventoryTransferEventRecord,
  TransferStatus,
} from './inventoryTypes';
import {
  roundQty,
  addQty,
  subQty,
  calculateAvailable,
  validateTransferTransition,
} from './inventoryPolicies';

/**
 * Stock Transfer Domain Service (INV-001 / INV-001R2)
 * 
 * Manages the complete, transactionally consistent, tenant-isolated transfer domain:
 * 
 * Architecture:
 * inventory_transfers
 *         │
 *         ├── inventory_transfer_items
 *         │
 *         └── inventory_transfer_events (Immutable Workflow Event Ledger)
 *                          │
 *                          ▼
 *                 inventory_movements (Authoritative Physical Inventory Mutations)
 *                          │
 *                          ▼
 *                 inventory_balances (Current Inventory Projection)
 * 
 * All mutations execute with strict row-level pessimistic locks inside atomic transactions.
 * All operations derive organization strictly from req.auth.organizationId (passed as organizationId).
 * Decimal precision is preserved via BigInt scaled integer arithmetic (zero floating-point drift).
 */
export class TransferService {
  private inventoryRepo: InventoryRepository;
  private transferRepo: InventoryTransferRepository;
  private db: DatabaseClient;

  constructor(
    inventoryRepo?: InventoryRepository,
    transferRepo?: InventoryTransferRepository,
    db?: DatabaseClient
  ) {
    this.db = db || getDatabaseClient();
    this.inventoryRepo = inventoryRepo || new InventoryRepository(this.db);
    this.transferRepo = transferRepo || new InventoryTransferRepository(this.db);
  }

  /**
   * Creates a new stock transfer request.
   * Enforces:
   * - Strict tenant organization check
   * - Different source and destination locations
   * - Non-empty items array
   * - Organization ownership of locations and product variants
   * - Positive requested quantities
   * - Unique variants per transfer
   * - Organization-scoped idempotency
   */
  async createTransfer(
    organizationId: string,
    data: {
      transfer_number?: string;
      source_location_id: string;
      destination_location_id: string;
      status?: 'DRAFT' | 'REQUESTED';
      items: Array<{
        variant_id: string;
        requested_quantity: number;
        approved_quantity?: number;
        notes?: string;
      }>;
      notes?: string;
      idempotency_key?: string;
    },
    performed_by: string = 'system'
  ): Promise<{
    transfer: InventoryTransferRecord;
    items: InventoryTransferItemRecord[];
    events: InventoryTransferEventRecord[];
  }> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization ID is required.');
    }
    if (data.source_location_id === data.destination_location_id) {
      throw new Error('INVALID_TRANSFER: Source and destination locations must be different.');
    }
    if (!data.items || data.items.length === 0) {
      throw new Error('INVALID_TRANSFER: Transfer must contain at least one item.');
    }

    // Prevent duplicate variants within the same transfer
    const seenVariants = new Set<string>();
    for (const item of data.items) {
      if (seenVariants.has(item.variant_id)) {
        throw new Error(`INVALID_TRANSFER: Duplicate variant '${item.variant_id}' in transfer items.`);
      }
      seenVariants.add(item.variant_id);

      if (item.requested_quantity <= 0) {
        throw new Error('INVALID_QUANTITY: Requested quantity must be greater than zero.');
      }
    }

    // Idempotency check
    if (data.idempotency_key) {
      const existing = await this.transferRepo.findTransferByIdempotencyKey(organizationId, data.idempotency_key);
      if (existing) {
        const events = await this.transferRepo.getTransferEvents(organizationId, existing.transfer.id);
        return {
          transfer: existing.transfer,
          items: existing.items,
          events,
        };
      }
    }

    const transferId = `tr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const transferNumber = data.transfer_number || `TR-${Date.now().toString().slice(-6)}`;
    const initialStatus: TransferStatus = data.status === 'DRAFT' ? 'DRAFT' : 'REQUESTED';

    return this.db.withTransaction(async (tx) => {
      // 1. Verify tenant location boundaries
      const sourceValid = await this.inventoryRepo.verifyLocationOwnership(organizationId, data.source_location_id, tx);
      if (!sourceValid) {
        throw new Error('TENANT_ACCESS_DENIED: Source location does not belong to organization.');
      }
      const destValid = await this.inventoryRepo.verifyLocationOwnership(organizationId, data.destination_location_id, tx);
      if (!destValid) {
        throw new Error('TENANT_ACCESS_DENIED: Destination location does not belong to organization.');
      }

      // 2. Verify all variants belong to tenant
      for (const item of data.items) {
        const varValid = await this.inventoryRepo.verifyVariantOwnership(organizationId, item.variant_id, tx);
        if (!varValid) {
          throw new Error(`TENANT_ACCESS_DENIED: Variant '${item.variant_id}' does not belong to organization.`);
        }
      }

      // 3. Create transfer with items
      const created = await this.transferRepo.createTransferWithItems(
        organizationId,
        {
          id: transferId,
          transfer_number: transferNumber,
          source_location_id: data.source_location_id,
          destination_location_id: data.destination_location_id,
          status: initialStatus,
          requested_by: performed_by,
          idempotency_key: data.idempotency_key || null,
          notes: data.notes,
        },
        data.items.map((it) => ({
          id: `tri_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          variant_id: it.variant_id,
          requested_quantity: roundQty(it.requested_quantity),
          approved_quantity: it.approved_quantity !== undefined ? roundQty(it.approved_quantity) : roundQty(it.requested_quantity),
          notes: it.notes,
        })),
        tx
      );

      // 4. Record CREATED event in transfer event ledger
      const createdEvent = await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'CREATED',
          from_status: null,
          to_status: initialStatus,
          actor_id: performed_by,
          source_location_id: data.source_location_id,
          destination_location_id: data.destination_location_id,
          reference_type: 'inventory_transfer',
          reference_id: transferId,
          idempotency_key: data.idempotency_key || null,
          notes: `Created transfer ${transferNumber} with ${created.items.length} items.`,
        },
        tx
      );

      const events: InventoryTransferEventRecord[] = [createdEvent];

      // If initialStatus is REQUESTED, also record REQUESTED event
      if (initialStatus === 'REQUESTED') {
        const requestedEvent = await this.transferRepo.appendEvent(
          organizationId,
          {
            transfer_id: transferId,
            event_type: 'REQUESTED',
            from_status: 'DRAFT',
            to_status: 'REQUESTED',
            actor_id: performed_by,
            source_location_id: data.source_location_id,
            destination_location_id: data.destination_location_id,
            reference_type: 'inventory_transfer',
            reference_id: transferId,
            notes: `Transfer ${transferNumber} submitted for approval.`,
          },
          tx
        );
        events.push(requestedEvent);
      }

      return {
        transfer: created.transfer,
        items: created.items,
        events,
      };
    });
  }

  /**
   * Transitions a transfer from DRAFT to REQUESTED.
   */
  async requestTransfer(
    organizationId: string,
    transferId: string,
    performed_by: string = 'system',
    idempotencyKey?: string
  ): Promise<InventoryTransferRecord> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization ID is required.');
    }
    return this.db.withTransaction(async (tx) => {
      // Check idempotency
      if (idempotencyKey) {
        const existingEvent = await this.transferRepo.findEventByIdempotencyKey(organizationId, idempotencyKey, tx);
        if (existingEvent) {
          const existing = await this.transferRepo.findTransferById(organizationId, transferId, tx);
          if (existing) return existing.transfer;
        }
      }

      const lockedTransfer = await this.transferRepo.lockTransfer(organizationId, transferId, tx);
      if (!lockedTransfer) {
        throw new Error(`TRANSFER_NOT_FOUND: Transfer '${transferId}' not found.`);
      }

      if (lockedTransfer.status === 'REQUESTED') {
        return lockedTransfer; // Idempotent success
      }

      validateTransferTransition(lockedTransfer.status, 'REQUESTED');

      const updated = await this.transferRepo.updateTransferStatus(
        organizationId,
        transferId,
        { status: 'REQUESTED' },
        tx
      );

      await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'REQUESTED',
          from_status: lockedTransfer.status,
          to_status: 'REQUESTED',
          actor_id: performed_by,
          source_location_id: lockedTransfer.source_location_id,
          destination_location_id: lockedTransfer.destination_location_id,
          reference_type: 'inventory_transfer',
          reference_id: transferId,
          idempotency_key: idempotencyKey || null,
          notes: 'Transfer submitted for approval.',
        },
        tx
      );

      return updated!;
    });
  }

  /**
   * Approves a transfer request.
   * State Machine: strictly validates transition from current status to APPROVED (allowed only from REQUESTED).
   * Supports optional approved quantity adjustments per item.
   */
  async approveTransfer(
    organizationId: string,
    transferId: string,
    performed_by: string = 'system',
    itemApprovalsOrIdemp?: Array<{ itemId: string; approved_quantity: number }> | string,
    idempotencyKey?: string
  ): Promise<InventoryTransferRecord> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization ID is required.');
    }
    const itemApprovals = Array.isArray(itemApprovalsOrIdemp) ? itemApprovalsOrIdemp : undefined;
    const effectiveIdempKey = typeof itemApprovalsOrIdemp === 'string' ? itemApprovalsOrIdemp : idempotencyKey;

    return this.db.withTransaction(async (tx) => {
      // Idempotency check
      if (effectiveIdempKey) {
        const existingEvent = await this.transferRepo.findEventByIdempotencyKey(organizationId, effectiveIdempKey, tx);
        if (existingEvent) {
          const existing = await this.transferRepo.findTransferById(organizationId, transferId, tx);
          if (existing) return existing.transfer;
        }
      }

      const lockedTransfer = await this.transferRepo.lockTransfer(organizationId, transferId, tx);
      if (!lockedTransfer) {
        throw new Error(`TRANSFER_NOT_FOUND: Transfer '${transferId}' not found.`);
      }

      if (lockedTransfer.status === 'APPROVED') {
        return lockedTransfer; // Idempotent return
      }

      validateTransferTransition(lockedTransfer.status, 'APPROVED');

      // Update approved quantities if specified
      if (itemApprovals && itemApprovals.length > 0) {
        const lockedItems = await this.transferRepo.lockTransferItems(organizationId, transferId, tx);
        const itemMap = new Map(lockedItems.map((i) => [i.id, i]));

        for (const app of itemApprovals) {
          const it = itemMap.get(app.itemId);
          if (!it) {
            throw new Error(`ITEM_NOT_FOUND: Transfer item '${app.itemId}' not found in transfer.`);
          }
          if (app.approved_quantity < 0) {
            throw new Error('INVALID_QUANTITY: Approved quantity cannot be negative.');
          }
          await tx.query(
            'UPDATE inventory_transfer_items SET approved_quantity = $1 WHERE id = $2',
            [roundQty(app.approved_quantity), app.itemId]
          );
        }
      }

      const updated = await this.transferRepo.updateTransferStatus(
        organizationId,
        transferId,
        {
          status: 'APPROVED',
          approved_by: performed_by,
          approved_at: new Date().toISOString(),
        },
        tx
      );

      await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'APPROVED',
          from_status: lockedTransfer.status,
          to_status: 'APPROVED',
          actor_id: performed_by,
          source_location_id: lockedTransfer.source_location_id,
          destination_location_id: lockedTransfer.destination_location_id,
          reference_type: 'inventory_transfer',
          reference_id: transferId,
          idempotency_key: idempotencyKey || null,
          notes: `Transfer approved by ${performed_by}.`,
        },
        tx
      );

      return updated!;
    });
  }

  /**
   * Rejects a transfer request.
   * State Machine: strictly validates transition to REJECTED (allowed only from REQUESTED).
   */
  async rejectTransfer(
    organizationId: string,
    transferId: string,
    performed_by: string = 'system',
    reason: string = 'Transfer rejected',
    idempotencyKey?: string
  ): Promise<InventoryTransferRecord> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization ID is required.');
    }
    return this.db.withTransaction(async (tx) => {
      // Idempotency check
      if (idempotencyKey) {
        const existingEvent = await this.transferRepo.findEventByIdempotencyKey(organizationId, idempotencyKey, tx);
        if (existingEvent) {
          const existing = await this.transferRepo.findTransferById(organizationId, transferId, tx);
          if (existing) return existing.transfer;
        }
      }

      const lockedTransfer = await this.transferRepo.lockTransfer(organizationId, transferId, tx);
      if (!lockedTransfer) {
        throw new Error(`TRANSFER_NOT_FOUND: Transfer '${transferId}' not found.`);
      }

      if (lockedTransfer.status === 'REJECTED') {
        return lockedTransfer;
      }

      if (lockedTransfer.status !== 'REQUESTED') {
        throw new Error(
          `INVALID_TRANSFER_STATE: Cannot reject transfer in state '${lockedTransfer.status}'. Only 'REQUESTED' transfers can be rejected.`
        );
      }

      validateTransferTransition(lockedTransfer.status, 'REJECTED');

      const updated = await this.transferRepo.updateTransferStatus(
        organizationId,
        transferId,
        {
          status: 'REJECTED',
          notes: reason,
        },
        tx
      );

      await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'REJECTED',
          from_status: lockedTransfer.status,
          to_status: 'REJECTED',
          actor_id: performed_by,
          source_location_id: lockedTransfer.source_location_id,
          destination_location_id: lockedTransfer.destination_location_id,
          reference_type: 'inventory_transfer',
          reference_id: transferId,
          idempotency_key: idempotencyKey || null,
          reason,
          notes: `Transfer rejected: ${reason}`,
        },
        tx
      );

      return updated!;
    });
  }

  /**
   * Dispatches a transfer from the source location.
   * 
   * ACCOUNTING & CONSISTENCY RULES:
   * 1. State Machine: allows transition strictly from APPROVED to DISPATCHED.
   * 2. Available stock check: ensures source location available (on_hand - reserved - damaged - expired) >= dispatched.
   * 3. Source deduction: atomically deducts dispatched_quantity from source location on_hand via TRANSFER_OUT movement.
   * 4. In-transit accounting: atomically adds dispatched_quantity to destination location in_transit balance.
   * 5. Total company physical inventory is conserved: Source on_hand decreases, Destination in_transit increases.
   * 6. Both destination and source balances are locked FOR UPDATE scoped by organizationId.
   * 7. Event ledger: records DISPATCHED event and IN_TRANSIT ledger events.
   */
  async dispatchTransfer(
    organizationId: string,
    transferId: string,
    dispatchQuantities?: Array<{ itemId?: string; variant_id?: string; quantity: number }> | Record<string, number>,
    performed_by: string = 'system',
    idempotencyKey?: string
  ): Promise<InventoryTransferRecord & { items?: InventoryTransferItemRecord[]; events?: InventoryTransferEventRecord[] }> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization ID is required.');
    }
    return this.db.withTransaction(async (tx) => {
      // Idempotency check
      if (idempotencyKey) {
        const existingEvent = await this.transferRepo.findEventByIdempotencyKey(organizationId, idempotencyKey, tx);
        if (existingEvent) {
          const existing = await this.transferRepo.findTransferById(organizationId, transferId, tx);
          if (existing) {
            return Object.assign({}, existing.transfer, {
              items: existing.items,
              events: existing.events,
            });
          }
        }
      }

      const lockedTransfer = await this.transferRepo.lockTransfer(organizationId, transferId, tx);
      if (!lockedTransfer) {
        throw new Error(`TRANSFER_NOT_FOUND: Transfer '${transferId}' not found.`);
      }

      // If already dispatched or in-transit, return idempotently
      if (lockedTransfer.status === 'DISPATCHED' || lockedTransfer.status === 'IN_TRANSIT') {
        const existing = await this.transferRepo.findTransferById(organizationId, transferId, tx);
        return Object.assign({}, lockedTransfer, {
          items: existing?.items,
          events: existing?.events,
        });
      }

      validateTransferTransition(lockedTransfer.status, 'DISPATCHED');

      const lockedItems = await this.transferRepo.lockTransferItems(organizationId, transferId, tx);

      const getQtyToDispatch = (item: InventoryTransferItemRecord): number => {
        if (!dispatchQuantities) {
          return roundQty(item.approved_quantity || item.requested_quantity);
        }
        if (Array.isArray(dispatchQuantities)) {
          const found = dispatchQuantities.find(
            (d) => (d.itemId && d.itemId === item.id) || (d.variant_id && d.variant_id === item.variant_id)
          );
          if (found !== undefined) {
            return roundQty(found.quantity);
          }
          return roundQty(item.approved_quantity || item.requested_quantity);
        }
        if (typeof dispatchQuantities === 'object') {
          if (dispatchQuantities[item.id] !== undefined) {
            return roundQty(dispatchQuantities[item.id]);
          }
          if (dispatchQuantities[item.variant_id] !== undefined) {
            return roundQty(dispatchQuantities[item.variant_id]);
          }
        }
        return roundQty(item.approved_quantity || item.requested_quantity);
      };

      // Preliminary validation: verify cannot exceed approved quantity on any item
      for (const item of lockedItems) {
        const qtyToDispatch = getQtyToDispatch(item);
        const maxAllowed = roundQty(item.approved_quantity || item.requested_quantity);
        if (qtyToDispatch > maxAllowed) {
          throw new Error(
            `INVALID_QUANTITY: Dispatched quantity (${qtyToDispatch}) cannot exceed approved quantity (${maxAllowed}) for variant '${item.variant_id}'.`
          );
        }
        if (qtyToDispatch <= 0) {
          throw new Error(`INVALID_QUANTITY: Dispatched quantity must be greater than zero for variant '${item.variant_id}'.`);
        }
      }

      let totalDispatched = 0;

      for (const item of lockedItems) {
        const qtyToDispatch = getQtyToDispatch(item);
        totalDispatched = addQty(totalDispatched, qtyToDispatch);

        // Verify source stock availability
        const sourceBal = await this.inventoryRepo.getBalance(
          lockedTransfer.source_location_id,
          item.variant_id,
          organizationId,
          tx
        );
        const currentOnHand = sourceBal ? roundQty(sourceBal.on_hand) : 0;
        const currentReserved = sourceBal ? roundQty(sourceBal.reserved) : 0;
        const currentDamaged = sourceBal ? roundQty(sourceBal.damaged) : 0;
        const currentExpired = sourceBal ? roundQty(sourceBal.expired) : 0;
        const available = calculateAvailable(currentOnHand, currentReserved, currentDamaged, currentExpired);

        if (available < qtyToDispatch) {
          throw new Error(
            `INSUFFICIENT_STOCK_FOR_DISPATCH: Location '${lockedTransfer.source_location_id}' has ${available} available unreserved units of variant '${item.variant_id}', but ${qtyToDispatch} was requested for dispatch.`
          );
        }

        // 1. Record physical deduction at source location (TRANSFER_OUT)
        await this.inventoryRepo.recordMovement(
          {
            id: `mov_tout_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            organization_id: organizationId,
            location_id: lockedTransfer.source_location_id,
            variant_id: item.variant_id,
            movement_type: 'TRANSFER_OUT',
            quantity_change: -qtyToDispatch,
            reference_type: 'inventory_transfer',
            reference_id: transferId,
            source_location_id: lockedTransfer.source_location_id,
            destination_location_id: lockedTransfer.destination_location_id,
            performed_by,
            notes: `Dispatched ${qtyToDispatch} units for transfer ${lockedTransfer.transfer_number}.`,
          },
          tx
        );

        // 2. Ensure destination balance exists
        const destBalanceId = `bal_${lockedTransfer.destination_location_id}_${item.variant_id}`;
        await tx.query(
          `INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired, in_transit)
           VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0)
           ON CONFLICT (location_id, variant_id) DO NOTHING`,
          [destBalanceId, organizationId, lockedTransfer.destination_location_id, item.variant_id]
        );

        // 3. Acquire pessimistic row lock on destination balance scoped by organizationId
        const lockedDestBal = await tx.query(
          `SELECT id, organization_id, location_id, variant_id, in_transit::text
           FROM inventory_balances
           WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3
           FOR UPDATE`,
          [organizationId, lockedTransfer.destination_location_id, item.variant_id]
        );

        if (lockedDestBal.rows.length === 0) {
          throw new Error(
            `BALANCE_NOT_FOUND: Failed to lock destination balance for variant '${item.variant_id}' at '${lockedTransfer.destination_location_id}'.`
          );
        }

        const currentInTransit = roundQty(lockedDestBal.rows[0].in_transit);
        const newInTransit = roundQty(addQty(currentInTransit, qtyToDispatch));

        // 4. Update in_transit balance at destination
        await tx.query(
          `UPDATE inventory_balances
           SET in_transit = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND organization_id = $3`,
          [newInTransit, lockedDestBal.rows[0].id, organizationId]
        );

        // 5. Update transfer line item dispatched_quantity
        await this.transferRepo.updateItemDispatched(organizationId, item.id, qtyToDispatch, tx);
      }

      // Update transfer status to DISPATCHED
      const updated = await this.transferRepo.updateTransferStatus(
        organizationId,
        transferId,
        {
          status: 'DISPATCHED',
          dispatched_by: performed_by,
          dispatched_at: new Date().toISOString(),
        },
        tx
      );

      // Append DISPATCHED event
      await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'DISPATCHED',
          from_status: lockedTransfer.status,
          to_status: 'DISPATCHED',
          quantity: totalDispatched,
          actor_id: performed_by,
          source_location_id: lockedTransfer.source_location_id,
          destination_location_id: lockedTransfer.destination_location_id,
          reference_type: 'inventory_transfer',
          reference_id: transferId,
          idempotency_key: idempotencyKey || null,
          notes: `Transfer dispatched by ${performed_by}. Total quantity: ${totalDispatched}.`,
        },
        tx
      );

      // Append IN_TRANSIT event to complete transit record
      await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'IN_TRANSIT',
          from_status: 'DISPATCHED',
          to_status: 'IN_TRANSIT',
          quantity: totalDispatched,
          actor_id: performed_by,
          source_location_id: lockedTransfer.source_location_id,
          destination_location_id: lockedTransfer.destination_location_id,
          reference_type: 'inventory_transfer',
          reference_id: transferId,
          notes: `Transfer in-transit to destination location.`,
        },
        tx
      );

      const itemsAfter = await this.transferRepo.getTransferItems(organizationId, transferId, tx);
      const eventsAfter = await this.transferRepo.getTransferEvents(organizationId, transferId, tx);

      return Object.assign({}, updated!, {
        items: itemsAfter,
        events: eventsAfter,
      });
    });
  }

  /**
   * Explicitly marks a dispatched transfer as IN_TRANSIT.
   * State Machine: validates transition from DISPATCHED to IN_TRANSIT.
   */
  async markInTransit(
    organizationId: string,
    transferId: string,
    performed_by: string = 'system',
    idempotencyKey?: string
  ): Promise<InventoryTransferRecord> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization ID is required.');
    }
    return this.db.withTransaction(async (tx) => {
      // Idempotency check
      if (idempotencyKey) {
        const existingEvent = await this.transferRepo.findEventByIdempotencyKey(organizationId, idempotencyKey, tx);
        if (existingEvent) {
          const existing = await this.transferRepo.findTransferById(organizationId, transferId, tx);
          if (existing) return existing.transfer;
        }
      }

      const lockedTransfer = await this.transferRepo.lockTransfer(organizationId, transferId, tx);
      if (!lockedTransfer) {
        throw new Error(`TRANSFER_NOT_FOUND: Transfer '${transferId}' not found.`);
      }

      if (lockedTransfer.status === 'IN_TRANSIT') {
        return lockedTransfer;
      }

      validateTransferTransition(lockedTransfer.status, 'IN_TRANSIT');

      const updated = await this.transferRepo.updateTransferStatus(
        organizationId,
        transferId,
        { status: 'IN_TRANSIT' },
        tx
      );

      await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'IN_TRANSIT',
          from_status: lockedTransfer.status,
          to_status: 'IN_TRANSIT',
          actor_id: performed_by,
          source_location_id: lockedTransfer.source_location_id,
          destination_location_id: lockedTransfer.destination_location_id,
          reference_type: 'inventory_transfer',
          reference_id: transferId,
          idempotency_key: idempotencyKey || null,
          notes: `Transfer marked in-transit by ${performed_by}.`,
        },
        tx
      );

      return updated!;
    });
  }

  /**
   * Receives transfer items at the destination location.
   * 
   * ACCOUNTING & CONSISTENCY RULES:
   * 1. State Machine: allows transition from DISPATCHED or IN_TRANSIT to RECEIVED.
   * 2. In-transit verification: asserts that destination in_transit >= dispatched_quantity before decrementing.
   * 3. In-transit deduction: decrements destination in_transit by dispatched_quantity.
   * 4. Physical addition: increments destination on_hand by received_quantity via TRANSFER_IN movement.
   * 5. Over-receipt policy:
   *    - Over-receipt without options.allowOverReceive = true is strictly prohibited (OVER_RECEIPT_PROHIBITED).
   *    - Over-receipt requires options.authorizedBy supervisor credential (OVER_RECEIPT_UNAUTHORIZED).
   *    - Over-receipt records explicit VARIANCE_RECORDED event with authorized_by and reason.
   * 6. Variance handling:
   *    - variance_quantity = received_quantity - dispatched_quantity.
   *    - If variance != 0, records VARIANCE_RECORDED event in immutable event ledger.
   * 7. Completion: updates transfer status to COMPLETED (or RECEIVED then COMPLETED).
   */
  async receiveTransfer(
    organizationId: string,
    transferId: string,
    receipts?: Array<{ itemId?: string; variant_id?: string; received_quantity?: number; quantity?: number; notes?: string }> | Record<string, number>,
    performed_by: string = 'system',
    arg5?: string | { idempotencyKey?: string; allowOverReceive?: boolean; authorizedBy?: string; reason?: string },
    arg6?: { idempotencyKey?: string; allowOverReceive?: boolean; authorizedBy?: string; reason?: string }
  ): Promise<InventoryTransferRecord & { transfer: InventoryTransferRecord; items: InventoryTransferItemRecord[]; events: InventoryTransferEventRecord[] }> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization ID is required.');
    }

    const options = (typeof arg6 === 'object' && arg6 !== null)
      ? arg6
      : (typeof arg5 === 'object' && arg5 !== null)
        ? arg5
        : {};
    const idempotencyKey = typeof arg5 === 'string' ? arg5 : options.idempotencyKey;

    return this.db.withTransaction(async (tx) => {
      // Idempotency check
      if (idempotencyKey) {
        const existingEvent = await this.transferRepo.findEventByIdempotencyKey(organizationId, idempotencyKey, tx);
        if (existingEvent) {
          const existing = await this.transferRepo.findTransferById(organizationId, transferId, tx);
          if (existing) {
            return Object.assign({}, existing.transfer, {
              transfer: existing.transfer,
              items: existing.items,
              events: existing.events,
            });
          }
        }
      }

      const lockedTransfer = await this.transferRepo.lockTransfer(organizationId, transferId, tx);
      if (!lockedTransfer) {
        throw new Error(`TRANSFER_NOT_FOUND: Transfer '${transferId}' not found.`);
      }

      // If already completed, return existing
      if (lockedTransfer.status === 'COMPLETED') {
        const existing = await this.transferRepo.findTransferById(organizationId, transferId, tx);
        return Object.assign({}, existing!.transfer, {
          transfer: existing!.transfer,
          items: existing!.items,
          events: existing!.events,
        });
      }

      validateTransferTransition(lockedTransfer.status, 'RECEIVED');

      const lockedItems = await this.transferRepo.lockTransferItems(organizationId, transferId, tx);

      const getReceiptInfo = (item: InventoryTransferItemRecord): { receivedQty: number; notes?: string } => {
        if (!receipts) {
          return { receivedQty: roundQty(item.dispatched_quantity) };
        }
        if (Array.isArray(receipts)) {
          const found = receipts.find(
            (r) => (r.itemId && r.itemId === item.id) || (r.variant_id && r.variant_id === item.variant_id)
          );
          if (found !== undefined) {
            const q = found.received_quantity !== undefined ? found.received_quantity : found.quantity;
            return { receivedQty: roundQty(q ?? item.dispatched_quantity), notes: found.notes };
          }
          return { receivedQty: roundQty(item.dispatched_quantity) };
        }
        if (typeof receipts === 'object') {
          if (receipts[item.id] !== undefined) {
            return { receivedQty: roundQty(receipts[item.id]) };
          }
          if (receipts[item.variant_id] !== undefined) {
            return { receivedQty: roundQty(receipts[item.variant_id]) };
          }
        }
        return { receivedQty: roundQty(item.dispatched_quantity) };
      };

      let hasVariance = false;
      const updatedItems: InventoryTransferItemRecord[] = [];
      const appendedEvents: InventoryTransferEventRecord[] = [];

      for (const item of lockedItems) {
        const { receivedQty, notes } = getReceiptInfo(item);

        if (receivedQty < 0) {
          throw new Error(`INVALID_QUANTITY: Received quantity cannot be negative for item '${item.id}'.`);
        }

        const dispatchedQty = roundQty(item.dispatched_quantity);
        const varianceQty = roundQty(subQty(receivedQty, dispatchedQty));

        // Over-receipt policy enforcement
        if (receivedQty > dispatchedQty) {
          if (!options.allowOverReceive) {
            throw new Error(
              `OVER_RECEIPT_PROHIBITED: Over-receiving is not permitted. Received quantity (${receivedQty}) exceeds dispatched quantity (${dispatchedQty}) for variant '${item.variant_id}'. Over-receipt requires supervisor authorization.`
            );
          }
          if (!options.authorizedBy || typeof options.authorizedBy !== 'string' || options.authorizedBy.trim() === '') {
            throw new Error(
              `OVER_RECEIPT_UNAUTHORIZED: Explicit supervisor authorization (options.authorizedBy) is required for over-receiving stock.`
            );
          }
        }

        // 1. Lock destination balance row scoped by organizationId
        const lockedDestBal = await tx.query(
          `SELECT id, organization_id, location_id, variant_id, in_transit::text, on_hand::text
           FROM inventory_balances
           WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3
           FOR UPDATE`,
          [organizationId, lockedTransfer.destination_location_id, item.variant_id]
        );

        if (lockedDestBal.rows.length === 0) {
          throw new Error(
            `BALANCE_NOT_FOUND: Destination balance row not found for variant '${item.variant_id}'.`
          );
        }

        const currentInTransit = roundQty(lockedDestBal.rows[0].in_transit);

        // 2. Validate in_transit balance
        if (currentInTransit < dispatchedQty) {
          throw new Error(
            `INSUFFICIENT_IN_TRANSIT: In-transit balance (${currentInTransit}) is less than dispatched quantity (${dispatchedQty}) for variant '${item.variant_id}'.`
          );
        }

        // 3. Deduct dispatched_quantity from in_transit
        const newInTransit = roundQty(subQty(currentInTransit, dispatchedQty));
        await tx.query(
          `UPDATE inventory_balances
           SET in_transit = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND organization_id = $3`,
          [newInTransit, lockedDestBal.rows[0].id, organizationId]
        );

        // 4. Physical receipt: increment on_hand by receivedQty via TRANSFER_IN movement
        if (receivedQty > 0) {
          await this.inventoryRepo.recordMovement(
            {
              id: `mov_tin_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
              organization_id: organizationId,
              location_id: lockedTransfer.destination_location_id,
              variant_id: item.variant_id,
              movement_type: 'TRANSFER_IN',
              quantity_change: receivedQty,
              reference_type: 'inventory_transfer',
              reference_id: transferId,
              source_location_id: lockedTransfer.source_location_id,
              destination_location_id: lockedTransfer.destination_location_id,
              performed_by,
              notes: `Received ${receivedQty} units (dispatched: ${dispatchedQty}, variance: ${varianceQty}) for transfer ${lockedTransfer.transfer_number}.`,
            },
            tx
          );
        }

        // 5. Update transfer item
        const updatedItem = await this.transferRepo.updateItemReceived(
          organizationId,
          item.id,
          receivedQty,
          varianceQty,
          tx
        );
        updatedItems.push(updatedItem!);

        // 6. Record variance event if applicable
        if (varianceQty !== 0) {
          hasVariance = true;
          const varEvent = await this.transferRepo.appendEvent(
            organizationId,
            {
              transfer_id: transferId,
              transfer_item_id: item.id,
              event_type: 'VARIANCE_RECORDED',
              from_status: lockedTransfer.status,
              to_status: 'RECEIVED',
              quantity: varianceQty,
              actor_id: performed_by,
              source_location_id: lockedTransfer.source_location_id,
              destination_location_id: lockedTransfer.destination_location_id,
              reference_type: 'inventory_transfer',
              reference_id: transferId,
              reason: options.reason || (varianceQty > 0 ? 'Over-receipt approved' : 'Short receipt at destination'),
              notes: notes || (varianceQty > 0 ? `Over-receipt of +${varianceQty} authorized by ${options.authorizedBy}` : `Shortage of ${varianceQty}`),
              metadata: {
                variant_id: item.variant_id,
                dispatched_quantity: dispatchedQty,
                received_quantity: receivedQty,
                variance_quantity: varianceQty,
                authorized_by: options.authorizedBy || null,
              },
            },
            tx
          );
          appendedEvents.push(varEvent);
        }
      }

      // Record RECEIVED event
      const receivedEvent = await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'RECEIVED',
          from_status: lockedTransfer.status,
          to_status: 'RECEIVED',
          actor_id: performed_by,
          source_location_id: lockedTransfer.source_location_id,
          destination_location_id: lockedTransfer.destination_location_id,
          reference_type: 'inventory_transfer',
          reference_id: transferId,
          idempotency_key: idempotencyKey || null,
          notes: `Transfer items received by ${performed_by}. Has variance: ${hasVariance}`,
        },
        tx
      );
      appendedEvents.push(receivedEvent);

      // Transition to COMPLETED
      validateTransferTransition('RECEIVED', 'COMPLETED');

      const completedTransfer = await this.transferRepo.updateTransferStatus(
        organizationId,
        transferId,
        {
          status: 'COMPLETED',
          received_by: performed_by,
          received_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
        tx
      );

      const completedEvent = await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'COMPLETED',
          from_status: 'RECEIVED',
          to_status: 'COMPLETED',
          actor_id: performed_by,
          source_location_id: lockedTransfer.source_location_id,
          destination_location_id: lockedTransfer.destination_location_id,
          reference_type: 'inventory_transfer',
          reference_id: transferId,
          notes: `Transfer marked COMPLETED. Final status achieved.`,
        },
        tx
      );
      appendedEvents.push(completedEvent);

      const allEvents = await this.transferRepo.getTransferEvents(organizationId, transferId, tx);

      const response = Object.assign({}, completedTransfer!, {
        transfer: completedTransfer!,
        items: updatedItems,
        events: allEvents,
      });

      return response;
    });
  }

  /**
   * Cancels a transfer request.
   * State Machine: only transfers in DRAFT, REQUESTED, or APPROVED status can be cancelled.
   * Dispatched, in-transit, received, or completed transfers cannot be cancelled.
   */
  async cancelTransfer(
    organizationId: string,
    transferId: string,
    performed_by: string = 'system',
    reason: string = 'Transfer cancelled',
    idempotencyKey?: string
  ): Promise<InventoryTransferRecord> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization ID is required.');
    }
    return this.db.withTransaction(async (tx) => {
      // Idempotency check
      if (idempotencyKey) {
        const existingEvent = await this.transferRepo.findEventByIdempotencyKey(organizationId, idempotencyKey, tx);
        if (existingEvent) {
          const existing = await this.transferRepo.findTransferById(organizationId, transferId, tx);
          if (existing) return existing.transfer;
        }
      }

      const lockedTransfer = await this.transferRepo.lockTransfer(organizationId, transferId, tx);
      if (!lockedTransfer) {
        throw new Error(`TRANSFER_NOT_FOUND: Transfer '${transferId}' not found.`);
      }

      if (lockedTransfer.status === 'CANCELLED') {
        return lockedTransfer;
      }

      if (['DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'COMPLETED'].includes(lockedTransfer.status)) {
        throw new Error(
          `INVALID_TRANSFER_STATE: Dispatched transfers cannot be cancelled. Transfer '${transferId}' is in status '${lockedTransfer.status}'.`
        );
      }

      validateTransferTransition(lockedTransfer.status, 'CANCELLED');

      const updated = await this.transferRepo.updateTransferStatus(
        organizationId,
        transferId,
        {
          status: 'CANCELLED',
          notes: reason,
        },
        tx
      );

      await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'CANCELLED',
          from_status: lockedTransfer.status,
          to_status: 'CANCELLED',
          actor_id: performed_by,
          source_location_id: lockedTransfer.source_location_id,
          destination_location_id: lockedTransfer.destination_location_id,
          reference_type: 'inventory_transfer',
          reference_id: transferId,
          idempotency_key: idempotencyKey || null,
          reason,
          notes: `Transfer cancelled: ${reason}`,
        },
        tx
      );

      return updated!;
    });
  }

  /**
   * Retrieves transfer aggregate, items, and event history.
   */
  async getTransfer(
    organizationId: string,
    transferId: string
  ): Promise<{
    transfer: InventoryTransferRecord;
    items: InventoryTransferItemRecord[];
    events: InventoryTransferEventRecord[];
  } | null> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization ID is required.');
    }
    return this.transferRepo.findTransferById(organizationId, transferId);
  }

  /**
   * Retrieves immutable event ledger for a transfer.
   */
  async getTransferEvents(
    organizationId: string,
    transferId: string
  ): Promise<InventoryTransferEventRecord[]> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization ID is required.');
    }
    return this.transferRepo.getTransferEvents(organizationId, transferId);
  }

  /**
   * Lists transfers for the organization with optional filters.
   */
  async listTransfers(
    organizationId: string,
    options: {
      sourceLocationId?: string;
      destinationLocationId?: string;
      status?: TransferStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<InventoryTransferRecord[]> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Organization ID is required.');
    }
    return this.transferRepo.listTransfers(organizationId, options);
  }
}
