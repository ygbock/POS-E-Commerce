import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

const route = read('server/routes/merchantStorePolicyRoutes.ts');
const api = read('src/services/discoveryApi.ts');
const settings = read('src/components/discovery/business/DiscoverySettingsPanel.tsx');
const server = read('server.ts');
const resolver = read('server/services/tenantResolver.ts');

assert.match(route, /GET.*store-policies|store-policies/);
assert.match(route, /PATCH.*store-policies|store-policies/);
assert.match(route, /organization_id=$2 AND m\.user_id=$3/);
assert.match(route, /m\.role !== 'OWNER' && m\.role !== 'MANAGER'/);
assert.match(route, /freeShippingThreshold/);
assert.match(route, /standardShippingFee/);
assert.match(route, /expressShippingFee/);
assert.match(route, /db\.withTransaction/);
assert.match(route, /STORE_POLICIES_UPDATED/);
assert.doesNotMatch(route, /75\.00|9\.99|19\.99/);

assert.match(api, /getStorePolicies/);
assert.match(api, /updateStorePolicies/);
assert.match(settings, /Store Pricing & Fulfillment Policies/);
assert.match(settings, /Save Store Policies/);
assert.match(settings, /freeShippingThreshold/);
assert.match(settings, /expressShippingFee/);
assert.match(settings, /pickupEnabled/);
assert.match(server, /createMerchantStorePolicyRouter/);
assert.match(server, /app\.use\('\/api\/merchant', createMerchantStorePolicyRouter\(db\)\)/);

console.log('Store policy management guards: PASS');
