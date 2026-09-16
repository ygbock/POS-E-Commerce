# UPG-001 — Production Operations & Platform Hardening Specification

> **Program**: `VERSION-2.6-UPGRADE`  
> **Target Version**: `2.6.0-development`  
> **Target Branch**: `upgrade/v2.6/upg-001-platform-hardening`  
> **Production Release Baseline**: `9ae4b7528aecd195a9167e1b2a060513cbf83223` (FROZEN)  
> **Base Documentation HEAD**: `b0a68954ee09ef5e39578df2cbb7041c76eed20f`  
> **Status**: IMPLEMENTED  

---

## 1. Architectural Mission & Objectives

The primary objective of UPG-001 is to harden the platform's operational architecture so that future 2.6 features can be developed, tested, deployed, monitored, backed up, and rolled back safely.

```text
Development
     ↓
Staging
     ↓
Verification & Approval Gate
     ↓
Production
```

### Core Tenets
1. **Strict Environment Separation**: Distinct database, credentials, `APP_URL`, and secrets across `development`, `test`, `staging`, and `production`. Zero credential sharing.
2. **Immutable Promotion**: Staging builds an immutable artifact (`dist/server.cjs`) whose SHA-256 digest and commit SHA are verified. Production promotes the exact verified artifact rather than rebuilding from an unverified branch.
3. **Migration Integrity Gate**: The release tuple binds `Commit SHA + Artifact Digest + Schema Version + Migration Checksums`. Migrations must remain forward-compatible.
4. **Zero Production Backdoors**: Bootstrap and smoke testing rely exclusively on controlled operator/DBA workflows (`scripts/operator_bootstrap.ts`), never unauthenticated endpoints or persistent plaintext credentials.
5. **Defense-in-Depth Secret Protection**: Multi-layer secret scanning (git tracking, diff audits, and Gitleaks CI action). Public source maps (`*.map`) are explicitly blocked from public HTTP access.

---

## 2. Environment Identity & Runtime Configuration Contract (`UPG-001A`)

Implemented via [`server/config/environment.ts`](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/server/config/environment.ts):

* **Explicit Identity**: `DEPLOY_ENV` accepts `'development' | 'test' | 'staging' | 'production'`.
* **Runtime Rules**:
  - `PORT`: Valid integer between 1 and 65535.
  - `DATABASE_URL` / `PGHOST`: Required in staging and production.
  - **PGlite Prohibition**: Embedded PGlite is rejected in production environments.
  - **Cross-Environment Guards**:
    - Staging rejects configuring `PRODUCTION_DATABASE_URL` or production `APP_URL` (`https://abacha-app.onrender.com`).
    - Production rejects configuring `STAGING_DATABASE_URL`.
  - `JWT_SECRET`: Mandatory in staging and production. Minimum 32 characters, high entropy, case-insensitively rejects dev/default strings (`dev`, `default`).
  - `APP_URL`: Must enforce `https://` in staging and production.
* **Sanitized Reporting**: `getSanitizedEnvironmentReport()` surfaces configuration status without ever exposing secret values in logs or exception messages.

---

## 3. CI/CD Pipeline & Promotion Model (`UPG-001B` / `UPG-001C` / `UPG-001D`)

### Pull Request & CI Validation ([`.github/workflows/ci.yml`](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/.github/workflows/ci.yml))
* Triggers on pull requests to `main` and pushes to `upgrade/**`.
* Enforces `npm ci`, `npm run lint` (`tsc --noEmit`), and `npm run build`.
* Executes 12 discrete authoritative domain regression suites:
  1. Persistence (`test:db`)
  2. Auth & Security Boundaries (`test:security`)
  3. Server-Authoritative Inventory (`test:inventory`)
  4. Transfer Immutability (`test:transfer`)
  5. Server-Authoritative POS Engine (`test:pos`)
  6. API Hardening & Idempotency (`test:api`)
  7. End-to-End QA Verification (`test:qa`)
  8. UX Accessibility & Hotkeys (`test:ux`)
  9. Storefront Checkout Integrity (`test:checkout`)
  10. Offline POS Sync (`test:offline-pos`)
  11. Production Database Gate (`test:prod-gate`)
  12. Operational Platform Hardening (`test:operational`)
* Multi-layer secret scanning via Gitleaks action.
* Fails closed.

### Staging Deployment & Verification ([`.github/workflows/staging-deploy.yml`](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/.github/workflows/staging-deploy.yml))
* Triggered via `workflow_dispatch` or `workflow_run` upon successful CI completion on `main` / `staging`.
* Generates Release Tuple (`Commit SHA + Artifact Digest + Schema Version + Migration Checksums`).
* Deploys to Render Staging service.
* Verifies `/api/health` and `/api/ready` with exponential backoff.
* Emits verified release tuple artifact.

### Production Promotion & Manual Approval ([`.github/workflows/production-deploy.yml`](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/.github/workflows/production-deploy.yml))
* Manual `workflow_dispatch` requiring `approved_commit_sha` and `approved_artifact_digest`.
* Protected by GitHub Environment `production` requiring designated human reviewers.
* Verifies branch governance (strictly `main` or release tags; never arbitrary feature branches).
* Reproduces and matches artifact SHA-256 digest against approved staging digest.
* Verifies migration files SHA-256 checksums.
* Deploys to Render Production service and verifies `/api/health` and `/api/ready`.

---

## 4. Disaster Recovery & Backup Integrity (`UPG-001E`)

Implemented via [`scripts/verify_backup_restore.ts`](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/scripts/verify_backup_restore.ts) and [`.ai/DISASTER_RECOVERY.md`](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/.ai/DISASTER_RECOVERY.md):

* Explicit classification:
  - `LOCAL RESTORE TEST`: Validates schema, migration sequence, table existence, and test queries. Includes mandatory disclaimer that local tests do NOT prove Render PITR operational.
  - `CUSTOMER STAGING RESTORE TEST`: Validates staging snapshot restores.
  - `CUSTOMER PRODUCTION RESTORE TEST`: Dedicated rehearsal copy validation.
* Policy: Daily backups, 30-day retention, AES-256 encryption, off-site replication, point-in-time recovery (PITR).

---

## 5. Operational Monitoring & Alerting (`UPG-001F`)

Documented in [`.ai/MONITORING.md`](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/.ai/MONITORING.md):

* **Probes**: `/api/health` (liveness + database engine + schema version), `/api/ready` (traffic acceptance).
* **Metrics**: Availability (> 99.9%), latency (p95 < 500ms), HTTP 5xx errors, connection pool saturation, process restarts.
* **Alert Payloads**: Strictly sanitized (service, environment, severity, timestamp, failure signal). Zero credential or customer data disclosure.

---

## 6. Secure Operator Onboarding Lifecycle (`UPG-001G`)

Implemented via [`scripts/operator_bootstrap.ts`](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/scripts/operator_bootstrap.ts) and [`.ai/OPERATIONS_RUNBOOK.md`](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/.ai/OPERATIONS_RUNBOOK.md):

* Uses canonical PBKDF2 application hashing (`server/auth/password.ts`).
* Emits temporary credentials only to stdout with explicit instructions for immediate entry into the customer secret vault.
* Never commits credentials or writes permanent plaintext passwords to disk.
* Includes immediate deactivation and token revocation SQL commands for post-verification cleanup.

---

## 7. Operational Tests (`UPG-001H`)

Implemented via [`tests/operational_hardening.test.ts`](file:///c:/Users/SAHR/OneDrive%20-%20DreamDay%20Technology/Documents/GitHub/POS-E-Commerce/tests/operational_hardening.test.ts):

* 100% deterministic, offline execution requiring zero live cloud services or secrets.
* 12 automated test cases verifying:
  - `DEPLOY_ENV` handling & fallback mapping
  - PORT validation
  - JWT secret length and keyword restrictions
  - Staging vs Production cross-environment boundaries
  - Sanitized configuration reporting
  - Public source map blocking (`GET /server.cjs.map` -> HTTP 404)
  - Safe health/readiness telemetry
  - Migration checksum consistency across 001–010
  - CI workflow structure and gate completeness
