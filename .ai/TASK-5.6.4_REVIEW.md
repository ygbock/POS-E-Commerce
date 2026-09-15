# TASK-5.6.4 Review & Hardening Report

**Date:** 2026-09-15  
**Branch:** `upgrade/v2.6/upg-001-platform-hardening`  
**Review status:** HARDENED — PENDING WORKSTATION/CI EXECUTION

## Findings

### F-01 — Archive state was not durable
**Severity:** High

The original implementation represented both suspended and archived tenants with `organizations.is_active = false`. This made an archived tenant indistinguishable from a suspended tenant and allowed lifecycle semantics to drift.

**Fix:** Migration `016_tenant_lifecycle_state_and_idempotency.sql` adds authoritative `organizations.lifecycle_status` with `active | suspended | archived`.

### F-02 — Lifecycle idempotency was only metadata
**Severity:** High

The original suspend/reactivate methods accepted an idempotency key but only recorded it in audit metadata. Replays were not backed by a durable idempotency ledger.

**Fix:** Added `platform_idempotency_keys`, scoped by operation + actor + key, with the canonical response stored transactionally. Provisioning now supports the same mechanism.

### F-03 — Provisioning silently fell back to Starter
**Severity:** High

An unavailable requested plan could silently result in a Starter subscription. This could create an organization whose `plan_tier` and subscription entitlements disagree.

**Fix:** Provisioning now fails with `PLAN_NOT_FOUND` when the requested canonical plan is missing or inactive.

### F-04 — Archived tenants could be reactivated
**Severity:** High

The original reactivation logic inferred state only from `is_active`, so an archived tenant could be treated as merely suspended.

**Fix:** Archived is terminal. Suspend/reactivate return `TENANT_ARCHIVED`; archive returns `TENANT_ALREADY_ARCHIVED` when repeated without an idempotency replay.

### F-05 — PATCH could mutate lifecycle/billing state outside the correct control plane
**Severity:** High

The legacy tenant PATCH endpoint could change `isActive` and `planTier` directly, bypassing lifecycle semantics and the billing-scoped plan-change operation.

**Fix:** PATCH synchronizes `isActive` with durable lifecycle state, refuses active-state changes for archived tenants, and refuses `planTier` mutations with `PLAN_CHANGE_REQUIRES_BILLING_PERMISSION`.

### F-06 — Reactivation could restore an expired billing period
**Severity:** Medium

A paused subscription whose trial/period had expired could be reactivated with a stale `current_period_end`.

**Fix:** Reactivation refreshes an expired billing period using the plan billing interval and clears cancellation flags.

### F-07 — Detail API swallowed subscription database errors
**Severity:** Medium

The original detail implementation converted any subscription lookup error into a null subscription, hiding control-plane inconsistencies.

**Fix:** Authoritative subscription lookup errors now propagate instead of returning a misleading partial view.

## Regression coverage added

The tenant provisioning suite now covers 16 scenarios, including:

- durable archived state
- archived tenant reactivation rejection
- archived PATCH rejection
- provisioning idempotency replay
- inactive canonical plan rejection
- archived tenant filtering

The operational migration gate now includes migration 016.

## CI gate hardening

The branch CI workflow now explicitly runs:

- platform authorization
- subscription foundation
- subscription limits
- platform subscription management
- tenant provisioning
- audit administration
- tenant business plane
- the complete `npm test` regression suite
- lint/build/source-map checks

## Verification boundary

The connected GitHub capability can inspect and modify the branch and can inspect GitHub Actions state, but it does not provide an arbitrary workstation shell runner. Therefore no claim is made here that the post-fix local commands have passed.

Required final execution on the workstation/CI runner:

```bash
npm run lint
npm run test:subscription-foundation
npm run test:subscription-limits
npm run test:platform
npm run test:platform-subscriptions
npm run test:tenant-provisioning
npm run test:operational
npm test
npm run build
git status
```

**TASK-5.6.5 must not begin until those post-fix gates pass.**
