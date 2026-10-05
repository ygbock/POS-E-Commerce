# AbaCha Discovery — Production Release Checklist

## Release state

- PAGE-001 through PAGE-012 implementation: complete.
- PAGE-013 automated production hardening: passed in CI.
- PAGE-014 automated release gate: passed in CI.
- PAGE-014 browser/manual verification: pending environment execution.
- PAGE-015 production handoff documentation: started.

## 1. Automated release gates

Run locally before release when the production-like database/environment is available:

```powershell
npm run test:discovery
npm run test:discovery-search
npx tsc --noEmit
npm run build
npm test
npm run db:migrate
```

CI must remain green for:

- TypeScript/lint.
- Production build.
- Source-map exposure guard.
- Discovery aggregate regression.
- Full regression suite.
- Security and authorization suites.
- Production database gate.

## 2. Public Discovery routes

Verify direct navigation, refresh, Back/Forward and shareable query state for:

- `/discover`
- `/discover/search`
- `/discover/business/:id`
- `/discover/service/:id`

Authenticated customer workspace routes should preserve their intended destination through login.

## 3. Anonymous customer journey

Verify:

1. Open Discovery anonymously.
2. Search for a published business.
3. Apply category/location/radius filters.
4. Open a business profile.
5. Open a product where available.
6. Open a service where available.
7. Contact the business.
8. Request a service where available.
9. Attempt authenticated workspace actions and confirm login redirect preserves the original destination.
10. Confirm unpublished, paused, suspended and archived listings are not publicly exposed.

## 4. Authenticated customer journey

Verify:

1. Sign in.
2. Save/remove a business.
3. Open saved businesses.
4. Submit/view a service request.
5. Review request timeline.
6. Compare provider quotes.
7. Accept a quote where applicable.
8. View contact inquiries.
9. View ownership claims.
10. Confirm every customer workspace action remains scoped to the authenticated user.

## 5. Merchant journey

Verify:

1. Create/configure a Discovery business.
2. Configure identity, category, location, hours and services.
3. Confirm readiness requirements are server-authoritative.
4. Submit for moderation.
5. Confirm rejection issues are visible when rejected.
6. Resubmit after correction.
7. Approve and publish through moderation.
8. Confirm the listing appears publicly.
9. Pause and resume the listing as owner.
10. Archive the listing.
11. For Discovery-and-Store businesses, verify Store navigation.
12. Confirm lifecycle history records actor/reason data.

## 6. Administrator journey

Verify:

1. Open moderation workspace.
2. Review listing queue and detail.
3. Approve/reject/publish/suspend listings.
4. Review verification queue.
5. Review ownership claims.
6. Moderate customer reviews.
7. Triage abuse reports.
8. Inspect moderation history.
9. Confirm tenant users cannot perform platform moderation actions without authorization.
10. Confirm moderation decisions generate the expected audit/trust history.

## 7. Data variants

The release environment should include or exercise:

- Published Discovery-only business.
- Published Discovery-and-Store business.
- Business with products.
- Business with services.
- Business without coordinates.
- Business with operating hours.
- Business with reviews.
- Empty result set.
- Paused listing.
- Suspended listing.
- Archived/non-published listing.
- Product with unavailable/zero stock.
- Service accepting requests.

## 8. Location and map verification

Verify:

- Manual city/district/region selection.
- Browser GPS with permission granted.
- GPS denied.
- GPS unavailable.
- Radius changes.
- Distance filtering.
- Businesses with coordinates.
- Businesses without coordinates.
- Map/list synchronization.
- Directions links.
- Map-service failure fallback.
- Location privacy messaging.
- Mobile map interaction does not trap normal page scrolling.

## 9. Responsive/accessibility verification

Verify at minimum:

- Mobile viewport.
- Tablet viewport.
- Desktop viewport.
- Keyboard-only navigation.
- Focus trapping in filter dialogs.
- Escape dismissal.
- Screen-reader labels.
- 44px touch targets.
- Reduced-motion preference.
- No horizontal overflow.
- Mobile navigation and filter drawer behavior.
- Dark mode.

## 10. Performance/resilience verification

Use browser/network instrumentation in a production-like environment to verify:

- Initial Discovery load timing.
- No duplicate API requests.
- Search remains submit-driven.
- Superseded searches are cancelled.
- Slow API responses do not blank unrelated Discovery sections.
- Network interruption produces recoverable error states.
- Failed product/business images render fallbacks.
- Pagination remains bounded.
- Public endpoints return rate-limit headers.
- Production bundle size remains acceptable against the release baseline.

## 11. Analytics verification

Confirm the browser generates and the server accepts the expected Discovery events:

- SEARCH
- IMPRESSION
- VIEW
- CONTACT
- DIRECTION_CLICK
- STORE_CLICK
- PRODUCT_VIEW
- SERVICE_VIEW
- SERVICE_REQUEST
- ORDER_CLICK

Verify event IDs are idempotent and analytics do not expose raw session identifiers.

## 12. Security release checks

Confirm:

- Public Discovery only exposes published/discoverable records.
- Customer APIs are user-scoped.
- Merchant operations are business-scoped.
- Platform moderation operations enforce platform permissions.
- Analytics target validation rejects inaccessible/unpublished targets.
- Rate limits are active on public Discovery endpoints.
- Production deployment contains no public source maps.
- No secrets are present in source or deployable artifacts.

## 13. Release sign-off

Do not mark PAGE-014 fully complete until:

- All automated CI gates are green.
- Browser/manual journeys above have been executed against the intended production-like environment.
- No P0/P1 Discovery defects remain.
- Direct URL refresh works.
- Real database data renders.
- Merchant-to-public lifecycle works end-to-end.
- Customer-to-store/service journeys work end-to-end.
- Security boundaries pass.
- No mock production data is required.

Record the final CI run/commit SHA and the operator/date of manual verification in the release record.
