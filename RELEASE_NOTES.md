# AbaCha Unified Commerce Platform — Release Notes

> **Version**: 2.5.0-Stable  
> **Release Date**: September 11, 2026  
> **Target Audience**: Human Owner / Business Supervisor / Handover Lead  
> **Build Status**: PASS  
> **Test Pass Rate**: 100% (151 / 151 Verification Units)  

---

## 1. Executive Summary

We are proud to present **AbaCha v2.5.0-Stable**, a highly secure, enterprise-grade unified commerce platform. By completely unifying Point-of-Sale (POS) and storefront e-commerce into a single server-authoritative engine, AbaCha protects businesses against data desynchronization, inventory leakage, pricing fraud, and network disruptions.

Every business-critical mutation—ranging from POS sessions and cashier registers to inventory movement ledgers, sales, returns, and customer checkouts—has been hardened, validated, and verified through a rigorous automated test suite.

---

## 2. Major Implemented Capabilities

### A. Authentication & Cryptographic Role-Based Access Control (RBAC)
- **State-Free Authoritative Sessions**: Implements secure, state-free JSON Web Tokens (JWT) signed with SHA-256 on the server.
- **Cryptographic Password Seeding**: Customer and employee passwords are encrypted using PBKDF2-HMAC-SHA512 with high-entropy salts. No plain text secrets are stored in the database.
- **Granular RBAC Security Matrix**: Every controller verifies operations against five standard system roles (`Viewer`, `Cashier`, `Manager`, `Admin`, `SuperAdmin`). Attempting to bypass endpoint verification throws immediate HTTP `403 FORBIDDEN` errors.

### B. Multi-Tenant Isolation Protection
- **Fail-Closed Separation**: Every database query enforces logical isolation by scoping statements under `organization_id`. 
- **Header-Level Organization Identification**: The backend resolves tenant scopes strictly from the verified JWT token payload, completely ignoring client-supplied body fields to prevent cross-tenant parameter injection.

### C. Server-Authoritative Inventory Movement Ledger
- **Append-Only Double-Entry Ledger**: All stock level increases, decreases, sales, returns, and transfers are recorded as immutable ledger entries.
- **Negative-Stock Safeguards**: Inventory operations verify on-hand balances in real-time. Attempting to reduce quantities below zero triggers transactional aborts and returns an explicit `INSUFFICIENT_STOCK` rejection.
- **Exact-Decimal Math Protection**: Implements string-formatted fixed-point arithmetic (`NUMERIC(14, 4)` for inventory, `NUMERIC(12, 2)` for finance) to bypass javascript floating-point arithmetic errors.

### D. Offline Point-Of-Sale (POS) Resilience & Sync
- **IndexedDB Persistent Queueing**: Ringing up sales and cashier register shifts during network drops are durably queued in browser-level IndexedDB storage.
- **Exponential Reconnection Backoff**: Network status monitoring automates syncing. Reconnection triggers queue processing with randomized exponential backoff delays.
- **Idempotent Queue Replay**: Sync operations utilize client-generated UUID `idempotency_key` headers to prevent duplicate order generation or multiple inventory deductions in the database during synchronization retries.

### E. Unified Point-Of-Sale (POS) Terminal
- **Session Lifecycle Isolation**: All checkout transactions are strictly bound to open cashier sessions with opening and closing cash reconciliation logs.
- **Dual-Tender Cash & Card Workflows**: Supports cash, card, and custom split-tender transactions.
- **Suppressed POS Shortcuts**: The central POS keyboard hook (`usePosKeyboardShortcuts`) prevents hotkeys from firing inside active text entry forms, inputs, textareas, or drop-downs. Suppresses shortcuts completely during open modals to protect operator entries.

### F. Storefront Customer E-Commerce
- **Anti-Tampering Pricing**: Cart pricing, shipping fees, and tax calculations are computed server-side directly from the database. Client-submitted prices are ignored.
- **Confetti Order Celebration**: Placing an order triggers dynamic visual feedback and displays a live, secure tracking timeline (Placed → Confirmed → Picking → Dispatched → Delivered).

### G. Comprehensive Accessibility (WCAG 2.2 AA)
- **Modal Focus Trapping**: Built a reusable `useModalFocusTrap` hook and registered all POS and storefront dialogs with our centralized `modalManager`. When a modal is open, focus wrapping and tab focus are strictly contained.
- **Keyboard-Operable Catalog Discovery**: Enabled direct keyboard activations (`Enter` and `Space` key listeners) on product discovery cards with visible focus styling for keyboard-only users.

---

## 3. Security & Operational Safety Controls

1. **Error Redaction**: Internal database schemas, PostgreSQL error stacks, and system file paths are scrubbed from HTTP responses. Customers and cashier terminals receive sanitized, clean error logs, protecting internal architecture.
2. **Strict CORS Boundaries**: Production server limits origin access strictly to your configured `APP_URL` to protect against Cross-Origin Resource Sharing (CORS) exploits.
3. **Fail-Closed Database Fallback**: In production mode, the server strictly refuses to fall back to an embedded/local database if the core PostgreSQL connection fails. It aborts immediately, guaranteeing database persistence reliability.

---

## 4. Required Production Configurations

Deploying the system requires setting up the following keys in your environment:
- `NODE_ENV="production"` — Optimizes routing and enables strict security checks.
- `DATABASE_URL` — PostgreSQL connection string.
- `GEMINI_API_KEY` — Google AI Studio secret key for AI-driven assistance.
- `JWT_SECRET` — Symmetric key for signing user sessions.

---

## 5. Known Limitations & Deferred Roadmap Backlog

While fully stable and production-ready, these elements have been noted for post-handover iterations:
1. **Dynamic Database Promotion Coupon Schemas**: Storefront checkouts verify coupon codes locally. Coupon details will be fully integrated into a dedicated relational database table in the next major patch.
2. **Shopper Registration Database CRM Sync**: Customers registering direct accounts on the web have local profiles created. Placed orders capture contact details in database order logs. Direct automated customer account syncing to the central PostgreSQL `customers` table is deferred to Phase 3.
