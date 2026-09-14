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
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ data: [{ id: 'cat-1', name: 'Power Tools', slug: 'power-tools' }] }), { status: 200 });
  }) as typeof fetch;
  const categories = await storefrontApi.getCategories('alpha');
  assert.equal((categories[0] as any)?.name, 'Power Tools');
  assert.equal(calls[0].url, '/api/storefront/alpha/categories');

  calls.length = 0;
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ data: [{ id: 'brand-1', name: 'Acme', slug: 'acme' }] }), { status: 200 });
  }) as typeof fetch;
  const brands = await storefrontApi.getBrands('alpha');
  assert.equal((brands[0] as any)?.name, 'Acme');
  assert.equal(calls[0].url, '/api/storefront/alpha/brands');

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
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ data: { id: 'p-1', organization_id: 'org_alpha', name: 'Drill', slug: 'drill', category: 'Power Tools', categorySlug: 'power-tools', brand: 'Acme', brandSlug: 'acme', rating: 4.8, reviewCount: 3, tags: [], images: [], featured: false, compareAtPrice: null, salesCount: 1, variants: [], availableStock: 5, isOutOfStock: false } }), { status: 200 });
  }) as typeof fetch;
  const product = await storefrontApi.getProduct('alpha', 'drill');
  assert.equal(product.slug, 'drill');
  assert.equal(calls[0].url, '/api/storefront/alpha/products/drill');

  calls.length = 0;
  await storefrontApi.validateCart('alpha', [{ variantId: 'v1', quantity: 2 }], 'loc-1');
  assert.equal(calls[0].url, '/api/storefront/alpha/cart/validate');
  assert.equal(calls[0].init?.method, 'POST');
  assert.match(String(calls[0].init?.body), /"variantId":"v1"/);
  assert.match(String(calls[0].init?.body), /"fulfillmentLocationId":"loc-1"/);

  calls.length = 0;
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ data: { id: 'ord-1', order_number: 'ORD-1001', status: 'Stock Reserved' } }), { status: 201 });
  }) as typeof fetch;
  await storefrontApi.placeOrder('alpha', {
    customer: { name: 'Guest Buyer', email: 'guest@example.com', phone: '123' },
    fulfillmentMethod: 'Standard Delivery',
    paymentMethod: 'Credit Card',
    cart_items: [{ variantId: 'v1', quantity: '2' }],
    idempotency_key: '123e4567-e89b-12d3-a456-426614174000',
  });
  assert.equal(calls[0].url, '/api/storefront/alpha/orders');
  assert.equal(calls[0].init?.method, 'POST');
  const orderBody = JSON.parse(String(calls[0].init?.body));
  assert.equal(orderBody.cart_items[0].variantId, 'v1');
  assert.equal(orderBody.cart_items[0].quantity, '2');
  assert.equal(Object.prototype.hasOwnProperty.call(orderBody.cart_items[0], 'price'), false);

  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: { code: 'TENANT_NOT_FOUND', message: 'Store Not Found' },
  }), { status: 404, headers: { 'content-type': 'application/json' } })) as typeof fetch;

  await assert.rejects(
    () => storefrontApi.getContext('missing'),
    (error: unknown) => error instanceof StorefrontApiError
      && error.status === 404
      && error.code === 'TENANT_NOT_FOUND',
  );

  console.log('Storefront API client contract: PASS (authoritative checkout payload verified)');
} finally {
  globalThis.fetch = originalFetch;
}
