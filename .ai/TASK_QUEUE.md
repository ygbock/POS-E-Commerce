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
- **Status**: `UX-001 Phase 2.1 R1 — READY FOR SUPERVISOR REVIEW`
- **Phase 1 Deliverables**: Completed Comprehensive UI/UX Audit ([.ai/UX_AUDIT.md](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/.ai/UX_AUDIT.md)) and UX Modernization Implementation Plan ([.ai/UX_IMPLEMENTATION_PLAN.md](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/.ai/UX_IMPLEMENTATION_PLAN.md)), approved with conditions on 2026-09-10.
- **Phase 2.1 Deliverables**: Implemented baseline design system primitives (`Button`, `Input`, `Select`, `Modal`, `Card`, `Badge`, `Table`, `Toast` stack, `Spinner`, `Skeleton`), global `ErrorBoundary` protection in `src/components/ui/`, security hardening for exception handling, and full modal accessibility/focus trapping.
- **Objective**: Modernize frontend UX incrementally starting with common design primitives and error wrappers, progressing to server authoritative integration, offline resilience, and mobile responsive layout fixes.
- **Scope**:
  - [x] Phase 1: Exhaustive frontend inspection, P0/P1/P2/P3 finding categorization, user journey audits, WCAG 2.2 AA target assessment, responsive audit, security authority UX audit, component primitive strategy, phase-by-phase implementation plan.
  - [x] Phase 2.1: Build lightweight, high-performance `src/components/ui/` shared design primitives, setup Toast Provider, mount top-level SPA Error Boundary, secure exception details, and verify modal access IDs.
  - [ ] Phase 2.2: Migrate POS checkout, Inventory movements/transfers, and Storefront orders to server-authoritative API paths.
  - [ ] Phase 2.3: Integrate IndexedDB offline POS queueing with encryption, replay protection, and device-binding constraints.
  - [ ] Phase 2.4: Remediate modal accessibility (focus trapping, escape listeners) and map global POS keyboard hotkeys.
  - [ ] Phase 2.5: Calibrate mobile touch targets and ensure horizontal scroll wraps for complex tables.
- **Dependencies**: `POS-001`, `API-001`, `QA-001`.
- **Acceptance Criteria**:
  - [x] Phase 1: UX Audit Report and Implementation Plan submitted and approved.
  - [x] Phase 2.1: Custom UI primitives created, Toast stack fully functional, top-level SPA error boundary mounted and verified.
  - [ ] Phase 2.2: All key client-mutations route to secure server REST API endpoints.
  - [ ] Phase 2.3: POS continues ringing items when offline and automatically syncs queue on reconnect.
  - [ ] Phase 2.3: Network state indicator visual badge displayed.
- **Security Requirements**: Offline queue items encrypted locally before sync.
- **Validation Requirements**: Network throttling and offline simulation tests.

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

