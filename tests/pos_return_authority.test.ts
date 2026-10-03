import assert from 'assert';
import fs from 'fs';

const source = fs.readFileSync('src/components/pos/PosTerminal.tsx', 'utf8');

assert.match(source, /fetch\(.*\/api\/pos\/sales\//);
assert.match(source, /fetch\(\'\/api\/pos\/returns/);
assert.match(source, /'Idempotency-Key': crypto\.randomUUID\(\)/);
assert.match(source, /refundMethod: returnRefundMethod/);
assert.match(source, /refund_amount/);
assert.match(source, /Refund amount, return eligibility, inventory restoration, payment state, and cash-session reconciliation are calculated by the server\./);
assert.doesNotMatch(source, /processPosReturn\(/);
assert.doesNotMatch(source, /let refundVal = 0/);
assert.doesNotMatch(source, /origItem\.price \* r\.quantity/);
assert.doesNotMatch(source, /checked=\{returnItemsState\[item\.variantId\]\?\.restock/);

console.log('POS return authority guard: 10/10 checks passed.');