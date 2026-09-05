import { DatabaseClient, getDatabaseClient } from '../db/client';
import { InventoryRepository } from '../repositories/inventoryRepository';
import { InventoryMovementRepository } from '../repositories/inventoryMovementRepository';
import {
  InventoryBalanceRecord,
  InventoryMovementRecord,
  MovementType,
} from './inventoryTypes';
import { roundQty } from './inventoryPolicies';

/**
 * Inventory Domain Service (INV-001)
 * 
 * Orchestrates business operations for balances, movements, opening balances,
 * manual adjustments, and damage/expiry quarantines and write-offs.
 */
export class InventoryService {
  private inventoryRepo: InventoryRepository;
  private movementRepo: InventoryMovementRepository;
  private db: DatabaseClient;

  constructor(
    inventoryRepo?: InventoryRepository,
    movementRepo?: InventoryMovementRepository,
    db?: DatabaseClient
  ) {
    this.db = db || getDatabaseClient();
    this.inventoryRepo = inventoryRepo || new InventoryRepository(this.db);
    this.movementRepo = movementRepo || new InventoryMovementRepository(this.db);
  }

  async getBalancesByLocation(
    organizationId: string,
    locationId: string
  ): Promise<InventoryBalanceRecord[]> {
    const isLocValid = await this.inventoryRepo.verifyLocationOwnership(organizationId, locationId);
    if (!isLocValid) {
      throw new Error(`TENANT_ACCESS_DENIED: Location '${locationId}' does not belong to organization.`);
    }
    return this.inventoryRepo.listBalancesByLocation(locationId, organizationId);
  }

  async getBalance(
    organizationId: string,
    locationId: string,
    variantId: string
  ): Promise<InventoryBalanceRecord | null> {
    const isLocValid = await this.inventoryRepo.verifyLocationOwnership(organizationId, locationId);
    if (!isLocValid) {
      throw new Error(`TENANT_ACCESS_DENIED: Location '${locationId}' does not belong to organization.`);
    }
    return this.inventoryRepo.getBalance(locationId, variantId, organizationId);
  }

  async recordOpeningBalance(
    organizationId: string,
    data: {
      location_id: string;
      variant_id: string;
      quantity: number;
      unit_cost?: number;
      notes?: string;
      idempotency_key?: string;
    },
    performed_by: string
  ): Promise<{ balance: InventoryBalanceRecord; movement: InventoryMovementRecord }> {
    if (data.quantity < 0) {
      throw new Error('INVALID_QUANTITY: Opening balance quantity cannot be negative.');
    }

    const movId = `mov_open_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return this.inventoryRepo.recordMovement({
      id: movId,
      organization_id: organizationId,
      location_id: data.location_id,
      variant_id: data.variant_id,
      movement_type: 'OPENING_BALANCE',
      quantity_change: roundQty(data.quantity),
      unit_cost: data.unit_cost ?? 0,
      reason: 'Initial Opening Balance',
      performed_by,
      notes: data.notes || 'Opening balance setup',
      idempotency_key: data.idempotency_key,
    });
  }

  async recordAdjustment(
    organizationId: string,
    data: {
      location_id: string;
      variant_id: string;
      quantity_change: number;
      reason: string;
      unit_cost?: number;
      notes?: string;
      idempotency_key?: string;
      allowNegativeStock?: boolean;
    },
    performed_by: string
  ): Promise<{ balance: InventoryBalanceRecord; movement: InventoryMovementRecord }> {
    if (data.quantity_change === 0) {
      throw new Error('INVALID_QUANTITY: Adjustment quantity change cannot be zero.');
    }

    const movId = `mov_adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return this.inventoryRepo.recordMovement({
      id: movId,
      organization_id: organizationId,
      location_id: data.location_id,
      variant_id: data.variant_id,
      movement_type: 'ADJUSTMENT_CORRECTION',
      quantity_change: roundQty(data.quantity_change),
      unit_cost: data.unit_cost ?? 0,
      reason: data.reason,
      performed_by,
      notes: data.notes,
      idempotency_key: data.idempotency_key,
      allowNegativeStock: data.allowNegativeStock,
    });
  }

  async quarantineStock(
    organizationId: string,
    data: {
      location_id: string;
      variant_id: string;
      quantity: number;
      type: 'damage' | 'expired';
      reason?: string;
      notes?: string;
    },
    performed_by: string
  ): Promise<InventoryBalanceRecord> {
    if (data.quantity <= 0) {
      throw new Error('INVALID_QUANTITY: Quarantine quantity must be positive.');
    }
    return this.inventoryRepo.quarantineStock({
      organization_id: organizationId,
      location_id: data.location_id,
      variant_id: data.variant_id,
      quantity: roundQty(data.quantity),
      type: data.type,
      reason: data.reason,
      performed_by,
      notes: data.notes,
    });
  }

  async writeOffStock(
    organizationId: string,
    data: {
      location_id: string;
      variant_id: string;
      quantity: number;
      type: 'damage' | 'expired';
      reason?: string;
      notes?: string;
    },
    performed_by: string
  ): Promise<{ balance: InventoryBalanceRecord; movement: InventoryMovementRecord }> {
    if (data.quantity <= 0) {
      throw new Error('INVALID_QUANTITY: Write-off quantity must be positive.');
    }
    return this.inventoryRepo.writeOffStock({
      organization_id: organizationId,
      location_id: data.location_id,
      variant_id: data.variant_id,
      quantity: roundQty(data.quantity),
      type: data.type,
      reason: data.reason,
      performed_by,
      notes: data.notes,
    });
  }

  async listMovements(
    organizationId: string,
    options: {
      locationId?: string;
      variantId?: string;
      movementType?: MovementType;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<InventoryMovementRecord[]> {
    return this.movementRepo.listMovements({
      organizationId,
      ...options,
    });
  }
}
