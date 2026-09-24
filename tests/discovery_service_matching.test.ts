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

  const many = Array.from({ length: 5000 }, (_, i) => ({
    serviceId: 'svc_' + i,
    businessId: 'biz_' + i,
    serviceName: i % 2 === 0 ? 'Solar Installation' : 'Unrelated Service',
    serviceDescription: i % 2 === 0 ? 'Solar panels and backup batteries' : 'General service',
    serviceType: i % 2 === 0 ? 'Solar Energy' : 'Other',
    city: 'Freetown',
  }));
  const matchingTimings: number[] = [];
  let result = rankDiscoveryServiceMatches({
    description: 'solar panel installation',
    serviceType: 'Solar Energy',
    city: 'Freetown',
  }, many);
  assert.strictEqual(result.length, 25, 'matching should cap provider fan-out');

  for (let i = 0; i < 10; i += 1) {
    const started = performance.now();
    result = rankDiscoveryServiceMatches({
      description: 'solar panel installation',
      serviceType: 'Solar Energy',
      city: 'Freetown',
    }, many);
    matchingTimings.push(performance.now() - started);
  }
  matchingTimings.sort((a, b) => a - b);
  const matchingP95 = matchingTimings[Math.min(matchingTimings.length - 1, Math.ceil(matchingTimings.length * 0.95) - 1)];
  const matchingMax = matchingTimings[matchingTimings.length - 1];
  assert.ok(matchingP95 < 750, `5000-candidate matching p95 should remain bounded; took ${matchingP95.toFixed(1)}ms`);
  assert.ok(matchingMax < 1200, `5000-candidate matching max should remain bounded; took ${matchingMax.toFixed(1)}ms`);

  const malformed = rankDiscoveryServiceMatches({
    description: 'solar installation',
    serviceType: 'Solar Energy',
    latitude: Number.NaN,
    longitude: Number.POSITIVE_INFINITY,
    budgetFrom: Number.NaN,
    budgetTo: Number.POSITIVE_INFINITY,
  }, [
    { serviceId: 'svc_valid', businessId: 'biz_valid', serviceName: 'Solar Installation', serviceDescription: 'Solar panels', serviceType: 'Solar Energy', city: 'Freetown', priceFrom: 1000, priceTo: 5000 },
    { serviceId: 'svc_bad', businessId: 'biz_bad', serviceName: 'Solar Installation', serviceDescription: 'Solar panels', serviceType: 'Solar Energy', latitude: 'not-a-number', longitude: 'not-a-number', serviceRadiusKm: 'not-a-number', priceFrom: 'not-a-number', priceTo: 'not-a-number' },
  ]);
  assert.ok(malformed.some(x => x.businessId === 'biz_valid'), 'malformed request numbers must not suppress valid matches');
  assert.ok(malformed.some(x => x.businessId === 'biz_bad'), 'malformed optional candidate numbers must not create NaN scores');

  const bounded = rankDiscoveryServiceMatches({ description: 'solar installation', serviceType: 'Solar Energy' }, many, 0);
  assert.strictEqual(bounded.length, 25, 'invalid match limits should fall back to the safe default');

  console.log('Discovery service matching hardening tests passed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
