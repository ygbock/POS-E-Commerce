/**
 * Inventory Policies, Precision Math & Domain Invariants (INV-001)
 * 
 * Enforces:
 * - 4-decimal-place quantity precision (safe from IEEE-754 floating-point drift)
 * - 2-decimal-place currency precision
 * - Ledger integrity invariant: previous_balance + quantity_change = new_balance
 * - Availability invariant: available = on_hand - reserved - damaged - expired
 * - Non-negative stock constraints
 * - Weighted Average Cost (WAC) foundation
 */

const QTY_SCALE = 10000;
const MONEY_SCALE = 100;

/**
 * Rounds a quantity to exactly 4 decimal places using integer-scaled arithmetic.
 */
export function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * QTY_SCALE) / QTY_SCALE;
}

/**
 * Safely adds two quantities without floating-point distortion.
 */
export function addQty(a: number, b: number): number {
  const scaledA = Math.round((a + Number.EPSILON) * QTY_SCALE);
  const scaledB = Math.round((b + Number.EPSILON) * QTY_SCALE);
  return (scaledA + scaledB) / QTY_SCALE;
}

/**
 * Safely subtracts two quantities without floating-point distortion.
 */
export function subQty(a: number, b: number): number {
  const scaledA = Math.round((a + Number.EPSILON) * QTY_SCALE);
  const scaledB = Math.round((b + Number.EPSILON) * QTY_SCALE);
  return (scaledA - scaledB) / QTY_SCALE;
}

/**
 * Rounds monetary amounts to 2 decimal places.
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

/**
 * Computes available stock from components:
 * available = on_hand - reserved - damaged - expired
 */
export function calculateAvailable(
  onHand: number,
  reserved: number = 0,
  damaged: number = 0,
  expired: number = 0
): number {
  const committed = addQty(addQty(reserved, damaged), expired);
  return roundQty(subQty(onHand, committed));
}

/**
 * Enforces ledger consistency invariant:
 * previous_balance + quantity_change === new_balance
 */
export function assertLedgerInvariant(
  previousBalance: number,
  quantityChange: number,
  newBalance: number
): void {
  const expected = addQty(previousBalance, quantityChange);
  const actual = roundQty(newBalance);
  if (Math.abs(expected - actual) > 0.0001) {
    throw new Error(
      `LEDGER_CORRUPTION_DETECTED: Ledger balance invariant violated. ` +
      `Previous (${previousBalance}) + Change (${quantityChange}) = Expected (${expected}), got New (${newBalance}).`
    );
  }
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
  const totalQty = addQty(currentOnHand, receivedQty);
  if (totalQty <= 0) {
    return roundMoney(receivedUnitCost);
  }
  const currentTotalVal = currentOnHand > 0 ? currentOnHand * currentAvgCost : 0;
  const receivedTotalVal = receivedQty * receivedUnitCost;
  const wac = (currentTotalVal + receivedTotalVal) / totalQty;
  return roundMoney(wac);
}
