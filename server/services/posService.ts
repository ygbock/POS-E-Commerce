import { DatabaseClient, getDatabaseClient } from '../db/client';
import { PosRepository, PosSessionRecord, PosCashMovementRecord, PosReturnRecord, PosReturnItemRecord } from '../repositories/posRepository';
import { OrderRepository, OrderRecord, OrderItemRecord, PaymentRecord } from '../repositories/orderRepository';
import { InventoryRepository } from '../repositories/inventoryRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { toQtyString, parseExactMoney, parseQtyToScaled, formatScaledToQtyString, parseExactQuantity } from '../inventory/inventoryPolicies';
import crypto from 'node:crypto';

// ============================================================================
// IDEMPOTENCY FINGERPRINT ENGINE
// ============================================================================

function computeCanonicalRequestFingerprint(params: {
  organization_id: string;
  location_id: string;
  session_id: string;
  customer_id?: string | null;
  cart_items: { variant_id: string; quantity: string; discount_percentage?: string }[];
  payment_method: string;
  amount_paid: string;
}): string {
  const sortedItems = [...params.cart_items]
    .sort((a, b) => a.variant_id.localeCompare(b.variant_id))
    .map(item => ({
      variant_id: item.variant_id,
      quantity: parseExactQuantity(item.quantity, 'quantity', { allowNegative: true }),
      discount_percentage: parseExactQuantity(item.discount_percentage || '0.00', 'discount_percentage', { allowNegative: true }),
    }));

  const canonicalObj = {
    organization_id: params.organization_id,
    location_id: params.location_id,
    session_id: params.session_id,
    customer_id: params.customer_id || null,
    cart_items: sortedItems,
    payment_method: params.payment_method,
    amount_paid: parseExactMoney(params.amount_paid, 'amount_paid', { allowNegative: true }),
  };

  const serialized = JSON.stringify(canonicalObj);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function computeCanonicalReturnFingerprint(params: {
  organization_id: string;
  order_id: string;
  refund_method: string;
  return_items: { variant_id: string; quantity: string }[];
}): string {
  const sortedItems = [...params.return_items]
    .sort((a, b) => a.variant_id.localeCompare(b.variant_id))
    .map(item => ({
      variant_id: item.variant_id,
      quantity: parseExactQuantity(item.quantity, 'quantity', { allowNegative: true }),
    }));

  const canonicalObj = {
    organization_id: params.organization_id,
    order_id: params.order_id,
    refund_method: params.refund_method,
    return_items: sortedItems,
  };

  const serialized = JSON.stringify(canonicalObj);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function extractFingerprint(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/^\[idempotency_fingerprint:([a-f0-9]{64})\]/);
  return match ? match[1] : null;
}

// ============================================================================
// EXACT ARITHMETIC ENGINE (Strictly Zero floats/Numbers for calculations)
// ============================================================================

function parseMoneyToCents(value: string, options?: { allowNegative?: boolean }): bigint {
  const norm = parseExactMoney(value, 'money', { allowNegative: options?.allowNegative ?? true });
  const isNegative = norm.startsWith('-');
  const absVal = isNegative ? norm.slice(1) : norm;
  const parts = absVal.split('.');
  const whole = BigInt(parts[0]);
  let fracStr = parts[1] || '';
  while (fracStr.length < 2) {
    fracStr += '0';
  }
  const frac = BigInt(fracStr);
  const absCents = whole * 100n + frac;
  return isNegative ? -absCents : absCents;
}

function formatCentsToMoneyString(cents: bigint): string {
  const isNegative = cents < 0n;
  const abs = isNegative ? -cents : cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const fracStr = frac.toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${whole}.${fracStr}`;
}

function divideRoundHalfUp(num: bigint, denom: bigint): bigint {
  const isNegative = num < 0n;
  const absNum = isNegative ? -num : num;
  const absDenom = denom < 0n ? -denom : denom;
  const half = absDenom / 2n;
  const result = (absNum + half) / absDenom;
  return isNegative ? -result : result;
}

export class PosService {
  private posRepo: PosRepository;
  private orderRepo: OrderRepository;
  private invRepo: InventoryRepository;
  private auditRepo: AuditRepository;
  private db: DatabaseClient;

  constructor(
    posRepo?: PosRepository,
    orderRepo?: OrderRepository,
    invRepo?: InventoryRepository,
    auditRepo?: AuditRepository,
    db?: DatabaseClient
  ) {
    this.db = db || getDatabaseClient();
    this.posRepo = posRepo || new PosRepository(this.db);
    this.orderRepo = orderRepo || new OrderRepository(this.db);
    this.invRepo = invRepo || new InventoryRepository(this.db);
    this.auditRepo = auditRepo || new AuditRepository(this.db);
  }

  /**
   * Safe Order Number Generator (Cryptographically secure instead of Math.random)
   */
  private generateSecureOrderNumber(): string {
    const uuidPart = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    return `ORD-${uuidPart}`;
  }

  /**
   * 1. Open POS Session (double open prohibited for same location and terminal)
   */
  async openSession(
    orgId: string,
    locationId: string,
    terminalId: string,
    cashierName: string,
    openingCash: string
  ): Promise<PosSessionRecord> {
    const normOpeningCash = parseExactMoney(openingCash);

    // Fail early if there is already an active open session
    const active = await this.posRepo.getActiveSession(locationId, terminalId, orgId);
    if (active) {
      throw new Error(
        `DUPLICATE_SESSION: There is already an open POS session for location '${locationId}' in this organization.`
      );
    }

    const sessionId = `ses_${crypto.randomUUID()}`;
    const session: PosSessionRecord = {
      id: sessionId,
      organization_id: orgId,
      location_id: locationId,
      terminal_id: terminalId,
      cashier_name: cashierName,
      status: 'OPEN',
      opening_cash: normOpeningCash,
      expected_cash: normOpeningCash,
      opened_at: new Date().toISOString(),
    };

    try {
      const saved = await this.posRepo.createSession(session);

      // Audit Log
      await this.auditRepo.recordEvent({
        organization_id: orgId,
        actor_name: cashierName,
        actor_role: 'Cashier',
        action: 'pos.session_open',
        entity_type: 'pos_sessions',
        entity_id: sessionId,
        location_id: locationId,
        metadata: { opening_cash: normOpeningCash },
        severity: 'Info',
      });

      return saved;
    } catch (err: any) {
      if (err?.code === '23505' || err?.message?.includes('uq_active_pos_session')) {
        throw new Error(
          `DUPLICATE_SESSION: There is already an open POS session for location '${locationId}' and terminal '${terminalId}' in this organization.`
        );
      }
      throw err;
    }
  }

  /**
   * 2. Close POS Session with expected cash calculation (FOR UPDATE locked)
   */
  async closeSession(
    sessionId: string,
    orgId: string,
    countedCash: string,
    closingActor: string
  ): Promise<PosSessionRecord> {
    const countedCents = parseMoneyToCents(countedCash);

    return this.db.withTransaction(async (tx) => {
      // Lock session row for update
      const sessionRes = await tx.query<any>(
        `SELECT * FROM pos_sessions WHERE id = $1 FOR UPDATE`,
        [sessionId]
      );

      if (sessionRes.rows.length === 0) {
        throw new Error(`SESSION_NOT_FOUND: POS Session '${sessionId}' was not found.`);
      }

      const session = sessionRes.rows[0];
      if (session.organization_id !== orgId) {
        throw new Error(`TENANT_ACCESS_DENIED: Access to session is denied.`);
      }

      if (session.status === 'CLOSED') {
        throw new Error(`SESSION_CLOSED: POS Session '${sessionId}' is already closed.`);
      }

      // Calculate authoritative expected cash:
      // Expected = opening_cash + cash_sales + cash_in - cash_out - cash_refunds
      const cashSalesRes = await tx.query<any>(
        `SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p
         JOIN orders o ON p.order_id = o.id
         WHERE o.pos_session_id = $1 AND p.payment_method = 'Cash' AND p.status = 'Completed'
           AND p.organization_id = $2 AND o.organization_id = $2`,
        [sessionId, orgId]
      );
      const cashSalesCents = parseMoneyToCents(cashSalesRes.rows[0].total.toString());

      const cashMoveRes = await tx.query<any>(
        `SELECT COALESCE(SUM(CASE WHEN type = 'Cash In' THEN amount ELSE -amount END), 0) as total
         FROM pos_cash_movements WHERE session_id = $1`,
        [sessionId]
      );
      const cashMoveCents = parseMoneyToCents(cashMoveRes.rows[0].total.toString(), { allowNegative: true });

      const cashRefundRes = await tx.query<any>(
        `SELECT COALESCE(SUM(refund_amount), 0) as total FROM pos_returns pr
         JOIN orders o ON pr.order_id = o.id
         WHERE o.pos_session_id = $1 AND pr.refund_method = 'Cash'
           AND pr.organization_id = $2 AND o.organization_id = $2`,
        [sessionId, orgId]
      );
      const cashRefundCents = parseMoneyToCents(cashRefundRes.rows[0].total.toString());

      const openingCents = parseMoneyToCents(session.opening_cash);
      const expectedCents = openingCents + cashSalesCents + cashMoveCents - cashRefundCents;
      const expectedCashStr = formatCentsToMoneyString(expectedCents);

      const varianceCents = countedCents - expectedCents;
      const varianceStr = formatCentsToMoneyString(varianceCents);

      const closed = await this.posRepo.closeSession(
        sessionId,
        {
          counted_cash: formatCentsToMoneyString(countedCents),
          variance: varianceStr,
          closing_actor: closingActor,
          expected_cash: expectedCashStr,
        },
        tx
      );

      // Audit Log
      await this.auditRepo.recordEvent({
        organization_id: orgId,
        actor_name: closingActor,
        actor_role: 'Store Manager',
        action: 'pos.session_close',
        entity_type: 'pos_sessions',
        entity_id: sessionId,
        location_id: session.location_id,
        metadata: {
          expected_cash: expectedCashStr,
          counted_cash: formatCentsToMoneyString(countedCents),
          variance: varianceStr,
        },
        severity: 'Info',
      }, tx);

      return closed;
    });
  }

  /**
   * 3. Record Cash Drawer Movement (Cash In / Cash Out, FOR UPDATE locked)
   */
  async recordCashMovement(
    sessionId: string,
    orgId: string,
    type: 'Cash In' | 'Cash Out',
    amount: string,
    reason: string,
    performedBy: string
  ): Promise<PosCashMovementRecord> {
    const moveCents = parseMoneyToCents(amount);

    return this.db.withTransaction(async (tx) => {
      // Lock session row for update
      const sessionRes = await tx.query<any>(
        `SELECT * FROM pos_sessions WHERE id = $1 FOR UPDATE`,
        [sessionId]
      );

      if (sessionRes.rows.length === 0) {
        throw new Error(`SESSION_NOT_FOUND: POS Session '${sessionId}' was not found.`);
      }

      const session = sessionRes.rows[0];
      if (session.organization_id !== orgId) {
        throw new Error(`TENANT_ACCESS_DENIED: Access to session is denied.`);
      }

      if (session.status !== 'OPEN') {
        throw new Error(`SESSION_CLOSED: Cannot perform cash movement in a closed POS session.`);
      }

      const movementId = `mov_${crypto.randomUUID()}`;
      const movement: PosCashMovementRecord = {
        id: movementId,
        session_id: sessionId,
        type,
        amount: formatCentsToMoneyString(moveCents),
        reason,
        performed_by: performedBy,
      };

      const saved = await this.posRepo.createCashMovement(movement, tx);

      // Re-calculate expected cash
      const currentExpectedCents = parseMoneyToCents(session.expected_cash, { allowNegative: true });
      const newExpectedCents = currentExpectedCents + (type === 'Cash In' ? moveCents : -moveCents);
      const newExpectedStr = formatCentsToMoneyString(newExpectedCents);

      await this.posRepo.updateSessionExpectedCash(sessionId, newExpectedStr, tx);

      // Audit
      await this.auditRepo.recordEvent({
        organization_id: orgId,
        actor_name: performedBy,
        actor_role: 'Cashier',
        action: 'pos.cash_movement',
        entity_type: 'pos_sessions',
        entity_id: sessionId,
        location_id: session.location_id,
        metadata: { type, amount: formatCentsToMoneyString(moveCents), reason },
        severity: 'Info',
      }, tx);

      return saved;
    });
  }

  /**
   * 4. Server-Authoritative POS Checkout Flow (Atomic, Idempotent, Concurrency-Safe)
   */
  async checkout(params: {
    organization_id: string;
    location_id: string;
    session_id: string;
    cashier_name: string;
    customer_id?: string | null;
    cart_items: { variant_id: string; quantity: string; discount_percentage?: string }[];
    payment_method: 'Cash' | 'Credit Card' | 'Mobile Money' | 'Store Credit' | 'Bank Transfer' | 'Fintech Wallet';
    amount_paid: string;
    notes?: string;
    idempotency_key?: string;
  }): Promise<{ order: OrderRecord; items: OrderItemRecord[]; payment?: PaymentRecord }> {
    const { organization_id, location_id, session_id, cashier_name } = params;
    const paidCents = parseMoneyToCents(params.amount_paid);

    const currentFingerprint = params.idempotency_key
      ? computeCanonicalRequestFingerprint(params)
      : null;

    // A. Pre-check idempotency outside transaction
    if (params.idempotency_key) {
      const existingOrderRes = await this.db.query<any>(
        `SELECT id, notes FROM orders WHERE organization_id = $1 AND idempotency_key = $2`,
        [organization_id, params.idempotency_key]
      );
      if (existingOrderRes.rows.length > 0) {
        const orderId = existingOrderRes.rows[0].id;
        const storedNotes = existingOrderRes.rows[0].notes;
        const storedFingerprint = extractFingerprint(storedNotes);

        if (storedFingerprint === currentFingerprint) {
          const fullOrder = await this.orderRepo.findOrderById(orderId, organization_id);
          if (fullOrder) {
            const payment = (await this.orderRepo.findPaymentByOrderId(orderId, organization_id)) || undefined;
            return {
              order: fullOrder.order,
              items: fullOrder.items,
              payment,
            };
          }
        } else {
          throw new Error(
            `IDEMPOTENCY_CONFLICT: An order with idempotency key '${params.idempotency_key}' already exists with different request parameters.`
          );
        }
      }
    }

    try {
      return await this.db.withTransaction(async (tx) => {
        // B. Lock and Validate Session
        const sessionRes = await tx.query<any>(
          `SELECT * FROM pos_sessions WHERE id = $1 FOR UPDATE`,
          [session_id]
        );
        if (sessionRes.rows.length === 0) {
          throw new Error(`SESSION_NOT_FOUND: POS Session '${session_id}' not found.`);
        }
        const session = sessionRes.rows[0];
        if (session.organization_id !== organization_id) {
          throw new Error(`TENANT_ACCESS_DENIED: Access to session is denied.`);
        }
        if (session.status !== 'OPEN') {
          throw new Error(`SESSION_CLOSED: POS Session '${session_id}' is closed. Checkout rejected.`);
        }
        if (session.location_id !== location_id) {
          throw new Error(`LOCATION_MISMATCH: Session location does not match request location.`);
        }

        // C. Reconstruct and validate cart totals on the server
        let totalSubtotalCents = 0n;
        let totalDiscountCents = 0n;
        let totalTaxCents = 0n;
        let totalCostCents = 0n;

        const orderItems: OrderItemRecord[] = [];
        const orderId = `ord_${crypto.randomUUID()}`;

        for (const item of params.cart_items) {
          const variantRes = await tx.query<any>(
            `SELECT pv.id, pv.sku, pv.barcode, pv.name as variant_name, pv.cost_price::text, pv.retail_price::text,
                    p.name as product_name, p.tax_rate::text, p.status
             FROM product_variants pv
             JOIN products p ON pv.product_id = p.id
             WHERE pv.id = $1 AND p.organization_id = $2`,
            [item.variant_id, organization_id]
          );

          if (variantRes.rows.length === 0) {
            throw new Error(`PRODUCT_NOT_FOUND: Product variant '${item.variant_id}' not found.`);
          }

          const variant = variantRes.rows[0];
          if (variant.status !== 'active') {
            throw new Error(`PRODUCT_NOT_FOUND: Variant '${variant.sku}' is discontinued or inactive.`);
          }

          const qtyScaled = parseQtyToScaled(item.quantity);
          const retailPriceCents = parseMoneyToCents(variant.retail_price);
          const costPriceCents = parseMoneyToCents(variant.cost_price);

          // Calculate discount (percentage scaled by 10,000n)
          const discountPctStr = item.discount_percentage || '0.00';
          const discountPctScaled = parseQtyToScaled(discountPctStr);

          // line subtotal before discount
          const rawLineSubtotalScaled = retailPriceCents * qtyScaled;
          const rawLineSubtotalCents = divideRoundHalfUp(rawLineSubtotalScaled, 10000n);

          // discount amount
          const lineDiscountScaled = rawLineSubtotalCents * discountPctScaled;
          const lineDiscountCents = divideRoundHalfUp(lineDiscountScaled, 1000000n);

          // line subtotal after discount
          const lineSubtotalCents = rawLineSubtotalCents - lineDiscountCents;

          // tax
          const taxRateStr = variant.tax_rate || '0.00';
          const taxRateScaled = parseQtyToScaled(taxRateStr);
          const lineTaxScaled = lineSubtotalCents * taxRateScaled;
          const lineTaxCents = divideRoundHalfUp(lineTaxScaled, 1000000n);

          // line total
          const lineTotalCents = lineSubtotalCents + lineTaxCents;

          // line cost
          const lineCostScaled = costPriceCents * qtyScaled;
          const lineCostCents = divideRoundHalfUp(lineCostScaled, 10000n);

          totalSubtotalCents += rawLineSubtotalCents;
          totalDiscountCents += lineDiscountCents;
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
            quantity: formatScaledToQtyString(qtyScaled),
            discount_amount: formatCentsToMoneyString(lineDiscountCents),
            tax_rate: parseExactQuantity(taxRateStr),
            total_amount: formatCentsToMoneyString(lineTotalCents),
          });
        }

        const totalAmountCents = totalSubtotalCents - totalDiscountCents + totalTaxCents;

        // Ensure payment is sufficient for cash checkout
        if (params.payment_method === 'Cash' && paidCents < totalAmountCents) {
          throw new Error(
            `PAYMENT_INVALID: Insufficient cash amount. Amount paid must be at least '${formatCentsToMoneyString(totalAmountCents)}'.`
          );
        }

        const orderNumber = this.generateSecureOrderNumber();

        // Persist the SHA-256 fingerprint in notes
        const notesWithFingerprint = currentFingerprint
          ? `[idempotency_fingerprint:${currentFingerprint}]${params.notes || ''}`
          : params.notes || null;

        const order: OrderRecord & { idempotency_key?: string } = {
          id: orderId,
          organization_id,
          location_id,
          customer_id: params.customer_id || null,
          order_number: orderNumber,
          source: 'POS',
          channel: 'POS Checkout',
          fulfillment_method: 'POS Walk-in',
          subtotal: formatCentsToMoneyString(totalSubtotalCents),
          discount_amount: formatCentsToMoneyString(totalDiscountCents),
          tax_amount: formatCentsToMoneyString(totalTaxCents),
          shipping_fee: '0.00',
          total_amount: formatCentsToMoneyString(totalAmountCents),
          total_cost_amount: formatCentsToMoneyString(totalCostCents),
          payment_status: 'Paid',
          status: 'Completed',
          cashier_name,
          notes: notesWithFingerprint,
          pos_session_id: session_id,
          idempotency_key: params.idempotency_key || null,
        };

        const payment: PaymentRecord = {
          id: `pay_${crypto.randomUUID()}`,
          organization_id,
          order_id: orderId,
          payment_method: params.payment_method,
          amount: formatCentsToMoneyString(totalAmountCents),
          currency: 'SLE',
          status: 'Completed',
          reference: params.idempotency_key || orderNumber,
          provider: 'AbaCha POS',
          transaction_payload: {
            session_id,
            cashier_name,
            amount_paid: params.amount_paid,
            change_due: params.payment_method === 'Cash' ? formatCentsToMoneyString(paidCents - totalAmountCents) : '0.00',
          },
        };

        // D. Save Order, Items, and Payment
        const saved = await this.orderRepo.createOrderWithItems(order, orderItems, payment, tx);

        // E. Deduct inventory through inventory domain (pessimistic locks applied during recordMovement)
        for (const item of orderItems) {
          await this.invRepo.recordMovement(
            {
              organization_id,
              location_id,
              variant_id: item.variant_id,
              movement_type: 'POS_SALE',
              quantity_change: `-${item.quantity}`,
              unit_cost: formatCentsToMoneyString(parseMoneyToCents(item.cost_price)),
              reference_type: 'orders',
              reference_id: orderId,
              performed_by: cashier_name,
              idempotency_key: `${orderId}_${item.variant_id}`,
              allowNegativeStock: false,
            },
            tx
          );
        }

        // F. If cash checkout, increase expected cash in POS session
        if (params.payment_method === 'Cash') {
          const sessionLockRes = await tx.query<any>(
            `SELECT expected_cash FROM pos_sessions WHERE id = $1 FOR UPDATE`,
            [session_id]
          );
          const currentExpectedCents = parseMoneyToCents(sessionLockRes.rows[0].expected_cash, { allowNegative: true });
          const newExpectedCents = currentExpectedCents + totalAmountCents;
          await this.posRepo.updateSessionExpectedCash(session_id, formatCentsToMoneyString(newExpectedCents), tx);
        }

        // G. Audit Log
        await this.auditRepo.recordEvent({
          organization_id,
          actor_name: cashier_name,
          actor_role: 'Cashier',
          action: 'pos.checkout',
          entity_type: 'orders',
          entity_id: orderId,
          location_id,
          metadata: {
            order_number: orderNumber,
            total_amount: formatCentsToMoneyString(totalAmountCents),
            payment_method: params.payment_method,
          },
          severity: 'Info',
        }, tx);

        return saved;
      });
    } catch (err: any) {
      // Catch duplicate submission race and handle replay or conflict
      if (params.idempotency_key && (err?.code === '23505' || err?.message?.includes('uq_orders_org_idempotency') || err?.message?.includes('orders_idempotency_key_key'))) {
        const existingOrderRes = await this.db.query<any>(
          `SELECT id, notes FROM orders WHERE organization_id = $1 AND idempotency_key = $2`,
          [organization_id, params.idempotency_key]
        );
        if (existingOrderRes.rows.length > 0) {
          const orderId = existingOrderRes.rows[0].id;
          const storedNotes = existingOrderRes.rows[0].notes;
          const storedFingerprint = extractFingerprint(storedNotes);

          if (storedFingerprint === currentFingerprint) {
            const fullOrder = await this.orderRepo.findOrderById(orderId, organization_id);
            if (fullOrder) {
              const payment = (await this.orderRepo.findPaymentByOrderId(orderId, organization_id)) || undefined;
              return {
                order: fullOrder.order,
                items: fullOrder.items,
                payment,
              };
            }
          } else {
            throw new Error(
              `IDEMPOTENCY_CONFLICT: An order with idempotency key '${params.idempotency_key}' already exists with different request parameters.`
            );
          }
        }
      }
      throw err;
    }
  }

  /**
   * 5. Server-Authoritative POS Return & Refund Flow (Locks order & session FOR UPDATE)
   */
  async processReturn(params: {
    organization_id: string;
    order_id: string;
    refund_method: string;
    performed_by: string;
    reason: string;
    return_items: { variant_id: string; quantity: string }[];
    idempotency_key?: string;
  }): Promise<{ returnRecord: PosReturnRecord; items: PosReturnItemRecord[] }> {
    const { organization_id, order_id, refund_method, performed_by, reason } = params;

    const currentFingerprint = params.idempotency_key
      ? computeCanonicalReturnFingerprint(params)
      : null;

    // A. Pre-check idempotency outside transaction
    if (params.idempotency_key) {
      const existingReturnRes = await this.db.query<any>(
        `SELECT * FROM pos_returns WHERE organization_id = $1 AND idempotency_key = $2`,
        [organization_id, params.idempotency_key]
      );
      if (existingReturnRes.rows.length > 0) {
        const retRecord = existingReturnRes.rows[0];
        const storedFingerprint = extractFingerprint(retRecord.reason);

        if (storedFingerprint === currentFingerprint) {
          const returnRecord = {
            ...retRecord,
            refund_amount: parseExactMoney(retRecord.refund_amount),
          };
          const returnItems = await this.posRepo.getReturnItems(retRecord.id);
          return {
            returnRecord,
            items: returnItems,
          };
        } else {
          throw new Error(
            `IDEMPOTENCY_CONFLICT: A return with idempotency key '${params.idempotency_key}' already exists with different request parameters.`
          );
        }
      }
    }

    try {
      return await this.db.withTransaction(async (tx) => {
        // B. Lock original order row for update to prevent concurrent return race conditions
        const orderRes = await tx.query<any>(
          `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
          [order_id]
        );
        if (orderRes.rows.length === 0) {
          throw new Error(`SALE_NOT_FOUND: Original sale '${order_id}' was not found.`);
        }
        const order = orderRes.rows[0];
        if (order.organization_id !== organization_id) {
          throw new Error(`TENANT_ACCESS_DENIED: Access to sale is denied.`);
        }

        const fullOrder = await this.orderRepo.findOrderById(order_id, organization_id, tx);
        if (!fullOrder) {
          throw new Error(`SALE_NOT_FOUND: Original sale '${order_id}' was not found.`);
        }

        const { items: originalItems } = fullOrder;

        // C. Load any previous returns for this order to check maximum returnable quantities
        const prevReturns = await this.posRepo.listReturnsByOrderId(order_id, tx);
        const returnedQuantitiesScaled: Record<string, bigint> = {};

        for (const ret of prevReturns) {
          const retItems = await this.posRepo.getReturnItems(ret.id, tx);
          for (const item of retItems) {
            returnedQuantitiesScaled[item.variant_id] = (returnedQuantitiesScaled[item.variant_id] || 0n) + parseQtyToScaled(item.quantity);
          }
        }

        let totalRefundCents = 0n;
        const savedItems: PosReturnItemRecord[] = [];
        const returnId = `ret_${crypto.randomUUID()}`;

        // D. Validate items being returned against original quantities
        for (const item of params.return_items) {
          const originalItem = originalItems.find((oi) => oi.variant_id === item.variant_id);
          if (!originalItem) {
            throw new Error(
              `RETURN_INVALID: Variant '${item.variant_id}' was not part of the original sale.`
            );
          }

          const reqQtyScaled = parseQtyToScaled(item.quantity);
          if (reqQtyScaled <= 0n) {
            throw new Error(`RETURN_INVALID: Return quantity must be greater than zero.`);
          }

          const originalQtyScaled = parseQtyToScaled(originalItem.quantity.toString());
          const alreadyReturnedScaled = returnedQuantitiesScaled[item.variant_id] || 0n;
          const maxReturnableScaled = originalQtyScaled - alreadyReturnedScaled;

          if (reqQtyScaled > maxReturnableScaled) {
            throw new Error(
              `RETURN_INVALID: Cannot return '${formatScaledToQtyString(reqQtyScaled)}' of variant '${originalItem.sku}'. ` +
              `Original quantity: ${formatScaledToQtyString(originalQtyScaled)}, already returned: ${formatScaledToQtyString(alreadyReturnedScaled)}.`
            );
          }

          // Calculate refund amount for this line (pro-rated based on original unit price and discount)
          const lineOriginalUnitCents = parseMoneyToCents(originalItem.unit_price.toString());
          const lineOriginalDiscountCents = parseMoneyToCents(originalItem.discount_amount.toString());

          // total original price and total original discount for this line
          const totalOriginalPriceScaled = lineOriginalUnitCents * originalQtyScaled;
          const totalOriginalDiscountScaled = lineOriginalDiscountCents * 10000n; // since discount_amount is scale 100

          const netLineTotalScaled = totalOriginalPriceScaled - totalOriginalDiscountScaled;

          // pro-rate: netLineTotalScaled * reqQtyScaled / originalQtyScaled
          const lineRefundScaled = divideRoundHalfUp(netLineTotalScaled * reqQtyScaled, originalQtyScaled);
          const itemRefundCents = divideRoundHalfUp(lineRefundScaled, 10000n);

          totalRefundCents += itemRefundCents;

          savedItems.push({
            id: `ri_${crypto.randomUUID()}`,
            return_id: returnId,
            variant_id: item.variant_id,
            quantity: formatScaledToQtyString(reqQtyScaled),
            refund_amount: formatCentsToMoneyString(itemRefundCents),
          });
        }

        const refundAmountStr = formatCentsToMoneyString(totalRefundCents);

        const reasonWithFingerprint = currentFingerprint
          ? `[idempotency_fingerprint:${currentFingerprint}]${reason || ''}`
          : reason || '';

        const returnRecord: PosReturnRecord = {
          id: returnId,
          organization_id,
          order_id,
          refund_amount: refundAmountStr,
          refund_method,
          performed_by,
          reason: reasonWithFingerprint,
          idempotency_key: params.idempotency_key || null,
        };

        // E. Save return records
        const saved = await this.posRepo.createReturn(returnRecord, savedItems, tx);

        // F. Update order state if fully refunded
        let totalReturnedQtyScaled = 0n;
        let totalOriginalQtyScaled = 0n;

        for (const oi of originalItems) {
          totalOriginalQtyScaled += parseQtyToScaled(oi.quantity.toString());
          const alreadyRet = returnedQuantitiesScaled[oi.variant_id] || 0n;
          const reqRet = parseQtyToScaled(params.return_items.find((i) => i.variant_id === oi.variant_id)?.quantity || '0.0000');
          totalReturnedQtyScaled += (alreadyRet + reqRet);
        }

        const isFullyRefunded = totalReturnedQtyScaled >= totalOriginalQtyScaled;
        const paymentStatus = isFullyRefunded ? 'Refunded' : 'Partially Refunded';
        const orderStatus = isFullyRefunded ? 'Refunded' : order.status;

        await tx.query(
          `UPDATE orders SET payment_status = $1, status = $2, updated_at = NOW() WHERE id = $3`,
          [paymentStatus, orderStatus, order_id]
        );

        // G. Restock inventory through inventory domain (recordMovement with SALE_RETURN)
        for (const ri of savedItems) {
          const origItem = originalItems.find((oi) => oi.variant_id === ri.variant_id)!;
          await this.invRepo.recordMovement(
            {
              organization_id,
              location_id: order.location_id,
              variant_id: ri.variant_id,
              movement_type: 'SALE_RETURN',
              quantity_change: ri.quantity,
              unit_cost: formatCentsToMoneyString(parseMoneyToCents(origItem.cost_price)),
              reference_type: 'pos_returns',
              reference_id: returnId,
              performed_by,
              idempotency_key: `${returnId}_${ri.variant_id}`,
              allowNegativeStock: true,
            },
            tx
          );
        }

        // H. If cash refund and associated with an active OPEN POS Session, subtract from session expected cash
        if (refund_method === 'Cash' && order.pos_session_id) {
          const sessionRes = await tx.query<any>(
            `SELECT expected_cash, status FROM pos_sessions WHERE id = $1 FOR UPDATE`,
            [order.pos_session_id]
          );
          if (sessionRes.rows.length > 0 && sessionRes.rows[0].status === 'OPEN') {
            const currentExpectedCents = parseMoneyToCents(sessionRes.rows[0].expected_cash, { allowNegative: true });
            const newExpectedCents = currentExpectedCents - totalRefundCents;
            await this.posRepo.updateSessionExpectedCash(order.pos_session_id, formatCentsToMoneyString(newExpectedCents), tx);
          }
        }

        // I. Record Audit Log
        await this.auditRepo.recordEvent({
          organization_id,
          actor_name: performed_by,
          actor_role: 'Store Manager',
          action: 'pos.return',
          entity_type: 'pos_returns',
          entity_id: returnId,
          location_id: order.location_id,
          metadata: {
            order_id,
            order_number: order.order_number,
            refund_amount: refundAmountStr,
            refund_method,
          },
          severity: 'Info',
        }, tx);

        return saved;
      });
    } catch (err: any) {
      // Catch unique violation race for returns and handle replay or conflict
      if (params.idempotency_key && (err?.code === '23505' || err?.message?.includes('uq_pos_returns_org_idempotency'))) {
        const existingReturnRes = await this.db.query<any>(
          `SELECT * FROM pos_returns WHERE organization_id = $1 AND idempotency_key = $2`,
          [organization_id, params.idempotency_key]
        );
        if (existingReturnRes.rows.length > 0) {
          const retRecord = existingReturnRes.rows[0];
          const storedFingerprint = extractFingerprint(retRecord.reason);

          if (storedFingerprint === currentFingerprint) {
            const returnRecord = {
              ...retRecord,
              refund_amount: parseExactMoney(retRecord.refund_amount),
            };
            const returnItems = await this.posRepo.getReturnItems(retRecord.id);
            return {
              returnRecord,
              items: returnItems,
            };
          } else {
            throw new Error(
              `IDEMPOTENCY_CONFLICT: A return with idempotency key '${params.idempotency_key}' already exists with different request parameters.`
            );
          }
        }
      }
      throw err;
    }
  }
}
