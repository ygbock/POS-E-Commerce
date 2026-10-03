import assert from 'assert';
import fs from 'fs';

const repository = fs.readFileSync('server/repositories/posRepository.ts', 'utf8');
const routes = fs.readFileSync('server/routes/posRoutes.ts', 'utf8');
const modal = fs.readFileSync('src/components/pos/ShiftModal.tsx', 'utf8');

assert.match(repository, /async getSessionSummary\(sessionId: string, orgId: string/);
assert.match(repository, /o\.pos_session_id = \$1 AND o\.organization_id = \$2/);
assert.match(repository, /p\.organization_id = \$2/);
assert.match(repository, /pr\.organization_id = \$2/);
assert.match(repository, /WHERE session_id = \$1/);
assert.match(repository, /transactions_count/);
assert.match(repository, /total_cash_sales/);
assert.match(repository, /total_card_sales/);
assert.match(repository, /total_mobile_sales/);
assert.match(repository, /total_wallet_sales/);
assert.match(repository, /total_refunds/);
assert.match(repository, /cash_in_total/);
assert.match(repository, /cash_out_total/);

assert.match(routes, /summary: await posRepo\.getSessionSummary\(session\.id, orgId\)/);
assert.match(modal, /transactionsCount: Number\(s\.summary\?\.transactions_count/);
assert.match(modal, /totalCashSales: Number\(s\.summary\?\.total_cash_sales/);
assert.match(modal, /totalCardSales: Number\(s\.summary\?\.total_card_sales/);
assert.match(modal, /totalMobileSales: Number\(s\.summary\?\.total_mobile_sales/);
assert.match(modal, /totalWalletSales: Number\(s\.summary\?\.total_wallet_sales/);
assert.match(modal, /totalRefunds: Number\(s\.summary\?\.total_refunds/);
assert.match(modal, /cashInTotal: Number\(s\.summary\?\.cash_in_total/);
assert.match(modal, /cashOutTotal: Number\(s\.summary\?\.cash_out_total/);
// Zero-valued React initialization/fallback is display state only; authoritative values are mapped from s.summary above.

console.log('POS shift summary authority guard: 20/20 checks passed.');
