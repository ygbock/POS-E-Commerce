import { DatabaseClient, getDatabaseClient } from '../db/client';
import { InventoryRepository } from '../repositories/inventoryRepository';
import { InventoryTransferRepository } from '../repositories/inventoryTransferRepository';
import {
  InventoryTransferRecord,
  InventoryTransferItemRecord,
  InventoryTransferEventRecord,
  TransferStatus,
} from './inventoryTypes';
import { roundQty, addQty, subQty, calculateAvailable } from './inventoryPolicies';

/**
 * Stock Transfer Domain Service (INV-001)
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
    performed_by: string
  ): Promise<{
    transfer: InventoryTransferRecord;
    items: InventoryTransferItemRecord[];
    events: InventoryTransferEventRecord[];
  }> {
    if (!organizationId) {
      throw new Error('TENANT_ACCESS_DENIED: Organization ID is required.');
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
    performed_by: string,
    idempotencyKey?: string
  ): Promise<InventoryTransferRecord> {
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
        return lockedTransfer;
      }
      if (lockedTransfer.status !== 'DRAFT') {
        throw new Error(`INVALID_TRANSFER_STATE: Cannot request transfer in state '${lockedTransfer.status}'.`);
      }

      const updated = await this.transferRepo.updateTransferStatus(
        organizationId,
        transferId,
        {
          status: 'REQUESTED',
          notes: lockedTransfer.notes || undefined,
        },
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
          idempotency_key: idempotencyKey || null,
          notes: `Transfer ${lockedTransfer.transfer_number} submitted for approval.`,
        },
        tx
      );

      return updated!;
    });
  }

  /**
   * Approves a transfer request.
   */
  async approveTransfer(
    organizationId: string,
    transferId: string,
    performed_by: string,
    idempotencyKey?: string
  ): Promise<InventoryTransferRecord> {
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

      if (lockedTransfer.status === 'APPROVED') {
        // Safe duplicate approval replay
        return lockedTransfer;
      }
      if (lockedTransfer.status !== 'REQUESTED' && lockedTransfer.status !== 'DRAFT') {
        throw new Error(`INVALID_TRANSFER_STATE: Cannot approve transfer in state '${lockedTransfer.status}'.`);
      }

      const approvedAt = new Date().toISOString();
      const updated = await this.transferRepo.updateTransferStatus(
        organizationId,
        transferId,
        {
          status: 'APPROVED',
          approved_by: performed_by,
          approved_at: approvedAt,
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
   */
  async rejectTransfer(
    organizationId: string,
    transferId: string,
    performed_by: string,
    reason?: string,
    idempotencyKey?: string
  ): Promise<InventoryTransferRecord> {
    return this.db.withTransaction(async (tx) => {
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
      if (lockedTransfer.status !== 'REQUESTED' && lockedTransfer.status !== 'DRAFT') {
        throw new Error(`INVALID_TRANSFER_STATE: Cannot reject transfer in state '${lockedTransfer.status}'.`);
      }

      const updated = await this.transferRepo.updateTransferStatus(
        organizationId,
        transferId,
        {
          status: 'REJECTED',
          notes: reason ? `Rejected: ${reason}` : 'Transfer rejected',
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
          idempotency_key: idempotencyKey || null,
          reason: reason || null,
          notes: reason ? `Rejected: ${reason}` : 'Transfer rejected',
        },
        tx
      );

      return updated!;
    });
  }

  /**
   * Executes atomic dispatch as one single database transaction:
   * 1. Lock transfer FOR UPDATE, verify organization & APPROVED status
   * 2. Lock transfer items FOR UPDATE
   * 3. Verify source and destination location ownership
   * 4. Verify variants belong to organization
   * 5. Lock source inventory balances FOR UPDATE & verify sufficient available inventory
   * 6. Calculate dispatched quantities (enforce dispatched <= approved)
   * 7. Create TRANSFER_OUT inventory movement(s) at source
   * 8. Decrease source on_hand
   * 9. Increase destination in_transit
   * 10. Update transfer item dispatched_quantity
   * 11. Create DISPATCHED and IN_TRANSIT events
   * 12. Update transfer status
   */
  async dispatchTransfer(
    organizationId: string,
    transferId: string,
    dispatchedItemsMap: Record<string, number> | undefined,
    performed_by: string,
    idempotencyKey?: string
  ): Promise<InventoryTransferRecord> {
    return this.db.withTransaction(async (tx) => {
      // Idempotency check
      if (idempotencyKey) {
        const existingEvent = await this.transferRepo.findEventByIdempotencyKey(organizationId, idempotencyKey, tx);
        if (existingEvent) {
          const existing = await this.transferRepo.findTransferById(organizationId, transferId, tx);
          if (existing) return existing.transfer;
        }
      }

      // 1. Lock transfer FOR UPDATE
      const transfer = await this.transferRepo.lockTransfer(organizationId, transferId, tx);
      if (!transfer) {
        throw new Error(`TRANSFER_NOT_FOUND: Transfer '${transferId}' not found.`);
      }

      if (transfer.status === 'DISPATCHED' || transfer.status === 'IN_TRANSIT') {
        if (idempotencyKey) {
          return transfer;
        }
        throw new Error(`DUPLICATE_OPERATION: Transfer '${transferId}' has already been dispatched.`);
      }

      if (transfer.status !== 'APPROVED') {
        throw new Error(`INVALID_TRANSFER_STATE: Cannot dispatch transfer in state '${transfer.status}', expected 'APPROVED'.`);
      }

      // 2. Lock transfer items FOR UPDATE
      const items = await this.transferRepo.lockTransferItems(organizationId, transferId, tx);
      if (items.length === 0) {
        throw new Error(`INVALID_TRANSFER: Transfer '${transferId}' has no items.`);
      }

      // 3. Verify source and destination location ownership
      const sourceValid = await this.inventoryRepo.verifyLocationOwnership(organizationId, transfer.source_location_id, tx);
      if (!sourceValid) {
        throw new Error('TENANT_ACCESS_DENIED: Source location does not belong to organization.');
      }
      const destValid = await this.inventoryRepo.verifyLocationOwnership(organizationId, transfer.destination_location_id, tx);
      if (!destValid) {
        throw new Error('TENANT_ACCESS_DENIED: Destination location does not belong to organization.');
      }

      // 4. Verify variants belong to organization
      for (const item of items) {
        const varValid = await this.inventoryRepo.verifyVariantOwnership(organizationId, item.variant_id, tx);
        if (!varValid) {
          throw new Error(`TENANT_ACCESS_DENIED: Variant '${item.variant_id}' does not belong to organization.`);
        }
      }

      // 5. Pre-validate quantities and lock source balances
      const dispatchCalculations: Array<{
        item: InventoryTransferItemRecord;
        qtyToDispatch: number;
      }> = [];

      for (const item of items) {
        const qtyToDispatch = dispatchedItemsMap && dispatchedItemsMap[item.variant_id] !== undefined
          ? roundQty(dispatchedItemsMap[item.variant_id])
          : item.approved_quantity;

        if (qtyToDispatch < 0) {
          throw new Error(`INVALID_QUANTITY: Dispatched quantity (${qtyToDispatch}) cannot be negative.`);
        }
        if (qtyToDispatch > item.approved_quantity) {
          throw new Error(
            `INVALID_QUANTITY: Dispatched quantity (${qtyToDispatch}) cannot exceed approved quantity (${item.approved_quantity}) for variant '${item.variant_id}'.`
          );
        }

        // Lock source balance FOR UPDATE to verify available stock
        const sourceBal = await this.inventoryRepo.lockBalance(organizationId, transfer.source_location_id, item.variant_id, tx);
        if (!sourceBal) {
          throw new Error(
            `INSUFFICIENT_STOCK: No stock balance found for variant '${item.variant_id}' at source location '${transfer.source_location_id}'.`
          );
        }

        const available = calculateAvailable(
          sourceBal.on_hand,
          sourceBal.reserved,
          sourceBal.damaged,
          sourceBal.expired
        );

        if (qtyToDispatch > available) {
          throw new Error(
            `INSUFFICIENT_STOCK: Insufficient available stock for variant '${item.variant_id}' at source location '${transfer.source_location_id}'. Available: ${available}, requested dispatch: ${qtyToDispatch}.`
          );
        }

        dispatchCalculations.push({ item, qtyToDispatch });
      }

      // 6. Execute physical mutations & ledger recordings
      for (const calc of dispatchCalculations) {
        const { item, qtyToDispatch } = calc;

        // Update transfer item dispatched quantity
        await this.transferRepo.updateItemDispatched(organizationId, item.id, qtyToDispatch, tx);

        if (qtyToDispatch > 0) {
          // Deduct from source on_hand and record TRANSFER_OUT movement
          await this.inventoryRepo.recordMovement(
            {
              id: `mov_tout_${transfer.id}_${item.variant_id}_${Date.now()}`,
              organization_id: organizationId,
              location_id: transfer.source_location_id,
              variant_id: item.variant_id,
              movement_type: 'TRANSFER_OUT',
              quantity_change: -qtyToDispatch,
              reference_type: 'inventory_transfer',
              reference_id: transfer.id,
              source_location_id: transfer.source_location_id,
              destination_location_id: transfer.destination_location_id,
              performed_by,
              notes: `Dispatched transfer ${transfer.transfer_number}`,
            },
            tx
          );

          // Ensure destination balance row exists
          const destBalanceId = `bal_${transfer.destination_location_id}_${item.variant_id}`;
          await tx.query(
            `INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired, in_transit)
             VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0)
             ON CONFLICT (location_id, variant_id) DO NOTHING`,
            [destBalanceId, organizationId, transfer.destination_location_id, item.variant_id]
          );

          // Lock destination balance and increase in_transit
          const lockedDest = await tx.query<{ id: string; in_transit: number }>(
            `SELECT id, in_transit::float
             FROM inventory_balances
             WHERE location_id = $1 AND variant_id = $2 AND organization_id = $3
             FOR UPDATE`,
            [transfer.destination_location_id, item.variant_id, organizationId]
          );

          const currentInTransit = roundQty(Number(lockedDest.rows[0].in_transit));
          const newInTransit = roundQty(addQty(currentInTransit, qtyToDispatch));

          await tx.query(
            `UPDATE inventory_balances
             SET in_transit = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [newInTransit, lockedDest.rows[0].id]
          );
        }
      }

      // 7. Append DISPATCHED and IN_TRANSIT events
      const totalDispatched = dispatchCalculations.reduce((sum, c) => addQty(sum, c.qtyToDispatch), 0);
      await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'DISPATCHED',
          from_status: 'APPROVED',
          to_status: 'DISPATCHED',
          quantity: totalDispatched,
          actor_id: performed_by,
          source_location_id: transfer.source_location_id,
          destination_location_id: transfer.destination_location_id,
          idempotency_key: idempotencyKey || null,
          notes: `Dispatched ${totalDispatched} total units across ${dispatchCalculations.length} items.`,
        },
        tx
      );

      await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'IN_TRANSIT',
          from_status: 'DISPATCHED',
          to_status: 'IN_TRANSIT',
          quantity: totalDispatched,
          actor_id: performed_by,
          source_location_id: transfer.source_location_id,
          destination_location_id: transfer.destination_location_id,
          notes: `Transfer ${transfer.transfer_number} stock in transit.`,
        },
        tx
      );

      // 8. Update transfer status
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

      return updated!;
    });
  }

  /**
   * Executes atomic receipt as one single database transaction:
   * 1. Lock transfer FOR UPDATE, verify organization & receivable status (DISPATCHED or IN_TRANSIT)
   * 2. Lock transfer items FOR UPDATE
   * 3. Validate received quantities (enforce non-negative; enforce received <= dispatched unless allowOverReceive)
   * 4. Lock destination inventory balances FOR UPDATE
   * 5. Decrease destination in_transit
   * 6. Increase destination on_hand and record TRANSFER_IN movement(s)
   * 7. Update transfer item received_quantity and variance_quantity (variance = received - dispatched)
   * 8. Create RECEIVED event
   * 9. If variance != 0, create VARIANCE_RECORDED event(s)
   * 10. Update transfer status to COMPLETED and create COMPLETED event
   */
  async receiveTransfer(
    organizationId: string,
    transferId: string,
    receivedItemsMap: Record<string, number>,
    performed_by: string,
    idempotencyKey?: string,
    options?: { allowOverReceive?: boolean }
  ): Promise<InventoryTransferRecord> {
    return this.db.withTransaction(async (tx) => {
      // Idempotency check
      if (idempotencyKey) {
        const existingEvent = await this.transferRepo.findEventByIdempotencyKey(organizationId, idempotencyKey, tx);
        if (existingEvent) {
          const existing = await this.transferRepo.findTransferById(organizationId, transferId, tx);
          if (existing) return existing.transfer;
        }
      }

      // 1. Lock transfer FOR UPDATE
      const transfer = await this.transferRepo.lockTransfer(organizationId, transferId, tx);
      if (!transfer) {
        throw new Error(`TRANSFER_NOT_FOUND: Transfer '${transferId}' not found.`);
      }

      if (transfer.status === 'COMPLETED') {
        if (idempotencyKey) {
          return transfer;
        }
        throw new Error(`TRANSFER_ALREADY_RECEIVED: Transfer '${transferId}' has already been received and completed.`);
      }

      if (transfer.status !== 'DISPATCHED' && transfer.status !== 'IN_TRANSIT') {
        throw new Error(
          `INVALID_TRANSFER_STATE: Cannot receive transfer in state '${transfer.status}', expected 'DISPATCHED' or 'IN_TRANSIT'.`
        );
      }

      // 2. Lock transfer items FOR UPDATE
      const items = await this.transferRepo.lockTransferItems(organizationId, transferId, tx);
      if (items.length === 0) {
        throw new Error(`INVALID_TRANSFER: Transfer '${transferId}' has no items.`);
      }

      // 3. Verify destination location ownership
      const destValid = await this.inventoryRepo.verifyLocationOwnership(organizationId, transfer.destination_location_id, tx);
      if (!destValid) {
        throw new Error('TENANT_ACCESS_DENIED: Destination location does not belong to organization.');
      }

      // 4. Validate quantities & prepare mutations
      const receiptCalculations: Array<{
        item: InventoryTransferItemRecord;
        receivedQty: number;
        varianceQty: number;
      }> = [];

      let totalReceived = 0;
      let totalVariance = 0;

      for (const item of items) {
        const receivedQty = receivedItemsMap[item.variant_id] !== undefined
          ? roundQty(receivedItemsMap[item.variant_id])
          : item.dispatched_quantity;

        if (receivedQty < 0) {
          throw new Error(`INVALID_QUANTITY: Received quantity (${receivedQty}) cannot be negative.`);
        }

        if (receivedQty > item.dispatched_quantity && !options?.allowOverReceive) {
          throw new Error(
            `INVALID_QUANTITY: Over-receiving is not permitted without explicit policy. Received quantity (${receivedQty}) exceeds dispatched quantity (${item.dispatched_quantity}) for variant '${item.variant_id}'.`
          );
        }

        // variance_quantity = received_quantity - dispatched_quantity
        const varianceQty = roundQty(subQty(receivedQty, item.dispatched_quantity));
        totalReceived = addQty(totalReceived, receivedQty);
        totalVariance = addQty(totalVariance, varianceQty);

        receiptCalculations.push({ item, receivedQty, varianceQty });
      }

      // 5. Execute destination balance updates & physical movements
      for (const calc of receiptCalculations) {
        const { item, receivedQty, varianceQty } = calc;

        // Ensure destination balance exists
        const destBalanceId = `bal_${transfer.destination_location_id}_${item.variant_id}`;
        await tx.query(
          `INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired, in_transit)
           VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0)
           ON CONFLICT (location_id, variant_id) DO NOTHING`,
          [destBalanceId, organizationId, transfer.destination_location_id, item.variant_id]
        );

        // Lock destination balance FOR UPDATE
        const lockedDest = await tx.query<{ id: string; in_transit: number; on_hand: number }>(
          `SELECT id, in_transit::float, on_hand::float
           FROM inventory_balances
           WHERE location_id = $1 AND variant_id = $2 AND organization_id = $3
           FOR UPDATE`,
          [transfer.destination_location_id, item.variant_id, organizationId]
        );

        // Decrease in_transit by the dispatched quantity (clearing outstanding transit stock)
        const currentInTransit = roundQty(Number(lockedDest.rows[0].in_transit));
        const newInTransit = Math.max(0, roundQty(subQty(currentInTransit, item.dispatched_quantity)));

        await tx.query(
          `UPDATE inventory_balances
           SET in_transit = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newInTransit, lockedDest.rows[0].id]
        );

        // If receivedQty > 0, record physical TRANSFER_IN movement and increment on_hand
        if (receivedQty > 0) {
          await this.inventoryRepo.recordMovement(
            {
              id: `mov_tin_${transfer.id}_${item.variant_id}_${Date.now()}`,
              organization_id: organizationId,
              location_id: transfer.destination_location_id,
              variant_id: item.variant_id,
              movement_type: 'TRANSFER_IN',
              quantity_change: receivedQty,
              reference_type: 'inventory_transfer',
              reference_id: transfer.id,
              source_location_id: transfer.source_location_id,
              destination_location_id: transfer.destination_location_id,
              performed_by,
              notes: `Received transfer ${transfer.transfer_number}`,
            },
            tx
          );
        }

        // Update item record with received and variance quantities
        await this.transferRepo.updateItemReceived(organizationId, item.id, receivedQty, varianceQty, tx);
      }

      // 6. Append RECEIVED event
      await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'RECEIVED',
          from_status: transfer.status,
          to_status: 'RECEIVED',
          quantity: totalReceived,
          actor_id: performed_by,
          source_location_id: transfer.source_location_id,
          destination_location_id: transfer.destination_location_id,
          idempotency_key: idempotencyKey || null,
          notes: `Received ${totalReceived} units. Discrepancy: ${totalVariance}.`,
        },
        tx
      );

      // 7. If variance != 0, record VARIANCE_RECORDED event for each discrepancy item
      for (const calc of receiptCalculations) {
        if (calc.varianceQty !== 0) {
          await this.transferRepo.appendEvent(
            organizationId,
            {
              transfer_id: transferId,
              transfer_item_id: calc.item.id,
              event_type: 'VARIANCE_RECORDED',
              from_status: 'RECEIVED',
              to_status: 'COMPLETED',
              quantity: calc.varianceQty,
              actor_id: performed_by,
              source_location_id: transfer.source_location_id,
              destination_location_id: transfer.destination_location_id,
              reason: 'TRANSFER_VARIANCE',
              notes: `Discrepancy recorded for variant ${calc.item.variant_id}: dispatched ${calc.item.dispatched_quantity}, received ${calc.receivedQty}, variance ${calc.varianceQty}.`,
            },
            tx
          );
        }
      }

      // 8. Record COMPLETED event and mark status COMPLETED
      await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'COMPLETED',
          from_status: 'RECEIVED',
          to_status: 'COMPLETED',
          actor_id: performed_by,
          source_location_id: transfer.source_location_id,
          destination_location_id: transfer.destination_location_id,
          notes: `Transfer ${transfer.transfer_number} fully reconciled and completed.`,
        },
        tx
      );

      const updated = await this.transferRepo.updateTransferStatus(
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

      return updated!;
    });
  }

  /**
   * Cancels a transfer in DRAFT, REQUESTED, or APPROVED state.
   */
  async cancelTransfer(
    organizationId: string,
    transferId: string,
    performed_by: string,
    reason?: string,
    idempotencyKey?: string
  ): Promise<InventoryTransferRecord> {
    return this.db.withTransaction(async (tx) => {
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
      if (
        lockedTransfer.status === 'DISPATCHED' ||
        lockedTransfer.status === 'IN_TRANSIT' ||
        lockedTransfer.status === 'RECEIVED' ||
        lockedTransfer.status === 'COMPLETED'
      ) {
        throw new Error(`INVALID_TRANSFER_STATE: Cannot cancel transfer in state '${lockedTransfer.status}'. Dispatched transfers cannot be cancelled.`);
      }

      const updated = await this.transferRepo.updateTransferStatus(
        organizationId,
        transferId,
        {
          status: 'CANCELLED',
          notes: reason ? `Cancelled: ${reason}` : 'Transfer cancelled',
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
          idempotency_key: idempotencyKey || null,
          reason: reason || null,
          notes: reason ? `Cancelled: ${reason}` : 'Transfer cancelled',
        },
        tx
      );

      return updated!;
    });
  }

  /**
   * Completes a transfer explicitly if required.
   */
  async completeTransfer(
    organizationId: string,
    transferId: string,
    performed_by: string,
    notes?: string,
    idempotencyKey?: string
  ): Promise<InventoryTransferRecord> {
    return this.db.withTransaction(async (tx) => {
      const lockedTransfer = await this.transferRepo.lockTransfer(organizationId, transferId, tx);
      if (!lockedTransfer) {
        throw new Error(`TRANSFER_NOT_FOUND: Transfer '${transferId}' not found.`);
      }

      if (lockedTransfer.status === 'COMPLETED') {
        return lockedTransfer;
      }

      const updated = await this.transferRepo.updateTransferStatus(
        organizationId,
        transferId,
        {
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          notes: notes || lockedTransfer.notes || undefined,
        },
        tx
      );

      await this.transferRepo.appendEvent(
        organizationId,
        {
          transfer_id: transferId,
          event_type: 'COMPLETED',
          from_status: lockedTransfer.status,
          to_status: 'COMPLETED',
          actor_id: performed_by,
          source_location_id: lockedTransfer.source_location_id,
          destination_location_id: lockedTransfer.destination_location_id,
          idempotency_key: idempotencyKey || null,
          notes: notes || 'Transfer marked completed',
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
    return this.transferRepo.findTransferById(organizationId, transferId);
  }

  /**
   * Retrieves immutable event ledger for a transfer.
   */
  async getTransferEvents(
    organizationId: string,
    transferId: string
  ): Promise<InventoryTransferEventRecord[]> {
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
    return this.transferRepo.listTransfers(organizationId, options);
  }
}
