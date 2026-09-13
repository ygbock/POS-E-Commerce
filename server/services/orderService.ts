import { DatabaseClient, getDatabaseClient } from '../db/client.ts';
import { OrderRepository, OrderRecord, OrderItemRecord, PaymentRecord } from '../repositories/orderRepository.ts';
import { CustomerRepository } from '../repositories/customerRepository.ts';
import { InventoryRepository } from '../repositories/inventoryRepository.ts';
import { AuditRepository } from '../repositories/auditRepository.ts';
import {
  parseExactMoney,
  parseExactQuantity,
  parseQtyToScaled,
  formatScaledToQtyString,
} from '../inventory/inventoryPolicies.ts';
import crypto from 'node:crypto';
import { StorefrontCartService } from './storefrontCartService.ts';
import { ReservationService } from '../inventory/reservationService.ts';

export class DomainError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export function computeCanonicalRequestFingerprint(params: {
  organization_id: string;
  cart_items: { variant_id: string; quantity: string }[];
  fulfillment_method: string;
  payment_method: string;
  customer_id?: string | null;
  customer_details?: { name: string; email: string; phone: string; address?: any } | null;
  discount_code?: string | null;
  location_id?: string | null;
}): string {
  const sortedItems = [...params.cart_items]
    .sort((a, b) => a.variant_id.localeCompare(b.variant_id))
    .map(item => ({
      variant_id: item.variant_id,
      quantity: parseExactQuantity(item.quantity, 'quantity'),
    }));

  const canonicalObj = {
    organization_id: params.organization_id,
    customer_id: params.customer_id || null,
    customer_details: params.customer_details ? {
      name: params.customer_details.name || '',
      email: params.customer_details.email || '',
      phone: params.customer_details.phone || '',
      address: params.customer_details.address || null,
    } : null,
    cart_items: sortedItems,
    fulfillment_method: params.fulfillment_method,
    payment_method: params.payment_method,
    discount_code: params.discount_code || null,
    location_id: params.location_id || null,
  };

  const serialized = JSON.stringify(canonicalObj);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

export function extractFingerprint(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/^\[idempotency_fingerprint:([a-f0-9]{64})\]/);
  return match ? match[1] : null;
}

export class OrderService {
  private db: DatabaseClient;
  private orderRepo: OrderRepository;
  private customerRepo: CustomerRepository;
  private invRepo: InventoryRepository;
  private auditRepo: AuditRepository;
  private storefrontCartService: StorefrontCartService;
  private reservationService: ReservationService;

  constructor(
    orderRepo?: OrderRepository,
    customerRepo?: CustomerRepository,
    invRepo?: InventoryRepository,
    auditRepo?: AuditRepository,
    db?: DatabaseClient
  ) {
    this.db = db || getDatabaseClient();
    this.orderRepo = orderRepo || new OrderRepository(this.db);
    this.customerRepo = customerRepo || new CustomerRepository(this.db);
    this.invRepo = invRepo || new InventoryRepository(this.db);
    this.auditRepo = auditRepo || new AuditRepository(this.db);
    this.storefrontCartService = new StorefrontCartService(this.db);
    this.reservationService = new ReservationService(undefined, undefined, this.db);
  }

  private localDivideRoundHalfUp(num: bigint, denom: bigint): bigint {
    const isNeg = num < 0n;
    const absNum = isNeg ? -num : num;
    const absDenom = denom < 0n ? -denom : denom;
    const half = absDenom / 2n;
    const resVal = (absNum + half) / absDenom;
    return isNeg ? -resVal : resVal;
  }

  private localParseMoneyToCents(val: string): bigint {
    const norm = parseExactMoney(val, 'money', { allowNegative: true });
    const isNeg = norm.startsWith('-');
    const absVal = isNeg ? norm.slice(1) : norm;
    const parts = absVal.split('.');
    const whole = BigInt(parts[0]);
    let fracStr = parts[1] || '';
    while (fracStr.length < 2) {
      fracStr += '0';
    }
    const frac = BigInt(fracStr.slice(0, 2));
    const cents = whole * 100n + frac;
    return isNeg ? -cents : cents;
  }

  private localFormatCentsToMoneyString(cents: bigint): string {
    const isNeg = cents < 0n;
    const abs = isNeg ? -cents : cents;
    const whole = abs / 100n;
    const frac = abs % 100n;
    return `${isNeg ? '-' : ''}${whole}.${frac.toString().padStart(2, '0')}`;
  }

  async placeStorefrontOrder(params: {
    organization_id: string;
    actor_name: string;
    actor_role: string;
    idempotency_key: string;
    customer_id?: string | null;
    customer_details?: { name: string; email: string; phone: string; address?: any } | null;
    fulfillment_method: 'Standard Delivery' | 'Express Delivery' | 'In-Store Pickup';
    payment_method: 'Credit Card' | 'Mobile Money' | 'Fintech Wallet';
    cart_items: { variant_id: string; quantity: string }[];
    discount_code?: string | null;
    location_id?: string | null;
  }): Promise<{ order: OrderRecord; items: OrderItemRecord[]; payments: PaymentRecord[] }> {
    const { organization_id, actor_name, actor_role, idempotency_key, cart_items, fulfillment_method, payment_method, discount_code } = params;

    // ------------------------------------------------------------------
    // IDEMPOTENCY FORMAT VALIDATION
    // ------------------------------------------------------------------
    if (!idempotency_key || typeof idempotency_key !== 'string' || idempotency_key.trim() === '') {
      throw new DomainError('VALIDATION_ERROR', 'Idempotency key is required.');
    }
    if (idempotency_key.length > 128) {
      throw new DomainError('VALIDATION_ERROR', 'Idempotency key must not exceed 128 characters.');
    }
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(idempotency_key)) {
      throw new DomainError('VALIDATION_ERROR', 'Idempotency key must be a valid, cryptographically secure UUID.');
    }

    // ------------------------------------------------------------------
    // QUANTITY BOUNDARY & INPUT VALIDATION
    // ------------------------------------------------------------------
    if (!cart_items || !Array.isArray(cart_items) || cart_items.length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'Cart items must be a non-empty array.');
    }

    for (const item of cart_items) {
      if (!item || typeof item !== 'object') {
        throw new DomainError('VALIDATION_ERROR', 'Cart items must contain valid item objects.');
      }
      if (!item.variant_id || typeof item.variant_id !== 'string' || item.variant_id.trim() === '') {
        throw new DomainError('VALIDATION_ERROR', 'Each item must have a valid non-empty variant_id string.');
      }
      const quantity = item.quantity;
      if (typeof quantity !== 'string') {
        throw new DomainError('VALIDATION_ERROR', 'Quantity must be supplied as a decimal string.');
      }
      if (quantity.trim() === '') {
        throw new DomainError('VALIDATION_ERROR', 'Quantity cannot be empty or whitespace.');
      }

      // Enforce the exact quantity parser directly against the original value without Number() or toFixed() repairs
      let validatedQtyStr: string;
      try {
        validatedQtyStr = parseExactQuantity(quantity, 'quantity', { allowNegative: false });
      } catch (err: any) {
        throw new DomainError('VALIDATION_ERROR', err.message);
      }

      const qtyScaled = parseQtyToScaled(validatedQtyStr);
      if (qtyScaled <= 0n) {
        throw new DomainError('VALIDATION_ERROR', 'Quantity must be greater than zero.');
      }
    }

    // ------------------------------------------------------------------
    // CANONICAL FINGERPRINT COMPUTATION
    // ------------------------------------------------------------------
    const currentFingerprint = computeCanonicalRequestFingerprint({
      organization_id,
      cart_items,
      fulfillment_method,
      payment_method,
      customer_id: params.customer_id,
      customer_details: params.customer_details,
      discount_code,
      location_id: params.location_id,
    });

    // ------------------------------------------------------------------
    // STOPS ON UNSAFE DB CONFIGS / DEPENDENCIES
    // ------------------------------------------------------------------
    if (discount_code) {
      throw new DomainError('VALIDATION_ERROR', 'Coupons/discounts are not supported as there is no database-backed coupon schema configured.');
    }

    try {
      return await this.db.withTransaction(async (tx) => {
        // A. Location Validation
        let fulfillmentLocId = params.location_id;
        if (fulfillmentLocId) {
          const locRes = await tx.query<any>(
            `SELECT * FROM locations WHERE id = $1 AND organization_id = $2`,
            [fulfillmentLocId, organization_id]
          );
          if (locRes.rows.length === 0) {
            throw new DomainError('VALIDATION_ERROR', `Fulfillment location with ID '${fulfillmentLocId}' not found under this organization.`);
          }
          if (!locRes.rows[0].is_active) {
            throw new DomainError('VALIDATION_ERROR', `Fulfillment location '${locRes.rows[0].name}' is inactive.`);
          }
        } else {
          const locRes = await tx.query<any>(
            `SELECT * FROM locations WHERE organization_id = $1 AND is_active = true ORDER BY (case when type = 'Warehouse' then 1 else 2 end), id LIMIT 1`,
            [organization_id]
          );
          if (locRes.rows.length === 0) {
            throw new DomainError('VALIDATION_ERROR', 'No active fulfillment location found for this tenant.');
          }
          fulfillmentLocId = locRes.rows[0].id;
        }

        // B. Customer Validation
        let authorCustomerRecord = null;
        if (params.customer_id) {
          const custRes = await tx.query<any>(
            `SELECT id, organization_id, name, email, phone FROM customers WHERE id = $1 AND organization_id = $2`,
            [params.customer_id, organization_id]
          );
          if (custRes.rows.length === 0) {
            throw new DomainError('VALIDATION_ERROR', `Customer with ID '${params.customer_id}' not found under this tenant.`);
          }
          authorCustomerRecord = custRes.rows[0];
        }

        // C. Calculate Totals & Lock Stock
        let totalSubtotalCents = 0n;
        let totalTaxCents = 0n;
        let totalCostCents = 0n;
        const orderItems: OrderItemRecord[] = [];
        const orderId = `ord_${crypto.randomUUID()}`;

        for (const item of cart_items) {
          const variantRes = await tx.query<any>(
            `SELECT pv.id, pv.sku, pv.barcode, pv.name as variant_name, pv.cost_price::text, pv.retail_price::text,
                    p.name as product_name, p.tax_rate::text, p.status
             FROM product_variants pv
             JOIN products p ON pv.product_id = p.id
             WHERE pv.id = $1 AND p.organization_id = $2`,
            [item.variant_id, organization_id]
          );

          if (variantRes.rows.length === 0) {
            throw new DomainError('PRODUCT_NOT_FOUND', `Product variant '${item.variant_id}' not found.`);
          }

          const variant = variantRes.rows[0];
          if (variant.status !== 'active') {
            throw new DomainError('PRODUCT_NOT_FOUND', `Variant '${variant.sku}' is inactive.`);
          }

          const qtyScaled = parseQtyToScaled(item.quantity);
          const retailPriceCents = this.localParseMoneyToCents(variant.retail_price);
          const costPriceCents = this.localParseMoneyToCents(variant.cost_price);

          // Row lock inventory balance
          const stockRes = await tx.query<any>(
            `SELECT on_hand, reserved FROM inventory_balances 
             WHERE location_id = $1 AND variant_id = $2 AND organization_id = $3 FOR UPDATE`,
            [fulfillmentLocId, item.variant_id, organization_id]
          );

          const onHandQty = stockRes.rows.length > 0 ? parseQtyToScaled(stockRes.rows[0].on_hand.toString()) : 0n;
          const reservedQty = stockRes.rows.length > 0 ? parseQtyToScaled(stockRes.rows[0].reserved.toString()) : 0n;
          const availableQty = onHandQty - reservedQty;

          if (availableQty < qtyScaled) {
            throw new DomainError('INSUFFICIENT_STOCK', `Insufficient stock for variant '${variant.sku}'. Requested: ${item.quantity}, Available: ${formatScaledToQtyString(availableQty)}.`);
          }

          // Reserve the exact quantity under the same row lock used for the
          // availability check. This is the concurrency boundary: a second
          // checkout cannot observe the quantity as available after this point.
          await tx.query(
            `UPDATE inventory_balances
             SET reserved = reserved + $1,
                 updated_at = NOW()
             WHERE location_id = $2
               AND variant_id = $3
               AND organization_id = $4`,
            [item.quantity, fulfillmentLocId, item.variant_id, organization_id]
          );

          const lineSubtotalScaled = retailPriceCents * qtyScaled;
          const lineSubtotalCents = this.localDivideRoundHalfUp(lineSubtotalScaled, 10000n);

          const taxRateStr = variant.tax_rate || '0.00';
          const taxRateScaled = parseQtyToScaled(taxRateStr);
          const lineTaxScaled = lineSubtotalCents * taxRateScaled;
          const lineTaxCents = this.localDivideRoundHalfUp(lineTaxScaled, 1000000n);

          const lineTotalCents = lineSubtotalCents + lineTaxCents;

          const lineCostScaled = costPriceCents * qtyScaled;
          const lineCostCents = this.localDivideRoundHalfUp(lineCostScaled, 10000n);

          totalSubtotalCents += lineSubtotalCents;
          totalTaxCents += lineTaxCents;
          totalCostCents += lineCostCents;

          orderItems.push({
            id: `itm_${crypto.randomUUID()}`,
            order_id: orderId,
            variant_id: item.variant_id,
            product_name: variant.product_name,
            variant_name: variant.variant_name,
            sku: variant.sku,
            unit_price: parseExactMoney(variant.retail_price),
            cost_price: parseExactMoney(variant.cost_price),
            quantity: item.quantity,
            discount_amount: '0.00',
            tax_rate: parseExactQuantity(taxRateStr),
            total_amount: this.localFormatCentsToMoneyString(lineTotalCents),
          });
        }

        // D. Shipping is policy-driven, never hard-coded in the order service.
        // Keep the checkout arithmetic identical to cart validation.
        const orgPolicyRes = await tx.query<any>(
          `SELECT policies, currency_code
           FROM organizations
           WHERE id = $1 AND is_active = true
           LIMIT 1`,
          [organization_id]
        );
        if (orgPolicyRes.rows.length === 0) {
          throw new DomainError('TENANT_NOT_FOUND', 'Store tenant is unavailable.');
        }

        const rawPolicies =
          typeof orgPolicyRes.rows[0].policies === 'string'
            ? JSON.parse(orgPolicyRes.rows[0].policies)
            : (orgPolicyRes.rows[0].policies || {});

        const freeThreshold = this.localParseMoneyToCents(
          String(rawPolicies.freeShippingThreshold ?? '75.00')
        );
        let shippingFeeCents = 0n;
        if (fulfillment_method === 'Express Delivery') {
          shippingFeeCents = this.localParseMoneyToCents(
            String(rawPolicies.expressShippingFee ?? '19.99')
          );
        } else if (fulfillment_method === 'Standard Delivery') {
          shippingFeeCents =
            totalSubtotalCents >= freeThreshold
              ? 0n
              : this.localParseMoneyToCents(
                  String(rawPolicies.standardShippingFee ?? '9.99')
                );
        }

        const finalTotalCents = totalSubtotalCents + totalTaxCents + shippingFeeCents;

        // E. Secure Order Number Generation
        const secureUUIDPart = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
        const orderNumber = `ORD-${secureUUIDPart}`;

        const trackingNumber = fulfillment_method === 'In-Store Pickup' ? `PICKUP-${orderNumber}` : `TRK-OMNI-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
        const carrierName = fulfillment_method === 'Express Delivery' ? 'FedEx Priority Overnight' : fulfillment_method === 'Standard Delivery' ? 'OmniTrack / DHL Ground' : 'Direct Store Pickup';

        // Write fingerprint at the start of the notes field
        const notesWithFingerprint = `[idempotency_fingerprint:${currentFingerprint}] Storefront checkout order for customer: ${authorCustomerRecord?.name || params.customer_details?.name || 'Guest'}`;

        const orderRecord: OrderRecord = {
          id: orderId,
          organization_id,
          location_id: fulfillmentLocId!,
          customer_id: authorCustomerRecord?.id || null,
          order_number: orderNumber,
          source: 'ECOMMERCE',
          channel: 'Online Web Store',
          fulfillment_method,
          subtotal: this.localFormatCentsToMoneyString(totalSubtotalCents),
          discount_amount: '0.00',
          discount_code: null,
          tax_amount: this.localFormatCentsToMoneyString(totalTaxCents),
          shipping_fee: this.localFormatCentsToMoneyString(shippingFeeCents),
          total_amount: this.localFormatCentsToMoneyString(finalTotalCents),
          total_cost_amount: this.localFormatCentsToMoneyString(totalCostCents),
          payment_status: 'Pending', // Honest Pending status
          status: 'Stock Reserved', // Honest Stock Reserved status
          carrier_name: carrierName,
          tracking_number: trackingNumber,
          notes: notesWithFingerprint,
          idempotency_key,
        };

        const paymentRecord: PaymentRecord = {
          id: `pay_${crypto.randomUUID()}`,
          organization_id,
          order_id: orderId,
          payment_method,
          amount: this.localFormatCentsToMoneyString(finalTotalCents),
          currency: String(orgPolicyRes.rows[0].currency_code || 'SLE'),
          status: 'Pending', // Honest Pending status
          reference: orderNumber,
          provider: 'Storefront',
        };

        // Wrap database writes in a savepoint to protect transaction abort status on conflict
        await tx.query('SAVEPOINT storefront_idempotency_insert');
        try {
          const saved = await this.orderRepo.createOrderWithItems(orderRecord, orderItems, paymentRecord, tx);

          // Create first-class reservations while the order is in "Stock Reserved".
          // Reservation records provide the lifecycle required for cancellation,
          // expiry and fulfillment; their balance updates occur in this transaction.
          for (const item of orderItems) {
            await this.reservationService.createReservation(
              organization_id,
              {
                location_id: fulfillmentLocId!,
                variant_id: item.variant_id,
                quantity: item.quantity,
                reference_type: 'orders',
                reference_id: orderId,
                notes: `Storefront order ${orderNumber}`,
                idempotency_key: `${orderId}:reservation:${item.variant_id}`,
              },
              'Online Storefront',
              `${orderId}:reservation:${item.variant_id}`,
              tx
            );
          }

          // Create Audit Event
          await this.auditRepo.recordEvent({
            organization_id,
            actor_name,
            actor_role,
            action: 'storefront.order_create',
            entity_type: 'orders',
            entity_id: orderId,
            location_id: fulfillmentLocId!,
            metadata: {
              order_number: orderNumber,
              total_amount: this.localFormatCentsToMoneyString(finalTotalCents),
              payment_method,
            },
            severity: 'Info',
          }, tx);

          await tx.query('RELEASE SAVEPOINT storefront_idempotency_insert');

          return {
            order: saved.order,
            items: saved.items,
            payments: [paymentRecord],
          };
        } catch (err: any) {
          const errCode = String(err?.code || '');
          const errMsg = String(err?.message || '');
          if (
            errCode === '23505' ||
            errMsg.includes('uq_orders_org_idempotency') ||
            errMsg.includes('orders_idempotency_key_key') ||
            errMsg.includes('duplicate key') ||
            errMsg.includes('violates unique constraint')
          ) {
            await tx.query('ROLLBACK TO SAVEPOINT storefront_idempotency_insert');

            // Query existing order inside the STILL ACTIVE transaction!
            const raceOrderRes = await tx.query<any>(
              `SELECT id, notes, organization_id FROM orders WHERE idempotency_key = $1`,
              [idempotency_key]
            );
            if (raceOrderRes.rows.length > 0) {
              const orderOrgId = raceOrderRes.rows[0].organization_id;
              if (orderOrgId !== organization_id) {
                throw new DomainError('IDEMPOTENCY_CONFLICT', `Idempotency key '${idempotency_key}' is already claimed.`);
              }
              const raceOrderId = raceOrderRes.rows[0].id;
              const storedNotes = raceOrderRes.rows[0].notes;
              const storedFingerprint = extractFingerprint(storedNotes);

              if (storedFingerprint === currentFingerprint) {
                const fullOrder = await this.orderRepo.findOrderById(raceOrderId, organization_id, tx);
                if (fullOrder) {
                  const payments = await tx.query<any>(
                    `SELECT * FROM payments WHERE order_id = $1 AND organization_id = $2`,
                    [raceOrderId, organization_id]
                  );
                  return {
                    order: fullOrder.order,
                    items: fullOrder.items,
                    payments: payments.rows,
                  };
                }
              } else {
                throw new DomainError('IDEMPOTENCY_CONFLICT', `An order with idempotency key '${idempotency_key}' already exists with different request parameters.`);
              }
            }
          }
          throw err;
        }
      });
    } catch (err: any) {
      const errCode = String(err?.code || '');
      const errMsg = String(err?.message || '');
      if (
        errCode === '23505' ||
        errMsg.includes('uq_orders_org_idempotency') ||
        errMsg.includes('orders_idempotency_key_key') ||
        errMsg.includes('duplicate key') ||
        errMsg.includes('violates unique constraint')
      ) {
        const raceOrderRes = await this.db.query<any>(
          `SELECT id, notes, organization_id FROM orders WHERE idempotency_key = $1`,
          [idempotency_key]
        );
        if (raceOrderRes.rows.length > 0) {
          const orderOrgId = raceOrderRes.rows[0].organization_id;
          if (orderOrgId !== organization_id) {
            throw new DomainError('IDEMPOTENCY_CONFLICT', `Idempotency key '${idempotency_key}' is already claimed.`);
          }
          const orderId = raceOrderRes.rows[0].id;
          const storedNotes = raceOrderRes.rows[0].notes;
          const storedFingerprint = extractFingerprint(storedNotes);

          if (storedFingerprint === currentFingerprint) {
            const fullOrder = await this.orderRepo.findOrderById(orderId, organization_id);
            if (fullOrder) {
              const payments = await this.db.query<any>(
                `SELECT * FROM payments WHERE order_id = $1 AND organization_id = $2`,
                [orderId, organization_id]
              );
              return {
                order: fullOrder.order,
                items: fullOrder.items,
                payments: payments.rows,
              };
            }
          } else {
            throw new DomainError('IDEMPOTENCY_CONFLICT', `An order with idempotency key '${idempotency_key}' already exists with different request parameters.`);
          }
        }
      }
      throw err;
    }
  }
}
