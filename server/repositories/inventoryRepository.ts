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
    const db = this.getClient(client);
    const res = await db.query(
      'SELECT id FROM product_variants WHERE id = $1 AND organization_id = $2',
      [variantId, organizationId]
    );
    return res.rows.length > 0;
  }

  async getBalance(
    locationId: string,
    variantId: string,
    orgIdOrClient?: string | DatabaseClient,
    client?: DatabaseClient
  ): Promise<InventoryBalanceRecord | null> {
    const orgId = typeof orgIdOrClient === 'string' ? orgIdOrClient : undefined;
    const activeClient = typeof orgIdOrClient !== 'string' ? (orgIdOrClient as DatabaseClient) : client;
    const db = this.getClient(activeClient);

    const querySql = orgId
      ? `SELECT id, organization_id, location_id, variant_id,
                on_hand::float, reserved::float, damaged::float, expired::float,
                in_transit::float, available::float,
                created_at, updated_at
         FROM inventory_balances
         WHERE location_id = $1 AND variant_id = $2 AND organization_id = $3`
      : `SELECT id, organization_id, location_id, variant_id,
                on_hand::float, reserved::float, damaged::float, expired::float,
                in_transit::float, available::float,
                created_at, updated_at
         FROM inventory_balances
         WHERE location_id = $1 AND variant_id = $2`;

    const params = orgId ? [locationId, variantId, orgId] : [locationId, variantId];
    const res = await db.query<InventoryBalanceRecord>(querySql, params);
    return res.rows[0] || null;
  }

  async lockBalance(
    organizationId: string,
    locationId: string,
    variantId: string,
    client: DatabaseClient
  ): Promise<InventoryBalanceRecord | null> {
    const res = await client.query<InventoryBalanceRecord>(
      `SELECT id, organization_id, location_id, variant_id,
              on_hand::float, reserved::float, damaged::float, expired::float,
              in_transit::float, available::float,
              created_at, updated_at
       FROM inventory_balances
       WHERE location_id = $1 AND variant_id = $2 AND organization_id = $3
       FOR UPDATE`,
      [locationId, variantId, organizationId]
    );
    return res.rows[0] || null;
  }

  async listBalancesByLocation(
    locationId: string,
    orgIdOrClient?: string | DatabaseClient,
    client?: DatabaseClient
  ): Promise<InventoryBalanceRecord[]> {
    const orgId = typeof orgIdOrClient === 'string' ? orgIdOrClient : undefined;
    const activeClient = typeof orgIdOrClient !== 'string' ? (orgIdOrClient as DatabaseClient) : client;
    const db = this.getClient(activeClient);

    const querySql = orgId
      ? `SELECT id, organization_id, location_id, variant_id,
                on_hand::float, reserved::float, damaged::float, expired::float,
                in_transit::float, available::float,
                created_at, updated_at
         FROM inventory_balances
         WHERE location_id = $1 AND organization_id = $2
         ORDER BY updated_at DESC`
      : `SELECT id, organization_id, location_id, variant_id,
                on_hand::float, reserved::float, damaged::float, expired::float,
                in_transit::float, available::float,
                created_at, updated_at
         FROM inventory_balances
         WHERE location_id = $1
         ORDER BY updated_at DESC`;

    const params = orgId ? [locationId, orgId] : [locationId];
    const res = await db.query<InventoryBalanceRecord>(querySql, params);
    return res.rows;
  }

  /**
   * Records an inventory movement atomically, maintaining an immutable inventory movement ledger
   * and updating the location's inventory balance.
   * 
   * CONCURRENCY & INTEGRITY CONTROLS (INV-001):
   * - Transaction boundary: balance lookup, validation, movement insertion, and balance update are executed inside a single transaction.
   * - Row locking: balance row is locked with FOR UPDATE to serialize concurrent updates on the variant at this location.
   * - Tenant isolation: verifies location and variant ownership.
   * - Negative stock rule: strictly prohibits negative balance unless allowNegativeStock: true is specified.
   * - Idempotency: protects against duplicate movement ID or idempotency_key.
   * - Mathematical invariant: assertLedgerInvariant(previous_balance, quantity_change, new_balance).
   */
  async recordMovement(
    params: {
      id: string;
      organization_id?: string;
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
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      const orgId = params.organization_id || 'org_default';

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
        const existingKeyMov = await tx.query<InventoryMovementRecord>(
          `SELECT id, organization_id, location_id, variant_id, movement_type,
                  quantity_change::float, previous_balance::float, new_balance::float,
                  unit_cost::float, reference_type, reference_id, reason, performed_by, notes,
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
            movement: existingKeyMov.rows[0],
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

      // 4. Acquire pessimistic row lock (FOR UPDATE) to serialize concurrent updates
      const lockedBal = await tx.query<InventoryBalanceRecord>(
        `SELECT id, organization_id, location_id, variant_id,
                on_hand::float, reserved::float, damaged::float, expired::float,
                in_transit::float, available::float
         FROM inventory_balances
         WHERE location_id = $1 AND variant_id = $2
         FOR UPDATE`,
        [params.location_id, params.variant_id]
      );

      const actualBalanceId = lockedBal.rows[0].id;
      const currentOnHand = roundQty(Number(lockedBal.rows[0].on_hand));
      const currentReserved = roundQty(Number(lockedBal.rows[0].reserved));
      const currentDamaged = roundQty(Number(lockedBal.rows[0].damaged));
      const currentExpired = roundQty(Number(lockedBal.rows[0].expired));

      // Exact decimal arithmetic with 4 decimal places precision
      const roundedQuantityChange = roundQty(params.quantity_change);
      const newOnHand = roundQty(addQty(currentOnHand, roundedQuantityChange));

      // Invariant assertion: previous + delta === new
      assertLedgerInvariant(currentOnHand, roundedQuantityChange, newOnHand);

      // 5. Negative stock validation rule
      if (newOnHand < 0 && !params.allowNegativeStock) {
        throw new Error(
          `INSUFFICIENT_STOCK: Inventory movement of ${roundedQuantityChange} would cause negative stock balance (${newOnHand}) ` +
          `for variant ${params.variant_id} at location ${params.location_id}. Current balance: ${currentOnHand}.`
        );
      }

      // 6. Availability validation rule: available cannot drop below 0 if deducting on-hand stock
      const newAvailable = calculateAvailable(newOnHand, currentReserved, currentDamaged, currentExpired);
      if (roundedQuantityChange < 0 && newAvailable < 0 && !params.allowNegativeStock) {
        throw new Error(
          `INSUFFICIENT_STOCK: Inventory deduction of ${Math.abs(roundedQuantityChange)} exceeds available stock (${calculateAvailable(currentOnHand, currentReserved, currentDamaged, currentExpired)}) ` +
          `for variant ${params.variant_id} at location ${params.location_id}.`
        );
      }

      // 7. Insert into inventory_movements (immutable movement ledger - append only)
      const movRes = await tx.query<InventoryMovementRecord>(
        `INSERT INTO inventory_movements (
          id, organization_id, location_id, variant_id, movement_type,
          quantity_change, previous_balance, new_balance, unit_cost,
          reference_type, reference_id, reason, performed_by, notes,
          source_location_id, destination_location_id, idempotency_key,
          source_system, source_reference
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING id, organization_id, location_id, variant_id, movement_type,
                  quantity_change::float, previous_balance::float, new_balance::float,
                  unit_cost::float, reference_type, reference_id, reason, performed_by, notes,
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
          params.unit_cost ?? 0,
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
      const updatedBalRes = await tx.query<InventoryBalanceRecord>(
        `UPDATE inventory_balances
         SET on_hand = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, organization_id, location_id, variant_id,
                   on_hand::float, reserved::float, damaged::float, expired::float,
                   in_transit::float, available::float,
                   created_at, updated_at`,
        [newOnHand, actualBalanceId]
      );

      return {
        balance: updatedBalRes.rows[0],
        movement: movRes.rows[0],
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

      // 2. Lock row FOR UPDATE
      const lockedBal = await tx.query<InventoryBalanceRecord>(
        `SELECT id, organization_id, location_id, variant_id,
                on_hand::float, reserved::float, damaged::float, expired::float,
                in_transit::float, available::float
         FROM inventory_balances
         WHERE location_id = $1 AND variant_id = $2 AND organization_id = $3
         FOR UPDATE`,
        [params.location_id, params.variant_id, params.organization_id]
      );

      const bal = lockedBal.rows[0];
      const currentReserved = roundQty(Number(bal.reserved));
      const currentOnHand = roundQty(Number(bal.on_hand));
      const currentDamaged = roundQty(Number(bal.damaged));
      const currentExpired = roundQty(Number(bal.expired));
      const newReserved = roundQty(addQty(currentReserved, params.delta_reserved));

      if (newReserved < 0) {
        throw new Error(
          `INVALID_RESERVATION: Cannot reduce reserved below zero (current: ${currentReserved}, delta: ${params.delta_reserved}).`
        );
      }

      // Check if new reservation exceeds available stock
      if (params.delta_reserved > 0) {
        const availableBefore = calculateAvailable(currentOnHand, currentReserved, currentDamaged, currentExpired);
        if (params.delta_reserved > availableBefore) {
          throw new Error(
            `INSUFFICIENT_STOCK_FOR_RESERVATION: Requested reservation of ${params.delta_reserved} exceeds available stock (${availableBefore}).`
          );
        }
      }

      const res = await tx.query<InventoryBalanceRecord>(
        `UPDATE inventory_balances
         SET reserved = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, organization_id, location_id, variant_id,
                   on_hand::float, reserved::float, damaged::float, expired::float,
                   in_transit::float, available::float,
                   created_at, updated_at`,
        [newReserved, bal.id]
      );
      return res.rows[0];
    });
  }

  /**
   * Adjusts quarantined damaged or expired stock.
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

      // 2. Lock row
      const lockedBal = await tx.query<InventoryBalanceRecord>(
        `SELECT id, organization_id, location_id, variant_id,
                on_hand::float, reserved::float, damaged::float, expired::float,
                in_transit::float, available::float
         FROM inventory_balances
         WHERE location_id = $1 AND variant_id = $2 AND organization_id = $3
         FOR UPDATE`,
        [params.location_id, params.variant_id, params.organization_id]
      );

      const bal = lockedBal.rows[0];
      const currentOnHand = roundQty(Number(bal.on_hand));
      const currentReserved = roundQty(Number(bal.reserved));
      const currentDamaged = roundQty(Number(bal.damaged));
      const currentExpired = roundQty(Number(bal.expired));
      const currentAvailable = calculateAvailable(currentOnHand, currentReserved, currentDamaged, currentExpired);

      if (params.quantity > currentAvailable) {
        throw new Error(
          `INSUFFICIENT_AVAILABLE_STOCK: Cannot quarantine ${params.quantity} units as ${params.type}. Available: ${currentAvailable}.`
        );
      }

      const columnToUpdate = params.type === 'damage' ? 'damaged' : 'expired';
      const currentVal = params.type === 'damage' ? currentDamaged : currentExpired;
      const newVal = roundQty(addQty(currentVal, params.quantity));

      const updated = await tx.query<InventoryBalanceRecord>(
        `UPDATE inventory_balances
         SET ${columnToUpdate} = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, organization_id, location_id, variant_id,
                   on_hand::float, reserved::float, damaged::float, expired::float,
                   in_transit::float, available::float,
                   created_at, updated_at`,
        [newVal, bal.id]
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

      return updated.rows[0];
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
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      // 1. Lock row
      const lockedBal = await tx.query<InventoryBalanceRecord>(
        `SELECT id, organization_id, location_id, variant_id,
                on_hand::float, reserved::float, damaged::float, expired::float,
                in_transit::float, available::float
         FROM inventory_balances
         WHERE location_id = $1 AND variant_id = $2 AND organization_id = $3
         FOR UPDATE`,
        [params.location_id, params.variant_id, params.organization_id]
      );

      if (lockedBal.rows.length === 0) {
        throw new Error('BALANCE_NOT_FOUND: No stock balance found for write-off.');
      }

      const bal = lockedBal.rows[0];
      const currentOnHand = roundQty(Number(bal.on_hand));
      const currentDamaged = roundQty(Number(bal.damaged));
      const currentExpired = roundQty(Number(bal.expired));
      const currentQuarantined = params.type === 'damage' ? currentDamaged : currentExpired;

      if (params.quantity > currentQuarantined) {
        throw new Error(
          `INSUFFICIENT_QUARANTINED_STOCK: Cannot write off ${params.quantity} units. Quarantined (${params.type}): ${currentQuarantined}.`
        );
      }

      const newOnHand = roundQty(subQty(currentOnHand, params.quantity));
      const newQuarantined = roundQty(subQty(currentQuarantined, params.quantity));
      const columnToUpdate = params.type === 'damage' ? 'damaged' : 'expired';

      // Record write-off movement in ledger
      const movId = `mov_woff_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const movType: MovementType = params.type === 'damage' ? 'DAMAGE_WRITE_OFF' : 'EXPIRY_WRITE_OFF';

      const movRes = await tx.query<InventoryMovementRecord>(
        `INSERT INTO inventory_movements (
          id, organization_id, location_id, variant_id, movement_type,
          quantity_change, previous_balance, new_balance, unit_cost,
          reason, performed_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11)
        RETURNING id, organization_id, location_id, variant_id, movement_type,
                  quantity_change::float, previous_balance::float, new_balance::float,
                  unit_cost::float, reference_type, reference_id, reason, performed_by, notes,
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

      const balRes = await tx.query<InventoryBalanceRecord>(
        `UPDATE inventory_balances
         SET on_hand = $1, ${columnToUpdate} = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id, organization_id, location_id, variant_id,
                   on_hand::float, reserved::float, damaged::float, expired::float,
                   in_transit::float, available::float,
                   created_at, updated_at`,
        [newOnHand, newQuarantined, bal.id]
      );

      return {
        balance: balRes.rows[0],
        movement: movRes.rows[0],
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
        const lockedDest = await tx.query<InventoryBalanceRecord>(
          `SELECT id, in_transit::float
           FROM inventory_balances
           WHERE location_id = $1 AND variant_id = $2 AND organization_id = $3
           FOR UPDATE`,
          [params.destination_location_id, item.variant_id, params.organization_id]
        );

        const currentInTransit = roundQty(Number(lockedDest.rows[0].in_transit));
        const newInTransit = roundQty(addQty(currentInTransit, item.quantity));

        await tx.query(
          `UPDATE inventory_balances
           SET in_transit = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newInTransit, lockedDest.rows[0].id]
        );
      }
    });
  }

  /**
   * Atomic multi-location transfer receipt:
   * 1. Destination location in_transit is decremented.
   * 2. Destination location on_hand is incremented by received_quantity, recording TRANSFER_IN movement.
   * 3. Handles variance.
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

        const lockedDest = await tx.query<InventoryBalanceRecord>(
          `SELECT id, in_transit::float
           FROM inventory_balances
           WHERE location_id = $1 AND variant_id = $2 AND organization_id = $3
           FOR UPDATE`,
          [params.destination_location_id, item.variant_id, params.organization_id]
        );

        const currentInTransit = roundQty(Number(lockedDest.rows[0].in_transit));
        const newInTransit = Math.max(0, roundQty(subQty(currentInTransit, item.dispatched_quantity)));

        await tx.query(
          `UPDATE inventory_balances
           SET in_transit = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newInTransit, lockedDest.rows[0].id]
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
      organizationId?: string;
      locationId?: string;
      variantId?: string;
      movementType?: MovementType;
      limit?: number;
      offset?: number;
    } = {},
    client?: DatabaseClient
  ): Promise<InventoryMovementRecord[]> {
    const db = this.getClient(client);
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.organizationId) {
      params.push(options.organizationId);
      conditions.push(`organization_id = $${params.length}`);
    }
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const query = `
      SELECT id, organization_id, location_id, variant_id, movement_type,
             quantity_change::float, previous_balance::float, new_balance::float,
             unit_cost::float, reference_type, reference_id, reason, performed_by, notes,
             source_location_id, destination_location_id, idempotency_key,
             source_system, source_reference, created_at
      FROM inventory_movements
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const res = await db.query<InventoryMovementRecord>(query, params);
    return res.rows;
  }
}
