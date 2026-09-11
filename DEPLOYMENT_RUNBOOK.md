# AbaCha Unified Commerce Platform — Production Deployment Runbook

> **Product Version**: 2.5.0-Stable  
> **Target Runtime**: Node.js v18+ / Docker Cloud Run  
> **Primary Database**: PostgreSQL (v14+ / Cloud SQL / Supabase)  
> **Backup Persistence**: Isolated PGlite (Disabled in production by default)  
> **Classification**: Restricted Operational Reference  

---

## 1. Prerequisites

Before initiating the production deployment sequence, verify that the following infrastructure components are provisioned and accessible:

1. **Hosting Node/Container Instance**: Supported on GCP Cloud Run, AWS ECS, Render, or any standard Linux environment running Node.js (v18.18.0 or higher is recommended).
2. **PostgreSQL Relational Database Instance**: High-availability instance (PostgreSQL 14 or higher). Requires standard schema ownership and connection credentials.
3. **Gemini API Access**: Valid API token from Google AI Studio.
4. **Local Port Ingress**: The application routes external traffic strictly through port `3000` via its reverse proxy layer.

---

## 2. Environment Variables Configuration

The application validates the environment configuration on startup. Create a secure `.env` file or populate your hosting environment parameters with the following definitions:

| Variable | Required? | Used By | Description / Recommended Security Setting |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | **Yes** | Server Core | Set to `production` for optimized bundler routing, minified static files, and full database safety guards. |
| `DATABASE_URL` | **Yes** | Database Client | Full, secure PostgreSQL connection string. Must include `sslmode=require` for secure remote environments. <br>*Example:* `postgresql://user:password@host:5432/dbname?sslmode=require` |
| `GEMINI_API_KEY` | **Yes** | AI Service | Your secret Gemini AI API Key from Google AI Studio. Required for backend intelligence. |
| `JWT_SECRET` | **Yes** | Auth System | A cryptographically secure, high-entropy secret string used to sign state-free authentication tokens (minimum 32 bytes). <br>*To generate:* `openssl rand -hex 32` |
| `JWT_EXPIRY` | No | Auth System | Lifespan of signed user session tokens in seconds. Defaults to `86400` (24 hours). |
| `APP_URL` | **Yes** | System Links | The canonical public host URL where this application is accessible. Crucial for secure CORS routing and origin mapping. <br>*Example:* `https://abacha-retail.example.com` |
| `PORT` | No | Express Server| Port where the Express application binds. Hardcoded to `3000` inside our platform container. |

---

## 3. Pre-Deployment Database Migrations

Our server handles incremental relational migrations automatically at startup, but for production environments, executing them inside your isolated build or CI/CD deployment pipeline is recommended for safety.

### A. Run Database Migrations
Execute the built-in migration command directly on your build host:
```bash
# Compile and execute the SQL migrations in deterministic order
npm run db:migrate
```
*Note: This command reads sql files sequentially from `/server/db/migrations/` and updates the `applied_migrations` schema tracking table. This migration is fully non-destructive; it never drops tables or overwrites existing production data.*

### B. Post-Migration Schema Verification
You can audit the current schema state using the secure admin endpoint once authenticated as a `SuperAdmin`:
`GET /api/admin/db-status`
*Expected Output:*
```json
{
  "success": true,
  "data": {
    "connected": true,
    "engine": "postgresql",
    "schemaVersion": "010",
    "hasError": false,
    "error": null
  }
}
```

### C. Migration Rollback & Disaster Considerations
Our migration scripts use standard PostgreSQL transaction envelopes. If a migration step encounters a database error or network connection drop, the entire migration script is rolled back automatically using `ROLLBACK` to preserve consistency. 
*   **Manual Intervention**: To roll back a schema change, connect to your PostgreSQL console and execute an appropriate inverse DDL statement. Do not modify previous `.sql` migration files in Git directly.

---

## 4. Compilation & Production Build Sequence

Execute the production build to compile frontend React assets and bundle the backend Express server into a standalone ES-module bundle:

```bash
# 1. Install production-ready locked dependencies
npm ci

# 2. Compile and bundle Vite frontend + esbuild server
npm run build
```

This sequence produces the following final artifacts in the `/dist` directory:
- `dist/index.html` — The main index entry point.
- `dist/assets/` — Minified, hashed client CSS and JS chunks.
- `dist/server.cjs` — A standalone bundled CommonJS server file containing the compiled backend routing, repositories, and services.
- `dist/server.cjs.map` — Accompanying source maps for runtime debugging.

---

## 5. Startup & Ingress Execution

Start the standalone backend server on the container:
```bash
# Directly starts the compiled CommonJS server via node
npm start
```
*Expected Terminal Logs:*
```text
[AbaCha DB] Connected (postgresql). Schema: 010
[AbaCha Server] Running in production mode
[AbaCha Server] Listening on Port 3000
```

---

## 6. Operational Health & Readiness Probes

Integrated probes are available to allow load balancers, orchestrators (Kubernetes/Cloud Run), and status pages to query the health of the system.

### A. Liveness Health Check Probe
- **Endpoint**: `GET /api/health`
- **Behavior**: Verifies general container status and checks database connection responsiveness.
- **Success Response (HTTP 200)**:
  ```json
  {
    "status": "ok",
    "ready": true,
    "service": "Centralized Product Service",
    "version": "2.4.0",
    "database": { "connected": true, "engine": "postgresql", "schemaVersion": "010" }
  }
  ```
- **Failure Response (HTTP 503)**:
  ```json
  {
    "status": "unhealthy",
    "ready": false,
    "service": "Centralized Product Service",
    "database": { "connected": false }
  }
  ```

### B. Readiness Probe
- **Endpoint**: `GET /api/ready`
- **Behavior**: Checks if the database is responding to active queries before accepting client traffic.
- **Success Response (HTTP 200)**:
  ```json
  { "ready": true, "status": "ready", "database": { "connected": true, "engine": "postgresql", "schemaVersion": "010" } }
  ```
- **Failure Response (HTTP 503)**:
  ```json
  { "ready": false, "status": "unready", "database": { "connected": false } }
  ```

*Security Invariant: These public endpoints never expose environment variables, connection URLs, master credentials, database passwords, or raw system stack traces in their payloads.*

---

## 7. Production Database Safety & Fallback Rules

To protect customer-authored records, the platform enforces strict fail-closed database conditions:

1. **Fail-Closed Fallback Prevention**: When `NODE_ENV=production` is set, the application **absolutely forbids** falling back to PGlite or an embedded local database folder if PostgreSQL fails to connect. The server will print a fatal log and abort startup with a non-zero exit code to alert administrators.
2. **Separation of Demo Data**: Production startup scripts **never** auto-seed demonstration fixtures or test datasets. Seeding is decoupled and lives strictly inside dev scripts (`npm run seed:dev`), ensuring live customer stores always boot into a clean, authoritative state.
3. **No Default Accounts**: The server does not auto-create default administrator or cashier accounts on startup. Authorized staff credentials must be created by administrators during initial onboarding sequences.

---

## 8. Backup & Recovery Operations

> ### **CRITICAL DIRECTIVE**  
> **DATABASE BACKUP CONFIGURATION MUST BE ACTIVE BEFORE LOADING LIVE CUSTOMER DATA.**

### A. Backup Ownership & Routine
- **Owner**: Hosting Operations Team / Database Administrator (DBA).
- **Frequency**: Daily logical backup (using `pg_dump`) plus continuous write-ahead logging (WAL) archiving for Point-In-Time Recovery (PITR).
- **Retention**: Keep daily backups for 30 days, weekly backups for 12 weeks, and monthly backups for 1 year in geographically redundant storage.

### B. Manual Backup Script Example
Execute the following utility command on your database proxy host:
```bash
# Perform a logical, compressed backup of the commerce database
pg_dump -U $PGUSER -h $PGHOST -p $PGPORT -F c -b -v -f abacha_backup_$(date +%F).dump $PGDATABASE
```

### C. Recovery and Verification
- Set up a weekly automated restoration test that imports the backup dump into an isolated staging database and runs `npm run test:db` to verify schema and data integrity automatically.

---

## 9. Rollback Runbook (Disaster Recovery)

If a production release registers critical errors (such as high HTTP 500 error rates or container crash loops):

1. **Revert Application Build**: Redeploy the previous verified docker image tag or Git commit in your hosting control panel. This instantly restores the frontend bundle and server logic.
2. **Assess Database Schema**:
   - If database schema changes are backwards-compatible (which is true for all migrations up to `010`), **do not roll back the database schema**. The older server code will continue running safely against the newer database schema.
   - If a rollback of schema is absolutely required, manually execute the inverse SQL statements (e.g., drop newly added tables or columns) on the PostgreSQL instance. Ensure a backup is taken before executing manual database operations!

---

## 10. Known Limitations

1. **Promotion Coupons Checkout Integration**: Coupon codes applied in the storefront UI are verified locally. Checkout payloads passed to `POST /api/orders` omit coupon integration until the database promotions schema is fully established.
2. **CRM Sync for Direct Registration**: Storefront guest users can sign up and browse local profiles. Syncing new storefront shopper records to the central PostgreSQL `customers` table is deferred to a future integration task.
