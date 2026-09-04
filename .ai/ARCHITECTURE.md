# System Architecture Specification — Omnicore Unified Commerce

> **Document Version**: 1.0.0  
> **Status**: Canonical Architecture Specification  
> **Task Association**: ARCH-001  

---

## 1. Executive Summary & Architectural Mission

This document defines the architectural baseline and target operating model for the **Omnicore Unified Commerce** application.

The primary architectural mission is transforming the existing single-page client-centric prototype into a secure, server-authoritative, transactionally consistent omnichannel platform supporting concurrent Point of Sale (POS) checkouts, digital storefront orders, multi-branch inventory tracking, and double-entry general ledger accounting.

---

## 2. Current Architecture (As-Is)

Currently, the application runs as a hybrid Express + React single-page application (SPA):

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER (React 19)                       │
│                                                                        │
│  ┌────────────────────────┐         ┌───────────────────────────────┐  │
│  │   UI View Components   │         │    CommerceContext (State)    │  │
│  │  (POS, Storefront,     │ ◄─────► │  - Products & Categories      │  │
│  │   Inventory, Ledger,   │         │  - Cart & Orders State        │  │
│  │   CRM, Purchasing)     │         │  - Stock Quantities & Logs    │  │
│  └────────────────────────┘         │  - Shifts & Financial JEs     │  │
│                                     └──────────────┬────────────────┘  │
│                                                    │                   │
│                                         Direct read/write              │
│                                                    ▼                   │
│                                     ┌───────────────────────────────┐  │
│                                     │     Browser localStorage      │  │
│                                     │ (omnicore_commerce_db_v1_*)   │  │
│                                     └───────────────────────────────┘  │
└────────────────────────────────────────────────────┬───────────────────┘
                                                     │
                                            HTTP Fetch (REST)
                                        (ProductService client)
                                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     BACKEND SERVER (Express 4.21)                      │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Express REST Endpoints (/api/products, /api/attributes, etc.)    │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │                                  │
│                               Direct mutation                          │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ In-Memory JavaScript Arrays                                      │  │
│  │ (let masterProductsStore = [...], masterCategoriesStore = [...]) │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Characteristics of Current Architecture
1. **Client-Centric Computing**: The bulk of business logic (tax computations, discount calculations, order generation, shift reconciliations, inventory stock increments/decrements, journal entry creation) executes inside the browser within `CommerceContext.tsx`.
2. **Dual-Persistence Disconnect**:
   - The browser persists application state to `window.localStorage` under partitioned keys (`omnicore_commerce_db_v1_products`, `_orders`, `_shifts`, `_stockMovements`, `_journalEntries`).
   - The Express server (`server.ts`) maintains in-memory arrays populated from `src/data/initialData.ts`. Edits to products via `/api/products` update memory on the server, but any server restart erases them.
3. **No Central Transaction Coordinator**: There is no ACID database engine or centralized locking mechanism coordinating inventory availability across POS registers and e-commerce shoppers.

---

## 3. Current Data Flow

```text
User Action (e.g. POS Checkout)
  │
  ├─► 1. UI computes cart subtotals, tax rate, and discounts in React component
  │
  ├─► 2. Component calls CommerceContext.createOrder(orderPayload)
  │
  ├─► 3. CommerceContext updates React state in memory
  │
  ├─► 4. CommerceContext mutates product.stock array in client memory
  │
  ├─► 5. CommerceContext appends new stock movement to in-memory array
  │
  ├─► 6. CommerceContext appends new journal entry to in-memory ledger
  │
  └─► 7. React useEffect writes serialized JSON arrays to window.localStorage
```

Notice that during checkout, **no HTTP request is sent to the Express server**. The entire sale, stock decrement, and financial posting occur within the client's local browser storage.

---

## 4. Current Frontend/Backend Boundaries

| Domain | Handled by Frontend (`src/`) | Handled by Backend (`server.ts`) |
| :--- | :--- | :--- |
| **Catalog & Products** | Display, local editing, filtering, search | In-memory CRUD endpoints (`/api/products`), SKU lookup |
| **Inventory & Stock** | All stock levels, transfers, batch/serial tracking | None (unaware of stock movements) |
| **POS Terminal** | Cart, price overrides, barcode scan, receipt printing | None |
| **Order Processing** | Order creation, status updates, fulfillment steps | None |
| **Fintech & Ledger** | Double-entry journal posting, financial reports | None |
| **CRM & Customers** | Customer list, loyalty points, tiers, addresses | None |
| **Purchasing** | PO creation, status workflows, supplier balances | None |
| **Auth & Roles** | Role switcher dropdown in header (`userRole` state) | None (all `/api` routes are unauthenticated) |

---

## 5. Current Persistence Model

### Client Persistence (`localStorage`)
- Storage Key Prefix: `omnicore_commerce_db_v1_`
- Stored Entities:
  - `products`: Array of `Product` objects (with variant structures, prices, and stock counts)
  - `categories` & `brands`: Category and brand taxonomy definitions
  - `orders`: All POS sales and e-commerce store orders
  - `stockMovements`: History of adjustments, transfers, and sales deductions
  - `posShifts`: Register open/close records, cash drops, reconciliations
  - `customers`: Customer records, tiers, loyalty points
  - `suppliers` & `purchaseOrders`: Supply chain purchasing records
  - `journalEntries` & `accounts`: General ledger Chart of Accounts and journal lines
  - `currencyCode`, `exchangeRates`: Currency preference and exchange rates cache

### Server Persistence
- Volatile in-memory variables in Node.js process:
  - `masterProductsStore: Product[]`
  - `masterCategoriesStore: any[]`
  - `masterBrandsStore: any[]`
  - `masterAttributesStore: CatalogAttribute[]`
  - `syncAuditLogs: any[]`

---

## 6. Current Inventory Architecture

The existing inventory system operates on a **balance-overwrite** pattern in the client browser:
- Each product holds a `stock: number` and an optional `locationStock: Record<string, number>` map.
- When an item is sold, `CommerceContext` mutates `product.stock = product.stock - quantity` and updates `product.locationStock[locationId]`.
- An entry is appended to a `stockMovements` array for display in the inventory movement history table.
- **Vulnerability**: Because movements and balances are updated independently without a database transaction or atomic lock, discrepancies between the movement log and the stock balance can easily occur.

---

## 7. Current POS Architecture

- The POS terminal (`src/components/pos/PosTerminal.tsx`) manages cart state, price overrides, tax calculations, and discount vouchers locally.
- When tender is finalized, an `Order` object is assembled containing client-calculated totals.
- Cash register shifts (`src/components/pos/ShiftModal.tsx`) track opening floats, cash-in/out drops, and expected cash drawer totals purely inside React state.

---

## 8. Current Security Boundaries

- **Client State Security**: Currently, security relies on UI-level conditional rendering (e.g., `userRole !== 'cashier' ? <Button /> : null`).
- **No API Authentication**: Requests to `/api/products` require no bearer token, API key, session cookie, or identity verification.
- **No Request Validation**: Express endpoints do not parse request payloads through schema validation libraries (such as Zod). Arbitrary JSON can be submitted in `req.body`.
- **Untrusted Financial Computation**: The server has no mechanism to verify if a submitted price, discount, or tax calculation matches business rules.

---

## 9. Known Architectural Problems & Technical Debt

1. **Risk of Data Loss**: Clearing browser cookies or cache wipes all sales, shifts, journal entries, and customer data.
2. **Multi-User Conflict**: Two cashiers on different devices cannot share inventory or view each other's transactions.
3. **No Race-Condition Prevention**: Simultaneous purchases of the last item in stock will result in negative inventory.
4. **Security Exposure**: Client users can manipulate prices or assign themselves administrative privileges in DevTools.
5. **Lack of Idempotency**: Network retry or duplicate button clicks can result in duplicate orders.

---

## 10. Target Production Architecture (To-Be)

The target architecture establishes a clean, decoupled, layered system where all business rules, financial calculations, and inventory allocations are **strictly server-authoritative**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                             CLIENT LAYER                               │
│  React 19 SPA (POS Register, Storefront, Admin Portal, Back-Office)    │
│  - Presentation, optimistic UI feedback, input capture, offline cache  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         HTTPS + JWT / Auth Bearer
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY & ROUTING                           │
│  Express API Routers (/api/v1/pos, /api/v1/catalog, /api/v1/orders)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 AUTHENTICATION & AUTHORIZATION (RBAC)                  │
│  - Verify token signature, session status, and tenant context          │
│  - Enforce role & permission boundaries (Admin, Manager, Cashier, etc.)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      REQUEST VALIDATION & SANITIZATION                 │
│  - Strict schema validation (Zod DTOs)                                 │
│  - Reject unknown fields, enforce types, sanitize strings              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       APPLICATION SERVICE LAYER                        │
│  - CheckoutService (authoritative tax, discount, total recomputation)  │
│  - InventoryService (double-entry stock movement & reservation)        │
│  - LedgerService (automated journal entry creation & posting)          │
│  - ShiftService (cash drawer open/close reconciliation)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     DATA ACCESS & REPOSITORY LAYER                     │
│  - Abstracted repositories with atomic database transactions           │
│  - Concurrency controls (pessimistic / optimistic locking on stock)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       PERSISTENT DATABASE (ACID)                       │
│  PostgreSQL / Cloud SQL / Firestore                                    │
│  - Normalized relational tables, foreign key constraints               │
│  - Audit logs, immutable financial ledgers, stock movement ledgers     │
└────────────────────────────────────────────────────────────────────────┘
```

### Core Tenets of Target Architecture

1. **Server-Authoritative Business Engine**:
   - The browser never submits final order totals or updated stock quantities.
   - The browser submits items and requested quantities; the server looks up authoritative prices, validates discounts, calculates taxes, checks stock availability, executes atomic reservation, and creates the order.
2. **Immutable Inventory Movement Ledger**:
   - Stock balances are not freely overwritten. Every stock change is backed by an immutable movement ledger entry (`inventory_movements`) referencing an event ID (`POS_SALE`, `ECOMMERCE_SALE`, `PURCHASE_RECEIVE`, `TRANSFER_IN`, `TRANSFER_OUT`, `DAMAGE_WRITE_OFF`, etc.).
   - Terminology note: Inventory movements track physical stock additions and deductions with append-only ledger records; this is distinct from financial double-entry General Ledger bookkeeping.
   - Current on-hand stock at location $L$ for product variant $V$ equals:
     $$\text{Balance}(V, L) = \sum \text{Movements}(V, L)$$
3. **Transactionally Bound Checkout**:
   - Order creation, stock deduction, payment tender verification, and general ledger journal posting occur inside a single atomic database transaction. If any step fails, the entire transaction rolls back.
4. **Zero-Trust Client Input**:
   - All input parameters are validated against strict type schemas before reaching business logic.

---

## 10.1 Transitional Authority Model & Database Runtime Controls (DATA-001)

During the migration roadmap, the application operates in a transitional coexistence window governed by strict authority boundaries:

```text
PostgreSQL
→ Authoritative persistence for all domains implemented through DATA-001 (Catalog, Inventory, Orders, Customers, Audit).

Existing In-Memory Stores (server.ts)
→ Legacy backward-compatibility only for unmigrated endpoints during transitional phases.
→ MANDATE: New functionality must NEVER extend legacy in-memory stores.

CommerceContext / localStorage
→ Transitional client-side display cache only; non-authoritative.
```

### Production Database Fail-Closed Policy
- **Driver Selection Rules**:
  - `Development / Test`: Embedded WebAssembly PGlite (`@electric-sql/pglite`) is permitted for instant, zero-dependency local startup.
  - `Production`: Standard PostgreSQL (`PostgresPoolClient` via `pg.Pool`) is strictly required.
  - `Production Fail-Closed Rule`: If `DATABASE_URL` or `PGHOST` is missing, invalid, or unavailable in production, the application fails closed immediately (crashes or reports 503 on health/readiness). Production **must never** silently fall back to PGlite.

### Seed Isolation Policy
- Schema migrations (`server/db/migrations`) contain DDL/schema statements and operational tables only.
- Demo seed scripts (`server/db/seeds`) are decoupled and isolated. Server startup executes migrations only and never executes demo seeds.
- Demo seeds are blocked in production environments unless `ALLOW_DEMO_SEED=true` is explicitly provided.

---

## 10.2 Authentication & Security Boundary Architecture (SEC-001)

Following the persistence baseline (DATA-001), SEC-001 establishes an authoritative server-side security boundary preventing client-side spoofing of identity, roles, and tenant data.

### 1. Cryptographic Authentication & Token Lifecycle
- **Password Hashing**: PBKDF2 with HMAC-SHA512 (100,000 rounds, 32-byte salt, constant-time verification).
- **Session Tokens**: RFC 7519 HMAC-SHA256 (HS256) JWTs signed server-side using high-entropy `JWT_SECRET`.
- **Authoritative Token Revocation**: Database-backed `revoked_tokens` table tracks revoked JWT identifiers (`jti`) upon logout, supported by an in-memory verification cache for sub-millisecond lookups.

### 2. Standardized Middleware Chain
All incoming requests pass through a strictly ordered defensive middleware pipeline:
```text
Client HTTP Request (with Authorization: Bearer <token>)
  │
  ▼
1. Rate Limiting Middleware (authRateLimiter / adminRateLimiter / generalRateLimiter)
  │ (Rejects abusive traffic with HTTP 429 Too Many Requests + Retry-After header)
  ▼
2. createAuthenticateMiddleware()
  │ (Cryptographically validates signature, expiration, and revocation status; attaches req.auth)
  ▼
3. requireAuth()
  │ (Rejects missing or invalid credentials with HTTP 401 Unauthorized)
  ▼
4. requirePermission(...) / requireRole(...)
  │ (Rejects callers lacking required permissions or roles with HTTP 403 Forbidden)
  ▼
5. requireTenantAccess()
  │ (Enforces organizationId boundary; prevents cross-tenant access with HTTP 403 TENANT_ACCESS_DENIED)
  ▼
6. sanitizeClientBody() / validateBody(...)
  │ (Strips client-supplied role/tenant/userId keys to guarantee anti-spoofing)
  ▼
7. Service & Repository Layer (Authoritative business logic & PostgreSQL execution)
  │ (Audit logs record authoritative req.auth.userId, req.auth.role, req.auth.organizationId)
  ▼
HTTP Response (Safe sanitized JSON; no credentials or stack traces leaked)
```

### 3. Server-Authoritative Audit Model
Audit trails (`audit_logs` table and synchronization audit log) record:
- `actorId`: Authoritatively retrieved from `req.auth.userId`.
- `actorRole`: Authoritatively retrieved from `req.auth.role`.
- `organizationId`: Authoritatively retrieved from `req.auth.organizationId`.
Any client-supplied `userId`, `role`, `roles`, `isAdmin`, or `actorId` in request bodies is discarded before reaching business or auditing logic.


---

## 11. Migration Roadmap

To transition from the current state to the target architecture without breaking user workflows, changes will be executed incrementally:

1. **ARCH-001** (Current): Establish governance, architectural baseline, coding standards, and security policies.
2. **DATA-001**: Establish server-side persistence schema and data migration strategies.
3. **SEC-001**: Implement server-side authentication, session tokens, and RBAC middleware.
4. **INV-001**: Build server-authoritative inventory ledger service and atomic transfer endpoints.
5. **POS-001**: Re-engineer POS checkout and cart calculation to execute via transactional server APIs.
6. **API-001**: Harden all public REST endpoints with strict DTO validation and idempotency keys.
7. **QA-001**: Implement automated unit, integration, and contract tests.
8. **UX-001**: Implement robust offline queueing, synchronization indicators, and error banners.
9. **PROD-001**: Configure production logging, telemetry, security headers, and deployment pipelines.
