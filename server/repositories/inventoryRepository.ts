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
    client?: DatabaseClient
  ): Promise<InventoryBalanceRecord | null> {
    const db = this.getClient(client);
    const res = await db.query<InventoryBalanceRecord>(
      `SELECT id, organization_id, location_id, variant_id,
              on_hand::float, reserved::float, available::float,
              created_at, updated_at
       FROM inventory_balances
       WHERE location_id = $1 AND variant_id = $2`,
      [locationId, variantId]
    );
    return res.rows[0] || null;
  }

  async listBalancesByLocation(
    locationId: string,
    client?: DatabaseClient
  ): Promise<InventoryBalanceRecord[]> {
    const db = this.getClient(client);
    const res = await db.query<InventoryBalanceRecord>(
      `SELECT id, organization_id, location_id, variant_id,
              on_hand::float, reserved::float, available::float,
              created_at, updated_at
       FROM inventory_balances
       WHERE location_id = $1
       ORDER BY updated_at DESC`,
      [locationId]
    );
    return res.rows;
  }

  /**
   * Records an inventory movement atomically, maintaining double-entry movement ledger
   * and updating the location's inventory balance.
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
    },
    client?: DatabaseClient
  ): Promise<{ balance: InventoryBalanceRecord; movement: InventoryMovementRecord }> {
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      const orgId = params.organization_id || 'org_default';

      // 1. Ensure balance row exists or lock existing row
      const existingBal = await tx.query<InventoryBalanceRecord>(
        `SELECT id, organization_id, location_id, variant_id,
                on_hand::float, reserved::float, available::float
         FROM inventory_balances
         WHERE location_id = $1 AND variant_id = $2
         FOR UPDATE`,
        [params.location_id, params.variant_id]
      );

      let balanceId: string;
      let currentOnHand = 0;
      let currentReserved = 0;

      if (existingBal.rows.length === 0) {
        balanceId = `bal_${params.location_id}_${params.variant_id}`;
        currentOnHand = 0;
        currentReserved = 0;
        await tx.query(
          `INSERT INTO inventory_balances (id, organization_id, location_id, variant_id, on_hand, reserved)
           VALUES ($1, $2, $3, $4, 0, 0)`,
          [balanceId, orgId, params.location_id, params.variant_id]
        );
      } else {
        balanceId = existingBal.rows[0].id;
        currentOnHand = Number(existingBal.rows[0].on_hand);
        currentReserved = Number(existingBal.rows[0].reserved);
      }

      const newOnHand = currentOnHand + params.quantity_change;

      // 2. Insert into inventory_movements (immutable ledger)
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
          params.quantity_change,
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

      // 3. Update inventory_balances
      const updatedBalRes = await tx.query<InventoryBalanceRecord>(
        `UPDATE inventory_balances
         SET on_hand = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, organization_id, location_id, variant_id,
                   on_hand::float, reserved::float, available::float,
                   created_at, updated_at`,
        [newOnHand, balanceId]
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
