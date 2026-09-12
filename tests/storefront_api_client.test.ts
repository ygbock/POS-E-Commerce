import assert from 'node:assert/strict';
import { storefrontApi, StorefrontApiError } from '../src/services/storefrontApi';

const originalFetch = globalThis.fetch;
const calls: Array<{ url: string; init?: RequestInit }> = [];

try {
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({
      data: {
        tenant: { id: 'org_alpha', name: 'Alpha', code: 'ALPHA', slug: 'alpha' },
        localization: { currencyCode: 'USD', currencySymbol: '$', locale: 'en-US', timezone: 'UTC' },
        branding: {},
        policies: {},
        catalogPolicy: {},
        featureFlags: {},
        pickupLocations: [],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const context = await storefrontApi.getContext('alpha');
  assert.equal(context.tenant.slug, 'alpha');
  assert.equal(calls[0].url, '/api/storefront/alpha/context');
  assert.equal(calls[0].init?.credentials, 'same-origin');

  calls.length = 0;
  await storefrontApi.getProducts('alpha', {
    category: 'Power Tools',
    brand: 'Acme',
    search: 'drill',
    minPrice: 10,
    maxPrice: 500,
    inStock: true,
    onSale: false,
    sortBy: 'price-low',
    page: 2,
    limit: 24,
  });
  const url = new URL(calls[0].url, 'https://shop.abacha.com');
  assert.equal(url.pathname, '/api/storefront/alpha/products');
  assert.equal(url.searchParams.get('category'), 'Power Tools');
  assert.equal(url.searchParams.get('brand'), 'Acme');
  assert.equal(url.searchParams.get('search'), 'drill');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('limit'), '24');

  calls.length = 0;
  await storefrontApi.validateCart('alpha', [{ variantId: 'v1', quantity: 2 }], 'loc-1');
  assert.equal(calls[0].url, '/api/storefront/alpha/cart/validate');
  assert.equal(calls[0].init?.method, 'POST');
  assert.match(String(calls[0].init?.body), /"variantId":"v1"/);
  assert.match(String(calls[0].init?.body), /"fulfillmentLocationId":"loc-1"/);

  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: { code: 'TENANT_NOT_FOUND', message: 'Store Not Found' },
  }), { status: 404, headers: { 'content-type': 'application/json' } })) as typeof fetch;

  await assert.rejects(
    () => storefrontApi.getContext('missing'),
    (error: unknown) => error instanceof StorefrontApiError
      && error.status === 404
      && error.code === 'TENANT_NOT_FOUND',
  );

  console.log('Storefront API client contract: 10 passed, 0 failed');
} finally {
  globalThis.fetch = originalFetch;
}
