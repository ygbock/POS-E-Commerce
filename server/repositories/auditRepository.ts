import { DatabaseClient, getDatabaseClient } from '../db/client';
import { AuthContext } from '../middleware/auth';

/**
 * Audit Event Record (SEC-001)
 * 
 * Server-Authoritative Identity:
 * - Under SEC-001, actor_id, actor_name, and actor_role are derived by server-side
 *   authentication middleware from validated session tokens / cryptographic claims.
 * - Client-supplied identity fields are stripped and never trusted.
 */
export interface AuditEventRecord {
  id: string;
  organization_id?: string;
  actor_id?: string | null; // Authoritative user ID enforced by SEC-001
  actor_name: string;
  actor_role: string;       // Authoritatively bound role from SEC-001
  action: string;
  entity_type: string;
  entity_id: string;
  location_id?: string | null;
  before_state?: any;
  after_state?: any;
  metadata?: Record<string, any>;
  ip_address?: string | null;
  severity?: 'Info' | 'Low' | 'Medium' | 'High' | 'Critical';
  timestamp?: string;
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
    // Support either (event, auth) or (auth, event)
    const auth: AuthContext = (arg1 && arg1.userId) ? arg1 : arg2;
    const event = (arg1 && arg1.userId) ? arg2 : arg1;

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
        organization_id: auth.organizationId,
        actor_id: auth.userId,
        actor_name: auth.email || auth.userId,
        actor_role: auth.role,
      },
      client
    );
  }

  async recordEvent(event: Partial<AuditEventRecord> & { action: string; entity_type?: string; entity_id?: string }, client?: DatabaseClient): Promise<AuditEventRecord> {
    const db = this.getClient(client);
    const eventId = event.id || `aud_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const res = await db.query<AuditEventRecord>(
      `INSERT INTO audit_events (
        id, organization_id, actor_id, actor_name, actor_role, action,
        entity_type, entity_id, location_id, before_state, after_state,
        metadata, ip_address, severity
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        eventId,
        event.organization_id || 'org_default',
        event.actor_id || null,
        event.actor_name || 'System',
        event.actor_role || 'System',
        event.action,
        event.entity_type || 'system',
        event.entity_id || 'system',
        event.location_id || null,
        event.before_state ? JSON.stringify(event.before_state) : null,
        event.after_state ? JSON.stringify(event.after_state) : null,
        JSON.stringify(event.metadata || {}),
        event.ip_address || null,
        event.severity || 'Info',
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
    const conditions: string[] = ['organization_id = $1'];
    const params: any[] = [options.orgId || 'org_default'];

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

    const limit = options.limit || 50;
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
}
