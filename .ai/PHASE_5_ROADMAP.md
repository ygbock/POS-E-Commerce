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
| **Phase 5.3** | Platform Control-Plane Completion | Tenant onboarding wizard, plan mutations, operator tools | `PLANNED` |
| **Phase 5.4** | Tenant Business-Plane Completion | User administration table, location CRUD, customer mutations | `PLANNED` |
| **Phase 5.5** | Customer Storefront Modernization | Modular checkout, deep URL routing, server-authoritative cart | `PLANNED` |
| **Phase 5.6** | SaaS Subscriptions & Billing Engine | Subscription tiers, invoices, MRR calculation, payment status | `PLANNED` |
| **Phase 5.7** | Reports & Analytics Engine | Server-aggregated sales, margin, inventory valuation reports | `PLANNED` |
| **Phase 5.8** | Notifications & Support Ticket Hub | Support tickets, webhook/email notifications, activity log | `PLANNED` |
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
- **Completion Status**: `PLANNED`.

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
  - [ ] Real user list and user creation form operational with validation.
  - [ ] Location management allows adding store branches and warehouses.
  - [ ] Customer creation persists directly to PostgreSQL database.
- **Completion Status**: `PLANNED`.

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
- **Completion Status**: `PLANNED`.

---

### Phase 5.6 — SaaS Subscriptions and Billing Engine
- **Task ID**: `TASK-5.6.1`
- **Objective**: Build server-side subscription management, tenant billing tiers (Starter, Professional, Enterprise), invoice tracking, and webhook endpoints for payment gateway integration.
- **Files / Components**: `server/db/migrations/012_saas_billing.sql`, `server/routes/billingRoutes.ts`, `src/components/platform/SystemOwnerDashboard.tsx`.
- **Backend / API Impact**: `GET /api/platform/billing/invoices`, `POST /api/platform/billing/subscribe`, `POST /api/webhooks/billing`.
- **Database Impact**: Migration 012 creating `subscriptions`, `invoices`, and `tenant_plans` tables.
- **UI Impact**: Dedicated Subscriptions and Invoicing panels in `SystemOwnerDashboard.tsx` and Tenant Settings.
- **RBAC**: `platform.billing` permission.
- **Security Requirements**: Cryptographic webhook signature verification, fail-closed subscription expiry.
- **Tests**: `tests/billing.test.ts`.
- **Dependencies**: `TASK-5.3.1`.
- **Acceptance Criteria**:
  - [ ] Database schema models subscriptions, invoices, and payment statuses.
  - [ ] Accurate calculation of MRR, ARR, and churn rates based on real database records.
  - [ ] Automated downgrade/suspension policy for delinquent tenants.
- **Completion Status**: `PLANNED`.

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
- **Acceptance Criteria**:
  - [ ] Reports load accurately for large datasets without client memory exhaustion.
  - [ ] Decimal arithmetic matches double-entry financial ledger standards.
  - [ ] Export to CSV / JSON supported securely.
- **Completion Status**: `PLANNED`.

---

### Phase 5.8 — Notifications & Support Ticket Hub
- **Task ID**: `TASK-5.8.1`
- **Objective**: Create tenant-to-platform support ticket hub and notification dispatch worker for critical events (out-of-stock alerts, transfer arrivals, order placement).
- **Files / Components**: `server/db/migrations/013_support_and_notifications.sql`, `server/routes/supportRoutes.ts`, `src/components/platform/SystemOwnerDashboard.tsx`, `src/components/storefront/OrderNotificationHubModal.tsx`.
- **Backend / API Impact**: `GET /api/support/tickets`, `POST /api/support/tickets`, `POST /api/support/tickets/:id/messages`.
- **Database Impact**: Migration 013 creating `support_tickets`, `ticket_messages`, `notifications`.
- **UI Impact**: Platform Support workspace view and tenant-side Help & Support widget.
- **RBAC**: `platform.support` for platform operators; `support.create` for tenant admins.
- **Security Requirements**: Input sanitization, file upload security guards (if attachments enabled).
- **Tests**: `tests/support_tickets.test.ts`.
- **Dependencies**: `TASK-5.3.1`.
- **Acceptance Criteria**:
  - [ ] Tenants can submit support requests to the platform control plane.
  - [ ] Platform Support operators can review and resolve tickets.
  - [ ] In-app notification center surfaces unread event alerts.
- **Completion Status**: `PLANNED`.

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
