# Discovery Frontend Search Results

## Status
FRONT-003 is implemented on the customer-facing `/discover/search` route.

## URL and API
The URL is the canonical search state. Search data comes from `discoveryApi.search()` and the existing `/api/discovery/search` contract. Search requests now accept an AbortSignal so obsolete frontend requests can be cancelled.

## Current API constraints
The current search API returns page-sized result arrays and exposes no reliable total-count field. It also does not accept a server-side sort parameter. The frontend therefore uses page-size detection for next/previous navigation and does not claim unsupported server-side ordering. No backend changes are made here.

## Filters
The search page exposes only Near me and Open now because those are supported by the current search endpoint. Unsupported delivery, pickup, category, and minimum-rating controls are intentionally hidden on this page rather than presenting controls that cannot affect the authoritative result.

## Resilience
- Independent Businesses, Products, and Services state in All mode.
- Loading, empty, network, authorization, validation, generic error, and 429 states.
- Obsolete requests cancelled with AbortController.
- No fake production data.

## Responsive and accessibility
Desktop uses a filter sidebar. Mobile uses a filter dialog/drawer. Search controls, tabs, result announcements, pagination, and the filter dialog are keyboard accessible.

## Privacy
Geolocation is requested only after explicit user interaction. Product rendering respects the existing public visibility fields.

## Future work
Business profiles and service-request workflows remain outside FRONT-003.