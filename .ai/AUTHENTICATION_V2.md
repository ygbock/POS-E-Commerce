# AbaCha Authentication V2 — Identity & Access Architecture

## Objective

Authentication is split into four server-authoritative identity realms:

1. **Customer** — public commerce/discovery consumer account.
2. **Business Owner** — owns one or more discovery businesses and enters the merchant management plane.
3. **Staff** — tenant-scoped operational users such as admin, manager, cashier, inventory, purchasing and sales roles.
4. **Platform Operator** — system_owner/platform_admin/platform_support/platform_finance operating the SaaS control plane.

## Rules

- The browser never chooses its effective role or tenant.
- The server resolves identity, role, permissions and identity realm.
- Platform authentication uses a dedicated endpoint: `POST /api/auth/platform/login`.
- Normal tenant authentication uses `POST /api/auth/login`.
- Business-owner authentication remains available through the merchant boundary and is resolved against active business memberships.
- Platform operators are never selected through tenant selection.
- A tenant `super_admin` is a tenant administrator, not automatically a platform operator.
- `identity_type` is persisted independently from RBAC role.
- JWT sessions carry the server-authoritative identity realm.
- Existing bearer-token clients remain supported during migration.

## Current implementation

- Migration 061 adds `users.identity_type` and the customer role.
- `AuthService.loginPlatform()` enforces platform-role membership server-side.
- `/api/auth/platform/login` provides the dedicated control-plane login boundary.
- Frontend platform sign-in uses the dedicated endpoint.
- Request authentication exposes `req.auth.identityType`.
- Platform and tenant login tests are covered by `tests/auth_platform_boundary.test.ts`.

## Next hardening phase

1. Move browser sessions from localStorage JWTs to Secure/HttpOnly cookies.
2. Add rotating refresh sessions and device/session revocation.
3. Add explicit email verification and account recovery flows per identity realm.
4. Add platform MFA enforcement.
5. Add session management UI for users and platform operators.
6. Add login/audit events with rate-limit and anomaly controls.
7. Replace legacy persona/demo auto-login with an explicit development-only test harness.
8. Add end-to-end browser journeys for customer, business owner, staff and platform operator.
