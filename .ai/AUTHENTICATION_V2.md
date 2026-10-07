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

## Phase 3F — Authentication Operational Hardening

The authentication foundation now includes:

- Secure/HttpOnly browser session cookies with rotating refresh sessions.
- Refresh-token family reuse detection and session revocation.
- Password reset token hashing, transactional consumption, session invalidation, and a provider-neutral delivery boundary.
- Email verification token hashing, replay protection, and realm-specific enforcement.
- Platform-only TOTP MFA with encrypted secrets, recovery codes, short-lived challenges, and TOTP replay protection.
- Production/staging startup validation for authentication cryptographic material and delivery dependencies.
- Proxy-aware, server-derived rate-limit identity; arbitrary client-supplied forwarded-IP headers are not trusted directly.
- Production seeding is fail-closed and cannot be enabled through an environment override.

### Remaining operational work

1. Connect approved production email delivery providers to the password-reset and email-verification boundaries.
2. Add distributed rate limiting for horizontally scaled deployments using a shared store or trusted edge control.
3. Add platform MFA lifecycle management: disable/re-enroll, recovery-code regeneration, and controlled lost-authenticator recovery.
4. Expand authentication security-event coverage and anomaly detection across all four identity realms.
5. Complete end-to-end browser journeys for customer, business owner, staff, and platform operator authentication.
