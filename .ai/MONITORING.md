# AbaCha Unified Commerce — Operational Monitoring & Alerting Contract

> **Target Version**: 2.6.x  
> **Status**: APPROVED  

---

## 1. Operational Probing Endpoints

AbaCha exposes two authoritative HTTP diagnostic probes:

### 1. `/api/health` — System Health & Component Metadata
* **Method**: `GET`
* **Success Response (HTTP 200)**:
  ```json
  {
    "status": "ok",
    "ready": true,
    "service": "Centralized Product Service",
    "version": "2.4.0",
    "uptime": 1420.5,
    "timestamp": "2026-09-11T21:00:00.000Z",
    "database": {
      "connected": true,
      "engine": "postgresql",
      "schemaVersion": "010",
      "migrationsCount": 10
    }
  }
  ```
* **Failure Response (HTTP 503)**:
  ```json
  {
    "status": "unhealthy",
    "ready": false,
    "service": "Centralized Product Service",
    "version": "2.4.0",
    "uptime": 1420.5,
    "timestamp": "2026-09-11T21:00:00.000Z",
    "database": {
      "connected": false
    }
  }
  ```
* **Security Guard**: Never returns database connection URLs, passwords, JWT secrets, filesystem paths, or stack traces.

### 2. `/api/ready` — Ingress Traffic Acceptance Probe
* **Method**: `GET`
* **Purpose**: Used by ingress routers / load balancers to determine whether traffic should be routed to this instance.
* **Responses**:
  - `HTTP 200`: `{"ready": true, "status": "ready", "database": {"connected": true, "engine": "postgresql", "schemaVersion": "010"}}`
  - `HTTP 503`: `{"ready": false, "status": "unready", "database": {"connected": false}}`

---

## 2. Key Metrics & Recommended Thresholds

| Metric | Measurement | Warning Threshold | Critical Threshold | Action |
| :--- | :--- | :--- | :--- | :--- |
| **Availability** | % of successful HTTP responses | < 99.9% | < 99.0% | Page on-call; check health probe |
| **P95 Latency** | Request duration (all `/api` routes) | > 500ms for 5 min | > 1500ms for 3 min | Inspect DB query latency & connection pool |
| **HTTP 5xx Rate** | % of requests returning 500–599 | > 1% for 5 min | > 5% for 2 min | Check error logs for uncaught exceptions |
| **Database Connectivity** | `/api/health` status | Failed 1 check | Failed 3 consecutive | Check PostgreSQL service & network reachability |
| **Pool Saturation** | Active connections / pool size | > 80% capacity | > 95% capacity | Investigate slow queries or connection leak |
| **Process Restarts** | Container restart count | > 2 in 1 hour | > 5 in 1 hour | Check for out-of-memory (OOM) kills or crashes |
| **Memory Usage** | Container resident set size (RSS) | > 80% RAM limit | > 90% RAM limit | Investigate cache size and memory leak |

---

## 3. Standardized Alert Payload Contract

When monitoring systems (e.g. Datadog, New Relic, Better Uptime, Render Alerts) trigger an alert, the webhook payload must adhere to this sanitized schema:

```json
{
  "service": "abacha-unified-commerce",
  "environment": "production",
  "severity": "CRITICAL",
  "timestamp": "2026-09-11T21:05:00.000Z",
  "signal": {
    "metric": "database.connected",
    "observedValue": false,
    "threshold": true,
    "description": "PostgreSQL database ping failed consecutive probes on /api/health"
  },
  "runbookUrl": "https://github.com/ygbock/POS-E-Commerce/blob/main/.ai/OPERATIONS_RUNBOOK.md"
}
```

### Safety Policy:
Alert payloads must **NEVER** contain:
- Authorization headers, tokens, or JWTs
- SQL query bodies with user input
- Customer PII (emails, names, credit card numbers)
- Database credentials or connection URIs
