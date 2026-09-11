# AbaCha Unified Commerce — Environment Matrix & Isolation Contract

> **Target Version**: 2.6.x  
> **Status**: APPROVED  

---

## 1. Environment Comparison Matrix

| Property | Development | Test | Staging | Production |
| :--- | :--- | :--- | :--- | :--- |
| **`DEPLOY_ENV`** | `development` | `test` | `staging` | `production` |
| **`NODE_ENV`** | `development` | `test` | `production` | `production` |
| **Database Engine** | PostgreSQL 16 or PGlite (`.data/postgres`) | Isolated ephemeral PGlite | Dedicated Managed PostgreSQL 16 | Dedicated Managed PostgreSQL 16 |
| **Database Isolation** | Local only | Memory / Temp FS | Staging-only database instance | Production-only database instance |
| **Cross-DB Rule** | Cannot target staging or prod | Cannot target staging or prod | Rejects prod DB URL | Rejects staging / localhost URL |
| **`JWT_SECRET`** | High-entropy (dev fallback allowed) | High-entropy test secret | Dedicated Staging Secret (>= 32 chars) | Production Vault Secret (>= 32 chars, high entropy) |
| **`APP_URL`** | `http://localhost:3000` | `http://localhost:3000` | `https://staging-abacha.onrender.com` | `https://abacha-app.onrender.com` |
| **Public Source Maps** | Enabled (Vite HMR) | N/A | **DISABLED** (Blocked at Express router) | **DISABLED** (Blocked at Express router) |
| **Deployment Gate** | Direct developer workflow | Automated CI | `workflow_dispatch` / CI completion | GitHub Environment `production` (Manual Human Approval) |
| **Artifact Model** | Source / Hot Reload | In-memory execution | Immutable `dist/server.cjs` Digest | Exact Staging Digest Promotion |
| **Backup Policy** | Manual / Git clean | None (ephemeral) | Nightly snapshot | Daily backup + Continuous WAL (PITR) |
| **Monitoring** | Console output | Assertion logs | Datadog / Health Probes | 24/7 Probing + PagerDuty / On-Call Alerts |

---

## 2. Invariant Isolation Rules

1. **Zero Credential Sharing**:
   - `JWT_SECRET`, database passwords, and API keys must NEVER be shared between staging and production.
   - Any credential found in multiple environments must be treated as immediately compromised and rotated.
2. **Explicit Connection Routing**:
   - Staging environments must NEVER point to the production database cluster.
   - Production environments must NEVER point to staging or development database clusters.
   - The centralized environment validator (`server/config/environment.ts`) halts application startup if cross-environment database or URL targets are detected.
3. **Data Anonymization**:
   - Production database dumps must never be restored into development or staging without full PII and credential scrubbing.
   - Initial staging testing relies on synthetic smoke-test identities (`scripts/operator_bootstrap.ts`), not cloned production user accounts.
