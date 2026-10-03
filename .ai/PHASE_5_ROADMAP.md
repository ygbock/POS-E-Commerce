# Phase 5 Engineering Roadmap & Strategic Backlog

> **Document Version**: 1.0.0  
> **Status**: Active Authoritative Phase 5 Roadmap  
> **Repository**: `ygbock/POS-E-Commerce`  
> **Branch**: `upgrade/v2.6/upg-001-platform-hardening`  
> **Approved Application Baseline**: `9ae4b7528aecd195a9167e1b2a060513cbf83223`  
> **Release Candidate Anchor**: `2.5.0-Stable` (`REL-012` Handover Gate)  
> **Target Version**: `2.6.0-Enterprise`  

---

## 1. Architectural Mission & Phase 5 Phasing Overview

The primary mission of Phase 5 is product completion, omnichannel transactional consistency, and production readiness for the multi-tenant SaaS platform and commerce engine. 

The architecture strictly segregates the SaaS Control Plane, Tenant Business Plane, and Public Storefront Plane:

```text
PLATFORM / CONTROL PLANE (Phase 5.3, 5.6, 5.8)
    ├── System Owner       (Full Platform Governance: view, tenants, support, billing)
    ├── Platform Admin     (Tenant Operations: view, tenants, support)
    ├── Platform Support   (Tenant Support: view, support)
    └── Platform Finance   (SaaS Billing & Invoicing: view, billing)

TENANT / BUSINESS PLANE (Phase 5.4, 5.7, 5.8)
    ├── Business Owner / Super Admin (Tenant Organization Governance)
    ├── Store Manager                (Location Shifts & Day-to-Day Operations)
    ├── Cashier                      (POS Terminal Checkout)
    ├── Inventory Manager            (Ledger, Stock Movements & Transfers)
    └── Purchasing Manager           (Procurement & Suppliers)

CUSTOMER / STOREFRONT PLANE (Phase 5.5)
    └── E-Commerce Customer          (Public Storefront Browsing, Cart, Checkout, Order Tracking)
```

---

## 2. Phase 5 Roadmap Structure

| Phase | Title | Focus Area | Status |
| :--- | :--- | :--- | :---: |
| **Phase 5.1** | Current-State Reconciliation | Baseline audit, matrix reconciliation, task synchronization | `IN PROGRESS` |
| **Phase 5.2** | Design System & UI/UX Foundation | Design tokens, shared components, accessible forms & tables | `IMPLEMENTED — PENDING VERIFICATION` |
| **Phase 5.3** | Platform Control-Plane Completion | Tenant onboarding wizard, plan mutations, operator tools | `IMPLEMENTED — PENDING VERIFICATION` |
| **Phase 5.4** | Tenant Business-Plane Completion | User administration table, location CRUD, customer mutations | `IMPLEMENTED — PENDING VERIFICATION` |
| **Phase 5.5** | Customer Storefront Modernization | Modular checkout, deep URL routing, server-authoritative cart | `IMPLEMENTED — VERIFIED LOCALLY` |
| **Phase 5.6** | SaaS Subscriptions & Billing Engine | Subscription tiers, invoices, MRR/ARR, payment status | `CORE IMPLEMENTED — PENDING LOCAL VERIFICATION` |
| **Phase 5.7** | Reports & Analytics Engine | Server-aggregated sales, margin, inventory valuation reports | `CORE IMPLEMENTED — PENDING LOCAL VERIFICATION` |
| **Phase 5.8** | Notifications & Support Ticket Hub | Support tickets, durable in-app notifications, delivery ledger, activity log | `IMPLEMENTED — PENDING VERIFICATION` |
| **Phase 5.9** | Production Operations Hardening | Disaster recovery scripts, backup verification, monitoring | `PLANNED` |
| **Phase 5.10** | Final Security, QA & Release Gate | Penetration test, WCAG 2.2 AA audit, production handover | `PLANNED` |

---

## 3. Detailed Phase Specifications

### Phase 5.1 — Current-State Reconciliation
- **Task ID**: `TASK-5.1.1`
- **Objective**: Conduct full 34-module audit against GitHub `main` and current branch `upgrade/v2.6/upg-001-platform-hardening`. Reconcile release candidate records, governance documents, and live test suite passes.
- **Files / Components**: `.ai/PHASE_5_CURRENT_STATE_AUDIT.md`, `.ai/TASK_QUEUE.md`, `.ai/REVIEW_QUEUE.md`, `.ai/IMPLEMENTATION_REPORT.md`.
- **Backend / API Impact**: None (audit and documentation only).
- **Database Impact**: None.
- **UI Impact**: None.
- **RBAC**: Review of platform and tenant RBAC matrix integrity.
- **Security Requirements**: Zero modifications to security contracts during audit.
- **Tests**: `npm run lint`, `npm test`, `npm run test:security`, `npm run test:platform`, `npm run test:pos`, `npm run test:prod-gate`.
- **Dependencies**: None.
- **Acceptance Criteria**:
  - [x] Complete 34-module status matrix published.
  - [x] Full test execution verified with actual output.
  - [x] Dashboards and UI components mapped to target roles.
  - [x] Security posture and fail-closed policies verified.
- **Completion Status**: `COMPLETE`.

---

### Phase 5.2 — Design System and UI/UX Foundation
- **Task ID**: `TASK-5.2.1`
- **Objective**: Standardize design system primitives across all three planes (Back Office, POS, Storefront). Harden accessible components (`Button`, `Input`, `Select`, `Table`, `Modal`, `Toast`, `Badge`, `Card`, `Skeleton`).
- **Files / Components**: `src/index.css`, `src/components/ui/`, `src/components/layout/Sidebar.tsx`, `src/components/layout/Header.tsx`.
- **Backend / API Impact**: None.
- **Database Impact**: None.
- **UI Impact**: Semantic color variables, focus rings, high-contrast dark/light mode, tabular figures for currency, mobile bottom nav.
- **RBAC**: Presentation-only state reflection; no client authorization bypass.
- **Security Requirements**: Sanitize any dynamic HTML or SVG; respect reduced motion (`prefers-reduced-motion`).
- **Tests**: `npm run test:ux`, `npm run build`.
- **Dependencies**: `TASK-5.1.1`.
- **Acceptance Criteria**:
  - [ ] Shared primitives used consistently in `src/components/ui/`.
  - [ ] Standard page anatomy (title, primary actions, toolbar, data table, empty state) implemented.
  - [ ] WCAG 2.2 AA compliant focus states and color contrast verified.
- **Completion Status**: `IMPLEMENTED — PENDING LOCAL/CI VERIFICATION`.

---

### Phase 5.3 — Platform Control-Plane Completion
- **Task ID**: `TASK-5.3.1`
- **Objective**: Complete tenant lifecycle management for SaaS operators (`system_owner` and `platform_admin`). Add tenant creation wizard, plan switching, and suspension endpoints.
- **Files / Components**: `server/routes/platformRoutes.ts`, `server/routes/platformRoutes.test.ts`, `src/components/platform/SystemOwnerDashboard.tsx`, `src/components/platform/TenantManagementModal.tsx`.
- **Backend / API Impact**: `POST /api/platform/tenants` (create tenant with initial admin), `PATCH /api/platform/tenants/:id` (suspend/activate, update tier).
- **Database Impact**: Schema check constraints on `organizations.is_active` and `organizations.slug`.
- **UI Impact**: Interactive Tenant Portfolio actions (Create Tenant, Suspend, Edit Configuration) in `SystemOwnerDashboard.tsx`.
- **RBAC**: Restricted to `platform.tenants` permission (`system_owner`, `platform_admin`).
- **Security Requirements**: Server-side slug validation (kebab-case, alphanumeric, reserved word blacklist: `api`, `admin`, `app`, `platform`), audit logging for tenant mutations.
- **Tests**: `tests/platform_authorization.test.ts`, `server/routes/platformRoutes.test.ts`.
- **Dependencies**: `TASK-5.2.1`.
- **Acceptance Criteria**:
  - [ ] `POST /api/platform/tenants` validates payload and creates organization transactionally.
  - [ ] Inactive tenants fail closed with HTTP 404 in storefront and HTTP 403 in tenant workspace.
  - [ ] UI provides loading, error, and confirmation states for tenant mutations.
- **Completion Status**: `IMPLEMENTED — PENDING LOCAL/CI VERIFICATION`.

---

### Phase 5.4 — Tenant Business-Plane Completion
- **Task ID**: `TASK-5.4.1`
- **Objective**: Implement dedicated Tenant User Management view, Location CRUD, and Customer creation/editing to replace context placeholders.
- **Files / Components**: `server.ts`, `server/repositories/userRepository.ts`, `server/repositories/customerRepository.ts`, `src/components/admin/UserManagementView.tsx`, `src/components/admin/LocationManagementView.tsx`, `src/components/crm/CustomerManagement.tsx`.
- **Backend / API Impact**: `POST /api/locations`, `PUT /api/locations/:id`, `POST /api/customers`, `PUT /api/customers/:id`.
- **Database Impact**: Add location update query, check constraints.
- **UI Impact**: Dedicated tabs in `App.tsx` for Users (`activeTab === 'users'`), Locations (`activeTab === 'locations'`), and integrated Customer modal.
- **RBAC**: `users.create`, `users.view`, `locations.manage`, `customers.create`.
- **Security Requirements**: Strict tenant isolation (`WHERE organization_id = req.auth.organizationId`), privilege escalation prevention (cannot assign role higher than caller's role).
- **Tests**: `tests/api_hardening.test.ts`, `tests/auth_security.test.ts`.
- **Dependencies**: `TASK-5.2.1`.
- **Acceptance Criteria**:
  - [x] Real user list and user creation form operational with validation.
  - [x] Location management allows adding store branches and warehouses.
  - [x] Customer creation persists directly to PostgreSQL database.
- **Completion Status**: `IMPLEMENTED — PENDING LOCAL/CI VERIFICATION`.

---

### Phase 5.5 — Customer Storefront Modernization
- **Task ID**: `TASK-5.5.1`
- **Objective**: Complete UX-001A Phase 2 & 3 modular storefront migration: connect `StorefrontRouter.ts` to HTML5 history, migrate checkout modal to modular server-authoritative components, and eliminate catalog memory coupling.
- **Files / Components**: `src/components/storefront/`, `src/router/StorefrontRouter.ts`, `src/context/StorefrontContext.tsx`, `server/routes/storefrontRoutes.ts`.
- **Backend / API Impact**: Storefront order lookup by customer, cart validation caching.
- **Database Impact**: None.
- **UI Impact**: Fully navigable deep-links (`/shop`, `/shop/category/:slug`, `/product/:slug`, `/cart`, `/checkout`, `/order/:orderNumber`), responsive mobile bottom navigation.
- **RBAC**: Public unauthenticated access permitted; authenticated storefront customer session optional for order tracking.
- **Security Requirements**: Strict host/slug tenant resolution, zero cross-tenant catalog leakage, client prices completely ignored at checkout.
- **Tests**: `tests/storefront_multi_tenant.test.ts`, `tests/storefront_router.test.ts`, `tests/storefront_api_client.test.ts`, `tests/storefront_catalog.test.ts`.
- **Dependencies**: `TASK-5.2.1`.
- **Acceptance Criteria**:
  - [ ] Deep URLs resolve directly without page reload or broken modal state.
  - [ ] Checkout executes atomically via `orderService.placeStorefrontOrder`.
  - [ ] Storefront state is fully decoupled from back-office `CommerceContext`.
- **Completion Status**: `IMPLEMENTED — PENDING LOCAL VERIFICATION`.

- **Gap audit findings addressed**: removed active storefront `CommerceContext` dependencies from catalog state, header, cart, checkout, and notification surfaces; moved storefront theme state into `StorefrontContext`; made checkout commercial totals server-validation authoritative; retained tenant-scoped cart session tokens and HTML5 History API routing.

---

### Phase 5.6 — SaaS Subscriptions and Billing Engine
- **Task ID**: `TASK-5.6.1`
- **Objective**: Complete server-side subscription management, tenant billing tiers, invoice tracking, and payment-provider settlement boundaries.
- **Implemented Foundation**: `014_subscription_billing_foundation.sql` provides canonical plans, tenant subscriptions, provider-event idempotency, and usage metering. Existing subscription services provide plan changes, trial/lifecycle controls, feature/limit enforcement, and database-authoritative MRR.
- **New Billing Layer**: `015_billing_invoices.sql`, `server/services/billingService.ts`, and `server/routes/billingRoutes.ts` provide immutable pricing snapshots in invoices, invoice status history, signed webhook verification, replay protection, and paid/past-due settlement transitions.
- **Backend / API Impact**: `GET /api/platform/billing/invoices`, `GET /api/platform/billing/invoices/:invoiceId`, `POST /api/platform/billing/invoices/:organizationId`, and `POST /api/webhooks/billing`.
- **RBAC**: `platform.billing` protects platform billing APIs; webhook settlement is authenticated exclusively by cryptographic signature.
- **Security Requirements**: HMAC SHA-256 webhook verification, durable provider-event uniqueness, server-authoritative invoice totals, and no client-side payment confirmation authority.
- **Tests**: `tests/billing.test.ts` covers signatures, invoice creation, settlement, and webhook replay.
- **Dependencies**: `TASK-5.3.1`.
- **Acceptance Criteria**:
  - [x] Database schema models subscriptions, invoices, invoice status history, and payment-provider events.
  - [x] MRR and ARR are calculated from active paid subscriptions; a 30-day cancellation-rate metric is exposed from recorded platform cancellation events.
  - [ ] Automated downgrade/suspension policy for delinquent tenants.
- **Remaining Work**: Connect the signed webhook contract to the chosen payment provider, add scheduled delinquency reconciliation, and expose dedicated invoice/subscription controls in tenant settings. No provider credentials or payment secrets are committed.
- **Completion Status**: `CORE IMPLEMENTED — PENDING LOCAL VERIFICATION`.

---

### Phase 5.7 — Reports & Analytics Engine
- **Task ID**: `TASK-5.7.1`
- **Objective**: Implement server-side aggregation endpoints for sales reports, gross profit margin, inventory turnover, and cash reconciliation summaries.
- **Files / Components**: `server/routes/reportRoutes.ts`, `server/services/reportingService.ts`, `src/components/dashboard/ExecutiveDashboard.tsx`, `src/components/dashboard/AdvancedAnalyticsView.tsx`.
- **Backend / API Impact**: `GET /api/reports/sales-summary`, `GET /api/reports/inventory-valuation`, `GET /api/reports/shift-reconciliation`.
- **Database Impact**: Optimized aggregation indexes on `orders(organization_id, created_at)` and `inventory_balances(organization_id)`.
- **UI Impact**: Replaces client-side array reductions with server-paginated, server-aggregated report data with date-range filters.
- **RBAC**: `reports.view` permission.
- **Security Requirements**: Tenant-scoped SQL queries; cannot aggregate data across organizations.
- **Tests**: `tests/reports.test.ts`.
- **Dependencies**: `TASK-5.4.1`.
- **Implemented Foundation**: `025_reporting_indexes.sql`, `server/services/reportingService.ts`, and `server/routes/reportRoutes.ts` provide tenant-scoped sales aggregation, inventory valuation, and POS shift reconciliation. The endpoints are protected by `reports.view` and require authenticated tenant context.
- **Completion Status**: `CORE IMPLEMENTED — PENDING LOCAL VERIFICATION`.
- **Acceptance Criteria**:
  - [ ] Reports load accurately for large datasets without client memory exhaustion.
  - [ ] Decimal arithmetic matches double-entry financial ledger standards.
  - [ ] Export to CSV / JSON supported securely.
- **Completion Status**: `PLANNED`.

---

### Phase 5.8 — Notifications & Support Ticket Hub
- **Task ID**: `TASK-5.8.1`
- **Objective**: Create the tenant-to-platform support ticket hub and durable notification dispatch foundation, with authenticated in-app delivery for support and other platform events.
- **Files / Components**: `server/db/migrations/052_support_notifications.sql`, `server/services/supportService.ts`, `server/routes/supportRoutes.ts`, `src/services/supportApi.ts`, `src/components/platform/SupportWorkspace.tsx`, `src/components/layout/Header.tsx`.
- **Backend / API Impact**: Tenant ticket list/create/detail/reply, platform ticket list/detail/status/reply, and authenticated notification list/read/read-all endpoints under `/api/support`.
- **Database Impact**: Migration `052_support_notifications.sql` creating `support_tickets`, `support_ticket_messages`, `notifications`, and `notification_deliveries` with tenant/status indexes.
- **UI Impact**: API foundation is complete; platform support workspace and tenant Help & Support UI consume the new endpoints in the next UI increment.
- **RBAC**: `platform.support` for platform operators; `support.view`, `support.create`, and `support.reply` for tenant administrators.
- **Security Requirements**: Authenticated tenant scoping, platform-support isolation, bounded payloads, parameterized SQL, and append-only support audit records. File uploads remain disabled until a dedicated secure attachment pipeline is implemented.
- **Tests**: `tests/support_tickets.test.ts`, operational migration integrity gate.
- **Implemented**: Durable ticket lifecycle, tenant/platform ticket APIs, ticket messages, in-app notification inbox, delivery ledger, read/unread operations, support audit events, and notification fan-out on ticket creation/status/message events.
- **Dependencies**: `TASK-5.3.1`.
- **Acceptance Criteria**:
  - [ ] Tenants can submit support requests to the platform control plane.
  - [ ] Platform Support operators can review and resolve tickets.
  - [ ] In-app notification center surfaces unread event alerts.
- **Completion Status**: `IMPLEMENTED — PENDING LOCAL/CI VERIFICATION`.

---

### Phase 5.9 — Production Operations Hardening
- **Task ID**: `TASK-5.9.1`
- **Objective**: Harden deployment automation, database backup/restore verification scripts, connection pooling, and health monitoring runbooks.
- **Files / Components**: `scripts/verify_backup_restore.ts`, `scripts/operator_bootstrap.ts`, `.ai/OPERATIONS_RUNBOOK.md`, `.ai/DISASTER_RECOVERY.md`.
- **Backend / API Impact**: Health and readiness probe enhancements.
- **Database Impact**: Verify WAL archiving, automated pg_dump/pg_restore pipeline.
- **UI Impact**: None.
- **RBAC**: N/A (CLI / Infrastructure).
- **Security Requirements**: Strict secret handling, zero credentials committed to Git.
- **Tests**: `npm run test:prod-gate`, `npm run test:operational`, backup restore verification script.
- **Dependencies**: All prior phases.
- **Acceptance Criteria**:
  - [ ] Automated backup verification script runs and confirms schema and data restoration.
  - [ ] Health and readiness probes fail closed if PostgreSQL disconnects.
  - [ ] CI/CD pipeline enforces all 4 production gates.
- **Completion Status**: `PLANNED`.

---

### Phase 5.10 — Final Security, QA & Release Gate
- **Task ID**: `TASK-5.10.1`
- **Objective**: Execute end-to-end multi-tenant security verification, OWASP Top 10 checklist, WCAG 2.2 AA accessibility audit, full regression suite, and publish final release candidate report for Version 2.6.0.
- **Files / Components**: `.ai/REL-013_FINAL_RELEASE_GATE.md`, `.ai/REVIEW_QUEUE.md`, `.ai/TASK_QUEUE.md`.
- **Backend / API Impact**: None.
- **Database Impact**: None.
- **UI Impact**: Full visual polish across all viewports.
- **RBAC**: Complete verification of all roles and permission bounds.
- **Security Requirements**: Zero P0/P1 security issues; zero high-severity vulnerabilities.
- **Tests**: `npm test` (all 17+ test suites), `npm run lint`, `npm run build`.
- **Dependencies**: Tasks 5.1 through 5.9.
- **Acceptance Criteria**:
  - [ ] 100% test pass rate across all suites.
  - [ ] Production build succeeds with 0 errors.
  - [ ] Handover documentation and customer deployment blueprint approved by Supervisor.
- **Completion Status**: `PLANNED`.
