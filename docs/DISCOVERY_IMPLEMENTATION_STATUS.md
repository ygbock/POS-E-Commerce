# AbaCha Discovery Implementation Status

## Implemented

- **DISC-004** Business Discovery core: canonical business identity, discovery-only/store modes, slugs, tenant linkage, repository/service, lifecycle history.
- **DISC-005** Business onboarding: authenticated listing creation with tenant isolation and immediate submission option.
- **DISC-006** Listing lifecycle: draft, submitted, review, approved, published, paused, suspended and archived states with immutable transition history.
- **DISC-007** Locations and hours: physical/service-area locations, coordinates, service radius, weekly hours and public discovery settings.
- **DISC-008** Search foundation: unified `/api/discovery/search` across businesses, products and services with location and open-now filters.
- **DISC-009** Product discovery: published store-connected businesses expose products/variants through existing catalog and inventory tables; public price/stock visibility follows business settings.
- **DISC-010** Services marketplace: services, service requests, provider matches and quotes.
- **DISC-011** Public Discovery UI: customer-facing discovery workspace with search, tabs, business/product/service cards and service-request flow.
- **DISC-012** Trust and moderation: verification status model, business claims, reviews, verified-purchase flag, reports and admin moderation endpoints.
- **DISC-013** Discovery-to-Store conversion: the canonical business record can transition from discovery-only to tenant-connected store through the existing update contract, preserving identity and slug.
- **DISC-014** Analytics and hardening: privacy-preserving session hashes, event ledger, business analytics summaries, immutable lifecycle history and public visibility guards.
- **DISC-015** Ranking/relevance: search ordering combines text match, verification and product availability; the design leaves room for additional signals without changing the canonical data model.

## API surface

### Business directory

- `GET /api/discovery/businesses`
- `GET /api/discovery/businesses/:slug`
- `POST /api/discovery/businesses`
- `PATCH /api/discovery/businesses/:id`
- `POST /api/discovery/businesses/:id/submit`
- `POST /api/discovery/businesses/:id/approve`
- `POST /api/discovery/businesses/:id/publish`
- `POST /api/discovery/businesses/:id/pause`
- `POST /api/discovery/businesses/:id/suspend`
- `POST /api/discovery/businesses/:id/archive`

### Locations, categories and services

- `GET/POST /api/discovery/businesses/:id/locations`
- `PATCH /api/discovery/businesses/:id/locations/:locationId`
- `PUT /api/discovery/businesses/:id/locations/:locationId/hours`
- `PATCH /api/discovery/businesses/:id/settings`
- `GET /api/discovery/categories`
- `PUT /api/discovery/businesses/:id/categories`
- `GET/POST /api/discovery/businesses/:id/services`
- `PATCH /api/discovery/businesses/:id/services/:serviceId`
- `POST /api/discovery/service-requests`
- `GET /api/discovery/service-requests/:id`
- `POST /api/discovery/service-requests/:id/quotes`

### Trust, moderation and analytics

- `POST/GET /api/discovery/businesses/:id/reviews`
- `POST /api/discovery/businesses/:id/claims`
- `POST /api/discovery/reports`
- `POST /api/discovery/analytics/events`
- `GET /api/discovery/businesses/:id/analytics`
- `GET /api/discovery/moderation/claims`
- `POST /api/discovery/moderation/claims/:id/decision`
- `GET /api/discovery/moderation/reports`
- `POST /api/discovery/moderation/reports/:id/decision`

## Current hardening wave

- Lifecycle tests cover the mandatory `SUBMITTED -> UNDER_REVIEW -> APPROVED -> PUBLISHED` moderation path and reject skipped transitions.
- Store conversion is tested transactionally: an active commerce location is required, and a failed conversion leaves the Discovery business unbound and in `DISCOVERY_ONLY` mode.
- The canonical business ID and slug are preserved during conversion.

## Data safety

Discovery is additive and reuses the existing commerce model. No parallel product or inventory source of truth is introduced. Product discovery is derived from `products`, `product_variants`, `inventory_balances` and the canonical discovery business's `organization_id`.

Previously applied migrations remain untouched. Discovery schema is implemented by forward migrations `020` and `022`; migration `021` is not present in the repository and should not be assumed in deployment documentation. Subsequent platform migrations `023+` are independent of Discovery.


## Trust workflow hardening — 2026-09-20

- Verification applications are persisted with evidence, reviewer, decision reason and lifecycle status.
- Verification decisions update the canonical business verification status transactionally.
- Claim submission and moderation decisions emit trust audit events.
- New customer reviews enter PENDING moderation status.
- Review moderation decisions have dedicated history and trust audit records.
- Report decisions have dedicated status history and trust audit records.
- Verification/review/report moderation is tenant-scoped for tenant administrators and platform-wide for super administrators.
- Evidence payloads are bounded to prevent unbounded moderation metadata.
- Dedicated platform moderation UI remains a follow-up surface; the server-authoritative moderation APIs and merchant verification UI are implemented.


## Merchant trust center — 2026-09-20

- Added authenticated merchant endpoint: `GET /api/discovery/businesses/:id/trust`.
- The endpoint is protected by the existing server-authoritative `owned()` boundary and permits platform super admins for support/administration.
- The response is a privacy-safe merchant projection: verification application history, ownership-claim status, review moderation aggregates, reports affecting the business, trust timeline, and required actions.
- Reporter identities, report descriptions, moderation actor identities, private trust metadata, and claimant contact details are not exposed through the merchant projection.
- Added `DiscoveryTrustCenter` merchant workspace with verification resubmission entry point, platform decision reasons, claim history, review moderation visibility, report status, trust timeline, and explicit merchant-vs-platform responsibility guidance.
- Added regression coverage for the trust-center projection and privacy boundaries.


## Customer ownership claim tracking
- Added authenticated `GET /api/discovery/my-claims` returning only the caller's own ownership claims.
- Added `DiscoveryMyClaimsPage` at `/discover/my-claims` with pending/approved/rejected status, submission/review timestamps, and platform decision notes.
- Claimant privacy is preserved: the workspace never exposes other claimants or private moderation metadata.


## Customer workspace discoverability and service matching hardening
- Discovery header now exposes Saved Businesses, Service Requests, Contact Inquiries, and Business Claims shortcuts on desktop and mobile.
- Service cards can launch a request directly with the selected service preserved.
- Service requests now persist the requested service and service type when available.
- Matching uses service relevance, service-area radius, location signals, budget compatibility, deterministic scoring, and a 25-provider fan-out cap.
- Match records now include a reason such as REQUESTED_SERVICE, SERVICE_TYPE, or KEYWORD.
- Added isolated service-matching and 300-listing Discovery performance regression suites.
