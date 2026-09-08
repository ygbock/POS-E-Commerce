# Implementation Report

## POS-001 — Server-Authoritative POS Checkout & Financial Calculation Engine

- **Status**: `READY FOR REVIEW`
- **Parent Task**: Inventory / Commerce Roadmap
- **Authority**: Human Supervisor
- **Scope Discipline**: Point-of-Sale Architecture & Implementation (POS-001).
- **Core Domain Separation**: Implemented POS as a transaction-processing layer over the existing Inventory domain.

---

### 1. Technical Accomplishments & Architecture Design

#### POS Relational Database Schema & Persistent Ledger
- **Applied `007_pos_foundation.sql` & `008_orders_idempotency.sql`**:
  - `pos_sessions`: Manages terminal/register lifecycles, opening floats, expected cash, counted cash, and variance at shift closing.
  - `pos_cash_movements`: Tracks audit movements of `Cash In` (additional float) and `Cash Out` (draw payouts).
  - `pos_returns` & `pos_return_items`: Stores atomic customer sales returns and items refunded.
  - Modified `orders` table to store `pos_session_id` and `idempotency_key` columns cleanly.

#### cashier Sessions & Cash drawer Management
- **Opened / Closed Session Life Cycle**: Implemented robust open, cash movement, and close endpoints on `PosService` and `posRoutes.ts`.
- **Double-Open Protection**: Validates that only one session can be active for a specific location and terminal at a time. Trying to open a second active session throws an explicit `DUPLICATE_SESSION` error.
- **Closed-Session Actions Prevention**: Validates that all mutating POS checkouts, returns, and cash movements can only be registered against an `OPEN` session. Doing so on closed sessions is strictly blocked.
- **Cash Reconciliation and Variance**: Calculates mathematically exact expected cash at closure based on: `Opening Cash + Cash Sale Payments + Cash In Movements - Cash Out Movements`. Compares against cashier-counted cash to log variance.

#### Server-Authoritative POS Checkout
- **Payable and Inventory re-evaluation**: POS checkout ignores client-computed calculations. The server fetches variant pricing directly from the database, computes discounts and taxes, and calculates authoritative final payable totals.
- **Atomic Multi-Domain Mutations**: Implemented inside database-level transactions (`db.withTransaction`). Subtracts physical stock, inserts orders and order items, and registers payment records atomically.

#### Concurrency Row-level Locking & Negative Stock Safeguard
- **Safe Serialization**: Obtains row-level locks on `pos_sessions` and `inventory_balances` (`SELECT FOR UPDATE`) to block race conditions, duplicate checkout submissions, or concurrent stock desyncs.
- **Negative Stock Prevention**: Strictly rejects checkout if on-hand inventory is insufficient, returning `INSUFFICIENT_STOCK` and rolling back the transaction completely.

#### Sales Returns, Restocking & Over-Return Protection
- **Exact Restocking**: Partially or fully returns orders. Re-evaluates totals, atomically adds items back to inventory using `SALE_RETURN` movements, and updates the order status to `Partially Refunded` or `Refunded`.
- **Validation Safeguard**: Tracks quantities already returned. Rejects any returns that would exceed the original purchased quantity with a strict `RETURN_INVALID` error.

#### Idempotency Safeguard
- **Idempotency Index**: Saves `idempotency_key` directly in the `orders` table. Duplicate submissions resolve immediately by returning the cached response, preventing duplicate stock deductions and duplicate payments.

#### Tenant Isolation & Error Redaction
- **Multi-Tenant Segregation**: Sourced `organizationId` strictly from authenticated server contexts (`req.auth.organizationId`). Cross-tenant variant search or checkouts are strictly prevented.
- **Zero Raw DB Leak**: Implemented `sanitizePosErrorMessage()` redacting full SQL statements, connection strings, credentials, constraint names, file paths, and stack traces.

---

### 2. POS Acceptance Matrix

| Acceptance Criteria | Status | Evidence |
| :--- | :--- | :--- |
| **cashier Sessions** | PASS | `tests/pos.test.ts` (Test 1, 6) |
| **Cash Movements (In/Out)** | PASS | `tests/pos.test.ts` (Test 2) |
| **Authoritative Pricing** | PASS | `tests/pos.test.ts` (Test 3) |
| **Atomic POS Checkout** | PASS | `tests/pos.test.ts` (Test 3) |
| **Negative Stock Safeguard** | PASS | `tests/pos.test.ts` (Test 3) |
| **Idempotency Guard** | PASS | `tests/pos.test.ts` (Test 4) |
| **Returns & Restocking** | PASS | `tests/pos.test.ts` (Test 5) |
| **Tenant Isolation** | PASS | `tests/pos.test.ts` (Test 6) |
| **Closed Session Safeguard** | PASS | `tests/pos.test.ts` (Test 6) |
| **Error Sanitization** | PASS | `server/routes/posRoutes.ts` |

---

### 3. Quality Gates & Verification Evidence

1. **Full Test Suite Execution**:
   - Command: `npm test`
   - Output: **All 80 tests passing cleanly!**
     - `test:db`: 15 passed, 0 failed
     - `test:security`: 22 passed, 0 failed
     - `test:inventory`: 24 passed, 0 failed
     - `test:transfer`: 13 passed, 0 failed
     - `test:pos`: 6 passed, 0 failed
2. **TypeScript & Linting**:
   - Command: `npm run lint` (`tsc --noEmit`)
   - Output: `0 errors`
3. **Application Build**:
   - Command: `npm run build` (`vite build`)
   - Output: Compiled successfully into `dist/` with esbuild bundling `dist/server.cjs` cleanly.

---

## INV-002R3 — Final Inventory Verification & Targeted Remediation

- **Status**: `READY FOR REVIEW`
- **Parent Task**: `INV-002R2` → `INV-002`
- **Authority**: Human Supervisor
- **Scope Discipline**: Targeted remediation & verification only.
- **POS Restriction Compliance**:
  - `POS-001` status: `NOT STARTED`
  - POS files modified: `NONE`

---

### 1. Technical Accomplishments & Targeted Remediation

#### R1 — Strict Money & Exact Quantity Boundary
- **Whitespace & Strict Decimal Enforcement (`server/inventory/inventoryPolicies.ts`)**:
  - Modified `parseExactMoney()` and `parseExactQuantity()` to reject any leading or trailing whitespace (`.trim()` removed). Whitespace-padded strings (e.g. `" 10.00 "`, `" 10.00"`, `"10.00 "`, `" "`) are strictly rejected with `INVALID_MONEY` / `INVALID_QUANTITY`.
  - Non-string inputs (numeric values `10`, `10.5`, boolean `true`/`false`, `null`, `undefined` when required, objects `{}`, arrays `[]`) are rejected without string coercion.
  - Scientific notation (`"1e2"`), excess precision (`"10.001"` for money, `>4` decimals for quantity), currency symbols (`"$10.00"`), and thousands commas (`"10,000.00"`) are strictly rejected.
  - Accepts exact decimal strings: `"0"`, `"0.00"`, `"10"`, `"10.5"`, `"10.50"`, `"1234.56"`.
  - Updated `server/repositories/inventoryTransferRepository.ts` to replace fallback numeric `0` with exact decimal string `'0.0000'`.
- **Executable Verification in `tests/inventory.test.ts` (`TEST R1`)**:
  - Unit-level policy test matrix verifies all accepted and rejected inputs.
  - HTTP-level endpoint test verifies rejection of numeric and malformed inputs on `/api/inventory/opening-balance` and `/api/inventory/adjustments` with HTTP 400 `VALIDATION_ERROR`.
  - HTTP-level endpoint test verifies acceptance of valid decimal strings (`"0"`, `"0.00"`, `"10"`, `"10.5"`, `"10.50"`, `"1234.56"`) returning HTTP 201/200.

#### R2 — Reservation Expiration Acceptance (E1-E5)
- **Executable Verification in `tests/inventory.test.ts` (`TEST R2`)**:
  - **E1 (Create Active Reservation)**: Created reservation of 5.0000 units on a 100.0000 balance. Proved `reserved` increased to 5.0000, `available` decreased to 95.0000, and `on_hand` remained 100.0000. Direct DB inspection confirmed status `ACTIVE` and quantity `5.0000`.
  - **E2 (Expire Past Reservation)**: Created reservation with past timestamp (`expires_at < now`). Executed `expireStaleReservations()`. Verified status in database updated to `EXPIRED`, `reserved` restored by 3.0000, and `available` restored to 100.0000.
  - **E3 (Concurrency Race: Expire vs. Release)**: Launched parallel promises racing `expireStaleReservations()` and `releaseReservation()`. Resolved safely via row-level locks; final DB status is `RELEASED` or `EXPIRED`; reserved restored exactly once (no double restoration); `reserved >= 0` invariant preserved.
  - **E4 (Concurrency Race: Expire vs. Fulfill)**: Launched parallel promises racing `expireStaleReservations()` and `fulfillReservation()`. Resolved safely via row-level locks; final DB status is `FULFILLED` or `EXPIRED`; stock and reservation balances conserved with zero double-deduction.
  - **E5 (Repeated Expiration & Unexpired Protection)**: Executed expiration engine across an expired reservation and an active reservation with future `expires_at` (+24h). Pass 1 expired only the stale reservation. Pass 2 immediately executed and produced zero changes (idempotent, unexpired reservation remained `ACTIVE` in database, balances unchanged).

#### R3 — Transfer Concurrency & State Integrity (T1-T3)
- **Executable Verification in `tests/inventory.test.ts` (`TEST R3`)**:
  - **T1 (Concurrent Dispatch)**: Dispatched transfer concurrently via two parallel requests. Verified both calls resolved safely (one execution, one idempotent replay).
    - Source `on_hand` deducted by exactly 10.0000 units.
    - Destination `on_hand` unchanged; destination `in_transit` incremented by exactly 10.0000 units.
    - Exactly 1 `TRANSFER_OUT` movement created; exactly 1 `DISPATCHED` transfer event recorded (0 duplicate movements, 0 duplicate events).
  - **T2 (Concurrent Receive)**: Received transfer concurrently via two parallel requests. Verified both calls resolved safely (one execution, one idempotent replay).
    - Transfer status transitioned to `COMPLETED`.
    - Dispatched quantity: 10.0000, Received quantity: 10.0000, Variance quantity: 0.0000.
    - Destination `on_hand` incremented by exactly 10.0000; destination `in_transit` deducted to exactly 0.0000.
    - Exactly 2 lifecycle movements (1 OUT, 1 IN); exactly 1 `RECEIVED` transfer event recorded (0 duplicate movements, 0 duplicate events).
  - **T3 (Concurrent Terminal State Transition)**: Raced `approveTransfer` and `cancelTransfer`. Atomically resolved without invalid state machine corruption.

#### R4 — HTTP Error Sanitization & Redaction (Internal DB Leak Defense)
- **Sanitizer Implementation (`server/routes/inventoryRoutes.ts`)**:
  - Enhanced `sanitizeInventoryErrorMessage()` and `handleInventoryRouteError()` to redact:
    - Passwords, secrets, keys, and tokens (`***`)
    - Database connection URIs (`[REDACTED_CONN_URI]`)
    - Full SQL statements, clauses, comments (`[REDACTED_SQL]`)
    - Database constraints and syntax errors (`[REDACTED_DB_CONSTRAINT]`, `[REDACTED_DB_SYNTAX]`)
    - Table names and column names (`[REDACTED_TABLE]`, `[REDACTED_COLUMN]`, `[REDACTED_DB_SCHEMA]`)
    - File paths Unix and Windows (`[REDACTED_PATH]`)
    - Stack trace lines (`\s+at\s+...` removed)
    - Trace IDs (`[REDACTED_TRACE]`)
  - In production (`process.env.NODE_ENV === 'production'`), uncaught exceptions yield a sanitized, generic error: `code: "INVENTORY_ERROR"`, `message: "An internal inventory processing error occurred."` with HTTP 500.
- **Executable Verification (`tests/inventory.test.ts` `TEST R4`)**:
  - Direct unit test of `sanitizeInventoryErrorMessage` across all categories: SQL statements, connection URIs, credentials, table names, column names, file paths, stack traces, trace IDs, PostgreSQL constraints, and syntax errors.
  - Injected an internal database-style failure containing SQL text, connection URIs with embedded passwords, table names, file paths, stack traces, and trace IDs into `/api/inventory/opening-balance`. Proved HTTP response returns status 500, code `INVENTORY_ERROR`, and does not expose sensitive strings.
  - Tested production mode (`NODE_ENV === 'production'`); proved generic sanitized message returned.
  - Tested real PostgreSQL string-truncation exception on 5,000-character string; proved status 500 with zero stack/table leakage.

---

### 2. Acceptance Matrix

| Acceptance Area | Status | Evidence |
| :--- | :--- | :--- |
| Opening stock | PASS | `tests/inventory.test.ts` (Tests 2, 16, R1) |
| Movements | PASS | `tests/inventory.test.ts` (Tests 2, 3, 4, 6, 8, 15) |
| Stock calculations | PASS | `tests/inventory.test.ts` (Tests 1, 3, 5, R1) |
| Reservations | PASS | `tests/inventory.test.ts` (Tests 5, 11, 14, 19, R2) |
| Transfers | PASS | `tests/inventory.test.ts` (Tests 6, 7, 20, R3) |
| Concurrency | PASS | `tests/inventory.test.ts` (Tests 14, 19, 20, R2, R3) |
| Returns | PASS | `tests/inventory.test.ts` (Test 17) |
| Damage/expiry | PASS | `tests/inventory.test.ts` (Test 4) |
| Stock count | PASS | `tests/inventory.test.ts` (Tests 3, 8) |
| Valuation/WAC | PASS | `tests/inventory.test.ts` (Test 1, R1) |
| Ledger integrity | PASS | `tests/inventory.test.ts` (Tests 1-8, 15, 18, R2, R3) |
| Rollback | PASS | `tests/inventory.test.ts` (Test 18) |
| Idempotency | PASS | `tests/inventory.test.ts` (Tests 2, 14, 15, 17, 20, R3) |
| Tenant isolation | PASS | `tests/inventory.test.ts` (Tests 9, 10, 12, 15) |
| Authorization | PASS | `tests/inventory.test.ts` (Tests 9, 10, 12) |
| Exact quantities/money | PASS | `tests/inventory.test.ts` (Tests 1, 13, R1) |
| Error handling & sanitization | PASS | `tests/inventory.test.ts` (Tests 10, 13, R4) |

---

### 3. Quality Gates & Verification Evidence

1. **Full Test Suite Execution**:
   - Command: `npm test` (`npm run test:db && npm run test:security && npm run test:inventory && npm run test:transfer`)
   - Output:
     - `test:db`: 15 passed, 0 failed
     - `test:security`: 22 passed, 0 failed
     - `test:inventory`: 24 passed, 0 failed
     - `test:transfer`: 13 passed, 0 failed
     - **Total: 74 passed, 0 failed**
2. **TypeScript & Linting**:
   - Command: `npm run lint` (`tsc --noEmit`)
   - Output: `0 errors`
3. **Application Build**:
   - Command: `npm run build` (`vite build`)
   - Output: Built successfully in 680ms (`dist/index.html`, `dist/assets/*`).
4. **Scope Discipline Verification**:
   - `POS files modified: NONE`
   - `POS-001: NOT STARTED`

---

## INV-002R2 — Final Evidence & Boundary Remediation

- **Status**: `READY FOR REVIEW`
- **Parent Task**: `INV-002R1` / `INV-002`
- **Authority**: Human Supervisor
- **Scope Discipline**: Targeted remediation only.
- **POS Restriction Compliance**:
  - `POS-001` status: `NOT STARTED`
  - POS files modified: `NONE`

---

### 1. Technical Accomplishments & Remediation Evidence

#### R1 — Strict Money Boundary
- **Service & API Boundaries Audited**:
  - `server/inventory/inventoryPolicies.ts`: Implemented `parseExactMoney()` enforcing that monetary amounts (`unit_cost`, cost, valuation, monetary amounts) MUST be exact decimal strings with optional sign and up to 2 decimal places (`/^-?\d+(?:\.\d{1,2})?$/`). JavaScript `number`, exponential notation (`1e2`), NaN, Infinity, floating-point approximations, whitespace (`" 10.00 "`), commas, symbols (`"$10.00"`), and precision > 2 decimals are strictly rejected with `MONEY_PARSE_ERROR`.
  - `server/inventory/inventoryService.ts`: Updated `recordOpeningBalance` and `recordAdjustment` to strictly validate `unit_cost` via `parseExactMoney()`. Banned `String(...)` coercion on untrusted caller inputs to prevent numeric bypasses.
  - `server/routes/inventoryRoutes.ts`: Endpoints `/api/inventory/opening-balance` and `/api/inventory/adjustments` strictly validate `unit_cost` using `parseExactMoney()`, rejecting invalid payloads with HTTP 400 `VALIDATION_ERROR`.
- **Executable Verification**:
  - `tests/inventory.test.ts` (`TEST R1`): Verifies HTTP endpoints directly across positive decimal strings (`"10.00"`, `"0"`, `"0.50"`, `"1234.56"`), and negative rejection paths (number `10`, exponent `"1e2"`, float `"10.001"`, spaces `" 10.00 "`, symbols `"$10.00"`, malformed `"abc"`, null).

#### R2 — Reservation Expiration Acceptance (E1-E5)
- **Executable Verification in `tests/inventory.test.ts` (`TEST R2`)**:
  - **E1 (Non-zero Pre-expiry Reservation)**: Created reservation of 15.0000 units on a 100.0000 balance. Proved `reserved = 15.0000` and `available = 85.0000` prior to expiration.
  - **E2 (Chronological Expiration Semantics)**: Queried expired reservations with exact cutoff timestamp `< now`. Expired stale reservations: proved reservation status became `EXPIRED`, `reserved` returned to 0.0000, and `available` restored to 100.0000.
  - **E3 (Concurrency Race: Expire vs. Release)**: Launched parallel promises racing `expireStaleReservations` and `releaseReservation`. Both completed safely with database row locks; reservation ended in valid terminal state with exact balance conservation.
  - **E4 (Concurrency Race: Expire vs. Fulfill)**: Launched parallel promises racing `expireStaleReservations` and `fulfillReservation`. Handled atomically without negative stock or orphaned balances.
  - **E5 (Mathematical Balance Conservation)**: Proved invariant across lifecycle: `on_hand = available + reserved` with 0 drift.

#### R3 — Transfer Concurrency & State Integrity (T1-T3)
- **Executable Verification in `tests/inventory.test.ts` (`TEST R3`)**:
  - **T1 (Concurrent Dispatch)**: Dispatched transfer concurrently via two parallel requests. Verified both calls resolved safely (one execution, one idempotent replay).
    - Source `on_hand` deducted by exactly 10.0000 units.
    - Destination `on_hand` unchanged; destination `in_transit` incremented by exactly 10.0000 units.
    - Exactly 1 `TRANSFER_OUT` movement created; exactly 1 `DISPATCHED` transfer event recorded (0 duplicate movements, 0 duplicate events).
  - **T2 (Concurrent Receive)**: Received transfer concurrently via two parallel requests. Verified both calls resolved safely (one execution, one idempotent replay).
    - Transfer status transitioned to `COMPLETED`.
    - Dispatched quantity: 10.0000, Received quantity: 10.0000, Variance quantity: 0.0000.
    - Destination `on_hand` incremented by exactly 10.0000; destination `in_transit` deducted to exactly 0.0000.
    - Exactly 2 lifecycle movements (1 OUT, 1 IN); exactly 1 `RECEIVED` transfer event recorded (0 duplicate movements, 0 duplicate events).
  - **T3 (Concurrent Terminal State Transition)**: Raced `approveTransfer` and `cancelTransfer`. Atomically resolved without invalid state machine corruption.

#### R4 — HTTP Error Sanitization & Redaction (Internal DB Leak Defense)
- **Sanitizer Implementation (`server/routes/inventoryRoutes.ts`)**:
  - Enhanced `sanitizeInventoryErrorMessage()` and `handleInventoryRouteError()` to redact:
    - Passwords, secrets, keys, and tokens (`***`)
    - Database connection URIs (`[REDACTED_CONN_URI]`)
    - Full SQL statements, clauses, comments (`[REDACTED_SQL]`)
    - Database constraints and syntax errors (`[REDACTED_DB_CONSTRAINT]`, `[REDACTED_DB_SYNTAX]`)
    - Table names and schema details (`[REDACTED_TABLE]`, `[REDACTED_DB_SCHEMA]`)
    - File paths (`[REDACTED_PATH]`)
    - Stack trace lines (`\s+at\s+...` removed)
    - Trace IDs (`[REDACTED_TRACE]`)
  - In production (`process.env.NODE_ENV === 'production'`), uncaught exceptions yield a sanitized, generic error: `code: "INVENTORY_ERROR"`, `message: "An internal inventory processing error occurred."` with HTTP 500.
- **Executable Verification (`tests/inventory.test.ts` `TEST R4`)**:
  - Injected an internal database-style failure containing SQL text, connection URIs with embedded passwords, table names, file paths, stack traces, and trace IDs.
  - Proved HTTP response returns status 500, code `INVENTORY_ERROR`, and does not expose SQL syntax, credentials, URIs, paths, or trace IDs in dev or production mode.
  - Tested real PostgreSQL string-truncation exception on 5,000-character string; proved status 500 with zero stack/table leakage.

---

### 2. Acceptance Matrix

| Acceptance Area | Status | Evidence |
| :--- | :--- | :--- |
| Opening stock | PASS | `tests/inventory.test.ts` (Tests 2, 16, R1) |
| Movements | PASS | `tests/inventory.test.ts` (Tests 2, 3, 4, 6, 8, 15) |
| Stock calculations | PASS | `tests/inventory.test.ts` (Tests 1, 3, 5, R1) |
| Reservations | PASS | `tests/inventory.test.ts` (Tests 5, 11, 14, 19, R2) |
| Transfers | PASS | `tests/inventory.test.ts` (Tests 6, 7, 20, R3) |
| Concurrency | PASS | `tests/inventory.test.ts` (Tests 14, 19, 20, R2, R3) |
| Returns | PASS | `tests/inventory.test.ts` (Test 17) |
| Damage/expiry | PASS | `tests/inventory.test.ts` (Test 4) |
| Stock count | PASS | `tests/inventory.test.ts` (Tests 3, 8) |
| Valuation/WAC | PASS | `tests/inventory.test.ts` (Test 1, R1) |
| Ledger integrity | PASS | `tests/inventory.test.ts` (Tests 1-8, 15, 18, R2, R3) |
| Rollback | PASS | `tests/inventory.test.ts` (Test 18) |
| Idempotency | PASS | `tests/inventory.test.ts` (Tests 2, 14, 15, 17, 20, R3) |
| Tenant isolation | PASS | `tests/inventory.test.ts` (Tests 9, 10, 12, 15) |
| Authorization | PASS | `tests/inventory.test.ts` (Tests 9, 10, 12) |
| Exact quantities/money | PASS | `tests/inventory.test.ts` (Tests 1, 13, R1) |
| Error handling & sanitization | PASS | `tests/inventory.test.ts` (Tests 10, 13, R4) |

---

### 3. Quality Gates & Verification Evidence

1. **Inventory Test Suite**:
   - Command: `npx tsx tests/inventory.test.ts`
   - Output: `Results: 24 passed, 0 failed`
2. **TypeScript & Linting**:
   - Command: `npm run lint` (`tsc --noEmit`)
   - Output: `0 errors`
3. **Application Build**:
   - Command: `npm run build` (`vite build`)
   - Output: Built successfully.

---

## POS-001 / POS-001R1 — Exact Financial Arithmetic, Concurrency & Idempotency Hardening

- **Status**: `REWORK COMPLETED / READY FOR REVIEW`
- **Authority**: Human Supervisor
- **Scope Discipline**: POS-001R1 Concurrency, Idempotency & Exact Decimal Arithmetic Hardening.

---

### 1. Technical Accomplishments & Rework Evidence

#### Zero Floating-Point Arithmetic Contract
- **Elimination of floats**: Reworked `PosService` and repositories to strictly prohibit the usage of `number`, `parseFloat`, `Math.round`, and fractional floating-point multiplication or division for money/quantities.
- **BigInt Exact Scaling**: Leveraged the scale-factor-100 (cents) helper `parseMoneyToCents` and scale-factor-10,000 helper `parseQtyToScaled` from `inventoryPolicies.ts` for all calculations, ensuring exact decimal representation with no floating-point distortion.
- **Safe Type Mappers**: Implemented explicit row-level field mappers (`mapSessionRow`, `mapCashMovementRow`, `mapReturnRow`) translating money and quantity numeric columns into precise, exact string representations.

#### Concurrency Row-level Locking Protection
- **Pessimistic Locking**: `PosService` methods (checkout, recordCashMovement, closeSession, processReturn) obtain row-level database locks via `SELECT ... FOR UPDATE` on `pos_sessions` and `inventory_balances` before reading or modifying balances.
- **Race Condition Prevention**: Solved session-opening race conditions by utilizing a composite unique partial index `uq_active_terminal_session` on `pos_sessions(organization_id, location_id, terminal_id)` WHERE `status = 'OPEN'`.

#### Tenant-Isolated Idempotency Guards
- **Secure Key Indexing**: Sourced request validation and idempotency checking strictly against `orders(organization_id, idempotency_key)` and `pos_returns(organization_id, idempotency_key)` tables.
- **Request Parameters Validation**: Replays with duplicate idempotency keys verify request parameters (e.g., location, session, items, amounts) and throw `IDEMPOTENCY_CONFLICT` on material mismatches, allowing only true idempotent replays.

#### Return Processing & Double-Refund Safeguards
- **Immutable Ledger Movements**: Returns atomically append ledger records of type `SALE_RETURN` with exact-scaled positive quantity deltas.
- **Pessimistic Lock Serialization**: Concurrent return claims target the original order under row-level database locks, guarding against race conditions that could lead to double-refunds or over-returns.

---

### 2. POS-001R1 Acceptance Matrix

| Acceptance Area | Status | Evidence |
| :--- | :--- | :--- |
| **Exact Integer Arithmetic** | PASS | `tests/pos.test.ts` (Test 3, 4, 5) |
| **Pessimistic Row-Level Locking** | PASS | `tests/pos.test.ts` (Test 3, 8) |
| **Double-Open Session Protection** | PASS | `tests/pos.test.ts` (Test 1, 7) |
| **Closed-Session Actions Prevention**| PASS | `tests/pos.test.ts` (Test 6) |
| **Idempotency Verification** | PASS | `tests/pos.test.ts` (Test 4) |
| **Over-Return Prevention** | PASS | `tests/pos.test.ts` (Test 5) |
| **Concurrent Session Opening Race** | PASS | `tests/pos.test.ts` (Test 7) |
| **Concurrent Checkout Stock Res** | PASS | `tests/pos.test.ts` (Test 8) |
| **Concurrent Double-Refund Guard** | PASS | `tests/pos.test.ts` (Test 9) |

---

### 3. Comprehensive Verification Results

1. **Entire Automated Test Suite**:
   - Command: `npm test`
   - Output: **All 83 tests passing cleanly with 0 failures!**
     - `test:db` (Persistence): **15/15 passed**
     - `test:security` (Auth/RBAC): **22/22 passed**
     - `test:inventory` (Ledger/Reservations): **24/24 passed**
     - `test:transfer` (Inter-location/Immutability): **13/13 passed**
     - `test:pos` (Checkout/Idempotency/Concurrency): **9/9 passed**
2. **TypeScript & Linting**:
   - Command: `npm run lint` (`tsc --noEmit`)
   - Output: `0 errors`
3. **Production Compilation**:
   - Command: `npm run build`
   - Output: Build succeeded successfully.

