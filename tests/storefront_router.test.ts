import assert from 'node:assert/strict';
import { buildStorefrontPath, parseStorefrontRoute } from '../src/router/StorefrontRouter';

const cases = [
  ['/', { name: 'home' }],
  ['/shop', { name: 'shop' }],
  ['/shop/category/power-tools', { name: 'category', slug: 'power-tools' }],
  ['/shop/brand/acme', { name: 'brand', slug: 'acme' }],
  ['/search?q=drill', { name: 'search', query: 'drill' }],
  ['/product/cordless-drill', { name: 'product', slug: 'cordless-drill' }],
  ['/cart', { name: 'cart' }],
  ['/checkout', { name: 'checkout' }],
  ['/account', { name: 'account' }],
  ['/order/ORD-1001', { name: 'order', orderNumber: 'ORD-1001' }],
  ['/store/alpha/shop', { name: 'shop', tenantSlug: 'alpha' }],
  ['/store/alpha/product/hammer', { name: 'product', tenantSlug: 'alpha', slug: 'hammer' }],
] as const;

for (const [path, expected] of cases) {
  const url = new URL(path, 'https://shop.abacha.com');
  assert.deepEqual(parseStorefrontRoute(url.pathname, url.search), expected, path);
}

assert.deepEqual(parseStorefrontRoute('/unknown/path', ''), { name: 'not-found' });
assert.deepEqual(parseStorefrontRoute('/store/alpha/unknown', ''), { name: 'not-found', tenantSlug: 'alpha' });

assert.equal(buildStorefrontPath({ name: 'home' }), '/');
assert.equal(buildStorefrontPath({ name: 'shop', tenantSlug: 'alpha' }), '/store/alpha/shop');
assert.equal(buildStorefrontPath({ name: 'category', tenantSlug: 'alpha', slug: 'power tools' }), '/store/alpha/shop/category/power%20tools');
assert.equal(buildStorefrontPath({ name: 'search', query: 'cordless drill' }), '/search?q=cordless%20drill');
assert.equal(buildStorefrontPath({ name: 'product', slug: 'x/y' }), '/product/x%2Fy');
assert.equal(buildStorefrontPath({ name: 'order', tenantSlug: 'alpha', orderNumber: 'ORD/1' }), '/store/alpha/order/ORD%2F1');

console.log('Storefront router contract: 18 passed, 0 failed');
