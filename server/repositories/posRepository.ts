import { DatabaseClient, getDatabaseClient } from '../db/client';

export interface PosSessionRecord {
  id: string;
  organization_id: string;
  location_id: string;
  terminal_id: string;
  cashier_name: string;
  status: 'OPEN' | 'SUSPENDED' | 'CLOSING' | 'CLOSED';
  opening_cash: number;
  expected_cash: number;
  counted_cash?: number | null;
  variance?: number | null;
  closing_actor?: string | null;
  opened_at: string;
  closed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PosCashMovementRecord {
  id: string;
  session_id: string;
  type: 'Cash In' | 'Cash Out';
  amount: number;
  reason: string;
  performed_by: string;
  created_at?: string;
}

export interface PosReturnRecord {
  id: string;
  organization_id: string;
  order_id: string;
  refund_amount: number;
  refund_method: string;
  performed_by: string;
  reason?: string | null;
  created_at?: string;
}

export interface PosReturnItemRecord {
  id: string;
  return_id: string;
  variant_id: string;
  quantity: number;
  refund_amount: number;
  created_at?: string;
}

function mapSessionRow(row: any): PosSessionRecord {
  return {
    ...row,
    opening_cash: Number(row.opening_cash),
    expected_cash: Number(row.expected_cash),
    counted_cash: row.counted_cash !== null ? Number(row.counted_cash) : null,
    variance: row.variance !== null ? Number(row.variance) : null,
  };
}

function mapCashMovementRow(row: any): PosCashMovementRecord {
  return {
    ...row,
    amount: Number(row.amount),
  };
}

function mapReturnRow(row: any): PosReturnRecord {
  return {
    ...row,
    refund_amount: Number(row.refund_amount),
  };
}

function mapReturnItemRow(row: any): PosReturnItemRecord {
  return {
    ...row,
    quantity: Number(row.quantity),
    refund_amount: Number(row.refund_amount),
  };
}

export class PosRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  async createSession(session: PosSessionRecord, client?: DatabaseClient): Promise<PosSessionRecord> {
    const db = this.getClient(client);
    const res = await db.query<any>(
      `INSERT INTO pos_sessions (
        id, organization_id, location_id, terminal_id, cashier_name,
        status, opening_cash, expected_cash, opened_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING id, organization_id, location_id, terminal_id, cashier_name,
                status, opening_cash, expected_cash, opened_at, created_at, updated_at`,
      [
        session.id,
        session.organization_id,
        session.location_id,
        session.terminal_id,
        session.cashier_name,
        session.status || 'OPEN',
        session.opening_cash,
        session.expected_cash,
      ]
    );
    return mapSessionRow(res.rows[0]);
  }

  async findSessionById(id: string, orgId?: string, client?: DatabaseClient): Promise<PosSessionRecord | null> {
    const db = this.getClient(client);
    const query = orgId
      ? `SELECT * FROM pos_sessions WHERE id = $1 AND organization_id = $2`
      : `SELECT * FROM pos_sessions WHERE id = $1`;
    const params = orgId ? [id, orgId] : [id];
    const res = await db.query<any>(query, params);
    if (res.rows.length === 0) return null;
    return mapSessionRow(res.rows[0]);
  }

  async getActiveSession(locationId: string, orgId: string, client?: DatabaseClient): Promise<PosSessionRecord | null> {
    const db = this.getClient(client);
    const res = await db.query<any>(
      `SELECT * FROM pos_sessions 
       WHERE location_id = $1 AND organization_id = $2 AND status = 'OPEN'
       ORDER BY opened_at DESC LIMIT 1`,
      [locationId, orgId]
    );
    if (res.rows.length === 0) return null;
    return mapSessionRow(res.rows[0]);
  }

  async listSessions(
    options: { orgId: string; locationId?: string; limit?: number; offset?: number },
    client?: DatabaseClient
  ): Promise<PosSessionRecord[]> {
    const db = this.getClient(client);
    const conditions = ['organization_id = $1'];
    const params: any[] = [options.orgId];

    if (options.locationId) {
      params.push(options.locationId);
      conditions.push(`location_id = $${params.length}`);
    }

    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const res = await db.query<any>(
      `SELECT * FROM pos_sessions 
       WHERE ${conditions.join(' AND ')} 
       ORDER BY opened_at DESC 
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.rows.map(mapSessionRow);
  }

  async updateSessionExpectedCash(id: string, newExpected: number, client?: DatabaseClient): Promise<void> {
    const db = this.getClient(client);
    await db.query(
      `UPDATE pos_sessions SET expected_cash = $1, updated_at = NOW() WHERE id = $2`,
      [newExpected, id]
    );
  }

  async closeSession(
    id: string,
    params: {
      counted_cash: number;
      variance: number;
      closing_actor: string;
      expected_cash: number;
    },
    client?: DatabaseClient
  ): Promise<PosSessionRecord> {
    const db = this.getClient(client);
    const res = await db.query<any>(
      `UPDATE pos_sessions 
       SET status = 'CLOSED', counted_cash = $1, variance = $2, closing_actor = $3, expected_cash = $4, closed_at = NOW(), updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [params.counted_cash, params.variance, params.closing_actor, params.expected_cash, id]
    );
    if (res.rows.length === 0) {
      throw new Error(`SESSION_NOT_FOUND: Failed to close POS Session '${id}'.`);
    }
    return mapSessionRow(res.rows[0]);
  }

  async createCashMovement(movement: PosCashMovementRecord, client?: DatabaseClient): Promise<PosCashMovementRecord> {
    const db = this.getClient(client);
    const res = await db.query<any>(
      `INSERT INTO pos_cash_movements (id, session_id, type, amount, reason, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [movement.id, movement.session_id, movement.type, movement.amount, movement.reason, movement.performed_by]
    );
    return mapCashMovementRow(res.rows[0]);
  }

  async listCashMovements(sessionId: string, client?: DatabaseClient): Promise<PosCashMovementRecord[]> {
    const db = this.getClient(client);
    const res = await db.query<any>(
      `SELECT * FROM pos_cash_movements WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId]
    );
    return res.rows.map(mapCashMovementRow);
  }

  async createReturn(
    returnRec: PosReturnRecord,
    items: PosReturnItemRecord[],
    client?: DatabaseClient
  ): Promise<{ returnRecord: PosReturnRecord; items: PosReturnItemRecord[] }> {
    const db = this.getClient(client);

    return db.withTransaction(async (tx) => {
      // 1. Check if return already exists (using unique transaction constraint)
      const retRes = await tx.query<any>(
        `INSERT INTO pos_returns (id, organization_id, order_id, refund_amount, refund_method, performed_by, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          returnRec.id,
          returnRec.organization_id,
          returnRec.order_id,
          returnRec.refund_amount,
          returnRec.refund_method,
          returnRec.performed_by,
          returnRec.reason || null,
        ]
      );
      const savedReturn = mapReturnRow(retRes.rows[0]);

      const savedItems: PosReturnItemRecord[] = [];
      for (const item of items) {
        const itemRes = await tx.query<any>(
          `INSERT INTO pos_return_items (id, return_id, variant_id, quantity, refund_amount)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [item.id, returnRec.id, item.variant_id, item.quantity, item.refund_amount]
        );
        savedItems.push(mapReturnItemRow(itemRes.rows[0]));
      }

      return {
        returnRecord: savedReturn,
        items: savedItems,
      };
    });
  }

  async listReturnsByOrderId(orderId: string, client?: DatabaseClient): Promise<PosReturnRecord[]> {
    const db = this.getClient(client);
    const res = await db.query<any>(
      `SELECT * FROM pos_returns WHERE order_id = $1 ORDER BY created_at DESC`,
      [orderId]
    );
    return res.rows.map(mapReturnRow);
  }

  async getReturnItems(returnId: string, client?: DatabaseClient): Promise<PosReturnItemRecord[]> {
    const db = this.getClient(client);
    const res = await db.query<any>(
      `SELECT * FROM pos_return_items WHERE return_id = $1`,
      [returnId]
    );
    return res.rows.map(mapReturnItemRow);
  }
}
