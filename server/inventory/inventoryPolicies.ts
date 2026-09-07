import { randomUUID } from 'node:crypto';
import { TransferStatus } from './inventoryTypes';

export type Quantity = string;

export const VALID_TRANSFER_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  DRAFT: ['REQUESTED', 'CANCELLED'],
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['IN_TRANSIT', 'RECEIVED'],
  IN_TRANSIT: ['RECEIVED'],
  RECEIVED: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  VARIANCE: ['COMPLETED'],
};

/**
 * Validates that a transfer status transition adheres strictly to the canonical state machine.
 */
export function validateTransferTransition(
  currentStatus: TransferStatus,
  targetStatus: TransferStatus
): void {
  const allowed = VALID_TRANSFER_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    throw new Error(
      `INVALID_TRANSFER_STATE: Cannot transition transfer from '${currentStatus}' to '${targetStatus}'. Allowed transitions: ${
        allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'
      }.`
    );
  }
}

/**
 * Enforces:
 * - Scaled integer arithmetic with a fixed scale of 10,000 (4 decimal places: NUMERIC(14, 4))
 * - Exact string parsing to BigInt without intermediate IEEE-754 floating-point drift
 * - Strict decimal representation at persistence and domain boundaries (type Quantity = string e.g. "12.5000")
 * - Ledger integrity invariant: previous_balance + quantity_change = new_balance
 * - Availability invariant: available = on_hand - reserved - damaged - expired
 * - Non-negative stock constraints
 * - Exact Weighted Average Cost (WAC) calculations with explicit round-half-up policy
 */

export const QTY_SCALE = 10000n;
export const MONEY_SCALE = 100n;
export const INTERMEDIATE_COST_SCALE = 10000n;

/**
 * Validates and normalizes any quantity input into an exact 4-decimal Quantity string.
 * Rejects NaN, Infinity, non-numeric strings, and precision exceeding 4 decimal places.
 */
export function parseExactQuantity(
  value: unknown,
  fieldName: string = 'quantity',
  options?: { allowNegative?: boolean; maxDecimals?: number }
): Quantity {
  if (value === null || value === undefined) {
    throw new Error(`INVALID_QUANTITY: '${fieldName}' is required and cannot be null or undefined.`);
  }
  if (typeof value === 'boolean' || typeof value === 'object') {
    throw new Error(`INVALID_QUANTITY: '${fieldName}' must be a valid numeric quantity string or number.`);
  }

  let str: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`INVALID_QUANTITY: '${fieldName}' must be a finite number, received '${value}'.`);
    }
    str = value.toString();
  } else if (typeof value === 'bigint') {
    str = value.toString();
  } else {
    str = String(value).trim();
  }

  if (!str) {
    throw new Error(`INVALID_QUANTITY: '${fieldName}' cannot be empty.`);
  }

  // Regex check for standard decimal format (optional leading minus, digits, optional decimal dot)
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`INVALID_QUANTITY: '${fieldName}' has invalid format '${value}'.`);
  }

  const isNegative = str.startsWith('-');
  if (isNegative && !options?.allowNegative) {
    throw new Error(`INVALID_QUANTITY: '${fieldName}' cannot be negative, received '${value}'.`);
  }

  const clean = isNegative ? str.slice(1) : str;
  const parts = clean.split('.');
  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';

  const maxDecimals = options?.maxDecimals !== undefined ? options.maxDecimals : 4;
  if (fracPart.length > maxDecimals) {
    throw new Error(
      `INVALID_QUANTITY: '${fieldName}' precision exceeds maximum supported ${maxDecimals} decimal places: '${value}'.`
    );
  }

  // Pad fractional part to exactly 4 digits
  while (fracPart.length < 4) {
    fracPart += '0';
  }

  return `${isNegative ? '-' : ''}${BigInt(wholePart).toString()}.${fracPart}`;
}

/**
 * Parses any quantity into a BigInt scaled by 10,000 (4 decimal places).
 * Avoids IEEE-754 floating-point inaccuracies.
 */
export function parseQtyToScaled(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`INVALID_QUANTITY: Number must be finite, received '${value}'.`);
    }
    const rounded = Math.round(value * 10000);
    return BigInt(rounded);
  }
  const qtyStr = parseExactQuantity(value, 'quantity', { allowNegative: true });
  const isNegative = qtyStr.startsWith('-');
  const clean = isNegative ? qtyStr.slice(1) : qtyStr;
  const parts = clean.split('.');
  const whole = BigInt(parts[0]);
  const frac = BigInt(parts[1]);
  const scaled = whole * QTY_SCALE + frac;
  return isNegative ? -scaled : scaled;
}

/**
 * Formats a scaled BigInt back to a strict 4-decimal-place Quantity string (e.g. "12.5000").
 */
export function formatScaledToQtyString(scaled: bigint): Quantity {
  const isNegative = scaled < 0n;
  const abs = isNegative ? -scaled : scaled;
  const whole = abs / QTY_SCALE;
  const frac = abs % QTY_SCALE;
  const fracStr = frac.toString().padStart(4, '0');
  return `${isNegative ? '-' : ''}${whole}.${fracStr}`;
}

/**
 * Formats a scaled BigInt to a JavaScript number.
 */
export function formatScaledToNumber(scaled: bigint): number {
  return Number(formatScaledToQtyString(scaled));
}

/**
 * Exact quantity addition returning a fixed 4-decimal Quantity string.
 */
export function addQtyExact(a: unknown, b: unknown): Quantity {
  const sum = parseQtyToScaled(a) + parseQtyToScaled(b);
  return formatScaledToQtyString(sum);
}

/**
 * Exact quantity subtraction returning a fixed 4-decimal Quantity string.
 */
export function subQtyExact(a: unknown, b: unknown): Quantity {
  const diff = parseQtyToScaled(a) - parseQtyToScaled(b);
  return formatScaledToQtyString(diff);
}

/**
 * Backward-compatible number quantity addition.
 */
export function addQty(a: unknown, b: unknown): number {
  return formatScaledToNumber(parseQtyToScaled(a) + parseQtyToScaled(b));
}

/**
 * Backward-compatible number quantity subtraction.
 */
export function subQty(a: unknown, b: unknown): number {
  return formatScaledToNumber(parseQtyToScaled(a) - parseQtyToScaled(b));
}

/**
 * Formats any quantity to a strict 4-decimal-place Quantity string.
 */
export function toQtyString(value: unknown): Quantity {
  return formatScaledToQtyString(parseQtyToScaled(value));
}

/**
 * Formats any quantity to a rounded number.
 */
export function roundQty(value: unknown): number {
  return formatScaledToNumber(parseQtyToScaled(value));
}

/**
 * Normalizes monetary amounts into exact 2-decimal string representation.
 */
export function parseExactMoney(value: unknown, fieldName: string = 'unit_cost'): string {
  if (value === null || value === undefined) {
    return '0.00';
  }
  let str: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`INVALID_MONEY: '${fieldName}' must be a finite number.`);
    }
    str = value.toFixed(2);
  } else {
    str = String(value).trim();
  }
  if (!str || !/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`INVALID_MONEY: '${fieldName}' has invalid format '${value}'.`);
  }
  const parts = str.split('.');
  const whole = parts[0];
  let frac = (parts[1] || '').slice(0, 2);
  while (frac.length < 2) frac += '0';
  return `${whole}.${frac}`;
}

/**
 * Rounds monetary amounts to 2 decimal places using symmetric round-half-up BigInt arithmetic.
 */
export function roundMoney(amount: number | string): number {
  return Number(roundMoneyExact(amount));
}

export function roundMoneyExact(amount: number | string): string {
  if (typeof amount === 'number' && !Number.isFinite(amount)) return '0.00';
  const str = String(amount).trim();
  if (!str || !/^-?\d+(\.\d+)?$/.test(str)) return '0.00';
  const isNegative = str.startsWith('-');
  const clean = isNegative ? str.slice(1) : str;
  const parts = clean.split('.');
  const whole = BigInt(parts[0] || '0');
  let frac = parts[1] || '';
  while (frac.length < 4) frac += '0';
  const fracBig = BigInt(frac.slice(0, 4));
  // fracBig is in 1/10000. Divisor to get cents (1/100) is 100n.
  // Half-up rounding: add 50n then divide by 100n
  const cents = (fracBig + 50n) / 100n;
  const totalCents = whole * 100n + cents;
  const resWhole = totalCents / 100n;
  const resCents = (totalCents % 100n).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${resWhole}.${resCents}`;
}

export function toMoneyString(amount: unknown): string {
  return roundMoneyExact(amount as any);
}

/**
 * Computes available stock as an exact 4-decimal Quantity string:
 * available = on_hand - reserved - damaged - expired
 */
export function calculateAvailableExact(
  onHand: unknown,
  reserved: unknown = '0.0000',
  damaged: unknown = '0.0000',
  expired: unknown = '0.0000'
): Quantity {
  const onHandScaled = parseQtyToScaled(onHand);
  const reservedScaled = parseQtyToScaled(reserved);
  const damagedScaled = parseQtyToScaled(damaged);
  const expiredScaled = parseQtyToScaled(expired);
  const availScaled = onHandScaled - (reservedScaled + damagedScaled + expiredScaled);
  return formatScaledToQtyString(availScaled);
}

export function calculateAvailable(
  onHand: unknown,
  reserved: unknown = 0,
  damaged: unknown = 0,
  expired: unknown = 0
): number {
  return formatScaledToNumber(parseQtyToScaled(calculateAvailableExact(onHand, reserved, damaged, expired)));
}

/**
 * Enforces ledger consistency invariant using scaled BigInts:
 * previous_balance + quantity_change === new_balance
 */
export function assertLedgerInvariant(
  previousBalance: unknown,
  quantityChange: unknown,
  newBalance: unknown
): void {
  const prev = parseQtyToScaled(previousBalance);
  const delta = parseQtyToScaled(quantityChange);
  const next = parseQtyToScaled(newBalance);
  const expected = prev + delta;
  if (expected !== next) {
    throw new Error(
      `LEDGER_CORRUPTION_DETECTED: Ledger balance invariant violated. ` +
      `Previous (${formatScaledToQtyString(prev)}) + Change (${formatScaledToQtyString(delta)}) ` +
      `= Expected (${formatScaledToQtyString(expected)}), got New (${formatScaledToQtyString(next)}).`
    );
  }
}

/**
 * Parses cost to scaled BigInt with 4 decimal places (scale 10,000)
 * to support fractional unit costs without floating-point distortion.
 */
function parseCostToScaled10k(value: unknown): bigint {
  const str = String(value).trim();
  if (!str || !/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`INVALID_COST: Non-numeric cost value '${value}'.`);
  }
  const isNegative = str.startsWith('-');
  const clean = isNegative ? str.slice(1) : str;
  const parts = clean.split('.');
  const whole = BigInt(parts[0] || '0');
  let frac = parts[1] || '';
  if (frac.length > 4) frac = frac.slice(0, 4);
  while (frac.length < 4) frac += '0';
  const scaled = whole * INTERMEDIATE_COST_SCALE + BigInt(frac);
  return isNegative ? -scaled : scaled;
}

/**
 * Calculates new Weighted Average Cost (WAC) when receiving stock:
 *
 * Exact Decimal Policy:
 * 1. Quantity scale: Fixed 4 decimal places (scale 10,000).
 * 2. Cost scale: Fixed 4 decimal places (scale 10,000) for intermediate fractional valuation.
 * 3. Inventory value: Calculated as Quantity * Cost with scale 100,000,000 (10^8).
 * 4. Division: Scaled total value divided by total quantity scaled, yielding cost with scale 10,000.
 * 5. Rounding: Symmetric round-half-up to 2 decimal places (scale 100 for currency presentation).
 * 6. Opening stock boundary: If opening stock is <= 0, the received unit cost is adopted directly.
 * 7. Zero floating-point multiplication or division is performed.
 */
export function calculateWeightedAverageCostExact(
  currentOnHand: unknown,
  currentAvgCost: unknown,
  receivedQty: unknown,
  receivedUnitCost: unknown
): string {
  const onHandScaled = parseQtyToScaled(currentOnHand);
  const recQtyScaled = parseQtyToScaled(receivedQty);
  const recCostScaled = parseCostToScaled10k(receivedUnitCost);

  if (recQtyScaled < 0n) {
    throw new Error(`INVALID_QUANTITY: Received quantity for WAC calculation cannot be negative.`);
  }

  // If opening stock is <= 0, new WAC is simply the received unit cost
  if (onHandScaled <= 0n) {
    const roundedCents = (recCostScaled + 50n) / 100n;
    const whole = roundedCents / 100n;
    const cents = (roundedCents % 100n).toString().padStart(2, '0');
    return `${whole}.${cents}`;
  }

  const currentCostScaled = parseCostToScaled10k(currentAvgCost);
  const totalQtyScaled = onHandScaled + recQtyScaled;

  if (totalQtyScaled <= 0n) {
    const roundedCents = (recCostScaled + 50n) / 100n;
    const whole = roundedCents / 100n;
    const cents = (roundedCents % 100n).toString().padStart(2, '0');
    return `${whole}.${cents}`;
  }

  // Total valuation in scale 10^8:
  const currentValue = onHandScaled * currentCostScaled;
  const receivedValue = recQtyScaled * recCostScaled;
  const totalValue = currentValue + receivedValue;

  // New WAC in scale 10^4 with round-half-up:
  const wacScaled10k = (totalValue + totalQtyScaled / 2n) / totalQtyScaled;

  // Round from scale 10^4 to 2 decimal places (scale 100):
  const roundedCents = (wacScaled10k + 50n) / 100n;
  const whole = roundedCents / 100n;
  const cents = (roundedCents % 100n).toString().padStart(2, '0');
  return `${whole}.${cents}`;
}

export function calculateWeightedAverageCost(
  currentOnHand: unknown,
  currentAvgCost: unknown,
  receivedQty: unknown,
  receivedUnitCost: unknown
): number {
  return Number(calculateWeightedAverageCostExact(currentOnHand, currentAvgCost, receivedQty, receivedUnitCost));
}

/**
 * Generates a collision-resistant identifier within VARCHAR(64) limits using crypto.randomUUID().
 */
export function generateInventoryId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16);
  const uuid = randomUUID().replace(/-/g, '');
  return `${cleanPrefix}_${uuid}`;
}

/**
 * Generates a clean human-readable document number with collision-resistant UUID suffix.
 */
export function generateDocumentNumber(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 8);
  const uuidPart = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${cleanPrefix}-${uuidPart}`;
}
