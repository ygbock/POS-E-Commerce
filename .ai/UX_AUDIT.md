# Comprehensive UI/UX Audit Report — AbaCha Unified Commerce

> **Document Version**: 1.0.0  
> **Status**: READY FOR SUPERVISOR REVIEW  
> **Task Association**: UX-001 Phase 1  
> **Target Standard**: WCAG 2.2 AA Compliance & Server-Authoritative Omnichannel UX  

---

## 1. Executive Summary

This document presents the comprehensive UI/UX audit for the **AbaCha Unified Commerce** application, conducted under **UX-001 Phase 1**.

The primary purpose of this phase is to evaluate the existing frontend interface against core enterprise usability standards, WCAG 2.2 AA accessibility mandates, multi-device responsiveness requirements, real-world physical retail POS ergonomics, and server-authoritative security boundaries.

### Key Audit Findings Summary
- **P0 — Critical (5 Findings)**: Client-side authority leakage in POS checkout, E-commerce checkout, Inventory management, and General Ledger posting; Security boundary confusion in header role switcher.
- **P1 — High (7 Findings)**: Absence of React Error Boundary wrapping; Lack of offline resilience queue & sync status indicators in POS; Disconnect between client shift UI and server POS session state machine; Inventory terminology mismatch; Oversized monolithic components (`PosTerminal.tsx`, `CustomerAccountModal.tsx`, `CommerceContext.tsx`); Unhandled video stream cleanup in barcode scanner; Single-state `activeTab` navigation lacking browser history.
- **P2 — Medium (5 Findings)**: Lack of a standardized shared component design system primitive library (`src/components/ui/`); Heavy DOM render lag on unpaginated tables; Inconsistent toast notification systems; Modal accessibility & focus trap deficiencies; Divergent form validation feedback styles.
- **P3 — Polish (3 Findings)**: Dark mode color hierarchy inconsistencies; Micro-interaction & skeleton loading gaps; Mobile touch target density calibration.

---

## 2. Current-State Frontend Architecture Assessment

The frontend is implemented as a React 19 Single Page Application (SPA) compiled via Vite 6.2 and styled with Tailwind CSS 4.1.

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT BROWSER (React 19 SPA)                        │
│                                                                                  │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │ App.tsx (MainLayout & Navigation Shell)                                  │   │
│   │  - State: activeTab ('storefront' | 'pos' | 'inventory' | 'dashboard')   │   │
│   │  - Controls switching between Storefront view and Admin/POS shell        │   │
│   └────────────────────────────────────┬─────────────────────────────────────┘   │
│                                        │                                         │
│                    ┌───────────────────┴───────────────────┐                     │
│                    ▼                                       ▼                     │
│   ┌──────────────────────────────────┐    ┌──────────────────────────────────┐   │
│   │ Customer Storefront Shell        │    │ Back-Office & POS Admin Shell    │   │
│   │ (Storefront.tsx, StoreHeader,    │    │ (Header.tsx, Sidebar.tsx,        │   │
│   │  StoreCheckoutModal.tsx)         │    │  PosTerminal.tsx, StockMgmt)     │   │
│   └────────────────┬─────────────────┘    └────────────────┬─────────────────┘   │
│                    │                                       │                     │
│                    └───────────────────┬───────────────────┘                     │
│                                        │                                         │
│                                        ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │ CommerceContext.tsx (Monolithic Context Store - 2,500+ lines)            │   │
│   │  - Holds all catalog, cart, customer, shift, ledger, and order state     │   │
│   │  - Direct read/write to window.localStorage ('abacha_commerce_db_v1_*') │   │
│   └──────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Technical Debt Identified in UI Layer
1. **Single-State Navigation**: Route navigation relies solely on a React string variable (`activeTab` in [App.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/App.tsx#L19)). There are no URL routes, search params, or browser history integrations. Refreshing or bookmarking loses position.
2. **Monolithic Context Dependence**: [CommerceContext.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/context/CommerceContext.tsx) manages over 20 distinct domain entities in a single React context. Any minor state change (such as typing in a search bar or opening a drawer) triggers top-down re-renders across all active views.
3. **Absence of Shared UI Primitives**: The codebase lacks a dedicated `src/components/ui` primitive directory. Buttons, inputs, modals, cards, badges, and tables are defined ad-hoc with inline Tailwind utility strings duplicated across 30+ files.
4. **Bypassed Server APIs**: Even though backend server endpoints exist for POS checkouts (`/api/pos/checkout`), inventory transfers (`/api/inventory/transfers`), and authentication (`/api/auth/login`), several UI components continue calling client-side `CommerceContext` methods that mutate `localStorage`.

---

## 3. Categorized UX Findings

### P0 — Critical Findings

#### Finding P0-1: Security Boundary Confusion & Identity Spoofing in Header Persona Switcher
- **File / Component**: [Header.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/layout/Header.tsx#L125-L160), [App.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/App.tsx#L26-L32)
- **Current Behavior**: A drop-down menu in the top application header presents options for "E-commerce Customer", "Cashier", "Inventory Manager", "Store Manager", "Administrator", and "Super Admin". Selecting an option instantly mutates `currentRole` in React state and immediately unlocks administrative navigation links in [Sidebar.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/layout/Sidebar.tsx).
- **Problem**: Changing persona in the UI operates purely on client-side state without requiring password re-entry or verifying server-side JWT permissions. While `authClient.loginAsPersona()` exists, the UI renders administrative tabs as if permission is granted before verifying tokens.
- **Impact**: Creates fundamental security boundary confusion. Violates [SECURITY_POLICY.md](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/.ai/SECURITY_POLICY.md#L19) Rule 2 ("UI Role Checks Are Not Authorization").
- **Recommended Solution**: Transform the header persona switcher into a clear "Development Persona Sandbox" indicator clearly demarcated as non-production, or replace it with a formal authentication modal executing server token validation via `/api/auth/login`.
- **Priority**: P0
- **Dependencies**: `SEC-001`

#### Finding P0-2: Client-Authoritative Checkout in POS Terminal UI
- **File / Component**: [PosTerminal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/pos/PosTerminal.tsx#L277-L301)
- **Current Behavior**: Clicking "PAY / TENDER" in `PosTerminal.tsx` executes `handleExecuteCheckout()`, which calls `processPosCheckout(payments, appliedPromoCode)` on `CommerceContext`.
- **Problem**: Computes totals, taxes, and discounts inside browser JavaScript and writes the completed order and stock deduction to browser `localStorage`. It does NOT dispatch a `POST /api/pos/checkout` request to the server checkout engine.
- **Impact**: Bypasses server-authoritative price calculation, transactional row locks, double-entry inventory movement ledgers, and database audit logs established in `POS-001`.
- **Recommended Solution**: Wire `PosTerminal.tsx` directly to `fetch('/api/pos/checkout')` with payload `{ sessionId, items, tenderPayments, idempotencyKey }`. Display server-validated totals and receipts.
- **Priority**: P0
- **Dependencies**: `POS-001`

#### Finding P0-3: Client-Authoritative E-Commerce Storefront Checkout
- **File / Component**: [StoreCheckoutModal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/storefront/StoreCheckoutModal.tsx#L190-L235)
- **Current Behavior**: Submitting the consumer checkout form executes `placeEcommerceOrder()`, which constructs an order object in client memory and appends it to `localStorage`.
- **Problem**: No HTTP POST request is sent to backend order endpoints. Cart subtotals, delivery fees, and promo code discounts are trusted directly from the client.
- **Impact**: Risk of price tampering, fake discounts, and zero-inventory allocation.
- **Recommended Solution**: Refactor `StoreCheckoutModal.tsx` to invoke server order creation APIs (`POST /api/orders`) with strict DTO validation.
- **Priority**: P0
- **Dependencies**: `API-001`

#### Finding P0-4: Direct Balance Overwriting & Non-Ledger Stock Operations in Inventory UI
- **File / Component**: [StockManagement.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/inventory/StockManagement.tsx#L210-L340)
- **Current Behavior**: Performing a stock adjustment or branch transfer in `StockManagement.tsx` updates `product.stock` in `CommerceContext` and appends an object to the client `stockMovements` array.
- **Problem**: Completely bypasses the server-authoritative inventory engine (`/api/inventory/adjustments` and `/api/inventory/transfers`), failing to create atomic PostgreSQL movement ledger records or enforce pessimistic row locks (`SELECT FOR UPDATE`).
- **Impact**: Risk of inventory desync, overselling, and unrecorded shrinkage.
- **Recommended Solution**: Refactor all inventory actions in `StockManagement.tsx` to call backend `/api/inventory/*` services.
- **Priority**: P0
- **Dependencies**: `INV-001`, `INV-001R3`

#### Finding P0-5: General Ledger & Financial Posting Executed in Client Browser
- **File / Component**: [LedgerAndFinance.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/fintech/LedgerAndFinance.tsx)
- **Current Behavior**: Balance Sheet, Income Statement, and double-entry journal entries are generated from client `localStorage` arrays (`INITIAL_LEDGER_ENTRIES` + client order postings).
- **Problem**: Financial statements can be altered or erased by clearing browser cache.
- **Impact**: Lack of auditability and compliance risk for financial accounting.
- **Recommended Solution**: Connect `LedgerAndFinance.tsx` to server-authoritative accounting ledger APIs.
- **Priority**: P0
- **Dependencies**: `DATA-001`

---

### P1 — High Findings

#### Finding P1-1: Absence of SPA Error Boundary Protection
- **File / Component**: [App.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/App.tsx#L103-L109), [main.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/main.tsx)
- **Current Behavior**: The React application root has no top-level `ErrorBoundary` component.
- **Problem**: An unhandled runtime error in any child component (e.g., malformed date string or undefined property access in a table row) crashes the entire React component tree, displaying a blank white screen.
- **Impact**: Cashier or administrator is locked out of the application with zero error recovery mechanism or user-friendly error message.
- **Recommended Solution**: Implement a robust React `ErrorBoundary` wrapper with a fallback UI featuring a "Reload Module" button and error reporting diagnostics.
- **Priority**: P1
- **Dependencies**: None

#### Finding P1-2: Lack of Offline Resilience Queue & Visual Sync Indicators in POS Terminal
- **File / Component**: [PosTerminal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/pos/PosTerminal.tsx)
- **Current Behavior**: The POS UI assumes continuous network connectivity. If connection drops during checkout, the operation fails silently or throws an uncaught fetch error.
- **Problem**: No visual indicator showing Online/Offline/Syncing status; no local queue (e.g. IndexedDB) to buffer transactions during internet outages.
- **Impact**: Cashiers cannot operate during retail network drops.
- **Recommended Solution**: Introduce an `OnlineStatusBadge` component, local IndexedDB transactional queueing, and background auto-sync worker.
- **Priority**: P1
- **Dependencies**: `UX-001`

#### Finding P1-3: Terminal State Machine & Register Shift Disconnect
- **File / Component**: [ShiftModal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/pos/ShiftModal.tsx), [PosTerminal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/pos/PosTerminal.tsx)
- **Current Behavior**: Register opening floats, cash drops, and shift closing reconciliations are stored in `CommerceContext` React state.
- **Problem**: Client UI does not synchronize with server POS sessions (`/api/pos/sessions`). A cashier can ring sales on a register even if no active server shift is opened.
- **Impact**: Cash drawer discrepancies cannot be reliably audited against server shift records.
- **Recommended Solution**: Bind POS terminal ringing capabilities strictly to active server session status (`GET /api/pos/sessions/active`).
- **Priority**: P1
- **Dependencies**: `POS-001`

#### Finding P1-4: Terminology Disconnect Between Inventory UI and Server Domain Model
- **File / Component**: [StockManagement.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/inventory/StockManagement.tsx#L180-L205)
- **Current Behavior**: The inventory UI displays stock using a single column labeled "Total Stock" or "In Stock".
- **Problem**: Server architecture ([ADR-012](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/.ai/DECISIONS.md#L166)) strictly defines stock quantities using formal domain categories: `on_hand`, `available`, `reserved`, `damaged`, `expired`, and `in_transit`.
- **Impact**: Inventory operators cannot distinguish between stock available for sale versus stock reserved for pending e-commerce orders or damaged goods.
- **Recommended Solution**: Update stock tables and modal views to display exact server domain fields (`On Hand`, `Available`, `Reserved`, `In Transit`, `Damaged/Expired`).
- **Priority**: P1
- **Dependencies**: `INV-001`

#### Finding P1-5: Oversized Monolithic Components
- **File / Component**: [PosTerminal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/pos/PosTerminal.tsx) (74KB, 1,469 lines), [CustomerAccountModal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/storefront/CustomerAccountModal.tsx) (77KB, 1,600 lines), [BarcodeLabelModal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/catalog/BarcodeLabelModal.tsx) (133KB, 2,200 lines)
- **Current Behavior**: Massive single-file components containing state, business logic, modals, search, tables, print helpers, and inline CSS layout.
- **Problem**: Violates Single-Responsibility Principle and [CODING_STANDARDS.md](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/.ai/CODING_STANDARDS.md#L98) Rule 8 (files should be focused and under 400 lines).
- **Impact**: Poor code readability, extreme maintenance friction, and high regression risk during edits.
- **Recommended Solution**: Decompose monolithic components into focused sub-components under `src/components/{domain}/components/`.
- **Priority**: P1
- **Dependencies**: None

#### Finding P1-6: Unhandled Camera Stream Resource Allocation in Barcode Scanner Modal
- **File / Component**: [BarcodeQrScannerModal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/pos/BarcodeQrScannerModal.tsx) (44KB)
- **Current Behavior**: Instantiates `html5-qrcode` camera stream inside `useEffect`.
- **Problem**: If the user closes the modal rapidly or navigates away while scanning, camera track cleanup (`stop()`) is occasionally skipped or throws uncaught promise rejections.
- **Impact**: Video stream remains locked, draining mobile battery or blocking hardware camera access for subsequent scans.
- **Recommended Solution**: Wrap camera lifecycle in robust `try/finally` cleanup handlers and ensure all media tracks are explicitly stopped on unmount.
- **Priority**: P1
- **Dependencies**: None

#### Finding P1-7: Single-State Navigation Lacking Browser History & URL Routing
- **File / Component**: [App.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/App.tsx#L19)
- **Current Behavior**: App switching relies entirely on `const [activeTab, setActiveTab] = useState('storefront')`.
- **Problem**: Browser back and forward buttons do not work. Users cannot bookmark specific tabs (e.g., POS terminal or Inventory Stock Matrix).
- **Impact**: Frustrating browser navigation experience for desktop and tablet users.
- **Recommended Solution**: Introduce lightweight URL query param sync (`?tab=pos`) or hash-based routing while maintaining zero external routing framework dependencies if required.
- **Priority**: P1
- **Dependencies**: None

---

### P2 — Medium Findings

#### Finding P2-1: Lack of Standardized Shared UI Design System Primitive Library
- **File / Component**: Entire `src/components/` codebase
- **Current Behavior**: Over 50 components duplicate button definitions, text inputs, selects, table containers, badges, and modal overlays using ad-hoc inline Tailwind strings.
- **Problem**: Inconsistent visual appearance (varying border colors, padding, rounded radii `rounded-lg` vs `rounded-2xl` vs `rounded-3xl`, shadow strengths, font weights).
- **Impact**: Bloated bundle size, visual design inconsistency, and high effort when tweaking theme styles.
- **Recommended Solution**: Establish a unified primitive UI library in `src/components/ui/` (`Button`, `Input`, `Select`, `Modal`, `Badge`, `Card`, `Table`, `Toast`, `Spinner`).
- **Priority**: P2
- **Dependencies**: None

#### Finding P2-2: Table Render Lag on Large Data Sets
- **File / Component**: [StockManagement.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/inventory/StockManagement.tsx), [ProductManagement.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/catalog/ProductManagement.tsx), [AuditLogsView.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/admin/AuditLogsView.tsx)
- **Current Behavior**: Renders all dataset items into native HTML `<table>` elements without pagination or list virtualization.
- **Problem**: When product catalog or audit log size exceeds 200 items, DOM node creation causes noticeable UI lag, slow scrolling, and sluggish search input response.
- **Impact**: Degraded productivity for managers inspecting large product catalogs.
- **Recommended Solution**: Introduce standard pagination controls and server-side paginated queries (`limit=25&page=1`).
- **Priority**: P2
- **Dependencies**: `API-001`

#### Finding P2-3: Inconsistent Toast Notification & Alert Patterns
- **File / Component**: [PosTerminal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/pos/PosTerminal.tsx#L120-L140), [ProductManagement.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/catalog/ProductManagement.tsx)
- **Current Behavior**: Multiple components roll their own custom `toastMessage` state and floating `<div>` elements.
- **Problem**: Toasts overlap with bottom navigation bars on mobile; notification history is lost; toast durations vary wildly (1.5s to 5s).
- **Impact**: Cluttered UI alerts that sometimes obstruct primary CTA buttons.
- **Recommended Solution**: Build a single `ToastProvider` context delivering standardized toast stack alerts with auto-dismiss, action buttons, and accessible ARIA live regions (`role="status"`).
- **Priority**: P2
- **Dependencies**: None

#### Finding P2-4: Modal Accessibility & Focus Trap Deficiencies
- **File / Component**: All modal components ([StoreCheckoutModal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/storefront/StoreCheckoutModal.tsx), [ProductModal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/catalog/ProductModal.tsx), [PriceOverrideModal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/pos/PriceOverrideModal.tsx))
- **Current Behavior**: Modals render fixed `<div>` overlays without trapping keyboard focus or setting `aria-modal="true"`.
- **Problem**: Tabbing through a modal cycles focus behind the backdrop to hidden elements on the main page. Pressing `Escape` does not consistently close all open modals.
- **Impact**: Fails WCAG 2.2 AA modal accessibility guidelines; confuses screen-reader and keyboard users.
- **Recommended Solution**: Implement a standard `<Modal>` primitive with automatic focus trapping (`focus-trap-react` pattern or native `dialog` element), `Escape` key handlers, and correct ARIA labeling.
- **Priority**: P2
- **Dependencies**: None

#### Finding P2-5: Form Input Layout & Validation Feedback Divergence
- **File / Component**: [ProductModal.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/catalog/ProductModal.tsx), [CustomerManagement.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/crm/CustomerManagement.tsx), [PurchasingManagement.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/purchasing/PurchasingManagement.tsx)
- **Current Behavior**: Forms use varying error message placements (some inline below input, some native `alert()`, some red borders only).
- **Problem**: Inconsistent input validation feedback makes form submission errors hard to diagnose.
- **Impact**: Increased user error rate during product entry or purchase order creation.
- **Recommended Solution**: Standardize form field components with explicit `<label>`, helper text, and accessible error message slots (`aria-invalid`, `aria-describedby`).
- **Priority**: P2
- **Dependencies**: None

---

### P3 — Polish Findings

#### Finding P3-1: Visual Hierarchy & Dark Mode Color System Consistency
- **File / Component**: [index.css](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/index.css), all dark mode classes
- **Current Behavior**: Dark mode uses mixed background shades (`dark:bg-slate-900`, `dark:bg-slate-950`, `dark:bg-slate-800`, `dark:bg-slate-750`).
- **Problem**: Contrast between card containers and page backgrounds is inconsistent across modules.
- **Impact**: Minor visual polish flaw in dark mode theme.
- **Recommended Solution**: Standardize background surface levels (`surface-ground: slate-950`, `surface-card: slate-900`, `surface-hover: slate-800`).
- **Priority**: P3
- **Dependencies**: None

#### Finding P3-2: Micro-Interaction & Skeleton Loading Gaps
- **File / Component**: [ExecutiveDashboard.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/dashboard/ExecutiveDashboard.tsx), [Storefront.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/storefront/Storefront.tsx)
- **Current Behavior**: Page transitions display abrupt content jumps while waiting for data.
- **Problem**: Lack of animated skeleton loaders during initial data fetching.
- **Impact**: Perceived loading latency feels higher than actual network speed.
- **Recommended Solution**: Implement animated pulse skeleton placeholders for cards, tables, and product grids.
- **Priority**: P3
- **Dependencies**: None

#### Finding P3-3: Mobile Touch Target & Density Calibration
- **File / Component**: [AdminMobileBottomNav.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/layout/AdminMobileBottomNav.tsx), [MobileBottomNav.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/storefront/MobileBottomNav.tsx)
- **Current Behavior**: Some small action icons in table rows (e.g. edit/delete buttons) measure 28x28px.
- **Problem**: WCAG 2.2 AA requires touch targets to be at least 24x24px, with 44x44px recommended for primary mobile controls.
- **Impact**: Accidental taps on adjacent mobile controls.
- **Recommended Solution**: Add minimum 44x44px hit-target padding (`min-h-[44px] min-w-[44px]`) on mobile interactive elements.
- **Priority**: P3
- **Dependencies**: None

---

## 4. User Journey Audit

### Cashier User Journey
```text
[1. Login] ──► [2. Open Session] ──► [3. Barcode Scan / Keypad] ──► [4. Cart Edit]
                                                                        │
[8. Close Session] ◄── [7. Thermal Receipt] ◄── [6. Tender Payment] ◄───┘
```
- **Step 1 (Login)**: Uses header persona dropdown; no authentic cashier PIN prompt. (*Fix: Add POS PIN unlock screen*).
- **Step 2 (Open Session)**: Opening float modal exists, but records state locally in React context rather than server `/api/pos/sessions`. (*Fix: Bind to server session endpoint*).
- **Step 3 (Product Search / Barcode Scan)**: Fast search by name/SKU/barcode. Scanning works well, but lacks keyboard shortcut to focus search input instantly (`Ctrl+K` or `/`). (*Fix: Add global POS keyboard listeners*).
- **Step 4 (Cart Edit)**: Quantity increment/decrement, price override modal, line item deletion function as expected. Overrides lack supervisor PIN verification. (*Fix: Add supervisor override approval guard*).
- **Step 5 (Checkout / Tender)**: Supports Cash, Card, Mobile Money, Split Tender. Computes change due. However, execution calls client `processPosCheckout()` instead of server API. (*Fix: Connect to `/api/pos/checkout`*).
- **Step 6 (Receipt)**: Modal renders realistic receipt with thermal printer preview. Good usability.
- **Step 7 (Close Session)**: Shift modal calculates cash drawer discrepancy, but records result in browser memory. (*Fix: Bind to `/api/pos/sessions/:id/close`*).

### Inventory Operator User Journey
```text
[1. View Stock Matrix] ──► [2. Stock Adjustment] ──► [3. Initiate Transfer]
                                                               │
[6. Reconciliation] ◄────── [5. Receive Transfer] ◄────────────┘
```
- **Step 1 (Stock Matrix)**: Single stock number displayed per location. Does not distinguish `on_hand` vs `available` vs `reserved`. (*Fix: Expand column taxonomy*).
- **Step 2 (Adjustment)**: Modal captures reason (Damage, Expiry, Cycle Count). Mutates client `product.stock` directly. (*Fix: Route to `/api/inventory/adjustments`*).
- **Step 3 (Initiate Transfer)**: Selects source, destination, SKU, and quantity. Updates client arrays immediately without 2-step dispatch/receive workflow. (*Fix: Implement DISPATCH → RECEIVE workflow*).
- **Step 4 (Receive & Variance)**: Missing UI screen to receive dispatched transfers or record shipment variances. (*Fix: Build Transfer Receiving UI*).
- **Step 5 (Stock Count Reconciliation)**: Stocktaking tab allows entering counted physical quantities, but calculates variance in client JS. (*Fix: Bind to `/api/inventory/stock-counts`*).

### Administrator User Journey
```text
[1. Dashboard] ──► [2. Product Catalog] ──► [3. Locations & Users] ──► [4. Audit Logs]
```
- **Step 1 (Dashboard)**: Displays GMV, orders, inventory valuation charts via `recharts`. Visual hierarchy is clean.
- **Step 2 (Catalog)**: Product management table supports search, filtering, and CRUD. Modals are oversized and unpaginated. (*Fix: Add pagination & decompose modals*).
- **Step 3 (Locations & Users)**: Basic management available; role assignment takes effect in client state without server RBAC confirmation. (*Fix: Connect to `/api/users` and `/api/roles`*).
- **Step 4 (Audit Logs)**: Audit log table renders local client event array. (*Fix: Connect to server `/api/admin/audit-logs`*).

### E-Commerce Customer User Journey
```text
[1. Browse Catalog] ──► [2. Product Detail Modal] ──► [3. Cart Drawer] ──► [4. Checkout] ──► [5. Order Status]
```
- **Step 1 (Browse)**: Category showcase, brand filters, product cards, promotional banners are visually attractive and responsive.
- **Step 2 (Product Modal)**: Displays images, variants, stock indicators, reviews. Smooth animations.
- **Step 3 (Cart Drawer)**: Slide-over drawer with item listing, promo code field, checkout button.
- **Step 4 (Checkout)**: Address selection, fulfillment choice, payment options. Submits order to client `localStorage`. (*Fix: Route to server `/api/orders`*).
- **Step 5 (Order Tracking)**: Order notification hub allows searching by order number. Works well.

---

## 5. Component & Design System Audit

| Component Type | Current Implementation | Issues Identified | Proposed Solution |
| :--- | :--- | :--- | :--- |
| **Buttons** | Ad-hoc `<button>` elements with inline Tailwind classes across 50+ files | Inconsistent padding, font weight, focus rings, hover states, and disabled opacity | Create `src/components/ui/Button.tsx` primitive supporting variants (`primary`, `secondary`, `outline`, `danger`, `ghost`) and sizes (`sm`, `md`, `lg`) |
| **Inputs** | Raw `<input>` tags duplicated in form modals | Inconsistent border color, dark mode background, focus ring, missing label bindings | Create `src/components/ui/Input.tsx` with built-in label, helper text, error text, and ARIA attributes |
| **Selects** | Raw `<select>` dropdowns | Custom chevron SVG positioning repeated manually | Create `src/components/ui/Select.tsx` with standard styling and keyboard accessibility |
| **Modals / Dialogs** | Custom `fixed inset-0` fixed overlays | Missing focus traps, `aria-modal`, `Escape` key handling, backdrop click consistency | Create `src/components/ui/Modal.tsx` with focus trapping, `aria-labelledby`, and `Escape` listener |
| **Tables** | Native `<table>` elements with custom `th`/`td` classes | Unpaginated, heavy DOM node count, missing standard loading/empty states | Create `src/components/ui/Table.tsx` wrapper with built-in pagination, empty state, and skeleton loading |
| **Badges / Tags** | Custom `<span>` elements with inline colors | Color palette inconsistency across status tags (`Active`, `Pending`, `Low Stock`) | Create `src/components/ui/Badge.tsx` with semantic intent variants (`success`, `warning`, `danger`, `info`, `neutral`) |
| **Toast Alerts** | Fragmented custom state inside individual components | Toasts overlap mobile nav, lack global queue and auto-dismiss timing | Create `src/components/ui/Toast.tsx` + `ToastProvider` context for application-wide notifications |
| **Cards** | Custom `<div>` wrappers with varying rounded radii | Mixing `rounded-xl`, `rounded-2xl`, `rounded-3xl` arbitrarily | Create `src/components/ui/Card.tsx` container primitive |
| **Loading Indicators**| Isolated Lucide `Loader2` spinners | Varying spin speeds and sizes | Create `src/components/ui/Spinner.tsx` and `Skeleton.tsx` loading primitives |

---

## 6. Responsive UI Audit

- **Desktop (1440px+)**: Layout renders cleanly with persistent sidebar navigation and wide table viewports. POS cart and product grid fit side-by-side without crowding.
- **Laptop (1024px - 1439px)**: Sidebar collapse button allows maximizing main content area. POS grid auto-adjusts from 4 columns to 3 columns.
- **Tablet (768px - 1023px)**: Mobile drawer toggle replaces desktop sidebar. Table views experience horizontal overflow requiring horizontal scroll wrappers. POS terminal shifts from 2-column layout to single stacked column (Product list top, Cart bottom). Touch targets on tablet POS keypads are comfortably sized (48x48px).
- **Mobile (375px - 767px)**: [AdminMobileBottomNav.tsx](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/src/components/layout/AdminMobileBottomNav.tsx) provides sticky bottom navigation bar. Modals take full screen (`w-full h-full sm:h-auto`). Some small action icons in table rows measure 28x28px and require min-height expansion to 44px for finger tap accuracy.

---

## 7. Accessibility Audit (WCAG 2.2 AA Target)

| Accessibility Domain | Status | Key Gaps Identified | Remediation Required |
| :--- | :--- | :--- | :--- |
| **Semantic HTML** | Partial | Heavy use of `<div onClick=...>` instead of proper `<button>` elements in custom dropdowns and tab triggers. | Convert interactive `div` elements to native `<button>` or add `role="button"` + `tabIndex={0}` + `onKeyDown`. |
| **Keyboard Navigation** | Fail | Focus order drops when modals open; focus is not trapped inside modals; pressing `Tab` cycles behind backdrop. | Implement focus trapping in all modals; ensure visible focus outline (`focus-visible:ring-2`). |
| **Focus Visibility** | Pass/Partial | Most interactive elements rely on Tailwind `focus:outline-none`. Some lack explicit `focus-visible` rings. | Standardize `focus-visible:ring-2 focus-visible:ring-sky-500` across all interactive primitives. |
| **Form Labels & Error ARIA**| Fail | Input fields in modals use floating text without `<label htmlFor="...">` bindings. Errors lack `aria-describedby`. | Bind all labels explicitly to input `id` attributes; attach `aria-invalid` and `aria-describedby` on invalid fields. |
| **Color Contrast** | Pass | Tested body text (`#0f172a` on `#f8fafc` = 15.8:1 contrast ratio) and muted text (`#64748B` on `#ffffff` = 4.6:1 ratio). Meets WCAG AA min (4.5:1). | Maintain current palette contrast ratios during theme updates. |
| **ARIA & Screen Readers** | Fail | Modals lack `role="dialog"` and `aria-modal="true"`. Toast notifications lack `role="status"` or `aria-live="polite"`. | Add appropriate ARIA attributes across all modal dialogs, drawers, and notification toasts. |
| **Touch Targets** | Partial | Table action buttons measure 28x28px on mobile devices. | Enforce minimum 44x44px hit-target bounds for all mobile controls. |

---

## 8. Security & Authority UX Audit

### Invalidation of Client-Side Business Authority
To comply with [ADR-004](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/.ai/DECISIONS.md#L58), [ADR-005](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/.ai/DECISIONS.md#L67), and [SECURITY_POLICY.md](file:///c:/Users/sbses/Documents/GitHub/POS-E-Commerce/.ai/SECURITY_POLICY.md#L17):
1. **Client State is Non-Authoritative**: The UI layer must act purely as a presentation cache and input capture tool.
2. **Server Recomputation**: Money totals, taxes, promotion discounts, currency exchange conversions, stock decrements, and user permission validations MUST be computed and enforced by the server API.
3. **No Direct `localStorage` Writing for Core Business Records**: Direct updates to `localStorage` for orders, shifts, stock movements, and financial accounts must be deprecated in favor of server API calls with local IndexedDB optimistic caching.

```text
BEFORE (Client-Authoritative UI):
[ User Clicks Pay ] ──► UI Computes Cart Subtotal & Taxes ──► UI Mutates product.stock ──► Saved to localStorage

AFTER (Server-Authoritative UI):
[ User Clicks Pay ] ──► POST /api/pos/checkout ──► Server Validates Catalog & Stock ──► Transaction Commit ──► Render Server Receipt
```

---

## 9. POS UX Review

- **Barcode & QR Product Search**: Quick input lookup with scanner modal integration. Excellent speed. Needs keyboard shortcut (`Ctrl+K`) to jump focus to search field from anywhere in POS view.
- **Keyboard Operation**: Cashiers rely on high-speed keypad entry. Needs full Numpad navigation (`Enter` to add, `+` / `-` to adjust quantity, `Esc` to clear).
- **Cart Editing**: Quick quantity adjustments, line deletions, price override modal. Needs supervisor PIN gate on price overrides.
- **Stock Display**: Displays store-specific stock count. Needs live indication if stock is low or reserved.
- **Payment & Tender Entry**: Supports Cash presets ($5, $10, $20, $50, $100, Exact), Card, Mobile Money, Split Tender. Calculates exact change due. Excellent tender UX. Needs server API checkout binding.
- **Offline & Network Resilience**: Currently missing. Must implement offline IndexedDB transaction queue and header status badge (`Online`, `Offline (X Pending Sync)`, `Syncing`).
- **Shift & Register Control**: Shift open/close modals exist, but must sync with server `/api/pos/sessions`.

---

## 10. Inventory UX Review

- **Stock Dashboard & Matrix**: Displays multi-branch stock levels. Must expand column headers to match server domain terms (`On Hand`, `Available`, `Reserved`, `In Transit`, `Damaged/Expired`).
- **Stock Movement History**: Displays audit table of stock changes. Must fetch records from server `/api/inventory/movements` instead of local memory.
- **Inter-Branch Stock Transfers**: Currently updates stock immediately in client state. Must implement the server-authoritative 2-step workflow:
  - **Step 1 (Dispatch)**: User creates transfer → Status `DISPATCHED` → Source `on_hand` decreases, destination `in_transit` increases.
  - **Step 2 (Receive & Variance)**: User inspects arrival → Enters received qty → Status `COMPLETED` → Destination `in_transit` decreases, destination `on_hand` increases, discrepancies logged as `VARIANCE_RECORDED`.
- **Stock Count Reconciliation**: Stocktaking tab allows entering physical count numbers. Must submit count payloads to server `/api/inventory/stock-counts` for transactional ledger posting.

---

## 11. Governance & Compliance Affirmation

- **Phase Authorization**: This audit represents **UX-001 Phase 1 only**.
- **Code Rewrite Scope**: ZERO broad UI code rewrites were performed during this audit phase.
- **Backend Integrity**: ZERO backend business logic, schemas, or authorization rules were modified.
- **Final Verdict**: **UX-001 Phase 1 — READY FOR SUPERVISOR REVIEW**
