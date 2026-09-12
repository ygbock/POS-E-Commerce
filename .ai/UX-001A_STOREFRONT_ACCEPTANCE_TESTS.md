# Acceptance Test Specifications: Multi-Tenant Modern Storefront (UX-001A)

> **Document Version**: 1.0.0  
> **Status**: READY FOR SUPERVISOR REVIEW  
> **Parent Program**: `VERSION-2.6-UPGRADE` (`2.6.0-development`)  
> **Branch**: `upgrade/v2.6/upg-001-platform-hardening`  
> **Verification Gate**: Phase 12 Mandatory Acceptance Criteria  

---

## 1. Test Strategy & Scope

This document specifies the verification criteria, test assertions, and test suites for **UX-001A**. All 14 acceptance criteria mandated by the project supervisor are mapped to deterministic automated and manual test cases.

---

## 2. Acceptance Criteria Matrix & Verification Suites

| # | Acceptance Criterion | Verification Method | Automated Test Suite | Expected Result |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Tenant A cannot see Tenant B's products** | Automated Integration Test | `tests/storefront_multi_tenant.test.ts` (Test 1) | Requesting `/api/storefront/tenant-a/products` returns 0 products belonging to `tenant-b`. |
| **2** | **Tenant A cannot see Tenant B's pricing** | Automated Integration Test | `tests/storefront_multi_tenant.test.ts` (Test 2) | Prices returned by Tenant A's catalog endpoints strictly reflect Tenant A's database records. |
| **3** | **Tenant A cannot see Tenant B's inventory availability** | Automated Integration Test | `tests/storefront_multi_tenant.test.ts` (Test 3) | Inventory balance queries only aggregate balances where `organization_id = tenant_a`. |
| **4** | **Tenant A cannot create a Tenant B order** | Automated Integration Test | `tests/storefront_multi_tenant.test.ts` (Test 4) | Submitting an order to Tenant A containing a Tenant B variant ID fails closed with HTTP 404/400 `PRODUCT_NOT_FOUND`. |
| **5** | **Public storefront requests resolve to the correct tenant** | Automated Integration Test | `tests/storefront_multi_tenant.test.ts` (Test 5) | Calling `/api/storefront/:tenantSlug/context` resolves by slug, custom host header, query parameter, or default fallback. |
| **6** | **Tenant branding is isolated** | Automated Integration Test | `tests/storefront_multi_tenant.test.ts` (Test 6) | Tenant A context returns Tenant A's store name, logo, colors, and trust badges; Tenant B returns its own distinct branding. |
| **7** | **Currency configuration is isolated** | Automated Integration Test | `tests/storefront_multi_tenant.test.ts` (Test 7) | Tenant A formatted prices display Tenant A currency symbol (e.g. `$` USD); Tenant B displays its configured currency (e.g. `Le` SLE or `€` EUR). |
| **8** | **Policies are tenant-aware** | Automated Integration Test | `tests/storefront_multi_tenant.test.ts` (Test 8) | Free shipping thresholds, warranty text, and return policies evaluate strictly against the resolved tenant's `policies` JSON. |
| **9** | **Product URLs are directly navigable** | Automated Integration + Browser Subagent | `tests/storefront_multi_tenant.test.ts` (Test 9) | Direct HTTP GET to `/product/:slug` loads the specific product's view without requiring client modal triggers. |
| **10** | **Cart and checkout use server-authoritative APIs** | Automated Integration Test | `tests/storefront_multi_tenant.test.ts` (Test 10) | `POST /cart/validate` recalculates prices and taxes from the database; client-supplied line prices are rejected/ignored. |
| **11** | **Browser localStorage is not the source of truth** | Automated Code Audit + Unit Test | `tests/storefront_multi_tenant.test.ts` (Test 11) | Clearing `localStorage` does not break catalog browsing; no product catalog arrays are stored in `window.localStorage`. |
| **12** | **Responsive behavior works across breakpoints** | Browser Verification & Visual Testing | Responsive Suite ($375\text{px}$, $768\text{px}$, $1024\text{px}$, $1440\text{px}$) | Layouts render with zero horizontal overflow; touch targets meet $\ge 44\times 44\text{px}$. |
| **13** | **Accessibility checks pass (WCAG 2.2 AA)** | Axe-Core / Manual Audit | Accessibility Verification | Valid ARIA roles, accessible names on icon buttons, focus traps in drawers/modals, contrast ratio $\ge 4.5:1$. |
| **14** | **Full regression suite remains green** | CI Automated Test Suite | `npm test`, `npm run test:operational`, `npm run test:prod-gate` | 100% of existing tests pass (186/186 regression, 26/26 operational, 9/9 prod-gate). |

---

## 3. Concrete Test Case Specifications

### Test Suite: `tests/storefront_multi_tenant.test.ts`

#### Case 1: Cross-Tenant Product Isolation
```typescript
// GIVEN two organizations with separate product catalogs
const res = await request(app).get('/api/storefront/store-alpha/products');
assert.strictEqual(res.status, 200);
assert(res.body.data.every((p: any) => p.organization_id === 'org_store_alpha'));
assert(!res.body.data.some((p: any) => p.organization_id === 'org_store_beta'));
```

#### Case 2: Cross-Tenant Price Isolation
```typescript
// GIVEN product 'SKU-HEADPHONES' exists in Tenant Alpha ($199.99) and Tenant Beta ($149.99)
const resAlpha = await request(app).get('/api/storefront/store-alpha/products/sku-headphones');
const resBeta = await request(app).get('/api/storefront/store-beta/products/sku-headphones');
assert.strictEqual(resAlpha.body.data.primaryVariant.retail_price, '199.99');
assert.strictEqual(resBeta.body.data.primaryVariant.retail_price, '149.99');
```

#### Case 3: Cross-Tenant Inventory Availability
```typescript
// GIVEN Tenant Alpha has 15 units available and Tenant Beta has 0 units
const resAlpha = await request(app).get('/api/storefront/store-alpha/products/item-123');
const resBeta = await request(app).get('/api/storefront/store-beta/products/item-123');
assert.strictEqual(resAlpha.body.data.availableStock, 15);
assert.strictEqual(resBeta.body.data.availableStock, 0);
assert.strictEqual(resBeta.body.data.isOutOfStock, true);
```

#### Case 4: Cross-Tenant Order Injection Prevention
```typescript
// GIVEN a cart submitted to Tenant Alpha containing a variant owned by Tenant Beta
const payload = {
  cart_items: [{ variant_id: 'var_beta_exclusive', quantity: '1' }],
  fulfillmentMethod: 'Standard Delivery',
  paymentMethod: 'Credit Card',
  idempotency_key: crypto.randomUUID()
};
const res = await request(app)
  .post('/api/storefront/store-alpha/orders')
  .send(payload);
assert.strictEqual(res.status, 404);
assert.strictEqual(res.body.error.code, 'PRODUCT_NOT_FOUND');
```

#### Case 5: Public Tenant Resolution
```typescript
// Test 5A: Path slug resolution
const res1 = await request(app).get('/api/storefront/alpha/context');
assert.strictEqual(res1.body.data.tenant.id, 'org_store_alpha');

// Test 5B: Hostname resolution
const res2 = await request(app)
  .get('/api/storefront/auto/context')
  .set('Host', 'beta.abacha.test');
assert.strictEqual(res2.body.data.tenant.id, 'org_store_beta');

// Test 5C: Default fallback
const res3 = await request(app).get('/api/storefront/default/context');
assert.strictEqual(res3.body.data.tenant.id, 'org_default');
```

#### Case 6: Policy & Dynamic Shipping Threshold Evaluation
```typescript
// GIVEN Tenant Alpha has freeShippingThreshold = 75.00
// Cart A: $50.00 subtotal -> shipping fee = $9.99
const cartA = await request(app)
  .post('/api/storefront/store-alpha/cart/validate')
  .send({ items: [{ variantId: 'var_50_dollar', quantity: 1 }] });
assert.strictEqual(cartA.body.data.shippingFee, '9.99');

// Cart B: $80.00 subtotal -> shipping fee = $0.00
const cartB = await request(app)
  .post('/api/storefront/store-alpha/cart/validate')
  .send({ items: [{ variantId: 'var_80_dollar', quantity: 1 }] });
assert.strictEqual(cartB.body.data.shippingFee, '0.00');
```

#### Case 7: LocalStorage Independence Verification
```typescript
// Verification in browser / test harness:
// Clear window.localStorage completely
window.localStorage.clear();
// Trigger catalog load
// Verify request dispatches to server and populates UI without relying on localStorage cache
assert.strictEqual(window.localStorage.getItem('abacha_commerce_db_v1_products'), null);
```

---

### Additional Mandated Supervisor Tests (Tests A through E)

#### Case A: Unknown Tenant Does Not Fall Back to Another Tenant
```typescript
// Requesting an unknown tenant slug must return 404 and NEVER fall back to org_default
const res = await request(app).get('/api/storefront/unknown-tenant-xyz/context');
assert.strictEqual(res.status, 404);
assert.strictEqual(res.body.error.code, 'TENANT_NOT_FOUND');
assert.strictEqual(res.body.data, undefined);

// Similarly for unknown custom domain:
const resDomain = await request(app)
  .get('/api/storefront/auto/context')
  .set('Host', 'unregistered-domain.com');
assert.strictEqual(resDomain.status, 404);
assert.strictEqual(resDomain.body.error.code, 'DOMAIN_NOT_FOUND');
```

#### Case B: Inactive Tenant Returns 404 / Store Unavailable
```typescript
// GIVEN an organization with is_active = false
const res = await request(app).get('/api/storefront/inactive-tenant/context');
assert.strictEqual(res.status, 404);
assert.strictEqual(res.body.error.code, 'TENANT_INACTIVE');
assert.strictEqual(res.body.error.message, 'Store is temporarily unavailable.');
```

#### Case C: Production Query Override Cannot Switch Tenant
```typescript
// When DEPLOY_ENV=production or NODE_ENV=production, query parameters MUST NOT switch tenant
// Even if ?tenant=org_store_beta is supplied, the host/domain binding is authoritative
const prevEnv = process.env.NODE_ENV;
try {
  process.env.NODE_ENV = 'production';
  const res = await request(app)
    .get('/api/storefront/alpha/context?tenant=beta')
    .set('Host', 'alpha.abacha.test');
  // Tenant must remain alpha, query parameter 'beta' is strictly ignored
  assert.strictEqual(res.body.data.tenant.slug, 'alpha');
  assert.notStrictEqual(res.body.data.tenant.slug, 'beta');
} finally {
  process.env.NODE_ENV = prevEnv;
}
```

#### Case D: Canonical Default Storefront Works Only at Canonical Entry Point
```typescript
// Canonical entry point (e.g. root without slug or subdomain on primary domain):
const resCanonical = await request(app)
  .get('/api/storefront/default/context')
  .set('Host', 'localhost:3000');
assert.strictEqual(resCanonical.status, 200);
assert.strictEqual(resCanonical.body.data.tenant.id, 'org_default');

// But an unknown subdomain on the primary domain FAILS CLOSED:
const resSubdomain = await request(app)
  .get('/api/storefront/auto/context')
  .set('Host', 'unknown-store.abacha.test');
assert.strictEqual(resSubdomain.status, 404);
assert.strictEqual(resSubdomain.body.error.code, 'DOMAIN_NOT_FOUND');

// And an unknown path slug FAILS CLOSED:
const resUnknownPath = await request(app).get('/api/storefront/store-does-not-exist/context');
assert.strictEqual(resUnknownPath.status, 404);
assert.strictEqual(resUnknownPath.body.error.code, 'TENANT_NOT_FOUND');
```

#### Case E: Tenant and Location Remain Separate Concepts
```typescript
// Verification that organization (tenant) owns master catalog & policies,
// while locations (stores/branches/warehouses) hold distinct physical inventory balances.
// 1. Query tenant pickup locations
const resLocations = await request(app).get('/api/storefront/alpha/locations');
assert.strictEqual(resLocations.status, 200);
assert(resLocations.body.data.length >= 2);

// 2. Location A has 10 units of variant 1; Location B has 0 units of variant 1
const cartLocationA = await request(app)
  .post('/api/storefront/alpha/cart/validate')
  .send({
    items: [{ variantId: 'var_alpha_multi_loc', quantity: 5 }],
    fulfillmentLocationId: resLocations.body.data[0].id
  });
assert.strictEqual(cartLocationA.body.data.items[0].isAvailable, true);

const cartLocationB = await request(app)
  .post('/api/storefront/alpha/cart/validate')
  .send({
    items: [{ variantId: 'var_alpha_multi_loc', quantity: 5 }],
    fulfillmentLocationId: resLocations.body.data[1].id
  });
// In Location B, stock is insufficient
assert.strictEqual(cartLocationB.body.data.items[0].isAvailable, false);
```

## 4. Accessibility (WCAG 2.2 AA) Verification Protocol

1. **Keyboard Navigability**:
   - Tab order moves logically: Skip Link → Header Navigation → Search Bar → Facet Filters → Product Cards → Pagination → Footer.
   - Modals and drawers trap focus; pressing `Escape` closes the active overlay and restores focus to the trigger button.
2. **Accessible Labels**:
   - Every `<input>` has an associated `<label>` or `aria-label`.
   - All icon-only interactive elements (cart button, wishlist button, close buttons) possess explicit `aria-label` attributes.
3. **Contrast Verification**:
   - Background-to-foreground contrast checked using automated color contrast analyzers.
   - Text color meets 4.5:1 ratio across slate/white backgrounds.
4. **Reduced Motion**:
   - When `prefers-reduced-motion: reduce` is active, hero carousel sliding, drawer animations, and hover transitions are disabled or set to 0s duration.

---

## 5. Responsive Breakpoint Testing Checklist

- [ ] **Mobile ($375\text{px}$–$767\text{px}$)**:
  - Header displays logo, search toggle, cart icon, and hamburger menu.
  - Sticky bottom navigation bar (`MobileBottomNav`) visible with 5 items.
  - Filter drawer opens as a full-screen or 90vh slide-up bottom sheet.
  - Product detail shows sticky bottom bar with "Add to Cart" and price.
  - Zero horizontal page scrolling ($x\text{-overflow} = 0$).
- [ ] **Tablet ($768\text{px}$–$1023\text{px}$)**:
  - 2-column product grid with legible card typography.
  - Filter drawer accessible via slide-over drawer button.
- [ ] **Laptop ($1024\text{px}$–$1439\text{px}$)**:
  - 3-column product grid with persistent left filter column.
  - Top header displays category navigation menu and search bar.
- [ ] **Desktop ($1440\text{px}+$ )**:
  - 4-column product grid with expansive hero banners and maximum layout container width ($1700\text{px}$).
