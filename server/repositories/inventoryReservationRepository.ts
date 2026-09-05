import { DatabaseClient, getDatabaseClient } from '../db/client';
import { InventoryReservationRecord, ReservationStatus } from '../inventory/inventoryTypes';

/**
 * Inventory Reservation Repository (INV-001)
 * 
 * Manages first-class reservation records for orders, carts, and stock holds.
 */
export class InventoryReservationRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  async createReservation(
    data: {
      id: string;
      organization_id: string;
      location_id: string;
      variant_id: string;
      quantity: number;
      reference_type: string;
      reference_id: string;
      status?: ReservationStatus;
      notes?: string;
      expires_at?: string;
      created_by: string;
    },
    client?: DatabaseClient
  ): Promise<InventoryReservationRecord> {
    const db = this.getClient(client);
    const query = `
      INSERT INTO inventory_reservations (
        id, organization_id, location_id, variant_id, quantity,
        reference_type, reference_id, status, notes, expires_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, organization_id, location_id, variant_id,
                quantity::float, reference_type, reference_id,
                status, notes, expires_at, created_by, created_at, updated_at
    `;
    const res = await db.query<InventoryReservationRecord>(query, [
      data.id,
      data.organization_id,
      data.location_id,
      data.variant_id,
      data.quantity,
      data.reference_type,
      data.reference_id,
      data.status || 'ACTIVE',
      data.notes || null,
      data.expires_at || null,
      data.created_by,
    ]);
    return res.rows[0];
  }

  async findById(
    id: string,
    organizationId?: string,
    client?: DatabaseClient
  ): Promise<InventoryReservationRecord | null> {
    const db = this.getClient(client);
    const query = organizationId
      ? `SELECT id, organization_id, location_id, variant_id,
                quantity::float, reference_type, reference_id,
                status, notes, expires_at, created_by, created_at, updated_at
         FROM inventory_reservations
         WHERE id = $1 AND organization_id = $2`
      : `SELECT id, organization_id, location_id, variant_id,
                quantity::float, reference_type, reference_id,
                status, notes, expires_at, created_by, created_at, updated_at
         FROM inventory_reservations
         WHERE id = $1`;

    const params = organizationId ? [id, organizationId] : [id];
    const res = await db.query<InventoryReservationRecord>(query, params);
    return res.rows[0] || null;
  }

  async updateStatus(
    id: string,
    status: ReservationStatus,
    organizationId?: string,
    client?: DatabaseClient
  ): Promise<InventoryReservationRecord | null> {
    const db = this.getClient(client);
    const query = organizationId
      ? `UPDATE inventory_reservations
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND organization_id = $3
         RETURNING id, organization_id, location_id, variant_id,
                   quantity::float, reference_type, reference_id,
                   status, notes, expires_at, created_by, created_at, updated_at`
      : `UPDATE inventory_reservations
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, organization_id, location_id, variant_id,
                   quantity::float, reference_type, reference_id,
                   status, notes, expires_at, created_by, created_at, updated_at`;

    const params = organizationId ? [status, id, organizationId] : [status, id];
    const res = await db.query<InventoryReservationRecord>(query, params);
    return res.rows[0] || null;
  }

  async listReservations(
    options: {
      organizationId?: string;
      locationId?: string;
      variantId?: string;
      referenceType?: string;
      referenceId?: string;
      status?: ReservationStatus;
      limit?: number;
      offset?: number;
    } = {},
    client?: DatabaseClient
  ): Promise<InventoryReservationRecord[]> {
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
    if (options.referenceType) {
      params.push(options.referenceType);
      conditions.push(`reference_type = $${params.length}`);
    }
    if (options.referenceId) {
      params.push(options.referenceId);
      conditions.push(`reference_id = $${params.length}`);
    }
    if (options.status) {
      params.push(options.status);
      conditions.push(`status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const query = `
      SELECT id, organization_id, location_id, variant_id,
             quantity::float, reference_type, reference_id,
             status, notes, expires_at, created_by, created_at, updated_at
      FROM inventory_reservations
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const res = await db.query<InventoryReservationRecord>(query, params);
    return res.rows;
  }
}
