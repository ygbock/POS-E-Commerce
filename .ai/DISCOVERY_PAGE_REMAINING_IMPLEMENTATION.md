# AbaCha Discovery Page — Remaining Implementation Plan

**Status:** Active — PAGE-001 through PAGE-012 implementation complete; PAGE-013 production hardening in progress
**Scope:** Customer-facing Discovery experience and the end-to-end workflows required to make `/discover` production-ready.

## 1. Objective

Complete Discovery so customers can search businesses, products and services; filter by location/category; inspect listings; contact businesses; visit connected stores; request services; and manage resulting activity. Merchants and administrators must also be able to operate the listing lifecycle without database intervention.

## 2. Current Baseline

| Area | Status |
|---|---|
| Discovery database/schema | DONE |
| Discovery backend/API | DONE / HARDENED |
| Search foundation | DONE |
| Category system | DONE |
| Discovery Home | IMPLEMENTED |
| Search Results | IMPLEMENTED |
| Business Profile | IMPLEMENTED |
| Product Discovery | IMPLEMENTED |
| Service Discovery | IMPLEMENTED |
| Location selector | IMPLEMENTED |
| Map | IMPLEMENTED |
| Service Request/RFQ | IMPLEMENTED |
| Customer Discovery workspace | IMPLEMENTED |
| Merchant Discovery lifecycle | IMPLEMENTED |
| Trust/Verification | IMPLEMENTED |
| Admin moderation UI | IMPLEMENTED |
| Analytics/Event Verification | IMPLEMENTED |
| Accessibility/Responsive Hardening | IMPLEMENTED |
| Production readiness | IN PROGRESS — PAGE-013 |

## 3. Remaining Implementation

### DISC-PAGE-001 — Runtime Entry and Routing
**Implementation status:** COMPLETE. CI/regression validation passed; runtime/manual verification remains part of the release gate.
- [ ] Verify direct navigation to `/discover`.
- [ ] Verify refresh on `/discover` and all public Discovery URLs.
- [ ] Verify `/discover/search`.
- [ ] Verify `/discover/business/:id`.
- [ ] Verify `/discover/service/:id`.
- [ ] Verify browser Back/Forward.
- [ ] Verify query parameters survive refresh/share.
- [ ] Verify Discovery does not require tenant storefront resolution.
- [ ] Verify navigation back to storefront/home.
- [ ] Verify anonymous versus authenticated behavior.

**Done when:** every public Discovery URL loads directly and refreshes without route loops, blank screens or tenant-resolution lockouts.

### DISC-PAGE-002 — Discovery Home Hardening
**Implementation status:** COMPLETE. TypeScript/router regression coverage and CI validation passed; runtime/manual verification remains.
- [ ] Verify hero/search.
- [ ] Verify categories from real API.
- [ ] Verify businesses, products and services from real API.
- [ ] Verify loading, empty, error, 401, 403, 422, 429 and network states.
- [ ] Verify category selection.
- [ ] Verify location selection.
- [ ] Verify search navigation.
- [ ] Verify View All actions preserve relevant filters.
- [ ] Verify service-request CTA.
- [ ] Verify mobile navigation.
- [ ] Verify dark mode and responsive layout.
- [ ] Remove duplicate URL/filter handling where found.
- [ ] Verify production asset paths.

### DISC-PAGE-003 — Search Results Completion
**Implementation status:** COMPLETE. Search Results URL/search/filter/pagination hardening is implemented; automated Search, ranking, attribution, TypeScript and router checks passed; PAGE-013 adds bounded pagination and public endpoint rate-limit regression coverage. Runtime/manual verification remains.
- [ ] Verify All/Businesses/Products/Services tabs.
- [ ] Verify keyword search.
- [ ] Verify category, city, district, region and radius filters.
- [ ] Verify open-now filtering.
- [ ] Verify sorting.
- [ ] Verify pagination.
- [ ] Verify result count.
- [ ] Verify map synchronization.
- [ ] Verify URL state and refresh.
- [ ] Verify empty/error/rate-limit states.
- [ ] Verify mobile filters.

### DISC-PAGE-004 — Business Profile Completion
**Implementation status:** COMPLETE. Public profile contract, operating hours, reviews, services, customer actions, report/claim flows, store-mode behavior and profile analytics wiring are implemented. Automated and runtime/manual verification remain part of the release gate.
- [x] Identity, description and categories are rendered from the public profile payload.
- [x] Verification badge/status is rendered.
- [x] Contact actions and directions are wired with settings guards.
- [x] Primary-location operating hours are rendered with current open/closed status.
- [x] Active services are included in the public profile payload and rendered.
- [x] Published reviews and rating summary are included in the public profile payload.
- [x] Ownership claim submission is wired.
- [x] Public listing report submission is wired.
- [x] Service-request CTA and quote submission are wired with the listing's service-request setting.
- [x] Discovery-only versus Discovery-and-Store behavior is enforced for the public store link.
- [x] Published/non-published visibility is enforced by the public profile service.
- [x] Profile view, contact, direction, store, service-view and service-request analytics events are wired.
- [x] Run `npm run test:discovery-profile`.
- [x] TypeScript/lint gate passed in CI.
- [x] Run `npm run test:discovery-router`.
- [x] Run `npm run test:discovery-search`.
- [x] Discovery aggregate gate is registered and covered by CI; latest CI passed.
- [ ] Perform runtime/manual customer-profile verification.

### DISC-PAGE-005 — Location and Map
**Implementation status:** IMPLEMENTED. Location fallback, URL-preserved area filters, radius selection, map recentering, unmapped-listing disclosure, directions, and map-service fallback are implemented. Automated regression verification and runtime/manual verification remain part of the release gate.
- [x] Manual city/district/region selection is wired through URL/search state.
- [x] Browser GPS with explicit user action and permission/unavailable fallback.
- [x] Radius changes and distance filtering are wired through the search API.
- [x] Businesses with and without usable coordinates are handled explicitly.
- [x] Map/list synchronization recenters the embedded map on the selected business.
- [x] Mobile map interaction preserves page scrolling until the user opts in.
- [x] Map-service failure has a non-blocking fallback.
- [x] Directions links are available for mapped businesses.
- [x] Location privacy messaging is displayed.
- [ ] Verify manual city/district/region selection.
- [ ] Verify browser GPS.
- [ ] Verify denied/unavailable GPS fallback.
- [ ] Verify radius changes and distance filtering.
- [ ] Verify businesses with and without coordinates.
- [ ] Verify map/list synchronization.
- [ ] Verify mobile map behavior.
- [ ] Verify map-service failure fallback.
- [ ] Verify directions links.
- [ ] Verify location privacy messaging.

### DISC-PAGE-006 — Product Discovery
- [x] Product cards and lazy-loaded images.
- [x] Price visibility follows merchant `show_prices` settings.
- [x] Stock visibility follows merchant `show_stock_status` settings and availability badges.
- [x] Merchant identity and location are displayed.
- [x] Product-to-store navigation resolves through the merchant slug/id.
- [x] Tenant/store resolution is server-authoritative through published, discoverable business + active organization joins.
- [x] Unavailable products remain discoverable with zero-stock availability state when otherwise eligible.
- [x] Product search/filter behavior is handled by the unified Discovery search API, including query, category, location, radius and sort.
- [x] Product result analytics emit `PRODUCT_VIEW` attribution when selected.
- [x] Dedicated PAGE-006 regression coverage is registered in `test:discovery`.

**IMPLEMENTATION COMPLETE; VALIDATION ACTIVE**

### DISC-PAGE-007 — Service Discovery and RFQ
- [x] Public service cards open a dedicated service-detail page.
- [x] Service detail exposes pricing, duration, service area and booking mode.
- [x] Service detail and search/home cards emit service-view attribution.
- [x] Public service detail is server-authoritative: active service + published/discoverable business + active organization.
- [x] Request form validates required customer/request fields and preserves the selected service.
- [x] Request creation persists the selected service through the Discovery API.
- [x] Provider matching and tenant authorization are enforced by the service-request backend.
- [x] Customer request history, lifecycle timeline and quote comparison are implemented.
- [x] Customer quote acceptance is wired to the request lifecycle.
- [x] Merchant request inbox and quote submission are implemented.
- [x] PAGE-007 regression coverage is registered in `test:discovery`.

**IMPLEMENTATION COMPLETE; VALIDATION ACTIVE**

**Target flow:** Discover Service → Service Detail → Request → Matching → Provider Response → Quote → Customer Decision.

### DISC-PAGE-008 — Customer Discovery Workspace
- [x] Saved Businesses workspace with load, refresh, open and remove actions.
- [x] My Service Requests workspace with lifecycle detail, timeline, cancellation and quote acceptance.
- [x] My Contact Inquiries workspace with status and response timestamps.
- [x] My Claims workspace with pending/approved/rejected decisions and review notes.
- [x] Deep-link routes registered for all authenticated customer workspaces.
- [x] Anonymous users are redirected to login with the original workspace path preserved.
- [x] Customer APIs are server-scoped to the authenticated user for favorites, inquiries and claims.
- [x] Empty/error/loading states are implemented across the workspace pages.
- [x] PAGE-008 regression coverage is registered in `test:discovery`.

**IMPLEMENTATION COMPLETE; VALIDATION ACTIVE**

### DISC-PAGE-009 — Merchant Listing-to-Public Lifecycle
**Implementation status:** COMPLETE; VALIDATION ACTIVE. Merchant creation, readiness, submission, moderation, approval, publication, rejection/resubmission, pause/resume/archive, lifecycle history, and Discovery → Store conversion are implemented and covered by the existing lifecycle/authorization/store regression suites. Operating hours are managed through the existing merchant Hours Editor as part of listing configuration.

- [x] Discovery-only business creation.
- [x] Discovery-and-Store business creation.
- [x] Server-authoritative listing readiness.
- [x] Submission.
- [x] Moderation review and rejection reasons/issues.
- [x] Approval.
- [x] Publication.
- [x] Published listing appears in public Discovery search/profile.
- [x] Rejection and controlled resubmission.
- [x] Pause, owner resume, moderator suspension, and archive.
- [x] Immutable lifecycle history with actor/reason capture.
- [x] Discovery-only → Discovery-and-Store transactional conversion.
- [x] Merchant workspace exposes owner pause/resume/archive controls.
- [x] Regression coverage exercises the full moderation/public lifecycle and store conversion.

**Target flow:** Create Business → Configure Listing → Location → Category → Hours → Services → Submit → Review → Approve → Publish.

### DISC-PAGE-010 — Admin Moderation UI
**Implementation status:** COMPLETE; VALIDATION ACTIVE. The platform moderation workspace now provides the administrator listing review queue/detail workflow, structured rejection issues, approve/reject/publish/suspend actions, verification queue, ownership-claim queue, review moderation, abuse-report triage, moderation history, reason/note capture, and server-authoritative platform permission enforcement.

- [x] Moderation overview/workspace.
- [x] Listing review queue with filtering and pagination.
- [x] Listing detail review with readiness, profile, location and moderation issues.
- [x] Approve/reject/publish/suspend actions.
- [x] Verification queue and approve/reject decisions.
- [x] Ownership claims queue and approve/reject decisions.
- [x] Abuse reports queue with under-review/resolve/dismiss decisions.
- [x] Customer review moderation.
- [x] Moderation history combining listing lifecycle and trust decisions.
- [x] Reason/note capture and structured rejection issues.
- [x] Platform permission enforcement and tenant-user denial.
- [x] Server-side audit/trust event visibility.
- [x] HTTP regression coverage for authorization, lifecycle decisions, suspension and history.



### DISC-PAGE-011 — Analytics/Event Verification
**Implementation status:** COMPLETE; VALIDATION ACTIVE. Dedicated analytics regression passed after fixture hardening; latest CI also passed. Discovery analytics ingestion now has server-side event validation, idempotent event IDs, bounded attribution rate limiting, privacy-preserving HttpOnly session identity, published-target validation for businesses/products/services, and richer merchant analytics summaries.

- [x] Search events.
- [x] Impression events.
- [x] Listing views.
- [x] Contact events.
- [x] Direction clicks.
- [x] Store clicks.
- [x] Product views.
- [x] Service views.
- [x] Service requests.
- [x] Order/store conversion clicks.
- [x] Privacy-preserving session identity.
- [x] Merchant analytics summaries.
- [x] Generic analytics event verification regression coverage.
- [x] Dedicated `npm run test:discovery-analytics` regression passed.
- [x] Latest Discovery CI gate passed.
- [x] Production build passed during the implementation validation cycle.
- [ ] Perform runtime/manual analytics verification.

### DISC-PAGE-012 — Accessibility and Responsive Hardening
**Implementation status:** COMPLETE; CI VALIDATED. The latest CI run passed after the accessibility/responsive implementation. Discovery-specific accessibility and responsive hardening is implemented across filters, verification information, map controls, mobile navigation spacing, touch targets, keyboard dismissal, focus trapping, reduced-motion handling, and horizontal-overflow safety.

- [x] Keyboard navigation.
- [x] Screen-reader labels.
- [x] Focus management and modal traps.
- [x] Escape-key handling.
- [x] Touch target sizing.
- [x] Mobile search and filters.
- [x] Mobile map/cards/navigation.
- [x] Tablet layout.
- [x] Desktop layout.
- [x] Dark mode.
- [x] No horizontal overflow.
- [x] Dedicated static accessibility/responsive regression coverage.
- [x] Accessibility/responsive regression coverage is registered in `test:discovery`.
- [x] Latest CI TypeScript/build/regression gate passed.
- [x] Latest CI run passed for PAGE-012.
- [ ] Perform browser/manual verification at mobile, tablet and desktop breakpoints.

### DISC-PAGE-013 — Performance and Resilience

**Implementation status:** IN PROGRESS; PRODUCTION HARDENING ACTIVE. Existing Discovery search cancellation, independent section loading, 300-listing performance coverage, production asset/build validation and rate limiting are retained; PAGE-013 now hardens public pagination and rate-limit coverage.

- [x] Bounded public search pagination (`limit` 1–100; `offset` 0–10,000).
- [x] Reject non-integer/NaN pagination input with `VALIDATION_ERROR` instead of allowing malformed database parameters.
- [x] Rate-limit public business listing endpoint.
- [x] Rate-limit public category endpoint.
- [x] Preserve existing search endpoint rate limiting.
- [x] Preserve request cancellation through `AbortController` in Search Results.
- [x] Preserve independent business/product/service section loading.
- [x] Preserve 300-listing search performance regression coverage.
- [x] Add dedicated production-readiness regression gate and register it in `test:discovery`.
- [x] Normalize malformed Discovery search URL numeric parameters instead of propagating `NaN` into API requests.
- [x] Add runtime image fallbacks for failed business/product Discovery assets.
- [x] Confirm search remains submit-driven (no per-keystroke request storm); request cancellation remains active for superseded searches.
- [ ] Measure initial Discovery browser load in a production-like deployment.
- [ ] Detect duplicate API requests with browser/network instrumentation.
- [x] Static code verification confirms Discovery search is submit-driven and superseded requests are cancelled.
- [ ] Verify search debouncing where appropriate.
- [ ] Verify slow API/network interruption in a browser.
- [x] Implement image fallback behavior for failed business/product image loads.
- [ ] Verify image fallback behavior under failed/slow asset loads.
- [ ] Verify production bundle impact against the release baseline.
- [ ] Run the new production-readiness regression locally.
### DISC-PAGE-014 — End-to-End QA and Release Gate

**Status:** PENDING FINAL PAGE-013 HARDENING AND MANUAL RELEASE VERIFICATION.

**Automated:**
- [ ] `npm run test:discovery`.
- [ ] Discovery frontend tests.
- [ ] Discovery router tests.
- [ ] Discovery API-client tests.
- [ ] Discovery HTTP authorization tests.
- [ ] Discovery search tests.
- [ ] Discovery performance tests.
- [ ] `npx tsc --noEmit`.
- [ ] `npm run build`.
- [ ] Full `npm test`.
- [ ] Production migration verification.

**Manual:**
- [ ] Anonymous customer journey.
- [ ] Authenticated customer journey.
- [ ] Business-owner journey.
- [ ] Administrator journey.
- [ ] Discovery-only business.
- [ ] Discovery-and-Store business.
- [ ] Business with products.
- [ ] Business with services.
- [ ] Business without coordinates.
- [ ] Empty marketplace.
- [ ] Suspended listing.
- [ ] Mobile browser.
- [ ] Desktop browser.

**Release gate:** no P0/P1 Discovery defects; TypeScript, build and Discovery tests pass; direct URLs work after refresh; real database data renders; merchant-to-public and customer-to-store/service journeys work; security boundaries pass; no mock production data is required.

### DISC-PAGE-015 — Documentation and Production Handoff
- [ ] Update Discovery implementation status.
- [ ] Update Phase 5 roadmap.
- [ ] Document final public, merchant and admin routes.
- [ ] Document API and environment dependencies.
- [ ] Document map/location configuration.
- [ ] Document moderation workflow.
- [ ] Document production monitoring.
- [ ] Record final test results.
- [ ] Create Discovery release checklist.

## 4. Execution Waves

### Wave 1 — Make `/discover` reliable
1. DISC-PAGE-001 Runtime Entry and Routing — **IMPLEMENTATION COMPLETE**
2. DISC-PAGE-002 Discovery Home — **IMPLEMENTATION COMPLETE**
3. DISC-PAGE-003 Search Results — **IMPLEMENTATION COMPLETE**

### Wave 2 — Complete customer discovery
4. DISC-PAGE-004 Business Profile — **IMPLEMENTATION COMPLETE**
5. DISC-PAGE-005 Location and Map — **IMPLEMENTATION COMPLETE**
6. DISC-PAGE-006 Product Discovery — **IMPLEMENTATION COMPLETE; VALIDATION ACTIVE**
7. DISC-PAGE-007 Service/RFQ — **IMPLEMENTATION COMPLETE**

### Wave 3 — Complete platform workflows
8. DISC-PAGE-008 Customer Workspace — **IMPLEMENTATION COMPLETE**
9. DISC-PAGE-009 Merchant Lifecycle — **IMPLEMENTATION COMPLETE; VALIDATED**
10. DISC-PAGE-010 Moderation UI — **IMPLEMENTATION COMPLETE; VALIDATED**

### Wave 4 — Production hardening
11. DISC-PAGE-011 Analytics — **IMPLEMENTATION COMPLETE; VALIDATED IN CI**
12. DISC-PAGE-012 Accessibility/Mobile — **IMPLEMENTATION COMPLETE; CI PASSED**
13. DISC-PAGE-013 Performance/Resilience — **IMPLEMENTATION IN PROGRESS**

### Wave 5 — Release
14. DISC-PAGE-014 QA and Release Gate
15. DISC-PAGE-015 Documentation/Handoff

## 5. Current Implementation Checklist

### Completed implementation waves
- [x] PAGE-001 Runtime Entry and Routing implementation.
- [x] PAGE-002 Discovery Home implementation.
- [x] PAGE-003 Search Results implementation.
- [x] PAGE-004 Business Profile implementation.
- [x] PAGE-005 Location and Map implementation.
- [x] PAGE-006 Product Discovery implementation.
- [x] PAGE-007 Service Discovery and RFQ implementation.
- [x] PAGE-008 Customer Discovery Workspace implementation.
- [x] PAGE-009 Merchant Listing-to-Public Lifecycle implementation.
- [x] PAGE-010 Admin Moderation UI implementation.
- [x] PAGE-011 Analytics/Event Verification implementation.
- [x] PAGE-012 Accessibility and Responsive Hardening implementation.
- [x] PAGE-013 initial Performance/Resilience hardening: bounded pagination and public rate limiting.
- [x] PAGE-013 resilience hardening: malformed URL-number normalization and Discovery image fallbacks.
- [x] Discovery accessibility, analytics, moderation, lifecycle, search, service, customer-workspace and performance regression coverage registered in `test:discovery`.
- [x] Latest PAGE-012 CI run passed.

### Remaining release-gate work
- [ ] Complete PAGE-013 browser-level performance/resilience verification.
- [ ] Run/record final `npm run test:discovery` locally.
- [ ] Run/record final `npx tsc --noEmit` locally.
- [ ] Run/record final `npm run build` locally.
- [ ] Complete DISC-PAGE-014 end-to-end QA and release gate.
- [ ] Complete DISC-PAGE-015 documentation and production handoff.

## 6. Definition of Done

> A customer can open AbaCha Discovery, search for a real local business/product/service, filter by location/category/availability, inspect the listing, contact or navigate to the business, visit its connected store where available, request a service where applicable, and manage resulting customer activity — while merchants and administrators can manage listing lifecycle and moderation — entirely through the application UI.

Normal customer and merchant workflows must not require database intervention.