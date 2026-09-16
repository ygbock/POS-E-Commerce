# Implementation Plan: Multi-Tenant Modern Storefront (UX-001A)

> **Document Version**: 1.0.0  
> **Status**: READY FOR SUPERVISOR REVIEW  
> **Parent Program**: `VERSION-2.6-UPGRADE` (`2.6.0-development`)  
> **Branch**: `upgrade/v2.6/upg-001-platform-hardening`  
> **Target Standard**: Incremental, Safe, Non-Breaking, Server-Authoritative  

---

## 1. Plan Overview & Objectives

This implementation plan details the execution steps for **UX-001A (Multi-Tenant Modern Storefront)**.

### Primary Objectives:
1. Transition storefront data flow from client memory / `localStorage` to server-authoritative tenant-scoped APIs.
2. Introduce multi-tenant public storefront resolution via custom domain, subdomain, path slug, or fallback default.
3. Replace single-state React modal navigation with a native, zero-dependency URL-based router supporting deep links and browser history.
4. Decompose monolithic components ([ProductDetailModal.tsx](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/src/components/storefront/ProductDetailModal.tsx), [CustomerAccountModal.tsx](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/src/components/storefront/CustomerAccountModal.tsx), [StoreCheckoutModal.tsx](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/src/components/storefront/StoreCheckoutModal.tsx)) into modular, maintainable domain primitives.
5. Eliminate all hardcoded commercial promises, dynamic pricing, and stock calculations in the client.
6. Achieve WCAG 2.2 AA compliance across desktop, laptop, tablet, and mobile breakpoints ($375\text{px}$–$1440\text{px}+$ with minimum $44\times 44\text{px}$ touch targets).

---

## 2. Phased Implementation Roadmap

```text
Phase 1: Database Migration & Schema Expansion
   │
   ▼
Phase 2: Server-Side Storefront API Routes & Tenant Resolvers
   │
   ▼
Phase 3: Frontend Storefront Context & URL-Based Router Shell
   │
   ▼
Phase 4: Modular Storefront Components & Decomposed Views
   │
   ▼
Phase 5: Server-Authoritative Cart, Checkout & Order Tracking
   │
   ▼
Phase 6: Accessibility, Responsive Polish & Automated Test Suite
```

---

## 3. Detailed Phase Breakdown & File Modifications

### Phase 1: Database Migration & Schema Expansion

### Phase 1: Database Migration & Schema Expansion

#### 1.1 Create Migration `011_storefront_tenant_config.sql`
- **File**: `server/db/migrations/011_storefront_tenant_config.sql`
- **Action**: Add columns `slug VARCHAR(64) UNIQUE`, `custom_domain VARCHAR(255) UNIQUE`, and `NOT NULL` columns with structured defaults: `currency_code VARCHAR(16) NOT NULL DEFAULT 'USD'`, `currency_symbol VARCHAR(8) NOT NULL DEFAULT '$'`, `locale VARCHAR(16) NOT NULL DEFAULT 'en-US'`, `timezone VARCHAR(64) NOT NULL DEFAULT 'UTC'`, `branding JSONB NOT NULL DEFAULT ...`, `policies JSONB NOT NULL DEFAULT ...`, `catalog_policy JSONB NOT NULL DEFAULT ...`, and `feature_flags JSONB NOT NULL DEFAULT ...` to `organizations` table.
- **Data Integrity**: Columns are `NOT NULL DEFAULT ...` (not nullable), ensuring every organization row possesses deterministic configuration. Migration initializes `'org_default'` with slug `'default'`.

#### 1.2 Update Database Client & Migrator
- **Files**: `server/db/migrator.ts`, `server/db/seeds/001_demo_seed.sql`
- **Action**: Register migration 011; enrich demo seed data with multi-tenant storefront attributes for testing (`org_store_alpha` with slug `'alpha'` and `org_store_beta` with slug `'beta'`).

---

### Phase 2: Server-Side Storefront API Routes & Tenant Resolvers

#### 2.1 Public Fail-Closed Tenant Resolver & Environment-Gated Overrides
- **File**: `server/services/tenantResolver.ts`
- **Action**: Implement `resolveStorefrontTenant(req: Request, db: DatabaseClient): Promise<TenantStorefrontConfig>`:
  1. **Strict Fail-Closed Enforcement**:
     - Unknown tenant slug -> HTTP 404 `TENANT_NOT_FOUND` ("Store Not Found"). Never fall back to `org_default`.
     - Inactive tenant -> HTTP 404 `TENANT_INACTIVE` ("Store Unavailable").
     - Unknown custom domain -> HTTP 404 `DOMAIN_NOT_FOUND`.
     - Mismatched host/path tenant -> HTTP 400 `TENANT_MISMATCH`.
     - Invalid slug characters -> HTTP 400 `INVALID_TENANT_IDENTIFIER`.
  2. **Canonical Default Entry Point**:
     - Default tenant resolution (`org_default`) is permitted **strictly and exclusively** when the incoming request hits the configured canonical storefront entry point (e.g. `APP_URL`, `shop.abacha.com`) with **no slug, custom domain, or subdomain specified**.
  3. **Environment-Gated Query Parameter Override (`?tenant=` / `?store=`)**:
     - `NODE_ENV=development` -> Query override permitted.
     - `NODE_ENV=test` -> Query override permitted.
     - `NODE_ENV=staging` -> Disabled unless `ALLOW_STAGING_TENANT_QUERY_OVERRIDE=true`.
     - `NODE_ENV=production` -> Strictly disabled. Untrusted production query parameters cannot switch tenants.
  4. **Tenant vs. Location Separation**:
     - Respects the 3-tier hierarchy: `organization (tenant) -> store/branch -> warehouse/location`.
     - Catalog availability aggregates across tenant fulfillment locations; pickup availability resolves strictly against the customer's selected retail store location.

#### 2.2 Storefront Endpoints in `server.ts`
- **Files**: `server.ts`, `server/routes/storefrontRoutes.ts`
- **Action**: Implement dedicated, rate-limited public storefront router:
  - `GET /api/storefront/:tenantSlug/context`: Delivers isolated branding, policies, currencies, and feature flags.
  - `GET /api/storefront/:tenantSlug/products`: Delivers server-paginated, server-filtered catalog products strictly scoped to the tenant.
  - `GET /api/storefront/:tenantSlug/products/:slugOrId`: Delivers full product details, variant matrix, specifications, and live inventory.
  - `GET /api/storefront/:tenantSlug/categories`: Delivers tenant categories.
  - `GET /api/storefront/:tenantSlug/brands`: Delivers tenant brands.
  - `POST /api/storefront/:tenantSlug/cart/validate`: Validates cart items, verifies stock availability, returns calculated totals and policy-derived shipping fees.

---

### Phase 3: Frontend Storefront Context & URL Router Shell

#### 3.1 Lightweight Native History Router
- **File**: `src/router/StorefrontRouter.ts` & `src/router/useStorefrontRoute.ts`
- **Action**: Implement a lightweight HTML5 History API router:
  - Listens to `popstate` events.
  - Parses route patterns (`/`, `/shop`, `/shop/category/:slug`, `/shop/brand/:slug`, `/search`, `/product/:slug`, `/cart`, `/checkout`, `/account`, `/order/:orderNumber`).
  - Supports `/store/:tenantSlug/...` prefix for explicit multi-tenancy.
  - Manages programmatic navigation (`navigate('/shop')`) with browser history and scroll-to-top preservation.

#### 3.2 Dedicated `StorefrontContext.tsx`
- **File**: `src/context/StorefrontContext.tsx`
- **Action**: Decouple storefront from `CommerceContext.tsx`. Manages:
  - Active tenant configuration (`branding`, `policies`, `currency`, `featureFlags`).
  - Cached cart tokens (`[{ variantId, quantity }]`) in tenant-scoped localStorage.
  - Wishlist item IDs.
  - Currency formatting helper bound to tenant's authoritative currency code and symbol.

---

### Phase 4: Modular Storefront Components & Decomposed Views

#### 4.1 Modern Header & Navigation
- **File**: `src/components/storefront/StorefrontHeader.tsx`
- **Action**: Replace [StoreHeader.tsx](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/src/components/storefront/StoreHeader.tsx).
  - Dynamic tenant logo and store title.
  - Top announcement bar displays tenant's dynamic policies (e.g. "Free shipping over " + formatted threshold) instead of hardcoded claims.
  - Search bar with debounced server autocomplete suggestions.
  - Active route navigation links with accessible indicators.

#### 4.2 Modern Hero & Homepage Showcase
- **Files**: `src/components/storefront/home/StorefrontHero.tsx`, `src/components/storefront/home/CategoryGrid.tsx`, `src/components/storefront/home/FeaturedSection.tsx`
- **Action**: Replace [StoreHeroBanner.tsx](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/src/components/storefront/StoreHeroBanner.tsx), [CategoryShowcase.tsx](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/src/components/storefront/CategoryShowcase.tsx), and [BrandShowcase.tsx](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/src/components/storefront/BrandShowcase.tsx).
  - Configurable hero banner using tenant branding.
  - Database-driven category tiles with active product counts.
  - Server-curated featured products and best-sellers grids.

#### 4.3 Full-Page Product Detail View
- **Files**: `src/components/storefront/product/ProductDetailPage.tsx`, `ProductGallery.tsx`, `ProductInfo.tsx`, `VariantSelector.tsx`, `ProductReviewsSection.tsx`
- **Action**: Decompose [ProductDetailModal.tsx](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/src/components/storefront/ProductDetailModal.tsx) into a dedicated full-page route `/product/:slug`:
  - Image gallery with zoom and mobile swipe.
  - Variant selectors updating URL query and variant stock.
  - Server-calculated shipping and delivery estimates based on tenant cutoff time.
  - Verified customer reviews section.
  - Related products slider.

#### 4.4 Catalog & Faceted Search Page
- **Files**: `src/components/storefront/catalog/ProductCatalogPage.tsx`, `ProductFilterSidebar.tsx`, `ProductSortSelect.tsx`
- **Action**: Server-side faceted filtering:
  - Price slider bound to server query params.
  - Category and Brand checkboxes triggering debounced server queries.
  - Server pagination with "Load More" or page number controls.
  - Skeleton loading states during fetch transitions.

---

### Phase 5: Server-Authoritative Cart, Checkout & Customer Portal

#### 5.1 Slide-Over Cart Drawer & Dedicated Cart Page
- **Files**: `src/components/storefront/cart/StoreCartDrawer.tsx`, `CartPage.tsx`
- **Action**: Cart calls `POST /api/storefront/:tenantSlug/cart/validate` to verify prices and stock before allowing checkout. Free shipping progress bar bound to tenant's authoritative `freeShippingThreshold`.

#### 5.2 Server-Authoritative Checkout Experience
- **File**: `src/components/storefront/checkout/StorefrontCheckout.tsx`
- **Action**: Dedicated multi-step checkout route (`/checkout`):
  - Guest and Customer Account flows.
  - Delivery address validation.
  - Delivery method selection (Standard, Express, In-Store Pickup).
  - Payment method options matching tenant configuration.
  - Dispatches `POST /api/orders` with unique `idempotency_key`.

#### 5.3 Customer Portal & Order Tracking
- **Files**: `src/components/storefront/account/CustomerAccountPage.tsx`, `OrderTrackingPage.tsx`
- **Action**: Dedicated route `/order/:orderNumber` displaying live order progress, fulfillment timeline, and tracking details retrieved from server.

---

### Phase 6: Accessibility, Responsive Polish & Automated Test Suite

#### 6.1 WCAG 2.2 AA Compliance Audit & Verification
- Verify all interactive controls have minimum $44\times 44\text{px}$ touch targets.
- Verify focus containment on all drawers and dialogs.
- Verify screen reader announcements for live filter updates and cart additions.
- Test keyboard navigation across all storefront routes without mouse input.

#### 6.2 Automated Test Suite Expansion
- **File**: `tests/storefront_multi_tenant.test.ts`
- Implement automated test scenarios covering:
  - Cross-tenant product isolation (Tenant A cannot see Tenant B's products).
  - Cross-tenant pricing and inventory isolation.
  - Cross-tenant order placement prevention.
  - Public tenant context resolution by slug and fallback.
  - Dynamic policy evaluation (free shipping calculation).
  - Server cart validation with stock changes.
  - URL routing state changes and back-navigation.

---

## 4. Risk Analysis & Mitigation Strategies

| Risk ID | Identified Risk | Severity | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **RSK-UX-01** | Breaking existing POS and Admin workflows when modifying shared data stores | High | Decouple storefront into `StorefrontContext`; preserve all existing `CommerceContext` contracts for POS and Back-Office until subsequent tasks. |
| **RSK-UX-02** | Deep linking failing on full-page reload in production (HTTP 404) | Medium | Verify that Express server `app.get('*', ...)` correctly serves `index.html` for all non-API paths, enabling client-side SPA routing. (Already present at `server.ts:1785`). |
| **RSK-UX-03** | Performance degradation during high-concurrency catalog queries | Medium | Utilize database indexes on `(organization_id, status)`, `(organization_id, slug)`, and `(organization_id, category_id)`. Implement pagination with `LIMIT 24`. |
| **RSK-UX-04** | Stale inventory in client cart leading to checkout failures | Low | Run pre-checkout cart validation via `POST /cart/validate` immediately before rendering final payment button, alerting user to stock adjustments. |

---

## 5. Rollback & Contingency Protocol

1. **Non-Destructive Forward Migration**:
   - Migration 011 uses `ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT ...` without dropping or renaming columns.
   - Older server revisions ignore the added columns safely.
   - **Destructive column removal (`DROP COLUMN`) is prohibited**: Dropping columns in multi-tenant production permanently destroys customer branding, domains, and custom policies. Rollbacks revert application code only.
2. **Feature Branch Isolation**:
   - All development is strictly confined to `upgrade/v2.6/upg-001-platform-hardening`.
   - The production release (`main`) and approved baseline (`9ae4b7528aecd195a9167e1b2a060513cbf83223`) remain untouched.
3. **Fail-Closed Resolution (No Silent Fallbacks)**:
   - If an explicit tenant identifier (slug, custom domain, or query parameter) is invalid, inactive, or unknown, the resolver strictly fails closed with HTTP 404 / 403.
   - It **NEVER** silently degrades to `org_default`, preventing false brand claims, incorrect currencies, and data leaks.

