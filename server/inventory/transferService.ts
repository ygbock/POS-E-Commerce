import { DatabaseClient, getDatabaseClient } from '../db/client';
import { InventoryRepository } from '../repositories/inventoryRepository';
import { InventoryTransferRepository } from '../repositories/inventoryTransferRepository';
import {
  InventoryTransferRecord,
  InventoryTransferItemRecord,
  TransferStatus,
} from './inventoryTypes';
import { roundQty } from './inventoryPolicies';

/**
 * Stock Transfer Domain Service (INV-001)
 * 
 * Manages full lifecycle of multi-location stock transfers:
 * - Creation (DRAFT / REQUESTED)
 * - Approval (APPROVED)
 * - Dispatch (DISPATCHED / IN_TRANSIT with atomic source deduction and destination in_transit addition)
 * - Receipt (RECEIVED / COMPLETED / VARIANCE with destination on_hand addition and variance accounting)
 * - Cancellation / Rejection
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

  async createTransfer(
    organizationId: string,
    data: {
      transfer_number?: string;
      source_location_id: string;
      destination_location_id: string;
      items: Array<{
        variant_id: string;
        requested_quantity: number;
        approved_quantity?: number;
        notes?: string;
      }>;
      notes?: string;
    },
    performed_by: string
  ): Promise<{ transfer: InventoryTransferRecord; items: InventoryTransferItemRecord[] }> {
    if (data.source_location_id === data.destination_location_id) {
      throw new Error('INVALID_TRANSFER: Source and destination locations must be different.');
    }
    if (!data.items || data.items.length === 0) {
      throw new Error('INVALID_TRANSFER: Transfer must contain at least one item.');
    }

    const transferId = `tr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const transferNumber = data.transfer_number || `TR-${Date.now().toString().slice(-6)}`;

    return this.db.withTransaction(async (tx) => {
      // 1. Verify tenant location boundaries
      const sourceValid = await this.inventoryRepo.verifyLocationOwnership(organizationId, data.source_location_id, tx);
      const destValid = await this.inventoryRepo.verifyLocationOwnership(organizationId, data.destination_location_id, tx);
      if (!sourceValid || !destValid) {
        throw new Error('TENANT_ACCESS_DENIED: Source or destination location does not belong to organization.');
      }

      // 2. Verify all variants belong to tenant
      for (const item of data.items) {
        if (item.requested_quantity <= 0) {
          throw new Error('INVALID_QUANTITY: Requested quantity must be greater than zero.');
        }
        const varValid = await this.inventoryRepo.verifyVariantOwnership(organizationId, item.variant_id, tx);
        if (!varValid) {
          throw new Error(`TENANT_ACCESS_DENIED: Variant '${item.variant_id}' does not belong to organization.`);
        }
      }

      // 3. Create transfer with items
      return this.transferRepo.createTransferWithItems(
        {
          id: transferId,
          organization_id: organizationId,
          transfer_number: transferNumber,
          source_location_id: data.source_location_id,
          destination_location_id: data.destination_location_id,
          status: 'REQUESTED',
          requested_by: performed_by,
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
    });
  }

  async approveTransfer(
    organizationId: string,
    transferId: string,
    performed_by: string
  ): Promise<InventoryTransferRecord> {
    const existing = await this.transferRepo.findTransferById(transferId, organizationId);
    if (!existing) {
      throw new Error(`TRANSFER_NOT_FOUND: Transfer '${transferId}' not found.`);
    }
    if (existing.transfer.status !== 'REQUESTED' && existing.transfer.status !== 'DRAFT') {
      throw new Error(`INVALID_TRANSFER_STATE: Cannot approve transfer in state '${existing.transfer.status}'.`);
    }

    const updated = await this.transferRepo.updateTransferStatus(
      transferId,
      {
        status: 'APPROVED',
        approved_by: performed_by,
        approved_at: new Date().toISOString(),
      },
      organizationId
    );
    return updated!;
  }

  async dispatchTransfer(
    organizationId: string,
    transferId: string,
    dispatchedItemsMap: Record<string, number> | undefined,
    performed_by: string
  ): Promise<InventoryTransferRecord> {
    return this.db.withTransaction(async (tx) => {
      const existing = await this.transferRepo.findTransferById(transferId, organizationId, tx);
      if (!existing) {
        throw new Error(`TRANSFER_NOT_FOUND: Transfer '${transferId}' not found.`);
      }
      if (existing.transfer.status !== 'APPROVED') {
        throw new Error(`INVALID_TRANSFER_STATE: Cannot dispatch transfer in state '${existing.transfer.status}', expected 'APPROVED'.`);
      }

      const itemsToDispatch: Array<{ variant_id: string; quantity: number }> = [];

      for (const item of existing.items) {
        const qtyToDispatch = dispatchedItemsMap && dispatchedItemsMap[item.variant_id] !== undefined
          ? roundQty(dispatchedItemsMap[item.variant_id])
          : item.approved_quantity;

        if (qtyToDispatch < 0) {
          throw new Error('INVALID_QUANTITY: Dispatched quantity cannot be negative.');
        }

        // Update item dispatched_quantity
        await this.transferRepo.updateItemDispatched(item.id, qtyToDispatch, tx);
        if (qtyToDispatch > 0) {
          itemsToDispatch.push({ variant_id: item.variant_id, quantity: qtyToDispatch });
        }
      }

      // Execute atomic balance & ledger dispatch
      await this.inventoryRepo.dispatchTransferStock(
        {
          organization_id: organizationId,
          transfer_id: transferId,
          source_location_id: existing.transfer.source_location_id,
          destination_location_id: existing.transfer.destination_location_id,
          items: itemsToDispatch,
          performed_by,
          notes: `Dispatched transfer ${existing.transfer.transfer_number}`,
        },
        tx
      );

      // Update transfer status
      const updated = await this.transferRepo.updateTransferStatus(
        transferId,
        {
          status: 'DISPATCHED',
          dispatched_by: performed_by,
          dispatched_at: new Date().toISOString(),
        },
        organizationId,
        tx
      );

      return updated!;
    });
  }

  async receiveTransfer(
    organizationId: string,
    transferId: string,
    receivedItemsMap: Record<string, number>,
    performed_by: string
  ): Promise<InventoryTransferRecord> {
    return this.db.withTransaction(async (tx) => {
      const existing = await this.transferRepo.findTransferById(transferId, organizationId, tx);
      if (!existing) {
        throw new Error(`TRANSFER_NOT_FOUND: Transfer '${transferId}' not found.`);
      }
      if (existing.transfer.status !== 'DISPATCHED' && existing.transfer.status !== 'IN_TRANSIT') {
        throw new Error(`INVALID_TRANSFER_STATE: Cannot receive transfer in state '${existing.transfer.status}', expected 'DISPATCHED'.`);
      }

      let hasVariance = false;
      const itemsToReceive: Array<{ variant_id: string; dispatched_quantity: number; received_quantity: number }> = [];

      for (const item of existing.items) {
        const receivedQty = receivedItemsMap[item.variant_id] !== undefined
          ? roundQty(receivedItemsMap[item.variant_id])
          : item.dispatched_quantity;

        if (receivedQty < 0) {
          throw new Error('INVALID_QUANTITY: Received quantity cannot be negative.');
        }

        const varianceQty = roundQty(item.dispatched_quantity - receivedQty);
        if (varianceQty !== 0) {
          hasVariance = true;
        }

        await this.transferRepo.updateItemReceived(item.id, receivedQty, varianceQty, tx);
        itemsToReceive.push({
          variant_id: item.variant_id,
          dispatched_quantity: item.dispatched_quantity,
          received_quantity: receivedQty,
        });
      }

      // Execute atomic balance & ledger receipt
      await this.inventoryRepo.receiveTransferStock(
        {
          organization_id: organizationId,
          transfer_id: transferId,
          source_location_id: existing.transfer.source_location_id,
          destination_location_id: existing.transfer.destination_location_id,
          items: itemsToReceive,
          performed_by,
          notes: `Received transfer ${existing.transfer.transfer_number}`,
        },
        tx
      );

      const finalStatus: TransferStatus = hasVariance ? 'VARIANCE' : 'COMPLETED';
      const updated = await this.transferRepo.updateTransferStatus(
        transferId,
        {
          status: finalStatus,
          received_by: performed_by,
          received_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
        organizationId,
        tx
      );

      return updated!;
    });
  }

  async getTransfer(
    organizationId: string,
    transferId: string
  ): Promise<{ transfer: InventoryTransferRecord; items: InventoryTransferItemRecord[] } | null> {
    return this.transferRepo.findTransferById(transferId, organizationId);
  }

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
    return this.transferRepo.listTransfers({
      organizationId,
      ...options,
    });
  }
}
