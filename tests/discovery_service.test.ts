import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const detail = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryServiceDetailPage.tsx'), 'utf8');
const card = fs.readFileSync(path.join(root, 'src/components/discovery/ServiceCard.tsx'), 'utf8');
const home = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryHome.tsx'), 'utf8');
const search = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoverySearchResults.tsx'), 'utf8');
const marketplace = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryMarketplace.tsx'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/services/discoveryApi.ts'), 'utf8');
const router = fs.readFileSync(path.join(root, 'src/router/DiscoveryRouter.ts'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'server/routes/discoveryRoutes.ts'), 'utf8');
const types = fs.readFileSync(path.join(root, 'src/types/discovery.ts'), 'utf8');

assert.match(detail, /discoveryApi\.getService\(serviceId\)/);
assert.match(detail, /Request a quote/);
assert.match(detail, /booking_mode/);
assert.match(detail, /service_area_text/);
assert.match(detail, /duration_minutes/);
assert.match(detail, /SERVICE_REQUEST/);

assert.match(card, /onOpenService\?: \(service: DiscoveryService\)/);
assert.match(card, /onOpenService\?\.\(service\)/);
assert.match(card, /onRequestService\?\.\(service\)/);

assert.match(home, /onOpenService=\{\(selected\) =>/);
assert.match(home, /SERVICE_VIEW/);
assert.match(home, /\/discover\/service\//);
assert.match(search, /onOpenService=\{\(service\) =>/);
assert.match(search, /SERVICE_VIEW/);

assert.match(marketplace, /route\.name === 'discover-service'/);
assert.match(marketplace, /<DiscoveryServiceDetailPage/);
assert.match(marketplace, /serviceId=\{route\.serviceId\}/);

assert.match(api, /async getService\(serviceId: string\)/);
assert.match(api, /\/api\/discovery\/services\/\$\{encodeURIComponent\(serviceId\)\}/);

assert.match(router, /name: 'discover-service'/);
assert.match(router, /\/discover\/service\/\$\{encodeURIComponent\(route\.serviceId\)\}/);

assert.match(routes, /router\.get\('\/services\/:id'/);
assert.match(routes, /s\.is_active=TRUE/);
assert.match(routes, /b\.listing_status='PUBLISHED'/);
assert.match(routes, /b\.is_discoverable=TRUE/);
assert.match(routes, /organizations o/);

assert.match(types, /export interface DiscoveryService/);
assert.match(types, /booking_mode: DiscoveryBookingMode/);
assert.match(types, /service_area_text\?: string/);
assert.match(types, /duration_minutes\?: number/);

console.log('Discovery PAGE-007 service discovery and RFQ contract tests passed.');
