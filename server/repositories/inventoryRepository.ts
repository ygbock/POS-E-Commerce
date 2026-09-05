import { DatabaseClient, getDatabaseClient } from '../db/client';

export interface InventoryBalanceRecord {
  id: string;
  organization_id: string;
  location_id: string;
  variant_id: string;
  on_hand: number;
  reserved: number;
  available: number;
  created_at?: string;
  updated_at?: string;
}

export type MovementType =
  | 'PURCHASE_RECEIVE'
  | 'POS_SALE'
  | 'ECOMMERCE_SALE'
  | 'SALE_RETURN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT_DAMAGE'
  | 'ADJUSTMENT_EXPIRED'
  | 'ADJUSTMENT_STOCKTAKE'
  | 'ADJUSTMENT_CORRECTION'
  | 'DAMAGE_WRITE_OFF'
  | 'INVENTORY_COUNT';

export interface InventoryMovementRecord {
  id: string;
  organization_id?: string;
  location_id: string;
  variant_id: string;
  movement_type: MovementType;
  quantity_change: number;
  previous_balance: number;
  new_balance: number;
  unit_cost?: number;
  reference_type?: string | null;
  reference_id?: string | null;
  reason?: string | null;
  performed_by: string;
  notes?: string | null;
  created_at?: string;
}

export class InventoryRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
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
                on_hand::float, reserved::float, available::float,
                created_at, updated_at
         FROM inventory_balances
         WHERE location_id = $1 AND variant_id = $2 AND organization_id = $3`
      : `SELECT id, organization_id, location_id, variant_id,
                on_hand::float, reserved::float, available::float,
                created_at, updated_at
         FROM inventory_balances
         WHERE location_id = $1 AND variant_id = $2`;

    const params = orgId ? [locationId, variantId, orgId] : [locationId, variantId];
    const res = await db.query<InventoryBalanceRecord>(querySql, params);
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
                on_hand::float, reserved::float, available::float,
                created_at, updated_at
         FROM inventory_balances
         WHERE location_id = $1 AND organization_id = $2
         ORDER BY updated_at DESC`
      : `SELECT id, organization_id, location_id, variant_id,
                on_hand::float, reserved::float, available::float,
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
   * CONCURRENCY & INTEGRITY CONTROLS:
   * - Transaction boundary: balance lookup, validation, movement insertion, and balance update are executed inside a single transaction.
   * - Row locking: balance row is locked with FOR UPDATE to prevent race conditions during concurrent updates.
   * - Negative stock rule: by default, prevents stock from dropping below zero unless allowNegativeStock: true is specified.
   * - Idempotency: rejects duplicate movement IDs.
   * - Actor attribution: records performed_by; will be bound to authenticated session identity under SEC-001.
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
      allowNegativeStock?: boolean;
    },
    client?: DatabaseClient
  ): Promise<{ balance: InventoryBalanceRecord; movement: InventoryMovementRecord }> {
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      const orgId = params.organization_id || 'org_default';

      // 1. Idempotency protection: ensure movement ID has not already been processed
      const existingMov = await tx.query('SELECT id FROM inventory_movements WHERE id = $1', [params.id]);
      if (existingMov.rows.length > 0) {
        throw new Error(`DUPLICATE_MOVEMENT: Inventory movement with ID '${params.id}' has already been recorded.`);
      }

      // 2. Ensure balance row exists (upsert without overwriting existing stock)
      const balanceId = `bal_${params.location_id}_${params.variant_id}`;
      await tx.query(
        `INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved)
         VALUES ($1, $2, $3, $4, 0, 0)
         ON CONFLICT (location_id, variant_id) DO NOTHING`,
        [balanceId, orgId, params.location_id, params.variant_id]
      );

      // 3. Acquire pessimistic row lock (FOR UPDATE) to serialize concurrent updates on this variant at this location
      const lockedBal = await tx.query<InventoryBalanceRecord>(
        `SELECT id, organization_id, location_id, variant_id,
                on_hand::float, reserved::float, available::float
         FROM inventory_balances
         WHERE location_id = $1 AND variant_id = $2
         FOR UPDATE`,
        [params.location_id, params.variant_id]
      );

      const actualBalanceId = lockedBal.rows[0].id;
      const currentOnHand = Number(lockedBal.rows[0].on_hand);
      
      // Exact decimal arithmetic with 4 decimal places precision
      const roundedQuantityChange = Math.round(params.quantity_change * 10000) / 10000;
      const newOnHand = Math.round((currentOnHand + roundedQuantityChange) * 10000) / 10000;

      // 4. Negative stock validation rule
      if (newOnHand < 0 && !params.allowNegativeStock) {
        throw new Error(
          `INSUFFICIENT_STOCK: Inventory movement of ${roundedQuantityChange} would cause negative stock balance (${newOnHand}) ` +
          `for variant ${params.variant_id} at location ${params.location_id}. Current balance: ${currentOnHand}.`
        );
      }

      // 5. Insert into inventory_movements (immutable movement ledger - append only)
      const movRes = await tx.query<InventoryMovementRecord>(
        `INSERT INTO inventory_movements (
          id, organization_id, location_id, variant_id, movement_type,
          quantity_change, previous_balance, new_balance, unit_cost,
          reference_type, reference_id, reason, performed_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, organization_id, location_id, variant_id, movement_type,
                  quantity_change::float, previous_balance::float, new_balance::float,
                  unit_cost::float, reference_type, reference_id, reason, performed_by, notes, created_at`,
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
        ]
      );

      // 6. Update inventory_balances with new on-hand balance
      const updatedBalRes = await tx.query<InventoryBalanceRecord>(
        `UPDATE inventory_balances
         SET on_hand = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, organization_id, location_id, variant_id,
                   on_hand::float, reserved::float, available::float,
                   created_at, updated_at`,
        [newOnHand, actualBalanceId]
      );

      return {
        balance: updatedBalRes.rows[0],
        movement: movRes.rows[0],
      };
    });
  }

  async listMovements(
    options: {
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
             unit_cost::float, reference_type, reference_id, reason, performed_by, notes, created_at
      FROM inventory_movements
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const res = await db.query<InventoryMovementRecord>(query, params);
    return res.rows;
  }
}
