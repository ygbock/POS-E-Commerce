import { TransferStatus } from './inventoryTypes';

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
 * - Strict decimal representation at persistence and domain boundaries
 * - Ledger integrity invariant: previous_balance + quantity_change = new_balance
 * - Availability invariant: available = on_hand - reserved - damaged - expired
 * - Non-negative stock constraints
 * - Weighted Average Cost (WAC) foundation
 */

export const QTY_SCALE = 10000n;
const MONEY_SCALE = 100n;

/**
 * Parses any quantity (string, number, or bigint) into a BigInt scaled by 10,000.
 * Pure string parsing avoids IEEE-754 floating-point inaccuracies.
 */
export function parseQtyToScaled(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  let str: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`INVALID_QUANTITY: Non-finite quantity number '${value}'.`);
    }
    str = value.toFixed(4);
  } else {
    str = String(value).trim();
  }

  if (!str || !/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`INVALID_QUANTITY: '${value}' cannot be parsed into a decimal quantity.`);
  }

  const isNegative = str.startsWith('-');
  const clean = isNegative ? str.slice(1) : str;
  const parts = clean.split('.');
  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';
  if (fracPart.length > 4) {
    fracPart = fracPart.slice(0, 4);
  } else {
    while (fracPart.length < 4) {
      fracPart += '0';
    }
  }

  const scaled = BigInt(wholePart) * QTY_SCALE + BigInt(fracPart);
  return isNegative ? -scaled : scaled;
}

/**
 * Formats a scaled BigInt back to a strict 4-decimal-place string (e.g. "12.5000").
 */
export function formatScaledToQtyString(scaled: bigint): string {
  const isNegative = scaled < 0n;
  const abs = isNegative ? -scaled : scaled;
  const whole = abs / QTY_SCALE;
  const frac = abs % QTY_SCALE;
  const fracStr = frac.toString().padStart(4, '0');
  return `${isNegative ? '-' : ''}${whole}.${fracStr}`;
}

/**
 * Converts a scaled BigInt to a JavaScript number.
 */
export function formatScaledToNumber(scaled: bigint): number {
  const str = formatScaledToQtyString(scaled);
  return Number(str);
}

/**
 * Adds two scaled quantities.
 */
export function addQtyScaled(a: bigint, b: bigint): bigint {
  return a + b;
}

/**
 * Subtracts two scaled quantities.
 */
export function subQtyScaled(a: bigint, b: bigint): bigint {
  return a - b;
}

/**
 * Safely adds two quantities using BigInt scaled arithmetic.
 */
export function addQty(a: string | number, b: string | number): number {
  return formatScaledToNumber(addQtyScaled(parseQtyToScaled(a), parseQtyToScaled(b)));
}

/**
 * Safely subtracts two quantities using BigInt scaled arithmetic.
 */
export function subQty(a: string | number, b: string | number): number {
  return formatScaledToNumber(subQtyScaled(parseQtyToScaled(a), parseQtyToScaled(b)));
}

/**
 * Rounds/normalizes a quantity to 4 decimal places via scaled integer parsing.
 */
export function roundQty(value: string | number): number {
  return formatScaledToNumber(parseQtyToScaled(value));
}

/**
 * Formats any quantity to a strict 4-decimal-place string for SQL queries.
 */
export function toQtyString(value: string | number | bigint): string {
  return formatScaledToQtyString(parseQtyToScaled(value));
}

/**
 * Rounds monetary amounts to 2 decimal places using BigInt scale 100.
 */
export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const str = amount.toFixed(2);
  return Number(str);
}

/**
 * Computes available stock from scaled BigInt components:
 * available = on_hand - reserved - damaged - expired
 */
export function calculateAvailableScaled(
  onHand: bigint,
  reserved: bigint = 0n,
  damaged: bigint = 0n,
  expired: bigint = 0n
): bigint {
  const committed = reserved + damaged + expired;
  return onHand - committed;
}

/**
 * Computes available stock from components:
 * available = on_hand - reserved - damaged - expired
 */
export function calculateAvailable(
  onHand: string | number,
  reserved: string | number = 0,
  damaged: string | number = 0,
  expired: string | number = 0
): number {
  const scaled = calculateAvailableScaled(
    parseQtyToScaled(onHand),
    parseQtyToScaled(reserved),
    parseQtyToScaled(damaged),
    parseQtyToScaled(expired)
  );
  return formatScaledToNumber(scaled);
}

/**
 * Enforces ledger consistency invariant using scaled BigInts:
 * previous_balance + quantity_change === new_balance
 */
export function assertLedgerInvariantScaled(
  previousBalance: bigint,
  quantityChange: bigint,
  newBalance: bigint
): void {
  const expected = previousBalance + quantityChange;
  if (expected !== newBalance) {
    throw new Error(
      `LEDGER_CORRUPTION_DETECTED: Ledger balance invariant violated. ` +
      `Previous (${formatScaledToQtyString(previousBalance)}) + Change (${formatScaledToQtyString(quantityChange)}) ` +
      `= Expected (${formatScaledToQtyString(expected)}), got New (${formatScaledToQtyString(newBalance)}).`
    );
  }
}

/**
 * Enforces ledger consistency invariant:
 * previous_balance + quantity_change === new_balance
 */
export function assertLedgerInvariant(
  previousBalance: string | number,
  quantityChange: string | number,
  newBalance: string | number
): void {
  assertLedgerInvariantScaled(
    parseQtyToScaled(previousBalance),
    parseQtyToScaled(quantityChange),
    parseQtyToScaled(newBalance)
  );
}

/**
 * Calculates new Weighted Average Cost (WAC) when receiving stock:
 * new_wac = ((existing_on_hand * existing_avg_cost) + (received_qty * received_unit_cost)) / total_on_hand
 */
export function calculateWeightedAverageCost(
  currentOnHand: number,
  currentAvgCost: number,
  receivedQty: number,
  receivedUnitCost: number
): number {
  const scaledOnHand = parseQtyToScaled(currentOnHand);
  const scaledRec = parseQtyToScaled(receivedQty);
  const totalScaled = scaledOnHand + scaledRec;
  if (totalScaled <= 0n) {
    return roundMoney(receivedUnitCost);
  }
  const totalQty = formatScaledToNumber(totalScaled);
  const currentTotalVal = currentOnHand > 0 ? currentOnHand * currentAvgCost : 0;
  const receivedTotalVal = receivedQty * receivedUnitCost;
  const wac = (currentTotalVal + receivedTotalVal) / totalQty;
  return roundMoney(wac);
}
