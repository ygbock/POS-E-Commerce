# Engineering Task Queue & Strategic Roadmap

> **Document Version**: 1.0.0  
> **Status**: Active Execution Backlog  
> **Authority**: Human Developer / Supervisor  

---

## Strategic Roadmap Overview

```text
BASELINE-001 (COMPLETED)
     ↓
ARCH-001 (IN PROGRESS)
     ↓
DATA-001 (NOT STARTED)
     ↓
SEC-001 (NOT STARTED)
     ↓
INV-001 (NOT STARTED)
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
- **Status**: `READY FOR REVIEW`
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
- **Status**: `NOT STARTED`
- **Objective**: Introduce durable server-side relational database persistence (Cloud SQL / PostgreSQL or Firestore) to replace ephemeral in-memory arrays and client `localStorage`.
- **Scope**:
  - Define relational schema / ORM models for Products, Categories, Brands, Stock, Orders, Customers, Shifts, and General Ledger.
  - Create database migration scripts and connection pooling in backend server.
  - Provide database seed scripts with existing catalog and initial chart of accounts.
- **Dependencies**: `ARCH-001`.
- **Acceptance Criteria**:
  - Database schema models all core entities with proper primary keys, foreign keys, and indexes.
  - Database migrations execute cleanly up and down.
  - Backend server connects reliably with environment-driven credentials.
- **Security Requirements**: Database credentials stored in `.env.example`, SSL connection enforced, SQL injection prevented via parameterized queries.
- **Validation Requirements**: Migration run logs, schema inspection, database connectivity test.

---

### Task 4: SEC-001 — Server-Side Authentication & RBAC Boundaries
- **Status**: `NOT STARTED`
- **Objective**: Implement secure server-side user authentication and role-based access control (RBAC) middleware.
- **Scope**:
  - Implement token verification middleware (JWT / Session token).
  - Define user roles (`Admin`, `StoreManager`, `Cashier`, `WarehouseStaff`, `Accountant`, `Customer`).
  - Protect all `/api/*` endpoints with authentication and permission checks.
- **Dependencies**: `DATA-001`.
- **Acceptance Criteria**:
  - Unauthenticated requests to protected endpoints return HTTP 401 Unauthorized.
  - Unauthorized roles return HTTP 403 Forbidden.
  - Client state role indicators synchronised with verified server token payload.
- **Security Requirements**: No trust in client-asserted role; cryptographic signature verification on tokens.
- **Validation Requirements**: Positive and negative authentication unit tests for each role.

---

### Task 5: INV-001 — Server-Authoritative Inventory Ledger & Movement Tracking
- **Status**: `NOT STARTED`
- **Objective**: Replace client-side stock mutation with a server-authoritative double-entry inventory movement ledger.
- **Scope**:
  - Create `InventoryMovement` entity and `InventoryService`.
  - Implement atomic stock reservation and allocation APIs.
  - Enforce concurrency locks on stock to prevent overselling.
  - Support multi-location transfer requests and approvals.
- **Dependencies**: `DATA-001`, `SEC-001`.
- **Acceptance Criteria**:
  - All stock changes backed by an immutable ledger record.
  - Concurrent checkout attempts on limited stock safely reject over-allocation.
  - Stock audit trail verifiable by location and product variant.
- **Security Requirements**: Only authorized roles can execute stock adjustments and write-offs.
- **Validation Requirements**: Concurrency load test simulating race conditions on stock = 1.

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
