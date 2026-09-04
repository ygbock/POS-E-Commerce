# System Risks & Technical Debt Registry

> **Document Version**: 1.0.0  
> **Status**: Active Risk Registry  
> **Task Association**: ARCH-001  
> **Notice**: These risks were identified during the BASELINE-001 review and remain present in the codebase. Task ARCH-001 establishes documentation and governance; it does NOT fix or eliminate these risks.

---

## Risk Summary Matrix

| Risk ID | Title | Severity | Impact | Mitigation Plan |
| :--- | :--- | :--- | :--- | :--- |
| **RISK-001** | Client-Authoritative Business State | **Critical** | Business logic, price overrides, and stock state execute in browser | `POS-001`, `INV-001` |
| **RISK-002** | `localStorage` Business Persistence | **Critical** | Data loss if browser storage cleared; single-device isolation | `DATA-001` |
| **RISK-003** | In-Memory Ephemeral Backend Persistence | **Critical** | Server restart erases all catalog additions and sync logs | `DATA-001` |
| **RISK-004** | Missing Trusted Auth & RBAC Boundary | **High** | Any client can invoke mutating endpoints without credentials | `SEC-001` |
| **RISK-005** | Client-Side Financial Calculations | **High** | Price tampering, erroneous tax or discount math in browser | `POS-001` |
| **RISK-006** | Inventory Integrity & Race Conditions | **High** | Overselling possible under concurrent checkouts; desync | `INV-001` |
| **RISK-007** | API Validation & Mass-Assignment Risk | **Medium** | Unvalidated JSON accepted on Express endpoints | `API-001` |
| **RISK-008** | Simulated Payment Tender Processing | **Medium** | No real-world gateway verification or idempotent settlement | `POS-001`, `PROD-001` |
| **RISK-009** | Absence of Automated Test Suite | **Medium** | Manual testing required; regressions can go unnoticed | `QA-001` |
| **RISK-010** | Absence of CI Quality Gates | **Medium** | Potential broken builds or type errors deployed unnoticed | `QA-001`, `PROD-001` |

---

## Detailed Risk Entries

### RISK-001: Client-Authoritative Business State
- **Description**: Business rules, stock deductions, discount vouchers, and order creation are executed inside `src/context/CommerceContext.tsx`.
- **Vulnerability**: A client can modify JavaScript runtime memory or dispatch artificial context actions to bypass business validation or manipulate inventory numbers.
- **Planned Mitigation**: Move core domain logic into server-side application services with transaction boundaries (`POS-001`, `INV-001`).

---

### RISK-002: `localStorage` Business Persistence
- **Description**: Orders, shifts, stock movements, and financial accounts are stored under `localStorage` keys (`omnicore_commerce_db_v1_*`).
- **Vulnerability**: If a user clears browsing data, switches devices, or accesses the application via private browsing mode, all business history is lost. Multiple registers cannot share state.
- **Planned Mitigation**: Shift authoritative persistence to a centralized cloud relational database (`DATA-001`).

---

### RISK-003: In-Memory Ephemeral Backend Persistence
- **Description**: The Express server (`server.ts`) keeps master catalog state in in-memory variables (`masterProductsStore`, etc.).
- **Vulnerability**: Container restarts, horizontal scaling, or deployments immediately wipe any product, category, or brand created through the API.
- **Planned Mitigation**: Replace in-memory stores with persistent database repositories and migration tools (`DATA-001`).

---

### RISK-004: Missing Trusted Authentication & Authorization Boundary
- **Description**: The `/api/products`, `/api/attributes`, and `/api/catalog/sync` routes have no token verification middleware. Roles are simulated in React state (`userRole`).
- **Vulnerability**: An attacker can send HTTP `POST` or `DELETE` requests directly to the server to modify or purge catalog items without being logged in.
- **Planned Mitigation**: Implement JWT/OAuth authentication middleware and role-based access control decorators (`SEC-001`).

---

### RISK-005: Client-Side Financial Calculations
- **Description**: The cart computes subtotals, taxes, and discounts on the client and directly saves the computed total as the order total.
- **Vulnerability**: Tampering with request payloads or client code could permit checkouts with manipulated prices, invalid coupons, or zero taxes.
- **Planned Mitigation**: Server re-evaluation of prices, line totals, discounts, and taxes on checkout submission (`POS-001`).

---

### RISK-006: Inventory Integrity & Concurrent Race Conditions
- **Description**: Inventory is updated by overwriting a `product.stock` integer.
- **Vulnerability**: In high-traffic scenarios (e.g., flash sales or two cashiers scanning the final item in stock), both transactions could succeed, leading to negative inventory and fulfillment failures.
- **Planned Mitigation**: Implement atomic database transactions with row-level locks and double-entry movement ledgers (`INV-001`).

---

### RISK-007: API Validation & Mass-Assignment Risk
- **Description**: Express handlers parse raw JSON bodies with `express.json({ limit: '10mb' })` without passing fields through a strict schema validation library.
- **Vulnerability**: Unexpected or dangerous fields could be injected into stored records, potentially causing runtime crashes or unintended field mutation.
- **Planned Mitigation**: Implement Zod request schemas and DTO validation middleware (`API-001`).

---

### RISK-008: Simulated Payment Tender Processing
- **Description**: Tenders (Card, Mobile Money, Cash, Store Credit) are marked successful immediately upon user interaction in the UI.
- **Vulnerability**: No cryptographic receipt from payment terminals or webhooks from payment gateways verify that funds were actually captured.
- **Planned Mitigation**: Introduce server-side webhook processing and gateway verification for card/mobile payments (`POS-001`).

---

### RISK-009: Absence of Automated Test Suite
- **Description**: The repository does not contain automated unit, integration, or end-to-end tests (`vitest` / `jest` are not installed in `package.json`).
- **Vulnerability**: Regressions in financial math, catalog synchronization, or inventory calculations can easily escape into production.
- **Planned Mitigation**: Configure a test framework and write automated regression tests for financial and inventory engines (`QA-001`).

---

### RISK-010: Absence of CI Quality Gates
- **Description**: No automated Continuous Integration (CI) pipeline exists to block merges or deployments if linting or compilation fails.
- **Vulnerability**: Unchecked code can be deployed or merged, causing production outages.
- **Planned Mitigation**: Define CI workflows executing `npm run lint` and `npm run build` on every pull request (`QA-001`, `PROD-001`).

---

### RISK-011: Coexistence Window Between In-Memory Stores and Relational Database
- **Description**: While DATA-001 establishes the relational database and migration foundation, existing frontend modules (`POSRegister`, `Storefront`) currently communicate with in-memory arrays and `CommerceContext`.
- **Vulnerability**: If state is updated in the database but the in-memory array is not refreshed (or vice versa) during the transitional phase before domain routes are fully migrated, read inconsistency could occur.
- **Planned Mitigation**: Subsequent tasks (`SEC-001`, `INV-001`, `POS-001`) will systematically migrate individual domain controllers to use the newly created repository layer (`CatalogRepository`, `InventoryRepository`, `OrderRepository`), retiring in-memory arrays incrementally.

