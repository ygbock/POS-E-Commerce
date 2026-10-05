# AbaCha Discovery — Production Handoff Runbook

## Purpose

This runbook is the operational handoff for Discovery after PAGE-001 through PAGE-014 implementation and automated release validation.

## Current release posture

- PAGE-001–012: implementation complete.
- PAGE-013: automated production hardening gate passed.
- PAGE-014: automated release gate passed.
- Browser/manual production-like verification: **required before final release sign-off**.
- PAGE-015: documentation and operational handoff.

## Pre-release execution

Run from a clean checkout with the intended production-like environment configured:

```powershell
git pull --ff-only origin main
npm ci
npm run test:discovery
npm run test:discovery-search
npx tsc --noEmit
npm run build
npm test
npm run db:migrate
```

Do not treat a local pass as a substitute for CI. Record the release commit SHA and CI result.

## Deployment checks

After deployment:

1. Confirm application startup succeeds.
2. Confirm database migrations complete without checksum or pending-migration errors.
3. Confirm public Discovery routes load directly.
4. Confirm API responses contain expected rate-limit headers.
5. Confirm no production source maps are publicly served.
6. Confirm authentication redirects preserve intended Discovery destinations.
7. Confirm tenant/business authorization boundaries remain enforced.

## Critical customer paths

### Anonymous

`/discover → search → filters → business profile → product/service → contact/request`

Verify published visibility and confirm paused, suspended and archived records are not publicly discoverable.

### Authenticated customer

`sign in → save business → service request → timeline → quote comparison → acceptance`

Verify all workspace resources are scoped to the authenticated customer.

### Merchant

`business setup → readiness → submit → moderation → publish → public profile → pause/resume/archive`

For Discovery-and-Store businesses, verify Store navigation remains available and tenant-scoped.

### Platform moderation

`moderation queue → detail → approve/reject/publish/suspend → history`

Verify only authorized platform roles can perform platform moderation actions and that decisions leave the expected immutable history.

## Observability and incident response

Monitor at minimum:

- HTTP 4xx/5xx rates for Discovery routes.
- Rate-limit responses and abnormal request volume.
- Search latency and error rate.
- Business-profile/detail latency.
- Analytics ingestion failures.
- Database connection/migration failures.
- Authentication/authorization failures.
- Moderation lifecycle failures.

### Immediate rollback triggers

Treat the following as release blockers or rollback candidates:

- Public exposure of unpublished/suspended/archived listings.
- Cross-tenant or cross-customer data access.
- Unauthorized moderation mutation.
- Checkout/store behavior regression caused by Discovery changes.
- Database migration failure that prevents application startup.
- Sustained critical error rates on core Discovery journeys.
- Security-secret/source-map exposure.

## Manual verification record

The operator must record:

- Release commit SHA.
- CI workflow/run identifier.
- Deployment timestamp.
- Environment.
- Database migration result.
- Browser/device matrix.
- Manual test result.
- Known defects and severity.
- Release decision.
- Operator/date.

Do not mark PAGE-014 complete until the manual verification record is populated and all release-signoff criteria in `.ai/DISCOVERY_RELEASE_CHECKLIST.md` are satisfied.

## Ownership after handoff

Future Discovery changes should:

1. Add or update focused regression coverage.
2. Run the relevant focused suite.
3. Run `npm run test:discovery`.
4. Keep TypeScript/build/security gates green.
5. Update the Discovery tracker/checklist when release behavior changes.
6. Never mutate an applied database migration in place; add a new migration for schema changes.
