# Engineering Task Queue & Strategic Roadmap

> **Document Version**: 1.0.0  
> **Status**: Active Execution Backlog  
> **Authority**: Human Developer / Supervisor  

---

## Strategic Roadmap Overview

```text
BASELINE-001 (COMPLETED)
     ↓
ARCH-001 (APPROVED)
     ↓
DATA-001 (APPROVED)
     ↓
SEC-001 (APPROVED)
     ↓
INV-001 / INV-001R4 (APPROVED)
     ↓
INV-002 / INV-002R3 (APPROVED)
     ↓
POS-001 (APPROVED)
     ↓
API-001 / API-001R3 (APPROVED)
     ↓
QA-001 / QA-001R2 (APPROVED WITH CONDITIONS)
     ↓
UX-001 Phase 1 (READY FOR REVIEW)
     ↓
PROD-001 (NOT STARTED)
```

---

## Active & Scheduled Tasks

### Task 1: BASELINE-001 — Repository Baseline Assessment
- **Status**: `COMPLETED`
- **Objective**: Conduct comprehensive code inspection of the existing AbaCha codebase, mapping out dependencies, module topologies, state management strategies, API endpoints, and existing risks.
- **Scope**: Repository inspection across `package.json`, `server.ts`, `/src` directory tree, `CommerceContext.tsx`, and all UI components.
- **Dependencies**: None.
- **Acceptance Criteria**:
  - [x] Complete inventory of frontend and backend packages recorded.
  - [x] Runtime entry points and build scripts verified.
  - [x] Identification of non-authoritative client state in `CommerceContext` and `localStorage`.
  - [x] Documentation of in-memory server state limitations.
- **Security Requirements**: Document security posture of current application.
- **Validation Requirements**: Successful inspection of directory structures and files.

---

### Task 2: ARCH-001 — Establish Production Architecture Contract
- **Status**: `APPROVED`
- **Objective**: Formalize the architectural, governance, security, and quality contract for the repository to guide all subsequent engineering tasks.
- **Scope**:
  - Create root `AGENTS.md` defining implementation agent authority, hierarchy, and operating rules.
  - Create `.ai/PROJECT_CONTEXT.md` capturing current vs. target architecture.
  - Create `.ai/ARCHITECTURE.md` as canonical system architecture specification.
  - Create `.ai/CODING_STANDARDS.md` establishing code conventions for TypeScript, React, APIs, and errors.
  - Create `.ai/SECURITY_POLICY.md` establishing zero-trust rules, server-side authorization mandates, and financial integrity rules.
  - Create `.ai/DEFINITION_OF_DONE.md` defining task completion and verification gates.
  - Create `.ai/TASK_QUEUE.md` initializing the phased roadmap.
  - Create `.ai/DECISIONS.md` documenting foundational architectural choices.
  - Create `.ai/RISKS.md` cataloging known system risks and technical debt.
  - Create `.ai/REVIEW_QUEUE.md` establishing peer and supervisor review gates.
  - Create `.ai/IMPLEMENTATION_REPORT.md` standard reporting template.
  - **Strict Scope Restriction**: DO NOT modify application functionality or rewrite business logic in `src/` or `server.ts`.
- **Dependencies**: `BASELINE-001`.
- **Acceptance Criteria**:
  - [x] All governance documents created in `.ai/` and root `AGENTS.md`.
  - [x] Canonical architecture document established in `.ai/ARCHITECTURE.md` (with minimal pointer at root).
  - [x] Clear distinction between current state and target state documented.
  - [x] Zero changes made to functional application code (`src/`, `server.ts`).
  - [x] Verification builds (`npm run lint`, `npm run build`) pass cleanly.
- **Security Requirements**: Zero-trust client policy explicitly codified in documentation.
- **Validation Requirements**:
  - Run `npm run lint` and `npm run build`.
  - Run `git diff --stat` to confirm only governance and documentation files are touched.

---

### Task 3: DATA-001 — Establish Authoritative Persistence & Schema Migration
- **Status**: `APPROVED`
- **Objective**: Introduce durable server-side relational database persistence (Cloud SQL / PostgreSQL) to replace ephemeral in-memory arrays and client `localStorage`, with strict production fail-closed driver selection, seed isolation, and migration checksum verification.
- **Scope**:
  - Define relational schema for Organizations, Locations, Products, Variants, Inventory Balances, Inventory Movements (immutable ledger), Orders, Order Items, Payments, Customers, and Audit Events.
  - Create database migration engine with SHA-256 checksum verification and `schema_migrations` tracking.
  - Isolate demo seed scripts outside the migration pipeline (`server/db/seeds/001_demo_seed.sql`), never executing on startup and blocked in production.
  - Implement dual-driver database client with strict environment-aware rules: PostgreSQL mandatory in production (PGlite strictly forbidden); PGlite permitted in development and test.
  - Implement clean repository access layers (`CatalogRepository`, `InventoryRepository` with pessimistic row locking and negative-stock prevention, `OrderRepository`, `CustomerRepository`, `AuditRepository`).
  - Wire database initialization into `server.ts` with `/api/health`, `/api/ready`, and production-protected `/api/admin/db-status` (HTTP 403 in production).
  - Create comprehensive persistence test suite verifying 15 critical database, driver selection, concurrency, seed isolation, and checksum enforcement checkpoints.
- **Dependencies**: `ARCH-001`.
- **Acceptance Criteria**:
  - [x] Database schema models all core entities with proper primary keys, foreign keys, check constraints, composite uniqueness, and indexes.
  - [x] Database migrations execute cleanly, idempotently, and track applied versions via `schema_migrations`.
  - [x] Migration checksum verification enforces SHA-256 matching for already-applied migrations; modified scripts fail closed immediately.
  - [x] Production driver selection strictly requires PostgreSQL and fails closed on missing config or connection failure; PGlite is never permitted in production.
  - [x] Demo seed data is strictly isolated from migrations and blocked from production execution.
  - [x] Admin diagnostic endpoint `/api/admin/db-status` returns 403 Forbidden in production pending SEC-001 authenticated RBAC.
  - [x] Monetary amounts represented using exact decimal precision (`NUMERIC(14,4)`).
  - [x] Inventory quantities support fractional values (`NUMERIC(14,4)`), row-level locks, and negative-stock prevention.
  - [x] Comprehensive automated persistence test suite passes (`npm run test:db` -> 15/15 passed).
  - [x] Existing API endpoints and application UI continue functioning without regressions.
- **Security Requirements**: Database credentials stored in `.env.example`, SQL injection prevented via parameterized queries and prepared statements. Production fail-closed database enforcement.
- **Validation Requirements**: Migration run logs, schema inspection, database connectivity test, automated persistence test suite (15 tests).

---

### Task 4: SEC-001 — Server-Side Authentication & RBAC Boundaries
- **Status**: `READY FOR REVIEW`
- **Objective**: Establish a secure server-side authentication and authorization boundary for the POS + E-Commerce platform.
- **Scope**:
  - Authentication verification & token handling (cryptographically signed HMAC-SHA256 JWT/tokens).
  - Request identity extraction & AuthContext (`userId`, `organizationId`, `roles`, `permissions`, `locationId`).
  - Server-side authorization middleware (`requireAuth`, `requirePermission`, `requireRole`, `requireTenantAccess`).
  - Tenant/org isolation enforcement across resources and repositories.
  - Role and permission matrix covering all roles and granular permissions.
  - Protection of privileged endpoints (`/api/admin/db-status`, `/api/products` mutations, `/api/catalog/sync`, etc.).
  - Centralized rate limiting on sensitive endpoints (`/api/auth/login`, administrative endpoints).
  - Server-authoritative audit actor identity foundation.
  - Runtime input validation schemas for security-sensitive boundaries.
  - Production credential seed guard preventing startup default credential generation.
  - Live health and readiness probes with failure sanitization.
  - Authentication error sanitization.
  - Deep resource-level multi-tenant isolation and repository boundary enforcement.
  - Security regression and verification test suite (`npm run test:security`).
- **Dependencies**: `DATA-001`.
- **Acceptance Criteria**:
  - [x] Unauthenticated requests to protected endpoints return HTTP 401 Unauthorized.
  - [x] Unauthorized roles return HTTP 403 Forbidden.
  - [x] Missing permissions return HTTP 403 Forbidden with required permission details.
  - [x] Tenant access violation returns HTTP 403 TENANT_ACCESS_DENIED.
  - [x] Password hashing using PBKDF2-HMAC-SHA512 (100,000 iterations, 32-byte salt).
  - [x] JWT verification fails closed if expired, signature forged, or secret insecure.
  - [x] Token revocation persists unique token IDs (`jti`) upon logout.
  - [x] Input sanitization strips client-supplied role/tenant/identity spoofing fields.
  - [x] Server-authoritative audit logs derive actor identity exclusively from server context (`req.auth`).
  - [x] Sensitive endpoints (`/api/admin/db-status`, `/api/catalog/sync`, `/api/auth/login`) protected with rate limiters.
  - [x] Diagnostic endpoint `/api/admin/db-status` never leaks credentials, passwords, or connection strings.
  - [x] Production startup credential seeding rejected with fatal error; zero default accounts seeded in production.
  - [x] Live health and ready probes sanitize database outages (503 status, clean payload, no stack traces).
  - [x] Authentication error messages sanitized (generic UNAUTHORIZED, no internal token/cryptographic leak).
  - [x] Deep resource-level multi-tenant isolation enforced at both repository and HTTP controller boundaries.
  - [x] Complete security regression test suite passes (`npm run test:security` -> 22/22 passed).
- **Security Requirements**: No trust in client-asserted role; cryptographic signature verification on tokens. Zero-trust client execution boundary. Production fail-closed environment protection.
- **Validation Requirements**: Comprehensive automated security test suite (`npm run test:security`) covering all 22 security scenarios.
- **Supervisor Hold**: Awaiting human supervisor review and approval before proceeding to `INV-001`. Do NOT start `INV-001` until approved.

---

### Task 5: INV-001 — Server-Authoritative Inventory Ledger & Movement Tracking
- **Status**: `APPROVED`
- **Objective**: Replace client-side stock mutation with a server-authoritative double-entry inventory movement ledger.
- **Scope**:
  - Implement schema migration `003_inventory_domain.sql` (`inventory_balances`, `inventory_movements`, `inventory_reservations`, `inventory_transfers`, `inventory_transfer_items`, `stock_counts`, `stock_count_items`).
  - Create immutable append-only movement ledger with integer-scaled arithmetic (`inventoryPolicies.ts`).
  - Implement pessimistic row locking (`SELECT ... FOR UPDATE`) to eliminate race conditions and overselling.
  - Implement first-class inventory reservations with automatic expiration, release, and order fulfillment.
  - Implement multi-location transfer state machine (Requested -> Approved -> Dispatched -> In-Transit -> Received / Variance).
  - Implement physical stock count reconciliation with compensating ledger adjustments.
  - Implement complete HTTP inventory REST API (`/api/inventory/*`) with RBAC permissions and multi-tenant isolation.
  - Implement automated test suite (`tests/inventory.test.ts` -> 10/10 passed).
- **Dependencies**: `DATA-001`, `SEC-001`.
- **Acceptance Criteria**:
  - [x] All stock changes backed by an immutable ledger record (`inventory_movements`) with strictly checked invariants (`previous_balance + delta === new_balance`).
  - [x] Negative stock is prohibited unless explicitly configured on a per-transaction basis (`allowNegativeStock: false`).
  - [x] Integer-scaled decimal arithmetic (4 decimal places) prevents floating-point precision drift.
  - [x] Idempotency keys prevent duplicate movement execution on network retries.
  - [x] First-class stock reservations prevent overselling and track `reserved` vs `available` stock (`available = on_hand - reserved - damaged - expired`).
  - [x] Multi-location stock transfer lifecycle enforces source deduction, in-transit state tracking, destination receipt, and variance handling.
  - [x] Physical cycle counts compute discrepancies and record compensating audit ledger movements.
  - [x] Multi-tenant isolation prevents cross-tenant access, queries, or modifications at both repository and HTTP controller boundaries.
  - [x] Complete automated test suite passes (`npm run test:inventory` -> 10/10 passed; full suite `npm run test` -> 47/47 passed).
- **Security Requirements**: Granular RBAC permissions enforced (`INVENTORY_VIEW`, `INVENTORY_ADJUST`, `INVENTORY_RECEIVE`, `INVENTORY_TRANSFER`, `INVENTORY_COUNT`, `INVENTORY_AUDIT`); zero-trust actor validation from `req.auth`.
- **Validation Requirements**: Automated test suite (`npm run test:inventory`) verifying arithmetic precision, opening balance replay, stock adjustments, quarantine/write-off, reservations, transfers with variance, cycle counts, tenant isolation, and real HTTP endpoints.

---

### Task 5.1: INV-001R2 — Inventory Integrity Final Remediation
- **Status**: `NOT APPROVED (SUPERSEDED BY INV-001R3)`
- **Parent Task**: `INV-001`
- **Objective**: Final security, consistency, and correctness remediation of the inventory and stock transfer domain.
- **Scope**:
  - Remove all tenant fallbacks (`org_default`) across `server/inventory/`, `server/repositories/inventory*`, and `server/routes/inventory*`.
  - Enforce explicit `organizationId` from `req.auth.organizationId` on all inventory operations; reject missing/empty org with `TENANT_REQUIRED` or `403 TENANT_ACCESS_DENIED`.
  - Fix transfer dispatch/receipt accounting invariants: dispatch reduces source `on_hand` and increments destination `in_transit`; receipt decrements destination `in_transit` for dispatched quantity and increments destination `on_hand` for received quantity.
  - Record discrepancies as `variance_quantity = received - dispatched` and log `VARIANCE_RECORDED` in immutable `inventory_transfer_events` ledger; ensure no lingering in-transit balance.
  - Implement over-receipt protection guard (`OVER_RECEIVE_NOT_ALLOWED`).
  - Implement cancellation guard preventing cancellation of dispatched, in-transit, or completed transfers.
  - Enforce organization-scoped idempotency across create, dispatch, and receive.
  - Complete multi-tenant boundary verification and automated transfer test suite (`tests/transfer.test.ts` -> 10/10 passed; full suite `npm run test` -> 57/57 passed).
- **Dependencies**: `INV-001`.
- **Supervisor Gate**: Superseded by INV-001R3.

---

### Task 5.2: INV-001R3 — Final Inventory Integrity Hardening
- **Status**: `NOT APPROVED (SUPERSEDED BY INV-001R4)`
- **Parent Task**: `INV-001` / `INV-001R2`
- **Objective**: Complete database-level event immutability, movement/reservation unique constraint idempotency, exact scaled decimal arithmetic across all inventory layers, complete elimination of HTTP tenant overrides, and stock transfer accounting invariants.
- **Scope**:
  - Database-Level Event Immutability: PostgreSQL triggers preventing UPDATE and DELETE on `inventory_transfer_events`, failing closed with `IMMUTABLE_RECORD` exception.
  - Movement & Reservation Idempotency: PostgreSQL unique partial indexes `uq_inventory_movements_org_idempotency` and `uq_inventory_reservations_org_idempotency` on `(organization_id, idempotency_key)`. Concurrent calls handle unique violations, verify payload identity, allow safe replays, and return 409 for conflicts.
  - Exact Decimal Arithmetic & WAC: Standardized 4-decimal integer-scaled arithmetic (scale 10,000) using `BigInt` across `inventoryPolicies.ts`. Exact weighted average cost calculation supporting integer, fractional quantities, fractional costs, repeated receipts, and rounding boundaries.
  - HTTP Input Validation: Route handlers validate quantities with `parseExactQuantity()`, rejecting `NaN`, `Infinity`, `1e309`, non-numeric characters, and precision > 4 decimal places with HTTP 400 `VALIDATION_ERROR`.
  - Strict HTTP Tenant Extraction: Removed all `?orgId=` / request-body tenant overrides; all inventory endpoints extract `organizationId` strictly from authenticated `req.auth.organizationId`.
  - Transfer Concurrency & Conservation Invariants: Pessimistic row locking (`FOR UPDATE`) on dispatch and receipt; strict accounting invariants (`Dispatched = Received + Variance`).
  - Legacy In-Memory Store Audit: Documented that `CommerceContext` and `offlineStore` are strictly client-side UI caches and non-authoritative buffers; server database ledger is the sole authority.
  - Automated Tests: 14/14 inventory tests, 13/13 transfer tests, 15/15 db persistence tests, 22/22 security tests passing cleanly.
- **Dependencies**: `INV-001`, `INV-001R2`.
- **Acceptance Criteria**:
  - [x] PostgreSQL trigger `trg_immutable_transfer_events` rejects UPDATE and DELETE on `inventory_transfer_events`.
  - [x] Database partial unique indexes enforce movement and reservation idempotency at the engine level.
  - [x] Zero JavaScript floating-point calculations for authoritative inventory quantities; exact BigInt scaling used everywhere.
  - [x] HTTP quantity validation stringently rejects non-numeric, overflow, and excess decimal inputs.
  - [x] Ordinary inventory endpoints ignore or reject external tenant parameters, binding operations strictly to `req.auth.organizationId`.
  - [x] Concurrent transfer dispatches and receipts are safely serialized with row locks.
  - [x] In-memory store audit recorded in `.ai/DECISIONS.md`.
  - [x] All 64 automated tests passing across all test suites.
- **Supervisor Gate**: Superseded by INV-001R4.

---

### Task 5.4: INV-001R6 — Exact Numeric Boundary Closure
- **Status**: `READY FOR REVIEW`
- **Parent Task**: `INV-001R5`
- **Objective**: Apply narrow corrective patch for remaining numeric-integrity issues.
- **Acceptance Criteria**:
  - [x] Remove JavaScript `number` from authoritative inventory quantity and monetary boundaries.
  - [x] Eliminate all silent decimal truncation.
  - [x] Preserve BigInt-based exact arithmetic.
  - [x] Make transfer and inventory repository DTOs use exact string quantities.
  - [x] Update tests and callers accordingly.
  - [x] All 64 tests pass.

---

### Task 5.3: INV-001R4 — Inventory Integrity Verification & Closure
- **Status**: `READY FOR REVIEW`
- **Parent Task**: `INV-001` / `INV-001R3`
- **Objective**: Close remaining supervisor findings from the independent INV-001R3 review with verified proof of database event immutability, elimination of floating-point arithmetic from authoritative paths, explicit repository row mapping, centralized route error handling, and legacy store audit documentation.
- **Scope**:
  - Prove Database Event Immutability: Verify PostgreSQL trigger `trg_immutable_transfer_events` and function `prevent_transfer_event_modification()` on `inventory_transfer_events` with integration tests executing raw SQL (`UPDATE` and `DELETE`), verifying both are rejected with `IMMUTABLE_RECORD` (code 23506) while `INSERT` succeeds and existing data is intact.
  - Remove Authoritative Floating-Point Quantity Paths: Standardize on `BigInt` scaled arithmetic (scale factor 10,000 for quantities, 100 for currency) across `server/inventory/inventoryPolicies.ts`. Mark deprecated non-authoritative helpers. Enforce `parseExactQuantity()` and check `parseQtyToScaled(qty) > 0n` on all items in `TransferService.createTransfer`.
  - Repository Row Mappers: Ensure explicit field mapping functions (`mapBalanceRow`, `mapMovementRow`, `mapTransferItemRow`, `mapTransferEventRow`, `mapReservationRow`, `mapStockCountItemRow`) are used across all repositories to prevent untyped or raw DB leaks.
  - Centralize Route Error Handling: Implement and deploy `handleInventoryRouteError()` across all inventory HTTP endpoints in `server/routes/inventoryRoutes.ts`, returning standard HTTP status codes (403, 400, 422, 409, 404, 500) and sanitizing internal error messages.
  - Legacy In-Memory Store Audit: Record formal audit in `.ai/DECISIONS.md` (ADR-015 and ADR-016), establishing that `CommerceContext` and `offlineStore` are non-authoritative client UI helpers and that the PostgreSQL database ledger is the sole authority for inventory state.
  - Automated Quality Gates: Verify that all 64 automated tests pass (`npm run test`), `npm run lint` (`tsc --noEmit`) passes with 0 errors, and `npm run build` succeeds.
- **Dependencies**: `INV-001`, `INV-001R3`.
- **Acceptance Criteria**:
  - [x] Direct SQL `UPDATE` and `DELETE` on `inventory_transfer_events` fail at the database level with `IMMUTABLE_RECORD`.
  - [x] Zero floating-point calculations used in authoritative server-side inventory mutations.
  - [x] Transfer creation strictly validates quantities using `parseExactQuantity` and rejects non-positive or malformed values.
  - [x] Centralized HTTP route error handler eliminates inconsistent status codes and DB stack leakage.
  - [x] Repositories explicitly extract typed fields via dedicated mapper functions.
  - [x] Legacy store audit documented in `.ai/DECISIONS.md`.
  - [x] All 64 automated tests passing across 4 test suites (15 db, 22 security, 14 inventory, 13 transfer).
  - [x] Production build and TypeScript lint pass with 0 errors.
- **Supervisor Gate**: INV-001R4 is marked READY FOR REVIEW. POS-001 MUST remain NOT STARTED and MUST NOT be implemented until INV-001R4 passes independent supervisor review. Do NOT mark approved.

---

### Task 6: POS-001 / POS-001R1 / POS-001R2 / POS-001R3 — Order Tenant Boundary & Replay Mapping Hardening
- **Status**: `APPROVED`
- **Supervisor Gate**: APPROVED.
- **Objective**: Harden the POS transactional processing engine by enforcing tenant isolation across all OrderRepository entry points, ensuring payment tenant consistency, returning mapped PaymentRecord in idempotency replay pathways, and preserving exact-decimal arithmetic.
- **Scope**:
  - [x] Finding A: Mandatory tenant context for `OrderRepository.findOrderById(id, organizationId, client?)`. Removed unscoped overload. Missing organizationId fails closed with `TENANT_REQUIRED`.
  - [x] Finding B: Enforce `payment.organization_id === order.organization_id` in `OrderRepository.createOrderWithItems()`. Mismatch fails closed with `TENANT_MISMATCH`.
  - [x] Finding C: Ensure idempotency replay paths return fully mapped `PaymentRecord` with exact decimal strings using `orderRepo.findPaymentByOrderId(order.id, organizationId, tx)`.
  - [x] Tenant scoping on session close queries (`payments`, `pos_returns`) and API endpoints (`/api/orders/:id`, `/sales/:id`, `/receipts/:id`).
  - [x] Implement BigInt exact-decimal financial arithmetic (scale factors 10,000 and 100) using `inventoryPolicies.ts` helpers, removing all JS floats, `parseFloat`, `Math.round`, and `Number` castings from calculations.
  - [x] Enforce session-locking via pessimistic `SELECT ... FOR UPDATE` row locks during checkout, cash movements, and closing operations.
  - [x] Prevent duplicate active sessions at both the database schema layer (unique index constraint) and the service layer.
  - [x] Secure idempotency via tenant-scoped unique index constraints for `orders` and `pos_returns`.
  - [x] Stable cryptographic request fingerprinting during checkout and processReturn with mismatch protection (`IDEMPOTENCY_CONFLICT`).
  - [x] Gracefully handle unique index constraint violations (`23505`) during concurrent checkout races.
  - [x] Expand automated tests to 17 tests verifying tenant isolation, payment consistency, mapped payment replay, and multi-conflict idempotency. All 17/17 POS tests and 91/91 full suite tests pass.
- **Dependencies**: `INV-001`, `INV-001R6`.
- **Acceptance Criteria**:
  - [x] `OrderRepository.findOrderById` strictly requires `organizationId` and scopes SQL query to `WHERE id = $1 AND organization_id = $2`.
  - [x] `createOrderWithItems` rejects payment with different `organization_id` with `TENANT_MISMATCH`.
  - [x] Idempotency replay returns typed `PaymentRecord` with string decimal `amount`.
  - [x] Cross-tenant order lookups return null.
  - [x] All 17 automated POS tests execute cleanly (`npm run test:pos` -> 17/17 passed).
  - [x] Full automated test suite passes (`npm test` -> 91/91 passed).

---

### Task 7: API-001 — Comprehensive REST API Hardening & DTO Validation
- **Status**: `SUPERSEDED BY API-001R1`
- **Supervisor Gate**: Rework requested by supervisor; superseded by API-001R1.

---

### Task 7.1: API-001R1 — API Boundary Completion & Security Contract Hardening
- **Status**: `SUPERSEDED BY API-001R2`
- **Parent Task**: `API-001`
- **Supervisor Gate**: Superseded by API-001R2.

---

### Task 7.2: API-001R2 — Tenant Model Resolution, Strict DTO Enforcement & API Acceptance Completion
- **Status**: `SUPERSEDED BY API-001R3`
- **Parent Task**: `API-001` / `API-001R1`
- **Objective**: Complete all remaining API hardening, tenant model resolution, and DTO enforcement requirements to achieve full production API security and acceptance closure.
- **Scope**:
  - [x] Fail-Closed Tenant Handling: Removed all `org_default` fallback logic from authentication (`AuthService.login` requires explicit `organizationId`), audit logging (`AuditRepository` requires non-empty `organization_id`), and runtime route handlers (`/api/orders`, `/api/customers`, `/api/sync/status`, `/api/sync/trigger`, `/api/attributes`, `/api/categories`, `/api/brands`, `/api/products/:id/variants`). `org_default` is strictly reserved for fixtures and seed data.
  - [x] Fail-Closed Organization Verification: `resolveAuthorizedTenant()` verifies the target organization exists and is active in the `organizations` database table before permitting Super Admin cross-tenant access. Unknown or inactive organizations are rejected with HTTP 403 `TENANT_ACCESS_DENIED`.
  - [x] Super Admin Model B Implementation: Super Admin defaults to their home tenant unless explicitly targeting a tenant via `?orgId=`. On single resource lookups (`/api/orders/:id`, `/api/customers/:id`), if not found in the home tenant, Super Admin can read across tenants, automatically recording a `SUPER_ADMIN_CROSS_TENANT_READ` audit event with `homeOrganization` and `targetOrganization` metadata.
  - [x] Exact-Decimal Contract Without Trimming or Coercion: `validateMoneyDecimal` and `validateQuantityDecimal` strictly validate string inputs without calling `.trim()` before regex evaluation, strictly rejecting leading/trailing whitespace, non-string types, and numbers.
  - [x] Anti-Spoofing & DTO Allowlisting: Identity and tenant keys (`organizationId`, `userId`, `actorId`, etc.) are allowlisted in DTO validators and stripped/ignored by server-authoritative assignment from `req.auth`. Unrecognized keys outside the allowlist are strictly rejected with HTTP 422 `VALIDATION_ERROR`.
  - [x] Unified Audit Action Terminology: Standardized on canonical audit actions (`SUPER_ADMIN_CROSS_TENANT_READ`, `SUPER_ADMIN_CROSS_TENANT_CREATE`, `CREATE`, `UPDATE`, `DELETE`).
  - [x] Quality & Test Gates: All 101 tests across all 6 test suites pass cleanly with 0 failures (`test:db`: 15, `test:security`: 22, `test:inventory`: 24, `test:transfer`: 13, `test:pos`: 17, `test:api`: 10). `npm run lint` and `npm run build` pass with 0 errors.
- **Dependencies**: `API-001`, `API-001R1`.
- **Acceptance Criteria**:
  - [x] Authentication strictly requires `organizationId`; missing/invalid tenant fails closed.
  - [x] Super Admin cross-tenant access enforces Model B semantics with active tenant validation and structured audit trail.
  - [x] Decimal validators reject non-string and whitespace-padded inputs.
  - [x] Route handlers eliminate `org_default` runtime fallbacks.
  - [x] All 101 tests pass cleanly across 6 test suites.
  - [x] Zero TypeScript errors and successful production compilation.
- **Supervisor Gate**: Marked READY FOR REVIEW for independent human supervisor review. Do NOT start QA-001 until approved.

---

### Task 8: QA-001 — Automated Quality Verification, Test Suite & CI Gates
- **Status**: `APPROVED WITH CONDITIONS`
- **Objective**: Establish automated testing frameworks and quality verification gates.
- **Scope**:
  - Configure `vitest` or `jest` for unit and integration testing.
  - Write test suites covering business logic (pricing, inventory ledger, double-entry accounting).
  - Add end-to-end tests for POS checkout and Storefront flows.
- **Dependencies**: `API-001`.
- **Acceptance Criteria**:
  - `npm test` runs with 100% pass rate.
  - High test coverage on financial calculation and inventory movement services.
- **Security Requirements**: Automated regression checks for authorization bypass.
- **Validation Requirements**: CI pipeline execution report.

---

### Task 9: UX-001 — Production UX Hardening, Offline Resilience & Error Recovery
- **Status**: `APPROVED WITH CONDITIONS` (Supervisor Review 2026-09-11; 48H Release Audit Ready)
- **Phase 1 Deliverables**: Completed Comprehensive UI/UX Audit ([.ai/UX_AUDIT.md](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/.ai/UX_AUDIT.md)) and UX Modernization Implementation Plan ([.ai/UX_IMPLEMENTATION_PLAN.md](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/.ai/UX_IMPLEMENTATION_PLAN.md)), approved with conditions on 2026-09-10.
- **Phase 2.1 Deliverables**: Implemented baseline design system primitives, global `ErrorBoundary` protection, sole environment gate checks, and React `useId` modal identifiers.
- **Phase 2.2C Deliverables**: Completed e-commerce checkout integration. Hardened exact string-only quantities, cryptographically secure idempotency keys, payload fingerprinting (with customer details and location ID tracking), server-authoritative pricing and taxes, pessimistic variant row locking, payment state persistence, local `SAVEPOINT` transaction recovery (solving PostgreSQL unique-constraint abort race conditions), and robust production error sanitization.
- **Phase 2.3 Deliverables**: Completed local offline POS queueing utilizing indexedDB storage, network connectivity event listeners, automatic background synchronization, backoff retry schedules, and intuitive UI status banners.
- **Phase 2.3 R1 Deliverables**: Hardened offline POS resilience architecture against independent security/architecture audit findings (APPROVED WITH CONDITIONS on 2026-09-10).
- **Phase 2.4 Deliverables**: Modal Accessibility, Keyboard Focus Trapping & Global POS Hotkeys:
  - Centralized Modal Stack Manager (`src/services/modalManager.ts`) coordinating stacked dialogs, focus trapping exclusivity, and global Escape dispatch without competition.
  - Hardened Modal primitive (`src/components/ui/Modal.tsx`) with `useId` collision-safe IDs, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `closeOnEscape`, safe focus restoration guarded by `document.body.contains(trigger)`, and zero-dimension headless guards.
  - Reusable focus trap hook (`src/hooks/useModalFocusTrap.ts`) supporting nested modal lifecycles.
  - Refactored all 5 POS overlay dialogs in `PosTerminal.tsx` to wrap `<Modal>` (Variant Selector, Payment Tender, Held Sales Queue, Returns & Refunds, Quick Add Customer).
  - Secondary POS dialogs (`ShiftModal`, `CashMovementModal`, `ReceiptModal`, `PriceOverrideModal`, `BarcodeQrScannerModal`) registered with `modalManager` lifecycle hooks.
  - Centralized POS keyboard shortcuts hook (`src/hooks/usePosKeyboardShortcuts.ts`) with input-element guards (protects typing in `input`, `textarea`, `select`, `contenteditable`), complete modal-open suppression, native browser shortcut protection (`Ctrl+C`, `Ctrl+V`, `F5`, `Alt+Tab`), and strict financial mutation safety (zero shortcuts trigger payment or ledger updates).
  - Accessible Hotkey Quick Reference Bar in `PosTerminal.tsx` footer.
  - Comprehensive 20-point behavioral test suite (`tests/ux_pos_hotkeys.test.ts`) covering all 12 modal focus/lifecycle checkpoints and 8 POS hotkey/safety checkpoints.
- **Phase 2.5 Deliverables**: Mobile touch targets calibrated to 44px minimum height standard; table horizontal scroll swipe indicators integrated for complex product and inventory data tables.
- **Objective**: Modernize frontend UX incrementally starting with common design primitives and error wrappers, progressing to server authoritative integration, offline resilience, and mobile responsive layout fixes.
- **Scope**:
  - [x] Phase 1: Frontend inspection and audit reports.
  - [x] Phase 2.1: UI primitives, toast alerts, top-level Error Boundary with safe DEV-mode redaction, and access IDs.
  - [x] Phase 2.2C: E-commerce storefront checkout integration, savepoint transaction recovery, and exact decimal inputs.
  - [x] Phase 2.3: Offline POS IndexedDB transaction queueing, synchronization on recovery, backoff schedules, and status banners.
  - [x] Phase 2.3 R1: Offline POS security, multi-tenant isolation, 409 conflict semantics, storage split-brain migration, and server-authoritative reconciliation.
  - [x] Phase 2.4: Remediate modal accessibility (focus trapping, escape listeners) and map global POS keyboard hotkeys.
  - [x] Phase 2.5: Calibrate mobile touch targets and ensure horizontal scroll wraps for complex tables.
- **Dependencies**: `POS-001`, `API-001`, `QA-001`.
- **Acceptance Criteria**:
  - [x] Phase 1: UX Audit Report and Implementation Plan submitted and approved.
  - [x] Phase 2.1: Custom UI primitives created, Toast stack fully functional, top-level SPA error boundary mounted and verified.
  - [x] Phase 2.2C: Storefront orders checkout integrated using exact string-only quantities, cryptographic unique keys, savepoint-safe transaction recovery, and honest payment records.
  - [x] Phase 2.3: POS continues ringing items when offline and automatically syncs queue on reconnect.
  - [x] Phase 2.3: Network state indicator visual badge displayed.
  - [x] Phase 2.3 R1: Offline queue storage migration prevents data loss on IDB recovery.
  - [x] Phase 2.3 R1: Sync fails closed without valid tenant; cross-tenant queue leakage prevented.
  - [x] Phase 2.3 R1: 409 conflict errors marked failed and kept in queue; genuine replays purged.
  - [x] Phase 2.3 R1: Pre-computed idempotency keys preserved on offline queue fallback.
  - [x] Phase 2.3 R1: Cart cleared only upon successful server acceptance or durable queue placement.
  - [x] Phase 2.3 R1: Server-authoritative post-sync inventory reconciliation replaces client stock mutations.
  - [x] Phase 2.3 R1: Simulator UI separated from real network drops.
  - [x] Phase 2.4: Modal receives focus on open, Tab and Shift+Tab wrap within dialog, Escape dismisses dismissible modals with zero leakage to background.
  - [x] Phase 2.4: Focus safely restores to attached trigger element and fails safely on detached triggers.
  - [x] Phase 2.4: Stacked modals do not compete; top-most modal owns focus and handles Escape.
  - [x] Phase 2.4: POS hotkeys fire on standard keys (F2, F3, F4, F7, F8, F9, F10) outside modals and outside form inputs.
  - [x] Phase 2.4: Zero hotkeys execute financial transactions or alter server inventory.
  - [x] Phase 2.4: All 20 behavioral tests pass in `tests/ux_pos_hotkeys.test.ts`.
- **Security Requirements**: Offline queue items encrypted locally before sync; fail-closed tenant validation; zero cross-tenant queue sync; server-authoritative pricing and inventory; zero financial mutations executable from keyboard shortcuts.
- **Validation Requirements**: 20/20 behavioral tests in `tests/ux_pos_hotkeys.test.ts`, 3/3 accessibility checks in `tests/ux_accessibility.test.ts`, 14/14 offline POS regression tests in `tests/ux_offline_pos.test.ts`.

---

### Task 10: PROD-001 — Production Readiness, Observability & Deployment
- **Status**: `NOT STARTED`
- **Objective**: Prepare application for high-availability production deployment on Google Cloud Run.
- **Scope**:
  - Security headers configuration (CSP, CORS, HSTS, X-Content-Type-Options).
  - Structured JSON application logging with request correlation IDs.
  - Performance profiling, bundle size optimization, and production Docker container verification.
- **Dependencies**: `QA-001`, `UX-001`.
- **Acceptance Criteria**:
  - Production build runs cleanly on containerized environment.
  - Health check endpoint `/api/health` reports status of database and services.
  - Security audit passes clean without critical warnings.
- **Security Requirements**: Hardened headers, zero exposed secrets, non-root container user.
- **Validation Requirements**: Container build and deployment simulation test.

### Task 5.4: INV-002 — Inventory Business-Logic & Acceptance Audit
- **Status**: `READY FOR REVIEW`
- **Objective**: Validate the correctness, consistency, transactional integrity, security, idempotency, and business behavior of the current Inventory implementation.
- **Dependencies**: `INV-001`, `INV-001R3`, `INV-001R4`
- **Acceptance Criteria**:
  - [x] Verified exact integer scaled arithmetic rules
  - [x] Proved concurrent reservations and double-dispatch mechanisms safely handle idempotency and block overselling (Audit F2/F3/D7).
  - [x] Proved transaction rollback on failure (Audit L1).
  - [x] Proved negative quantity rejection on opening stock (Audit A3).
  - [x] Evaluated return workflows (Audit G1).
  - [x] Generated detailed Implementation Report.
- **Supervisor Gate**: Marked READY FOR REVIEW.

### Task 5.5: INV-002R1 — Inventory Acceptance Audit Targeted Rework
- **Status**: `READY FOR REVIEW`
- **Objective**: Close the evidence and implementation gaps identified during the independent review of INV-002.
- **Dependencies**: `INV-002`
- **Acceptance Criteria**:
  - [x] R1 (Exact Quantity/Money Contract): Enforce authoritative quantity/money contract at the service/API boundary. Reject numeric inputs; only allow decimal strings.
  - [x] R2 (Reservation Expiration): Prove reservation expiration behavior via explicit tests (E1-E5 scenarios).
  - [x] R3 (Transfer Concurrency): Prove transfer concurrency semantics (T1-T3 scenarios) with explicit assertions on inventory effects.
  - [x] R4 (Error Sanitization): Prove HTTP error sanitization via endpoint-level tests.
  - [x] R5 (Full Test/Lint/Build): Execute full test suite, lint, and build.
  - [x] R10 (Acceptance Matrix): Update the acceptance matrix in the implementation report with specific, executable evidence for every PASS.
- **Supervisor Gate**: Marked READY FOR REVIEW.

---

### Task 5.6: INV-002R2 — Final Evidence & Boundary Remediation
- **Status**: `READY FOR REVIEW`
- **Parent Task**: `INV-002R1`
- **Objective**: Close remaining independently identified gaps in INV-002R1: strict money validation at authoritative HTTP/service boundaries, verifiable HTTP error sanitization, reproducible test/build evidence, and governance reporting.
- **Scope**: Targeted boundary remediation only (no broad rewrite, POS-001 remains NOT STARTED, 0 POS files modified).
- **Dependencies**: `INV-002R1`
- **Acceptance Criteria**:
  - [x] R1: Strict Money Boundary: Rejection of numbers, exponents, floats, whitespace, invalid formats; acceptance of exact strings with <=2 decimal places at `/api/inventory/opening-balance` and `/api/inventory/adjustments`.
  - [x] R2: Reservation Expiration: E1-E5 tests fully passing with non-zero pre-expiry reservations, exact timestamp comparison, concurrent release idempotency.
  - [x] R3: Transfer Concurrency & State Integrity: T1-T3 tests fully passing with source/destination balances, in-transit deduction, and zero duplicate transfer events.
  - [x] R4: HTTP Error Sanitization & Redaction: Injected internal database errors (SQL text, connection URIs, constraints, file paths, stack traces, trace IDs) fully redacted with 500 status and generic error code.
  - [x] R5: Test Execution & Verification: Full suite (24/24 tests) passes cleanly without warnings or skipped assertions.
  - [x] R6: POS Scope Discipline: `POS-001` remains `NOT STARTED`. POS files modified: `NONE`.
- **Supervisor Gate**: Marked READY FOR REVIEW.

---

### Task 5.7: INV-002R3 — Final Inventory Verification & Targeted Remediation
- **Status**: `APPROVED`
- **Parent Task**: `INV-002R2` → `INV-002`
- **Objective**: Complete the final targeted remediation, verification, and proof of INV-002 Inventory Business Logic & Acceptance. Close remaining independently identified evidence/implementation gaps: strict whitespace rejection on exact money strings (`parseExactMoney`), explicit E1-E5 reservation expiration state validations, explicit T1-T3 transfer concurrency invariants with zero duplicate events/movements, endpoint-level & unit-level error sanitization against raw DB leak, and reproducible git/test evidence.
- **Scope**: Targeted inventory verification and remediation only. POS-001 remains NOT STARTED. POS files modified: NONE.
- **Dependencies**: `INV-002R2`.
- **Acceptance Criteria**:
  - [x] R1: Strict Money Boundary: Rejection of whitespace-padded strings (e.g. `" 10.00 "`, `" 10.00"`, `"10.00 "`, `" "`), numeric values (`10`, `10.5`), booleans, objects, arrays, exponents, null, NaN, Infinity, excess precision (>2 decimal places), and currency symbols across `parseExactMoney` unit tests and HTTP `/api/inventory/opening-balance` and `/api/inventory/adjustments`. Acceptance of exact strings: `"0"`, `"0.00"`, `"10"`, `"10.5"`, `"10.50"`, `"1234.56"`.
  - [x] R2: Reservation Expiration: E1-E5 tests fully passing with direct DB state inspection (`SELECT * FROM inventory_reservations WHERE id = $1`): active status on creation, expired status on expiry, concurrent release/expiry race yielding valid terminal state without double restoration, concurrent fulfillment/expiry race without double processing, repeated expiration idempotency with protection of unexpired active reservations.
  - [x] R3: Transfer Concurrency & State Integrity: T1-T3 tests passing with exact inventory balance assertions, in-transit quantity reduction, exactly 1 movement and 1 event on dispatch, exactly 2 movements and 1 receive event on completion, and zero duplicate movements/events.
  - [x] R4: HTTP Error Sanitization & Redaction: Full unit and endpoint-level defense against internal DB leaks. Injected SQL queries, connection URIs, credentials, table names, column names, file paths, stack traces, and trace IDs fully redacted. Production mode (`NODE_ENV === 'production'`) yields standard HTTP 500 `INVENTORY_ERROR` with generic safe message.
  - [x] R5: Test Execution & Verification: Full suite (74/74 tests: 15 db, 22 security, 24 inventory, 13 transfer) passes cleanly with 0 failures; `npm run lint` (`tsc --noEmit`) passes with 0 errors; `npm run build` succeeds cleanly.
  - [x] R6: POS Scope Discipline: `POS-001` remains `NOT STARTED`. POS files modified: `NONE`.
- **Supervisor Gate**: Marked READY FOR REVIEW for final human supervisor approval. Ready for independent review.

---

### Task 7.3: API-001R3 — Fail-Closed Tenant Authorization & API Acceptance Hardening
- **Status**: `APPROVED`
- **Parent Task**: `API-001` / `API-001R2`
- **Objective**: Correct security and acceptance defects identified during independent supervisor review of API-001R2.
- **Scope**:
  - [x] Fail-Closed Tenant Handling: Refactored `resolveAuthorizedTenant()` to be fully fail-closed. It now strictly rejects any access if database queries fail, timeout, or return an inactive/deleted organization, returning a 403 `TENANT_ACCESS_DENIED` immediately without swallowing exceptions or defaulting to `org_default`.
  - [x] Fail-Closed Login Endpoint Semantics: Handled empty/missing `organizationId` with a 422 `VALIDATION_ERROR` (matching missing email/password schemas), and invalid credentials with a 401 `UNAUTHORIZED` code.
  - [x] Product Route Refactoring: Ported `POST /api/products`, `PUT /api/products/:id`, and `DELETE /api/products/:id` to `async/await` try-catch blocks with explicit invocation of `resolveAuthorizedTenant()` for secure stamping and cross-tenant isolation enforcement.
  - [x] Strict DTO Anti-Spoofing Rejection: Configured validators for `users` and `products` to strictly reject requests containing identity/tenant keys (such as `organizationId`, `userId`, `role`, `actorId`, etc.) in mutation bodies with a 422 `VALIDATION_ERROR` rather than silently stripping them.
  - [x] Exact-Decimal Contract Verification: Ensured exact decimal string matching for monetary and numeric fields. Non-string types, leading/trailing whitespace, and incorrect precision decimals are strictly rejected with 422 validation errors.
  - [x] Verification: Added 11 extensive integration tests to `tests/api_hardening.test.ts` to verify all 10 target scenarios and exact-decimal checks.
  - [x] Full Quality Gates: Verified all 102 tests across 6 test suites pass 100% cleanly (`npm test`). `npm run lint` passes with 0 errors. `npm run build` compiles with 0 warnings.
- **Dependencies**: `API-001R2`
- **Supervisor Gate**: Marked READY FOR REVIEW for final independent human supervisor approval.

---

### Task 9.5: UX-001 Phase 2.5 — Storefront & POS Usability, Keyboard Navigation & Modal Hardening
- **Status**: `READY FOR REVIEW`
- **Parent Task**: `UX-001`
- **Objective**: Harden the storefront customer journey and POS operator experience for 48-hour customer handover readiness without weakening server authority or duplicating business logic.
- **Scope**:
  - Connect `useModalFocusTrap` and enterprise modalManager coordination across all storefront modals and drawers.
  - Implement full keyboard accessibility (`tabIndex={0}`, `role="button"`, `Enter`/`Space`) and visible focus styling on catalog `ProductCard` components.
  - Replace blocking `window.alert(...)` calls in `PosTerminal.tsx` and `BarcodeQrScannerModal.tsx` with non-blocking scan toasts and inline error banners.
  - Ensure zero syntactic or variable leakage in secondary POS dialogs (`CashMovementModal`, `PriceOverrideModal`, `ReceiptModal`, `ShiftModal`).
- **Dependencies**: `UX-001 Phase 2.4`
- **Acceptance Criteria**:
  - [x] All storefront modals (`StoreCheckoutModal`, `ProductDetailModal`, `QuickViewModal`, `OrderSuccessModal`, `OrderTrackingModal`, `OrderNotificationHubModal`, `CustomerAccountModal`, `AccountClaimModal`) implement `useModalFocusTrap` with dialog semantics.
  - [x] All storefront drawers (`StoreCartDrawer`, `WishlistDrawer`, `MobileFilterDrawer`) implement `useModalFocusTrap` with overlay click dismissal and focus locking.
  - [x] Product discovery cards are fully operable via keyboard (`Enter`/`Space`) with accessible labels.
  - [x] POS operator error feedback uses inline banners and scan toasts instead of blocking browser popups.
  - [x] Behavioral test suites pass cleanly: `npm run test:hotkeys` (20/20 PASS), `npm run test:ux` (23/23 PASS), `npm run test:offline-pos` (14/14 PASS).
- **Supervisor Gate**: Marked READY FOR REVIEW. Stopped at release gate for independent supervisor review.

---

### Task 10: REL-010 — Release Candidate Hardening & Production Gate
- **Status**: `READY FOR REVIEW`
- **Objective**: Establish reproducible deterministic dependency installation, audit and resolve PGlite vs PostgreSQL runtime architecture contract, run full static validation (0 errors), execute the entire 151-test suite (100% pass), verify production build artifacts, and perform deployment smoke testing on built artifacts.
- **Scope**:
  - Generated official `package-lock.json` representing current `package.json` dependency tree.
  - Executed clean installation `npm ci` with 0 missing or mismatched dependencies.
  - Validated static types with `npx tsc --noEmit` and `npm run lint` (0 errors).
  - Executed 151 / 151 passing tests across all 10 suites (`test:db`, `test:auth`, `test:inventory`, `test:transfer`, `test:pos`, `test:api`, `test:qa`, `test:ux`, `test:checkout`, `test:offline-pos`, `test:hotkeys`).
  - Audited PGlite vs PostgreSQL production runtime architecture and confirmed fail-closed semantics and accurate health probe reporting.
  - Verified production build and executed deployment smoke test on `node dist/server.cjs` (HTTP 200 on `/api/health` and `/api/ready`).
  - Documented CI/CD pipeline and security regression scan.
- **Dependencies**: `UX-001 Phase 2.5`
- **Acceptance Criteria**:
  - [x] Exact HEAD SHA recorded: `1bc307c6f059c402123512e9b9227fcaab58fe32` (evaluated from `9bf57deaf6526eedb45f86eb79333254ac004519`).
  - [x] Clean deterministic `package-lock.json` committed.
  - [x] Clean `npm ci` verified.
  - [x] `tsc --noEmit` and `npm run lint` pass with 0 errors.
  - [x] 151 / 151 tests pass with 0 failures, 0 blocked, 0 skipped.
  - [x] Production build produces `dist/index.html` and `dist/server.cjs`.
  - [x] Production database architecture contract verified.
  - [x] Deployment smoke test passes with accurate database engine reporting.
- **Supervisor Gate**: Marked `READY FOR REVIEW`.

---

### Task 11: REL-011 — Production Database Fail-Closed + PostgreSQL Staging Gate
- **Status**: `READY FOR REVIEW`
- **Objective**: Make production database behavior deterministic and fail-closed, then validate the complete application against a real PostgreSQL staging database. Resolve PostgreSQL reservation idempotency race condition under concurrent requests.
- **Scope**:
  - Enforced production database policy: `NODE_ENV=production` requires valid PostgreSQL configuration; missing or invalid config causes hard startup termination.
  - Strictly prohibited embedded PGlite persistence in production; environment variable overrides (`ALLOW_EMBEDDED_POSTGRES`) are ignored under production.
  - Removed automatic fallback to embedded storage from `startServer()` in `server.ts`.
  - Enforced high-entropy `JWT_SECRET` (minimum 32 characters, no 'dev'/'default') during production startup.
  - Repositioned the SQL savepoint rollback (`REL-011R1`) to wrap BOTH the inventory balance adjustment and reservation creation inside `reservationService.ts`. This ensures duplicate concurrent requests with identical idempotency keys roll back the entire attempt atomically, resolving the concurrency race and preventing inventory leaks.
  - Validated health (`/api/health`) and readiness (`/api/ready`) probes report active database engine (`"engine": "postgresql"`) and return HTTP 503 during database outage.
  - Executed complete verification suite (151 unique baseline units + 9 production gate/concurrency units = 160 units) against real PostgreSQL 16 staging database with 100% pass rate.
  - Validated negative test scenarios (missing config, invalid config, database outage, PGlite fallback rejection).
- **Dependencies**: `REL-010`
- **Acceptance Criteria**:
  - [x] Production cannot start without valid PostgreSQL configuration.
  - [x] Production cannot silently use PGlite.
  - [x] PostgreSQL staging starts successfully.
  - [x] `/api/health` reports PostgreSQL (`"engine": "postgresql"`).
  - [x] `/api/ready` succeeds with PostgreSQL available.
  - [x] `/api/ready` fails when PostgreSQL is unavailable (HTTP 503).
  - [x] Concurrency fix correctly wraps inventory adjustment and reservation insertion under `SAVEPOINT sp_reservation_attempt` (`REL-011R1`).
  - [x] Concurrent reservation idempotency concurrency test passes on PostgreSQL.
  - [x] Concurrent reservation idempotency conflict test (different payload) passes on PostgreSQL.
  - [x] 151 unique verification units pass on PostgreSQL (160 total units).
  - [x] `npm run lint` passes (0 errors).
  - [x] `npm run build` passes (Exit Code 0).
  - [x] No security regressions.
  - [x] Release documentation matches actual GitHub HEAD.
  - [x] No secrets committed.
- **Supervisor Gate**: Marked `READY FOR REVIEW`.

---

### Task 12: REL-012 — Final Release Candidate, Production Deployment Validation & Customer Handover Gate
- **Status**: `READY FOR REVIEW`
- **Objective**: Perform the final release-candidate, security audit, database validation, smoke tests, and customer-handover evaluation for the AbaCha platform.
- **Scope**:
  - Validated target Release SHA against the codebase.
  - Inspected production configurations, safety barriers, and deployment documentation.
  - Validated clean installation, compilation, linting, and 160-unit full regression test suite against PostgreSQL staging.
  - Conducted robust verification of authentication, tenant isolation, double-entry inventory ledger, storefront, and POS offline synchronization.
  - Documented payment capability simulation disclosures and backup operational handover risks.
  - Released comprehensive handover blueprint report `.ai/REL-012_FINAL_RELEASE_GATE.md`.
- **Dependencies**: `REL-011`
- **Acceptance Criteria**:
  - [x] Exact release SHA verified.
  - [x] `npm ci` passes successfully.
  - [x] `npm run lint` passes (0 errors).
  - [x] Complete unique test suite (160 units) passes with 100% success.
  - [x] Production bundle compilation succeeds with zero warnings.
  - [x] Real PostgreSQL staging migrations verified and health checks succeed.
  - [x] Authentication and tenant isolation integrity smoke tests succeed.
  - [x] Inventory, reservation, and idempotency race test successfully verified.
  - [x] Storefront storefront checkout, price authority, and POS offline queues verified.
  - [x] Payment gateway simulation disclosed and backup handover risks classified.
  - [x] Detailed release report created under `.ai/REL-012_FINAL_RELEASE_GATE.md`.
  - [x] All governance files updated.
  - [x] No credentials or secrets committed.
- **Supervisor Gate**: Marked `READY FOR REVIEW`.

---

### Task 12R1: REL-012R1 — Final Release Candidate Integrity Correction
- **Status**: `READY FOR REVIEW`
- **Objective**: Restore release-candidate integrity after the REL-012 documentation commit caused the current main branch to diverge from the approved REL-011R1 release candidate.
- **Scope**:
  - Restored the deterministic locked package-lock.json.
  - Audited post-REL-011R1 source code and test files to ensure exact parity with the approved candidate.
  - Verified linter, production bundler, and full 160-unit regression test suite with 100% success.
  - Updated final handover documentation to explicitly distinguish the Approved Application Baseline and the Final Documentation/Release HEAD commit SHAs.
- **Dependencies**: `REL-012`
- **Acceptance Criteria**:
  - [x] package-lock.json restored and committed.
  - [x] `npm ci` succeeds cleanly with zero dependency drift.
  - [x] Verified `reservationService.ts` matches approved REL-011R1 atomic savepoint transactional design.
  - [x] Verified `tests/production_gate.test.ts` checks are intact.
  - [x] Static compilation, formatting, and `npm run lint` pass with 0 errors.
  - [x] Run full PostgreSQL staging integration suite (160 unique verification units pass).
  - [x] No application source mutations introduced.
  - [x] Handover blueprint `.ai/REL-012_FINAL_RELEASE_GATE.md` updated with exact baseline and current release HEAD SHA metrics.
  - [x] No secrets committed.
- **Supervisor Gate**: Marked `READY FOR REVIEW`.

---

### Task 12R2: REL-012R2 — Final HEAD and Dependency Evidence Synchronization
- **Status**: `READY FOR REVIEW`
- **Objective**: Synchronize the final release documentation with the actual current GitHub main branch and accurately document the current dependency lockfile state.
- **Scope**:
  - Synchronized final release target HEAD hash to `2e6f9b9161d841aabec61ff27af1c887f67a5f97` in all reports.
  - Documented deterministic dependency lockfile status correctly with current SHA-256 validation.
  - Executed clean `npm ci` installation, `npm run lint`, production bundling, and 160-unit full regression testing suite with 100% success.
- **Dependencies**: `REL-012R1`
- **Acceptance Criteria**:
  - [x] Current main HEAD set to `2e6f9b9161d841aabec61ff27af1c887f67a5f97`.
  - [x] Approved Application Baseline clearly documented as `9ae4b7528aecd195a9167e1b2a060513cbf83223`.
  - [x] Lockfile claims accurately updated with SHA-256 footprint.
  - [x] Clean dependency `npm ci` succeeds.
  - [x] Static validation and linter checks pass with zero errors.
  - [x] Complete PostgreSQL staging integration test suite (160 units) runs and passes 100%.
  - [x] All compiled production assets built with 0 errors.
  - [x] No unapproved application source or logic mutations introduced.
  - [x] No credentials or secrets committed.
- **Supervisor Gate**: Marked `READY FOR REVIEW`.

---

### Task 12R3: REL-012R3 — Final Release HEAD Metadata Synchronization
- **Status**: `READY FOR REVIEW`
- **Objective**: Update release governance documents to reflect the actual current GitHub main HEAD (`2e6f9b9161d841aabec61ff27af1c887f67a5f97`).
- **Scope**:
  - Replaced stale documentation HEAD references with the correct actual current main branch HEAD (`2e6f9b9161d841aabec61ff27af1c887f67a5f97`).
  - Preserved the Approved Application Baseline (`9ae4b7528aecd195a9167e1b2a060513cbf83223`) and lockfile validation parameters.
  - Handled zero modifications to package-lock.json or application code files.
- **Dependencies**: `REL-012R2`
- **Acceptance Criteria**:
  - [x] Current actual main HEAD recorded in `.ai/REL-012_FINAL_RELEASE_GATE.md`, `.ai/IMPLEMENTATION_REPORT.md`, `.ai/TASK_QUEUE.md`, and `.ai/REVIEW_QUEUE.md`.
  - [x] No stale 2a1cc68 references remain in active REL-012 documentation.
  - [x] Approved Application Baseline remains `9ae4b7528aecd195a9167e1b2a060513cbf83223`.
  - [x] Lockfile SHA-256 checksum and descriptive paragraph remain intact exactly as documented.
  - [x] No application source code or test file modifications introduced.
  - [x] No credentials or secrets committed.
- **Supervisor Gate**: Marked `READY FOR REVIEW`.

---

### Task 13: UPG-001, UPG-001R1, UPG-001R2 & UPG-001R2.1 — Production Operations Hardening & Platform Controls
- **Status**: `APPROVED`
- **Parent Program**: `VERSION-2.6-UPGRADE` (`2.6.0-development`)
- **Objective**: Establish production operational architecture, strict 1:1 runtime environment contract, database URL validation, 4-gate deployment workflow (reproducibility, exact approved commit SHA deployment via parameterized hook, revision verification, health/ready), and public source-map blocking on dedicated branch `upgrade/v2.6/upg-001-platform-hardening`.
- **Scope**:
  - `server/config/environment.ts`: Centralized runtime environment validator ensuring strict 1:1 `DEPLOY_ENV` and `NODE_ENV` parity, generalized contradiction rejection for all 12 mismatch combinations, explicit rejection of unknown `NODE_ENV` values, decimal integer PORT validation, PostgreSQL connection URL protocol/host/db validation without error leakage, HTTPS `APP_URL` requirement in staging/production, and configurable cross-environment isolation.
  - `.github/workflows/production-deploy.yml`: 4 distinct deployment gates: Gate A (reproducible artifact digest verification), Gate B (exact approved commit deployment via parameterized Render hook with `ref=${APPROVED_COMMIT}` and fail-closed missing hook handling), Gate C (post-deploy runtime revision verification comparing `approved_commit_sha == deployed_runtime_revision`), and Gate D (health/readiness probes fail-closed).
  - `server.ts`: Exposes sanitized runtime revision identity (`/api/version` and `/api/health`) without credential leakage.
  - `.github/workflows/ci.yml`: Source-map exposure guard rejecting all `.map` files in `dist/`.
  - `package.json`: Source-map stripping from production server bundle build.
  - `tests/operational_hardening.test.ts`: Deterministic contract test suite with 26 test cases verifying all positive and negative failure paths, complete 12-pair contradiction matrix, unknown `NODE_ENV` handling, 4-gate workflow checks, exact-commit deploy URL construction (`?ref=` and `&ref=`), and commit-input SHA regex validation.
- **Dependencies**: None.
- **Acceptance Criteria**:
  - [x] Dedicated branch `upgrade/v2.6/upg-001-platform-hardening` maintained.
  - [x] `main` and frozen production baseline `9ae4b7528aecd195a9167e1b2a060513cbf83223` untouched.
  - [x] `DEPLOY_ENV` / `NODE_ENV` strictly 1:1 contract with generalized mismatch rejection implemented.
  - [x] Unknown `NODE_ENV` values rejected (never silently downgraded to development).
  - [x] `isProduction`, `isStaging`, `isTest`, `isDevelopment` proven mutually exclusive.
  - [x] Strict decimal integer PORT validation (`1-65535`) enforced.
  - [x] PostgreSQL connection URL validated (protocol, host, db) without credential leakage.
  - [x] HTTPS `APP_URL` enforced in staging/production with configurable cross-environment isolation.
  - [x] Production workflow Gate A documents reproducibility, not deployment identity.
  - [x] Production workflow Gate B validates `approved_commit_sha` matches `^[0-9a-f]{40}$`, deploys exact approved commit SHA via `ref=${APPROVED_COMMIT}`, and fails closed (`exit 1`) if `RENDER_PROD_DEPLOY_HOOK_URL` is missing.
  - [x] Production workflow Gate C verifies `approved_commit_sha == deployed_runtime_revision` and fails closed.
  - [x] Production workflow Gate D fails closed (`exit 1`) on health probe failure.
  - [x] Source maps blocked on server route and stripped from deployable build output.
  - [x] 26/26 operational tests pass deterministically (including test 8.3 deploy URL tests and test 8.4 commit SHA validation).
  - [x] 9/9 production gate tests pass deterministically.
  - [x] Full regression suite (186 tests across 12 suites) passes 100%.
  - [x] `npm run lint` passes with 0 errors.
  - [x] Zero secrets committed.
- **Supervisor Gate**: Officially `APPROVED` and CLOSED by Supervisor on 2026-09-12.

---

### Task 14: UX-001A — Multi-Tenant Storefront Modernization
- **Status**: `IN PROGRESS`
- **Parent Program**: `VERSION-2.6-UPGRADE` (`2.6.0-development`)
- **Objective**: Transform the existing client-centric prototype storefront into a professional, responsive, accessible, server-authoritative, multi-tenant commerce storefront.
- **Scope**:
  - **Phase 1 Baseline Audit & Corrections**:
    - Inspected 15 storefront components, contexts, and API routes; documented client-authoritative state leaks, missing public tenant resolution, and hardcoded commercial claims.
    - Implemented server-authoritative storefront context (`GET /api/storefront/context`, `GET /api/storefront/:tenantSlug/context`), tenant resolver (`tenantResolver.ts`), and database schema extension (`011_storefront_tenant_config.sql`).
    - Implemented reverse-proxy trust boundary (`X-Forwarded-Host`, `X-Tenant-Domain`), path vs. domain mismatch guards (HTTP 400 `TENANT_MISMATCH`), and strict canonical fallback isolation.
    - Extended and executed migration 011 deterministic backfill, uniqueness preservation, collision disambiguation, and verified safe rollback.
    - Reconciled all 14 Acceptance Criteria and 8 Supervisor Test Suites (22/22 PASSED, 0 FAILED).
  - **Phase 2 URL Routing & State Architecture**: Native lightweight HTML5 History router (`/shop`, `/shop/category/:slug`, `/product/:slug`, `/cart`, `/checkout`, `/account`, `/order/:orderNumber`) and dedicated `StorefrontContext.tsx` (Pending Supervisor Authorization).
  - **Phase 3 & 4 Modern Modular Storefront Components**: Modular product detail, responsive filters, and accessible commerce components.
- **Dependencies**: `UPG-001` (Closed)
- **Acceptance Criteria**:
  - [x] Architectural baseline audit and data flow trace completed.
  - [x] Architecture specification `.ai/UX-001A_STOREFRONT_ARCHITECTURE.md` delivered.
  - [x] Implementation roadmap `.ai/UX-001A_STOREFRONT_IMPLEMENTATION_PLAN.md` delivered.
  - [x] Acceptance test specification `.ai/UX-001A_STOREFRONT_ACCEPTANCE_TESTS.md` delivered.
  - [x] Migration `011_storefront_tenant_config.sql` implemented, deterministic backfill verified, and unique indexes added.
  - [x] Server storefront API endpoints implemented with strict tenant isolation.
  - [x] Reverse-proxy trust model implemented and verified against spoofing.
  - [x] Strict production negative tests for canonical fallback passing (H1-H6).
  - [ ] Frontend lightweight URL router and dedicated `StorefrontContext` implemented (Phase 2).
  - [ ] Modular storefront UI components implemented (Phase 3).
  - [ ] Server-authoritative cart and checkout integrated (Phase 4).
  - [ ] WCAG 2.2 AA accessibility and responsive breakpoints verified (Phase 5).
  - [x] Automated multi-tenant storefront integration tests passing 100% (`tests/storefront_multi_tenant.test.ts` 22/22 passed).
  - [x] Full regression test suite remains green (`npm test` 13 suites passed, 208/208 tests).
- **Supervisor Gate**: Phase 1 Foundation & Final Verification Corrections completed (22/22 PASSED); ready for Phase 2 Frontend Architecture authorization.



