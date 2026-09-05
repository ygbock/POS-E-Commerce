# Security Policy & Defensive Engineering Standards

> **Document Version**: 1.0.0  
> **Status**: Mandatory Security Policy  
> **Task Association**: ARCH-001  

---

## 1. Core Security Philosophy: Zero-Trust Client

In Omnicore Unified Commerce, **security takes absolute priority over developer convenience**.

All software engineers and implementation agents must adhere strictly to the principle that **the client browser is an untrusted execution environment**.

---

## 2. Inviolable Security Rules

### Rule 1: Client State Is Never a Security Boundary
- React state, `CommerceContext`, browser session objects, and local variables are non-authoritative presentation caches.
- They must **NEVER** be treated as a security boundary or trusted source of truth for authorization, identity, permissions, pricing, or inventory.

### Rule 2: UI Role Checks Are Not Authorization
- Conditional UI rendering (e.g., hiding an "Admin Settings" button or disabling a "Delete Product" link based on client state) is a **User Experience feature**, NOT an authorization control.
- A malicious actor or compromised browser can bypass all client UI checks in browser DevTools or execute direct HTTP API requests.
- **Every privileged action MUST be independently authorized on the server.**

### Rule 3: `localStorage` Is Non-Authoritative
- `window.localStorage` is completely readable and writable by anyone with access to the browser console, browser extensions, or XSS vectors.
- `localStorage` must never store unencrypted secrets, authentication credentials, or authoritative financial balances.
- Storing state in `localStorage` is acceptable solely for offline optimistic cache and transient UI preferences (e.g., dark mode, active tab).

### Rule 4: Server-Side Authorization Is Mandatory
- Every endpoint modifying system state, financial data, inventory, or user records must verify:
  1. The authenticated identity of the caller (`req.user`).
  2. The specific permission or role assigned to that identity (`hasPermission('pos.checkout')`).
  3. The branch, store location, or tenant boundary to which the caller is assigned.

### Rule 5: Request Bodies Are Completely Untrusted
- Every incoming HTTP request (`req.body`, `req.query`, `req.params`) must be treated as potentially malicious or malformed.
- Never use bulk-assignment or unvalidated object spread patterns on database models:
  ```typescript
  // ❌ FORBIDDEN: Allows privilege escalation, field tampering, or price injection
  const updatedProduct = { ...product, ...req.body };
  
  // ✅ REQUIRED: Parse and validate through explicit DTO / schema validators
  const validatedPayload = UpdateProductSchema.parse(req.body);
  ```

### Rule 6: Financial Totals Must Be Server-Validated
- The browser may calculate and display cart subtotals, tax estimates, discounts, and currency conversions for UI responsiveness.
- However, when a transaction is submitted:
  - The server **MUST** look up the canonical catalog price for each item.
  - The server **MUST** recalculate applicable taxes based on store location and customer status.
  - The server **MUST** validate coupon codes against active promotions and expiration dates.
  - The server **MUST** reject any checkout request where the client's submitted payment does not match the server's calculated total.

### Rule 7: Inventory Mutations Must Be Server-Authoritative
- Inventory balances cannot be decremented, incremented, or transferred based solely on client assertion.
- The server must verify real-time stock availability, enforce concurrency locks (preventing overselling), and write an atomic ledger movement record.

### Rule 8: Payment Confirmation Must Be Trusted
- Client-side payment callbacks (e.g., payment widget `onSuccess` handlers) are preliminary signals.
- In production, real financial settlements must be confirmed via server-to-server webhooks with cryptographic signature verification (HMAC) or direct gateway API verification before marking orders as `PAID`.

### Rule 9: Secrets and Credentials Must Never Be Committed
- API keys, private keys, database passwords, OAuth client secrets, and JWT signing keys must **NEVER** be committed to Git or embedded in client code.
- All secrets must be declared in `.env.example` (with empty placeholder values) and loaded via environment variables in server runtime.
- Client bundles must never include private server variables. Only variables prefixed with `VITE_` intended for public consumption may be bundled into client assets.

### Rule 10: Sensitive Operations Must Be Auditable
- Any operation altering inventory, financial records, pricing, employee roles, or configuration must generate an immutable audit log entry.
- Audit logs must capture:
  - Timestamp (UTC ISO-8601)
  - Actor ID (user identifier)
  - Action name (e.g., `PRICE_OVERRIDE`, `CASH_DROP`, `STOCK_ADJUSTMENT`)
  - Target resource ID
  - Location / branch ID
  - Before-state and after-state or delta
  - Origin IP and client metadata

### Rule 11: Tenant and Location Isolation
- When multi-location or multi-tenant support is active, every database query must scope results to the authorized location or tenant identifier.
- Cashiers at Branch A must never be able to view, modify, or tender sales belonging to Branch B unless explicitly granted cross-branch supervisory permissions.

---

## 3. Vulnerability Reporting & Remediation Protocol

1. If a critical security vulnerability is detected in the repository:
   - Do not attempt a quick, silent workaround that hides the flaw.
   - Immediately report the finding in `.ai/RISKS.md` and escalate to the supervisor.
   - Open a prioritized task in `.ai/TASK_QUEUE.md` under the `SEC-` prefix.
2. Security fixes must include positive-path and negative-path tests demonstrating both authorized access and rejection of unauthorized exploits.

---

## 4. Implemented Security Architecture (SEC-001)

### 4.1 Authentication Architecture
- **Password Security**: Uses cryptographic PBKDF2 with HMAC-SHA512, 100,000 iterations, 32-byte cryptographically secure salts, and timing-safe comparison (`crypto.timingSafeEqual`) to resist brute-force, rainbow-table, and timing attacks.
- **Session Tokens**: Authoritative RFC 7519 HMAC-SHA256 (HS256) JSON Web Tokens. Production environments fail closed if `JWT_SECRET` is missing, default, or under 32 characters.
- **Revocation & Logout**: Token revocation is enforced via unique `jti` identifiers stored in the authoritative database (`revoked_tokens` table) and checked upon every verified request.

### 4.2 Authorization Architecture & RBAC
- **Role Hierarchy**: 6 standardized system roles (`super_admin`, `store_manager`, `cashier`, `inventory_clerk`, `accountant`, `viewer`).
- **Granular Permissions**: 25+ fine-grained permissions spanning POS checkout, returns, inventory transfers/adjustments, product catalog management, user administration, reports, and system diagnostics.
- **Enforcement Middlewares**:
  - `requireAuth()`: Rejects unauthenticated traffic (HTTP 401).
  - `requirePermission(...)`: Enforces fine-grained capability checks (HTTP 403).
  - `requireRole(...)`: Enforces role-based boundaries (HTTP 403).

### 4.3 Multi-Tenant Isolation Model
- **Boundary Verification**: `requireTenantAccess()` middleware inspects route params, query arguments, and request bodies. Rejects any attempt by a tenant to read or mutate resources of a different organization with HTTP 403 `TENANT_ACCESS_DENIED`.
- **Supervisory Exemption**: Only `super_admin` holds cross-tenant authorization for system-level diagnostics and support.

### 4.4 Request Body Sanitization & Anti-Spoofing
- **Strip Forbidden Identity Keys**: `sanitizeClientBody` actively strips client-supplied identity overrides (`userId`, `role`, `roles`, `isAdmin`, `organizationId`, `permissions`, `actorId`, etc.) before domain handlers process payloads.
- **Authoritative Audit Trails**: Audit log actor identity (`actorId`, `actorRole`, `organizationId`) is strictly retrieved from the cryptographically verified `req.auth` context, completely ignoring any request-body claims.

### 4.5 Rate Limiting & Sensitive Endpoint Protection
- **Rate Limiters**: Configured sliding-window rate limiters for authentication (`authRateLimiter`: 10 req/min), administrative operations (`adminRateLimiter`: 20 req/min), and general API traffic.
- **Privileged Diagnostic Endpoint**: `/api/admin/db-status` requires `requireAuth()`, `requirePermission(PERMISSIONS.ADMIN_DIAGNOSTICS)`, and rate limiting, and sanitizes its output to ensure credentials, passwords, or connection strings are never exposed.

### 4.6 Centralized Error Sanitization & Leak Prevention
- **Defensive Error Handling**: The centralized Express error handler intercepts all unhandled errors on `/api/*`.
- **Zero Information Leakage**: 500-level internal server errors are strictly sanitized. Database connection strings, database credentials, internal hostnames, and stack traces are suppressed from responses, returning generic error codes (`INTERNAL_ERROR`).
- **Client Error Differentiation**: 4xx-level validation errors return clear, structured JSON error objects without revealing server internals.

### 4.7 API Surface Classification & Security Matrix
Every `/api/*` endpoint is classified into one of five authorization tiers:
1. **PUBLIC**: Unauthenticated access permitted (e.g. `/api/health`, `/api/ready`, `/api/auth/login`, catalog reading for default tenant). Sensitive endpoints (login/PIN) are rate-limited.
2. **AUTHENTICATED**: Valid cryptographically verified JWT required (e.g. `/api/auth/me`, `/api/auth/logout`, `/api/roles/permissions`).
3. **PERMISSION-PROTECTED**: Explicit permission token claim required in addition to valid authentication (e.g. `products.create`, `orders.view`, `customers.view`).
4. **ADMIN/PRIVILEGED**: Restricted to administrative or supervisory roles with high-risk permissions (e.g. `/api/admin/db-status`, `/api/products/:id` DELETE).
5. **INTERNAL**: Restricted exclusively to non-production development/test harnesses; disabled or blocked in production.

### 4.8 Transitional Limitations
- **Single-Instance In-Memory Token Blacklist Cache**: The local in-memory revoked tokens cache accelerates token verification; in distributed multi-instance deployment, this cache will transition to Redis or direct PostgreSQL read replication.

### 4.9 Production Credential Seed Isolation & Protection
- **No Automatic Credential Seeding in Production**: Development and test user accounts with default or known passwords must never be seeded automatically upon production startup.
- **Fail-Closed Production Guard**: `AuthService.seedDefaultUsers()` and server initialization explicitly evaluate `NODE_ENV === 'production'` or `isProd`. Any attempt to execute default credential seeding in production throws a fatal error and terminates execution immediately. Production user provisioning must occur exclusively via authorized administrative invitation flows.

### 4.10 Health & Readiness Live Probing & Leak Prevention
- **Live Readiness Probes**: `/api/ready` and `/api/health` execute a live query (`SELECT 1`) to verify database responsiveness rather than relying on a static initialization flag.
- **Outage Sanitization**: During a database outage or degraded state, `/api/ready` returns HTTP 503 with a structured, non-leaking JSON payload (`status: 'unready'`, `ready: false`, `database.connected: false`).
- **Zero Internal Leakage**: Error messages, stack traces, database usernames, and connection parameters are strictly excluded from all public probe responses.

### 4.11 Authentication Error Sanitization
- **Generic 401 Rejections**: Failed authentication attempts (missing token, expired token, signature mismatch, malformed header) return a sanitized, uniform HTTP 401 Unauthorized response (`UNAUTHORIZED: Authentication required.`).
- **Suppression of Token & Cryptographic Internals**: Internal token verification details (such as cryptographic signature algorithms, token payload internals, or stack traces) are logged strictly to server-side diagnostic logs and never returned in client HTTP responses.

### 4.12 Deep Resource-Level Multi-Tenant Isolation
- **Caller-Scoped Operations**: All resource queries, updates, and creations must be explicitly scoped using the authenticated caller's tenant identifier (`req.auth.organizationId`).
- **Request Body & Query Pinning**: Request body claims or query parameters targeting another organization are either rejected with HTTP 403 `TENANT_ACCESS_DENIED` or strictly overridden with the caller's authorized tenant identifier.
- **Repository-Level Parameter Enforcement**: Domain repositories (`OrderRepository`, `CustomerRepository`, `InventoryRepository`, `UserRepository`) enforce `organizationId` parameterization in all primary database queries. Cross-tenant access is restricted solely to users possessing the `super_admin` role.

