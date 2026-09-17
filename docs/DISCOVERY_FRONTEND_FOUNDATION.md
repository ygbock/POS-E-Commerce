# AbaCha Discovery Frontend Foundation (FRONT-001)

## Executive Summary

The Discovery Frontend Foundation establishes the reusable architectural and component layer for the AbaCha Unified Commerce local-discovery marketplace. Discovery enables customers in Sierra Leone and across West Africa to locate nearby businesses, browse store-backed products, request quotes for local services, and seamlessly transition into e-commerce checkout.

This document serves as the canonical technical record for `FRONT-001`.

---

## 1. Route Architecture

Discovery routes integrate directly into the existing routing infrastructure (`src/router/StorefrontRouter.ts` and `src/router/DiscoveryRouter.ts`), preventing architectural duplication while supporting all three primary personas.

### 1.1 Customer / Public Routes
| Route | Pattern | Description |
|---|---|---|
| Discovery Home | `/discover` | Hero search, popular categories, featured nearby listings |
| Discovery Search | `/discover/search?q=&type=&city=&radiusKm=` | Filtered search across businesses, products, and services |
| Business Profile | `/discover/business/:slugOrId` | Public business profile, location, hours, catalog & reviews |
| Service Details | `/discover/service/:serviceId` | Detailed service specification and pricing |
| Request Service | `/discover/request-service` | Post a service request / RFQ to local service providers |

### 1.2 Business Owner Routes
| Route | Pattern | Description |
|---|---|---|
| Business Overview | `/business/discovery` | Overview of listing performance and quick actions |
| Listing Profile | `/business/discovery/listing` | Business name, description, media, contact settings |
| Locations & Areas | `/business/discovery/locations` | Multi-branch locations and service radius configuration |
| Operating Hours | `/business/discovery/hours` | Weekly operating hours and holiday schedules |
| Service Catalog | `/business/discovery/services` | Service creation, pricing, booking mode, duration |
| Quote Requests | `/business/discovery/requests` | Inbound customer quote requests and dispatch inbox |
| Customer Reviews | `/business/discovery/reviews` | Reputation, rating breakdown, and response handling |
| Verification | `/business/discovery/verification` | Verification status and ownership claims |
| Discovery Analytics | `/business/discovery/analytics` | Impressions, clicks, conversions, unique sessions |
| Store Conversion | `/business/discovery/store-conversion` | Upgrade discovery-only business to full AbaCha store |

### 1.3 Administrator / Moderation Routes
| Route | Pattern | Description |
|---|---|---|
| Moderation Overview | `/admin/discovery` | High-level queue metrics and pending items |
| Listing Review Queue | `/admin/discovery/listings` | Submitted business listings awaiting approval |
| Listing Detail Review | `/admin/discovery/listings/:id` | Deep inspection and approve/suspend actions |
| Ownership Claims | `/admin/discovery/claims` | Pending merchant ownership verification claims |
| Abuse Reports | `/admin/discovery/reports` | Content violation and scam reports triage |
| Moderation History | `/admin/discovery/moderation-history` | Immutable audit log of all moderation decisions |

---

## 2. Domain Types Architecture (`src/types/discovery.ts`)

All TypeScript types strictly reflect the authoritative database schema and backend API contracts:

- **Lifecycle & Status Unions**:
  - `DiscoveryListingStatus`: `'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED' | 'PAUSED' | 'SUSPENDED' | 'ARCHIVED'`
  - `DiscoveryVerificationStatus`: `'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'`
  - `DiscoveryBusinessMode`: `'DISCOVERY_ONLY' | 'DISCOVERY_AND_STORE'`
  - `DiscoveryBookingMode`: `'REQUEST' | 'BOOKING' | 'QUOTE'`
  - `DiscoveryEventType`: `'SEARCH' | 'IMPRESSION' | 'VIEW' | 'CONTACT' | 'DIRECTION_CLICK' | 'STORE_CLICK' | 'PRODUCT_VIEW' | 'SERVICE_VIEW' | 'SERVICE_REQUEST' | 'ORDER_CLICK'`
  - `DiscoverySearchType`: `'all' | 'businesses' | 'products' | 'services'`
  - `DiscoveryAvailabilityStatus`: `'available' | 'limited' | 'out_of_stock' | 'check_stock' | 'unknown'`
  - `DiscoveryDataState`: 13 explicit UI states

- **Core Entities**:
  - `DiscoveryBusiness`: Canonical business record including public id, contact info, ratings, and location projections.
  - `DiscoveryLocation`: Physical store or service area with latitude, longitude, and radius.
  - `DiscoveryBusinessHours`: Day-of-week (1=Mon..7=Sun) open/close timings.
  - `DiscoveryBusinessSettings`: Public privacy and visibility flags (`show_products`, `show_prices`, `show_stock_status`, `allow_phone_contact`, etc.).
  - `DiscoveryCategory`: Discovery taxonomy categories with icon identifiers.
  - `DiscoveryProduct`: Projected catalog item from connected tenant inventory.
  - `DiscoveryService`: Service offering with booking mode and price limits.
  - `DiscoveryReview` & `DiscoveryReviewsResponse`: Verified purchase reviews and ratings summary.
  - `DiscoveryServiceRequest` & `DiscoveryServiceQuote`: RFQ marketplace entities.
  - `DiscoveryBusinessClaim`: Ownership transfer/claim submission with evidence payload.
  - `DiscoveryReport`: Abuse and policy enforcement report.
  - `DiscoveryAnalyticsSummary`: Event ledger aggregation by session hash.

---

## 3. API Client Integration (`src/services/discoveryApi.ts`)

Built using the repository's established `fetch` + `authClient.getAuthHeaders()` paradigm with unified error handling:

- **Public Methods**:
  - `search(filters)`: Unified search across businesses, products, services (`GET /api/discovery/search`)
  - `getBusinesses(params)`: List published businesses (`GET /api/discovery/businesses`)
  - `getBusinessBySlug(slug)`: Fetch comprehensive business profile (`GET /api/discovery/businesses/:slug`)
  - `getCategories()`: Get all categories (`GET /api/discovery/categories`)
  - `getBusinessLocations(id)`: Get locations (`GET /api/discovery/businesses/:id/locations`)
  - `getBusinessServices(id)`: Get services (`GET /api/discovery/businesses/:id/services`)
  - `getBusinessReviews(id)`: Get reviews summary (`GET /api/discovery/businesses/:id/reviews`)
  - `createServiceRequest(data)`: Submit RFQ (`POST /api/discovery/service-requests`)
  - `createReport(data)`: Submit abuse report (`POST /api/discovery/reports`)
  - `trackEvent(event)`: Ingest analytics (`POST /api/discovery/analytics/events`)

- **Business Owner Operations**:
  - `createBusiness(data)`, `updateBusiness(id, patch)`
  - `submitBusiness(id)`, `publishBusiness(id)`, `pauseBusiness(id)`, `archiveBusiness(id)`
  - `createLocation(id, loc)`, `updateLocation(id, locId, patch)`, `updateHours(id, locId, hours)`
  - `updateSettings(id, settings)`, `updateBusinessCategories(id, categoryIds)`
  - `createService(id, svc)`, `updateService(id, svcId, patch)`
  - `getServiceRequest(id)`, `createQuote(requestId, quote)`
  - `createClaim(id, claim)`, `createReview(id, review)`, `getBusinessAnalytics(id, days)`

- **Admin & Moderation Operations**:
  - `approveBusiness(id)`, `suspendBusiness(id)`
  - `getModerationClaims()`, `decideClaim(id, status, reason)`
  - `getModerationReports()`, `decideReport(id, status, note)`

---

## 4. Reusable Component Layer (`src/components/discovery/*`)

| Component | Purpose | Key Accessibility / UX Features |
|---|---|---|
| `VerificationBadge` | Renders `VERIFIED`, `PENDING`, `UNVERIFIED`, `REJECTED` | Semantic icons and descriptive tooltips; does not rely solely on color |
| `AvailabilityBadge` | Displays real stock / service status | Distinct emerald/amber/sky/rose styles with aria-label |
| `ListingStatusBadge` | Displays lifecycle state | Used across merchant dashboard and moderation tables |
| `DiscoveryRating` | Star ratings and review count | Accessible fractional star display with `aria-label` |
| `DiscoverySearchBar` | Search input with instant suggestions | Clear button, submit action, `Escape` key handling |
| `DiscoveryLocationSelector` | GPS geolocation & manual selection | Browser Geolocation API with privacy disclaimer and radius slider |
| `DiscoveryTabs` | All / Businesses / Products / Services | Accessible `role="tablist"` with arrow-key keyboard navigation |
| `DiscoveryFilters` | Quick filters + responsive drawer | Fast filter pills (`Near me`, `Open now`, `Delivery`, `Pickup`) and modal drawer |
| `DiscoverySort` | Sort order selector | Accessible select with relevance, rating, review count, and name |
| `BusinessCard` | Rich business preview card | Cover photo, logo, verified badge, rating, location, click-to-call, directions |
| `ProductDiscoveryCard` | Discovery product card | Product thumbnail, stock badge, retail price, store link |
| `ServiceCard` | Local service offering card | Duration badge, price range, booking mode, quote request CTA |
| `DiscoveryEmptyState` | Zero results container | Reset filters action and "Post a service request" CTA |
| `DiscoveryLoadingState` | Skeleton loading grids | Exact card geometry skeletons preventing cumulative layout shift |
| `DiscoveryErrorState` | Error messaging alert | Friendly error copy, error code display, and retry button |
| `DiscoveryRateLimitState`| 429 rate limit card | Live countdown timer with automatic retry enablement |
| `DiscoveryPagination` | Page navigation controls | Accessible pagination landmarks with Prev/Next |
| `DiscoveryResultCount` | Results feedback | Polite live region (`aria-live="polite"`) announcing item counts |
| `DiscoveryStateContainer` | 13-state wrapper | Encapsulates all 13 required platform states without empty screens |

---

## 5. State Handling Matrix

The foundation explicitly manages 13 discrete data and network states:

1. **Loading**: Renders `DiscoveryLoadingState` skeletons tailored to the active tab.
2. **Loaded (with results)**: Renders multi-column responsive cards.
3. **Loaded (zero results)**: Renders `DiscoveryEmptyState` with filter reset and quote posting.
4. **API Error**: Renders `DiscoveryErrorState` with error code and retry CTA.
5. **Network Failure**: Renders offline notice with retry CTA.
6. **Unauthorized (401)**: Prompts user to log in for authenticated actions.
7. **Forbidden (403)**: Informs user that permission is restricted.
8. **Rate Limited (429)**: Renders `DiscoveryRateLimitState` with active countdown timer.
9. **Invalid Input (422)**: Surfaces actionable validation advice.
10. **Location Unavailable**: Prompts manual city selection.
11. **Location Permission Denied**: Gracefully falls back to manual area picker.
12. **Listing Unavailable (404)**: Renders clear not-found card.
13. **Suspended / Archived**: Explains that the listing is currently inactive.

---

## 6. Access Control & Authorization

- Frontend access control matches the server-authoritative permission architecture.
- Privileged navigation tabs (`discovery-admin`) are displayed only for `Super Admin` and `Business Owner` roles.
- No client-side bypasses or `localStorage` role injections exist.
- Non-public listings (draft, suspended, paused, archived) are guarded by the server; the UI renders appropriate status cards if queried directly.

---

## 7. Responsive Design & Accessibility

- **Mobile First**: Touch targets exceed 44x44px; filters transition from horizontal pills to a bottom/side drawer; no horizontal overflow.
- **Desktop**: 3-column business grids, 5-column product grids, sticky search bar.
- **Accessibility**: Semantic HTML (`<article>`, `<nav>`, `<form>`, `<button>`), ARIA live regions for search results, keyboard arrow navigation on tabs, clear focus rings on all interactive elements.

---

## 8. Handoff to FRONT-002 (Discovery Home)

With `FRONT-001` complete, all necessary domain models, API client endpoints, routing hooks, and reusable UI components are available. `FRONT-002` will assemble the dedicated Discovery Home page, including:
- Dynamic hero banner with location personalization
- Popular categories carousel
- Featured local business spotlights
- Real-time stock availability badges
- Nearby services grid
