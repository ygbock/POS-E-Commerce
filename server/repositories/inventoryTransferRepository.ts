import { DatabaseClient, getDatabaseClient } from '../db/client';
import {
  InventoryTransferRecord,
  InventoryTransferItemRecord,
  InventoryTransferEventRecord,
  TransferStatus,
  TransferEventType,
} from '../inventory/inventoryTypes';

/**
 * Inventory Transfer Repository (INV-001)
 * 
 * Manages multi-location stock transfer headers, transfer items, and immutable transfer events.
 * ALL authenticated methods strictly require organizationId to enforce tenant boundary isolation.
 */
export class InventoryTransferRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  /**
   * Creates a stock transfer header with initial items inside an atomic transaction.
   */
  async createTransferWithItems(
    organizationId: string,
    transferData: {
      id: string;
      transfer_number: string;
      source_location_id: string;
      destination_location_id: string;
      status?: TransferStatus;
      requested_by: string;
      idempotency_key?: string | null;
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

    const execute = async (tx: DatabaseClient) => {
      // 1. Insert header
      const transferRes = await tx.query<InventoryTransferRecord>(
        `INSERT INTO inventory_transfers (
          id, organization_id, transfer_number, source_location_id,
          destination_location_id, status, requested_by, idempotency_key, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, organization_id, transfer_number, source_location_id,
                  destination_location_id, status, requested_by, approved_by,
                  dispatched_by, received_by, requested_at, approved_at,
                  dispatched_at, received_at, completed_at, idempotency_key,
                  notes, created_at, updated_at`,
        [
          transferData.id,
          organizationId,
          transferData.transfer_number,
          transferData.source_location_id,
          transferData.destination_location_id,
          transferData.status || 'REQUESTED',
          transferData.requested_by,
          transferData.idempotency_key || null,
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
            item.approved_quantity !== undefined ? item.approved_quantity : item.requested_quantity,
            item.notes || null,
          ]
        );
        createdItems.push(itemRes.rows[0]);
      }

      return {
        transfer: createdTransfer,
        items: createdItems,
      };
    };

    if (client) {
      return execute(client);
    }
    return db.withTransaction(execute);
  }

  /**
   * Retrieves a transfer by ID, strictly scoped to the tenant organization.
   */
  async findTransferById(
    organizationId: string,
    transferId: string,
    client?: DatabaseClient
  ): Promise<{
    transfer: InventoryTransferRecord;
    items: InventoryTransferItemRecord[];
    events: InventoryTransferEventRecord[];
  } | null> {
    const db = this.getClient(client);

    const transferRes = await db.query<InventoryTransferRecord>(
      `SELECT id, organization_id, transfer_number, source_location_id,
              destination_location_id, status, requested_by, approved_by,
              dispatched_by, received_by, requested_at, approved_at,
              dispatched_at, received_at, completed_at, idempotency_key,
              notes, created_at, updated_at
       FROM inventory_transfers
       WHERE id = $1 AND organization_id = $2`,
      [transferId, organizationId]
    );

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
      [transferId]
    );

    const eventsRes = await db.query<InventoryTransferEventRecord>(
      `SELECT id, organization_id, transfer_id, transfer_item_id, event_type,
              from_status, to_status, quantity::float, actor_id, source_location_id,
              destination_location_id, reference_type, reference_id,
              idempotency_key, reason, notes, metadata, created_at
       FROM inventory_transfer_events
       WHERE transfer_id = $1 AND organization_id = $2
       ORDER BY created_at ASC`,
      [transferId, organizationId]
    );

    return {
      transfer: transferRes.rows[0],
      items: itemsRes.rows,
      events: eventsRes.rows,
    };
  }

  /**
   * Finds an existing transfer by its organization-scoped idempotency key.
   */
  async findTransferByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
    client?: DatabaseClient
  ): Promise<{
    transfer: InventoryTransferRecord;
    items: InventoryTransferItemRecord[];
  } | null> {
    const db = this.getClient(client);

    const transferRes = await db.query<InventoryTransferRecord>(
      `SELECT id, organization_id, transfer_number, source_location_id,
              destination_location_id, status, requested_by, approved_by,
              dispatched_by, received_by, requested_at, approved_at,
              dispatched_at, received_at, completed_at, idempotency_key,
              notes, created_at, updated_at
       FROM inventory_transfers
       WHERE organization_id = $1 AND idempotency_key = $2`,
      [organizationId, idempotencyKey]
    );

    if (transferRes.rows.length === 0) {
      return null;
    }

    const transfer = transferRes.rows[0];
    const itemsRes = await db.query<InventoryTransferItemRecord>(
      `SELECT id, transfer_id, variant_id,
              requested_quantity::float, approved_quantity::float,
              dispatched_quantity::float, received_quantity::float,
              variance_quantity::float, notes, created_at
       FROM inventory_transfer_items
       WHERE transfer_id = $1
       ORDER BY created_at ASC`,
      [transfer.id]
    );

    return {
      transfer,
      items: itemsRes.rows,
    };
  }

  /**
   * Finds an existing transfer event by its organization-scoped idempotency key.
   */
  async findEventByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
    client?: DatabaseClient
  ): Promise<InventoryTransferEventRecord | null> {
    const db = this.getClient(client);

    const res = await db.query<InventoryTransferEventRecord>(
      `SELECT id, organization_id, transfer_id, transfer_item_id, event_type,
              from_status, to_status, quantity::float, actor_id, source_location_id,
              destination_location_id, reference_type, reference_id,
              idempotency_key, reason, notes, metadata, created_at
       FROM inventory_transfer_events
       WHERE organization_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [organizationId, idempotencyKey]
    );

    return res.rows[0] || null;
  }

  /**
   * Locks the transfer row for update inside an active transaction.
   */
  async lockTransfer(
    organizationId: string,
    transferId: string,
    client: DatabaseClient
  ): Promise<InventoryTransferRecord | null> {
    const res = await client.query<InventoryTransferRecord>(
      `SELECT id, organization_id, transfer_number, source_location_id,
              destination_location_id, status, requested_by, approved_by,
              dispatched_by, received_by, requested_at, approved_at,
              dispatched_at, received_at, completed_at, idempotency_key,
              notes, created_at, updated_at
       FROM inventory_transfers
       WHERE id = $1 AND organization_id = $2
       FOR UPDATE`,
      [transferId, organizationId]
    );

    return res.rows[0] || null;
  }

  /**
   * Locks all transfer items for update inside an active transaction.
   */
  async lockTransferItems(
    organizationId: string,
    transferId: string,
    client: DatabaseClient
  ): Promise<InventoryTransferItemRecord[]> {
    const res = await client.query<InventoryTransferItemRecord>(
      `SELECT ti.id, ti.transfer_id, ti.variant_id,
              ti.requested_quantity::float, ti.approved_quantity::float,
              ti.dispatched_quantity::float, ti.received_quantity::float,
              ti.variance_quantity::float, ti.notes, ti.created_at
       FROM inventory_transfer_items ti
       INNER JOIN inventory_transfers t ON t.id = ti.transfer_id
       WHERE ti.transfer_id = $1 AND t.organization_id = $2
       ORDER BY ti.created_at ASC
       FOR UPDATE`,
      [transferId, organizationId]
    );

    return res.rows;
  }

  /**
   * Lists transfers filtered by organization and optional criteria.
   */
  async listTransfers(
    organizationId: string,
    options: {
      sourceLocationId?: string;
      destinationLocationId?: string;
      status?: TransferStatus;
      limit?: number;
      offset?: number;
    } = {},
    client?: DatabaseClient
  ): Promise<InventoryTransferRecord[]> {
    const db = this.getClient(client);
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [organizationId];

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

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const query = `
      SELECT id, organization_id, transfer_number, source_location_id,
             destination_location_id, status, requested_by, approved_by,
             dispatched_by, received_by, requested_at, approved_at,
             dispatched_at, received_at, completed_at, idempotency_key,
             notes, created_at, updated_at
      FROM inventory_transfers
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const res = await db.query<InventoryTransferRecord>(query, params);
    return res.rows;
  }

  /**
   * Updates transfer status and audit timestamps.
   */
  async updateTransferStatus(
    organizationId: string,
    transferId: string,
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

    params.push(transferId);
    const transferIdIdx = params.length;
    params.push(organizationId);
    const orgIdIdx = params.length;

    const query = `
      UPDATE inventory_transfers
      SET ${setParts.join(', ')}
      WHERE id = $${transferIdIdx} AND organization_id = $${orgIdIdx}
      RETURNING id, organization_id, transfer_number, source_location_id,
                destination_location_id, status, requested_by, approved_by,
                dispatched_by, received_by, requested_at, approved_at,
                dispatched_at, received_at, completed_at, idempotency_key,
                notes, created_at, updated_at
    `;

    const res = await db.query<InventoryTransferRecord>(query, params);
    return res.rows[0] || null;
  }

  /**
   * Updates dispatched_quantity for a specific transfer item, verified by organization boundary.
   */
  async updateItemDispatched(
    organizationId: string,
    itemId: string,
    dispatchedQty: number,
    client?: DatabaseClient
  ): Promise<InventoryTransferItemRecord | null> {
    const db = this.getClient(client);
    const res = await db.query<InventoryTransferItemRecord>(
      `UPDATE inventory_transfer_items
       SET dispatched_quantity = $1
       WHERE id = $2
         AND transfer_id IN (SELECT id FROM inventory_transfers WHERE organization_id = $3)
       RETURNING id, transfer_id, variant_id,
                 requested_quantity::float, approved_quantity::float,
                 dispatched_quantity::float, received_quantity::float,
                 variance_quantity::float, notes, created_at`,
      [dispatchedQty, itemId, organizationId]
    );
    return res.rows[0] || null;
  }

  /**
   * Updates received_quantity and variance_quantity for a specific transfer item, verified by organization boundary.
   */
  async updateItemReceived(
    organizationId: string,
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
         AND transfer_id IN (SELECT id FROM inventory_transfers WHERE organization_id = $4)
       RETURNING id, transfer_id, variant_id,
                 requested_quantity::float, approved_quantity::float,
                 dispatched_quantity::float, received_quantity::float,
                 variance_quantity::float, notes, created_at`,
      [receivedQty, varianceQty, itemId, organizationId]
    );
    return res.rows[0] || null;
  }

  /**
   * Appends an immutable transfer lifecycle event to the event ledger.
   * Transfer events are append-only; no UPDATE or DELETE queries are exposed.
   */
  async appendEvent(
    organizationId: string,
    eventData: {
      id?: string;
      transfer_id: string;
      transfer_item_id?: string | null;
      event_type: TransferEventType;
      from_status?: TransferStatus | null;
      to_status: TransferStatus;
      quantity?: number;
      actor_id: string;
      source_location_id?: string | null;
      destination_location_id?: string | null;
      reference_type?: string | null;
      reference_id?: string | null;
      idempotency_key?: string | null;
      reason?: string | null;
      notes?: string | null;
      metadata?: Record<string, any> | string | null;
    },
    client?: DatabaseClient
  ): Promise<InventoryTransferEventRecord> {
    const db = this.getClient(client);
    const eventId = eventData.id || `trevt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const metaStr = eventData.metadata
      ? typeof eventData.metadata === 'string'
        ? eventData.metadata
        : JSON.stringify(eventData.metadata)
      : null;

    const res = await db.query<InventoryTransferEventRecord>(
      `INSERT INTO inventory_transfer_events (
        id, organization_id, transfer_id, transfer_item_id, event_type,
        from_status, to_status, quantity, actor_id, source_location_id,
        destination_location_id, reference_type, reference_id,
        idempotency_key, reason, notes, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id, organization_id, transfer_id, transfer_item_id, event_type,
                from_status, to_status, quantity::float, actor_id, source_location_id,
                destination_location_id, reference_type, reference_id,
                idempotency_key, reason, notes, metadata, created_at`,
      [
        eventId,
        organizationId,
        eventData.transfer_id,
        eventData.transfer_item_id || null,
        eventData.event_type,
        eventData.from_status || null,
        eventData.to_status,
        eventData.quantity !== undefined ? eventData.quantity : 0,
        eventData.actor_id,
        eventData.source_location_id || null,
        eventData.destination_location_id || null,
        eventData.reference_type || 'inventory_transfer',
        eventData.reference_id || eventData.transfer_id,
        eventData.idempotency_key || null,
        eventData.reason || null,
        eventData.notes || null,
        metaStr,
      ]
    );

    return res.rows[0];
  }

  /**
   * Retrieves the immutable event ledger for a transfer, ordered chronologically.
   */
  async getTransferEvents(
    organizationId: string,
    transferId: string,
    client?: DatabaseClient
  ): Promise<InventoryTransferEventRecord[]> {
    const db = this.getClient(client);
    const res = await db.query<InventoryTransferEventRecord>(
      `SELECT id, organization_id, transfer_id, transfer_item_id, event_type,
              from_status, to_status, quantity::float, actor_id, source_location_id,
              destination_location_id, reference_type, reference_id,
              idempotency_key, reason, notes, metadata, created_at
       FROM inventory_transfer_events
       WHERE transfer_id = $1 AND organization_id = $2
       ORDER BY created_at ASC`,
      [transferId, organizationId]
    );
    return res.rows;
  }
}
