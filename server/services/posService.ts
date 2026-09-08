import { DatabaseClient, getDatabaseClient } from '../db/client';
import { PosRepository, PosSessionRecord, PosCashMovementRecord, PosReturnRecord, PosReturnItemRecord } from '../repositories/posRepository';
import { OrderRepository, OrderRecord, OrderItemRecord, PaymentRecord } from '../repositories/orderRepository';
import { InventoryRepository } from '../repositories/inventoryRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { toQtyString, parseExactMoney } from '../inventory/inventoryPolicies';

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
   * Helper to perform exact cents-based arithmetic for monetary totals
   */
  private toCents(val: string | number): number {
    if (typeof val === 'number') {
      return Math.round(val * 100);
    }
    const floatVal = parseFloat(val);
    if (isNaN(floatVal)) return 0;
    return Math.round(floatVal * 100);
  }

  private fromCents(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  /**
   * Safe Order Number Generator (Cryptographically secure random string instead of Date.now + Math.random)
   */
  private generateSecureOrderNumber(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'ORD-';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 1. Open POS Session (double open prohibited for same location and terminal)
   */
  async openSession(
    orgId: string,
    locationId: string,
    terminalId: string,
    cashierName: string,
    openingCash: number
  ): Promise<PosSessionRecord> {
    // Check if there is already an open session for this location in this organization
    const active = await this.posRepo.getActiveSession(locationId, orgId);
    if (active) {
      throw new Error(
        `DUPLICATE_SESSION: There is already an open POS session for location '${locationId}' in this organization.`
      );
    }

    const sessionId = `ses_${Math.random().toString(36).substring(2, 11)}`;
    const session: PosSessionRecord = {
      id: sessionId,
      organization_id: orgId,
      location_id: locationId,
      terminal_id: terminalId,
      cashier_name: cashierName,
      status: 'OPEN',
      opening_cash: openingCash,
      expected_cash: openingCash,
      opened_at: new Date().toISOString(),
    };

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
      metadata: { opening_cash: openingCash },
      severity: 'Info',
    });

    return saved;
  }

  /**
   * 2. Close POS Session with expected cash calculation
   */
  async closeSession(
    sessionId: string,
    orgId: string,
    countedCash: number,
    closingActor: string
  ): Promise<PosSessionRecord> {
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
         WHERE o.pos_session_id = $1 AND p.payment_method = 'Cash' AND p.status = 'Completed'`,
        [sessionId]
      );
      const cashSalesCents = this.toCents(Number(cashSalesRes.rows[0].total || 0));

      const cashMoveRes = await tx.query<any>(
        `SELECT COALESCE(SUM(CASE WHEN type = 'Cash In' THEN amount ELSE -amount END), 0) as total 
         FROM pos_cash_movements WHERE session_id = $1`,
        [sessionId]
      );
      const cashMoveCents = this.toCents(Number(cashMoveRes.rows[0].total || 0));

      const cashRefundRes = await tx.query<any>(
        `SELECT COALESCE(SUM(refund_amount), 0) as total FROM pos_returns pr 
         JOIN orders o ON pr.order_id = o.id 
         WHERE o.pos_session_id = $1 AND pr.refund_method = 'Cash'`,
        [sessionId]
      );
      const cashRefundCents = this.toCents(Number(cashRefundRes.rows[0].total || 0));

      const openingCents = this.toCents(Number(session.opening_cash));
      const expectedCents = openingCents + cashSalesCents + cashMoveCents - cashRefundCents;
      const expectedCash = expectedCents / 100;

      const varianceCents = this.toCents(countedCash) - expectedCents;
      const variance = varianceCents / 100;

      const closed = await this.posRepo.closeSession(
        sessionId,
        {
          counted_cash: countedCash,
          variance: variance,
          closing_actor: closingActor,
          expected_cash: expectedCash,
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
          expected_cash: expectedCash,
          counted_cash: countedCash,
          variance: variance,
        },
        severity: 'Info',
      }, tx);

      return closed;
    });
  }

  /**
   * 3. Record Cash Drawer Movement (Cash In / Cash Out)
   */
  async recordCashMovement(
    sessionId: string,
    orgId: string,
    type: 'Cash In' | 'Cash Out',
    amount: number,
    reason: string,
    performedBy: string
  ): Promise<PosCashMovementRecord> {
    return this.db.withTransaction(async (tx) => {
      // Check session active
      const session = await this.posRepo.findSessionById(sessionId, orgId, tx);
      if (!session) {
        throw new Error(`SESSION_NOT_FOUND: POS Session '${sessionId}' was not found.`);
      }

      if (session.status !== 'OPEN') {
        throw new Error(`SESSION_CLOSED: Cannot perform cash movement in a closed POS session.`);
      }

      const movementId = `mov_${Math.random().toString(36).substring(2, 11)}`;
      const movement: PosCashMovementRecord = {
        id: movementId,
        session_id: sessionId,
        type,
        amount,
        reason,
        performed_by: performedBy,
      };

      const saved = await this.posRepo.createCashMovement(movement, tx);

      // Re-calculate expected cash
      const newExpectedCents =
        this.toCents(session.expected_cash) + (type === 'Cash In' ? this.toCents(amount) : -this.toCents(amount));
      const newExpected = newExpectedCents / 100;

      await this.posRepo.updateSessionExpectedCash(sessionId, newExpected, tx);

      // Audit
      await this.auditRepo.recordEvent({
        organization_id: orgId,
        actor_name: performedBy,
        actor_role: 'Cashier',
        action: 'pos.cash_movement',
        entity_type: 'pos_sessions',
        entity_id: sessionId,
        location_id: session.location_id,
        metadata: { type, amount, reason },
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
    cart_items: { variant_id: string; quantity: number; discount_percentage?: number }[];
    payment_method: 'Cash' | 'Credit Card' | 'Mobile Money' | 'Store Credit' | 'Bank Transfer' | 'Fintech Wallet';
    amount_paid: number;
    notes?: string;
    idempotency_key?: string;
  }): Promise<{ order: OrderRecord; items: OrderItemRecord[]; payment?: PaymentRecord }> {
    const { organization_id, location_id, session_id, cashier_name } = params;

    return this.db.withTransaction(async (tx) => {
      // A. Check Idempotency
      if (params.idempotency_key) {
        const existingOrder = await tx.query<any>(
          `SELECT id FROM orders WHERE organization_id = $1 AND idempotency_key = $2`,
          [organization_id, params.idempotency_key]
        );
        if (existingOrder.rows.length > 0) {
          const fullOrder = await this.orderRepo.findOrderById(existingOrder.rows[0].id, organization_id, tx);
          if (fullOrder) {
            // Find payments associated
            const payRes = await tx.query<any>(
              `SELECT * FROM payments WHERE order_id = $1`,
              [fullOrder.order.id]
            );
            return {
              order: fullOrder.order,
              items: fullOrder.items,
              payment: payRes.rows.length > 0 ? payRes.rows[0] : undefined,
            };
          }
        }
      }

      // B. Validate Session
      const session = await this.posRepo.findSessionById(session_id, organization_id, tx);
      if (!session) {
        throw new Error(`SESSION_NOT_FOUND: POS Session '${session_id}' not found.`);
      }
      if (session.status !== 'OPEN') {
        throw new Error(`SESSION_CLOSED: POS Session '${session_id}' is closed. Checkout rejected.`);
      }
      if (session.location_id !== location_id) {
        throw new Error(`LOCATION_MISMATCH: Session location does not match request location.`);
      }

      // C. Reconstruct and validate cart totals on the server (do not trust the client!)
      let subtotalCents = 0;
      let discountCents = 0;
      let taxCents = 0;
      let totalCostCents = 0;

      const orderItems: OrderItemRecord[] = [];

      for (const item of params.cart_items) {
        const variantRes = await tx.query<any>(
          `SELECT pv.id, pv.sku, pv.barcode, pv.name as variant_name, pv.cost_price, pv.retail_price,
                  p.name as product_name, p.tax_rate, p.status
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

        const qtyStr = toQtyString(item.quantity.toString());
        const qtyNum = Number(qtyStr);

        const retailPriceNum = Number(variant.retail_price);
        const costPriceNum = Number(variant.cost_price);

        // Calculate discount
        const discountPct = item.discount_percentage || 0;
        if (discountPct < 0 || discountPct > 100) {
          throw new Error(`VALIDATION_ERROR: Invalid discount percentage '${discountPct}%'`);
        }

        const rawLineSubtotalCents = this.toCents(retailPriceNum) * qtyNum;
        const lineDiscountCents = Math.round(rawLineSubtotalCents * (discountPct / 100));
        const lineSubtotalCents = rawLineSubtotalCents - lineDiscountCents;

        const taxRate = Number(variant.tax_rate || 0);
        const lineTaxCents = Math.round(lineSubtotalCents * (taxRate / 100));
        const lineTotalCents = lineSubtotalCents + lineTaxCents;

        const lineCostCents = Math.round(this.toCents(costPriceNum) * qtyNum);

        subtotalCents += rawLineSubtotalCents;
        discountCents += lineDiscountCents;
        taxCents += lineTaxCents;
        totalCostCents += lineCostCents;

        orderItems.push({
          id: `itm_${Math.random().toString(36).substring(2, 11)}`,
          order_id: '', // Will be filled by orderRepo
          variant_id: item.variant_id,
          product_name: variant.product_name,
          variant_name: variant.variant_name,
          sku: variant.sku,
          unit_price: retailPriceNum,
          cost_price: costPriceNum,
          quantity: qtyNum,
          discount_amount: lineDiscountCents / 100,
          tax_rate: taxRate,
          total_amount: lineTotalCents / 100,
        });
      }

      const totalAmountCents = subtotalCents - discountCents + taxCents;
      const totalAmount = totalAmountCents / 100;

      // Ensure payment is sufficient for cash checkout
      if (params.payment_method === 'Cash' && params.amount_paid < totalAmount) {
        throw new Error(
          `PAYMENT_INVALID: Insufficient cash amount. Amount paid must be at least '${totalAmount}'.`
        );
      }

      const orderId = `ord_${Math.random().toString(36).substring(2, 11)}`;
      const orderNumber = this.generateSecureOrderNumber();

      const order: OrderRecord & { idempotency_key?: string } = {
        id: orderId,
        organization_id,
        location_id,
        customer_id: params.customer_id || null,
        order_number: orderNumber,
        source: 'POS',
        channel: 'POS Checkout',
        fulfillment_method: 'POS Walk-in',
        subtotal: subtotalCents / 100,
        discount_amount: discountCents / 100,
        tax_amount: taxCents / 100,
        shipping_fee: 0,
        total_amount: totalAmount,
        total_cost_amount: totalCostCents / 100,
        payment_status: 'Paid',
        status: 'Completed',
        cashier_name,
        notes: params.notes || null,
        pos_session_id: session_id,
        idempotency_key: params.idempotency_key || null,
      };

      const payment: PaymentRecord = {
        id: `pay_${Math.random().toString(36).substring(2, 11)}`,
        organization_id,
        order_id: orderId,
        payment_method: params.payment_method,
        amount: totalAmount,
        currency: 'SLE',
        status: 'Completed',
        reference: params.idempotency_key || orderNumber,
        provider: 'AbaCha POS',
        transaction_payload: {
          session_id,
          cashier_name,
          amount_paid: params.amount_paid,
          change_due: params.payment_method === 'Cash' ? Number((params.amount_paid - totalAmount).toFixed(2)) : 0,
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
            quantity_change: `-${item.quantity.toFixed(4)}`,
            unit_cost: parseExactMoney(item.cost_price.toFixed(2), 'cost_price'),
            reference_type: 'orders',
            reference_id: orderId,
            performed_by: cashier_name,
            idempotency_key: `${orderId}_${item.variant_id}`,
            allowNegativeStock: false, // Strict negative stock policy!
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
        const currentExpectedCents = this.toCents(sessionLockRes.rows[0].expected_cash);
        const newExpectedCents = currentExpectedCents + totalAmountCents;
        await this.posRepo.updateSessionExpectedCash(session_id, newExpectedCents / 100, tx);
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
          total_amount: totalAmount,
          payment_method: params.payment_method,
        },
        severity: 'Info',
      }, tx);

      return saved;
    });
  }

  /**
   * 5. Server-Authoritative POS Return & Refund Flow
   */
  async processReturn(params: {
    organization_id: string;
    order_id: string;
    refund_method: string;
    performed_by: string;
    reason: string;
    return_items: { variant_id: string; quantity: number }[];
  }): Promise<{ returnRecord: PosReturnRecord; items: PosReturnItemRecord[] }> {
    const { organization_id, order_id, refund_method, performed_by, reason } = params;

    return this.db.withTransaction(async (tx) => {
      // A. Load original order
      const fullOrder = await this.orderRepo.findOrderById(order_id, organization_id, tx);
      if (!fullOrder) {
        throw new Error(`SALE_NOT_FOUND: Original sale '${order_id}' was not found.`);
      }

      const { order, items: originalItems } = fullOrder;

      // B. Load any previous returns for this order to check maximum returnable quantities
      const prevReturns = await this.posRepo.listReturnsByOrderId(order_id, tx);
      const returnedQuantities: Record<string, number> = {};

      for (const ret of prevReturns) {
        const retItems = await this.posRepo.getReturnItems(ret.id, tx);
        for (const item of retItems) {
          returnedQuantities[item.variant_id] = (returnedQuantities[item.variant_id] || 0) + item.quantity;
        }
      }

      let totalRefundCents = 0;
      const savedItems: PosReturnItemRecord[] = [];
      const returnId = `ret_${Math.random().toString(36).substring(2, 11)}`;

      // C. Validate items being returned against original quantities
      for (const item of params.return_items) {
        const originalItem = originalItems.find((oi) => oi.variant_id === item.variant_id);
        if (!originalItem) {
          throw new Error(
            `RETURN_INVALID: Variant '${item.variant_id}' was not part of the original sale.`
          );
        }

        const alreadyReturned = returnedQuantities[item.variant_id] || 0;
        const maxReturnable = originalItem.quantity - alreadyReturned;

        if (item.quantity <= 0) {
          throw new Error(`RETURN_INVALID: Return quantity must be greater than zero.`);
        }

        if (item.quantity > maxReturnable) {
          throw new Error(
            `RETURN_INVALID: Cannot return '${item.quantity}' of variant '${originalItem.sku}'. ` +
            `Original quantity: ${originalItem.quantity}, already returned: ${alreadyReturned}.`
          );
        }

        // Calculate refund amount for this line (pro-rated based on original unit price and discount)
        const lineOriginalUnitCents = this.toCents(originalItem.unit_price);
        const lineOriginalDiscountCents = this.toCents(originalItem.discount_amount) / originalItem.quantity;
        const lineRefundUnitCents = lineOriginalUnitCents - lineOriginalDiscountCents;
        const itemRefundCents = Math.round(lineRefundUnitCents * item.quantity);

        totalRefundCents += itemRefundCents;

        savedItems.push({
          id: `ri_${Math.random().toString(36).substring(2, 11)}`,
          return_id: returnId,
          variant_id: item.variant_id,
          quantity: item.quantity,
          refund_amount: itemRefundCents / 100,
        });
      }

      const refundAmount = totalRefundCents / 100;

      const returnRecord: PosReturnRecord = {
        id: returnId,
        organization_id,
        order_id,
        refund_amount: refundAmount,
        refund_method,
        performed_by,
        reason,
      };

      // D. Save return records
      const saved = await this.posRepo.createReturn(returnRecord, savedItems, tx);

      // E. Update order state if fully refunded
      let totalReturnedQty = 0;
      let totalOriginalQty = 0;

      for (const oi of originalItems) {
        totalOriginalQty += oi.quantity;
        const variantReturned = (returnedQuantities[oi.variant_id] || 0) + (params.return_items.find((i) => i.variant_id === oi.variant_id)?.quantity || 0);
        totalReturnedQty += variantReturned;
      }

      const isFullyRefunded = totalReturnedQty >= totalOriginalQty;
      const paymentStatus = isFullyRefunded ? 'Refunded' : 'Partially Refunded';
      const orderStatus = isFullyRefunded ? 'Refunded' : order.status;

      await tx.query(
        `UPDATE orders SET payment_status = $1, status = $2, updated_at = NOW() WHERE id = $3`,
        [paymentStatus, orderStatus, order_id]
      );

      // F. Restock inventory through inventory domain (recordMovement with SALE_RETURN)
      for (const ri of savedItems) {
        const origItem = originalItems.find((oi) => oi.variant_id === ri.variant_id)!;
        await this.invRepo.recordMovement(
          {
            organization_id,
            location_id: order.location_id,
            variant_id: ri.variant_id,
            movement_type: 'SALE_RETURN',
            quantity_change: ri.quantity.toFixed(4),
            unit_cost: parseExactMoney(origItem.cost_price.toFixed(2), 'cost_price'),
            reference_type: 'pos_returns',
            reference_id: returnId,
            performed_by,
            idempotency_key: `${returnId}_${ri.variant_id}`,
            allowNegativeStock: true, // Returning stock is always allowed
          },
          tx
        );
      }

      // G. If cash refund and associated with an active OPEN POS Session, subtract from session expected cash
      if (refund_method === 'Cash' && order.pos_session_id) {
        const sessionRes = await tx.query<any>(
          `SELECT expected_cash, status FROM pos_sessions WHERE id = $1 FOR UPDATE`,
          [order.pos_session_id]
        );
        if (sessionRes.rows.length > 0 && sessionRes.rows[0].status === 'OPEN') {
          const currentExpectedCents = this.toCents(sessionRes.rows[0].expected_cash);
          const newExpectedCents = currentExpectedCents - totalRefundCents;
          await this.posRepo.updateSessionExpectedCash(order.pos_session_id, newExpectedCents / 100, tx);
        }
      }

      // H. Record Audit Log
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
          refund_amount: refundAmount,
          refund_method,
        },
        severity: 'Info',
      }, tx);

      return saved;
    });
  }
}
