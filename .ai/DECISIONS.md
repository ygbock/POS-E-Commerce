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
- **Context**: Omnicore requires strict relational integrity (foreign keys, check constraints, composite uniqueness, decimal precision) across multi-entity retail operations (organizations, locations, products, variants, balances, movements, orders, items, payments, audit events). In local development and cloud sandbox environments without external database containers, developers need zero-configuration startup, while production deployments require standard PostgreSQL / Cloud SQL connection pooling.
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

