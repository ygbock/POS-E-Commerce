import { randomUUID } from 'node:crypto';
import { DatabaseClient, getDatabaseClient } from '../db/client';

export type PaymentTransactionType = 'CHARGE' | 'REFUND' | 'VOID';
export type PaymentTransactionStatus = 'POSTED' | 'FAILED' | 'VOIDED';

export interface PaymentTransactionRecord {
  id: string;
  organization_id: string;
  payment_id: string;
  order_id?: string | null;
  transaction_type: PaymentTransactionType;
  amount: string;
  currency: string;
  status: PaymentTransactionStatus;
  payment_method?: string | null;
  reference?: string | null;
  provider?: string | null;
  idempotency_key?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  metadata?: Record<string, any>;
  performed_by: string;
  created_at?: string;
}

export class PaymentTransactionRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  async create(
    transaction: Omit<PaymentTransactionRecord, 'created_at'>,
    client?: DatabaseClient
  ): Promise<PaymentTransactionRecord> {
    const db = this.getClient(client);
    const res = await db.query<any>(
      `INSERT INTO payment_transactions (
        id, organization_id, payment_id, order_id, transaction_type, amount,
        currency, status, payment_method, reference, provider,
        idempotency_key, source_type, source_id, metadata, performed_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        transaction.id || `pt_${randomUUID()}`,
        transaction.organization_id,
        transaction.payment_id,
        transaction.order_id || null,
        transaction.transaction_type,
        transaction.amount,
        transaction.currency || 'SLE',
        transaction.status || 'POSTED',
        transaction.payment_method || null,
        transaction.reference || null,
        transaction.provider || null,
        transaction.idempotency_key || null,
        transaction.source_type || null,
        transaction.source_id || null,
        JSON.stringify(transaction.metadata || {}),
        transaction.performed_by,
      ],
    );
    return res.rows[0] as PaymentTransactionRecord;
  }

  async getRefundedAmount(
    paymentId: string,
    organizationId: string,
    client?: DatabaseClient
  ): Promise<string> {
    const db = this.getClient(client);
    const res = await db.query<any>(
      `SELECT COALESCE(SUM(amount), 0)::text AS refunded_amount
       FROM payment_transactions
       WHERE payment_id = $1
         AND organization_id = $2
         AND transaction_type = 'REFUND'
         AND status = 'POSTED'`,
      [paymentId, organizationId],
    );
    return String(res.rows[0]?.refunded_amount || '0.00');
  }

  async getCapturedAmount(
    paymentId: string,
    organizationId: string,
    client?: DatabaseClient
  ): Promise<string> {
    const db = this.getClient(client);
    const res = await db.query<any>(
      `SELECT COALESCE(SUM(amount), 0)::text AS captured_amount
       FROM payment_transactions
       WHERE payment_id = $1
         AND organization_id = $2
         AND transaction_type = 'CHARGE'
         AND status = 'POSTED'`,
      [paymentId, organizationId],
    );
    return String(res.rows[0]?.captured_amount || '0.00');
  }

  async listByPayment(
    paymentId: string,
    organizationId: string,
    client?: DatabaseClient
  ): Promise<PaymentTransactionRecord[]> {
    const db = this.getClient(client);
    const res = await db.query<any>(
      `SELECT *
       FROM payment_transactions
       WHERE payment_id = $1 AND organization_id = $2
       ORDER BY created_at ASC, id ASC`,
      [paymentId, organizationId],
    );
    return res.rows as PaymentTransactionRecord[];
  }
}
