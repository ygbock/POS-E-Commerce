# AbaCha Discovery — Release Sign-Off Record

## Status

**Automated CI:** PASSED (user-confirmed for the current release state).

**Manual/browser verification:** PENDING execution against the intended production-like environment.

**Release decision:** NOT YET FINAL — awaiting operator evidence.

## Automated evidence

Record the final values when available:

| Gate | Result | Evidence |
|---|---|---|
| `npm run test:discovery` | CI passed | CI workflow |
| Discovery search regression | CI passed | CI workflow |
| TypeScript / lint | CI passed | CI workflow |
| Production build | CI passed | CI workflow |
| Security / secret scan | CI passed | CI workflow |
| Full regression | CI passed | CI workflow |
| Production migration gate | CI passed | CI workflow |

## Manual evidence required

### Customer

- [ ] Anonymous Discovery journey.
- [ ] Authenticated customer journey.
- [ ] Business profile and product/service navigation.
- [ ] Contact and service-request flow.
- [ ] Customer workspace authorization.

### Merchant

- [ ] Discovery business setup/readiness.
- [ ] Submit → moderation → publish.
- [ ] Public listing visibility.
- [ ] Pause → resume.
- [ ] Archive.
- [ ] Discovery-and-Store navigation.
- [ ] Lifecycle history.

### Administrator

- [ ] Listing moderation.
- [ ] Verification queue.
- [ ] Ownership claims.
- [ ] Reviews/reports.
- [ ] Moderation history.
- [ ] Unauthorized moderation attempt rejected.

### Responsive/accessibility

- [ ] Mobile.
- [ ] Tablet.
- [ ] Desktop.
- [ ] Keyboard navigation.
- [ ] Screen-reader labels.
- [ ] Focus trap/Escape.
- [ ] Reduced motion.
- [ ] No horizontal overflow.

### Resilience/performance

- [ ] Initial load measured.
- [ ] Duplicate requests checked.
- [ ] Slow/interrupted network behavior checked.
- [ ] Failed image fallback checked.
- [ ] Search cancellation checked in browser.
- [ ] Production bundle baseline reviewed.
- [ ] Rate-limit behavior observed.

## Release metadata

- Release commit SHA: ______________________________
- CI workflow/run ID: ______________________________
- Environment: _____________________________________
- Deployment timestamp: _____________________________
- Database migration result: _________________________
- Browser/device matrix: _____________________________
- Operator: _________________________________________
- Verification date: _________________________________

## Defects

| ID | Severity | Description | Disposition |
|---|---|---|---|
| | | | |

P0/P1 defects must block release unless explicitly waived by the release owner.

## Final decision

- [ ] RELEASE
- [ ] RELEASE WITH DOCUMENTED WAIVER
- [ ] HOLD / FIX REQUIRED

### Sign-off

Release owner: ____________________  
Date: _____________________________  
Notes: ____________________________

A final release must not be marked complete merely because CI is green; the manual evidence above must be recorded for the production-like environment.
