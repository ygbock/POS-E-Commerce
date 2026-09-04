# Project Context — Omnicore Unified Commerce Platform

> **Document Version**: 1.0.0  
> **Status**: Authoritative Reference  
> **Task Association**: ARCH-001  

---

## 1. Project Purpose & Vision

**Omnicore Unified Commerce** (commercial branded as *Aura Commerce*) is a modern omnichannel retail operating platform designed to unify in-store physical operations with digital e-commerce storefronts under a shared catalog, inventory, and accounting ledger.

The platform eliminates the operational silos between brick-and-mortar sales and digital storefront orders by synchronizing product catalog data, customer loyalty profiles, multi-location stock, and general ledger journal entries.

---

## 2. Business Scope (POS + E-Commerce + Operations)

The platform currently encompasses four core operational domains:

### A. In-Store Point of Sale (POS Terminal)
- Multi-register counter checkout with real-time barcode / QR code scanning.
- Offline and online cart operations, quick sale keypad, and custom line-item adjustments.
- Tender processing supporting Split Tender, Cash, Credit Card, Mobile Money, and Store Credit.
- Cash drawer management: register opening balance, cash-in / cash-out drops, shift reconciliation reports, and closing audits.
- Thermal receipt builder and print preview with custom headers, QR verification codes, tax breakdowns, and return policies.
- Multi-currency switcher with live exchange rate conversions (default system currency: **SLE — Sierra Leonean Leone**).

### B. Customer E-Commerce Storefront
- Responsive consumer shopping interface with brand showcases, category filtering, search suggestions, and promotional banners.
- Customer Cart Drawer, persistent Wishlist, and quick product modal previews.
- Multi-tier customer loyalty rewards program (Bronze, Silver, Gold, Platinum VIP) with point accumulation and coupon redemptions.
- Consumer checkout modal supporting delivery address selection, order tracking lookups, and order status notification hub.

### C. Multi-Location Inventory & Supply Chain
- Multi-branch stock allocation (Main Warehouse, Downtown Flagship, Airport Boutique).
- Low-stock warnings, reorder point thresholds, and stock transfer requests between branches.
- Batch and lot tracking with manufacture/expiry dates for perishable items.
- Serial number registry with lifecycle warranty tracking for serialized hardware.
- Unit of Measure (UOM) conversions (e.g., cases, cartons, individual units).
- Supplier management, purchase order generation, and receiving inspection workflows.

### D. Fintech, General Ledger & Executive Reporting
- Double-entry accounting engine maintaining standard Chart of Accounts (Assets, Liabilities, Equity, Revenue, Expenses).
- Automated journal entry posting for sales, refunds, purchasing receipts, and cash movements.
- Financial statement generators: Real-time Balance Sheet, Income Statement (P&L), and Cash Flow statement.
- Executive KPIs: Gross Merchandise Value (GMV), average order value, gross margin, inventory turnover, and sales velocity charts.
- Immutable audit logging tracking operational events across modules.

---

## 3. Technology Stack

### Frontend Architecture
| Layer | Technologies |
| :--- | :--- |
| **Framework** | React 19 (`react` 19.0.1, `react-dom` 19.0.1) |
| **Language** | TypeScript ~5.8.2 |
| **Build & Dev Tooling** | Vite 6.2.3 with `@vitejs/plugin-react` |
| **Styling & Design System** | Tailwind CSS 4.1.14 with `@tailwindcss/vite` |
| **Motion & Animation** | `motion` 12.23.24 |
| **Icons** | `lucide-react` 0.546.0 |
| **Charts & Data Visualization** | `recharts` 3.10.1 |
| **Barcodes & QR** | `jsbarcode` 3.12.3, `qrcode.react` 4.2.0, `html5-qrcode` 2.3.8 |
| **Confetti & Effects** | `canvas-confetti` 1.9.4 |

### Backend Architecture
| Layer | Technologies |
| :--- | :--- |
| **Server Framework** | Express 4.21.2 |
| **Execution Environment** | Node.js with native TypeScript strip/execution via `tsx` (dev mode) |
| **Production Build** | `esbuild` 0.25.0 bundling `server.ts` to CommonJS `dist/server.cjs` |
| **Middleware** | Vite SPA development middleware (`createServer({ server: { middlewareMode: true }, appType: 'spa' })`) |
| **AI Integration** | `@google/genai` 2.4.0 (Server-side Gemini SDK) |

---

## 4. Current State vs. Target State

It is essential to distinguish between the **CURRENT IMPLEMENTATION** and the **TARGET ARCHITECTURE**. Do not assume target capabilities are already present.

| Dimension | Current State (As-Is) | Target State (To-Be) |
| :--- | :--- | :--- |
| **Primary Persistence** | Client `localStorage` (`omnicore_commerce_db_v1_*`) + in-memory Express arrays | Server-authoritative persistent relational database (PostgreSQL / Cloud SQL) |
| **Backend State Lifetime** | In-memory variables in `server.ts`; resets whenever the process restarts | Durable database transactions with ACID compliance and connection pooling |
| **Inventory Source of Truth** | Client `CommerceContext` mutating `product.stock` locally in the browser | Server-authoritative double-entry stock movement ledger (`Balance + Movement`) |
| **POS Checkout Authority** | Browser calculates totals, discounts, taxes, and pushes order object | Server API computes prices, applies validated promotions, deducts stock atomically |
| **Authentication** | Demo mock users switched via dropdown in UI header | Secure token-based session/OAuth (GSI / Firebase Auth / JWT) validated on server |
| **Authorization & RBAC** | Client-side role switching (`Admin`, `Manager`, `Cashier`, `Customer`) in React state | Server-side role and permission enforcement on every protected API endpoint |
| **API Validation** | Partial parameter checking on Express endpoints; no runtime schema validation | Strict request validation using schemas (Zod or equivalent DTO validation) |
| **Automated Testing** | No test files (`vitest` / `jest` / `playwright` not yet installed) | Automated unit, integration, and contract tests running in CI quality gates |

---

## 5. Current Application Modules

The application codebase is structured under `/src/components`:

```text
src/
├── components/
│   ├── admin/             # System audit logs and administrative views
│   ├── catalog/           # Product, Category, Brand, Attribute, UOM, and Batch management
│   ├── crm/               # Customer profiles, contact details, purchase histories
│   ├── dashboard/         # Executive metrics, charts, performance analytics
│   ├── fintech/           # General ledger, Chart of Accounts, financial statements
│   ├── inventory/         # Stock allocations, branch transfers, adjustment history
│   ├── layout/            # Navigation sidebar, application header, currency switcher
│   ├── orders/            # Order fulfillment workflow (packing, shipping, delivery)
│   ├── pos/               # POS terminal, shifts, cash drops, receipts, barcode scanning
│   ├── purchasing/        # Purchase orders, supplier registry, goods receiving
│   └── storefront/        # E-commerce store, product catalog, cart drawer, checkout modal
├── context/
│   └── CommerceContext.tsx # Central client state store (monolithic context + localStorage)
├── data/
│   └── initialData.ts     # Seed data for products, categories, brands, suppliers, accounts
├── services/
│   └── productService.ts  # Client-side HTTP client calling /api/products
├── types/
│   ├── index.ts           # Core domain entity types and interfaces
│   └── receipt.ts         # Receipt template configuration schemas
└── utils/
    └── receiptUtils.ts    # Formatting and receipt calculation helpers
```

---

## 6. Known Architectural Limitations

1. **Client-Authoritative Operations**: Cart calculations, price overrides, stock decrements, and order creation occur inside `CommerceContext.tsx` within the client browser.
2. **Ephemeral In-Memory Backend**: The Express server (`server.ts`) retains catalog updates in local memory variables (`masterProductsStore`, etc.). A container restart wipes unpersisted server mutations.
3. **Absence of Server Authentication**: Anyone who can reach the port can call mutating `/api/products` endpoints; there is no token validation or server-side authorization check.
4. **Duplicate State Divergence**: Because `CommerceContext` caches products in `localStorage` while `server.ts` maintains in-memory catalog data, state can diverge between sessions or across browser tabs.
5. **Lack of Concurrency Control**: No optimistic or pessimistic locking exists on stock; simultaneous checkouts could over-sell inventory.
6. **No Automated Regression Suite**: Quality verification currently relies exclusively on `npm run lint` (`tsc --noEmit`) and `npm run build`.

---

## 7. Development & Migration Workflow

To modernize Omnicore into an enterprise-ready system, the project will follow the approved roadmap in `.ai/TASK_QUEUE.md`:
1. Establish governance & architectural standards (`ARCH-001`).
2. Establish server-side database schema and persistence layer (`DATA-001`).
3. Enforce server-side authentication and role-based access control (`SEC-001`).
4. Implement server-authoritative inventory ledgers (`INV-001`).
5. Migrate POS and Storefront checkout to atomic server transactions (`POS-001`).
6. Harden and validate all public REST endpoints (`API-001`).
7. Install test suites and enforce quality gates (`QA-001`).
8. Refine UX, offline sync, and resilience (`UX-001`).
9. Finalize production telemetry, observability, and deployment readiness (`PROD-001`).
