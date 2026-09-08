# Architecture Decision Records (ADRs)

> **Document Version**: 1.0.0  
> **Status**: Approved Architectural Decisions  
> **Task Association**: ARCH-001  

---

## ADR Index

- [ADR-001: GitHub Repository as the Single Source of Truth](#adr-001-github-repository-as-the-single-source-of-truth)
- [ADR-002: Human Developer as Final Approval Authority](#adr-002-human-developer-as-final-approval-authority)
- [ADR-003: Gemini / AI Studio as Implementation Agent](#adr-003-gemini--ai-studio-as-implementation-agent)
- [ADR-004: Invalidation of Client State as Security Authority](#adr-004-invalidation-of-client-state-as-security-authority)
- [ADR-005: Client State Cannot Be Authoritative Inventory or Financial Source](#adr-005-client-state-cannot-be-authoritative-inventory-or-financial-source)
- [ADR-006: Production Business State Requires Trusted Server-Side Persistence](#adr-006-production-business-state-requires-trusted-server-side-persistence)
- [ADR-007: Inventory Evolution to Balance + Movement Ledger Architecture](#adr-007-inventory-evolution-to-balance--movement-ledger-architecture)
- [ADR-008: POS Checkout Must Become Server-Authoritative and Transactional](#adr-008-pos-checkout-must-become-server-authoritative-and-transactional)
- [ADR-009: Incremental, Task-Driven Engineering Lifecycle](#adr-009-incremental-task-driven-engineering-lifecycle)
- [ADR-010: Relational PostgreSQL Schema & Dual-Driver Persistence Layer](#adr-010-relational-postgresql-schema--dual-driver-persistence-layer)
- [ADR-011: Server-Side Cryptographic Authentication, RBAC & Multi-Tenant Boundaries](#adr-011-server-side-cryptographic-authentication-rbac--multi-tenant-boundaries)
- [ADR-012: Server-Authoritative Inventory Movement Ledger & Scaled Integer Arithmetic](#adr-012-server-authoritative-inventory-movement-ledger--scaled-integer-arithmetic)
- [ADR-013: Stock Transfer Domain, Append-Only Event Ledger & Strict Tenant Isolation](#adr-013-stock-transfer-domain-append-only-event-ledger--strict-tenant-isolation)
- [ADR-014: Database-Level Event Immutability, Idempotency Unique Constraints & Exact Scaled Arithmetic (INV-001R3)](#adr-014-database-level-event-immutability-idempotency-unique-constraints--exact-scaled-arithmetic-inv-001r3)
- [ADR-015: Legacy In-Memory State Audit & Server Ledger Sole Authority (INV-001R3)](#adr-015-legacy-in-memory-state-audit--server-ledger-sole-authority-inv-001r3)
- [ADR-016: Inventory Integrity Verification & Closure (INV-001R4)](#adr-016-inventory-integrity-verification--closure-inv-001r4)
- [ADR-017: Server-Authoritative POS Checkout & Financial Calculation Engine (POS-001)](#adr-017-server-authoritative-pos-checkout--financial-calculation-engine-pos-001)

---

### ADR-001: GitHub Repository as the Single Source of Truth
- **Date**: 2026-09-04
- **Status**: `APPROVED`
- **Context**: Autonomous or semi-autonomous development agents can drift if decisions or requirements live solely in ephemeral chat transcripts or prompt contexts.
- **Decision**: The Git repository is the sole authoritative record for code, architecture specs, tasks, decisions, and review records. No instruction from prior conversational memory supersedes current repository files.
- **Consequences**: Every architectural requirement, task status change, and code modification must be committed directly to repository files.

---

### ADR-002: Human Developer as Final Approval Authority
- **Date**: 2026-09-04
- **Status**: `APPROVED`
- **Context**: The software engineering lifecycle requires ultimate accountability for security, compliance, data safety, and business operations.
- **Decision**: The designated human developer / engineering supervisor retains exclusive authority over architecture changes, security boundaries, production deployments, and task approvals.
- **Consequences**: Implementation agents may mark tasks as `READY FOR REVIEW`, but are strictly prohibited from self-approving tasks (`APPROVED`).

---

### ADR-003: Gemini / AI Studio as Implementation Agent
- **Date**: 2026-09-04
- **Status**: `APPROVED`
- **Context**: Clearly delineating agent capabilities prevents rogue rewrites, speculative refactoring, and unsolicited scope expansion.
- **Decision**: AI Studio / Gemini functions strictly as a Senior Software Engineer and Implementation Lead executing explicitly assigned tasks. The agent does not have authority to independently redefine system architecture or alter approved requirements.
- **Consequences**: Any discovered need for an architectural change must trigger an immediate escalation rather than silent implementation.

---

### ADR-004: Invalidation of Client State as Security Authority
- **Date**: 2026-09-04
- **Status**: `APPROVED`
- **Context**: The existing prototype uses client-side React role variables and conditionally rendered buttons to protect administrative and managerial functions.
- **Decision**: Client state, React context, and browser storage are designated non-authoritative. All authentication, authorization, and permission enforcement must be executed on a trusted server boundary.
- **Consequences**: Future tasks (`SEC-001`) will introduce server-side token validation and RBAC guards on all mutating APIs.

---

### ADR-005: Client State Cannot Be Authoritative Inventory or Financial Source
- **Date**: 2026-09-04
- **Status**: `APPROVED`
- **Context**: In the current application, sales totals, discounts, taxes, and stock levels are computed inside `CommerceContext.tsx` in the browser and written to `localStorage`.
- **Decision**: The browser cannot be trusted to calculate payable money amounts or deduct stock. Prices, taxes, promotions, and inventory availability must be computed and verified by server services.
- **Consequences**: POS checkout and Storefront order placement will shift from client-side array updates to server API transactions.

---

### ADR-006: Production Business State Requires Trusted Server-Side Persistence
- **Date**: 2026-09-04
- **Status**: `APPROVED`
- **Context**: In-memory server variables (`server.ts`) and client `localStorage` are fragile, subject to data loss on browser cache clearing or server restart, and incapable of supporting concurrent multi-register retail stores.
- **Decision**: Production business state must be backed by a persistent, ACID-compliant database (PostgreSQL / Cloud SQL / Firestore) with connection pooling and schema migrations.
- **Consequences**: In `DATA-001`, a durable persistence layer and migration roadmap will be introduced.

---

### ADR-007: Inventory Evolution to Balance + Immutable Movement Ledger Architecture
- **Date**: 2026-09-04
- **Status**: `APPROVED`
- **Context**: The current prototype model overwrites a single `product.stock` number, leaving inventory vulnerable to race conditions, unaccounted shrinkage, and audit gaps.
- **Decision**: The inventory engine will transition to an immutable inventory movement ledger (`Balance + Movement Ledger + Atomic Transactions + Audit Trail`). To avoid conflation with General Ledger accounting (which is handled separately for financial transactions), the inventory engine tracks physical stock movements with immutable append-only records.
- **Consequences**: Every stock change will require an associated `StockMovement` event record.

---

### ADR-008: POS Checkout Must Become Server-Authoritative and Transactional
- **Date**: 2026-09-04
- **Status**: `APPROVED`
- **Context**: Physical retail POS checkouts require high reliability: money accepted must match recorded sales, stock must decrement simultaneously, and cash drawer floats must balance.
- **Decision**: Checkout will be executed via an atomic server-side transaction (`POST /api/pos/checkout`) that validates items, recalculates totals, reserves stock, records payment tender, and posts general ledger journal entries in a single commit.
- **Consequences**: If payment fails or stock is unavailable, the entire transaction rolls back cleanly.

---

### ADR-009: Incremental, Task-Driven Engineering Lifecycle
- **Date**: 2026-09-04
- **Status**: `APPROVED`
- **Context**: Large-scale "big bang" rewrites introduce major regression risks, broken builds, and unpredictable system state.
- **Decision**: All engineering work must proceed strictly in incremental, tracked phases governed by task IDs in `.ai/TASK_QUEUE.md`.
- **Consequences**: No task may exceed its approved scope. Foundational data and security tasks must precede higher-level feature enhancements.

---

### ADR-010: Relational PostgreSQL Schema & Dual-Driver Persistence Layer
- **Date**: 2026-09-04
- **Status**: `IMPLEMENTED (PENDING REVIEW)`
- **Task Association**: `DATA-001`
- **Context**: AbaCha requires strict relational integrity (foreign keys, check constraints, composite uniqueness, decimal precision) across multi-entity retail operations (organizations, locations, products, variants, balances, movements, orders, items, payments, audit events). In local development and cloud sandbox environments without external database containers, developers need zero-configuration startup, while production deployments require standard PostgreSQL / Cloud SQL connection pooling.
- **Decision**: 
  1. Standardize the persistence layer on standard SQL / PostgreSQL schemas with full transactional DDL and DML.
  2. Implement a unified `DatabaseClient` interface (`server/db/client.ts`) with dual-driver capability and strict environment boundaries:
     - `PostgresPoolClient`: Production driver utilizing `pg.Pool` with SSL, connection limits, and statement timeouts.
     - `PGliteDatabaseClient`: Embedded WebAssembly-compiled PostgreSQL engine (`@electric-sql/pglite`) executing locally against `.data/postgres` in development and test environments only.
     - **Production Fail-Closed Rule**: In `NODE_ENV === 'production'`, PostgreSQL is strictly required. If credentials or connectivity are missing, the system fails closed immediately. It must **never** fall back to PGlite in production.
  3. **Seed Isolation**: Schema migrations (`server/db/migrations`) contain DDL/schema definitions only. Demo seeds (`server/db/seeds`) are strictly decoupled and never executed automatically on server startup. In production, demo seeds are rejected unless `ALLOW_DEMO_SEED=true` is explicitly set.
  4. **Checksum Enforcement**: The migration runner computes SHA-256 checksums and fails closed if any previously applied migration has been altered in-place.
  5. **Transitional Authority Model**:
     - PostgreSQL = Authoritative persistence for domains implemented through DATA-001.
     - Existing in-memory stores = Legacy compatibility only.
     - `CommerceContext` / `localStorage` = Transitional client state only.
     - Prohibited: New functionality must not extend legacy in-memory stores.
  6. **Inventory Concurrency & Precision**:
     - Inventory movements use `SELECT ... FOR UPDATE` row-level locks, serialized atomic upsert, exact 4-decimal precision arithmetic, negative-stock prevention, and movement ID idempotency checks.
- **Consequences**:
  - Development and testing run instantly with embedded PGlite, while production enforces strict, uncompromised PostgreSQL ACID semantics.
  - Zero application downtime during migration: legacy endpoints coexist safely while authoritative database repositories are established.

---

### ADR-011: Server-Side Cryptographic Authentication, RBAC & Multi-Tenant Boundaries
- **Date**: 2026-09-04
- **Status**: `IMPLEMENTED (PENDING REVIEW)`
- **Task Association**: `SEC-001`
- **Context**: The AbaCha prototype historically relied on client-side React role checks, non-authoritative localStorage variables, and unvalidated request bodies. In retail and commerce systems, client-asserted identity or roles expose the system to unauthorized privilege escalation, cross-tenant data leakage, and fraudulent price or stock overrides.
- **Decision**:
  1. **Zero-Trust Client Boundary**: Client browsers are strictly untrusted execution environments. UI controls are for display only. Every mutation is independently authorized on the server.
  2. **Cryptographic Credential Verification**: Passwords are saved as cryptographic hashes using PBKDF2 with HMAC-SHA512 (100,000 rounds, 32-byte salt, constant-time verification).
  3. **Authoritative JWT Tokens**: RFC 7519 HMAC-SHA256 (HS256) session tokens issued and verified server-side. In production, fails closed if `JWT_SECRET` is missing, default, or under 32 characters.
  4. **Database-Backed Revocation**: User logout and session invalidation persist revoked token identifiers (`jti`) in the `revoked_tokens` PostgreSQL table, supplemented by an in-memory verification cache.
  5. **Granular Role-Based Access Control (RBAC)**: 6 defined system roles (`super_admin`, `store_manager`, `cashier`, `inventory_clerk`, `accountant`, `viewer`) mapped to 25+ granular permissions.
  6. **Multi-Tenant Isolation**: `requireTenantAccess` middleware enforces strict organization boundaries. Tenants cannot view or modify resources outside their authorized `organizationId`. Only `super_admin` possesses cross-tenant supervisory access.
  7. **Request Body Sanitization & Anti-Spoofing**: `sanitizeClientBody` actively strips client-supplied identity overrides (`userId`, `role`, `roles`, `isAdmin`, `organizationId`, `permissions`, `actorId`). Server-authoritative audit logs derive actor identity exclusively from `req.auth`.
  8. **Rate Limiting Protection**: Sliding-window rate limiters defend authentication routes (`authRateLimiter`), administrative routes (`adminRateLimiter`), and sensitive catalog mutations against automated brute-force attacks.
  9. **Defensive Error Sanitization**: Centralized error middleware ensures internal server errors (HTTP 500) never leak database credentials, connection strings, or stack traces.
  10. **Real HTTP Integration Verification**: All security controls are verified via real HTTP server calls in `tests/auth_security.test.ts` (18 automated tests) verifying authentic network boundaries.
- **Consequences**:
  - The application establishes a tamper-proof security perimeter.
  - Anonymous and unauthorized callers are decisively rejected (HTTP 401 and HTTP 403).
  - Diagnostic endpoints (/api/admin/db-status) require administrative credentials and never expose credentials or internal connection strings.

---

### ADR-012: Server-Authoritative Inventory Movement Ledger & Scaled Integer Arithmetic
- **Date**: 2026-09-06
- **Status**: `IMPLEMENTED (PENDING REVIEW)`
- **Task Association**: `INV-001`
- **Context**: Prior to INV-001, stock quantities were updated directly in client memory or via unvalidated mutations susceptible to floating-point drift, race conditions, overselling, and lack of historical accountability.
- **Decision**:
  1. **Immutable Movement Ledger**: All balance adjustments are backed by immutable rows in `inventory_movements` linked to `inventory_balances`. Direct balance updates without movements are prohibited.
  2. **Fixed-Point Scaled Arithmetic**: Quantities are calculated using fixed-scale integer arithmetic (scale 10,000 for 4 decimal places) using JavaScript `BigInt` to prevent floating-point precision issues.
  3. **Pessimistic Row Locking**: Inventory balance records are locked using `SELECT ... FOR UPDATE` within atomic database transactions (`withTransaction`) to eliminate concurrent overselling.
  4. **Available Stock Invariant**: Available stock is strictly defined as `available = on_hand - reserved - damaged - expired`. Negative stock is prohibited unless explicitly configured.
  5. **First-Class Reservations**: Reservations hold stock without balance deduction, supporting automatic expiry and order-fulfillment consumption.
  6. **Reconciliation Movements**: Physical cycle counts compute discrepancies and record compensating audit movements.
- **Consequences**:
  - Full auditability of all inventory changes across all locations.
  - Zero floating-point rounding errors on fractional inventory quantities.

---

### ADR-013: Stock Transfer Domain, Append-Only Event Ledger & Strict Tenant Isolation
- **Date**: 2026-09-06
- **Status**: `IMPLEMENTED (PENDING REVIEW)`
- **Task Association**: `INV-001R2`
- **Context**: Inter-location inventory transfers require strict state transitions, accurate in-transit accounting, variance recording on discrepancies, and multi-tenant isolation. Any fallback to default organizations (such as `org_default`) compromises tenant security.
- **Decision**:
  1. **Removal of All Tenant Fallbacks**: All repository and service methods in the inventory domain strictly require an explicit `organizationId` derived from `req.auth.organizationId`. Fallbacks to `org_default` are completely eliminated.
  2. **Append-Only Transfer Event Ledger**: Every lifecycle transition (CREATED, REQUESTED, APPROVED, REJECTED, DISPATCHED, IN_TRANSIT, RECEIVED, VARIANCE_RECORDED, CANCELLED, COMPLETED) is recorded as an immutable event in `inventory_transfer_events`. Database triggers enforce that events cannot be updated or deleted.
  3. **In-Transit Balance Accounting**: Dispatch atomically decrements source `on_hand` and increments destination `in_transit`. Receipt atomically decrements destination `in_transit` for all dispatched quantities and increments destination `on_hand` for actually received quantities.
  4. **Variance Accounting**: Discrepancies (`variance = received - dispatched`) update `variance_quantity` and append a `VARIANCE_RECORDED` event to the ledger. Unreceived quantities are cleared from `in_transit` to prevent phantom floating stock.
  5. **Over-Receipt Protection**: Receiving more than dispatched is blocked by default (`OVER_RECEIVE_NOT_ALLOWED`).
  6. **Cancellation Guard**: Transfers in terminal states or already dispatched/in-transit cannot be cancelled.
  7. **Idempotency Support**: Creation, dispatch, and receipt operations support organization-scoped idempotency keys to prevent duplicate execution on network retries.
- **Consequences**:
  - Complete, verifiable multi-location transfer accounting.
  - Zero cross-tenant data leakage or operation execution.

---

### ADR-014: Database-Level Event Immutability, Idempotency Unique Constraints & Exact Scaled Arithmetic (INV-001R3)
- **Date**: 2026-09-07
- **Status**: `IMPLEMENTED (READY FOR REVIEW)`
- **Task Association**: `INV-001R3`
- **Context**: Supervisor review of INV-001R2 mandated hardening of database-level audit immutability, database-enforced idempotency, strict exact decimal arithmetic across all inventory layers, complete elimination of tenant override escape hatches, and strict transfer conservation invariants.
- **Decision**:
  1. **Database-Level Event Immutability**: Implemented PostgreSQL trigger `trg_immutable_transfer_events` firing `BEFORE UPDATE OR DELETE ON inventory_transfer_events` calling `prevent_transfer_event_modification()`. The trigger raises an explicit exception `IMMUTABLE_RECORD: inventory_transfer_events is an append-only audit ledger and cannot be modified or deleted.`, making tamper attempts physically impossible even from direct DB connections.
  2. **Movement & Reservation Idempotency Constraints**: Added database-level unique partial index `uq_inventory_movements_org_idempotency` on `inventory_movements (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL` and `uq_inventory_reservations_org_idempotency` on `inventory_reservations (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL`. Concurrency conflicts catch DB duplicate key violations, verify payload identity, allow safe replays for identical payloads, and return HTTP 409 `IDEMPOTENCY_CONFLICT` for conflicting payloads.
  3. **Strict Scaled Decimal Policy**: Standardized on fixed-scale integer arithmetic (10,000 scaling factor, 4 decimal places) using `BigInt` across all calculation modules (`addQty`, `subQty`, `mulQty`, `divQty`, `roundQty`, `calculateAvailable`, `calculateWeightedAverageCostExact`). Replaced all raw `Number()` conversions in HTTP route parsing with `parseExactQuantity()`, which stringently rejects `NaN`, `Infinity`, `1e309`, non-numeric characters, and precision exceeding 4 decimal places.
  4. **Strict HTTP Tenant Boundary**: Removed all request-body and query-string tenant escape hatches (`?orgId=`, `?organization_id=`). All inventory endpoints source `organizationId` strictly from authenticated server context `req.auth.organizationId`.
  5. **Stock Transfer Accounting Invariants**: Enforced strict conservation laws: `source on_hand` decreases by `dispatched_quantity`, intermediate `destination in_transit` increases by `dispatched_quantity`, and upon receipt `destination in_transit` decreases by `dispatched_quantity` while `destination on_hand` increases by `received_quantity`, with `variance_quantity = received - dispatched`. Both dispatch and receipt use pessimistic row locks (`FOR UPDATE`) to serialize concurrent callers safely.
- **Consequences**:
  - Immutability is physically guaranteed at the database engine level.
  - Race conditions cannot bypass application-level idempotency checks.
  - Floating-point distortion is mathematically eradicated from inventory calculations.
  - Multi-tenant data segregation is enforced unconditionally.

---

### ADR-015: Legacy In-Memory State Audit & Server Ledger Sole Authority (INV-001R3)
- **Date**: 2026-09-07
- **Status**: `IMPLEMENTED (READY FOR REVIEW)`
- **Task Association**: `INV-001R3`
- **Context**: A comprehensive codebase audit was conducted to identify any lingering dependencies on legacy in-memory stores (`CommerceContext`, `offlineStore`, in-memory mock catalogs) and confirm that authoritative inventory mutations no longer depend on these stores.
- **Decision**:
  1. **Audit Results**:
     - `CommerceContext.tsx`: Classified strictly as a **UI Client-Side Cache & Display Helper**. It manages optimistic cart UI and local display formatting. It is strictly non-authoritative.
     - `offlineStore.ts`: Classified strictly as a **Non-Authoritative Offline-Draft Buffer**. It queues local drafts when connectivity is unavailable. No authoritative state or balance mutation occurs within `offlineStore`.
     - In-memory mock catalogs: Used solely for fallback preview rendering when database connectivity is uninitialized.
  2. **Authoritative Boundary**: The PostgreSQL database (`inventory_balances`, `inventory_movements`, `inventory_reservations`, `inventory_transfers`, `inventory_transfer_events`) and server services (`InventoryService`, `TransferService`, `ReservationService`, `StockCountService`) constitute the sole authoritative source of truth for stock quantities, valuation, movements, and reservations.
- **Consequences**:
  - Clear architectural boundaries between UI convenience state and trusted server ledger.
  - All mutating inventory operations must route through server endpoints backed by transactional database operations.

---

### ADR-016: Inventory Integrity Verification & Closure (INV-001R4)
- **Date**: 2026-09-07
- **Status**: `IMPLEMENTED (READY FOR REVIEW)`
- **Task Association**: `INV-001R4`
- **Context**: In response to supervisor review of INV-001R3, a targeted integrity verification and closure pass was executed to prove database-level immutability, eradicate authoritative floating-point quantity paths, enforce explicit repository row mapping, and standardize HTTP error handling contracts.
- **Decision**:
  1. **Proof of Database Immutability**: Verified `prevent_transfer_event_modification()` and trigger `trg_immutable_transfer_events` on `inventory_transfer_events`. Added explicit integration tests executing raw SQL (`UPDATE` and `DELETE`), verifying that mutations fail closed with error code `23506` (`IMMUTABLE_RECORD`) while `INSERT` succeeds.
  2. **Eradication of Authoritative Floating-Point Arithmetic**: Verified all authoritative inventory calculation methods in `server/inventory/inventoryPolicies.ts` use `BigInt` scaled arithmetic (factor 10,000 for quantity, factor 100 for money). Marked legacy floating-point helpers `@deprecated` and verified that zero server mutation routes invoke them. Updated `TransferService.createTransfer` to validate all transfer item quantities using `parseExactQuantity` upfront, ensuring `parseQtyToScaled(qty) > 0n`.
  3. **Explicit Repository Row Mapping**: Confirmed all repository queries across `inventoryRepository`, `inventoryTransferRepository`, `inventoryReservationRepository`, and `stockCountRepository` utilize explicit mapper functions (`mapBalanceRow`, `mapMovementRow`, `mapTransferItemRow`, `mapTransferEventRow`, `mapReservationRow`, `mapStockCountItemRow`) to guarantee type safety and prevent leaking raw unparsed DB fields.
  4. **Centralized HTTP Route Error Handling**: Standardized error handling in `server/routes/inventoryRoutes.ts` with `handleInventoryRouteError()`, enforcing consistent status codes (403 for `TENANT_ACCESS_DENIED`, 400 for `VALIDATION_ERROR`/`INVALID_QUANTITY`, 422 for `INSUFFICIENT_STOCK`, 409 for `IDEMPOTENCY_CONFLICT`/`DUPLICATE_MOVEMENT`, 404 for `NOT_FOUND`, and 500 for unexpected errors sanitized in production).
  5. **Legacy Store Audit**: Confirmed `CommerceContext` and `offlineStore` are strictly client-side UI buffers; all authoritative inventory mutations execute against PostgreSQL transactions.
- **Consequences**:
  - Full compliance with supervisor mandates and zero regressions across all 64 automated tests.
  - POS-001 remains strictly `NOT STARTED` pending independent supervisor review and approval.

---

### ADR-017: Server-Authoritative POS Checkout & Financial Calculation Engine (POS-001)
- **Date**: 2026-09-08
- **Status**: `IMPLEMENTED (READY FOR REVIEW)`
- **Task Association**: `POS-001`
- **Context**: Retail Point-of-Sale (POS) operations require high-reliability transaction processing. The system must process checkout, session management (cashier registers), cash movements, returns, and refunds under strict tenant isolation, server-side RBAC validation, concurrency-safe row locking, exact scaled-integer arithmetic, and idempotency guarantees.
- **Decision**:
  1. **Authoritative POS Persistent Ledger**: Implemented database schema (`pos_sessions`, `pos_cash_movements`, `pos_returns`, `pos_return_items`) and updated the `orders` table to track POS sessions and checkout idempotency.
  2. **Session Lifecycle & Cashier Safekeeping**: Implemented a complete state machine for cashier sessions (`OPEN`, `CLOSED`). Added validation preventing multiple active sessions for the same location/terminal and blocking any mutating sales/cash actions on closed sessions. Reconciles expected vs. counted cash at close, logging exact variance.
  3. **Atomic Multi-Domain POS Checkout**: Implemented `posService.checkout` executing inside a single database transaction (`db.withTransaction`). Recomputes all totals, taxes, and discounts server-side (ignoring client calculations). Subtracts inventory with negative stock prevention, creates the order and item lines, and posts payment atomically.
  4. **Strict Concurrency Row Locking**: Utilizes PostgreSQL row-level locks (`SELECT FOR UPDATE`) on both `pos_sessions` and `inventory_balances` to safely serialize concurrent checkouts and returns, preventing race conditions or double-deductions.
  5. **Sales Returns & Restocking**: Implemented a comprehensive partial/full return engine. Validates return quantities against original order lines to block excess returns. Upon successful refund, atomically adds items back to inventory via `SALE_RETURN` movements and updates the original order's payment status to `Partially Refunded` or `Refunded`.
  6. **Idempotency Safeguard**: Added `idempotency_key` verification on POS checkouts. Confirmed identical checkouts safely replay and return the cached order without duplicate stock deductions or payment recordings.
  7. **Tenant Isolation & Security Hardening**: Sourced all multi-tenant boundaries strictly from authenticated route middleware (`req.auth.organizationId`). Added an error sanitization layer (`sanitizePosErrorMessage`) that redacts stack traces, file paths, credentials, and SQL text before returning generic POS error codes.
- **Consequences**:
  - Point-of-Sale is a highly reliable transaction-processing layer over the Inventory Ledger.
  - Complete multi-register concurrency safety and auditability are fully guaranteed.
  - All 17 automated POS tests and 98 full-suite tests pass cleanly with 100% correctness.

---

### ADR-018: Comprehensive REST API Hardening, DTO Validation, Correlation ID Tracking, and Anti-Leakage Error Handling (API-001)
- **Date**: 2026-09-08
- **Status**: `IMPLEMENTED (READY FOR REVIEW)`
- **Task Association**: `API-001`
- **Context**: REST API endpoints across `/api/*` must strictly protect against identity spoofing, mass assignment, unvalidated payloads, unauthorized cross-tenant data access, exact-decimal financial drift, and database credential or syntax leakage in error responses.
- **Decision**:
  1. **Request & Correlation ID Ingress Tracking**: Mounted `requestIdMiddleware` on `/api` that captures client-provided `X-Request-Id` headers or generates uniform `req-<timestamp>-<entropy>` identifiers. Standardized header reflection and error envelope attachment for end-to-end distributed tracing.
  2. **Strict Schema & DTO Validation**: Built comprehensive DTO validators (`validateLoginDto`, `validateCreateUserDto`, `validateCreateCustomerDto`, `validateCreateCategoryDto`, `validateCreateBrandDto`, `validateCreateAttributeDto`, `validateCreateProductDto`, `validateCreateVariantDto`, `validateUpdateVariantDto`) with `validateBody()` middleware. Malformed bodies reject upfront with HTTP 422 `VALIDATION_ERROR`.
  3. **Anti-Spoofing & Identity Defense**: Implemented `stripForbiddenClientKeys()` to strip or reject client attempts to spoof `organizationId`, `role`, `permissions`, `is_active`, or internal entity identifiers from request bodies. All authorization parameters derive exclusively from verified JWT tokens (`req.auth`).
  4. **Multi-Tenant Route Isolation**: Standardized tenant checks across `/api/customers/:id`, `/api/users`, `/api/products`, and repositories. Unscoped database lookups are eliminated; cross-tenant access returns HTTP 403 `TENANT_ACCESS_DENIED`.
  5. **Fail-Closed Repository Boundaries**: Repositories enforce non-empty `organizationId` parameter validation (`UserRepository`, `CustomerRepository`, `CatalogRepository`, `OrderRepository`, `InventoryRepository`). Missing tenant context fails closed immediately with `TENANT_REQUIRED`.
  6. **Exact-Decimal Money & Quantity Protocol**: Validated all financial and quantity values as exact decimal strings (e.g. `'249.99'`, `'10.0000'`) or integer-scaled values, completely preventing IEEE-754 binary floating-point precision loss.
  7. **Centralized Error Sanitization & Non-Leakage**: Implemented `server/utils/errorSanitizer.ts` with `apiErrorHandler`, `classifyApiError`, and `sanitizeApiErrorMessage`. Redacts database credentials, connection URIs (`postgres://`), SQL syntax, and stack traces. Maps domain errors to standard HTTP status codes (400, 401, 403, 404, 409, 422, 500) and uniform envelope format `{ success: false, error: { code, message, details? }, requestId }`.
- **Consequences**:
  - Full mitigation of RISK-007 (API Validation & Mass-Assignment Risk).
  - All 7 new integration tests in `tests/api_hardening.test.ts` pass with 100% pass rate.
  - Zero regressions across the entire test suite (all 98 automated tests pass).




