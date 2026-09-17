# AbaCha Discovery Home Documentation (FRONT-002)

## 1. Executive Summary

`FRONT-002 — Discovery Home` implements the canonical customer-facing Discovery landing page at `/discover`. It establishes the central hub where customers discover local businesses, store-backed products, and on-demand services across Sierra Leone and regional markets.

The implementation builds directly on the `FRONT-001` foundation, strictly adhering to the frontend-only boundary, zero-mock production data guarantee, independent resilient section loading, and full dark-mode compatibility.

---

## 2. Page Hierarchy & Structure

The Discovery Home page layout follows a clear visual and logical hierarchy:

```text
+-----------------------------------------------------------------------------------+
| 1. Discovery Header                                                               |
|    - Brand identity ("AbaCha Discovery")                                          |
|    - Return to Storefront button                                                  |
|    - Location picker trigger (GPS / manual city)                                  |
+-----------------------------------------------------------------------------------+
| 2. Hero Search Section                                                            |
|    - Primary Heading: "Discover what's near you"                                  |
|    - Subtitle explaining local commerce search                                    |
|    - DiscoverySearchBar with instant keyword suggestions                          |
|    - Popular search keyword chips ('groceries', 'restaurant', 'phone repair'...)   |
+-----------------------------------------------------------------------------------+
| 3. Search Controls & Filters                                                      |
|    - DiscoveryTabs: All | Businesses | Products | Services                        |
|    - DiscoveryFilters: Near me | Open now | Available today | Delivery | Pickup   |
|    - DiscoverySort: Relevance | Highest Rated | Most Reviews | A-Z                |
+-----------------------------------------------------------------------------------+
| 4. Explore Categories                                                             |
|    - Dynamically fetched categories from discoveryApi.getCategories()             |
|    - Touch-friendly and keyboard-navigable category pills                         |
|    - Skeletons during loading; graceful section error if request fails            |
+-----------------------------------------------------------------------------------+
| 5. Businesses Near You                                                            |
|    - Location-aware heading ("Businesses in Freetown" / "Businesses near you")   |
|    - Real API-derived BusinessCard grid                                           |
|    - "View all businesses" CTA                                                    |
+-----------------------------------------------------------------------------------+
| 6. Products Available Nearby                                                      |
|    - ProductDiscoveryCard grid                                                    |
|    - Respects merchant business settings (show_prices, show_stock_status)         |
|    - "View all products" CTA                                                      |
+-----------------------------------------------------------------------------------+
| 7. Services Near You                                                              |
|    - ServiceCard grid with area, duration, price estimate, and booking mode       |
|    - "Explore services" CTA                                                       |
+-----------------------------------------------------------------------------------+
| 8. Can't Find What You Need? (Service Request CTA)                                |
|    - Prominent customer callout banner                                            |
|    - "Post a Service Request" action opening RFQ modal                            |
+-----------------------------------------------------------------------------------+
```

---

## 3. Data Flow & API Usage

All Discovery Home operations communicate through `src/services/discoveryApi.ts` matching authoritative backend routes:

| Section | API Method | Endpoint | Description |
|---|---|---|---|
| Categories | `discoveryApi.getCategories()` | `GET /api/discovery/categories` | Dynamically loads active discovery taxonomy |
| Unified Search | `discoveryApi.search()` | `GET /api/discovery/search` | Performs multi-entity search with filters (`q`, `type`, `city`, `district`, `lat`, `lng`, `radiusKm`, `openNow`) |
| Service Requests | `discoveryApi.createServiceRequest()` | `POST /api/discovery/service-requests` | Submits customer quote requests (RFQs) to local merchants |

---

## 4. Section-Level State Handling (Independent Resilience)

Rather than wrapping the entire page in a single blocking global spinner or error screen, each content section handles data states independently:

1. **Categories**:
   - `loading`: Horizontal skeleton pills.
   - `error`: Inline compact retry notice that does not interrupt the rest of the page.
   - `empty`: Graceful empty text without breaking layout.
   - `loaded`: Interactive category buttons that toggle filtering.

2. **Businesses, Products & Services**:
   - `loading`: Section-specific skeleton card grids matching exact card geometries.
   - `empty`: Custom `DiscoveryEmptyState` with filter reset and quote posting.
   - `rate_limited`: `DiscoveryRateLimitState` with active countdown timer and retry CTA.
   - `error`: `DiscoveryErrorState` displaying diagnostics code, friendly message, and retry button.
   - `loaded`: Multi-column responsive cards (`BusinessCard`, `ProductDiscoveryCard`, `ServiceCard`).

---

## 5. URL State Synchronization

Discovery Home maintains deep URL synchronization with browser search parameters:

- `q`: Search query string.
- `type`: `all`, `businesses`, `products`, `services`.
- `city`: Selected city filter.
- `radiusKm`: Geolocation distance filter.
- `openNow`: Open now toggle.
- `delivery` / `pickup`: Fulfillment toggles.
- `categoryId`: Active category filter.
- `sort`: Sorting option (`relevance`, `rating`, `review_count`, `name_asc`, `newest`).

Users can bookmark, reload, and share filtered URLs (e.g. `/discover?city=Freetown&type=businesses`). Browser Back and Forward buttons update the UI state seamlessly via `popstate` listeners.

---

## 6. Location Experience

- Location detection via browser Geolocation is completely optional and never forced or silently gathered.
- Privacy disclosure: explicitly informs customers that GPS coordinates are used purely for proximity calculations and never shared directly with merchants.
- Fallback: Customers can easily select popular cities (Freetown, Bo, Kenema, Makeni, Waterloo) or input manual city/district names.
- Location-aware copy dynamically adapts:
  - If a city is active: *"Businesses in Freetown"*
  - If GPS is active: *"Businesses near you"*
  - If no location: *"Local Businesses"*

---

## 7. Responsive Design

- **Mobile (<640px)**: Stacked hero search, touch targets $\ge 44\text{px}$, horizontally scrolling category pills, one-column card feeds without horizontal page overflow, slide-out filter drawer.
- **Tablet (640px–1024px)**: 2-column business and service cards, 3-column product cards, balanced section spacing.
- **Desktop (>1024px)**: Spacious hero banner with ambient glow, 3-column business cards, 5-column product cards, sticky top header.

---

## 8. Accessibility & Dark Mode

- **Semantic HTML**: `<header>`, `<main>`, `<section>`, `<article>`, `<form>`, `<button>`.
- **Headings**: Single `<h1>` ("Discover what's near you") followed by logical `<h2>` and `<h3>` tags.
- **WAI-ARIA**: Tab list follows `role="tablist"`, `role="tab"`, `aria-selected` specifications with arrow key navigation.
- **Live Regions**: Result counts announced via `aria-live="polite"`.
- **Dark Mode**: Fully styled for both light mode and AbaCha dark mode (`bg-slate-950`, `border-slate-800`, `text-slate-100`) with consistent focus rings (`focus-visible:ring-2 focus-visible:ring-blue-500`).

---

## 9. Integration & Canonical Single-Surface Architecture

- **Storefront Integration**: `Storefront.tsx` renders `DiscoveryHome` when `route.name === 'discover'` or `route.name.startsWith('discover-')`. Customers can move back and forth between store catalog and discovery smoothly.
- **DiscoveryMarketplace Delegation**: `DiscoveryMarketplace.tsx` delegates directly to `DiscoveryHome`, ensuring there is only **one** canonical customer discovery experience across the platform.

---

## 10. Deferred Tasks (Handoff)

The following subsequent tasks remain deferred for future work:
- `FRONT-003` — Discovery Search Results (full dedicated search view with advanced filtering sidebar and pagination)
- `FRONT-004` — Business Profile (full merchant profile page with hours, branch list, reviews, directions)
- `FRONT-005` — Service Marketplace (RFQ dispatch, quote comparison, booking flow)
- `FRONT-006` — Get Listed (Merchant discovery onboarding wizard)
- `FRONT-007` — Business Discovery Dashboard (Merchant self-service portal)
- `FRONT-008` — Moderation UI (Admin verification, claim triage, abuse moderation)
- `FRONT-009` — Discovery-to-Store conversion
