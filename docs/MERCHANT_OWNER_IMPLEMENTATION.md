# AbaCha Business Owner Signup & Merchant Portal

## Implemented

Business owners now have a first-class account and merchant workspace.

### Signup

- `POST /api/merchant/signup`
- Creates a platform merchant workspace organization.
- Creates a `business_owner` user.
- Creates the initial Discovery business.
- Creates the Discovery settings record.
- Creates an OWNER business membership.
- Creates a starter trial subscription when available.
- Returns a server-issued JWT so the owner can enter the portal immediately.

### Business modes

- `DISCOVERY_ONLY`: owner workspace organization exists for identity/session isolation, but the Discovery business remains tenantless.
- `DISCOVERY_AND_STORE`: the Discovery business is attached to the owner's commerce organization and can progress into store provisioning.

### Merchant APIs

- `GET /api/merchant/me`
- `GET /api/merchant/businesses/:id`
- `POST /api/merchant/businesses`

### Discovery ownership

Discovery business membership is stored in:

- `discovery_business_memberships`

Membership roles:

- OWNER
- MANAGER
- STAFF

The Discovery business console now resolves an authenticated owner's businesses through:

- `GET /api/discovery/businesses/my`

and business management accepts the `business_owner` role for tenant-bound owner workspaces.

## Frontend

- `/business/signup` — Business Owner Signup
- `/business` — Merchant Portal
- `/business/:businessId` — Existing Discovery Business Console for that owner

The portal exposes the existing Discovery onboarding, listing readiness, submission/review, verification, locations, services, reviews and analytics surfaces rather than creating a parallel Discovery implementation.

## Initial lifecycle

```
Signup
  ↓
Business Owner account
  ↓
Business created as DRAFT
  ↓
Merchant Portal
  ↓
Discovery onboarding
  ↓
Readiness complete
  ↓
Submit for review
  ↓
UNDER_REVIEW
  ↓
APPROVED / REJECTED
  ↓
PUBLISHED
```

For `DISCOVERY_AND_STORE`, store provisioning can subsequently attach the commerce capabilities to the same organization.

## Test

`npm run test:merchant-owner`
