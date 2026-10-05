import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';

type PackageJson = {
  scripts?: Record<string, string>;
};

function readJson<T>(relativePath: string): T {
  const filePath = path.resolve(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function assertFile(relativePath: string) {
  assert.ok(fs.existsSync(path.resolve(process.cwd(), relativePath)), `required release-gate file is missing: ${relativePath}`);
}

async function main() {
  const packageJson = readJson<PackageJson>('package.json');
  const scripts = packageJson.scripts ?? {};

  const requiredScripts = [
    'test:discovery',
    'test:discovery-accessibility',
    'test:discovery-production-readiness',
    'test:discovery-router',
    'test:discovery-profile',
    'test:discovery-location-map',
    'test:discovery-product',
    'test:discovery-moderation-lifecycle',
    'test:platform-discovery-moderation-http',
    'test:discovery-performance',
    'test:discovery-http-authorization',
    'test:discovery-request-performance',
    'test:discovery-store-lifecycle',
    'test:discovery-customer-workspace',
    'test:discovery-analytics',
    'test:discovery-search',
  ];

  for (const script of requiredScripts) {
    assert.ok(scripts[script], `release gate must register ${script}`);
  }

  const discoveryAggregate = scripts['test:discovery'] ?? '';
  for (const script of requiredScripts.filter((name) => name !== 'test:discovery' && name !== 'test:discovery-search')) {
    assert.ok(
      discoveryAggregate.split(/\s*&&\s*/).some((step) => step.trim() === `npm run ${script}`),
      `Discovery aggregate must invoke ${script} through npm run`,
    );
  }

  const requiredFiles = [
    'server/routes/discoveryRoutes.ts',
    'server/services/discoveryBusinessService.ts',
    'src/components/discovery/DiscoverySearchResults.tsx',
    'src/components/discovery/DiscoveryBusinessProfile.tsx',
    'src/components/discovery/DiscoveryMapPanel.tsx',
    'tests/discovery_production_readiness.test.ts',
    'tests/discovery_accessibility_responsive.test.ts',
    'tests/discovery_router.test.ts',
    'tests/discovery_business_profile.test.ts',
    'tests/discovery_location_map.test.ts',
    'tests/discovery_product.test.ts',
    'tests/discovery_moderation_lifecycle.test.ts',
    'tests/platform_discovery_moderation_http.test.ts',
    'tests/discovery_performance.test.ts',
    'tests/discovery_business_http_authorization.test.ts',
    'tests/discovery_request_performance.test.ts',
    'tests/discovery_store_lifecycle.test.ts',
    'tests/discovery_customer_workspace.test.ts',
    'tests/discovery_analytics_events.test.ts',
    'tests/discovery_search.test.ts',
    'tests/discovery_search_ranking.test.ts',
    'tests/discovery_search_attribution.test.ts',
  ];

  for (const file of requiredFiles) assertFile(file);

  const discoveryRoutes = fs.readFileSync(
    path.resolve(process.cwd(), 'server/routes/discoveryRoutes.ts'),
    'utf8',
  );
  assert.match(discoveryRoutes, /discoverySearchRateLimiter/);
  assert.match(discoveryRoutes, /DISCOVERY_PUBLIC_PAGE_SIZE/);
  assert.match(discoveryRoutes, /DISCOVERY_MAX_OFFSET/);
  assert.match(discoveryRoutes, /parseDiscoveryInteger/);

  const searchResults = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/discovery/DiscoverySearchResults.tsx'),
    'utf8',
  );
  assert.match(searchResults, /AbortController/);
  assert.match(searchResults, /Number\.isFinite\(parsed\)/);

  const profile = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/discovery/DiscoveryBusinessProfile.tsx'),
    'utf8',
  );
  assert.match(profile, /trackEvent/);

  console.log('Discovery release-gate contract test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
