import { DatabaseClient, getDatabaseClient } from '../db/client';

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

  async recordEvent(event: AuditEventRecord, client?: DatabaseClient): Promise<AuditEventRecord> {
    const db = this.getClient(client);
    const res = await db.query<AuditEventRecord>(
      `INSERT INTO audit_events (
        id, organization_id, actor_id, actor_name, actor_role, action,
        entity_type, entity_id, location_id, before_state, after_state,
        metadata, ip_address, severity
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        event.id,
        event.organization_id || 'org_default',
        event.actor_id || null,
        event.actor_name,
        event.actor_role,
        event.action,
        event.entity_type,
        event.entity_id,
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
