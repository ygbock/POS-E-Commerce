import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const card = fs.readFileSync(path.join(root, 'src/components/discovery/ProductDiscoveryCard.tsx'), 'utf8');
const search = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoverySearchResults.tsx'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/services/discoveryApi.ts'), 'utf8');
const types = fs.readFileSync(path.join(root, 'src/types/discovery.ts'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'server/routes/discoveryRoutes.ts'), 'utf8');

assert.match(card, /product\.show_prices === false/);
assert.match(card, /Price on request/);
assert.match(card, /product\.show_stock_status !== false/);
assert.match(card, /AvailabilityBadge/);
assert.match(card, /product\.business_name/);
assert.match(card, /product\.business_slug \|\| product\.business_id/);
assert.match(card, /product\.variant_id/);
assert.match(card, /loading="lazy"/);

assert.match(search, /handleProductSelect/);
assert.match(search, /recordResultEvent\(product, 'PRODUCT_VIEW'\)/);
assert.match(search, /<ProductDiscoveryCard key=\{prod\.variant_id\} product=\{prod\} onSelect=\{handleProductSelect\}/);

assert.match(types, /eventType: 'IMPRESSION' \| 'VIEW' \| 'CONTACT' \| 'DIRECTION_CLICK' \| 'STORE_CLICK' \| 'PRODUCT_VIEW' \| 'SERVICE_VIEW' \| 'SERVICE_REQUEST' \| 'ORDER_CLICK'/);
assert.ok(api.includes('/api/discovery/search/events'));

assert.match(types, /export interface DiscoveryProduct/);
assert.match(types, /variant_id: string/);
assert.match(types, /show_prices\?: boolean/);
assert.match(types, /show_stock_status\?: boolean/);
assert.match(types, /available_stock: string \| number/);

assert.match(routes, /p\.status='active'/);
assert.match(routes, /p\.channels_ecommerce=TRUE/);
assert.match(routes, /b\.listing_status='PUBLISHED'/);
assert.match(routes, /b\.is_discoverable=TRUE/);
assert.match(routes, /COALESCE\(ds\.show_products,TRUE\)=TRUE/);
assert.match(routes, /ds\.show_prices,ds\.show_stock_status/);
assert.match(routes, /COALESCE\(SUM\(ib\.available\),0\) AS available_stock/);
assert.match(routes, /JOIN organizations o ON o\.id=b\.organization_id AND o\.is_active=TRUE/);

console.log('Discovery PAGE-006 product discovery contract tests passed.');
