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
