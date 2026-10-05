import { randomUUID } from 'node:crypto';
import { DatabaseClient } from '../db/client.ts';
import { InventoryRepository } from '../repositories/inventoryRepository.ts';
import { parseExactQuantity, parseExactMoney } from '../inventory/inventoryPolicies.ts';

type PurchaseItemInput = {
  variant_id: string;
  sku?: string;
  ordered_qty: string | number;
  unit_cost: string | number;
};

type ReceiveItemInput = {
  variant_id: string;
  quantity: string | number;
  batch_number?: string;
  expiry_date?: string;
};

const exactQty = (value: unknown, field: string, positive = true) => {
  const qty = parseExactQuantity(value, field, { allowNegative: false, maxDecimals: 4 });
  if (positive && qty.startsWith('-')) throw new Error(`VALIDATION_ERROR:${field} must be positive.`);
  return qty;
};

const exactMoney = (value: unknown, field: string) => parseExactMoney(value, field, { allowNegative: false });

const moneyToCents = (value: string): bigint => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
};

const centsToMoney = (value: bigint): string => {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const cents = String(abs % 100n).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${cents}`;
};

export class PurchasingService {
  private inventory: InventoryRepository;

  constructor(private readonly db: DatabaseClient) {
    this.inventory = new InventoryRepository(db);
  }

  async listPurchaseOrders(organizationId: string, options: { status?: string; supplierId?: string; limit?: number; offset?: number } = {}) {
    if (!organizationId) throw new Error('TENANT_ACCESS_DENIED:Tenant context is required.');
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const offset = Math.min(Math.max(options.offset ?? 0, 0), 10000);
    const result = await this.db.query(
      `SELECT po.id,po.organization_id,po.supplier_id,s.name AS supplier_name,
              po.destination_location_id,l.name AS destination_location_name,po.po_number,
              po.status,po.payment_status,po.order_date,po.expected_date,po.received_date,
              po.subtotal,po.tax_amount,po.shipping_fee,po.total_amount,po.notes,po.created_by,
              COALESCE(json_agg(json_build_object(
                'id',poi.id,'variant_id',poi.variant_id,'sku',poi.sku,
                'ordered_qty',poi.ordered_qty::text,'received_qty',poi.received_qty::text,
                'unit_cost',poi.unit_cost::text,'total_cost',poi.total_cost::text,
                'batch_number',poi.batch_number,'expiry_date',poi.expiry_date
              ) ORDER BY poi.created_at) FILTER (WHERE poi.id IS NOT NULL),'[]'::json) AS items
         FROM purchase_orders po
         JOIN suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id
         JOIN locations l ON l.id=po.destination_location_id AND l.organization_id=po.organization_id
         LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
        WHERE po.organization_id=$1
          AND ($2::text IS NULL OR po.status=$2)
          AND ($3::text IS NULL OR po.supplier_id=$3)
        GROUP BY po.id,s.name,l.name
        ORDER BY po.created_at DESC
        LIMIT $4 OFFSET $5`,
      [organizationId, options.status || null, options.supplierId || null, limit, offset],
    );
    return result.rows;
  }

  async createPurchaseOrder(organizationId: string, actor: { userId: string; name?: string }, input: {
    supplier_id: string;
    destination_location_id: string;
    expected_date?: string;
    notes?: string;
    items: PurchaseItemInput[];
    tax_amount?: string | number;
    shipping_fee?: string | number;
    idempotency_key?: string;
  }) {
    if (!organizationId) throw new Error('TENANT_ACCESS_DENIED:Tenant context is required.');
    if (!input.supplier_id || !input.destination_location_id || !Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('VALIDATION_ERROR:Supplier, destination location and at least one item are required.');
    }
    if (input.items.length > 200) throw new Error('VALIDATION_ERROR:Purchase order cannot contain more than 200 items.');

    return this.db.withTransaction(async (tx) => {
      if (input.idempotency_key) {
        const existing = await tx.query(
          `SELECT id FROM purchase_orders WHERE organization_id=$1 AND idempotency_key=$2 LIMIT 1`,
          [organizationId, input.idempotency_key],
        );
        if (existing.rows[0]) return this.getPurchaseOrder(organizationId, existing.rows[0].id, tx);
      }

      const supplier = await tx.query(
        'SELECT id,name FROM suppliers WHERE id=$1 AND organization_id=$2 AND is_active=TRUE LIMIT 1',
        [input.supplier_id, organizationId],
      );
      if (!supplier.rows[0]) throw new Error('NOT_FOUND:Supplier not found or inactive.');

      const location = await tx.query(
        'SELECT id,name FROM locations WHERE id=$1 AND organization_id=$2 LIMIT 1',
        [input.destination_location_id, organizationId],
      );
      if (!location.rows[0]) throw new Error('TENANT_ACCESS_DENIED:Destination location does not belong to the organization.');

      const variantIds = input.items.map((item) => item.variant_id);
      const variants = await tx.query(
        `SELECT id,sku FROM product_variants WHERE organization_id=$1 AND id=ANY($2::varchar[])`,
        [organizationId, variantIds],
      );
      const variantMap = new Map(variants.rows.map((row: any) => [row.id, row]));
      if (variantMap.size !== new Set(variantIds).size) {
        throw new Error('TENANT_ACCESS_DENIED:One or more purchase variants do not belong to the organization.');
      }

      const normalizedItems = input.items.map((item) => {
        const variant = variantMap.get(item.variant_id);
        const qty = exactQty(item.ordered_qty, 'ordered_qty');
        const unitCost = exactMoney(item.unit_cost, 'unit_cost');
        const total = centsToMoney((BigInt(qty.split('.')[0]) * 10000n + BigInt((qty.split('.')[1] || '').padEnd(4, '0'))) * moneyToCents(unitCost) / 10000n);
        return { variant_id: item.variant_id, sku: item.sku || variant.sku, ordered_qty: qty, unit_cost: unitCost, total_cost: total };
      });

      const subtotalCents = normalizedItems.reduce((sum, item) => sum + moneyToCents(item.total_cost), 0n);
      const taxCents = moneyToCents(exactMoney(input.tax_amount ?? '0.00', 'tax_amount'));
      const shippingCents = moneyToCents(exactMoney(input.shipping_fee ?? '0.00', 'shipping_fee'));
      const totalCents = subtotalCents + taxCents + shippingCents;
      const subtotal = centsToMoney(subtotalCents);
      const tax = centsToMoney(taxCents);
      const shipping = centsToMoney(shippingCents);
      const total = centsToMoney(totalCents);
      const id = `po_${randomUUID().replace(/-/g, '')}`;
      const poNumber = `PO-${new Date().getUTCFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;

      await tx.query(
        `INSERT INTO purchase_orders
          (id,organization_id,supplier_id,destination_location_id,po_number,status,payment_status,
           expected_date,subtotal,tax_amount,shipping_fee,total_amount,notes,created_by,idempotency_key)
         VALUES($1,$2,$3,$4,$5,'Draft','Unpaid',$6,$7,$8,$9,$10,$11,$12,$13)`,
        [id,organizationId,input.supplier_id,input.destination_location_id,poNumber,input.expected_date || null,
         subtotal,tax,shipping,total,input.notes || null,actor.name || actor.userId,input.idempotency_key || null],
      );

      for (const item of normalizedItems) {
        await tx.query(
          `INSERT INTO purchase_order_items(id,purchase_order_id,variant_id,sku,ordered_qty,received_qty,unit_cost,total_cost)
           VALUES($1,$2,$3,$4,$5,0,$6,$7)`,
          [`poi_${randomUUID().replace(/-/g, '')}`,id,item.variant_id,item.sku,item.ordered_qty,item.unit_cost,item.total_cost],
        );
      }

      return this.getPurchaseOrder(organizationId, id, tx);
    });
  }

  async updateStatus(organizationId: string, poId: string, status: 'Sent'|'Approved'|'Cancelled') {
    if (!organizationId) throw new Error('TENANT_ACCESS_DENIED:Tenant context is required.');
    const allowed: Record<string, string[]> = {
      Sent: ['Draft'],
      Approved: ['Sent'],
      Cancelled: ['Draft','Sent','Approved','Partially Received'],
    };
    return this.db.withTransaction(async (tx) => {
      const current = await tx.query('SELECT id,status FROM purchase_orders WHERE id=$1 AND organization_id=$2 FOR UPDATE',[poId,organizationId]);
      if (!current.rows[0]) throw new Error('NOT_FOUND:Purchase order not found.');
      if (!allowed[status]?.includes(current.rows[0].status)) throw new Error(`VALIDATION_ERROR:Cannot change purchase order from ${current.rows[0].status} to ${status}.`);
      await tx.query('UPDATE purchase_orders SET status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND organization_id=$3',[status,poId,organizationId]);
      return this.getPurchaseOrder(organizationId, poId, tx);
    });
  }

  async receive(organizationId: string, actor: { userId: string; name?: string }, poId: string, items: ReceiveItemInput[], idempotencyKey?: string, notes?: string) {
    if (!organizationId) throw new Error('TENANT_ACCESS_DENIED:Tenant context is required.');
    if (!Array.isArray(items) || items.length === 0) throw new Error('VALIDATION_ERROR:At least one received item is required.');
    if (items.length > 200) throw new Error('VALIDATION_ERROR:Receipt cannot contain more than 200 items.');
    return this.db.withTransaction(async (tx) => {
      const existingReceipt = idempotencyKey
        ? await tx.query('SELECT id FROM purchase_receipts WHERE organization_id=$1 AND idempotency_key=$2 LIMIT 1',[organizationId,idempotencyKey])
        : { rows: [] };
      if (existingReceipt.rows[0]) {
        return this.getPurchaseReceipt(organizationId, existingReceipt.rows[0].id, tx);
      }

      const poRes = await tx.query(
        `SELECT po.*,s.name AS supplier_name,l.name AS destination_location_name
           FROM purchase_orders po
           JOIN suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id
           JOIN locations l ON l.id=po.destination_location_id AND l.organization_id=po.organization_id
          WHERE po.id=$1 AND po.organization_id=$2 FOR UPDATE`,
        [poId,organizationId],
      );
      const po = poRes.rows[0];
      if (!po) throw new Error('NOT_FOUND:Purchase order not found.');
      if (['Draft','Cancelled','Received'].includes(po.status)) throw new Error(`VALIDATION_ERROR:Purchase order status ${po.status} cannot be received.`);

      const poItems = await tx.query('SELECT * FROM purchase_order_items WHERE purchase_order_id=$1 ORDER BY created_at FOR UPDATE',[poId]);
      const byVariant = new Map(poItems.rows.map((row: any) => [row.variant_id,row]));
      const seen = new Set<string>();
      const normalized = [];

      for (const item of items) {
        if (seen.has(item.variant_id)) throw new Error('VALIDATION_ERROR:Each variant may appear only once in a receipt.');
        seen.add(item.variant_id);
        const poItem = byVariant.get(item.variant_id);
        if (!poItem) throw new Error('VALIDATION_ERROR:Received variant is not on the purchase order.');
        const qty = exactQty(item.quantity, 'quantity');
        const remaining = Number(poItem.ordered_qty) - Number(poItem.received_qty);
        if (Number(qty) > remaining) throw new Error('VALIDATION_ERROR:Received quantity exceeds the remaining purchase-order quantity.');
        normalized.push({ poItem, variant_id: item.variant_id, quantity: qty, batch_number: item.batch_number || null, expiry_date: item.expiry_date || null });
      }

      const receiptId = `grn_${randomUUID().replace(/-/g, '')}`;
      const receiptNumber = `GRN-${new Date().getUTCFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      await tx.query(
        `INSERT INTO purchase_receipts(id,organization_id,purchase_order_id,receipt_number,idempotency_key,received_by,notes,items)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [receiptId,organizationId,poId,receiptNumber,idempotencyKey || null,actor.userId,notes || null,JSON.stringify(normalized.map((x:any)=>({variant_id:x.variant_id,quantity:x.quantity,batch_number:x.batch_number,expiry_date:x.expiry_date})))],
      );

      for (const item of normalized) {
        await this.inventory.recordMovement({
          organization_id: organizationId,
          location_id: po.destination_location_id,
          variant_id: item.variant_id,
          movement_type: 'PURCHASE_RECEIVE',
          quantity_change: item.quantity,
          unit_cost: String(item.poItem.unit_cost),
          reference_type: 'PURCHASE_RECEIPT',
          reference_id: receiptId,
          reason: `Goods received for ${po.po_number}`,
          performed_by: actor.userId,
          notes: item.batch_number ? `Batch: ${item.batch_number}` : undefined,
          idempotency_key: `${receiptId}:${item.variant_id}`,
        }, tx);

        await tx.query(
          `UPDATE purchase_order_items
              SET received_qty=received_qty+$1,batch_number=$2,expiry_date=$3
            WHERE id=$4`,
          [item.quantity,item.batch_number,item.expiry_date || null,item.poItem.id],
        );
      }

      const refreshed = await tx.query(
        `SELECT COUNT(*) FILTER (WHERE received_qty >= ordered_qty) AS fully_received,
                COUNT(*) AS total_items
           FROM purchase_order_items WHERE purchase_order_id=$1`,
        [poId],
      );
      const fullyReceived = Number(refreshed.rows[0].fully_received) === Number(refreshed.rows[0].total_items);
      const nextStatus = fullyReceived ? 'Received' : 'Partially Received';
      await tx.query(
        'UPDATE purchase_orders SET status=$1,received_date=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND organization_id=$3',
        [nextStatus,poId,organizationId],
      );

      await tx.query(
        `INSERT INTO audit_events(id,organization_id,actor_id,actor_name,actor_role,action,entity_type,entity_id,location_id,metadata,severity)
         VALUES($1,$2,$3,$4,$5,'PURCHASE_RECEIVED','PURCHASE_ORDER',$6,$7,$8::jsonb,'Medium')`,
        [`audit_${randomUUID().replace(/-/g,'')}`,organizationId,actor.userId,actor.name || actor.userId,'merchant',poId,po.destination_location_id,JSON.stringify({receiptId,receiptNumber})],
      );

      return this.getPurchaseReceipt(organizationId, receiptId, tx);
    });
  }

  async getPurchaseOrder(organizationId: string, poId: string, client: DatabaseClient = this.db) {
    const result = await client.query(
      `SELECT po.*,s.name AS supplier_name,l.name AS destination_location_name,
              COALESCE(json_agg(json_build_object(
                'id',poi.id,'variant_id',poi.variant_id,'sku',poi.sku,
                'ordered_qty',poi.ordered_qty::text,'received_qty',poi.received_qty::text,
                'unit_cost',poi.unit_cost::text,'total_cost',poi.total_cost::text,
                'batch_number',poi.batch_number,'expiry_date',poi.expiry_date
              ) ORDER BY poi.created_at) FILTER (WHERE poi.id IS NOT NULL),'[]'::json) AS items
         FROM purchase_orders po
         JOIN suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id
         JOIN locations l ON l.id=po.destination_location_id AND l.organization_id=po.organization_id
         LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
        WHERE po.organization_id=$1 AND po.id=$2
        GROUP BY po.id,s.name,l.name`,
      [organizationId,poId],
    );
    if (!result.rows[0]) throw new Error('NOT_FOUND:Purchase order not found.');
    return result.rows[0];
  }

  async getPurchaseReceipt(organizationId: string, receiptId: string, client: DatabaseClient = this.db) {
    const result = await client.query(
      `SELECT pr.id,pr.receipt_number,pr.purchase_order_id,pr.received_by,pr.received_at,pr.notes,pr.items,
              po.po_number,po.supplier_id,s.name AS supplier_name,po.destination_location_id
         FROM purchase_receipts pr
         JOIN purchase_orders po ON po.id=pr.purchase_order_id AND po.organization_id=pr.organization_id
         JOIN suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id
        WHERE pr.organization_id=$1 AND pr.id=$2`,
      [organizationId,receiptId],
    );
    if (!result.rows[0]) throw new Error('NOT_FOUND:Purchase receipt not found.');
    return result.rows[0];
  }

  async listReceipts(organizationId: string, poId?: string) {
    const result = await this.db.query(
      `SELECT pr.id,pr.receipt_number,pr.purchase_order_id,pr.received_by,pr.received_at,pr.notes,pr.items,
              po.po_number,s.name AS supplier_name
         FROM purchase_receipts pr
         JOIN purchase_orders po ON po.id=pr.purchase_order_id AND po.organization_id=pr.organization_id
         JOIN suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id
        WHERE pr.organization_id=$1 AND ($2::text IS NULL OR pr.purchase_order_id=$2)
        ORDER BY pr.received_at DESC LIMIT 100`,
      [organizationId,poId || null],
    );
    return result.rows;
  }
}
