import { randomUUID } from 'node:crypto';
import { DatabaseClient, getDatabaseClient } from '../db/client';

export interface BillingCycleSummary {
  invoicesCreated: number;
  subscriptionsCancelled: number;
  subscriptionsExpired: number;
  subscriptionsMarkedPastDue: number;
  invoicesMarkedPastDue: number;
}

export class RecurringBillingService {
  constructor(private readonly db: DatabaseClient = getDatabaseClient()) {}

  async processCycle(options: { invoiceLeadDays?: number; batchSize?: number } = {}): Promise<BillingCycleSummary> {
    const leadDays = Math.max(0, Math.min(30, Math.floor(options.invoiceLeadDays ?? 7)));
    const batchSize = Math.max(1, Math.min(500, Math.floor(options.batchSize ?? 100)));
    return this.db.withTransaction(async (tx) => {
      const summary: BillingCycleSummary = { invoicesCreated: 0, subscriptionsCancelled: 0, subscriptionsExpired: 0, subscriptionsMarkedPastDue: 0, invoicesMarkedPastDue: 0 };
      const due = await tx.query<any>(
        "SELECT os.id,os.organization_id,os.status,os.current_period_start,os.current_period_end,os.trial_ends_at,os.cancel_at_period_end,sp.code AS plan_code,sp.name AS plan_name,sp.amount::text AS plan_amount,sp.currency AS plan_currency,sp.billing_interval " +
        "FROM organization_subscriptions os JOIN subscription_plans sp ON sp.id=os.plan_id " +
        "WHERE os.status IN ('active','trialing','past_due') AND (os.current_period_end <= CURRENT_TIMESTAMP + ($1 || ' days')::interval OR (os.trial_ends_at IS NOT NULL AND os.trial_ends_at <= CURRENT_TIMESTAMP)) " +
        "ORDER BY os.current_period_end LIMIT $2 FOR UPDATE OF os SKIP LOCKED",
        [leadDays, batchSize]
      );
      for (const sub of due.rows) {
        const end = new Date(sub.current_period_end);
        const now = Date.now();
        const ended = end.getTime() <= now;
        const trialEnded = sub.status === 'trialing' && sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() <= now;
        if (sub.cancel_at_period_end && ended) {
          await tx.query("UPDATE organization_subscriptions SET status='cancelled',cancelled_at=COALESCE(cancelled_at,CURRENT_TIMESTAMP),cancel_at_period_end=FALSE,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status IN ('active','trialing','past_due')", [sub.id]);
          summary.subscriptionsCancelled++;
          continue;
        }
        const renewalStart = end.toISOString();
        const renewalEndDate = new Date(end);
        if (sub.billing_interval === 'yearly') renewalEndDate.setUTCFullYear(renewalEndDate.getUTCFullYear() + 1);
        else renewalEndDate.setUTCMonth(renewalEndDate.getUTCMonth() + 1);
        const renewalEnd = renewalEndDate.toISOString();

        if (ended || trialEnded) {
          const paid = await tx.query("SELECT id FROM billing_invoices WHERE subscription_id=$1 AND status='paid' AND metadata->>'billing_cycle'='recurring' AND metadata->>'renewal_period_start'=$2 LIMIT 1", [sub.id, renewalStart]);
          if (paid.rows.length) {
            await tx.query("UPDATE organization_subscriptions SET status='active',current_period_start=$2,current_period_end=$3,trial_ends_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND current_period_end=$4 AND cancel_at_period_end=FALSE", [sub.id, renewalStart, renewalEnd, sub.current_period_end]);
          } else if (trialEnded && Number(sub.plan_amount) === 0) {
            await tx.query("UPDATE organization_subscriptions SET status='expired',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='trialing'", [sub.id]);
            summary.subscriptionsExpired++;
          } else {
            const changed = await tx.query("UPDATE organization_subscriptions SET status='past_due',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status IN ('active','trialing') RETURNING id", [sub.id]);
            summary.subscriptionsMarkedPastDue += changed.rows.length;
          }
          continue;
        }

        const existing = await tx.query("SELECT id FROM billing_invoices WHERE subscription_id=$1 AND metadata->>'billing_cycle'='recurring' AND metadata->>'renewal_period_start'=$2 LIMIT 1", [sub.id, renewalStart]);
        if (existing.rows.length) continue;
        const seq = await tx.query<{ invoice_number: string }>("SELECT 'INV-' || TO_CHAR(CURRENT_DATE,'YYYYMMDD') || '-' || LPAD(nextval('billing_invoice_number_seq')::text,6,'0') AS invoice_number");
        const amount = Number(sub.plan_amount);
        const invoiceId = 'inv_' + randomUUID().replace(/-/g, '');
        const items = [{ type: 'subscription', description: String(sub.plan_name) + ' plan renewal', planCode: sub.plan_code, quantity: 1, unitAmount: amount.toFixed(2), amount: amount.toFixed(2), currency: sub.plan_currency }];
        const inserted = await tx.query<{ id: string }>(
          "INSERT INTO billing_invoices (id,organization_id,subscription_id,invoice_number,status,subtotal,tax,total,currency,period_start,period_end,due_at,line_items,metadata) " +
          "VALUES ($1,$2,$3,$4,'open',$5,0,$5,$6,$7,$8,$7::timestamptz + INTERVAL '7 days',$9::jsonb,$10::jsonb) ON CONFLICT DO NOTHING RETURNING id",
          [invoiceId, sub.organization_id, sub.id, seq.rows[0].invoice_number, amount.toFixed(2), sub.plan_currency, renewalStart, renewalEnd, JSON.stringify(items), JSON.stringify({ source: 'recurring_billing_worker', billing_cycle: 'recurring', renewal_period_start: renewalStart, renewal_period_end: renewalEnd })]
        );
        if (!inserted.rows.length) continue;
        await tx.query("INSERT INTO billing_invoice_status_history (id,invoice_id,from_status,to_status,source,metadata) VALUES ($1,$2,NULL,'open','recurring_billing_worker',$3::jsonb)", ['bih_' + randomUUID().replace(/-/g, ''), inserted.rows[0].id, JSON.stringify({ billing_cycle: 'recurring', subscription_id: sub.id })]);
        summary.invoicesCreated++;
      }
      const overdue = await tx.query<{ id: string }>("UPDATE billing_invoices SET status='past_due',updated_at=CURRENT_TIMESTAMP WHERE status='open' AND due_at IS NOT NULL AND due_at<CURRENT_TIMESTAMP RETURNING id");
      summary.invoicesMarkedPastDue = overdue.rows.length;
      return summary;
    });
  }
}
