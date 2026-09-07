import { DatabaseClient, getDatabaseClient } from '../db/client';
import {
  StockCountRecord,
  StockCountItemRecord,
  StockCountStatus,
  Quantity,
} from '../inventory/inventoryTypes';
import { toQtyString, subQtyExact } from '../inventory/inventoryPolicies';

function mapStockCountItemRow(row: any): StockCountItemRecord {
  return {
    id: row.id,
    stock_count_id: row.stock_count_id,
    variant_id: row.variant_id,
    system_quantity: toQtyString(row.system_quantity),
    counted_quantity: row.counted_quantity !== null && row.counted_quantity !== undefined ? toQtyString(row.counted_quantity) : null,
    variance_quantity: row.variance_quantity !== null && row.variance_quantity !== undefined ? toQtyString(row.variance_quantity) : null,
    notes: row.notes,
    created_at: row.created_at,
  };
}

/**
 * Stock Count Repository (INV-001 / INV-001R3)
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
      system_quantity: string | number;
      counted_quantity?: string | number;
      notes?: string;
    }>,
    client?: DatabaseClient
  ): Promise<{ count: StockCountRecord; items: StockCountItemRecord[] }> {
    if (!countData.organization_id || typeof countData.organization_id !== 'string' || countData.organization_id.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organization_id is mandatory for createStockCountWithItems.');
    }
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
        const sysQty = toQtyString(item.system_quantity);
        const countedQty = item.counted_quantity !== undefined ? toQtyString(item.counted_quantity) : sysQty;
        const varianceQty = subQtyExact(countedQty, sysQty);

        const itemRes = await tx.query(
          `INSERT INTO stock_count_items (
            id, stock_count_id, variant_id, system_quantity, counted_quantity, variance_quantity, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, stock_count_id, variant_id,
                    system_quantity::text, counted_quantity::text,
                    variance_quantity::text, notes, created_at`,
          [
            item.id,
            countData.id,
            item.variant_id,
            sysQty,
            countedQty,
            varianceQty,
            item.notes || null,
          ]
        );
        createdItems.push(mapStockCountItemRow(itemRes.rows[0]));
      }

      return {
        count: createdCount,
        items: createdItems,
      };
    });
  }

  async findStockCountById(
    id: string,
    organizationId: string,
    client?: DatabaseClient
  ): Promise<{ count: StockCountRecord; items: StockCountItemRecord[] } | null> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is required for findStockCountById.');
    }
    const db = this.getClient(client);

    const countRes = await db.query<StockCountRecord>(
      `SELECT id, organization_id, location_id, count_number, status,
              created_by, submitted_by, approved_by, notes,
              created_at, submitted_at, approved_at, updated_at
       FROM stock_counts
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    if (countRes.rows.length === 0) {
      return null;
    }

    const itemsRes = await db.query(
      `SELECT id, stock_count_id, variant_id,
              system_quantity::text, counted_quantity::text,
              variance_quantity::text, notes, created_at
       FROM stock_count_items
       WHERE stock_count_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    return {
      count: countRes.rows[0],
      items: itemsRes.rows.map(mapStockCountItemRow),
    };
  }

  async listStockCounts(
    options: {
      organizationId: string;
      locationId?: string;
      status?: StockCountStatus;
      limit?: number;
      offset?: number;
    },
    client?: DatabaseClient
  ): Promise<StockCountRecord[]> {
    if (!options.organizationId || typeof options.organizationId !== 'string' || options.organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is required for listStockCounts.');
    }
    const db = this.getClient(client);
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [options.organizationId];

    if (options.locationId) {
      params.push(options.locationId);
      conditions.push(`location_id = $${params.length}`);
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
    organizationId: string,
    client?: DatabaseClient
  ): Promise<StockCountRecord | null> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: Explicit organizationId is required for updateStockCountStatus.');
    }
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

    params.push(id, organizationId);
    const whereClause = `WHERE id = $${params.length - 1} AND organization_id = $${params.length}`;

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
    countedQty: string | number,
    systemQty: string | number,
    notes?: string,
    client?: DatabaseClient
  ): Promise<StockCountItemRecord | null> {
    const db = this.getClient(client);
    const countedStr = toQtyString(countedQty);
    const systemStr = toQtyString(systemQty);
    const varianceStr = subQtyExact(countedStr, systemStr);

    const res = await db.query(
      `UPDATE stock_count_items
       SET counted_quantity = $1, variance_quantity = $2, notes = COALESCE($3, notes)
       WHERE id = $4
       RETURNING id, stock_count_id, variant_id,
                 system_quantity::text, counted_quantity::text,
                 variance_quantity::text, notes, created_at`,
      [countedStr, varianceStr, notes || null, itemId]
    );
    if (!res.rows[0]) return null;
    return mapStockCountItemRow(res.rows[0]);
  }
}
