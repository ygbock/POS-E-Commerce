import { DatabaseClient, getDatabaseClient } from '../db/client';
import {
  InventoryBalanceRecord,
  InventoryMovementRecord,
  MovementType,
} from '../inventory/inventoryTypes';
import {
  roundQty,
  addQty,
  subQty,
  assertLedgerInvariant,
  calculateAvailable,
} from '../inventory/inventoryPolicies';

export type { InventoryBalanceRecord, InventoryMovementRecord, MovementType };

function mapBalanceRow(row: any): InventoryBalanceRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    location_id: row.location_id,
    variant_id: row.variant_id,
    on_hand: roundQty(row.on_hand),
    reserved: roundQty(row.reserved),
    damaged: roundQty(row.damaged),
    expired: roundQty(row.expired),
    in_transit: roundQty(row.in_transit),
    available: roundQty(row.available),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapMovementRow(row: any): InventoryMovementRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    location_id: row.location_id,
    variant_id: row.variant_id,
    movement_type: row.movement_type,
    quantity_change: roundQty(row.quantity_change),
    previous_balance: roundQty(row.previous_balance),
    new_balance: roundQty(row.new_balance),
    unit_cost: roundQty(row.unit_cost),
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    reason: row.reason,
    performed_by: row.performed_by,
    notes: row.notes,
    source_location_id: row.source_location_id,
    destination_location_id: row.destination_location_id,
    idempotency_key: row.idempotency_key,
    source_system: row.source_system,
    source_reference: row.source_reference,
    created_at: row.created_at,
  };
}

export class InventoryRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  async verifyLocationOwnership(
    organizationId: string,
    locationId: string,
    client?: DatabaseClient
  ): Promise<boolean> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is required for verifyLocationOwnership.');
    }
    const db = this.getClient(client);
    const res = await db.query(
      'SELECT id FROM locations WHERE id = $1 AND organization_id = $2',
      [locationId, organizationId]
    );
    return res.rows.length > 0;
  }

  async verifyVariantOwnership(
    organizationId: string,
    variantId: string,
    client?: DatabaseClient
  ): Promise<boolean> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is required for verifyVariantOwnership.');
    }
    const db = this.getClient(client);
    const res = await db.query(
      'SELECT id FROM product_variants WHERE id = $1 AND organization_id = $2',
      [variantId, organizationId]
    );
    return res.rows.length > 0;
  }

  /**
   * Retrieves stock balance for a location and variant.
   * Requires explicit organizationId for strict tenant isolation.
   * Supports both (locationId, variantId, organizationId) and (organizationId, locationId, variantId).
   */
  async getBalance(
    arg1: string,
    arg2: string,
    arg3: string,
    client?: DatabaseClient
  ): Promise<InventoryBalanceRecord | null> {
    let locationId = arg1;
    let variantId = arg2;
    let organizationId = arg3;

    if (arg1.startsWith('org_') && !arg3.startsWith('org_')) {
      organizationId = arg1;
      locationId = arg2;
      variantId = arg3;
    }

    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organization_id is mandatory for getBalance.');
    }
    if (!locationId || !variantId) {
      throw new Error('VALIDATION_ERROR: locationId and variantId are mandatory for getBalance.');
    }

    const db = this.getClient(client);
    const querySql = `
      SELECT id, organization_id, location_id, variant_id,
             on_hand::text, reserved::text, damaged::text, expired::text,
             in_transit::text, available::text,
             created_at, updated_at
      FROM inventory_balances
      WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3
    `;

    const res = await db.query(querySql, [organizationId, locationId, variantId]);
    if (!res.rows[0]) return null;
    return mapBalanceRow(res.rows[0]);
  }

  async lockBalance(
    organizationId: string,
    locationId: string,
    variantId: string,
    client: DatabaseClient
  ): Promise<InventoryBalanceRecord | null> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organization_id is mandatory for lockBalance.');
    }
    const res = await client.query(
      `SELECT id, organization_id, location_id, variant_id,
              on_hand::text, reserved::text, damaged::text, expired::text,
              in_transit::text, available::text,
              created_at, updated_at
       FROM inventory_balances
       WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3
       FOR UPDATE`,
      [organizationId, locationId, variantId]
    );
    if (!res.rows[0]) return null;
    return mapBalanceRow(res.rows[0]);
  }

  async listBalancesByLocation(
    locationId: string,
    organizationId: string,
    client?: DatabaseClient
  ): Promise<InventoryBalanceRecord[]> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organization_id is mandatory for listBalancesByLocation.');
    }
    const db = this.getClient(client);
    const querySql = `
      SELECT id, organization_id, location_id, variant_id,
             on_hand::text, reserved::text, damaged::text, expired::text,
             in_transit::text, available::text,
             created_at, updated_at
      FROM inventory_balances
      WHERE organization_id = $1 AND location_id = $2
      ORDER BY updated_at DESC
    `;

    const res = await db.query(querySql, [organizationId, locationId]);
    return res.rows.map(mapBalanceRow);
  }

  /**
   * Records an inventory movement atomically, maintaining an immutable inventory movement ledger
   * and updating the location's inventory balance.
   * 
   * CONCURRENCY & INTEGRITY CONTROLS (INV-001 / INV-001R2):
   * - Transaction boundary: balance lookup, validation, movement insertion, and balance update are executed inside a single transaction.
   * - Row locking: balance row is locked with FOR UPDATE scoped by (organization_id, location_id, variant_id).
   * - Tenant isolation: verifies location and variant ownership; never falls back to default organizations.
   * - Decimal precision: BigInt scaled integer arithmetic with zero floating-point casts.
   * - Negative stock rule: strictly prohibits negative balance unless allowNegativeStock: true is specified.
   * - Idempotency: protects against duplicate movement ID or idempotency_key.
   * - Mathematical invariant: assertLedgerInvariant(previous_balance, quantity_change, new_balance).
   */
  async recordMovement(
    params: {
      id: string;
      organization_id: string;
      location_id: string;
      variant_id: string;
      movement_type: MovementType;
      quantity_change: number; // positive for additions, negative for deductions
      unit_cost?: number;
      reference_type?: string;
      reference_id?: string;
      reason?: string;
      performed_by: string;
      notes?: string;
      source_location_id?: string;
      destination_location_id?: string;
      idempotency_key?: string;
      source_system?: string;
      source_reference?: string;
      allowNegativeStock?: boolean;
    },
    client?: DatabaseClient
  ): Promise<{ balance: InventoryBalanceRecord; movement: InventoryMovementRecord }> {
    if (!params.organization_id || typeof params.organization_id !== 'string' || params.organization_id.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organization_id is mandatory for recording inventory movements.');
    }
    const orgId = params.organization_id;
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      // 1. Validate location & variant tenant isolation
      const isLocValid = await this.verifyLocationOwnership(orgId, params.location_id, tx);
      if (!isLocValid) {
        throw new Error(
          `TENANT_ACCESS_DENIED: Location '${params.location_id}' does not belong to organization '${orgId}'.`
        );
      }

      const isVarValid = await this.verifyVariantOwnership(orgId, params.variant_id, tx);
      if (!isVarValid) {
        throw new Error(
          `TENANT_ACCESS_DENIED: Variant '${params.variant_id}' does not belong to organization '${orgId}'.`
        );
      }

      // 2. Idempotency protection: idempotency_key or id duplicate check
      if (params.idempotency_key) {
        const existingKeyMov = await tx.query(
          `SELECT id, organization_id, location_id, variant_id, movement_type,
                  quantity_change::text, previous_balance::text, new_balance::text,
                  unit_cost::text, reference_type, reference_id, reason, performed_by, notes,
                  source_location_id, destination_location_id, idempotency_key,
                  source_system, source_reference, created_at
           FROM inventory_movements
           WHERE organization_id = $1 AND idempotency_key = $2
           LIMIT 1`,
          [orgId, params.idempotency_key]
        );
        if (existingKeyMov.rows.length > 0) {
          const currentBal = await this.getBalance(params.location_id, params.variant_id, orgId, tx);
          return {
            balance: currentBal!,
            movement: mapMovementRow(existingKeyMov.rows[0]),
          };
        }
      }

      const existingMov = await tx.query('SELECT id FROM inventory_movements WHERE id = $1', [params.id]);
      if (existingMov.rows.length > 0) {
        throw new Error(`DUPLICATE_MOVEMENT: Inventory movement with ID '${params.id}' has already been recorded.`);
      }

      // 3. Ensure balance row exists (upsert without overwriting existing stock)
      const balanceId = `bal_${params.location_id}_${params.variant_id}`;
      await tx.query(
        `INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired, in_transit)
         VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0)
         ON CONFLICT (location_id, variant_id) DO NOTHING`,
        [balanceId, orgId, params.location_id, params.variant_id]
      );

      // 4. Acquire pessimistic row lock (FOR UPDATE) scoped by organization_id to serialize concurrent updates
      const lockedBal = await tx.query(
        `SELECT id, organization_id, location_id, variant_id,
                on_hand::text, reserved::text, damaged::text, expired::text,
                in_transit::text, available::text
         FROM inventory_balances
         WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3
         FOR UPDATE`,
        [orgId, params.location_id, params.variant_id]
      );

      if (lockedBal.rows.length === 0) {
        throw new Error(
          `BALANCE_NOT_FOUND: Failed to lock balance for location '${params.location_id}' and variant '${params.variant_id}' in organization '${orgId}'.`
        );
      }

      const balanceRow = lockedBal.rows[0];
      if (balanceRow.organization_id !== orgId) {
        throw new Error(
          `TENANT_ISOLATION_VIOLATION: Balance row organization '${balanceRow.organization_id}' does not match context '${orgId}'.`
        );
      }

      const actualBalanceId = balanceRow.id;
      const currentOnHand = roundQty(balanceRow.on_hand);
      const currentReserved = roundQty(balanceRow.reserved);
      const currentDamaged = roundQty(balanceRow.damaged);
      const currentExpired = roundQty(balanceRow.expired);

      // Exact decimal arithmetic with BigInt scaled precision
      const roundedQuantityChange = roundQty(params.quantity_change);
      const newOnHand = roundQty(addQty(currentOnHand, roundedQuantityChange));

      // Invariant assertion: previous + delta === new
      assertLedgerInvariant(currentOnHand, roundedQuantityChange, newOnHand);

      // 5. Negative stock policy check
      if (!params.allowNegativeStock && newOnHand < 0) {
        throw new Error(
          `INSUFFICIENT_STOCK: Stock movement of ${roundedQuantityChange} would result in negative on_hand balance (${newOnHand}) for variant '${params.variant_id}' at location '${params.location_id}'. Current on_hand: ${currentOnHand}.`
        );
      }

      // 6. If decrementing on_hand, ensure available stock is not breached below reserved
      if (roundedQuantityChange < 0) {
        const newAvailable = calculateAvailable(newOnHand, currentReserved, currentDamaged, currentExpired);
        if (newAvailable < 0 && !params.allowNegativeStock) {
          throw new Error(
            `RESERVATION_BREACH: Deducting ${Math.abs(roundedQuantityChange)} exceeds available unreserved stock (${calculateAvailable(currentOnHand, currentReserved, currentDamaged, currentExpired)}). On hand: ${currentOnHand}, Reserved: ${currentReserved}.`
          );
        }
      }

      // 7. Append-only ledger insert into inventory_movements
      const movRes = await tx.query(
        `INSERT INTO inventory_movements (
          id, organization_id, location_id, variant_id, movement_type,
          quantity_change, previous_balance, new_balance, unit_cost,
          reference_type, reference_id, reason, performed_by, notes,
          source_location_id, destination_location_id, idempotency_key,
          source_system, source_reference
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING id, organization_id, location_id, variant_id, movement_type,
                  quantity_change::text, previous_balance::text, new_balance::text,
                  unit_cost::text, reference_type, reference_id, reason, performed_by, notes,
                  source_location_id, destination_location_id, idempotency_key,
                  source_system, source_reference, created_at`,
        [
          params.id,
          orgId,
          params.location_id,
          params.variant_id,
          params.movement_type,
          roundedQuantityChange,
          currentOnHand,
          newOnHand,
          params.unit_cost !== undefined ? roundQty(params.unit_cost) : 0,
          params.reference_type || null,
          params.reference_id || null,
          params.reason || null,
          params.performed_by,
          params.notes || null,
          params.source_location_id || null,
          params.destination_location_id || null,
          params.idempotency_key || null,
          params.source_system || null,
          params.source_reference || null,
        ]
      );

      // 8. Update inventory_balances with new on-hand balance
      const updatedBalRes = await tx.query(
        `UPDATE inventory_balances
         SET on_hand = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND organization_id = $3
         RETURNING id, organization_id, location_id, variant_id,
                   on_hand::text, reserved::text, damaged::text, expired::text,
                   in_transit::text, available::text,
                   created_at, updated_at`,
        [newOnHand, actualBalanceId, orgId]
      );

      return {
        balance: mapBalanceRow(updatedBalRes.rows[0]),
        movement: mapMovementRow(movRes.rows[0]),
      };
    });
  }

  /**
   * Atomically adjusts reserved inventory on an inventory balance.
   */
  async adjustReserved(
    params: {
      organization_id: string;
      location_id: string;
      variant_id: string;
      delta_reserved: number;
    },
    client?: DatabaseClient
  ): Promise<InventoryBalanceRecord> {
    if (!params.organization_id || typeof params.organization_id !== 'string' || params.organization_id.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organization_id is mandatory for adjustReserved.');
    }
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      // 1. Ensure balance row exists
      const balanceId = `bal_${params.location_id}_${params.variant_id}`;
      await tx.query(
        `INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired, in_transit)
         VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0)
         ON CONFLICT (location_id, variant_id) DO NOTHING`,
        [balanceId, params.organization_id, params.location_id, params.variant_id]
      );

      // 2. Lock row FOR UPDATE scoped by organization_id
      const lockedBal = await tx.query(
        `SELECT id, organization_id, location_id, variant_id,
                on_hand::text, reserved::text, damaged::text, expired::text,
                in_transit::text, available::text
         FROM inventory_balances
         WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3
         FOR UPDATE`,
        [params.organization_id, params.location_id, params.variant_id]
      );

      const bal = lockedBal.rows[0];
      const currentReserved = roundQty(bal.reserved);
      const currentOnHand = roundQty(bal.on_hand);
      const currentDamaged = roundQty(bal.damaged);
      const currentExpired = roundQty(bal.expired);
      const newReserved = roundQty(addQty(currentReserved, params.delta_reserved));

      if (newReserved < 0) {
        throw new Error(
          `INVALID_RESERVATION: Reserved stock cannot be negative. Current: ${currentReserved}, Delta: ${params.delta_reserved}.`
        );
      }

      // Check available stock
      const availableUnreserved = calculateAvailable(currentOnHand, 0, currentDamaged, currentExpired);
      if (newReserved > availableUnreserved) {
        throw new Error(
          `INSUFFICIENT_STOCK_FOR_RESERVATION: Cannot reserve ${newReserved} units. Total unquarantined stock: ${availableUnreserved}.`
        );
      }

      const updated = await tx.query(
        `UPDATE inventory_balances
         SET reserved = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND organization_id = $3
         RETURNING id, organization_id, location_id, variant_id,
                   on_hand::text, reserved::text, damaged::text, expired::text,
                   in_transit::text, available::text,
                   created_at, updated_at`,
        [newReserved, bal.id, params.organization_id]
      );

      return mapBalanceRow(updated.rows[0]);
    });
  }

  /**
   * Quarantines stock by moving units from available to damaged or expired.
   */
  async quarantineStock(
    params: {
      organization_id: string;
      location_id: string;
      variant_id: string;
      quantity: number;
      type: 'damage' | 'expired';
      reason?: string;
      performed_by: string;
      notes?: string;
    },
    client?: DatabaseClient
  ): Promise<InventoryBalanceRecord> {
    if (!params.organization_id || typeof params.organization_id !== 'string' || params.organization_id.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organization_id is mandatory for quarantineStock.');
    }
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      // 1. Ensure balance row exists
      const balanceId = `bal_${params.location_id}_${params.variant_id}`;
      await tx.query(
        `INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired, in_transit)
         VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0)
         ON CONFLICT (location_id, variant_id) DO NOTHING`,
        [balanceId, params.organization_id, params.location_id, params.variant_id]
      );

      // 2. Lock row scoped by organization_id
      const lockedBal = await tx.query(
        `SELECT id, organization_id, location_id, variant_id,
                on_hand::text, reserved::text, damaged::text, expired::text,
                in_transit::text, available::text
         FROM inventory_balances
         WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3
         FOR UPDATE`,
        [params.organization_id, params.location_id, params.variant_id]
      );

      const bal = lockedBal.rows[0];
      const currentOnHand = roundQty(bal.on_hand);
      const currentReserved = roundQty(bal.reserved);
      const currentDamaged = roundQty(bal.damaged);
      const currentExpired = roundQty(bal.expired);
      const currentAvailable = calculateAvailable(currentOnHand, currentReserved, currentDamaged, currentExpired);

      if (params.quantity > currentAvailable) {
        throw new Error(
          `INSUFFICIENT_AVAILABLE_STOCK: Cannot quarantine ${params.quantity} units as ${params.type}. Available: ${currentAvailable}.`
        );
      }

      const columnToUpdate = params.type === 'damage' ? 'damaged' : 'expired';
      const currentVal = params.type === 'damage' ? currentDamaged : currentExpired;
      const newVal = roundQty(addQty(currentVal, params.quantity));

      const updated = await tx.query(
        `UPDATE inventory_balances
         SET ${columnToUpdate} = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND organization_id = $3
         RETURNING id, organization_id, location_id, variant_id,
                   on_hand::text, reserved::text, damaged::text, expired::text,
                   in_transit::text, available::text,
                   created_at, updated_at`,
        [newVal, bal.id, params.organization_id]
      );

      // Also record audit movement
      const movType: MovementType = params.type === 'damage' ? 'ADJUSTMENT_DAMAGE' : 'ADJUSTMENT_EXPIRED';
      await tx.query(
        `INSERT INTO inventory_movements (
          id, organization_id, location_id, variant_id, movement_type,
          quantity_change, previous_balance, new_balance, unit_cost,
          reason, performed_by, notes
        ) VALUES ($1, $2, $3, $4, $5, 0, $6, $6, 0, $7, $8, $9)`,
        [
          `mov_quar_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          params.organization_id,
          params.location_id,
          params.variant_id,
          movType,
          currentOnHand,
          params.reason || `Quarantined as ${params.type}`,
          params.performed_by,
          params.notes || null,
        ]
      );

      return mapBalanceRow(updated.rows[0]);
    });
  }

  /**
   * Writes off quarantined damaged or expired stock.
   * Decreases damaged/expired AND decreases on_hand.
   */
  async writeOffStock(
    params: {
      organization_id: string;
      location_id: string;
      variant_id: string;
      quantity: number;
      type: 'damage' | 'expired';
      reason?: string;
      performed_by: string;
      notes?: string;
    },
    client?: DatabaseClient
  ): Promise<{ balance: InventoryBalanceRecord; movement: InventoryMovementRecord }> {
    if (!params.organization_id || typeof params.organization_id !== 'string' || params.organization_id.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organization_id is mandatory for writeOffStock.');
    }
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      // 1. Lock row scoped by organization_id
      const lockedBal = await tx.query(
        `SELECT id, organization_id, location_id, variant_id,
                on_hand::text, reserved::text, damaged::text, expired::text,
                in_transit::text, available::text
         FROM inventory_balances
         WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3
         FOR UPDATE`,
        [params.organization_id, params.location_id, params.variant_id]
      );

      if (lockedBal.rows.length === 0) {
        throw new Error('BALANCE_NOT_FOUND: No stock balance found for write-off.');
      }

      const bal = lockedBal.rows[0];
      const currentOnHand = roundQty(bal.on_hand);
      const currentDamaged = roundQty(bal.damaged);
      const currentExpired = roundQty(bal.expired);
      const currentQuarantined = params.type === 'damage' ? currentDamaged : currentExpired;

      if (params.quantity > currentQuarantined) {
        throw new Error(
          `INSUFFICIENT_QUARANTINED_STOCK: Cannot write off ${params.quantity} units of ${params.type} stock. Current quarantined: ${currentQuarantined}.`
        );
      }

      const newOnHand = roundQty(subQty(currentOnHand, params.quantity));
      const newQuarantined = roundQty(subQty(currentQuarantined, params.quantity));
      const columnToUpdate = params.type === 'damage' ? 'damaged' : 'expired';
      const movType: MovementType = params.type === 'damage' ? 'DAMAGE_WRITE_OFF' : 'EXPIRY_WRITE_OFF';

      const movId = `mov_woff_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const movRes = await tx.query(
        `INSERT INTO inventory_movements (
          id, organization_id, location_id, variant_id, movement_type,
          quantity_change, previous_balance, new_balance, unit_cost,
          reason, performed_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11)
        RETURNING id, organization_id, location_id, variant_id, movement_type,
                  quantity_change::text, previous_balance::text, new_balance::text,
                  unit_cost::text, reference_type, reference_id, reason, performed_by, notes,
                  source_location_id, destination_location_id, idempotency_key,
                  source_system, source_reference, created_at`,
        [
          movId,
          params.organization_id,
          params.location_id,
          params.variant_id,
          movType,
          -params.quantity,
          currentOnHand,
          newOnHand,
          params.reason || `Stock write-off (${params.type})`,
          params.performed_by,
          params.notes || null,
        ]
      );

      const balRes = await tx.query(
        `UPDATE inventory_balances
         SET on_hand = $1, ${columnToUpdate} = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND organization_id = $4
         RETURNING id, organization_id, location_id, variant_id,
                   on_hand::text, reserved::text, damaged::text, expired::text,
                   in_transit::text, available::text,
                   created_at, updated_at`,
        [newOnHand, newQuarantined, bal.id, params.organization_id]
      );

      return {
        balance: mapBalanceRow(balRes.rows[0]),
        movement: mapMovementRow(movRes.rows[0]),
      };
    });
  }

  /**
   * Atomic multi-location transfer dispatch:
   * 1. Source location on_hand is decremented, recording TRANSFER_OUT movement.
   * 2. Destination location in_transit is incremented.
   */
  async dispatchTransferStock(
    params: {
      organization_id: string;
      transfer_id: string;
      source_location_id: string;
      destination_location_id: string;
      items: Array<{ variant_id: string; quantity: number }>;
      performed_by: string;
      notes?: string;
    },
    client?: DatabaseClient
  ): Promise<void> {
    if (!params.organization_id || typeof params.organization_id !== 'string' || params.organization_id.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organization_id is mandatory for dispatchTransferStock.');
    }
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      // Verify both locations belong to tenant
      const sourceValid = await this.verifyLocationOwnership(params.organization_id, params.source_location_id, tx);
      const destValid = await this.verifyLocationOwnership(params.organization_id, params.destination_location_id, tx);
      if (!sourceValid || !destValid) {
        throw new Error('TENANT_ACCESS_DENIED: Source or destination location does not belong to organization.');
      }

      for (const item of params.items) {
        // 1. Deduct from source on_hand
        await this.recordMovement(
          {
            id: `mov_tout_${params.transfer_id}_${item.variant_id}_${Date.now()}`,
            organization_id: params.organization_id,
            location_id: params.source_location_id,
            variant_id: item.variant_id,
            movement_type: 'TRANSFER_OUT',
            quantity_change: -item.quantity,
            reference_type: 'TRANSFER',
            reference_id: params.transfer_id,
            source_location_id: params.source_location_id,
            destination_location_id: params.destination_location_id,
            performed_by: params.performed_by,
            notes: params.notes,
          },
          tx
        );

        // 2. Ensure dest balance exists
        const destBalanceId = `bal_${params.destination_location_id}_${item.variant_id}`;
        await tx.query(
          `INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired, in_transit)
           VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0)
           ON CONFLICT (location_id, variant_id) DO NOTHING`,
          [destBalanceId, params.organization_id, params.destination_location_id, item.variant_id]
        );

        // 3. Lock dest balance and add to in_transit
        const lockedDest = await tx.query(
          `SELECT id, organization_id, location_id, variant_id, in_transit::text
           FROM inventory_balances
           WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3
           FOR UPDATE`,
          [params.organization_id, params.destination_location_id, item.variant_id]
        );

        const currentInTransit = roundQty(lockedDest.rows[0].in_transit);
        const newInTransit = roundQty(addQty(currentInTransit, item.quantity));

        await tx.query(
          `UPDATE inventory_balances
           SET in_transit = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND organization_id = $3`,
          [newInTransit, lockedDest.rows[0].id, params.organization_id]
        );
      }
    });
  }

  /**
   * Atomic multi-location transfer receipt:
   * 1. Destination location in_transit is verified >= dispatched and decremented.
   * 2. Destination location on_hand is incremented by received_quantity, recording TRANSFER_IN movement.
   */
  async receiveTransferStock(
    params: {
      organization_id: string;
      transfer_id: string;
      source_location_id: string;
      destination_location_id: string;
      items: Array<{ variant_id: string; dispatched_quantity: number; received_quantity: number }>;
      performed_by: string;
      notes?: string;
    },
    client?: DatabaseClient
  ): Promise<void> {
    if (!params.organization_id || typeof params.organization_id !== 'string' || params.organization_id.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organization_id is mandatory for receiveTransferStock.');
    }
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      for (const item of params.items) {
        // 1. Lock destination balance
        const destBalanceId = `bal_${params.destination_location_id}_${item.variant_id}`;
        await tx.query(
          `INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired, in_transit)
           VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0)
           ON CONFLICT (location_id, variant_id) DO NOTHING`,
          [destBalanceId, params.organization_id, params.destination_location_id, item.variant_id]
        );

        const lockedDest = await tx.query(
          `SELECT id, organization_id, location_id, variant_id, in_transit::text, on_hand::text
           FROM inventory_balances
           WHERE organization_id = $1 AND location_id = $2 AND variant_id = $3
           FOR UPDATE`,
          [params.organization_id, params.destination_location_id, item.variant_id]
        );

        const currentInTransit = roundQty(lockedDest.rows[0].in_transit);
        if (currentInTransit < item.dispatched_quantity) {
          throw new Error(
            `INSUFFICIENT_IN_TRANSIT: In-transit balance (${currentInTransit}) is less than dispatched quantity (${item.dispatched_quantity}) for variant '${item.variant_id}'.`
          );
        }

        const newInTransit = roundQty(subQty(currentInTransit, item.dispatched_quantity));

        await tx.query(
          `UPDATE inventory_balances
           SET in_transit = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND organization_id = $3`,
          [newInTransit, lockedDest.rows[0].id, params.organization_id]
        );

        // 2. Increment destination on_hand by received_quantity
        if (item.received_quantity > 0) {
          await this.recordMovement(
            {
              id: `mov_tin_${params.transfer_id}_${item.variant_id}_${Date.now()}`,
              organization_id: params.organization_id,
              location_id: params.destination_location_id,
              variant_id: item.variant_id,
              movement_type: 'TRANSFER_IN',
              quantity_change: item.received_quantity,
              reference_type: 'TRANSFER',
              reference_id: params.transfer_id,
              source_location_id: params.source_location_id,
              destination_location_id: params.destination_location_id,
              performed_by: params.performed_by,
              notes: params.notes,
            },
            tx
          );
        }
      }
    });
  }

  async listMovements(
    options: {
      organizationId: string;
      locationId?: string;
      variantId?: string;
      movementType?: MovementType;
      limit?: number;
      offset?: number;
    },
    client?: DatabaseClient
  ): Promise<InventoryMovementRecord[]> {
    if (!options.organizationId || typeof options.organizationId !== 'string' || options.organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is required for listMovements.');
    }
    const db = this.getClient(client);
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [options.organizationId];

    if (options.locationId) {
      params.push(options.locationId);
      conditions.push(`location_id = $${params.length}`);
    }
    if (options.variantId) {
      params.push(options.variantId);
      conditions.push(`variant_id = $${params.length}`);
    }
    if (options.movementType) {
      params.push(options.movementType);
      conditions.push(`movement_type = $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const query = `
      SELECT id, organization_id, location_id, variant_id, movement_type,
             quantity_change::text, previous_balance::text, new_balance::text,
             unit_cost::text, reference_type, reference_id, reason, performed_by, notes,
             source_location_id, destination_location_id, idempotency_key,
             source_system, source_reference, created_at
      FROM inventory_movements
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const res = await db.query(query, params);
    return res.rows.map(mapMovementRow);
  }
}
