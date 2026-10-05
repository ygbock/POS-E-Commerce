# AbaCha Master Completion Roadmap & Gap Analysis

> **Status:** ACTIVE — authoritative completion roadmap
> **Repository:** ygbock/POS-E-Commerce
> **Execution branch:** main
> **Reconciled checkpoint:** 2026-09-27
> **Current HEAD:** `24d2aa29d3a392d6eea0d449aa8ffd2184d64b73`
> **Latest verified CI:** `36339508911` — SUCCESS
>
> This document is the current source of truth for completion sequencing. Older percentage estimates and historical checkpoint statements have been retired from the active assessment because they no longer accurately describe `main`.

## 1. Executive assessment

AbaCha has moved beyond the foundational/prototype stage. The current `main` branch contains a substantial server-authoritative commerce platform covering:

- authentication, RBAC and tenant isolation;
- tenant provisioning and lifecycle management;
- subscriptions, limits and platform billing administration;
- inventory, reservations, transfers and stock integrity;
- POS and checkout;
- storefront routing, catalog and checkout foundations;
- Discovery business onboarding, listing lifecycle and store conversion;
- Discovery search, ranking, attribution and abuse controls;
- claims, reviews, verification and moderation;
- customer Discovery workspaces and service requests;
- audit/security administration;
- extensive automated regression coverage.

The current completion problem is therefore primarily **product-operating completeness and productionization**, not core architectural reconstruction.

### Current strategic state

| Gate | Current state | Assessment |
|---|---|---|
| Gate 0 — Baseline | **COMPLETE** | Main is CI-green; core invariants are protected |
| Gate 1 — Discovery/Search | **SUBSTANTIALLY COMPLETE / FINAL HARDENING** | Core Discovery marketplace and search capabilities are implemented; richer admin UX, public API documentation and representative production-scale verification remain |
| Gate 2 — Merchant Operating System | **CURRENT WORKSTREAM — TASK-MERCHANT-1 IMPLEMENTED; VERIFICATION ACTIVE** | Merchant command center and operational entry points are implemented; broader daily workflow gaps remain |
| Gate 3 — Payments/Financial | **NOT COMPLETE** | Provider integrations, reconciliation, settlement and production verification remain |
| Gate 4 — Reporting/Analytics | **NOT COMPLETE** | A complete server-aggregated reporting layer remains |
| Gate 5 — Communications/Support | **PARTIAL** | Notification/customer communication foundations exist; complete delivery/support operations remain |
| Gate 6 — Integrations | **NOT COMPLETE** | Payment, messaging, hardware and logistics integrations remain |
| Gate 7 — Production Operations | **PARTIAL** | CI/build/security gates are strong; operational recovery/monitoring/backup verification remains |
| Gate 8 — Final Release | **NOT STARTED AS A FINAL GATE** | Requires pilot evidence and all release criteria |

**Important:** these states are evidence-based engineering statuses, not mathematical completion percentages.

---

## 2. Verified current baseline

### 2.1 Current main

Latest commits on `main` include:

- `24d2aa29` — restore onboarding inventory setup statement and complete variant-hardening test correction.
- `d40a144e` — protect referenced product variants from deletion.
- `ec0b1ba8` — add API coverage for variant updates and safe removal.
- `35dd8e02` — preserve variant IDs during product updates.
- `2e80cc88` — tenant-scope variant reference checks.
- `fbdbe841` — safely reconcile removed product variants.
- `884750d4` — allow business owners to record opening stock.
- `8c200127` — use the canonical tenant slug from Discovery store conversion.
- `a0e199ac` / `bac74c05` — cover the Discovery → Store → Catalog → Inventory → Storefront lifecycle.

### 2.2 Latest verified CI

Workflow run: `36339508911`

Verified successful jobs:

- Lint & Build Validation
  - `npm ci`
  - `npm run lint`
  - `npm run build`
  - source-map exposure guard
- Multi-Layer Secret Leakage Scan
- Authoritative Domain Regression Suites
  - Persistence
  - Auth & Security
  - Inventory
  - Transfer
  - POS
  - API Hardening
  - QA
  - UX
  - Checkout
  - Offline POS
  - Production DB Gate
  - Operational Hardening
  - Storefront
  - Storefront API
  - Storefront Router
  - Storefront Catalog
  - Platform Authorization
  - Subscription Foundation
  - Subscription Limits
  - Platform Subscription Management
  - Tenant Provisioning
  - Audit/Security Administration
  - Tenant Business Plane
  - **Full Regression Suite (`npm test`)**

**CI conclusion at this checkpoint: GREEN.**

---

## 3. What is established on main

### A. Platform, security and tenancy

Implemented and regression-covered:

- authentication and protected API boundaries;
- server-authoritative RBAC;
- tenant/business authorization;
- organization isolation;
- tenant provisioning and lifecycle;
- subscription foundation and limits;
- platform subscription management;
- audit/security administration;
- production fail-closed guards;
- migration checksum enforcement;
- security regression coverage;
- platform permission enforcement.

### B. Inventory

Implemented:

- stock balances;
- inventory movements;
- reservations;
- multi-location inventory;
- transfers;
- transactional stock mutation;
- row locking/concurrency safeguards;
- idempotent mutation protections;
- opening-stock onboarding;
- business-owner inventory adjustment authorization;
- inventory readiness integration with Store onboarding.

### C. Catalog/product lifecycle

Implemented and recently hardened:

- product creation;
- product editing persisted to the database;
- variant price persistence;
- new variant insertion during product updates;
- existing variant identity preservation;
- safe removal of unreferenced variants;
- protection of variants with inventory/order/operational history;
- tenant-scoped variant reference checks;
- API-level regression coverage.

Referenced variants are rejected with a domain-level conflict rather than being silently destroyed.

### D. POS and checkout

Established:

- POS sessions;
- cashier workflows;
- server-authoritative checkout;
- order creation;
- payment/tender recording foundations;
- checkout idempotency;
- reservation idempotency;
- canonical replay behavior;
- payload fingerprint conflict protection;
- transaction/savepoint handling;
- offline POS foundations and regression coverage.

### E. Storefront

Established:

- multi-tenant storefront resolution;
- canonical storefront routing;
- storefront API;
- tenant-scoped catalog visibility;
- active/e-commerce catalog enforcement;
- storefront product/category/brand/location APIs;
- server-authoritative checkout;
- order lookup/tracking foundations;
- storefront regression suites.

### F. Discovery

Established:

- Discovery-only business mode;
- Discovery + Store mode;
- business onboarding;
- persisted onboarding drafts and resume;
- governed categories;
- contacts and locations;
- map/location capture;
- listing readiness;
- listing submission/moderation lifecycle;
- Discovery → Store conversion;
- canonical tenant/store provisioning;
- Discovery services/products;
- claims;
- reviews;
- verification;
- moderation;
- customer saved businesses;
- customer contact inquiries;
- customer claim tracking;
- service requests and quotes;
- request status history;
- accepted-quote uniqueness;
- provider matching;
- merchant quote inbox;
- platform moderation workspace;
- merchant trust center.

### G. Discovery search

Established:

- full-text search;
- normalization/tokenization;
- multi-token recall;
- typo tolerance;
- fuzzy ranking;
- aliases and suggestions;
- deterministic pagination;
- candidate limits;
- search analytics;
- zero-result tracking;
- attribution/conversion telemetry;
- server-validated impression/conversion events;
- idempotent attribution events;
- configurable ranking controls;
- bounded public search/suggestion/attribution rate controls;
- isolated performance regression fixture with latency thresholds.

Remaining search work is productization/hardening rather than core search architecture.

### H. Customer Discovery experience

Established:

- search and listing discovery;
- saved/favorite businesses;
- customer workspace shortcuts;
- service request workspace;
- business claim workspace;
- contact inquiry workflow;
- review interactions;
- business profile verification presentation;
- service-request matching and lifecycle;
- map/location experience.

---

# 4. Current gaps and completion gates

## Gate 0 — Baseline freeze

**Status: COMPLETE**

Exit evidence:

- `main` is regression-green;
- lint/build pass;
- secret scan pass;
- domain regression suites pass;
- full `npm test` passes;
- historical migrations remain immutable;
- new schema changes remain forward-only;
- tenant/server-authoritative invariants remain protected.

---

## Gate 1 — Discovery/Search and marketplace completion

**Status: SUBSTANTIALLY COMPLETE / FINAL HARDENING**

### Completed

- Discovery business onboarding;
- Discovery-only and Discovery + Store modes;
- listing lifecycle;
- store conversion;
- category governance;
- location quality/provenance hardening;
- map/location UX;
- claims;
- verification;
- reviews;
- moderation;
- saved businesses;
- contact inquiries;
- service-request lifecycle;
- matching hardening;
- merchant quote workspace;
- customer workspaces;
- search attribution;
- ranking controls;
- abuse controls;
- search performance regression.

### Remaining

1. Merchant alias-management UI.
2. Synonym governance.
3. Rich platform/admin search analytics UI.
4. Rich platform/admin ranking-control UI.
5. Public API documentation.
6. Representative production-scale search/load verification beyond the isolated regression fixture.
7. Final Discovery mobile/product-polish audit.
8. Final moderation UX polish.

### Gate 1 exit criteria

- Search acceptance suite green — **met**.
- No unpublished/private resource leakage — **covered by regression/security suites**.
- Search analytics actionable — **API foundation met; richer admin UI remains**.
- Merchant aliases manageable without SQL — **not fully met**.
- Representative production load evidence — **not fully met**.

Gate 1 should no longer block core merchant workflow implementation; remaining items are controlled hardening/productization work.

---

## Gate 2 — Merchant Operating System

**Status: CURRENT PRIMARY WORKSTREAM**

### Remaining work

#### TASK-MERCHANT-1 — Merchant workspace consolidation

- consolidate merchant dashboard/workspaces;
- unified business/store status;
- clear operational KPIs;
- onboarding/readiness visibility;
- task/action center;
- consistent navigation across Discovery and Store.

#### TASK-MERCHANT-2 — Users, locations, customers and suppliers

**Status: IMPLEMENTED — CI/local validation gate active**

Implemented in this slice:
- Merchant administration workspaces for Users, Locations, Customers/CRM and Suppliers.
- Business-owner command center quick operations now preserves the selected business context when entering each administration workspace.
- Existing server-side tenant-scoped users, locations and customer CRM APIs are exposed through the unified management shell.
- Added a dedicated supplier management UI covering list/create/edit/deactivate workflows.
- Added supplier workspace routing and merchant navigation.
- Merchant-route duplicates now enforce server-side permission checks for customer profiles, users, locations and supplier operations.
- Tenant/business boundaries remain server-authoritative; the browser does not supply organization identity for these operations.
- Regression contract: `tests/merchant_administration.test.ts`, registered as `test:merchant-administration` and included in `npm test`.

Implementation commits:
- `59ecd889` — supplier management workspace.
- `d4682e5c` — administration workspace routing.
- `8bfd1d4a` — supplier navigation.
- `3891686b` — merchant command-center administration quick actions.
- `5043839f` — merchant endpoint permission enforcement.
- `4f0a4e5f` — administration regression contract.
- `69010c7f` — full-regression registration.

Remaining TASK-MERCHANT-2 hardening:
- Run the full merchant administration contract and CI.
- Verify role-specific UI visibility and API denial for under-privileged tenant roles.
- Complete richer supplier detail/purchase-history UX as part of TASK-MERCHANT-3 purchasing and receiving.
- Complete location/user invitation and lifecycle polish where not already covered by existing foundations.

#### TASK-MERCHANT-3 — Purchasing and receiving

- purchase orders;
- supplier orders;
- receiving;
- receiving-to-inventory mutation;
- purchase history;
- supplier balances/records where required.

#### TASK-MERCHANT-4 — Returns, exchanges and shift reconciliation

- sales returns;
- exchanges;
- inventory effects;
- refund linkage;
- POS shift closing;
- cash reconciliation;
- variance handling;
- audit trail.

#### TASK-MERCHANT-5 — Operational alerts and daily workflow

- low-stock alerts;
- order alerts;
- operational exceptions;
- workflow notifications;
- merchant reports entry points;
- storefront management;
- Discovery management;
- settings/security UX.

### Authentication and workspace routing hardening

**Status:** IMPLEMENTED — regression coverage added; CI/local execution remains the validation gate.

Resolved before advancing to TASK-MERCHANT-2:
- Business-owner sign-in from storefront now resolves the authenticated user's assigned business through `GET /api/merchant/me`.
- Inventory/catalog/orders/POS management targets are translated into the tenant management shell with the server-resolved `businessId`.
- Business owners without a requested operational target land on their assigned business workspace rather than the public Discovery landing page.
- Persisted roles are canonicalized through `normalizeRole()` before JWT issuance and frontend role checks.
- Development platform-admin seed credentials now support `ABACHA_PLATFORM_ADMIN_EMAIL` and `ABACHA_PLATFORM_ADMIN_PASSWORD`, with validation/whitespace normalization.
- Development persona credentials are normalized consistently and must resolve to the expected role; a mismatched Platform Admin persona is rejected instead of silently entering the wrong workspace.
- Regression contract: `tests/auth_routing_platform_credentials.test.ts`, registered as `test:auth-routing` and included in `npm test`.
- Implementation commits: `22b7a7d4`, `1034a68b`, `ddb5ba90`, `0586d34c`, `e23b0421`, `7cb0f9c6`, `6b0161f1`.

## TASK-MERCHANT-1 evidence

- Merchant overview API is business-membership scoped and resolves commerce metrics from the server-side organization.
- Merchant command center exposes readiness, operational alerts and direct Catalog/Inventory/Orders/POS actions for Discovery-and-Store businesses.
- Quick operations preserve `businessId` when entering the main tenant workspace.
- Regression contract: `tests/merchant_workspace_consolidation.test.ts`, registered as `test:merchant-workspace` and included in `npm test`.
- Implementation commits: `7a840fd2`, `f9785c38`, `938788e0`, `d14e390c`.

### Gate 2 exit criterion

A pilot merchant must be able to operate daily sales, inventory, purchasing, customers, returns and shift/cash workflows **without developer or database intervention**.

---

## Gate 3 — Payments and financial operations

**Status: NOT COMPLETE**

Remaining:

- provider adapter contract;
- real payment provider integrations;
- cryptographic webhook verification;
- provider-event idempotency;
- payment status reconciliation;
- failed/expired payment handling;
- full/partial refunds;
- chargeback/dispute lifecycle where applicable;
- merchant settlement;
- marketplace commissions/fees where required;
- payouts;
- reconciliation reports;
- production sandbox/live verification.

### Gate 3 exit criteria

- provider-verified server-authoritative payment state;
- duplicate provider events are harmless;
- refunds are auditable;
- settlement is auditable;
- reconciliation is repeatable;
- production provider verification is complete.

---

## Gate 4 — Reporting and analytics

**Status: NOT COMPLETE**

Build the server-aggregated reporting layer:

- sales summary;
- gross margin;
- product performance;
- inventory valuation;
- inventory turnover;
- stock ageing;
- purchase/vendor reports;
- POS shift/cash reconciliation;
- customer metrics;
- Discovery/search metrics;
- exports;
- date/timezone correctness;
- tenant isolation;
- large-dataset performance.

### Gate 4 exit criterion

Reports must be server-aggregated, tenant-scoped, financially correct and reconcilable to transactional data.

---

## Gate 5 — Communications and support

**Status: PARTIAL**

Existing foundations include notifications and communication-related workflows.

Remaining:

- unified notification domain;
- notification preferences;
- event-to-notification mapping;
- reliable email provider;
- SMS provider;
- push delivery;
- retry/dead-letter handling;
- support ticket lifecycle;
- platform support workspace;
- tenant help/support UI;
- support-action audit trail.

---

## Gate 6 — Real-world integrations

**Status: NOT COMPLETE**

Remaining:

- payment gateways/mobile money/card processors;
- email/SMS providers;
- receipt printers;
- barcode scanners;
- cash drawers;
- payment terminals;
- delivery/logistics providers;
- integration webhooks;
- integration health monitoring.

All integrations must use explicit adapter contracts, idempotency, retries, observability and failure handling.

---

## Gate 7 — Production operations

**Status: PARTIAL**

CI and application hardening are substantially established.

Remaining production evidence:

- verified automated backups;
- restore drills;
- disaster-recovery runbook;
- DB connection/pool monitoring;
- production health/readiness probes;
- error monitoring;
- structured operational logs;
- alerting;
- deployment rollback procedure;
- secret rotation procedure;
- production domain/TLS verification;
- staging environment verification;
- production migration procedure;
- operational support runbook.

---

## Gate 8 — Final release

**Status: NOT STARTED AS FINAL GATE**

Final release requires:

- lint;
- production build;
- complete automated suite;
- security review;
- tenant-boundary assessment;
- accessibility review;
- staging smoke test;
- backup restore test;
- representative performance/load evidence;
- pilot merchant acceptance;
- no open P0/P1 defects;
- production deployment procedure;
- rollback procedure;
- incident response documentation;
- release sign-off.

---

# 5. Pilot-readiness definition

AbaCha is **not yet declared pilot-ready** until a real merchant can complete this path without engineering/database intervention:

Business onboarding  
→ Tenant/store setup  
→ Users & permissions  
→ Locations  
→ Products  
→ Opening stock  
→ POS sale  
→ E-commerce sale  
→ Inventory movement  
→ Customer/order history  
→ Payment confirmation  
→ Refund/return  
→ Shift reconciliation  
→ Reports  
→ Discovery listing  
→ Customer discovery/search

### Current pilot-path assessment

| Capability | Current state |
|---|---|
| Business onboarding | **IMPLEMENTED** |
| Tenant/store setup | **IMPLEMENTED** |
| Users & permissions | **FOUNDATION IMPLEMENTED; UX completion remains** |
| Locations | **IMPLEMENTED; management UX remains** |
| Products | **IMPLEMENTED** |
| Opening stock | **IMPLEMENTED and regression-covered** |
| POS sale | **IMPLEMENTED** |
| E-commerce sale | **CORE PATH IMPLEMENTED; production payment integration remains** |
| Inventory movement | **IMPLEMENTED** |
| Customer/order history | **FOUNDATION IMPLEMENTED; broader CRM/reporting remains** |
| Payment confirmation | **FOUNDATION IMPLEMENTED; provider verification remains** |
| Refund/return | **REMAINING** |
| Shift reconciliation | **REMAINING** |
| Reports | **REMAINING** |
| Discovery listing | **IMPLEMENTED** |
| Customer discovery/search | **IMPLEMENTED; final productization remains** |

**Pilot readiness conclusion: NOT YET READY.**

The principal blockers are now merchant operating workflows, payment lifecycle, returns/refunds, shift reconciliation and reporting—not the Discovery/store/catalog foundation.

---

# 6. Full-production definition

Full production additionally requires:

- verified live payment providers;
- verified communications providers;
- production backups and restore drills;
- monitoring and alerting;
- security assessment;
- accessibility assessment;
- representative load/performance evidence;
- documented incident response;
- documented rollback;
- merchant support workflow;
- privacy/terms/commercial policies;
- production domain/TLS;
- pilot evidence;
- release sign-off.

---

# 7. Current execution order

The active sequence is now:

1. **Roadmap reconciliation — COMPLETE with this document.**
2. **Gate 2 / TASK-MERCHANT-1 — Merchant workspace consolidation — IMPLEMENTED; verification active.**
3. TASK-MERCHANT-2 — Users, locations, CRM and suppliers.
4. TASK-MERCHANT-3 — Purchasing and receiving.
5. TASK-MERCHANT-4 — Returns/exchanges and shift/cash reconciliation.
6. TASK-MERCHANT-5 — Operational alerts and merchant workflow completion.
7. Gate 3 — Payment lifecycle and financial operations.
8. Gate 4 — Reporting/analytics.
9. Gate 5 — Communications/support.
10. Gate 6 — External integrations.
11. Gate 7 — Production operations and disaster recovery.
12. Gate 8 — Final security, QA, accessibility, pilot and release assurance.

Discovery/Search hardening should continue as targeted parallel maintenance, but it should not displace the merchant operating-system work unless a regression or production blocker is discovered.

---

# 8. Immediate next task

## TASK-MERCHANT-1 — Merchant Workspace Consolidation

The next implementation workstream is to make the merchant experience operationally coherent around one business/store workspace.

### Required outcomes

- unified merchant dashboard;
- business/store readiness state;
- catalog readiness;
- inventory readiness;
- storefront readiness;
- Discovery listing status;
- operational KPIs;
- quick actions;
- outstanding setup tasks;
- navigation to Products, Inventory, Orders, Customers, Locations, Discovery and Storefront;
- staff/user administration entry point;
- settings/security entry point;
- consistent loading, error and empty states;
- tenant/business authorization preserved end-to-end.

### Acceptance principle

A merchant owner should be able to open the merchant workspace and immediately understand:

1. which business/store they are operating;
2. whether the store is ready to sell;
3. whether inventory is ready;
4. whether the storefront is ready;
5. whether the Discovery listing is ready;
6. what requires attention;
7. how to perform the next operational action.

---

# 9. Architectural invariant for all remaining work

Do not regress to client-authoritative behavior.

Every new workflow must follow:

UI  
↓  
Validated API  
↓  
Authorized service  
↓  
Tenant-scoped repository  
↓  
Transactional database mutation  
↓  
Audit/event where required  
↓  
Canonical response

The following remain strictly server-authoritative:

- prices;
- inventory;
- stock reservations;
- order totals;
- discounts;
- payment state;
- subscription state;
- tenant identity;
- permissions;
- reporting totals;
- Discovery publication/visibility;
- moderation decisions.

---

# 10. Evidence ledger

The following implementation evidence is part of the current roadmap baseline:

| Area | Evidence |
|---|---|
| Discovery → Store → Catalog → Inventory → Storefront lifecycle | `bac74c05`, `a0e199ac`, `8c200127`, `884750d4` |
| Product edit persistence | `6175beba`, `7dd23ca1`, `a61a0a6b`, `5599389f`, `eadea7f4` |
| Variant lifecycle hardening | `fbdbe841`, `2e80cc88`, `35dd8e02`, `ec0b1ba8`, `d40a144e` |
| Current test correction | `24d2aa29` |
| Latest verified CI | Run `36339508911` — SUCCESS |
| Latest main HEAD | `24d2aa29d3a392d6eea0d449aa8ffd2184d64b73` |

---

# 11. Definition of complete

AbaCha is complete only when:

- core modules are implemented;
- all critical workflows are server-authoritative;
- tenant boundaries are verified;
- real payment lifecycle works;
- merchant daily operations work end-to-end;
- customer Storefront and Discovery work end-to-end;
- returns/refunds work;
- shift/cash reconciliation works;
- reports reconcile to transactional data;
- notifications/support operate reliably;
- external integrations are production verified;
- backup/restore is tested;
- monitoring/alerting is active;
- security/accessibility audits pass;
- representative performance testing passes;
- full regression remains green;
- a real pilot merchant can operate without engineering intervention;
- production deployment and rollback are documented and tested.

---

## 12. Roadmap governance rule

This file is the **active completion sequence**.

When a feature is implemented:

1. update its gate/task status;
2. record the relevant commit or CI evidence;
3. remove stale "next task" statements;
4. distinguish API implementation from complete UX/productization;
5. distinguish automated regression evidence from production verification;
6. never mark a release gate complete solely because a local test passes.

Historical task logs such as `.ai/TASK_QUEUE.md` remain useful evidence, but this roadmap is the controlling current-state summary and must be reconciled whenever major implementation work changes the completion sequence.
