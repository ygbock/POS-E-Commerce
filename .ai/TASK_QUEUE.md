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
DATA-001 (READY FOR REVIEW)
     ↓
SEC-001 (APPROVED)
     ↓
INV-001 (READY FOR REVIEW)
     ↓
POS-001 (NOT STARTED)
     ↓
API-001 (NOT STARTED)
     ↓
QA-001 (NOT STARTED)
     ↓
UX-001 (NOT STARTED)
     ↓
PROD-001 (NOT STARTED)
```

---

## Active & Scheduled Tasks

### Task 1: BASELINE-001 — Repository Baseline Assessment
- **Status**: `COMPLETED`
- **Objective**: Conduct comprehensive code inspection of the existing Omnicore codebase, mapping out dependencies, module topologies, state management strategies, API endpoints, and existing risks.
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
- **Status**: `READY FOR REVIEW`
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
- **Status**: `READY FOR REVIEW`
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
- **Status**: `READY FOR REVIEW`
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
- **Acceptance Criteria**:
  - [x] Zero occurrences of `org_default` or optional tenant fallbacks in the inventory domain.
  - [x] In-transit balance accounting verified: dispatch moves stock to `in_transit`, receipt clears `in_transit`.
  - [x] Discrepancies record variance quantity and append `VARIANCE_RECORDED` to ledger.
  - [x] Over-receipt protection rejects attempts to receive more than dispatched.
  - [x] Cancellation disallowed on transfers in transit or completed.
  - [x] Idempotency keys prevent double dispatch/receipt.
  - [x] Full test suite passes: `npm run test` (57/57 passed across persistence, security, inventory, and transfer suites).
  - [x] Linter (`tsc --noEmit`) and build (`compile_applet`) pass cleanly.
- **Supervisor Hold**: Awaiting human supervisor review and approval before proceeding to `POS-001`. Do NOT start `POS-001`.

---

### Task 6: POS-001 — Server-Authoritative POS Checkout & Financial Calculation Engine
- **Status**: `NOT STARTED`
- **Objective**: Shift POS checkout, price calculations, tax lookups, and discount validations from the browser into transactional server API operations.
- **Scope**:
  - Implement `POST /api/pos/checkout` executing within an atomic database transaction.
  - Server recomputes all item line prices, discounts, and taxes.
  - Atomic stock deduction and automated General Ledger journal entry generation on successful checkout.
  - Shift management APIs (open float, cash drops, close shift reconciliation).
- **Dependencies**: `INV-001`.
- **Acceptance Criteria**:
  - Client-submitted totals are ignored; backend computes authoritative final totals.
  - Order, stock movement, and financial journal entries committed atomically.
  - Failed payments or stock shortages roll back entire transaction.
- **Security Requirements**: Prevent client price tampering; audit trail for price overrides.
- **Validation Requirements**: Automated integration tests verifying atomic commit and rollback on tender failure.

---

### Task 7: API-001 — Comprehensive REST API Hardening & DTO Validation
- **Status**: `NOT STARTED`
- **Objective**: Harden all REST API endpoints with strict schema validation (Zod DTOs), rate limiting, and idempotency keys.
- **Scope**:
  - Add schema validation middleware across all route handlers.
  - Add `Idempotency-Key` header support for checkout and payment routes.
  - Standardize error response format (`{ success: false, error: { code, message, details } }`).
- **Dependencies**: `POS-001`.
- **Acceptance Criteria**:
  - Malformed or unknown fields in request body return HTTP 400 with structured validation errors.
  - Duplicate requests with identical idempotency key return cached original response without reprocessing.
- **Security Requirements**: Prevent mass-assignment vulnerabilities and payload tampering.
- **Validation Requirements**: Fuzzing test payloads against API schema validators.

---

### Task 8: QA-001 — Automated Quality Verification, Test Suite & CI Gates
- **Status**: `NOT STARTED`
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
- **Status**: `NOT STARTED`
- **Objective**: Harden client UI for real-world retail store conditions, including network drops and scanner ergonomics.
- **Scope**:
  - Offline sales queueing in IndexedDB with automated background sync upon reconnection.
  - User-friendly network status indicators and sync conflict resolution.
  - Comprehensive error boundary protection and responsive toast alerts.
- **Dependencies**: `POS-001`.
- **Acceptance Criteria**:
  - POS can continue ringing items when offline and syncs transactions when back online.
  - Clear visual indicator of online/offline/syncing state.
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
