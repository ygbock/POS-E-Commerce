import { DatabaseClient } from '../db/client';

export interface ReportDateRange {
  from?: string;
  to?: string;
  locationId?: string;
  channel?: 'POS' | 'ECOMMERCE' | 'PHONE' | 'WHOLESALE';
}

function normalizeRange(range: ReportDateRange) {
  const from = range.from
    ? /^\d{4}-\d{2}-\d{2}$/.test(range.from) ? new Date(`${range.from}T00:00:00.000Z`) : new Date(range.from)
    : new Date(Date.now() - 30 * 86400000);
  const to = range.to
    ? /^\d{4}-\d{2}-\d{2}$/.test(range.to) ? new Date(`${range.to}T23:59:59.999Z`) : new Date(range.to)
    : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error('INVALID_REPORT_DATE_RANGE');
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export class ReportingService {
  constructor(private readonly db: DatabaseClient) {}

  async getSalesSummary(organizationId: string, range: ReportDateRange = {}) {
    const { from, to } = normalizeRange(range);
    const params: any[] = [organizationId, from, to];
    const filters = [
      'o.organization_id = $1',
      'o.created_at >= $2',
      'o.created_at <= $3',
      "o.payment_status IN ('Paid', 'Partially Refunded')",
      "o.status NOT IN ('Cancelled')",
    ];

    if (range.locationId) {
      params.push(range.locationId);
      filters.push(`o.location_id = $${params.length}`);
    }
    if (range.channel) {
      params.push(range.channel);
      filters.push(`o.source = $${params.length}`);
    }

    const where = filters.join(' AND ');
    const summary = await this.db.query<any>(`
      SELECT
        COUNT(*)::int AS order_count,
        COALESCE(SUM(o.total_amount), 0)::numeric(15,2) AS gross_sales,
        COALESCE(SUM(o.discount_amount), 0)::numeric(15,2) AS discounts,
        COALESCE(SUM(o.tax_amount), 0)::numeric(15,2) AS tax,
        COALESCE(SUM(o.shipping_fee), 0)::numeric(15,2) AS shipping,
        COALESCE(SUM(o.total_cost_amount), 0)::numeric(15,2) AS cogs,
        COALESCE(SUM(o.total_amount - o.total_cost_amount), 0)::numeric(15,2) AS gross_profit,
        CASE WHEN COALESCE(SUM(o.total_amount),0) = 0 THEN 0
          ELSE ROUND((SUM(o.total_amount - o.total_cost_amount) / SUM(o.total_amount)) * 100, 2)
        END::numeric(8,2) AS gross_margin_percent,
        CASE WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(SUM(o.total_amount) / COUNT(*), 2)
        END::numeric(15,2) AS average_order_value
      FROM orders o
      WHERE ${where}
    `, params);

    const byChannel = await this.db.query<any>(`
      SELECT o.source AS channel,
             COUNT(*)::int AS order_count,
             COALESCE(SUM(o.total_amount),0)::numeric(15,2) AS revenue,
             COALESCE(SUM(o.total_cost_amount),0)::numeric(15,2) AS cogs,
             COALESCE(SUM(o.total_amount-o.total_cost_amount),0)::numeric(15,2) AS gross_profit
      FROM orders o
      WHERE ${where}
      GROUP BY o.source
      ORDER BY revenue DESC
    `, params);

    const daily = await this.db.query<any>(`
      SELECT DATE(o.created_at) AS day,
             COUNT(*)::int AS order_count,
             COALESCE(SUM(o.total_amount),0)::numeric(15,2) AS revenue,
             COALESCE(SUM(o.total_amount-o.total_cost_amount),0)::numeric(15,2) AS gross_profit
      FROM orders o
      WHERE ${where}
      GROUP BY DATE(o.created_at)
      ORDER BY day ASC
    `, params);

    const row = summary.rows[0] || {};
    return {
      from,
      to,
      orderCount: Number(row.order_count || 0),
      grossSales: String(row.gross_sales || '0.00'),
      discounts: String(row.discounts || '0.00'),
      tax: String(row.tax || '0.00'),
      shipping: String(row.shipping || '0.00'),
      cogs: String(row.cogs || '0.00'),
      grossProfit: String(row.gross_profit || '0.00'),
      grossMarginPercent: Number(row.gross_margin_percent || 0),
      averageOrderValue: String(row.average_order_value || '0.00'),
      byChannel: byChannel.rows.map(r => ({
        channel: r.channel,
        orderCount: Number(r.order_count),
        revenue: String(r.revenue),
        cogs: String(r.cogs),
        grossProfit: String(r.gross_profit),
      })),
      daily: daily.rows.map(r => ({
        day: r.day,
        orderCount: Number(r.order_count),
        revenue: String(r.revenue),
        grossProfit: String(r.gross_profit),
      })),
    };
  }

  async getInventoryValuation(organizationId: string, locationId?: string) {
    const params: any[] = [organizationId];
    let locationFilter = '';
    if (locationId) {
      params.push(locationId);
      locationFilter = ` AND ib.location_id = $${params.length}`;
    }

    const result = await this.db.query<any>(`
      SELECT
        COUNT(DISTINCT ib.variant_id)::int AS variant_count,
        COALESCE(SUM(ib.on_hand),0)::numeric(18,4) AS on_hand_units,
        COALESCE(SUM(GREATEST(ib.available,0)),0)::numeric(18,4) AS available_units,
        COALESCE(SUM(ib.reserved),0)::numeric(18,4) AS reserved_units,
        COALESCE(SUM(ib.damaged + ib.expired),0)::numeric(18,4) AS quarantined_units,
        COALESCE(SUM(GREATEST(ib.available,0) * pv.cost_price),0)::numeric(18,2) AS cost_value,
        COALESCE(SUM(GREATEST(ib.available,0) * pv.retail_price),0)::numeric(18,2) AS retail_value
      FROM inventory_balances ib
      JOIN product_variants pv
        ON pv.id = ib.variant_id AND pv.organization_id = ib.organization_id
      WHERE ib.organization_id = $1 ${locationFilter}
    `, params);

    const byLocation = await this.db.query<any>(`
      SELECT l.id AS location_id, l.name AS location_name,
             COALESCE(SUM(GREATEST(ib.available,0)),0)::numeric(18,4) AS available_units,
             COALESCE(SUM(GREATEST(ib.available,0) * pv.cost_price),0)::numeric(18,2) AS cost_value,
             COALESCE(SUM(GREATEST(ib.available,0) * pv.retail_price),0)::numeric(18,2) AS retail_value
      FROM locations l
      LEFT JOIN inventory_balances ib
        ON ib.location_id = l.id AND ib.organization_id = l.organization_id
      LEFT JOIN product_variants pv
        ON pv.id = ib.variant_id AND pv.organization_id = ib.organization_id
      WHERE l.organization_id = $1 ${locationId ? 'AND l.id = $2' : ''}
      GROUP BY l.id, l.name
      ORDER BY l.name
    `, params);

    const row = result.rows[0] || {};
    return {
      variantCount: Number(row.variant_count || 0),
      onHandUnits: String(row.on_hand_units || '0.0000'),
      availableUnits: String(row.available_units || '0.0000'),
      reservedUnits: String(row.reserved_units || '0.0000'),
      quarantinedUnits: String(row.quarantined_units || '0.0000'),
      costValue: String(row.cost_value || '0.00'),
      retailValue: String(row.retail_value || '0.00'),
      byLocation: byLocation.rows.map(r => ({
        locationId: r.location_id,
        locationName: r.location_name,
        availableUnits: String(r.available_units),
        costValue: String(r.cost_value),
        retailValue: String(r.retail_value),
      })),
    };
  }

  async getShiftReconciliation(organizationId: string, range: ReportDateRange = {}) {
    const { from, to } = normalizeRange(range);
    const params: any[] = [organizationId, from, to];
    let locationFilter = '';
    if (range.locationId) {
      params.push(range.locationId);
      locationFilter = ` AND ps.location_id = $${params.length}`;
    }

    const result = await this.db.query<any>(`
      SELECT
        ps.id AS session_id,
        ps.location_id,
        l.name AS location_name,
        ps.terminal_id,
        ps.cashier_name,
        ps.status,
        ps.opened_at,
        ps.closed_at,
        ps.opening_cash::numeric(15,2),
        ps.expected_cash::numeric(15,2),
        ps.counted_cash::numeric(15,2),
        ps.variance::numeric(15,2),
        COALESCE(cm.cash_in,0)::numeric(15,2) AS cash_in,
        COALESCE(cm.cash_out,0)::numeric(15,2) AS cash_out,
        COALESCE(sales.cash_sales,0)::numeric(15,2) AS cash_sales
      FROM pos_sessions ps
      JOIN locations l ON l.id = ps.location_id AND l.organization_id = ps.organization_id
      LEFT JOIN (
        SELECT session_id,
               SUM(CASE WHEN type = 'Cash In' THEN amount ELSE 0 END) AS cash_in,
               SUM(CASE WHEN type = 'Cash Out' THEN amount ELSE 0 END) AS cash_out
        FROM pos_cash_movements
        GROUP BY session_id
      ) cm ON cm.session_id = ps.id
      LEFT JOIN (
        SELECT o.pos_session_id, SUM(p.amount) AS cash_sales
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.organization_id = p.organization_id
        WHERE p.organization_id = $1 AND p.payment_method = 'Cash' AND p.status = 'Completed'
        GROUP BY o.pos_session_id
      ) sales ON sales.pos_session_id = ps.id
      WHERE ps.organization_id = $1
        AND ps.opened_at >= $2
        AND ps.opened_at <= $3
        ${locationFilter}
      ORDER BY ps.opened_at DESC
    `, params);

    const rows = result.rows;
    const totals = rows.reduce((a, r) => {
      a.openingCash += Number(r.opening_cash || 0);
      a.expectedCash += Number(r.expected_cash || 0);
      a.countedCash += Number(r.counted_cash || 0);
      a.variance += Number(r.variance || 0);
      a.cashSales += Number(r.cash_sales || 0);
      a.cashIn += Number(r.cash_in || 0);
      a.cashOut += Number(r.cash_out || 0);
      return a;
    }, { openingCash: 0, expectedCash: 0, countedCash: 0, variance: 0, cashSales: 0, cashIn: 0, cashOut: 0 });

    return {
      from,
      to,
      shiftCount: rows.length,
      totals: Object.fromEntries(Object.entries(totals).map(([k,v]) => [k, Number((v as number).toFixed(2))])),
      shifts: rows.map(r => ({
        sessionId: r.session_id,
        locationId: r.location_id,
        locationName: r.location_name,
        terminalId: r.terminal_id,
        cashierName: r.cashier_name,
        status: r.status,
        openedAt: r.opened_at,
        closedAt: r.closed_at,
        openingCash: String(r.opening_cash || '0.00'),
        expectedCash: String(r.expected_cash || '0.00'),
        countedCash: r.counted_cash == null ? null : String(r.counted_cash),
        variance: r.variance == null ? null : String(r.variance),
        cashSales: String(r.cash_sales || '0.00'),
        cashIn: String(r.cash_in || '0.00'),
        cashOut: String(r.cash_out || '0.00'),
      })),
    };
  }
}
