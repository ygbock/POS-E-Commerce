import { DatabaseClient, getDatabaseClient } from '../db/client';
import {
  InventoryTransferRecord,
  InventoryTransferItemRecord,
  TransferStatus,
} from '../inventory/inventoryTypes';

/**
 * Inventory Transfer Repository (INV-001)
 * 
 * Manages multi-location stock transfer headers, transfer items, and status lifecycles.
 */
export class InventoryTransferRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  async createTransferWithItems(
    transferData: {
      id: string;
      organization_id: string;
      transfer_number: string;
      source_location_id: string;
      destination_location_id: string;
      status?: TransferStatus;
      requested_by: string;
      notes?: string;
    },
    items: Array<{
      id: string;
      variant_id: string;
      requested_quantity: number;
      approved_quantity?: number;
      notes?: string;
    }>,
    client?: DatabaseClient
  ): Promise<{ transfer: InventoryTransferRecord; items: InventoryTransferItemRecord[] }> {
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      // 1. Insert header
      const transferRes = await tx.query<InventoryTransferRecord>(
        `INSERT INTO inventory_transfers (
          id, organization_id, transfer_number, source_location_id,
          destination_location_id, status, requested_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, organization_id, transfer_number, source_location_id,
                  destination_location_id, status, requested_by, approved_by,
                  dispatched_by, received_by, requested_at, approved_at,
                  dispatched_at, received_at, completed_at, notes, created_at, updated_at`,
        [
          transferData.id,
          transferData.organization_id,
          transferData.transfer_number,
          transferData.source_location_id,
          transferData.destination_location_id,
          transferData.status || 'DRAFT',
          transferData.requested_by,
          transferData.notes || null,
        ]
      );

      const createdTransfer = transferRes.rows[0];
      const createdItems: InventoryTransferItemRecord[] = [];

      // 2. Insert items
      for (const item of items) {
        const itemRes = await tx.query<InventoryTransferItemRecord>(
          `INSERT INTO inventory_transfer_items (
            id, transfer_id, variant_id, requested_quantity, approved_quantity, notes
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, transfer_id, variant_id,
                    requested_quantity::float, approved_quantity::float,
                    dispatched_quantity::float, received_quantity::float,
                    variance_quantity::float, notes, created_at`,
          [
            item.id,
            transferData.id,
            item.variant_id,
            item.requested_quantity,
            item.approved_quantity ?? item.requested_quantity,
            item.notes || null,
          ]
        );
        createdItems.push(itemRes.rows[0]);
      }

      return {
        transfer: createdTransfer,
        items: createdItems,
      };
    });
  }

  async findTransferById(
    id: string,
    organizationId?: string,
    client?: DatabaseClient
  ): Promise<{ transfer: InventoryTransferRecord; items: InventoryTransferItemRecord[] } | null> {
    const db = this.getClient(client);

    const transferQuery = organizationId
      ? `SELECT id, organization_id, transfer_number, source_location_id,
                destination_location_id, status, requested_by, approved_by,
                dispatched_by, received_by, requested_at, approved_at,
                dispatched_at, received_at, completed_at, notes, created_at, updated_at
         FROM inventory_transfers
         WHERE id = $1 AND organization_id = $2`
      : `SELECT id, organization_id, transfer_number, source_location_id,
                destination_location_id, status, requested_by, approved_by,
                dispatched_by, received_by, requested_at, approved_at,
                dispatched_at, received_at, completed_at, notes, created_at, updated_at
         FROM inventory_transfers
         WHERE id = $1`;

    const transferParams = organizationId ? [id, organizationId] : [id];
    const transferRes = await db.query<InventoryTransferRecord>(transferQuery, transferParams);
    if (transferRes.rows.length === 0) {
      return null;
    }

    const itemsRes = await db.query<InventoryTransferItemRecord>(
      `SELECT id, transfer_id, variant_id,
              requested_quantity::float, approved_quantity::float,
              dispatched_quantity::float, received_quantity::float,
              variance_quantity::float, notes, created_at
       FROM inventory_transfer_items
       WHERE transfer_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    return {
      transfer: transferRes.rows[0],
      items: itemsRes.rows,
    };
  }

  async listTransfers(
    options: {
      organizationId?: string;
      sourceLocationId?: string;
      destinationLocationId?: string;
      status?: TransferStatus;
      limit?: number;
      offset?: number;
    } = {},
    client?: DatabaseClient
  ): Promise<InventoryTransferRecord[]> {
    const db = this.getClient(client);
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.organizationId) {
      params.push(options.organizationId);
      conditions.push(`organization_id = $${params.length}`);
    }
    if (options.sourceLocationId) {
      params.push(options.sourceLocationId);
      conditions.push(`source_location_id = $${params.length}`);
    }
    if (options.destinationLocationId) {
      params.push(options.destinationLocationId);
      conditions.push(`destination_location_id = $${params.length}`);
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
      SELECT id, organization_id, transfer_number, source_location_id,
             destination_location_id, status, requested_by, approved_by,
             dispatched_by, received_by, requested_at, approved_at,
             dispatched_at, received_at, completed_at, notes, created_at, updated_at
      FROM inventory_transfers
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const res = await db.query<InventoryTransferRecord>(query, params);
    return res.rows;
  }

  async updateTransferStatus(
    id: string,
    updates: {
      status: TransferStatus;
      approved_by?: string;
      approved_at?: string;
      dispatched_by?: string;
      dispatched_at?: string;
      received_by?: string;
      received_at?: string;
      completed_at?: string;
      notes?: string;
    },
    organizationId?: string,
    client?: DatabaseClient
  ): Promise<InventoryTransferRecord | null> {
    const db = this.getClient(client);
    const setParts: string[] = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [updates.status];

    if (updates.approved_by !== undefined) {
      params.push(updates.approved_by);
      setParts.push(`approved_by = $${params.length}`);
      params.push(updates.approved_at || new Date().toISOString());
      setParts.push(`approved_at = $${params.length}`);
    }
    if (updates.dispatched_by !== undefined) {
      params.push(updates.dispatched_by);
      setParts.push(`dispatched_by = $${params.length}`);
      params.push(updates.dispatched_at || new Date().toISOString());
      setParts.push(`dispatched_at = $${params.length}`);
    }
    if (updates.received_by !== undefined) {
      params.push(updates.received_by);
      setParts.push(`received_by = $${params.length}`);
      params.push(updates.received_at || new Date().toISOString());
      setParts.push(`received_at = $${params.length}`);
    }
    if (updates.completed_at !== undefined) {
      params.push(updates.completed_at);
      setParts.push(`completed_at = $${params.length}`);
    }
    if (updates.notes !== undefined) {
      params.push(updates.notes);
      setParts.push(`notes = $${params.length}`);
    }

    params.push(id);
    let whereClause = `WHERE id = $${params.length}`;
    if (organizationId) {
      params.push(organizationId);
      whereClause += ` AND organization_id = $${params.length}`;
    }

    const query = `
      UPDATE inventory_transfers
      SET ${setParts.join(', ')}
      ${whereClause}
      RETURNING id, organization_id, transfer_number, source_location_id,
                destination_location_id, status, requested_by, approved_by,
                dispatched_by, received_by, requested_at, approved_at,
                dispatched_at, received_at, completed_at, notes, created_at, updated_at
    `;

    const res = await db.query<InventoryTransferRecord>(query, params);
    return res.rows[0] || null;
  }

  async updateItemDispatched(
    itemId: string,
    dispatchedQty: number,
    client?: DatabaseClient
  ): Promise<InventoryTransferItemRecord | null> {
    const db = this.getClient(client);
    const res = await db.query<InventoryTransferItemRecord>(
      `UPDATE inventory_transfer_items
       SET dispatched_quantity = $1
       WHERE id = $2
       RETURNING id, transfer_id, variant_id,
                 requested_quantity::float, approved_quantity::float,
                 dispatched_quantity::float, received_quantity::float,
                 variance_quantity::float, notes, created_at`,
      [dispatchedQty, itemId]
    );
    return res.rows[0] || null;
  }

  async updateItemReceived(
    itemId: string,
    receivedQty: number,
    varianceQty: number,
    client?: DatabaseClient
  ): Promise<InventoryTransferItemRecord | null> {
    const db = this.getClient(client);
    const res = await db.query<InventoryTransferItemRecord>(
      `UPDATE inventory_transfer_items
       SET received_quantity = $1, variance_quantity = $2
       WHERE id = $3
       RETURNING id, transfer_id, variant_id,
                 requested_quantity::float, approved_quantity::float,
                 dispatched_quantity::float, received_quantity::float,
                 variance_quantity::float, notes, created_at`,
      [receivedQty, varianceQty, itemId]
    );
    return res.rows[0] || null;
  }
}
