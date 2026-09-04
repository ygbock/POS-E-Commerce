import { Order } from '../types';
import { ReceiptTemplateConfig } from '../types/receipt';

export function buildQrPayload(order: Order, config: ReceiptTemplateConfig, baseUrl: string = window.location.origin): { url: string; displayLabel: string } {
  const orderNum = order.orderNumber;
  const hash = Math.abs(order.id.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)).toString(16).toUpperCase().substring(0, 8);

  switch (config.qrTargetType) {
    case 'returns-portal':
      return {
        url: `${baseUrl}/returns?order=${orderNum}&verify=${hash}`,
        displayLabel: 'SCAN FOR SELF-SERVICE RETURNS & EXCHANGES',
      };
    case 'feedback-survey':
      return {
        url: `${baseUrl}/survey?store=${encodeURIComponent(order.locationName)}&order=${orderNum}`,
        displayLabel: 'SCAN TO RATE YOUR SHOPPING EXPERIENCE & WIN $50',
      };
    case 'tax-verification':
      return {
        url: `TAX-VERIFY|${orderNum}|AMT:${order.totalAmount}|TAX:${order.taxAmount}|HASH:${hash}|DATE:${order.createdAt}`,
        displayLabel: 'OFFICIAL TAX & FISCAL INVOICE HASH VERIFICATION',
      };
    case 'custom-url':
      return {
        url: config.customQrUrl || `${baseUrl}/receipt/${orderNum}`,
        displayLabel: config.qrLabelText || 'SCAN QR CODE',
      };
    case 'e-receipt':
    default:
      return {
        url: `${baseUrl}/receipt/${orderNum}?token=${hash}`,
        displayLabel: 'SCAN TO VIEW DIGITAL RECEIPT & WARRANTY SLIP',
      };
  }
}

/**
 * Generates human-readable ESC/POS command stream representation
 * suitable for POS engineers and hardware integration debugging.
 */
export function generateEscPosStream(order: Order, config: ReceiptTemplateConfig): string {
  const lines: string[] = [];

  // ESC/POS Command Constants representation
  lines.push('[ESC @] ; Initialize printer');
  lines.push('[ESC a 1] ; Align Center');
  lines.push(`[ESC ! 32] ; Double Height & Width Text`);
  lines.push(config.storeName);
  lines.push('[ESC ! 0] ; Normal Text');
  lines.push(order.locationName);
  lines.push(`Tax ID: ${config.taxRegistrationNumber}`);
  lines.push('------------------------------------------------');

  lines.push('[ESC a 0] ; Align Left');
  lines.push(`Receipt #: ${order.orderNumber}`);
  lines.push(`Date: ${new Date(order.createdAt).toLocaleString()}`);
  if (config.showCashierName) lines.push(`Cashier: ${order.cashierName || 'Terminal 1'}`);
  if (config.showCustomerDetails && order.customerName) lines.push(`Customer: ${order.customerName}`);
  lines.push('------------------------------------------------');

  lines.push('QTY  DESCRIPTION              PRICE       TOTAL');
  lines.push('------------------------------------------------');

  order.items.forEach((item) => {
    const qtyStr = item.quantity.toString().padEnd(4);
    const nameStr = item.productName.substring(0, 20).padEnd(22);
    const priceStr = `$${item.price.toFixed(2)}`.padStart(8);
    const totalStr = `$${(item.price * item.quantity).toFixed(2)}`.padStart(8);
    lines.push(`${qtyStr}${nameStr}${priceStr}${totalStr}`);
    if (config.showItemSkus) {
      lines.push(`     SKU: ${item.sku}`);
    }
  });

  lines.push('------------------------------------------------');
  lines.push(`Subtotal:                        $${order.subtotal.toFixed(2)}`);
  if (order.discountAmount > 0) {
    lines.push(`Discount:                       -$${order.discountAmount.toFixed(2)}`);
  }
  lines.push(`Tax:                             $${order.taxAmount.toFixed(2)}`);
  lines.push('[ESC ! 16] ; Bold text');
  lines.push(`TOTAL:                           $${order.totalAmount.toFixed(2)}`);
  lines.push('[ESC ! 0] ; Normal text');
  lines.push('------------------------------------------------');

  lines.push('[ESC a 1] ; Align Center');
  const qr = buildQrPayload(order, config);
  lines.push(`[GS ( k 4 180 49 67 3] ; Set QR Code Module Size`);
  lines.push(`[GS ( k 3 0 49 81 48] ; Print QR Code`);
  lines.push(`[QR DATA]: ${qr.url}`);
  lines.push(qr.displayLabel);
  lines.push('');
  lines.push(config.footerNote);
  lines.push(config.returnPolicyText);
  lines.push('------------------------------------------------');
  lines.push('[GS V 66 0] ; Full Cut Paper');

  return lines.join('\n');
}
