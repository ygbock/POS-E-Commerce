import { randomUUID } from 'node:crypto';
import { DatabaseClient, getDatabaseClient } from '../db/client';
import { AuthContext } from '../middleware/auth';

/**
 * Audit Event Record (SEC-001 & AUD-001)
 * 
 * Server-Authoritative Identity:
 * - actor_id, actor_name, and actor_role are derived by server-side
 *   authentication middleware from validated session tokens / cryptographic claims.
 * - Client-supplied identity fields are stripped and never trusted.
 * - All metadata, previousState, and newState are deeply sanitized server-side.
 */
export interface AuditEventRecord {
  id: string;
  organization_id?: string;
  actor_id?: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  location_id?: string | null;
  before_state?: any;
  after_state?: any;
  metadata?: Record<string, any>;
  ip_address?: string | null;
  severity?: 'Info' | 'Low' | 'Medium' | 'High' | 'Critical';
  result?: 'SUCCESS' | 'FAILED' | 'DENIED';
  timestamp?: string;
}

export interface AuditQueryParams {
  organizationId: string;
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  severity?: 'Info' | 'Low' | 'Medium' | 'High' | 'Critical' | string;
  result?: 'SUCCESS' | 'FAILED' | 'DENIED' | string;
  search?: string;
}

export interface AuditQueryResult {
  items: AuditEventRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export interface SecurityMetrics {
  eventsToday: number;
  eventsThisWeek: number;
  staffSuspensions: number;
  rolePermissionChanges: number;
  ownershipEvents: number;
  failedDeniedOperations: number;
  criticalAndHigh: number;
  recentSecurityEvents: AuditEventRecord[];
}

const SENSITIVE_KEY_PATTERN = /^(.*_)?(password|passwd|pin|token|secret|jwt|salt|hash|cvv|authorization|credit_card|card_number|pan|private_key|api_key|apiKey|webhook_secret|encryption_key|refresh_token|auth_token)(_.*)?$/i;

/**
 * Deeply sanitizes objects or arrays to prevent secrets/credentials from being recorded in audit storage.
 */
export function sanitizeAuditData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') {
    if (typeof data === 'string' && data.length > 20 && (/bearer\s+[a-zA-Z0-9._-]+/i.test(data) || /^eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/.test(data))) {
      return '[REDACTED]';
    }
    return data;
  }
  if (data instanceof Date) return data.toISOString();

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeAuditData(val);
    } else if (typeof val === 'string' && val.length > 20 && (/bearer\s+[a-zA-Z0-9._-]+/i.test(val) || /^eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/.test(val))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export class AuditRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  /**
   * Authoritatively record an audit event bound to a verified AuthContext.
   */
  async recordAuthorizedEvent(
    arg1: any,
    arg2: any,
    client?: DatabaseClient
  ): Promise<AuditEventRecord> {
    const auth: AuthContext = (arg1 && arg1.userId) ? arg1 : arg2;
    const event = (arg1 && arg1.userId) ? arg2 : arg1;

    const dbClient = (client && typeof (client as any).query === 'function') ? client : undefined;
    return this.recordEvent(
      {
        id: event.id,
        action: event.action,
        entity_type: event.entity_type || event.entityType,
        entity_id: event.entity_id || event.entityId,
        location_id: event.location_id || event.locationId || auth.locationId || null,
        before_state: event.before_state || event.beforeState,
        after_state: event.after_state || event.afterState,
        metadata: event.metadata || event.details || {},
        ip_address: event.ip_address || event.ipAddress || null,
        severity: event.severity || 'Info',
        result: event.result || 'SUCCESS',
        organization_id: auth.organizationId,
        actor_id: auth.userId,
        actor_name: auth.email || auth.userId,
        actor_role: auth.role,
      },
      dbClient
    );
  }

  async recordEvent(
    event: Partial<AuditEventRecord> & { action: string; entity_type?: string; entity_id?: string },
    client?: DatabaseClient
  ): Promise<AuditEventRecord> {
    const db = this.getClient(client);
    const eventId = event.id || `aud_${randomUUID()}`;
    if (!event.organization_id || typeof event.organization_id !== 'string' || event.organization_id.trim().length === 0) {
      throw new Error('TENANT_REQUIRED: Audit event must include an explicit organization_id');
    }

    const sanitizedBefore = event.before_state !== undefined ? sanitizeAuditData(event.before_state) : null;
    const sanitizedAfter = event.after_state !== undefined ? sanitizeAuditData(event.after_state) : null;
    const sanitizedMeta = sanitizeAuditData(event.metadata || {});

    const res = await db.query<AuditEventRecord>(
      `INSERT INTO audit_events (
        id, organization_id, actor_id, actor_name, actor_role, action,
        entity_type, entity_id, location_id, before_state, after_state,
        metadata, ip_address, severity, result
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        eventId,
        event.organization_id.trim(),
        event.actor_id || null,
        event.actor_name || 'System',
        event.actor_role || 'System',
        event.action,
        event.entity_type || 'system',
        event.entity_id || 'system',
        event.location_id || null,
        sanitizedBefore ? JSON.stringify(sanitizedBefore) : null,
        sanitizedAfter ? JSON.stringify(sanitizedAfter) : null,
        JSON.stringify(sanitizedMeta),
        event.ip_address || null,
        event.severity || 'Info',
        event.result || 'SUCCESS',
      ]
    );
    return res.rows[0];
  }

  async listRecentEvents(
    options: {
      orgId?: string;
      entityType?: string;
      entityId?: string;
      actorId?: string;
      limit?: number;
    } = {},
    client?: DatabaseClient
  ): Promise<AuditEventRecord[]> {
    const db = this.getClient(client);
    if (!options.orgId || typeof options.orgId !== 'string' || options.orgId.trim().length === 0) {
      throw new Error('TENANT_REQUIRED: Audit listing requires an explicit orgId');
    }
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [options.orgId.trim()];

    if (options.entityType) {
      params.push(options.entityType);
      conditions.push(`entity_type = $${params.length}`);
    }
    if (options.entityId) {
      params.push(options.entityId);
      conditions.push(`entity_id = $${params.length}`);
    }
    if (options.actorId) {
      params.push(options.actorId);
      conditions.push(`actor_id = $${params.length}`);
    }

    const limit = Math.min(Math.max(1, options.limit || 50), 100);
    params.push(limit);

    const res = await db.query<AuditEventRecord>(
      `SELECT * FROM audit_events
       WHERE ${conditions.join(' AND ')}
       ORDER BY timestamp DESC
       LIMIT $${params.length}`,
      params
    );
    return res.rows;
  }

  async queryAuditEvents(
    params: AuditQueryParams,
    client?: DatabaseClient
  ): Promise<AuditQueryResult> {
    const db = this.getClient(client);
    if (!params.organizationId || typeof params.organizationId !== 'string' || params.organizationId.trim().length === 0) {
      throw new Error('TENANT_REQUIRED: Audit listing requires an explicit organizationId');
    }

    const page = Math.max(1, Number(params.page) || 1);
    let pageSize = Number(params.pageSize) || 20;
    if (pageSize < 1) pageSize = 20;
    if (pageSize > 100) pageSize = 100;

    const conditions: string[] = ['organization_id = $1'];
    const queryParams: any[] = [params.organizationId.trim()];

    if (params.startDate) {
      queryParams.push(params.startDate);
      conditions.push(`timestamp >= $${queryParams.length}`);
    }
    if (params.endDate) {
      queryParams.push(params.endDate);
      conditions.push(`timestamp <= $${queryParams.length}`);
    }
    if (params.action && params.action.trim() !== '' && params.action !== 'ALL') {
      queryParams.push(params.action.trim());
      conditions.push(`action = $${queryParams.length}`);
    }
    if (params.entityType && params.entityType.trim() !== '' && params.entityType !== 'ALL') {
      queryParams.push(params.entityType.trim());
      conditions.push(`entity_type = $${queryParams.length}`);
    }
    if (params.entityId && params.entityId.trim() !== '') {
      queryParams.push(params.entityId.trim());
      conditions.push(`entity_id = $${queryParams.length}`);
    }
    if (params.actorId && params.actorId.trim() !== '' && params.actorId !== 'ALL') {
      queryParams.push(params.actorId.trim());
      conditions.push(`actor_id = $${queryParams.length}`);
    }
    if (params.severity && params.severity.trim() !== '' && params.severity !== 'ALL') {
      queryParams.push(params.severity.trim());
      conditions.push(`severity = $${queryParams.length}`);
    }
    if (params.result && params.result.trim() !== '' && params.result !== 'ALL') {
      queryParams.push(params.result.trim());
      conditions.push(`result = $${queryParams.length}`);
    }
    if (params.search && params.search.trim().length > 0) {
      queryParams.push(`%${params.search.trim()}%`);
      const pIdx = queryParams.length;
      conditions.push(
        `(actor_name ILIKE $${pIdx} OR action ILIKE $${pIdx} OR entity_type ILIKE $${pIdx} OR entity_id ILIKE $${pIdx} OR metadata::text ILIKE $${pIdx})`
      );
    }

    const whereClause = conditions.join(' AND ');

    // 1. Total count
    const countRes = await db.query<{ total: string | number }>(
      `SELECT COUNT(*) as total FROM audit_events WHERE ${whereClause}`,
      queryParams
    );
    const totalCount = Number(countRes.rows[0]?.total || 0);

    // 2. Paginated rows
    const offset = (page - 1) * pageSize;
    const paginationParams = [...queryParams, pageSize, offset];
    const itemsRes = await db.query<AuditEventRecord>(
      `SELECT * FROM audit_events
       WHERE ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${paginationParams.length - 1} OFFSET $${paginationParams.length}`,
      paginationParams
    );

    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const hasMore = page < totalPages;

    return {
      items: itemsRes.rows,
      totalCount,
      page,
      pageSize,
      totalPages,
      hasMore,
    };
  }

  async getSecurityMetrics(
    organizationId: string,
    client?: DatabaseClient
  ): Promise<SecurityMetrics> {
    const db = this.getClient(client);
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim().length === 0) {
      throw new Error('TENANT_REQUIRED: Security metrics requires an explicit organizationId');
    }
    const orgId = organizationId.trim();

    const countsRes = await db.query<{
      events_today: string | number;
      events_this_week: string | number;
      staff_suspensions: string | number;
      role_permission_changes: string | number;
      ownership_events: string | number;
      failed_denied_operations: string | number;
      critical_and_high: string | number;
    }>(
      `SELECT
        COUNT(CASE WHEN timestamp >= CURRENT_DATE THEN 1 END) as events_today,
        COUNT(CASE WHEN timestamp >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as events_this_week,
        COUNT(CASE WHEN action IN ('USER_SUSPENDED', 'STAFF_SUSPENDED') THEN 1 END) as staff_suspensions,
        COUNT(CASE WHEN action IN ('USER_ROLE_CHANGED', 'ROLE_PERMISSIONS_CHANGED', 'STAFF_ROLE_UPDATED', 'USER_UPDATED') THEN 1 END) as role_permission_changes,
        COUNT(CASE WHEN action ILIKE '%OWNER%' THEN 1 END) as ownership_events,
        COUNT(CASE WHEN result IN ('FAILED', 'DENIED') THEN 1 END) as failed_denied_operations,
        COUNT(CASE WHEN severity IN ('Critical', 'High') THEN 1 END) as critical_and_high
       FROM audit_events
       WHERE organization_id = $1`,
      [orgId]
    );

    const row = countsRes.rows[0] || ({} as any);

    const recentRes = await db.query<AuditEventRecord>(
      `SELECT * FROM audit_events
       WHERE organization_id = $1
         AND (severity IN ('High', 'Critical') OR result IN ('FAILED', 'DENIED') OR action ILIKE '%USER_%' OR action ILIKE '%SECURITY_%')
       ORDER BY timestamp DESC
       LIMIT 5`,
      [orgId]
    );

    return {
      eventsToday: Number(row.events_today || 0),
      eventsThisWeek: Number(row.events_this_week || 0),
      staffSuspensions: Number(row.staff_suspensions || 0),
      rolePermissionChanges: Number(row.role_permission_changes || 0),
      ownershipEvents: Number(row.ownership_events || 0),
      failedDeniedOperations: Number(row.failed_denied_operations || 0),
      criticalAndHigh: Number(row.critical_and_high || 0),
      recentSecurityEvents: recentRes.rows,
    };
  }
}
