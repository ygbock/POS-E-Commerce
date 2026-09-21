# AbaCha Master Completion Roadmap & Gap Analysis

> Status: ACTIVE — authoritative completion roadmap
> Repository: ygbock/POS-E-Commerce
> Execution branch: main
> Checkpoint: 2026-09-20
> Current implementation checkpoint: TASK-DISC-8.1 service-request lifecycle is implemented on `main`; CI validation is pending for this increment.

> Latest implementation checkpoint: platform Discovery search governance APIs and permission are now implemented on `main`; local/full regression verification is still pending for this increment.
> Purpose: Establish the current product baseline, separate implemented foundations from remaining product work, and define the ordered path to pilot and production launch.

## 1. Executive assessment

AbaCha is no longer a prototype. The current codebase has a substantial server-authoritative commerce foundation covering authentication, RBAC, multi-tenancy, subscriptions/limits, inventory, transfers, POS, checkout/idempotency, storefront APIs, offline POS foundations, Discovery, Discovery Search, moderation, reviews, analytics, and security hardening.

The latest complete npm run test execution completed with zero failures, including Discovery Search and fuzzy-ranking/analytics suites.

The remaining work is primarily product completion and productionization, not rebuilding the core architecture.

### Completion view

| Dimension | Current assessment | Meaning |
|---|---:|---|
| Core platform foundation | 85–90% | Architecture and server-authoritative foundations are substantially complete |
| Security / tenant isolation | 85–90% | Strong automated coverage; further final audit remains |
| Inventory / stock integrity | 85–90% | Core engine and concurrency safeguards are mature |
| POS / checkout | 80–90% | Core transactional path is implemented; real payment/hardware integrations remain |
| Storefront | 75–85% | API/router/catalog/checkout foundations are implemented; UX and real-world completion remain |
| Discovery | 75–85% | Business lifecycle, marketplace data, search, moderation and analytics foundations exist |
| Merchant operating experience | 55–65% | Important workflows and UI surfaces still need completion and integration |
| Payments / settlement | 55–65% | Ledger/lifecycle foundations exist; live providers, webhooks, reconciliation and payouts remain |
| Reporting / analytics | 40–55% | Operational analytics exist in places, but the full reporting engine remains |
| Notifications / support | 40–55% | Event/notification foundations exist, but complete dispatch and support hub remain |
| External integrations | 30–50% | Integration boundaries exist; production providers/hardware/logistics remain |
| Production operations | 65–75% | Production gates and hardening exist; backup/restore, monitoring and live infrastructure verification remain |
| Full commercial product | 55–65% | Core platform is ahead of the customer-facing/commercial surface |

These percentages are engineering planning estimates, not a mathematical completion metric.

## 2. What is already established

### A. Platform and security
- Authentication and protected API boundaries.
- Server-authoritative RBAC and permissions.
- Organization/tenant isolation.
- Tenant lifecycle/provisioning foundations.
- Subscription foundation, limits and platform subscription management.
- Audit/security administration.
- Fail-closed production guards.
- Migration checksum enforcement.
- Security regression tests.

### B. Inventory
- Stock balances and stock states.
- Inventory movements.
- Reservations.
- Multi-location inventory.
- Transfers and transfer lifecycle.
- Database constraints/indexes for integrity.
- Row locking for concurrent stock mutation.
- Idempotent mutation safeguards.

### C. POS and checkout
- POS sessions and cashier workflows.
- Server checkout.
- Payment/tender recording foundations.
- Order creation and item persistence.
- Checkout idempotency.
- Reservation idempotency.
- Canonical replay behavior.
- Payload fingerprint conflict protection.
- Transaction/savepoint handling.
- Offline POS test/foundation coverage.

### D. Storefront
- Multi-tenant storefront resolution.
- Storefront API.
- Catalog visibility rules.
- Router/deep-link foundation.
- Modernization work.
- Server-authoritative checkout path.
- Order lookup/tracking foundations.

### E. Discovery
- Discovery-only and Discovery+Store business modes.
- Business onboarding.
- Listing lifecycle.
- Store conversion/provisioning.
- Locations, hours and service areas.
- Products/services discovery.
- Service requests and quotes.\n- Service-request lifecycle: OPEN → MATCHED → QUOTED → ACCEPTED/CANCELLED/CLOSED.\n- Request status history and accepted-quote uniqueness.
- Claims.
- Reviews.
- Reports/moderation.
- Verification state.
- Discovery analytics.
- Public visibility/activity enforcement.
- Tenant-scoped moderation.

### F. Search
- Full-text search foundation.
- Normalization/tokenization.
- Application-side fuzzy ranking compatible with PGlite.
- Multi-token recall.
- Typo tolerance.
- Search aliases.
- Search suggestions.
- Search analytics.
- Zero-result tracking.
- Deterministic pagination.
- Search candidate limits.
- Alias indexes.
- Search acceptance tests.

## 3. Major gaps before commercial launch

### G1 — Discovery Search productization
Status: Next.

Remaining:
- Merchant alias-management UI.
- Platform/admin alias governance. **IMPLEMENTED (API)**
- Synonym governance.
- Popular-search reporting. **IMPLEMENTED (API, hashed-query privacy model)**
- Zero-result query review workflow. **IMPLEMENTED (API summary/popular hash review)**
- Search result impression/click attribution. **IMPLEMENTED: search IDs, result positions, server-validated impression/conversion events, idempotent event IDs, privacy-safe attribution metadata.**
- Search-to-profile/store/product conversion metrics. **IMPLEMENTED: attribution ledger supports result engagement/conversion events and search-linked business/product/service targets.**
- Configurable ranking controls. **IMPLEMENTED: platform-governed ranking weights with server-side bounds and active/inactive fallback.**
- Search abuse/rate controls. **IMPLEMENTED: bounded public search/suggestion and attribution rate limits; distributed limiter remains a production-operations concern.**
- Search load/performance testing.
- Public API documentation.

### G2 — Discovery marketplace completion
Progress:
- Trust/verification workflow: **IMPLEMENTED (API + merchant verification UI + moderation audit schema)**
- Verification applications, decisions and status transitions are now server-authoritative.
- New reviews enter moderation; review decisions are audited.
- Report status transitions are audited.
- Claim submission/decisions are audited.
- Tenant-scoped verification/review/report moderation is enforced.
Remaining:
- Complete customer discovery experience across desktop/mobile.
- Business profile completeness.
- Map/location experience: interactive OpenStreetMap panel with mapped listing/location cards is implemented; merchant drag-pin location editing is now implemented with client-side tile interaction, GPS recentering, zoom/pan, and server-authoritative PATCH persistence.
- Favorites/saved businesses. **IMPLEMENTED: authenticated customer favorites API + saved-businesses workspace**
- Customer-to-business contact flows. **IMPLEMENTED: server-tracked contact inquiries with customer submission, merchant inbox, status workflow, merchant notes, and contact analytics attribution**
- Review management UX. **IMPLEMENTED: merchant review workspace with rating distribution, star filtering, response coverage, refresh/reload state, verified-purchase badges, and merchant response editing/deletion with character guidance.**
- Verification presentation and workflows. **MERCHANT TRUST CENTER IMPLEMENTED**
- Merchant-facing trust center: verification history, ownership-claim status, review moderation visibility, sanitized reports, trust timeline, required actions and resubmission entry point. **IMPLEMENTED**
- Claim UX. **IMPLEMENTED: public business-profile ownership claim flow with authenticated submission, evidence capture, validation feedback, and privacy guidance.**
- Service-request lifecycle UX. **BACKEND API + CUSTOMER WORKSPACE IMPLEMENTED**
- Merchant Discovery management workspace. **SERVICE REQUEST / QUOTE INBOX IMPLEMENTED**
- Platform Discovery moderation workspace. **IMPLEMENTED: PLATFORM TRUST CONTROL-PLANE UI + PLATFORM-SCOPED MODERATION APIs**
- Category governance.

Discovery governance increment implemented: platform-owned category taxonomy CRUD/audit, active-category enforcement in public discovery filters and merchant category assignment, and existing customer map/location/radius UX are now aligned with governed taxonomy. Customer contact inquiries and merchant review responses are implemented. Location hardening increment is now implemented: location quality/provenance fields, server-side coordinate/radius/type validation, transactional primary-location handling, location verification, service-area-aware radius search, richer search location metadata, and geo/location constraint tests. Map UX increment is now implemented for customer discovery and business profiles via the reusable OpenStreetMap panel; merchant drag-pin editing is now implemented in the merchant location editor with explicit manual-coordinate provenance. Discovery search now preserves the distance sort in URL state and presents server-calculated distance on result/map cards when a user location is supplied.ins a follow-up hardening item.

### G3 — Merchant operating system completion
Remaining/verification:
- Merchant dashboard consolidation.
- User/staff administration UX.
- Location management UX.
- Customer/CRM workflows.
- Supplier/purchasing workflows.
- Purchase orders and receiving.
- Expenses/cash controls where required.
- Returns/exchanges.
- Shift reconciliation.
- Operational alerts.
- Merchant reports.
- Storefront management.
- Discovery management.
- Settings/security UX.

### G4 — Payments and financial operations
The repository already contains payment transaction/lifecycle integrity foundations. The remaining commercial layer is:
- Real payment provider adapters.
- Cryptographic webhook verification.
- Provider-event idempotency.
- Payment status reconciliation.
- Failed/expired payment handling.
- Full/partial refunds.
- Chargeback/dispute lifecycle where applicable.
- Merchant settlement.
- Platform fees/commissions where marketplace transactions require them.
- Payouts.
- Reconciliation reports.
- Production payment sandbox and live verification.

### G5 — Reporting and analytics
Build a server-aggregated reporting layer:
- Sales summary.
- Gross margin.
- Product performance.
- Inventory valuation.
- Inventory turnover.
- Stock ageing.
- Purchase/vendor reports.
- POS shift/cash reconciliation.
- Customer metrics.
- Discovery/search metrics.
- Export controls.
- Date/timezone correctness.
- Tenant isolation.
- Large-dataset performance.

### G6 — Notifications and support
Remaining:
- Notification center.
- Notification preferences.
- Event-to-notification mapping.
- Email delivery provider.
- SMS provider.
- Push delivery.
- Retry/dead-letter handling.
- Support ticket lifecycle.
- Platform support workspace.
- Tenant help/support UI.
- Audit trail for support actions.

### G7 — Real-world integrations
Prioritize only after stable domain contracts:
- Payment gateways/mobile money/card processors.
- Email/SMS providers.
- Receipt printers.
- Barcode scanners.
- Cash drawers.
- Payment terminals.
- Delivery/logistics providers.
- Webhooks and integration health monitoring.

### G8 — Production operations
Remaining:
- Verified automated backups.
- Restore drills.
- Disaster recovery runbook.
- Database connection/pool monitoring.
- Health/readiness probes.
- Error monitoring.
- Structured operational logs.
- Alerting.
- Deployment rollback procedure.
- Secret rotation procedure.
- Production domain/TLS verification.
- Staging environment.
- Production data migration procedure.
- Operational support runbook.

### G9 — Final UX/accessibility/product polish
Remaining:
- Finish large-component decomposition where still needed.
- Cross-module loading/error/empty states.
- WCAG 2.2 AA audit.
- Keyboard navigation audit.
- Mobile/tablet testing.
- Browser compatibility.
- POS hardware ergonomics.
- Customer storefront usability.
- Merchant workflow usability.
- Discovery mobile experience.

### G10 — Final security and release assurance
Before production:
- Complete OWASP-oriented review.
- Tenant-boundary penetration testing.
- Authorization matrix verification.
- Input validation/fuzzing.
- Rate-limit review.
- Abuse protection.
- Secret/logging review.
- Dependency vulnerability review.
- Migration/rollback review.
- Backup restore verification.
- Full regression.
- Production build.
- Staging smoke test.
- Pilot-merchant acceptance test.

## 4. Ordered completion program

The project should now move through the following gates rather than adding unrelated features in parallel.

### Gate 0 — Baseline freeze
Status: COMPLETE
- Current main branch is regression-green.
- Existing architectural invariants remain protected.
- No historical migration rewrites.
- New schema changes are forward-only.

### Gate 1 — Discovery/Search and marketplace completion
Tasks:
- TASK-SEARCH-7: Search quality, governance and merchant management. **IN PROGRESS: attribution, ranking controls and abuse controls implemented; performance/load verification and richer admin UI remain.**
- TASK-SEARCH-8: Search conversion/impression analytics.
- TASK-SEARCH-9: Search abuse controls and performance testing.
- TASK-DISC-8: Discovery customer/merchant workflow completion.
- TASK-DISC-9: Discovery moderation/verification completion. **IMPLEMENTED (trust workflow/API + merchant verification UI; richer admin moderation UI remains)**

Exit criteria:
- Search acceptance suite green.
- Search analytics actionable.
- Merchant aliases manageable without direct SQL.
- No unpublished/private resource leakage.
- Search performance bounded under representative load.

### Gate 2 — Merchant operating completion
Tasks:
- TASK-MERCHANT-1: Merchant workspace consolidation.
- TASK-MERCHANT-2: Purchasing/suppliers.
- TASK-MERCHANT-3: Returns/exchanges.
- TASK-MERCHANT-4: Shift/cash reconciliation.
- TASK-MERCHANT-5: Operational alerts and workflow completion.

Exit criteria:
- A pilot merchant can operate daily sales, stock, purchasing and customer workflows without direct database intervention.

### Gate 3 — Financial/payment completion
Tasks:
- TASK-PAY-1: Provider adapter contract.
- TASK-PAY-2: Webhook verification/idempotency.
- TASK-PAY-3: Refunds/failed-payment lifecycle.
- TASK-PAY-4: Settlement/reconciliation.
- TASK-PAY-5: Production sandbox/live verification.

Exit criteria:
- Payment state is provider-verified and server-authoritative.
- Duplicate provider events are harmless.
- Refund and settlement states are auditable.

### Gate 4 — Reporting/analytics
Tasks:
- TASK-REPORT-1: Reporting service.
- TASK-REPORT-2: Merchant dashboards.
- TASK-REPORT-3: Platform analytics.
- TASK-REPORT-4: Discovery/search analytics.
- TASK-REPORT-5: Secure exports.

Exit criteria:
- Reports are server-aggregated, tenant-scoped and correct on decimal/financial calculations.

### Gate 5 — Communications/support
Tasks:
- TASK-COMMS-1: Notification domain.
- TASK-COMMS-2: Email.
- TASK-COMMS-3: SMS/push.
- TASK-SUPPORT-1: Support tickets.
- TASK-SUPPORT-2: Support operator workspace.

Exit criteria:
- Critical operational events produce reliable, observable notifications.

### Gate 6 — Integrations
Tasks:
- TASK-INTEGRATION-1: Payments.
- TASK-INTEGRATION-2: POS hardware.
- TASK-INTEGRATION-3: Messaging.
- TASK-INTEGRATION-4: Logistics/delivery.

Exit criteria:
- Each production integration has explicit adapter contracts, retries, idempotency, observability and failure handling.

### Gate 7 — Production operations
Tasks:
- TASK-OPS-1: Backup/restore.
- TASK-OPS-2: Monitoring/alerting.
- TASK-OPS-3: Staging/production deployment.
- TASK-OPS-4: Disaster recovery.
- TASK-OPS-5: Operational runbooks.

Exit criteria:
- Production failure scenarios have tested recovery procedures.

### Gate 8 — Final release
Task: TASK-RELEASE-1

Required:
- lint passes.
- build passes.
- complete automated suite passes.
- security review passes.
- accessibility review passes.
- staging smoke test passes.
- backup restore test passes.
- pilot acceptance passes.
- no open P0/P1 defects.
- production deployment and rollback procedures documented.

## 5. Pilot definition

AbaCha should be considered pilot-ready when a real merchant can complete this path:

Business onboarding
→ Tenant/store setup
→ Users & permissions
→ Locations
→ Products
→ Opening stock
→ POS sale
→ E-commerce sale
→ Inventory movement
→ Customer/order history
→ Payment confirmation
→ Refund/return
→ Shift reconciliation
→ Reports
→ Discovery listing
→ Customer discovery/search

No step should require developer/database intervention.

## 6. Full-production definition

Full production additionally requires:
- verified live payment providers;
- verified communications providers;
- production backups and restore drills;
- monitoring and alerting;
- security assessment;
- accessibility assessment;
- load/performance testing;
- documented incident response;
- documented rollback;
- merchant support workflow;
- privacy/terms/commercial policies;
- production domain/TLS;
- pilot evidence;
- release sign-off.

## 7. Current priority order

1. TASK-SEARCH-7 — Search quality/governance/merchant management.
2. TASK-DISC-8/9 — Complete Discovery marketplace workflows.
3. TASK-MERCHANT-1..5 — Complete merchant operating workflows.
4. TASK-PAY-1..5 — Production payment lifecycle.
5. TASK-REPORT-1..5 — Reporting and analytics.
6. TASK-COMMS/SUPPORT — Notifications and support.
7. TASK-INTEGRATION — External providers/hardware/logistics.
8. TASK-OPS — Production operations and disaster recovery.
9. TASK-RELEASE-1 — Final security, QA, accessibility, pilot and production gate.

## 8. Important architectural rule for remaining work

Do not regress to client-authoritative behavior.

For every new workflow:

UI
↓
Validated API
↓
Authorized service
↓
Tenant-scoped repository
↓
Transactional database mutation
↓
Audit/event where required
↓
Canonical response

The following must remain server-authoritative:
- prices;
- inventory;
- stock reservations;
- order totals;
- discounts;
- payment state;
- subscription state;
- tenant identity;
- permissions;
- reporting totals;
- Discovery publication/visibility;
- moderation decisions.

## 9. Definition of completion

AbaCha is complete only when all of the following are true:
- Core modules are implemented.
- All critical workflows are server-authoritative.
- Tenant boundaries are verified.
- Real payment lifecycle works.
- Merchant daily operations work end-to-end.
- Customer storefront and Discovery work end-to-end.
- Notifications/support work operationally.
- Reports reconcile to transactional data.
- External integrations are production verified.
- Backup/restore is tested.
- Monitoring/alerting is active.
- Security/accessibility audits pass.
- Full regression remains green.
- A real pilot merchant can operate without engineering intervention.

## 10. Immediate next task

TASK-DISC-8.1 is now implemented on main: authenticated service requests, explicit request state transitions, request history, provider matching, quote submission, quote acceptance/decline, cancellation/closure, and database-level single-accepted-quote integrity. TASK-SEARCH-7 remains in progress with conversion attribution, ranking controls, abuse controls, performance/load verification, and richer admin UI remaining. (API client, merchant UI, authorization-preserving backend endpoints already present). Remaining TASK-SEARCH-7 increments are conversion attribution, ranking controls, abuse controls, performance/load verification, and richer admin UI. Platform/admin alias governance and baseline search-quality analytics APIs are now implemented.

Search productization increment is now implemented on main: search attribution/conversion telemetry, configurable ranking controls, and bounded public search/attribution abuse controls. Remaining Search work is representative load/performance verification and richer platform/admin UI for ranking/analytics management.

The master roadmap should be treated as the controlling completion sequence from this checkpoint. TASK-DISC-9 trust/verification workflow is implemented on main, including the platform moderation workspace and merchant trust center; final regression verification remains part of the release gates. Existing historical roadmap documents remain historical references unless explicitly reconciled with this document.
