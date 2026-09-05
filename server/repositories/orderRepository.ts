import { DatabaseClient, getDatabaseClient } from '../db/client';

export interface OrderRecord {
  id: string;
  organization_id: string;
  location_id: string;
  customer_id?: string | null;
  order_number: string;
  source: 'POS' | 'ECOMMERCE' | 'PHONE' | 'WHOLESALE';
  channel: string;
  fulfillment_method: 'In-Store Pickup' | 'Standard Delivery' | 'Express Delivery' | 'POS Walk-in';
  subtotal: number;
  discount_amount: number;
  discount_code?: string | null;
  tax_amount: number;
  shipping_fee: number;
  total_amount: number;
  total_cost_amount?: number;
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
  unit_price: number;
  cost_price: number;
  quantity: number;
  discount_amount: number;
  tax_rate: number;
  total_amount: number;
  created_at?: string;
}

export interface PaymentRecord {
  id: string;
  organization_id?: string;
  order_id?: string | null;
  payment_method: string;
  amount: number;
  currency: string;
  status: string;
  reference?: string | null;
  provider?: string | null;
  transaction_payload?: Record<string, any>;
  created_at?: string;
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

    return db.withTransaction(async (tx) => {
      // 1. Insert order
      const orderRes = await tx.query<OrderRecord>(
        `INSERT INTO orders (
          id, organization_id, location_id, customer_id, order_number,
          source, channel, fulfillment_method, subtotal, discount_amount,
          discount_code, tax_amount, shipping_fee, total_amount, total_cost_amount,
          payment_status, status, cashier_name, tracking_number, carrier_name, notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        ) RETURNING id, organization_id, location_id, customer_id, order_number,
                    source, channel, fulfillment_method,
                    subtotal::float, discount_amount::float, discount_code,
                    tax_amount::float, shipping_fee::float, total_amount::float, total_cost_amount::float,
                    payment_status, status, cashier_name, tracking_number, carrier_name, notes,
                    created_at, updated_at`,
        [
          order.id,
          order.organization_id || 'org_default',
          order.location_id,
          order.customer_id || null,
          order.order_number,
          order.source,
          order.channel,
          order.fulfillment_method,
          order.subtotal,
          order.discount_amount || 0,
          order.discount_code || null,
          order.tax_amount || 0,
          order.shipping_fee || 0,
          order.total_amount,
          order.total_cost_amount || 0,
          order.payment_status || 'Pending',
          order.status || 'Pending',
          order.cashier_name || null,
          order.tracking_number || null,
          order.carrier_name || null,
          order.notes || null,
        ]
      );

      // 2. Insert order items
      const createdItems: OrderItemRecord[] = [];
      for (const item of items) {
        const itemRes = await tx.query<OrderItemRecord>(
          `INSERT INTO order_items (
            id, order_id, variant_id, product_name, variant_name, sku,
            unit_price, cost_price, quantity, discount_amount, tax_rate, total_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id, order_id, variant_id, product_name, variant_name, sku,
                    unit_price::float, cost_price::float, quantity::float,
                    discount_amount::float, tax_rate::float, total_amount::float, created_at`,
          [
            item.id,
            order.id,
            item.variant_id,
            item.product_name,
            item.variant_name,
            item.sku,
            item.unit_price,
            item.cost_price || 0,
            item.quantity,
            item.discount_amount || 0,
            item.tax_rate || 0,
            item.total_amount,
          ]
        );
        createdItems.push(itemRes.rows[0]);
      }

      // 3. Optional payment record
      let createdPayment: PaymentRecord | undefined;
      if (payment) {
        const payRes = await tx.query<PaymentRecord>(
          `INSERT INTO payments (
            id, organization_id, order_id, payment_method, amount, currency, status, reference, provider, transaction_payload
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id, organization_id, order_id, payment_method, amount::float, currency, status, reference, provider, created_at`,
          [
            payment.id,
            payment.organization_id || order.organization_id || 'org_default',
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
        createdPayment = payRes.rows[0];
      }

      return {
        order: orderRes.rows[0],
        items: createdItems,
        payment: createdPayment,
      };
    });
  }

  async findOrderById(
    id: string,
    orgIdOrClient?: string | DatabaseClient,
    client?: DatabaseClient
  ): Promise<{ order: OrderRecord; items: OrderItemRecord[] } | null> {
    const orgId = typeof orgIdOrClient === 'string' ? orgIdOrClient : undefined;
    const activeClient = typeof orgIdOrClient !== 'string' ? (orgIdOrClient as DatabaseClient) : client;
    const db = this.getClient(activeClient);

    const querySql = orgId
      ? `SELECT id, organization_id, location_id, customer_id, order_number,
                source, channel, fulfillment_method,
                subtotal::float, discount_amount::float, discount_code,
                tax_amount::float, shipping_fee::float, total_amount::float, total_cost_amount::float,
                payment_status, status, cashier_name, tracking_number, carrier_name, notes,
                created_at, updated_at
         FROM orders WHERE id = $1 AND organization_id = $2`
      : `SELECT id, organization_id, location_id, customer_id, order_number,
                source, channel, fulfillment_method,
                subtotal::float, discount_amount::float, discount_code,
                tax_amount::float, shipping_fee::float, total_amount::float, total_cost_amount::float,
                payment_status, status, cashier_name, tracking_number, carrier_name, notes,
                created_at, updated_at
         FROM orders WHERE id = $1`;

    const params = orgId ? [id, orgId] : [id];
    const orderRes = await db.query<OrderRecord>(querySql, params);

    if (orderRes.rows.length === 0) {
      return null;
    }

    const itemsRes = await db.query<OrderItemRecord>(
      `SELECT id, order_id, variant_id, product_name, variant_name, sku,
              unit_price::float, cost_price::float, quantity::float,
              discount_amount::float, tax_rate::float, total_amount::float, created_at
       FROM order_items WHERE order_id = $1`,
      [id]
    );

    return {
      order: orderRes.rows[0],
      items: itemsRes.rows,
    };
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
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [options.orgId || 'org_default'];

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
    params.push(limit, offset);

    const query = `
      SELECT id, organization_id, location_id, customer_id, order_number,
             source, channel, fulfillment_method,
             subtotal::float, discount_amount::float, discount_code,
             tax_amount::float, shipping_fee::float, total_amount::float, total_cost_amount::float,
             payment_status, status, cashier_name, tracking_number, carrier_name, notes,
             created_at, updated_at
      FROM orders
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const res = await db.query<OrderRecord>(query, params);
    return res.rows;
  }
}
