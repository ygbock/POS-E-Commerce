# AbaCha Discovery — Architecture Audit & Foundation Plan

## Repository findings (2026-09-17)

The current application already has a multi-tenant organization model, authentication/RBAC, product/catalog data, inventory balances by location, orders, POS, and public storefront routing. The existing database uses string IDs (`VARCHAR(64)`), PostgreSQL, and forward-only numbered SQL migrations.

The current migration sequence reaches **019** (`019_password_reset_security.sql`). Migration 001 establishes `organizations`, `locations`, `categories`, `products`, `product_variants`, customers, inventory, orders and payments. Users are organization-scoped and also use `VARCHAR(64)` IDs. Migration 019 adds password-reset security. The migration runner enforces checksums and contains narrow historical compatibility handling for known production revisions of 011/012.

## Architecture decision

Discovery businesses are a platform-level entity independent of a tenant:

```text
Business
├── Discovery profile (always)
├── Locations (always)
├── Categories (always)
├── Services (optional)
├── Reviews / verification (later phases)
└── Organization/Tenant (optional)
    ├── Products
    ├── Inventory
    ├── POS
    ├── Orders
    └── Storefront
```

Two supported business modes:

1. `DISCOVERY_ONLY` — the business is listed and discoverable but has no AbaCha tenant.
2. `DISCOVERY_AND_STORE` — the same business identity is attached to an AbaCha organization/tenant and may expose its storefront, products and commerce capabilities.

A business must not be duplicated when it upgrades to a store.

## Existing infrastructure to reuse

- `organizations` is the existing tenant boundary and should be referenced optionally by Discovery.
- Existing `locations` remain the operational POS/inventory locations for tenants. Discovery locations are intentionally separate because a discovery-only business has no organization and may have service-area/mobile locations.
- Existing `products`, `product_variants`, `categories`, and `inventory_balances` remain the source of truth for commerce data. Discovery should project public product information rather than duplicate operational products.
- Existing authentication and role/permission infrastructure should protect business-management and moderation APIs.
- Existing audit infrastructure should continue to provide cross-platform compliance history; Discovery also records listing lifecycle events for domain-specific history.
- Existing public storefront routing should be linked from a Discovery business only when the business has an active tenant/store.

## Foundation migration

`020_discovery_foundation.sql` introduces:

- `discovery_businesses`
- `discovery_business_categories`
- `discovery_business_category_map`
- `discovery_business_locations`
- `discovery_business_hours`
- `discovery_business_special_hours`
- `discovery_business_settings`
- `discovery_listing_events`

The migration deliberately does **not** create duplicate product/inventory tables, search-engine infrastructure, reviews, or service marketplace tables yet.

## Next implementation slices

### DISC-004 — Business domain
Implement repository/service/controller boundaries for creation and management of discovery businesses.

### DISC-005 — Onboarding
Implement two explicit onboarding choices: `Get Listed` and `Get Listed + Open an AbaCha Store`.

### DISC-006 — Listing lifecycle
Implement server-side state transitions and listing event history. Only approved/published listings can become public.

### DISC-007 — Locations
Implement physical, branch, home-based, mobile and service-area locations plus weekly/special hours.

### DISC-008 — Discovery search foundation
Implement PostgreSQL full-text/trigram search and indexed filters before introducing an external search engine.

### DISC-009 — Commerce projections
Expose public products from existing product/inventory/storefront data without copying operational records.

### DISC-010 — Services
Add service categories, service offerings, availability/pricing and service requests.

### DISC-011 — Public discovery UI
Build `/discover`, unified search, business profile, product and service result experiences.

### DISC-012 — Trust
Implement business verification, claim-business flow, reviews, reports and moderation.

### DISC-013 — Store conversion
Implement transactional Discovery-only → Discovery + Store conversion while preserving `business_id`, slug, locations, reviews and analytics.

### DISC-014 — Analytics and hardening
Implement discovery events, owner analytics, rate limiting, duplicate detection, abuse controls and admin moderation.

## Migration safety

All future Discovery schema changes must use new migration numbers. Previously applied migration files must never be edited in place because the migration runner compares stored checksums with current files.
