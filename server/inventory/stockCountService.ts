import { DatabaseClient, getDatabaseClient } from '../db/client';
import { InventoryRepository } from '../repositories/inventoryRepository';
import { StockCountRepository } from '../repositories/stockCountRepository';
import {
  StockCountRecord,
  StockCountItemRecord,
  StockCountStatus,
  Quantity,
} from './inventoryTypes';
import {
  toQtyString,
  subQtyExact,
  parseExactQuantity,
  parseQtyToScaled,
  generateInventoryId,
  generateDocumentNumber,
} from './inventoryPolicies';

/**
 * Stock Count & Physical Audit Service (INV-001 / INV-001R3)
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
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is mandatory for createStockCount.');
    }
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
      const itemsToCount: Array<{ id: string; variant_id: string; system_quantity: Quantity }> = [];

      for (const variantId of data.variant_ids) {
        const isVarValid = await this.inventoryRepo.verifyVariantOwnership(organizationId, variantId, tx);
        if (!isVarValid) {
          throw new Error(`TENANT_ACCESS_DENIED: Variant '${variantId}' does not belong to organization.`);
        }

        const bal = await this.inventoryRepo.getBalance(data.location_id, variantId, organizationId, tx);
        const sysQty = bal ? toQtyString(bal.on_hand) : '0.0000';

        itemsToCount.push({
          id: generateInventoryId('sci'),
          variant_id: variantId,
          system_quantity: sysQty,
        });
      }

      const countId = generateInventoryId('sc');
      const countNumber = data.count_number || generateDocumentNumber('SC');

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
    countedItemsMap: Record<string, unknown>,
    performed_by: string
  ): Promise<StockCountRecord> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is mandatory for submitStockCount.');
    }
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
          const countedQty = parseExactQuantity(countedItemsMap[item.variant_id], `variant_${item.variant_id}_counted`);
          if (parseQtyToScaled(countedQty) < 0n) {
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
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is mandatory for approveStockCount.');
    }
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
        const counted = toQtyString(item.counted_quantity ?? item.system_quantity);
        const variance = subQtyExact(counted, item.system_quantity);
        if (parseQtyToScaled(variance) !== 0n) {
          await this.inventoryRepo.recordMovement(
            {
              id: generateInventoryId('mov_stk'),
              organization_id: organizationId,
              location_id: existing.count.location_id,
              variant_id: item.variant_id,
              movement_type: 'ADJUSTMENT_STOCKTAKE',
              quantity_change: variance,
              reference_type: 'STOCK_COUNT',
              reference_id: existing.count.id,
              reason: `Physical stock count reconciliation. Counted: ${counted}, System: ${item.system_quantity}, Variance: ${variance}`,
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
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is mandatory.');
    }
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
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is mandatory.');
    }
    return this.stockCountRepo.listStockCounts({
      organizationId,
      ...options,
    });
  }
}
