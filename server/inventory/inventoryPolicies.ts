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
    throw new Error(
      `INVALID_QUANTITY: '${fieldName}' is required and cannot be null or undefined.`
    );
  }

  // Authoritative inventory quantities MUST arrive as strings.
  // JavaScript numbers are rejected because IEEE-754 representation
  // is not an acceptable authoritative decimal representation.
  if (typeof value !== 'string') {
    throw new Error(
      `INVALID_QUANTITY: '${fieldName}' must be supplied as a decimal string.`
    );
  }

  // Authoritative boundary must reject whitespace rather than silently trimming it away.
  if (!value) {
    throw new Error(
      `INVALID_QUANTITY: '${fieldName}' cannot be empty.`
    );
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
    throw new Error(
      `INVALID_QUANTITY: '${fieldName}' has invalid decimal format.`
    );
  }

  const isNegative = value.startsWith('-');

  if (isNegative && !options?.allowNegative) {
    throw new Error(
      `INVALID_QUANTITY: '${fieldName}' cannot be negative.`
    );
  }

  const clean = isNegative ? value.slice(1) : value;
  const parts = clean.split('.');

  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';

  const maxDecimals =
    options?.maxDecimals !== undefined
      ? options.maxDecimals
      : 4;

  if (fracPart.length > maxDecimals) {
    throw new Error(
      `INVALID_QUANTITY: '${fieldName}' precision exceeds maximum supported ${maxDecimals} decimal places.`
    );
  }

  // The inventory persistence scale is exactly 4 decimals.
  if (maxDecimals > 4) {
    throw new Error(
      `INVALID_QUANTITY: Inventory quantity scale cannot exceed 4 decimal places.`
    );
  }

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
 * Formats any quantity to a strict 4-decimal-place Quantity string.
 */
export function toQtyString(value: unknown): Quantity {
  return formatScaledToQtyString(parseQtyToScaled(value));
}

/**
 * Normalizes monetary amounts into exact 2-decimal string representation.
 * 
 * Policy: PREFERRED REJECTION POLICY
 * - Validates input is numeric string, finite number, or bigint.
 * - Rejects non-numeric, NaN, Infinity, whitespace-only, booleans, objects.
 * - Rejects precision exceeding 2 decimal places (does NOT silently truncate).
 * - Rejects negative values unless options.allowNegative: true is explicitly specified.
 * - Normalizes valid values to strict 2 decimal places (e.g. 12 -> "12.00", 12.5 -> "12.50").
 */
export function parseExactMoney(
  value: unknown,
  fieldName: string = 'unit_cost',
  options?: { allowNegative?: boolean; required?: boolean }
): string {
  if (value === null) {
    throw new Error(
      `INVALID_MONEY: '${fieldName}' cannot be null.`
    );
  }

  if (value === undefined) {
    if (options?.required) {
      throw new Error(
        `INVALID_MONEY: '${fieldName}' is required and cannot be undefined.`
      );
    }
    return '0.00';
  }

  // Authoritative monetary values MUST arrive as decimal strings.
  if (typeof value !== 'string') {
    throw new Error(
      `INVALID_MONEY: '${fieldName}' must be supplied as a decimal string.`
    );
  }

  // Authoritative boundary must reject whitespace rather than trimming it away.
  if (!value) {
    throw new Error(
      `INVALID_MONEY: '${fieldName}' cannot be empty.`
    );
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
    throw new Error(
      `INVALID_MONEY: '${fieldName}' has invalid decimal format.`
    );
  }

  const isNegative = value.startsWith('-');

  if (isNegative && !options?.allowNegative) {
    throw new Error(
      `INVALID_MONEY: '${fieldName}' cannot be negative.`
    );
  }

  const clean = isNegative ? value.slice(1) : value;
  const parts = clean.split('.');

  const whole = BigInt(parts[0] || '0').toString();
  let frac = parts[1] || '';

  if (frac.length > 2) {
    throw new Error(
      `INVALID_MONEY: '${fieldName}' precision exceeds maximum supported 2 decimal places.`
    );
  }

  while (frac.length < 2) {
    frac += '0';
  }

  return `${isNegative ? '-' : ''}${whole}.${frac}`;
}

export function roundMoneyExact(amount: string): string {
  if (typeof amount !== 'string') {
    throw new Error(
      'INVALID_MONEY: Monetary amount must be supplied as a decimal string.'
    );
  }

  const str = amount.trim();

  if (!str || !/^-?\d+(?:\.\d+)?$/.test(str)) {
    throw new Error(
      `INVALID_MONEY: Invalid monetary amount '${amount}'.`
    );
  }

  const isNegative = str.startsWith('-');
  const clean = isNegative ? str.slice(1) : str;

  const parts = clean.split('.');
  const whole = BigInt(parts[0] || '0');
  let frac = parts[1] || '';

  if (frac.length > 4) {
    throw new Error(
      `INVALID_MONEY: Intermediate monetary precision cannot exceed 4 decimal places.`
    );
  }

  while (frac.length < 4) {
    frac += '0';
  }

  const fracBig = BigInt(frac);

  // Convert scale 10,000 -> scale 100 using round-half-up.
  const cents = (fracBig + 50n) / 100n;

  const totalCents =
    whole * 100n + cents;

  const resWhole =
    totalCents / 100n;

  const resCents =
    (totalCents % 100n)
      .toString()
      .padStart(2, '0');

  return `${isNegative ? '-' : ''}${resWhole}.${resCents}`;
}

export function toMoneyString(amount: string): string {
  return roundMoneyExact(amount);
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
  if (typeof value !== 'string') {
    throw new Error(
      'INVALID_COST: Cost must be supplied as a decimal string.'
    );
  }

  const str = value.trim();

  if (!str || !/^-?\d+(?:\.\d+)?$/.test(str)) {
    throw new Error(
      `INVALID_COST: Invalid cost value.`
    );
  }

  const isNegative = str.startsWith('-');
  const clean = isNegative ? str.slice(1) : str;

  const parts = clean.split('.');
  const whole = BigInt(parts[0] || '0');

  let frac = parts[1] || '';

  if (frac.length > 4) {
    throw new Error(
      'INVALID_COST: Cost precision cannot exceed 4 decimal places.'
    );
  }

  while (frac.length < 4) {
    frac += '0';
  }

  const scaled =
    whole * INTERMEDIATE_COST_SCALE +
    BigInt(frac);

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
  currentOnHand: string,
  currentAvgCost: string,
  receivedQty: string,
  receivedUnitCost: string
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
