# AbaCha Unified Commerce — Disaster Recovery & Backup Policy

> **Applicable Version**: 2.6.x  
> **Recovery Time Objective (RTO)**: < 1 Hour  
> **Recovery Point Objective (RPO)**: < 5 Minutes  
> **Status**: APPROVED  

---

## 1. Backup Strategy & Architecture

AbaCha enforces an automated, multi-tiered database backup strategy:

```text
[ Active PostgreSQL 16 (Render Managed) ]
                │
                ├────────────────────────────────┐
                ▼                                ▼
       [ Automated Daily Backups ]      [ Continuous WAL Archiving ]
        - Retention: 30 Days             - Point-in-Time Recovery (PITR)
        - Encrypted at Rest (AES-256)    - Granularity: < 5 min RPO
        - Geographically Replicated
```

### Policy Specifications
* **Frequency**: Automated daily full snapshots + continuous WAL streaming.
* **Retention Period**: Minimum 30 days of rolling backups.
* **Encryption**: AES-256 encryption at rest; TLS 1.3 encryption in transit.
* **Storage Isolation**: Backups are isolated from the primary database compute cluster.

---

## 2. Restore Verification Tiering

Per supervisor governance mandate, all backup restoration tests must be explicitly labeled and categorized:

```text
┌──────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Scope Category                   │ Authoritative Meaning                                  │
├──────────────────────────────────┼────────────────────────────────────────────────────────┤
│ LOCAL RESTORE TEST               │ Validates schema, migration DDL, and queries locally.  │
│                                  │ DOES NOT prove cloud provider PITR operational.        │
├──────────────────────────────────┼────────────────────────────────────────────────────────┤
│ CUSTOMER STAGING RESTORE TEST    │ Restores snapshot into staging database.               │
│                                  │ Confirms staging recovery procedure operational.       │
├──────────────────────────────────┼────────────────────────────────────────────────────────┤
│ CUSTOMER PRODUCTION RESTORE TEST │ Restores snapshot into isolated rehearsal DB clone.     │
│                                  │ Never executed directly over active production.        │
└──────────────────────────────────┴────────────────────────────────────────────────────────┘
```

### Executing Local Verification:
```bash
npx tsx scripts/verify_backup_restore.ts
```
Expected output:
```text
SCOPE:                    LOCAL_RESTORE_TEST
Database Engine:          embedded-pglite
Schema Version:           010
Migrations Verified:      10
Tables Verified:          12 tables
Tenant Integrity:         PASS
Sample Query:             PASS
```

---

## 3. Disaster Recovery Runbook (Production Outage)

### Scenario A: Accidental Data Corruption or Unintended Mutation
1. Identify the timestamp $T_{\text{corrupt}}$ immediately preceding the incident.
2. In the Render Dashboard, select **PostgreSQL Database → Backups → Point-in-Time Recovery**.
3. Select recovery point $T_{\text{corrupt}} - 2 \text{ minutes}$.
4. Spin up a new target database instance from the PITR point.
5. Verify schema version and row counts on the recovered instance:
   ```bash
   DATABASE_URL="$RECOVERED_URL" npx tsx scripts/verify_backup_restore.ts
   ```
6. Update `DATABASE_URL` on the Render Web Service to the recovered instance.
7. Restart the service and probe `/api/health` and `/api/ready`.

### Scenario B: Complete Datacenter / Regional Loss
1. Deploy a new PostgreSQL cluster in the secondary region from off-site backup.
2. Run database migration verification:
   ```bash
   DATABASE_URL="$NEW_DB_URL" npm run db:migrate
   ```
3. Deploy the application service using the approved Release Tuple (`dist/server.cjs`).
4. Execute smoke verification to confirm tenant isolation, auth, and order processing.
