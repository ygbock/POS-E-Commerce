import { DatabaseClient, getDatabaseClient } from '../db/client';
import { parseExactMoney, parseExactQuantity } from '../inventory/inventoryPolicies';

export interface OrderRecord {
  id: string;
  organization_id: string;
  location_id: string;
  customer_id?: string | null;
  order_number: string;
  source: 'POS' | 'ECOMMERCE' | 'PHONE' | 'WHOLESALE';
  channel: string;
  fulfillment_method: 'In-Store Pickup' | 'Standard Delivery' | 'Express Delivery' | 'POS Walk-in';
  subtotal: string;
  discount_amount: string;
  discount_code?: string | null;
  tax_amount: string;
  shipping_fee: string;
  total_amount: string;
  total_cost_amount?: string | null;
  payment_status: 'Pending' | 'Partial' | 'Paid' | 'Partially Refunded' | 'Refunded' | 'Failed';
  status:
    | 'Pending'
    | 'Stock Reserved'
    | 'Payment Confirmed'
    | 'Picking'
    | 'Packed'
    | 'Dispatched'
    | 'Delivered'
    | 'Completed'
    | 'Cancelled'
    | 'Refunded';
  cashier_name?: string | null;
  tracking_number?: string | null;
  carrier_name?: string | null;
  notes?: string | null;
  pos_session_id?: string | null;
  idempotency_key?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OrderItemRecord {
  id: string;
  order_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  unit_price: string;
  cost_price: string;
  quantity: string;
  discount_amount: string;
  tax_rate: string;
  total_amount: string;
  created_at?: string;
}

export interface PaymentRecord {
  id: string;
  organization_id?: string;
  order_id?: string | null;
  payment_method: string;
  amount: string;
  currency: string;
  status: string;
  reference?: string | null;
  provider?: string | null;
  transaction_payload?: Record<string, any>;
  created_at?: string;
}

function mapOrderRow(row: any): OrderRecord {
  return {
    ...row,
    subtotal: parseExactMoney(row.subtotal?.toString(), 'subtotal', { allowNegative: true }),
    discount_amount: parseExactMoney((row.discount_amount ?? 0).toString(), 'discount_amount', { allowNegative: true }),
    tax_amount: parseExactMoney((row.tax_amount ?? 0).toString(), 'tax_amount', { allowNegative: true }),
    shipping_fee: parseExactMoney((row.shipping_fee ?? 0).toString(), 'shipping_fee', { allowNegative: true }),
    total_amount: parseExactMoney(row.total_amount?.toString(), 'total_amount', { allowNegative: true }),
    total_cost_amount: row.total_cost_amount !== undefined && row.total_cost_amount !== null
      ? parseExactMoney(row.total_cost_amount.toString(), 'total_cost_amount', { allowNegative: true })
      : null,
  };
}

function mapOrderItemRow(row: any): OrderItemRecord {
  return {
    ...row,
    unit_price: parseExactMoney(row.unit_price?.toString(), 'unit_price', { allowNegative: true }),
    cost_price: parseExactMoney((row.cost_price ?? 0).toString(), 'cost_price', { allowNegative: true }),
    quantity: parseExactQuantity(row.quantity?.toString(), 'quantity', { allowNegative: true }),
    discount_amount: parseExactMoney((row.discount_amount ?? 0).toString(), 'discount_amount', { allowNegative: true }),
    tax_rate: parseExactQuantity((row.tax_rate ?? 0).toString(), 'tax_rate', { allowNegative: true }),
    total_amount: parseExactMoney(row.total_amount?.toString(), 'total_amount', { allowNegative: true }),
  };
}

function mapPaymentRow(row: any): PaymentRecord {
  return {
    ...row,
    amount: parseExactMoney(row.amount?.toString(), 'amount', { allowNegative: true }),
  };
}

export class OrderRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  async createOrderWithItems(
    order: OrderRecord,
    items: OrderItemRecord[],
    payment?: PaymentRecord,
    client?: DatabaseClient
  ): Promise<{ order: OrderRecord; items: OrderItemRecord[]; payment?: PaymentRecord }> {
    const db = this.getClient(client);

    if (!order.organization_id) {
      throw new Error('TENANT_REQUIRED: organization_id is required to create an order.');
    }

    if (payment) {
      if (payment.organization_id && payment.organization_id !== order.organization_id) {
        throw new Error('TENANT_MISMATCH: Payment organization does not match order organization.');
      }
    }

    return db.withTransaction(async (tx) => {
      // 1. Insert order
      const orderRes = await tx.query<any>(
        `INSERT INTO orders (
          id, organization_id, location_id, customer_id, order_number,
          source, channel, fulfillment_method, subtotal, discount_amount,
          discount_code, tax_amount, shipping_fee, total_amount, total_cost_amount,
          payment_status, status, cashier_name, tracking_number, carrier_name, notes,
          pos_session_id, idempotency_key
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        ) RETURNING id, organization_id, location_id, customer_id, order_number,
                    source, channel, fulfillment_method,
                    subtotal, discount_amount, discount_code,
                    tax_amount, shipping_fee, total_amount, total_cost_amount,
                    payment_status, status, cashier_name, tracking_number, carrier_name, notes,
                    pos_session_id, idempotency_key, created_at, updated_at`,
        [
          order.id,
          order.organization_id,
          order.location_id,
          order.customer_id || null,
          order.order_number,
          order.source,
          order.channel,
          order.fulfillment_method,
          order.subtotal,
          order.discount_amount,
          order.discount_code || null,
          order.tax_amount,
          order.shipping_fee,
          order.total_amount,
          order.total_cost_amount || '0.00',
          order.payment_status || 'Pending',
          order.status || 'Pending',
          order.cashier_name || null,
          order.tracking_number || null,
          order.carrier_name || null,
          order.notes || null,
          order.pos_session_id || null,
          order.idempotency_key || null,
        ]
      );

      // 2. Insert order items
      const createdItems: OrderItemRecord[] = [];
      for (const item of items) {
        const itemRes = await tx.query<any>(
          `INSERT INTO order_items (
            id, order_id, variant_id, product_name, variant_name, sku,
            unit_price, cost_price, quantity, discount_amount, tax_rate, total_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id, order_id, variant_id, product_name, variant_name, sku,
                    unit_price, cost_price, quantity,
                    discount_amount, tax_rate, total_amount, created_at`,
          [
            item.id,
            order.id,
            item.variant_id,
            item.product_name,
            item.variant_name,
            item.sku,
            item.unit_price,
            item.cost_price,
            item.quantity,
            item.discount_amount,
            item.tax_rate,
            item.total_amount,
          ]
        );
        createdItems.push(mapOrderItemRow(itemRes.rows[0]));
      }

      // 3. Optional payment record
      let createdPayment: PaymentRecord | undefined;
      if (payment) {
        if (payment.organization_id && payment.organization_id !== order.organization_id) {
          throw new Error('TENANT_MISMATCH: Payment organization does not match order organization.');
        }
        const paymentOrgId = order.organization_id;
        if (!paymentOrgId) {
          throw new Error('TENANT_REQUIRED: organization_id is required for payment.');
        }
        const payRes = await tx.query<any>(
          `INSERT INTO payments (
            id, organization_id, order_id, payment_method, amount, currency, status, reference, provider, transaction_payload
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id, organization_id, order_id, payment_method, amount, currency, status, reference, provider, created_at`,
          [
            payment.id,
            paymentOrgId,
            order.id,
            payment.payment_method,
            payment.amount,
            payment.currency || 'SLE',
            payment.status || 'Completed',
            payment.reference || null,
            payment.provider || null,
            JSON.stringify(payment.transaction_payload || {}),
          ]
        );
        createdPayment = mapPaymentRow(payRes.rows[0]);
      }

      return {
        order: mapOrderRow(orderRes.rows[0]),
        items: createdItems,
        payment: createdPayment,
      };
    });
  }

  async listOrdersForCustomerAuthUser(
    organizationId: string,
    authUserId: string,
    limit = 50,
    client?: DatabaseClient,
  ): Promise<Array<{
    order: OrderRecord;
    items: Array<OrderItemRecord & { product_id: string }>;
    payments: PaymentRecord[];
    location: { id: string; name: string };
    customer: { id: string; name: string; email: string | null; phone: string | null; tier: string | null };
  }>> {
    if (!organizationId || !authUserId) {
      throw new Error('AUTH_REQUIRED: organization and authenticated user are required.');
    }
    const db = this.getClient(client);
    const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
    const orderRes = await db.query<any>(
      `SELECT o.id, o.organization_id, o.location_id, o.customer_id, o.order_number,
              o.source, o.channel, o.fulfillment_method, o.subtotal, o.discount_amount, o.discount_code,
              o.tax_amount, o.shipping_fee, o.total_amount, o.total_cost_amount, o.payment_status, o.status,
              o.cashier_name, o.tracking_number, o.carrier_name, o.notes, o.created_at, o.updated_at,
              l.id AS location_id_ref, l.name AS location_name,
              c.id AS customer_id_ref, c.name AS customer_name, c.email AS customer_email,
              c.phone AS customer_phone, c.tier AS customer_tier
       FROM orders o
       JOIN customers c
         ON c.id = o.customer_id
        AND c.organization_id = o.organization_id
       JOIN locations l
         ON l.id = o.location_id
        AND l.organization_id = o.organization_id
       WHERE o.organization_id = $1
         AND c.auth_user_id = $2
       ORDER BY o.created_at DESC
       LIMIT $3`,
      [organizationId, authUserId, safeLimit],
    );
    const results: Array<{
      order: OrderRecord;
      items: Array<OrderItemRecord & { product_id: string }>;
      payments: PaymentRecord[];
      location: { id: string; name: string };
      customer: { id: string; name: string; email: string | null; phone: string | null; tier: string | null };
    }> = [];

    for (const row of orderRes.rows) {
      const itemsRes = await db.query<any>(
        `SELECT oi.id, oi.order_id, oi.variant_id, pv.product_id,
                oi.product_name, oi.variant_name, oi.sku,
                oi.unit_price, oi.cost_price, oi.quantity, oi.discount_amount,
                oi.tax_rate, oi.total_amount, oi.created_at
         FROM order_items oi
         JOIN product_variants pv
           ON pv.id = oi.variant_id
          AND pv.organization_id = $1
         JOIN products p
           ON p.id = pv.product_id
          AND p.organization_id = $1
         WHERE oi.order_id = $2
         ORDER BY oi.created_at ASC, oi.id ASC`,
        [organizationId, row.id],
      );
      const paymentsRes = await db.query<any>(
        `SELECT id, organization_id, order_id, payment_method, amount, currency,
                status, reference, provider, created_at
         FROM payments
         WHERE order_id = $1
           AND organization_id = $2
         ORDER BY created_at ASC, id ASC`,
        [row.id, organizationId],
      );
      results.push({
        order: mapOrderRow(row),
        items: itemsRes.rows.map(mapOrderItemRow).map((item, index) => ({
          ...item,
          product_id: String(itemsRes.rows[index].product_id),
        })),
        payments: paymentsRes.rows.map(mapPaymentRow),
        location: { id: row.location_id_ref, name: row.location_name },
        customer: {
          id: row.customer_id_ref,
          name: row.customer_name,
          email: row.customer_email ?? null,
          phone: row.customer_phone ?? null,
          tier: row.customer_tier ?? null,
        },
      });
    }
    return results;
  }

  async findOrderById(
    id: string,
    organizationId: string,
    client?: DatabaseClient
  ): Promise<{ order: OrderRecord; items: OrderItemRecord[] } | null> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: organization_id is required to find an order.');
    }
    const db = this.getClient(client);

    const querySql = `SELECT id, organization_id, location_id, customer_id, order_number,
                source, channel, fulfillment_method,
                subtotal, discount_amount, discount_code,
                tax_amount, shipping_fee, total_amount, total_cost_amount,
                payment_status, status, cashier_name, tracking_number, carrier_name, notes,
                pos_session_id, idempotency_key, created_at, updated_at
         FROM orders WHERE id = $1 AND organization_id = $2`;

    const orderRes = await db.query<any>(querySql, [id, organizationId]);

    if (orderRes.rows.length === 0) {
      return null;
    }

    const itemsRes = await db.query<any>(
      `SELECT oi.id, oi.order_id, oi.variant_id, oi.product_name, oi.variant_name, oi.sku,
              oi.unit_price, oi.cost_price, oi.quantity,
              oi.discount_amount, oi.tax_rate, oi.total_amount, oi.created_at
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.order_id = $1 AND o.organization_id = $2`,
      [id, organizationId]
    );

    return {
      order: mapOrderRow(orderRes.rows[0]),
      items: itemsRes.rows.map(mapOrderItemRow),
    };
  }

  async findPaymentByOrderId(
    orderId: string,
    organizationId: string,
    client?: DatabaseClient
  ): Promise<PaymentRecord | null> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: organization_id is required to find payment.');
    }
    const db = this.getClient(client);
    const payRes = await db.query<any>(
      `SELECT id, organization_id, order_id, payment_method, amount, currency, status, reference, provider, transaction_payload, created_at
       FROM payments
       WHERE order_id = $1 AND organization_id = $2`,
      [orderId, organizationId]
    );

    if (payRes.rows.length === 0) {
      return null;
    }
    return mapPaymentRow(payRes.rows[0]);
  }

  async listOrders(
    options: {
      orgId?: string;
      locationId?: string;
      customerId?: string;
      status?: string;
      source?: string;
      limit?: number;
      offset?: number;
    } = {},
    client?: DatabaseClient
  ): Promise<OrderRecord[]> {
    const db = this.getClient(client);
    if (!options.orgId) {
      throw new Error('TENANT_REQUIRED: orgId is required to list orders.');
    }
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [options.orgId];

    if (options.locationId) {
      params.push(options.locationId);
      conditions.push(`location_id = $${params.length}`);
    }
    if (options.customerId) {
      params.push(options.customerId);
      conditions.push(`customer_id = $${params.length}`);
    }
    if (options.status) {
      params.push(options.status);
      conditions.push(`status = $${params.length}`);
    }
    if (options.source) {
      params.push(options.source);
      conditions.push(`source = $${params.length}`);
    }

    const limit = options.limit || 50;
    const offset = options.offset || 0;
    
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    params.push(limit, offset);

    const query = `
      SELECT id, organization_id, location_id, customer_id, order_number,
             source, channel, fulfillment_method,
             subtotal, discount_amount, discount_code,
             tax_amount, shipping_fee, total_amount, total_cost_amount,
             payment_status, status, cashier_name, tracking_number, carrier_name, notes,
             created_at, updated_at
      FROM orders
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const res = await db.query<any>(query, params);
    return res.rows.map(mapOrderRow);
  }
}
