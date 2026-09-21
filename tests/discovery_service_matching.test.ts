import assert from 'assert';
import {
  discoveryHaversineKm,
  discoveryMatchTokens,
  rankDiscoveryServiceMatches,
} from '../server/utils/discoveryServiceMatching';

async function main() {
  const tokens = discoveryMatchTokens('Solar panel installation and battery backup');
  assert.ok(tokens.includes('solar'));
  assert.ok(tokens.includes('panel'));
  assert.ok(!tokens.includes('and'));

  const rows = [
    { serviceId: 'svc_solar', businessId: 'biz_solar', serviceName: 'Solar Installation', serviceDescription: 'Solar panels and battery backup', serviceType: 'Solar Energy', city: 'Freetown', priceFrom: 1000, priceTo: 5000 },
    { serviceId: 'svc_plumbing', businessId: 'biz_plumbing', serviceName: 'Plumbing Repairs', serviceDescription: 'Pipes, leaks and water systems', serviceType: 'Plumbing', city: 'Freetown' },
    { serviceId: 'svc_solar_far', businessId: 'biz_far', serviceName: 'Solar Installation', serviceDescription: 'Solar panels', serviceType: 'Solar Energy', latitude: 8.6, longitude: -13.1, locationType: 'SERVICE_AREA', serviceRadiusKm: 2 },
  ];

  const ranked = rankDiscoveryServiceMatches({
    description: 'Need solar panel installation and battery backup',
    serviceType: 'Solar Energy',
    city: 'Freetown',
    budgetTo: 4000,
  }, rows);

  assert.strictEqual(ranked[0].businessId, 'biz_solar');
  assert.strictEqual(ranked[0].reason, 'SERVICE_TYPE');
  assert.ok(!ranked.some(x => x.businessId === 'biz_plumbing'));

  const exact = rankDiscoveryServiceMatches({
    description: 'I need this service',
    requestedServiceId: 'svc_solar',
  }, rows);
  assert.strictEqual(exact[0].businessId, 'biz_solar');
  assert.strictEqual(exact[0].reason, 'REQUESTED_SERVICE');

  const far = rankDiscoveryServiceMatches({
    description: 'solar installation',
    latitude: 8.484,
    longitude: -13.229,
  }, rows);
  assert.ok(!far.some(x => x.businessId === 'biz_far'), 'service-area providers outside their radius must not match');

  const distance = discoveryHaversineKm(8.484, -13.229, 8.484, -13.229);
  assert.ok(distance < 0.001);

  const many = Array.from({ length: 500 }, (_, i) => ({
    serviceId: 'svc_' + i,
    businessId: 'biz_' + i,
    serviceName: i % 2 === 0 ? 'Solar Installation' : 'Unrelated Service',
    serviceDescription: i % 2 === 0 ? 'Solar panels and backup batteries' : 'General service',
    serviceType: i % 2 === 0 ? 'Solar Energy' : 'Other',
    city: 'Freetown',
  }));
  const started = performance.now();
  const result = rankDiscoveryServiceMatches({
    description: 'solar panel installation',
    serviceType: 'Solar Energy',
    city: 'Freetown',
  }, many);
  const elapsed = performance.now() - started;
  assert.strictEqual(result.length, 25, 'matching should cap provider fan-out');
  assert.ok(elapsed < 500, `500-candidate matching should remain bounded; took ${elapsed.toFixed(1)}ms`);

  console.log('Discovery service matching hardening tests passed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
