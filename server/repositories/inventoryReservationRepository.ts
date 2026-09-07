import { DatabaseClient, getDatabaseClient } from '../db/client';
import { InventoryReservationRecord, ReservationStatus } from '../inventory/inventoryTypes';
import { toQtyString } from '../inventory/inventoryPolicies';

function mapReservationRow(row: any): InventoryReservationRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    location_id: row.location_id,
    variant_id: row.variant_id,
    quantity: toQtyString(row.quantity),
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    status: row.status,
    idempotency_key: row.idempotency_key || null,
    notes: row.notes || null,
    expires_at: row.expires_at || null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Inventory Reservation Repository (INV-001 / INV-001R3)
 * 
 * Manages first-class reservation records for orders, carts, and stock holds.
 * All quantities are stored and retrieved as exact decimal strings (NUMERIC 14,4).
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
      quantity: string;
      reference_type: string;
      reference_id: string;
      status?: ReservationStatus;
      idempotency_key?: string | null;
      notes?: string | null;
      expires_at?: string | null;
      created_by: string;
    },
    client?: DatabaseClient
  ): Promise<InventoryReservationRecord> {
    if (!data.organization_id || typeof data.organization_id !== 'string' || data.organization_id.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organization_id is required for createReservation.');
    }
    const db = this.getClient(client);
    const qtyStr = toQtyString(data.quantity);
    const query = `
      INSERT INTO inventory_reservations (
        id, organization_id, location_id, variant_id, quantity,
        reference_type, reference_id, status, idempotency_key, notes, expires_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, organization_id, location_id, variant_id,
                quantity::text, reference_type, reference_id,
                status, idempotency_key, notes, expires_at, created_by, created_at, updated_at
    `;
    const res = await db.query(query, [
      data.id,
      data.organization_id,
      data.location_id,
      data.variant_id,
      qtyStr,
      data.reference_type,
      data.reference_id,
      data.status || 'ACTIVE',
      data.idempotency_key || null,
      data.notes || null,
      data.expires_at || null,
      data.created_by,
    ]);
    return mapReservationRow(res.rows[0]);
  }

  async findById(
    organizationId: string,
    id: string,
    client?: DatabaseClient
  ): Promise<InventoryReservationRecord | null> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is required for findById.');
    }
    const db = this.getClient(client);
    const query = `
      SELECT id, organization_id, location_id, variant_id,
             quantity::text, reference_type, reference_id,
             status, idempotency_key, notes, expires_at, created_by, created_at, updated_at
      FROM inventory_reservations
      WHERE id = $1 AND organization_id = $2
    `;
    const res = await db.query(query, [id, organizationId]);
    if (!res.rows[0]) return null;
    return mapReservationRow(res.rows[0]);
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
    client?: DatabaseClient
  ): Promise<InventoryReservationRecord | null> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is required for findByIdempotencyKey.');
    }
    const db = this.getClient(client);
    const query = `
      SELECT id, organization_id, location_id, variant_id,
             quantity::text, reference_type, reference_id,
             status, idempotency_key, notes, expires_at, created_by, created_at, updated_at
      FROM inventory_reservations
      WHERE organization_id = $1 AND idempotency_key = $2
      LIMIT 1
    `;
    const res = await db.query(query, [organizationId, idempotencyKey]);
    if (!res.rows[0]) return null;
    return mapReservationRow(res.rows[0]);
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: ReservationStatus,
    client?: DatabaseClient
  ): Promise<InventoryReservationRecord | null> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is required for updateStatus.');
    }
    const db = this.getClient(client);
    const query = `
      UPDATE inventory_reservations
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND organization_id = $3
      RETURNING id, organization_id, location_id, variant_id,
                quantity::text, reference_type, reference_id,
                status, idempotency_key, notes, expires_at, created_by, created_at, updated_at
    `;
    const res = await db.query(query, [status, id, organizationId]);
    if (!res.rows[0]) return null;
    return mapReservationRow(res.rows[0]);
  }

  async findExpiredReservations(
    organizationId?: string,
    client?: DatabaseClient
  ): Promise<InventoryReservationRecord[]> {
    const db = this.getClient(client);
    const conditions = [`status = 'ACTIVE'`, `expires_at IS NOT NULL`, `expires_at < CURRENT_TIMESTAMP`];
    const params: any[] = [];
    if (organizationId) {
      params.push(organizationId);
      conditions.push(`organization_id = $${params.length}`);
    }
    const query = `
      SELECT id, organization_id, location_id, variant_id,
             quantity::text, reference_type, reference_id,
             status, idempotency_key, notes, expires_at, created_by, created_at, updated_at
      FROM inventory_reservations
      WHERE ${conditions.join(' AND ')}
      ORDER BY expires_at ASC
    `;
    const res = await db.query(query, params);
    return res.rows.map(mapReservationRow);
  }

  async listReservations(
    options: {
      organizationId: string;
      locationId?: string;
      variantId?: string;
      referenceType?: string;
      referenceId?: string;
      status?: ReservationStatus;
      limit?: number;
      offset?: number;
    },
    client?: DatabaseClient
  ): Promise<InventoryReservationRecord[]> {
    if (!options.organizationId || typeof options.organizationId !== 'string' || options.organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is required for listReservations.');
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

    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const query = `
      SELECT id, organization_id, location_id, variant_id,
             quantity::text, reference_type, reference_id,
             status, idempotency_key, notes, expires_at, created_by, created_at, updated_at
      FROM inventory_reservations
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const res = await db.query(query, params);
    return res.rows.map(mapReservationRow);
  }
}
