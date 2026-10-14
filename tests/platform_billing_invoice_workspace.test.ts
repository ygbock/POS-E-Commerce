import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const view = fs.readFileSync(path.join(root, 'src/components/platform/SubscriptionsManagementView.tsx'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/services/subscriptionApi.ts'), 'utf8');

assert.match(view, /activeSubTab === 'invoices'/, 'Invoice workspace must have a reachable tab panel');
assert.match(view, /subscriptionApi\.getInvoices\(/, 'Invoice workspace must load invoices from the billing API');
assert.match(view, /subscriptionApi\.createInvoice\(/, 'Authorized platform staff must be able to create invoices from the workspace');
assert.match(view, /invoiceStatusFilter/, 'Invoice list must support status filtering');
assert.match(view, /invoice\.invoice_number/, 'Invoice list must show the invoice number');
assert.match(view, /invoice\.total/, 'Invoice list must show the authoritative invoice total');
assert.match(view, /invoice\.due_at/, 'Invoice list must show due dates when available');
assert.match(view, /No invoices found/, 'Invoice list must render an empty state');
assert.match(api, /\/api\/platform\/billing\/invoices/, 'Invoice API must use the platform billing route');
assert.match(api, /interface BillingInvoice/, 'Invoice API must expose a typed invoice contract');

console.log('Platform billing invoice workspace contract: PASS');
