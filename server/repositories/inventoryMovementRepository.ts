import { DatabaseClient, getDatabaseClient } from '../db/client';
import { InventoryMovementRecord, MovementType } from '../inventory/inventoryTypes';

/**
 * Inventory Movement Repository (INV-001)
 * 
 * Read-only & append repository for the immutable inventory movement ledger.
 * Update and delete operations are strictly prohibited on movement records.
 */
export class InventoryMovementRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  async findById(
    id: string,
    organizationId?: string,
    client?: DatabaseClient
  ): Promise<InventoryMovementRecord | null> {
    const db = this.getClient(client);
    const query = organizationId
      ? `SELECT id, organization_id, location_id, variant_id, movement_type,
                quantity_change::float, previous_balance::float, new_balance::float,
                unit_cost::float, reference_type, reference_id, reason, performed_by, notes,
                source_location_id, destination_location_id, idempotency_key,
                source_system, source_reference, created_at
         FROM inventory_movements
         WHERE id = $1 AND organization_id = $2`
      : `SELECT id, organization_id, location_id, variant_id, movement_type,
                quantity_change::float, previous_balance::float, new_balance::float,
                unit_cost::float, reference_type, reference_id, reason, performed_by, notes,
                source_location_id, destination_location_id, idempotency_key,
                source_system, source_reference, created_at
         FROM inventory_movements
         WHERE id = $1`;

    const params = organizationId ? [id, organizationId] : [id];
    const res = await db.query<InventoryMovementRecord>(query, params);
    return res.rows[0] || null;
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
    client?: DatabaseClient
  ): Promise<InventoryMovementRecord | null> {
    const db = this.getClient(client);
    const query = `
      SELECT id, organization_id, location_id, variant_id, movement_type,
             quantity_change::float, previous_balance::float, new_balance::float,
             unit_cost::float, reference_type, reference_id, reason, performed_by, notes,
             source_location_id, destination_location_id, idempotency_key,
             source_system, source_reference, created_at
      FROM inventory_movements
      WHERE organization_id = $1 AND idempotency_key = $2
      LIMIT 1
    `;
    const res = await db.query<InventoryMovementRecord>(query, [organizationId, idempotencyKey]);
    return res.rows[0] || null;
  }

  async listMovements(
    options: {
      organizationId?: string;
      locationId?: string;
      variantId?: string;
      movementType?: MovementType;
      referenceId?: string;
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
    if (options.referenceId) {
      params.push(options.referenceId);
      conditions.push(`reference_id = $${params.length}`);
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
