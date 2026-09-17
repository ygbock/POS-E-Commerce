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

## Data safety

Discovery is additive and reuses the existing commerce model. No parallel product or inventory source of truth is introduced. Product discovery is derived from `products`, `product_variants`, `inventory_balances` and the canonical discovery business's `organization_id`.

Previously applied migrations remain untouched. Discovery changes are implemented as forward migrations `020`, `021` and `022`.
