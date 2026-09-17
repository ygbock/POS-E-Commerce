# AbaCha Discovery UI — AI Studio Implementation Specification

## Ownership
All future Discovery UI implementation work should be produced in Google AI Studio and then reviewed/integrated into this repository. Backend/domain work may continue here, but do not introduce new Discovery UI screens/components from this workflow unless required to repair a build-breaking regression.

## Product goal
Build a polished, mobile-first local discovery experience for AbaCha Unified Commerce. Discovery helps customers find businesses, products and services available around their chosen location, while allowing businesses to maintain a public listing and convert from discovery-only to full commerce.

## Existing backend contracts
Use the existing `/api/discovery` APIs. Do not invent a parallel client-side data model or mock production inventory.

Core endpoints:
- GET `/api/discovery/search`
- GET `/api/discovery/businesses`
- GET `/api/discovery/businesses/:slug`
- POST `/api/discovery/businesses`
- PATCH `/api/discovery/businesses/:id`
- POST `/api/discovery/businesses/:id/submit`
- POST `/api/discovery/businesses/:id/approve`
- POST `/api/discovery/businesses/:id/publish`
- GET/POST `/api/discovery/businesses/:id/locations`
- PATCH `/api/discovery/businesses/:id/locations/:locationId`
- PUT `/api/discovery/businesses/:id/locations/:locationId/hours`
- PATCH `/api/discovery/businesses/:id/settings`
- GET/POST `/api/discovery/businesses/:id/services`
- PATCH `/api/discovery/businesses/:id/services/:serviceId`
- POST `/api/discovery/service-requests`
- GET `/api/discovery/service-requests/:id`
- POST `/api/discovery/service-requests/:id/quotes`
- POST/GET `/api/discovery/businesses/:id/reviews`
- POST `/api/discovery/businesses/:id/claims`
- POST `/api/discovery/reports`
- POST `/api/discovery/analytics/events`
- GET `/api/discovery/businesses/:id/analytics`
- GET `/api/discovery/moderation/claims`
- POST `/api/discovery/moderation/claims/:id/decision`
- GET `/api/discovery/moderation/reports`
- POST `/api/discovery/moderation/reports/:id/decision`

## Customer screens
1. Discovery home
   - Hero: “What are you looking for?”
   - Search input with recent searches
   - Location selector with privacy explanation
   - Quick categories
   - All / Products / Businesses / Services tabs
   - Near me, Open now, Available today, Delivery, Pickup filters

2. Search results
   - Responsive result cards/list
   - Clear distinction between verified and unverified listings
   - Distance and area where available
   - Product price and stock status when the business allows public visibility
   - Service price/quote/booking mode
   - Empty/error/loading states

3. Business profile
   - Identity, verification state, categories
   - Address/service areas
   - Hours with current open/closed state
   - Products
   - Services
   - Contact, directions, delivery/pickup
   - Reviews
   - Report listing

4. Service request
   - Need description
   - Location/service area
   - Preferred date
   - Budget
   - Provider matching
   - Quote comparison
   - Request status

## Business-owner screens
1. Get Listed wizard
2. Listing overview
3. Business profile editor
4. Locations/service areas editor
5. Weekly/special hours editor
6. Discovery visibility settings
7. Services manager
8. Service requests and quote inbox
9. Reviews and reputation
10. Claims/verification status
11. Discovery analytics
12. Discovery-to-Store conversion flow

## Moderation screens
1. Listing review queue
2. Claims queue
3. Reports/abuse queue
4. Business detail moderation drawer
5. Lifecycle actions with reason capture
6. Audit/history timeline

## UX requirements
- Mobile-first and responsive desktop layouts.
- Accessible keyboard navigation, labels, focus states and contrast.
- Do not expose private customer coordinates unless the user explicitly chooses location sharing.
- Never display suspended, archived, inactive-tenant or otherwise non-public listings.
- Use skeleton/loading states rather than layout jumps.
- Handle API validation, authorization, not-found and rate-limit errors gracefully.
- Avoid fake ratings, stock counts, prices or business verification badges.
- Analytics events should be sent only for supported event types.
- Preserve the existing AbaCha visual language rather than introducing a second design system.

## Component architecture
Prefer small reusable components:
- DiscoverySearchBar
- DiscoveryLocationSelector
- DiscoveryTabs
- DiscoveryFilters
- BusinessCard
- ProductDiscoveryCard
- ServiceCard
- BusinessProfileHeader
- BusinessHours
- BusinessLocation
- ProductAvailability
- ServiceRequestForm
- QuoteList
- ReviewList
- VerificationBadge
- ListingStatusBadge
- DiscoveryAnalyticsCards
- ModerationQueue

## AI Studio delivery rule
AI Studio output must be production-oriented TypeScript/React code compatible with this repository's existing Vite + React stack. Before integration, verify imports, API contracts, existing types, accessibility, responsive behavior and `npm run lint`.
