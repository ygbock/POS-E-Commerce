# AbaCha Unified Commerce — Deployment Model & Architecture

> **Platform**: Render Cloud  
> **Applicable Version**: 2.6.x  
> **Status**: APPROVED  

---

## 1. Overview & Core Philosophy

The AbaCha deployment model guarantees reproducible, immutable deployments across development, staging, and production environments.

Deployments are strictly artifact-promoted:
```text
Staging Build & Verify (Release Tuple)
          ↓
Approved Commit SHA + Artifact Digest + Checksums
          ↓
Manual Production Gate Approval
          ↓
Production Deploy & Health Probe
```

Under no circumstances is code built or deployed directly to production from an unreviewed or unverified branch.

---

## 2. Infrastructure Architecture (Render Cloud)

```text
[ Client Traffic / HTTPS ]
           │
           ▼
[ Render Web Service ]
  - Node.js 20 LTS Runtime
  - Built Artifact: dist/server.cjs (Immutable Digest)
  - Public Source Maps: DISABLED
  - Environment: DEPLOY_ENV=production
           │
           ▼
[ Render Managed PostgreSQL 16 ]
  - TLS Enabled
  - Encrypted at Rest (AES-256)
  - Forward-Compatible Migrations 001–010
  - Continuous WAL Archiving & Daily Backups
```

### Component Details
1. **Render Web Service**:
   - Environment: `Node`
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm start` (`node dist/server.cjs`)
   - Auto-Deploy: **Disabled** on Production. Enabled via webhook from staging verification.
   - Health Probe: `/api/health` (HTTP 200 required, timeout 5s)
   - Readiness Probe: `/api/ready` (HTTP 200 required before traffic routing)

2. **Render Managed PostgreSQL**:
   - Engine: PostgreSQL 16
   - Plan: Standard or higher (with high availability and continuous backup enabled)
   - Connection: Managed `DATABASE_URL` with SSL mode `require`.

---

## 3. The Release Tuple Integrity Gate

Every deployment to staging and production is identified by an immutable Release Tuple:

$$\text{Release Tuple} = \langle \text{Commit SHA}, \text{Artifact Digest (SHA-256)}, \text{Schema Version}, \text{Migration Checksums} \rangle$$

1. **Commit SHA**: Exact Git commit SHA verified by CI.
2. **Artifact Digest**: `sha256sum dist/server.cjs`. Production promotion verifies that the artifact digest reproduced from the commit exactly matches the staging-approved digest.
3. **Schema Version**: Authoritative migration level (`010`).
4. **Migration Checksums**: SHA-256 digest of all files in `server/db/migrations/*.sql`.

---

## 4. Database Migration Safety Sequence

The deployment pipeline enforces a strict, fail-closed migration execution sequence:

```text
1. Backup / Snapshot Safety Check
         ↓
2. Pre-flight Migration Checksum Validation
         ↓
3. Migration Execution (npm run db:migrate)
         ↓
4. Schema Version Verification (_migrations)
         ↓
5. Application Container Deployment
         ↓
6. Health & Readiness Probing (/api/health, /api/ready)
```

### Safety Rules:
- **No Automatic Destructive Rollbacks**: PostgreSQL migrations are not automatically reverted on deploy failure. This avoids data loss from dropping columns or tables.
- **Forward Compatibility**: All database migrations must be written to be backward-compatible with the immediately preceding release (N-1 compatibility), allowing safe application rollback without schema reversion.
- **Checksum Verification**: `server/db/migrator.ts` verifies checksums of already-applied migrations. If an applied migration file was tampered with, migration halts immediately.

---

## 5. Rollback Procedure

In the event of an operational regression in production:

```text
Current Release (Regressed)
           ↓
Render Dashboard / CLI Rollback
           ↓
Roll back to Previous Verified Release Tuple (Commit SHA & Digest)
           ↓
Container Restart
           ↓
Automated Health Probe (/api/health)
           ↓
Readiness Probe (/api/ready)
           ↓
Operator Smoke Verification
```

Because migrations are strictly forward-compatible:
1. Do **NOT** run database rollbacks unless directed by a designated DBA.
2. The previous application release remains fully compatible with the current database schema.
3. Verify that `/api/health` returns `ready: true` and `database.connected: true`.
