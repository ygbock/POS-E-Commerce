import assert from 'node:assert/strict';
import { buildDiscoveryPath, parseDiscoveryPath } from '../src/router/DiscoveryRouter.ts';

const home = parseDiscoveryPath('/discover', '');
assert.deepEqual(home, { name: 'discover-home' });

const root = parseDiscoveryPath('/', '');
assert.deepEqual(root, { name: 'discover-home' });

const search = parseDiscoveryPath('/discover/search', '?q=phone&type=products&city=Freetown&radiusKm=10&openNow=true&page=2');
assert.deepEqual(search, {
  name: 'discover-search',
  query: 'phone',
  type: 'products',
  city: 'Freetown',
  radiusKm: 10,
  openNow: true,
  page: 2,
});

const business = parseDiscoveryPath('/discover/business/business%2F123', '');
assert.deepEqual(business, { name: 'discover-business', businessId: 'business/123' });

const service = parseDiscoveryPath('/discover/service/svc_123', '');
assert.deepEqual(service, { name: 'discover-service', serviceId: 'svc_123' });

const request = parseDiscoveryPath('/discover/request-service', '');
assert.deepEqual(request, { name: 'discover-request-service' });

const saved = parseDiscoveryPath('/discover/saved', '');
assert.deepEqual(saved, { name: 'discover-saved' });

const myRequests = parseDiscoveryPath('/discover/my-requests', '');
assert.deepEqual(myRequests, { name: 'discover-my-requests' });

const builtSearch = buildDiscoveryPath({
  name: 'discover-search',
  query: 'phone',
  type: 'products',
  city: 'Freetown',
  radiusKm: 10,
  openNow: true,
  page: 2,
});
assert.equal(
  builtSearch,
  '/discover/search?q=phone&type=products&city=Freetown&radiusKm=10&openNow=true&page=2'
);

const builtBusiness = buildDiscoveryPath({ name: 'discover-business', businessId: 'business/123' });
assert.equal(builtBusiness, '/discover/business/business%2F123');

const builtService = buildDiscoveryPath({ name: 'discover-service', serviceId: 'svc_123' });
assert.equal(builtService, '/discover/service/svc_123');

console.log('Discovery router tests passed: 12 assertions');
