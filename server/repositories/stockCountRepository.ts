import { DatabaseClient, getDatabaseClient } from '../db/client';
import {
  StockCountRecord,
  StockCountItemRecord,
  StockCountStatus,
} from '../inventory/inventoryTypes';

/**
 * Stock Count Repository (INV-001)
 * 
 * Manages physical inventory counts, cycle counts, stocktake sessions, and counted item records.
 */
export class StockCountRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  async createStockCountWithItems(
    countData: {
      id: string;
      organization_id: string;
      location_id: string;
      count_number: string;
      status?: StockCountStatus;
      created_by: string;
      notes?: string;
    },
    items: Array<{
      id: string;
      variant_id: string;
      system_quantity: number;
      counted_quantity?: number;
      notes?: string;
    }>,
    client?: DatabaseClient
  ): Promise<{ count: StockCountRecord; items: StockCountItemRecord[] }> {
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      // 1. Insert header
      const countRes = await tx.query<StockCountRecord>(
        `INSERT INTO stock_counts (
          id, organization_id, location_id, count_number, status, created_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, organization_id, location_id, count_number, status,
                  created_by, submitted_by, approved_by, notes,
                  created_at, submitted_at, approved_at, updated_at`,
        [
          countData.id,
          countData.organization_id,
          countData.location_id,
          countData.count_number,
          countData.status || 'DRAFT',
          countData.created_by,
          countData.notes || null,
        ]
      );

      const createdCount = countRes.rows[0];
      const createdItems: StockCountItemRecord[] = [];

      // 2. Insert items
      for (const item of items) {
        const itemRes = await tx.query<StockCountItemRecord>(
          `INSERT INTO stock_count_items (
            id, stock_count_id, variant_id, system_quantity, counted_quantity, variance_quantity, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, stock_count_id, variant_id,
                    system_quantity::float, counted_quantity::float,
                    variance_quantity::float, notes, created_at`,
          [
            item.id,
            countData.id,
            item.variant_id,
            item.system_quantity,
            item.counted_quantity ?? item.system_quantity,
            (item.counted_quantity ?? item.system_quantity) - item.system_quantity,
            item.notes || null,
          ]
        );
        createdItems.push(itemRes.rows[0]);
      }

      return {
        count: createdCount,
        items: createdItems,
      };
    });
  }

  async findStockCountById(
    id: string,
    organizationId?: string,
    client?: DatabaseClient
  ): Promise<{ count: StockCountRecord; items: StockCountItemRecord[] } | null> {
    const db = this.getClient(client);

    const countQuery = organizationId
      ? `SELECT id, organization_id, location_id, count_number, status,
                created_by, submitted_by, approved_by, notes,
                created_at, submitted_at, approved_at, updated_at
         FROM stock_counts
         WHERE id = $1 AND organization_id = $2`
      : `SELECT id, organization_id, location_id, count_number, status,
                created_by, submitted_by, approved_by, notes,
                created_at, submitted_at, approved_at, updated_at
         FROM stock_counts
         WHERE id = $1`;

    const countParams = organizationId ? [id, organizationId] : [id];
    const countRes = await db.query<StockCountRecord>(countQuery, countParams);
    if (countRes.rows.length === 0) {
      return null;
    }

    const itemsRes = await db.query<StockCountItemRecord>(
      `SELECT id, stock_count_id, variant_id,
              system_quantity::float, counted_quantity::float,
              variance_quantity::float, notes, created_at
       FROM stock_count_items
       WHERE stock_count_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    return {
      count: countRes.rows[0],
      items: itemsRes.rows,
    };
  }

  async listStockCounts(
    options: {
      organizationId?: string;
      locationId?: string;
      status?: StockCountStatus;
      limit?: number;
      offset?: number;
    } = {},
    client?: DatabaseClient
  ): Promise<StockCountRecord[]> {
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
    if (options.status) {
      params.push(options.status);
      conditions.push(`status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const query = `
      SELECT id, organization_id, location_id, count_number, status,
             created_by, submitted_by, approved_by, notes,
             created_at, submitted_at, approved_at, updated_at
      FROM stock_counts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const res = await db.query<StockCountRecord>(query, params);
    return res.rows;
  }

  async updateStockCountStatus(
    id: string,
    updates: {
      status: StockCountStatus;
      submitted_by?: string;
      submitted_at?: string;
      approved_by?: string;
      approved_at?: string;
      notes?: string;
    },
    organizationId?: string,
    client?: DatabaseClient
  ): Promise<StockCountRecord | null> {
    const db = this.getClient(client);
    const setParts: string[] = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [updates.status];

    if (updates.submitted_by !== undefined) {
      params.push(updates.submitted_by);
      setParts.push(`submitted_by = $${params.length}`);
      params.push(updates.submitted_at || new Date().toISOString());
      setParts.push(`submitted_at = $${params.length}`);
    }
    if (updates.approved_by !== undefined) {
      params.push(updates.approved_by);
      setParts.push(`approved_by = $${params.length}`);
      params.push(updates.approved_at || new Date().toISOString());
      setParts.push(`approved_at = $${params.length}`);
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
      UPDATE stock_counts
      SET ${setParts.join(', ')}
      ${whereClause}
      RETURNING id, organization_id, location_id, count_number, status,
                created_by, submitted_by, approved_by, notes,
                created_at, submitted_at, approved_at, updated_at
    `;

    const res = await db.query<StockCountRecord>(query, params);
    return res.rows[0] || null;
  }

  async updateItemCount(
    itemId: string,
    countedQty: number,
    systemQty: number,
    notes?: string,
    client?: DatabaseClient
  ): Promise<StockCountItemRecord | null> {
    const db = this.getClient(client);
    const varianceQty = countedQty - systemQty;
    const res = await db.query<StockCountItemRecord>(
      `UPDATE stock_count_items
       SET counted_quantity = $1, variance_quantity = $2, notes = COALESCE($3, notes)
       WHERE id = $4
       RETURNING id, stock_count_id, variant_id,
                 system_quantity::float, counted_quantity::float,
                 variance_quantity::float, notes, created_at`,
      [countedQty, varianceQty, notes || null, itemId]
    );
    return res.rows[0] || null;
  }
}
