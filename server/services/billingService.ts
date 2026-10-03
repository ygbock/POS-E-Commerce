import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseClient, getDatabaseClient } from '../db/client.ts';
import { SubscriptionRepository } from '../repositories/subscriptionRepository.ts';

export type BillingInvoiceStatus = 'draft' | 'open' | 'paid' | 'past_due' | 'void' | 'uncollectible';

export interface BillingInvoice {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  invoice_number: string;
  status: BillingInvoiceStatus;
  subtotal: string;
  tax: string;
  total: string;
  currency: string;
  period_start: string;
  period_end: string;
  due_at: string | null;
  paid_at: string | null;
  provider: string | null;
  provider_invoice_id: string | null;
  line_items: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BillingWebhookEvent {
  id: string;
  type: string;
  organizationId?: string;
  invoiceId?: string;
  providerInvoiceId?: string;
  subscriptionId?: string;
  status?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export function signBillingPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export function verifyBillingSignature(payload: string, signature: string, secret: string): boolean {
  if (!payload || !signature || !secret) return false;
  const expected = signBillingPayload(payload, secret);
  const supplied = signature.replace(/^sha256=/i, '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const expectedBuffer = Buffer.from(expected, 'hex');
  const suppliedBuffer = Buffer.from(supplied, 'hex');
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export class BillingService {
  constructor(
    private readonly db: DatabaseClient = getDatabaseClient(),
    private readonly subscriptions: SubscriptionRepository = new SubscriptionRepository(db),
  ) {}

  private async nextInvoiceNumber(tx: DatabaseClient): Promise<string> {
    const result = await tx.query<{ invoice_number: string }>(
      "SELECT 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(nextval('billing_invoice_number_seq')::text, 6, '0') AS invoice_number"
    );
    return result.rows[0]?.invoice_number || `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-000001`;
  }

  async listInvoices(filters: {
    organizationId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ invoices: BillingInvoice[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (filters.organizationId) {
      where.push(`bi.organization_id = $${i++}`);
      params.push(filters.organizationId.trim());
    }
    if (filters.status && filters.status !== 'all') {
      where.push(`bi.status = $${i++}`);
      params.push(filters.status.trim().toLowerCase());
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM billing_invoices bi ${whereSql}`,
      params
    );
    const total = Number(count.rows[0]?.count || 0);

    const limit = Math.min(Math.max(Number(filters.limit || 50), 1), 200);
    const offset = Math.max(Number(filters.offset || 0), 0);
    const rows = await this.db.query<BillingInvoice>(
      `SELECT bi.* FROM billing_invoices bi ${whereSql}
       ORDER BY bi.created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );
    return { invoices: rows.rows, total };
  }

  async getInvoice(invoiceId: string): Promise<BillingInvoice | null> {
    const result = await this.db.query<BillingInvoice>(
      'SELECT * FROM billing_invoices WHERE id = $1 OR invoice_number = $1 LIMIT 1',
      [invoiceId.trim()]
    );
    return result.rows[0] || null;
  }

  async createInvoice(
    organizationId: string,
    options?: { provider?: string; dueDays?: number; reason?: string }
  ): Promise<BillingInvoice> {
    const orgId = organizationId.trim();
    if (!orgId) throw new Error('TENANT_REQUIRED: organizationId is required');

    return this.db.withTransaction(async (tx) => {
      const subscription = await this.subscriptions.getForOrganization(orgId, tx, true);
      if (!subscription) throw new Error('SUBSCRIPTION_NOT_FOUND: Organization subscription not found');

      const amount = Number(subscription.plan.amount);
      const dueDays = Number.isInteger(options?.dueDays) ? Math.max(0, Math.min(90, Number(options?.dueDays))) : 7;
      const invoiceNumber = await this.nextInvoiceNumber(tx);
      const id = `inv_${randomUUID().replace(/-/g, '')}`;
      const lineItems = [{
        type: 'subscription',
        description: `${subscription.plan.name} plan`,
        planCode: subscription.plan.code,
        quantity: 1,
        unitAmount: amount.toFixed(2),
        amount: amount.toFixed(2),
        currency: subscription.plan.currency,
      }];

      const result = await tx.query<BillingInvoice>(
        `INSERT INTO billing_invoices
          (id, organization_id, subscription_id, invoice_number, status, subtotal, tax, total, currency,
           period_start, period_end, due_at, line_items, metadata)
         VALUES ($1,$2,$3,$4,'open',$5,0,$5,$6,$7,$8,
                 CURRENT_TIMESTAMP + ($9 || ' days')::interval,$10::jsonb,$11::jsonb)
         RETURNING *`,
        [
          id, orgId, subscription.id, invoiceNumber, amount.toFixed(2), subscription.plan.currency,
          subscription.current_period_start, subscription.current_period_end, dueDays,
          JSON.stringify(lineItems),
          JSON.stringify({ source: 'platform_billing', reason: options?.reason || null }),
        ]
      );

      const invoice = result.rows[0];
      await tx.query(
        `INSERT INTO billing_invoice_status_history
          (id, invoice_id, from_status, to_status, source, metadata)
         VALUES ($1,$2,NULL,'open','platform', $3::jsonb)`,
        [`bih_${randomUUID().replace(/-/g, '')}`, invoice.id, JSON.stringify({ reason: options?.reason || null })]
      );
      return invoice;
    });
  }

  async transitionInvoiceStatus(
    invoiceId: string,
    targetStatus: BillingInvoiceStatus,
    source: string,
    providerEventId?: string,
    metadata: Record<string, unknown> = {}
  ): Promise<BillingInvoice> {
    return this.db.withTransaction(async (tx) => {
      const currentResult = await tx.query<BillingInvoice>(
        'SELECT * FROM billing_invoices WHERE id = $1 OR invoice_number = $1 FOR UPDATE',
        [invoiceId.trim()]
      );
      const current = currentResult.rows[0];
      if (!current) throw new Error('INVOICE_NOT_FOUND: Invoice not found');

      if (current.status === targetStatus) return current;
      const terminal = ['paid', 'void'].includes(current.status);
      if (terminal && current.status !== targetStatus) {
        throw new Error(`INVALID_INVOICE_STATE: Cannot move invoice from ${current.status} to ${targetStatus}`);
      }

      const paidAt = targetStatus === 'paid' ? 'CURRENT_TIMESTAMP' : 'NULL';
      const updated = await tx.query<BillingInvoice>(
        `UPDATE billing_invoices
         SET status = $1, paid_at = ${paidAt}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 RETURNING *`,
        [targetStatus, current.id]
      );

      await tx.query(
        `INSERT INTO billing_invoice_status_history
          (id, invoice_id, from_status, to_status, source, provider_event_id, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
         ON CONFLICT (invoice_id, provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING`,
        [
          `bih_${randomUUID().replace(/-/g, '')}`, current.id, current.status, targetStatus,
          source, providerEventId || null, JSON.stringify(metadata),
        ]
      );
      return updated.rows[0];
    });
  }

  async processWebhook(event: BillingWebhookEvent, rawPayload: string, provider = 'monime'): Promise<{ duplicate: boolean; invoice: BillingInvoice | null }> {
    const eventId = String(event.id || '').trim();
    const type = String(event.type || '').trim().toLowerCase();
    if (!eventId || !type) throw new Error('INVALID_WEBHOOK: Event id and type are required');

    return this.db.withTransaction(async (tx) => {
      const existing = await tx.query<{ id: string; status: string }>(
        'SELECT id, status FROM billing_events WHERE provider = $1 AND provider_event_id = $2 FOR UPDATE',
        [provider, eventId]
      );
      if (existing.rows.length) {
        return { duplicate: true, invoice: null };
      }

      await tx.query(
        `INSERT INTO billing_events
          (id, organization_id, provider, provider_event_id, event_type, status, payload)
         VALUES ($1,$2,$3,$4,$5,'RECEIVED',$6::jsonb)`,
        [
          `be_${randomUUID().replace(/-/g, '')}`,
          event.organizationId || null,
          provider,
          eventId,
          type,
          rawPayload ? JSON.parse(rawPayload) : event,
        ]
      );

      let target: BillingInvoiceStatus | null = null;
      if (['invoice.paid', 'payment.succeeded', 'subscription.active'].includes(type)) target = 'paid';
      if (['invoice.payment_failed', 'payment.failed', 'subscription.past_due'].includes(type)) target = 'past_due';
      if (['invoice.voided', 'invoice.void'].includes(type)) target = 'void';

      let invoice: BillingInvoice | null = null;
      if (target && (event.invoiceId || event.providerInvoiceId)) {
        const lookup = event.invoiceId || event.providerInvoiceId;
        const inv = await tx.query<BillingInvoice>(
          'SELECT * FROM billing_invoices WHERE id = $1 OR invoice_number = $1 OR provider_invoice_id = $1 LIMIT 1 FOR UPDATE',
          [lookup]
        );
        if (inv.rows[0]) {
          invoice = inv.rows[0];
          const paidAt = target === 'paid' ? 'CURRENT_TIMESTAMP' : 'NULL';
          const updated = await tx.query<BillingInvoice>(
            `UPDATE billing_invoices SET status=$1, paid_at=${paidAt}, updated_at=CURRENT_TIMESTAMP,
                    provider=COALESCE(provider,$2), provider_invoice_id=COALESCE(provider_invoice_id,$3)
             WHERE id=$4 RETURNING *`,
            [target, provider, event.providerInvoiceId || null, invoice.id]
          );
          invoice = updated.rows[0];
          await tx.query(
            `INSERT INTO billing_invoice_status_history
              (id, invoice_id, from_status, to_status, source, provider_event_id, metadata)
             VALUES ($1,$2,$3,$4,'webhook',$5,$6::jsonb)
             ON CONFLICT (invoice_id, provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING`,
            [`bih_${randomUUID().replace(/-/g, '')}`, invoice.id, inv.rows[0].status, target, eventId, JSON.stringify(event.metadata || {})]
          );
        }
      }

      if (target && event.subscriptionId) {
        const status = target === 'paid' ? 'active' : target === 'past_due' ? 'past_due' : null;
        if (status) {
          await tx.query(
            'UPDATE organization_subscriptions SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND status NOT IN (\'cancelled\',\'expired\')',
            [status, event.subscriptionId]
          );
        }
      }

      await tx.query(
        'UPDATE billing_events SET status=\'PROCESSED\', processed_at=CURRENT_TIMESTAMP WHERE provider=$1 AND provider_event_id=$2',
        [provider, eventId]
      );
      return { duplicate: false, invoice };
    });
  }
}
