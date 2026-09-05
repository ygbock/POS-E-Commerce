import { DatabaseClient, getDatabaseClient } from '../db/client';
import { InventoryRepository } from '../repositories/inventoryRepository';
import { StockCountRepository } from '../repositories/stockCountRepository';
import {
  StockCountRecord,
  StockCountItemRecord,
  StockCountStatus,
} from './inventoryTypes';
import { roundQty } from './inventoryPolicies';

/**
 * Stock Count & Physical Audit Service (INV-001)
 * 
 * Manages cycle counts, physical inventory sessions, discrepancy tracking,
 * and reconciliation via compensating ADJUSTMENT_STOCKTAKE ledger movements.
 */
export class StockCountService {
  private inventoryRepo: InventoryRepository;
  private stockCountRepo: StockCountRepository;
  private db: DatabaseClient;

  constructor(
    inventoryRepo?: InventoryRepository,
    stockCountRepo?: StockCountRepository,
    db?: DatabaseClient
  ) {
    this.db = db || getDatabaseClient();
    this.inventoryRepo = inventoryRepo || new InventoryRepository(this.db);
    this.stockCountRepo = stockCountRepo || new StockCountRepository(this.db);
  }

  async createStockCount(
    organizationId: string,
    data: {
      location_id: string;
      count_number?: string;
      variant_ids: string[];
      notes?: string;
    },
    performed_by: string
  ): Promise<{ count: StockCountRecord; items: StockCountItemRecord[] }> {
    if (!data.variant_ids || data.variant_ids.length === 0) {
      throw new Error('INVALID_COUNT: Stock count must contain at least one variant.');
    }

    return this.db.withTransaction(async (tx) => {
      // 1. Verify location belongs to organization
      const isLocValid = await this.inventoryRepo.verifyLocationOwnership(organizationId, data.location_id, tx);
      if (!isLocValid) {
        throw new Error(`TENANT_ACCESS_DENIED: Location '${data.location_id}' does not belong to organization.`);
      }

      // 2. Snapshot current system balances for variants
      const itemsToCount: Array<{ id: string; variant_id: string; system_quantity: number }> = [];

      for (const variantId of data.variant_ids) {
        const isVarValid = await this.inventoryRepo.verifyVariantOwnership(organizationId, variantId, tx);
        if (!isVarValid) {
          throw new Error(`TENANT_ACCESS_DENIED: Variant '${variantId}' does not belong to organization.`);
        }

        const bal = await this.inventoryRepo.getBalance(data.location_id, variantId, organizationId, tx);
        const sysQty = bal ? roundQty(Number(bal.on_hand)) : 0;

        itemsToCount.push({
          id: `sci_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          variant_id: variantId,
          system_quantity: sysQty,
        });
      }

      const countId = `sc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const countNumber = data.count_number || `SC-${Date.now().toString().slice(-6)}`;

      return this.stockCountRepo.createStockCountWithItems(
        {
          id: countId,
          organization_id: organizationId,
          location_id: data.location_id,
          count_number: countNumber,
          status: 'IN_PROGRESS',
          created_by: performed_by,
          notes: data.notes,
        },
        itemsToCount,
        tx
      );
    });
  }

  async submitStockCount(
    organizationId: string,
    countId: string,
    countedItemsMap: Record<string, number>,
    performed_by: string
  ): Promise<StockCountRecord> {
    return this.db.withTransaction(async (tx) => {
      const existing = await this.stockCountRepo.findStockCountById(countId, organizationId, tx);
      if (!existing) {
        throw new Error(`STOCK_COUNT_NOT_FOUND: Stock count '${countId}' not found.`);
      }
      if (existing.count.status !== 'IN_PROGRESS' && existing.count.status !== 'DRAFT') {
        throw new Error(`INVALID_COUNT_STATE: Cannot submit count in state '${existing.count.status}', expected 'IN_PROGRESS'.`);
      }

      // Update counted quantities and variance
      for (const item of existing.items) {
        if (countedItemsMap[item.variant_id] !== undefined) {
          const countedQty = roundQty(countedItemsMap[item.variant_id]);
          if (countedQty < 0) {
            throw new Error('INVALID_QUANTITY: Counted quantity cannot be negative.');
          }
          await this.stockCountRepo.updateItemCount(item.id, countedQty, item.system_quantity, undefined, tx);
        }
      }

      // Update count status to SUBMITTED
      const updated = await this.stockCountRepo.updateStockCountStatus(
        countId,
        {
          status: 'SUBMITTED',
          submitted_by: performed_by,
          submitted_at: new Date().toISOString(),
        },
        organizationId,
        tx
      );

      return updated!;
    });
  }

  async approveStockCount(
    organizationId: string,
    countId: string,
    performed_by: string
  ): Promise<StockCountRecord> {
    return this.db.withTransaction(async (tx) => {
      const existing = await this.stockCountRepo.findStockCountById(countId, organizationId, tx);
      if (!existing) {
        throw new Error(`STOCK_COUNT_NOT_FOUND: Stock count '${countId}' not found.`);
      }
      if (existing.count.status !== 'SUBMITTED') {
        throw new Error(`INVALID_COUNT_STATE: Cannot approve count in state '${existing.count.status}', expected 'SUBMITTED'.`);
      }

      // Reconcile non-zero variances with ADJUSTMENT_STOCKTAKE ledger movements
      for (const item of existing.items) {
        const variance = roundQty(item.counted_quantity - item.system_quantity);
        if (variance !== 0) {
          await this.inventoryRepo.recordMovement(
            {
              id: `mov_stk_${existing.count.id}_${item.variant_id}_${Date.now()}`,
              organization_id: organizationId,
              location_id: existing.count.location_id,
              variant_id: item.variant_id,
              movement_type: 'ADJUSTMENT_STOCKTAKE',
              quantity_change: variance,
              reference_type: 'STOCK_COUNT',
              reference_id: existing.count.id,
              reason: `Physical stock count reconciliation. Counted: ${item.counted_quantity}, System: ${item.system_quantity}, Variance: ${variance}`,
              performed_by,
              notes: `Count session: ${existing.count.count_number}`,
            },
            tx
          );
        }
      }

      // Update status to APPROVED
      const updated = await this.stockCountRepo.updateStockCountStatus(
        countId,
        {
          status: 'APPROVED',
          approved_by: performed_by,
          approved_at: new Date().toISOString(),
        },
        organizationId,
        tx
      );

      return updated!;
    });
  }

  async getStockCount(
    organizationId: string,
    countId: string
  ): Promise<{ count: StockCountRecord; items: StockCountItemRecord[] } | null> {
    return this.stockCountRepo.findStockCountById(countId, organizationId);
  }

  async listStockCounts(
    organizationId: string,
    options: {
      locationId?: string;
      status?: StockCountStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<StockCountRecord[]> {
    return this.stockCountRepo.listStockCounts({
      organizationId,
      ...options,
    });
  }
}
