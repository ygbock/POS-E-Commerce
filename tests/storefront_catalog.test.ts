import assert from 'node:assert/strict';
import { filterStorefrontProducts, sortStorefrontProducts } from '../src/components/storefront/storefrontCatalog';
import type { Product } from '../src/types';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'p-1',
  name: 'Cordless Drill',
  slug: 'cordless-drill',
  status: 'active',
  category: 'Tools',
  brand: 'AbaCha',
  tags: ['power', 'hardware'],
  rating: 4.8,
  salesCount: 100,
  featured: true,
  compareAtPrice: 150,
  variants: [{ id: 'v-1', retailPrice: 100, compareAtPrice: 150 } as Product['variants'][number]],
  ...overrides,
} as Product);

const products = [
  product(),
  product({
    id: 'p-2',
    name: 'Kitchen Blender',
    slug: 'kitchen-blender',
    category: 'Kitchen',
    brand: 'HomeCo',
    tags: ['appliance'],
    rating: 4.2,
    salesCount: 40,
    featured: false,
    compareAtPrice: null,
    variants: [{ id: 'v-2', retailPrice: 80, compareAtPrice: null } as Product['variants'][number]],
  }),
  product({
    id: 'p-3',
    name: 'Safety Gloves',
    slug: 'safety-gloves',
    category: 'Tools',
    brand: 'AbaCha',
    tags: ['safety'],
    rating: 4.5,
    salesCount: 70,
    featured: false,
    variants: [{ id: 'v-3', retailPrice: 25, compareAtPrice: 25 } as Product['variants'][number]],
  }),
];

const stock: Record<string, number> = { 'v-1': 12, 'v-2': 0, 'v-3': 4 };
const getStock = (variant?: Product['variants'][number]) => stock[variant?.id || ''] ?? 0;

assert.equal(filterStorefrontProducts(products, {
  category: 'All', brand: 'All', searchQuery: 'drill',
  minPrice: 0, maxPrice: 1000, inStockOnly: false, onSaleOnly: false, minRating: 0,
}, getStock).map(p => p.id).join(','), 'p-1');

assert.deepEqual(filterStorefrontProducts(products, {
  category: 'Tools', brand: 'AbaCha', searchQuery: '',
  minPrice: 20, maxPrice: 120, inStockOnly: true, onSaleOnly: false, minRating: 4.5,
}, getStock).map(p => p.id), ['p-1', 'p-3']);

assert.deepEqual(filterStorefrontProducts(products, {
  category: 'All', brand: 'All', searchQuery: '',
  minPrice: 0, maxPrice: 1000, inStockOnly: false, onSaleOnly: true, minRating: 0,
}, getStock).map(p => p.id), ['p-1']);

assert.deepEqual(filterStorefrontProducts(products, {
  category: 'All', brand: 'All', searchQuery: '',
  minPrice: 0, maxPrice: 1000, inStockOnly: true, onSaleOnly: false, minRating: 0,
}, getStock).map(p => p.id), ['p-1', 'p-3']);

const original = [...products];
assert.deepEqual(sortStorefrontProducts(products, 'price-low').map(p => p.id), ['p-3', 'p-2', 'p-1']);
assert.deepEqual(sortStorefrontProducts(products, 'price-high').map(p => p.id), ['p-1', 'p-2', 'p-3']);
assert.deepEqual(sortStorefrontProducts(products, 'best-sellers').map(p => p.id), ['p-1', 'p-3', 'p-2']);
assert.deepEqual(products, original);

console.log('Storefront catalog logic contract: 7 passed, 0 failed');
