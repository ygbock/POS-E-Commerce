# REL-011: Production Database Fail-Closed + PostgreSQL Staging Gate Report

> **Document Version**: 1.0.0  
> **Evaluation Date**: 2026-09-11  
> **Status**: COMPLETED & READY FOR REVIEW  
> **Evaluator**: Senior Backend Engineer, Implementation Lead & Security Architect  
> **Base Candidate Commit**: `1bc307c6f059c402123512e9b9227fcaab58fe32`  
> **Current Evaluated Commit / HEAD**: `9ae4b7528aecd195a9167e1b2a060513cbf83223`  

---

## 1. Scope & Objectives
The scope of task **REL-011** is to transition the AbaCha Unified Commerce application from an auto-fallback (degraded database mode) behavior to a strictly deterministic, **fail-closed** architecture in production environments.

Under this policy:
1. Production deployments (`NODE_ENV=production`) require a valid, reachable external PostgreSQL database (`DATABASE_URL` or `PGHOST`).
2. Any configuration anomaly, missing connection parameter, weak credential, or server outage during production startup causes an immediate, safe, and controlled process termination.
3. Embedded `PGlite` storage is strictly prohibited in production and cannot be enabled through environment overrides (`ALLOW_EMBEDDED_POSTGRES` is completely ignored in production).
4. The entire test suite (151 unique baseline verification units + 7 production gate verification units = 158 units) is validated against a real PostgreSQL staging database server.
5. All health and readiness probes (`/api/health`, `/api/ready`) accurately report `engine: "postgresql"` and fail-closed with HTTP 503 during database unavailability without leaking secrets or credentials.

---

## 2. Files Changed & Architectural Enhancements
1. **`server/db/client.ts`**:
   - Removed `ALLOW_EMBEDDED_POSTGRES` override path for `NODE_ENV=production`.
   - Guaranteed that `PGliteDatabaseClient` is never instantiated or returned when running in production.
   - Enforced hard startup failure if `DATABASE_URL` and `PGHOST` are missing.
   - Preserved approved PGlite developer/test fallback behavior for zero-config local testing.
2. **`server.ts`**:
   - Implemented strict production startup validation inside `createApp()` factory function.
   - Mandated non-empty `DATABASE_URL` or `PGHOST`.
   - Mandated high-entropy `JWT_SECRET` (at least 32 characters, rejecting keys containing `'dev'` or `'default'`).
   - Removed automatic fallback setup (`process.env.ALLOW_EMBEDDED_POSTGRES = 'true'`) from `startServer()`.
   - Verified that health (`GET /api/health`) and readiness (`GET /api/ready`) probes report active database engine and return HTTP 503 if database check fails.
3. **`server/inventory/reservationService.ts`**:
   - Wrapped concurrent reservation inserts in a PostgreSQL `SAVEPOINT sp_reservation_insert`.
   - In PostgreSQL, unique constraint violations (`23505`) on concurrent idempotency collisions mark transactions aborted (`25P02`). The savepoint rollback cleanly recovers the transaction so idempotent reloads succeed without transaction abortion.
4. **`tests/production_gate.test.ts`**:
   - Implemented 7 automated verification units for fail-closed behavior, negative startup tests, entropy checks, and 503 outage probes.
5. **`tests/persistence.test.ts` & `tests/auth_security.test.ts`**:
   - Added support for `DATABASE_URL` / `PGHOST` so suites run natively against external PostgreSQL instances as well as isolated in-memory test databases.
6. **`package.json` & `package-lock.json`**:
   - Added `test:prod-gate` script and integrated into `npm test`.
   - Preserved deterministic `package-lock.json` for reproducible `npm ci` builds.
7. **`.ai/REL-010_RELEASE_CANDIDATE_HARDENING.md`**:
   - Corrected historical candidate reference from `9bf57de` to `1bc307c6f059c402123512e9b9227fcaab58fe32`.

---

## 3. Production Database Policy
The platform strictly enforces the following state machine under `NODE_ENV=production`:

```text
NODE_ENV=production
├── Valid Postgres Config + High-Entropy JWT_SECRET ──> Boots PostgresPoolClient (PostgreSQL 16)
├── Missing Postgres Config (DATABASE_URL & PGHOST) ──> CONTROLLED TERMINATION (Exit 1, Fail-Closed)
├── Invalid Postgres Config / Unreachable DB Socket  ──> CONTROLLED TERMINATION (Exit 1, Fail-Closed)
├── Missing or Weak JWT_SECRET (<32 chars or "dev")  ──> CONTROLLED TERMINATION (Exit 1, Fail-Closed)
└── ALLOW_EMBEDDED_POSTGRES=true Override Attempt   ──> STRICTLY REJECTED (Zero Fallback)
```

### Confidentiality & Non-Secret Operational Errors
All error messages emitted during startup or connection failure are strictly sanitized:
- No database passwords, tokens, or JWT secrets are printed to stdout, stderr, or log files.
- Example sanitized error:
  `[AbaCha DB Fatal] Production environment requires a valid PostgreSQL configuration (DATABASE_URL or PGHOST). PGlite is NEVER permitted in production.`

---

## 4. PostgreSQL Staging Environment Used
- **Engine**: PostgreSQL 16.10 (x64 Windows Local Service / Cluster)
- **Host**: `127.0.0.1`
- **Port**: `5433` (isolated staging daemon instance, `task-2160`)
- **Staging Databases**:
  - `abacha_staging`: Dedicated staging database for server smoke testing, health, and readiness probes.
  - `abacha_test_db`: Dedicated isolated test database for running the full verification suite.
- **Connection String**: `postgresql://postgres@127.0.0.1:5433/abacha_staging`

---

## 5. Verification Suite & Results on Real PostgreSQL

All **151 unique verification units** across the complete application suite plus **7 production gate verification units** (**158 units total**) were executed against the real PostgreSQL staging database:

| Suite Command | Test File | Units | PostgreSQL Engine Result |
| :--- | :--- | :---: | :---: |
| `npm run test:db` | `tests/persistence.test.ts` | 15 | **15 / 15 PASS** |
| `npm run test:security` | `tests/auth_security.test.ts` | 22 | **22 / 22 PASS** |
| `npm run test:inventory` | `tests/inventory.test.ts` | 24 | **24 / 24 PASS** |
| `npm run test:transfer` | `tests/transfer.test.ts` | 13 | **13 / 13 PASS** |
| `npm run test:pos` | `tests/pos.test.ts` | 17 | **17 / 17 PASS** |
| `npm run test:api` | `tests/api_hardening.test.ts` | 11 | **11 / 11 PASS** |
| `npm run test:qa` | `tests/qa_verification.test.ts` | 5 | **5 / 5 PASS** |
| `npm run test:ux` | `tests/ux_accessibility.test.ts` & `tests/ux_pos_hotkeys.test.ts` | 23 | **23 / 23 PASS** |
| `npm run test:checkout` | `tests/ux_storefront_checkout_integrity.test.ts` | 7 | **7 / 7 PASS** |
| `npm run test:offline-pos` | `tests/ux_offline_pos.test.ts` | 14 | **14 / 14 PASS** |
| **Subtotal Baseline** | *(Unique baseline verification units)* | **151** | **151 / 151 PASS (100%)** |
| `npm run test:prod-gate`| `tests/production_gate.test.ts` | 7 | **7 / 7 PASS** |
| **Total Verification Units** | *(All automated tests)* | **158** | **158 / 158 PASS (100%)** |

*(Note: `test:hotkeys` runs `tests/ux_pos_hotkeys.test.ts` and is covered under `test:ux` without double-counting).*

### Quality Checks
- **TypeScript Static Verification (`npm run lint`)**: `tsc --noEmit` passed with **0 errors**.
- **Production Bundle (`npm run build`)**: Vite and esbuild completed with **Exit Code 0** (`dist/index.html` 1.02 kB, `dist/server.cjs` 411.7 kB).

---

## 6. Health & Readiness Verification Evidence

The built production bundle (`node dist/server.cjs`) was booted with:
- `NODE_ENV="production"`
- `DATABASE_URL="postgresql://postgres@127.0.0.1:5433/abacha_staging"`
- `PORT="3000"`

### Live Server Log
```text
[AbaCha DB] Connected (postgresql). Schema: 010
[Product Service API] Server running on http://0.0.0.0:3000
```

### Probe Evidence: `GET /api/health`
**HTTP Status**: `200 OK`
```json
{
  "status": "ok",
  "ready": true,
  "service": "Centralized Product Service",
  "version": "2.4.0",
  "uptime": 17.44,
  "timestamp": "2026-09-11T16:41:28.478Z",
  "database": {
    "connected": true,
    "engine": "postgresql",
    "schemaVersion": "010",
    "migrationsCount": 10
  }
}
```

### Probe Evidence: `GET /api/ready`
**HTTP Status**: `200 OK`
```json
{
  "ready": true,
  "status": "ready",
  "database": {
    "connected": true,
    "engine": "postgresql",
    "schemaVersion": "010"
  }
}
```

---

## 7. Negative-Test Coverage Evidence

The 4 required negative test scenarios were verified:

| Test Scenario | Condition | Observed System Response | Status |
| :--- | :--- | :--- | :---: |
| **A. Missing Configuration** | `NODE_ENV=production`<br>`DATABASE_URL` unset<br>`PGHOST` unset | Server startup threw `[AbaCha Config Fatal] Production environment requires a valid PostgreSQL configuration (DATABASE_URL or PGHOST is missing)` and terminated immediately. | **PASSED** |
| **B. Invalid Configuration** | `NODE_ENV=production`<br>`DATABASE_URL="postgresql://invaliduser:badpass@127.0.0.1:5433/bad_db"` | Connection attempt threw operational error `role "invaliduser" does not exist` without leaking passwords. Startup terminated immediately. | **PASSED** |
| **C. PostgreSQL Unavailable** | Database daemon stopped / unreachable | Probes `/api/health` and `/api/ready` immediately returned **HTTP 503 Service Unavailable** (`{"ready": false, "status": "unhealthy"}`). Traffic was safely rejected. | **PASSED** |
| **D. PGlite Fallback Block** | `NODE_ENV=production`<br>`ALLOW_EMBEDDED_POSTGRES=true`<br>No external PostgreSQL | `getDatabaseClient()` threw `[AbaCha DB Fatal] Production environment requires a valid PostgreSQL configuration... PGlite is NEVER permitted in production.` Fallback was completely blocked. | **PASSED** |

---

## 8. Regression Review Summary
All core operational invariants remain intact and verified against real PostgreSQL:
- **Authentication & RBAC**: Token verification, password hashing, and role hierarchy pass 22/22 checks.
- **Tenant Isolation**: Cross-tenant data leaks and identity tampering are strictly rejected across all endpoints.
- **Inventory & Reservations**: Exact-decimal arithmetic, weighted average cost, negative-stock defense, and concurrent reservation locks operate deterministically on PostgreSQL.
- **Transfers & POS**: Row-level locking and transaction atomicity prevent double-spending or inventory corruption.
- **Storefront & Checkout**: WCAG 2.2 AA focus trapping, modalManager lifecycle, and storefront checkout integrity verified 7/7 on PostgreSQL.
- **Offline POS**: IndexedDB synchronization and offline transaction queueing verified 14/14.

---

## 9. Remaining Operational Risks
1. **Cloud Database Provisioning**: Production deployments must ensure external managed PostgreSQL (e.g. AWS RDS, GCP Cloud SQL) is provisioned and network firewalls permit ingress from application containers before starting.
2. **Startup Grace Period**: Because production fails closed immediately on database connection failure, orchestrators (Kubernetes / Cloud Run) should configure a startup probe grace period (e.g. 15-30 seconds) to allow database connections to warm up.

---

## 10. Final Recommendation
Task **REL-011** is **COMPLETE** and **READY FOR REVIEW**. The platform successfully enforces a deterministic fail-closed architecture, prohibits silent PGlite degradation in production, and passes all 158 tests natively against PostgreSQL 16.


## 11. REL-011R1: Reservation Idempotency Race & Concurrency Fix

### 11.1 Problem Statement & Current Defect
In the original implementation, `SAVEPOINT sp_reservation_insert` in `server/inventory/reservationService.ts` was instantiated *after* updating the inventory reserved balance in the repository (`inventoryRepo.adjustReserved()`). 

On concurrent overlapping requests utilizing the same idempotency key, the second request would attempt to write to `inventory_reservations`, trigger a unique key constraint violation (`23505`), and rollback to `sp_reservation_insert`. However, because the inventory reserved balance was updated *before* the savepoint was created, that duplicate increment of the reserved inventory remained active in the outer transaction and was committed when the transaction successfully closed. This resulted in an inventory integrity violation:
- Exactly one reservation record existed in the database.
- But the reserved balance was incremented twice, and available stock was decremented twice, causing a persistent inventory leak.

### 11.2 Core Corrective Fix
We refactored `createReservation` inside `server/inventory/reservationService.ts` to reposition the `SAVEPOINT sp_reservation_attempt` so that it encompasses **BOTH** operations:
1. `inventoryRepo.adjustReserved(...)` (Inventory reserved-balance adjustment)
2. `reservationRepo.createReservation(...)` (Reservation row insert)

#### Transaction shape implemented:
```text
BEGIN (Outer Transaction)
  │
  ├── SAVEPOINT sp_reservation_attempt
  │     ├── 1. Read available stock & adjust reserved balance
  │     └── 2. Try INSERT INTO inventory_reservations (idempotency unique-key check)
  │
  ├── ON UNIQUE CONSTRAINT ERROR (23505) ──> ROLLBACK TO SAVEPOINT sp_reservation_attempt
  │     │                                  (Reverts both the balance change & insert atomically)
  │     └── 3. Fetch existing reservation and return (No duplicate balance adjustments)
  │
  └── COMMIT
```

By ensuring that the rollback completely reverts the entire reservation attempt, transaction semantics cleanly and atomically undo the duplicate inventory increment, guaranteeing absolute data consistency.

### 11.3 Concurrency & Conflict Tests Added (`tests/production_gate.test.ts`)
We added two brand new automated test cases to `tests/production_gate.test.ts` to verify the fix natively under both isolated database modes and real PostgreSQL staging:

1. **Test 8: Concurrent Reservation Idempotency Concurrency Test (PGSQL)**
   - Prepares an organization, location, and variant with 100 units of stock.
   - Invokes two concurrent `createReservation()` calls using `Promise.all` with the same payload and idempotency key.
   - Verifies both calls succeed and return the exact same reservation.
   - Verifies exactly **ONE** reservation record is created in the database.
   - Verifies the inventory balance's `reserved` stock is incremented exactly **ONCE** (to 10) and `available` is decremented exactly **ONCE** (to 90).
   - Verifies no PostgreSQL transaction abort block error (`25P02`) is left behind.
   - Verifies subsequent database queries and transactions execute normally.

2. **Test 9: Concurrent Reservation Idempotency Conflict Test (Different Payload)**
   - Verifies that if a duplicate request uses the same idempotency key but passes a different payload (e.g. different quantity), the system safely rejects it with a strict `IDEMPOTENCY_CONFLICT` error.
   - Verifies that the rejected request leaves the reserved stock completely unchanged.

### 11.4 Final Execution Results (PostgreSQL 16)
Both tests execute and pass with 100% success on the real PostgreSQL 16 staging database:
- `[TEST] 8. Concurrent Reservation Idempotency Concurrency Test (PGSQL)... PASSED`
- `[TEST] 9. Concurrent Reservation Idempotency Conflict Test (Different Payload)... PASSED`

This completes the verification of **REL-011R1** as fully resolved and production-ready.

