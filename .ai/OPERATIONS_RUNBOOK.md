# AbaCha Unified Commerce — Operations Runbook

> **Target Version**: 2.6.x  
> **Audience**: Platform Operators, DevOps Engineers, and DBAs  
> **Classification**: INTERNAL OPERATIONAL SPECIFICATION  

---

## 1. Routine Deployment Workflow

### Step 1: Staging Promotion
1. Once CI passes on `main`, navigate to **GitHub Actions → Staging Deployment & Verification Pipeline**.
2. Click **Run workflow**, enter the target commit SHA (or leave blank to use HEAD of `main`).
3. Monitor execution:
   - Migration checksum verification
   - Build of `dist/server.cjs` and artifact digest generation
   - Render Staging deployment hook trigger
   - Automated health/ready probes
4. Download the `staging-release-tuple` artifact and record the `DEPLOY_SHA` and `ARTIFACT_DIGEST`.

### Step 2: Production Manual Approval & Promotion
1. Navigate to **GitHub Actions → Production Promotion & Approval Gate**.
2. Click **Run workflow** and input:
   - `approved_commit_sha`: Exact SHA from the staging release tuple.
   - `approved_artifact_digest`: Exact SHA-256 digest from the staging release tuple.
3. Designated human reviewers must approve the deployment request in the GitHub `production` environment modal.
4. The workflow verifies digest reproduction, triggers Render production deployment, and confirms health probes.

---

## 2. Secure Operational Onboarding Procedure

### First Admin Account Bootstrap (Clean Database)
When bootstrapping an initial organization without existing users:

1. On a secure workstation with repository access, generate the bootstrap SQL:
   ```bash
   npx tsx scripts/operator_bootstrap.ts smoke
   ```
2. The utility outputs:
   - SQL statements to create initial tenants (`organizations`), store branches (`locations`), and users (`users`).
   - Cryptographically random, high-entropy plain passwords to stdout.
3. **Immediately copy plain passwords into the Customer Secret Manager / Vault** (e.g. 1Password, Bitwarden, AWS Secrets Manager).
4. Connect to Render PostgreSQL via the secure Render Dashboard SQL console or authorized `psql` connection:
   ```bash
   psql "$DATABASE_URL" -f <(npx tsx scripts/operator_bootstrap.ts smoke)
   ```
5. Log in via `POST /api/auth/login` using the generated admin credentials to verify access.

### Post-Smoke Account Cleanup & Session Revocation
Immediately after staging or production smoke testing is complete:

1. Generate revocation SQL:
   ```bash
   npx tsx scripts/operator_bootstrap.ts revoke
   ```
2. Execute against target PostgreSQL:
   ```sql
   BEGIN;
   UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP 
   WHERE id IN ('usr_smoke_admin', 'usr_smoke_cashier', 'usr_smoke_rival_admin');

   DELETE FROM revoked_tokens 
   WHERE user_id IN ('usr_smoke_admin', 'usr_smoke_cashier', 'usr_smoke_rival_admin');
   COMMIT;
   ```
3. Verify that subsequent login attempts return HTTP 401 (`User account is deactivated`).

---

## 3. Credential Rotation Runbook

### Rotating JWT_SECRET:
1. Generate a new 64-character high-entropy secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Update `JWT_SECRET` in Render Dashboard Environment Settings.
3. Trigger service restart.
4. Existing JWT tokens are invalidated automatically (stateless HMAC verification fails), requiring users to log in again.

### Rotating User Passwords:
1. Authenticated Admin: Use `PATCH /api/users/:id` with new password payload.
2. Direct Operator SQL:
   ```bash
   npx tsx -e "const { hashPassword } = require('./server/auth/password'); const { hash, salt } = hashPassword('NewSecurePassword123!'); console.log('UPDATE users SET password_hash = \'' + hash + '\', password_salt = \'' + salt + '\' WHERE id = \'usr_id\';');"
   ```

---

## 4. Emergency Rollback Procedure

When an unrecoverable bug or severe outage occurs post-deployment:

1. Open **Render Dashboard → Web Service (`abacha-app`) → Deploys**.
2. Identify the previous release with status `Live` prior to the incident.
3. Click the three dots `...` next to the prior release and select **Rollback to this deploy**.
4. Confirm rollback. Render starts the prior container artifact within 30–60 seconds.
5. Verify health:
   ```bash
   curl -i https://abacha-app.onrender.com/api/health
   curl -i https://abacha-app.onrender.com/api/ready
   ```
6. **Do NOT rollback PostgreSQL schema** unless an explicit data-corruption incident requires restoring a backup snapshot.
