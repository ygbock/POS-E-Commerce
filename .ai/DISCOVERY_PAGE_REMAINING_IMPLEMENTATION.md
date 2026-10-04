# AbaCha Discovery Page — Remaining Implementation Plan

**Status:** Active
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
| Admin moderation UI | PARTIAL |
| Production readiness | NOT COMPLETE |

## 3. Remaining Implementation

### DISC-PAGE-001 — Runtime Entry and Routing
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
- [ ] Verify identity, description and categories.
- [ ] Verify verification badge.
- [ ] Verify contacts and directions.
- [ ] Verify locations and operating hours.
- [ ] Verify open/closed status.
- [ ] Verify products and connected store.
- [ ] Verify services.
- [ ] Verify reviews and rating summary.
- [ ] Verify ownership claim.
- [ ] Verify report listing.
- [ ] Verify service-request CTA.
- [ ] Verify Discovery-only versus Discovery-and-Store behavior.
- [ ] Verify suspended/archived/unavailable listing states.
- [ ] Verify profile analytics events.

### DISC-PAGE-005 — Location and Map
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
- [ ] Verify product cards and images.
- [ ] Verify price visibility settings.
- [ ] Verify stock visibility and availability badges.
- [ ] Verify merchant identity.
- [ ] Verify product-to-store navigation.
- [ ] Verify tenant/store resolution.
- [ ] Verify unavailable products.
- [ ] Verify product search/filter behavior.
- [ ] Verify product analytics events.

### DISC-PAGE-007 — Service Discovery and RFQ
- [ ] Verify service cards and service detail.
- [ ] Verify pricing, duration, service area and booking mode.
- [ ] Verify request form validation.
- [ ] Verify selected service is preserved.
- [ ] Verify request creation.
- [ ] Verify provider matching.
- [ ] Verify quote retrieval and comparison.
- [ ] Verify customer request history.
- [ ] Verify merchant request inbox.
- [ ] Verify notifications.
- [ ] Verify request status transitions.

**Target flow:** Discover Service → Request → Matching → Provider Response → Quote → Customer Decision.

### DISC-PAGE-008 — Customer Discovery Workspace
- [ ] Verify Saved Businesses.
- [ ] Verify My Service Requests.
- [ ] Verify My Contact Inquiries.
- [ ] Verify My Claims.
- [ ] Verify authentication boundaries.
- [ ] Verify anonymous-user behavior.
- [ ] Verify private data isolation.
- [ ] Verify empty states and deep links.

### DISC-PAGE-009 — Merchant Listing-to-Public Lifecycle
- [ ] Verify Discovery-only business creation.
- [ ] Verify Discovery-and-Store business creation.
- [ ] Verify listing readiness.
- [ ] Verify submission.
- [ ] Verify moderation.
- [ ] Verify approval.
- [ ] Verify publication.
- [ ] Verify published listing appears in search.
- [ ] Verify rejection and resubmission.
- [ ] Verify pause, suspension and archive.
- [ ] Verify lifecycle history.
- [ ] Verify store conversion.

**Target flow:** Create Business → Configure Listing → Location → Category → Hours → Services → Submit → Review → Approve → Publish.

### DISC-PAGE-010 — Admin Moderation UI
- [ ] Moderation overview/dashboard.
- [ ] Listing review queue.
- [ ] Listing detail review.
- [ ] Approve/reject/suspend actions.
- [ ] Verification queue.
- [ ] Ownership claims queue.
- [ ] Abuse reports queue.
- [ ] Review moderation.
- [ ] Moderation history.
- [ ] Reason/note capture.
- [ ] Permission enforcement.
- [ ] Audit event visibility.

### DISC-PAGE-011 — Analytics/Event Verification
- [ ] Search events.
- [ ] Impression events.
- [ ] Listing views.
- [ ] Contact events.
- [ ] Direction clicks.
- [ ] Store clicks.
- [ ] Product views.
- [ ] Service views.
- [ ] Service requests.
- [ ] Order/store conversion clicks.
- [ ] Privacy-preserving session identity.
- [ ] Merchant analytics summaries.

### DISC-PAGE-012 — Accessibility and Responsive Hardening
- [ ] Keyboard navigation.
- [ ] Screen-reader labels.
- [ ] Focus management and modal traps.
- [ ] Escape-key handling.
- [ ] Touch target sizing.
- [ ] Mobile search and filters.
- [ ] Mobile map/cards/navigation.
- [ ] Tablet layout.
- [ ] Desktop layout.
- [ ] Dark mode.
- [ ] No horizontal overflow.

### DISC-PAGE-013 — Performance and Resilience
- [ ] Measure initial Discovery load.
- [ ] Detect duplicate API requests.
- [ ] Verify request cancellation.
- [ ] Verify search debouncing where appropriate.
- [ ] Verify independent section loading.
- [ ] Verify large result sets.
- [ ] Verify 300+ listing performance.
- [ ] Verify slow API/network interruption.
- [ ] Verify rate limiting.
- [ ] Verify image fallbacks.
- [ ] Verify production assets and bundle impact.

### DISC-PAGE-014 — End-to-End QA and Release Gate

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
1. DISC-PAGE-001 Runtime Entry and Routing
2. DISC-PAGE-002 Discovery Home
3. DISC-PAGE-003 Search Results

### Wave 2 — Complete customer discovery
4. DISC-PAGE-004 Business Profile
5. DISC-PAGE-005 Location and Map
6. DISC-PAGE-006 Product Discovery
7. DISC-PAGE-007 Service/RFQ

### Wave 3 — Complete platform workflows
8. DISC-PAGE-008 Customer Workspace
9. DISC-PAGE-009 Merchant Lifecycle
10. DISC-PAGE-010 Moderation UI

### Wave 4 — Production hardening
11. DISC-PAGE-011 Analytics
12. DISC-PAGE-012 Accessibility/Mobile
13. DISC-PAGE-013 Performance/Resilience

### Wave 5 — Release
14. DISC-PAGE-014 QA and Release Gate
15. DISC-PAGE-015 Documentation/Handoff

## 5. Definition of Done

> A customer can open AbaCha Discovery, search for a real local business/product/service, filter by location/category/availability, inspect the listing, contact or navigate to the business, visit its connected store where available, request a service where applicable, and manage resulting customer activity — while merchants and administrators can manage listing lifecycle and moderation — entirely through the application UI.

Normal customer and merchant workflows must not require database intervention.