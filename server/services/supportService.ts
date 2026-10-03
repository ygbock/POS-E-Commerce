import { randomUUID } from 'node:crypto';
import { DatabaseClient } from '../db/client.ts';

export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type SupportTicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

function makeId(prefix: string) {
  return prefix + '_' + randomUUID().replace(/-/g, '');
}
function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export class SupportService {
  constructor(private readonly db: DatabaseClient) {}

  private async writeAudit(organizationId: string, actorUserId: string, action: string, entityId: string, metadata: Record<string, unknown> = {}) {
    await this.db.query(
      "INSERT INTO audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, result, metadata) VALUES ($1,$2,$3,$4,'SUPPORT_TICKET',$5,'SUCCESS',$6::jsonb)",
      [makeId('audit'), organizationId, actorUserId, action, entityId, JSON.stringify(metadata)],
    ).catch(() => undefined);
  }

  private async platformSupportUserIds(): Promise<string[]> {
    const result = await this.db.query<{ user_id: string }>(
      "SELECT id AS user_id FROM users WHERE is_active = TRUE AND role IN ('system_owner','platform_admin','platform_support')",
    );
    return result.rows.map(row => row.user_id);
  }

  private async notifyUsers(userIds: string[], organizationId: string | null, type: string, title: string, message: string, entityType: string, entityId: string, severity = 'INFO') {
    for (const userId of [...new Set(userIds.filter(Boolean))]) {
      const notificationId = makeId('notif');
      await this.db.query(
        "INSERT INTO notifications (id,recipient_user_id,organization_id,notification_type,title,message,severity,entity_type,entity_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [notificationId, userId, organizationId, type, title, message, severity, entityType, entityId],
      );
      await this.db.query(
        "INSERT INTO notification_deliveries (id,notification_id,channel,status,attempts,delivered_at) VALUES ($1,$2,'IN_APP','SENT',1,CURRENT_TIMESTAMP) ON CONFLICT (notification_id,channel) DO NOTHING",
        [makeId('delivery'), notificationId],
      );
    }
  }

  async createTicket(input: { organizationId: string; createdByUserId: string; subject: string; description: string; category?: string; priority?: SupportTicketPriority; metadata?: Record<string, unknown> }) {
    const subject = cleanText(input.subject, 180);
    const description = cleanText(input.description, 10000);
    if (!subject || !description) throw new Error('INVALID_TICKET_PAYLOAD');
    const priority = input.priority || 'NORMAL';
    if (!['LOW','NORMAL','HIGH','URGENT'].includes(priority)) throw new Error('INVALID_TICKET_PRIORITY');

    const ticketId = makeId('ticket');
    await this.db.query(
      "INSERT INTO support_tickets (id,organization_id,created_by_user_id,subject,description,category,priority,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
      [ticketId, input.organizationId, input.createdByUserId, subject, description, cleanText(input.category || 'GENERAL', 64) || 'GENERAL', priority, JSON.stringify(input.metadata || {})],
    );
    await this.notifyUsers(
      await this.platformSupportUserIds(), input.organizationId, 'SUPPORT_TICKET_CREATED', 'New support ticket',
      subject, 'SUPPORT_TICKET', ticketId, priority === 'URGENT' ? 'ERROR' : priority === 'HIGH' ? 'WARNING' : 'INFO',
    );
    await this.writeAudit(input.organizationId, input.createdByUserId, 'SUPPORT_TICKET_CREATED', ticketId, { priority });
    return this.getTicket(ticketId, input.organizationId);
  }

  async listTickets(options: { organizationId?: string; status?: string; assignedToUserId?: string; limit?: number; offset?: number }) {
    const params: unknown[] = [];
    const where: string[] = [];
    if (options.organizationId) { params.push(options.organizationId); where.push("t.organization_id = $" + params.length); }
    if (options.status) { params.push(options.status); where.push("t.status = $" + params.length); }
    if (options.assignedToUserId) { params.push(options.assignedToUserId); where.push("t.assigned_to_user_id = $" + params.length); }
    const limit = Math.min(Math.max(options.limit || 50, 1), 100);
    const offset = Math.max(options.offset || 0, 0);
    params.push(limit, offset);
    const result = await this.db.query(
      "SELECT t.*, u.email AS created_by_email, au.email AS assigned_to_email FROM support_tickets t JOIN users u ON u.id=t.created_by_user_id LEFT JOIN users au ON au.id=t.assigned_to_user_id " +
      (where.length ? "WHERE " + where.join(" AND ") + " " : "") +
      "ORDER BY t.updated_at DESC LIMIT $" + (params.length - 1) + " OFFSET $" + params.length,
      params,
    );
    return result.rows;
  }

  async getTicket(ticketId: string, organizationId?: string) {
    const params: unknown[] = [ticketId];
    const scope = organizationId ? " AND t.organization_id = $2" : "";
    if (organizationId) params.push(organizationId);
    const ticket = await this.db.query(
      "SELECT t.*, u.email AS created_by_email, au.email AS assigned_to_email FROM support_tickets t JOIN users u ON u.id=t.created_by_user_id LEFT JOIN users au ON au.id=t.assigned_to_user_id WHERE t.id=$1" + scope,
      params,
    );
    if (!ticket.rows[0]) return null;
    const messages = await this.db.query(
      "SELECT m.*, u.email AS author_email FROM support_ticket_messages m JOIN users u ON u.id=m.author_user_id WHERE m.ticket_id=$1 ORDER BY m.created_at ASC",
      [ticketId],
    );
    return { ...ticket.rows[0], messages: messages.rows };
  }

  async addMessage(ticketId: string, authorUserId: string, body: string, isInternal = false) {
    const cleanBody = cleanText(body, 10000);
    if (!cleanBody) throw new Error('INVALID_TICKET_MESSAGE');
    const ticket = await this.getTicket(ticketId);
    if (!ticket) throw new Error('TICKET_NOT_FOUND');
    const messageId = makeId('ticketmsg');
    await this.db.query(
      "INSERT INTO support_ticket_messages (id,ticket_id,author_user_id,body,is_internal) VALUES ($1,$2,$3,$4,$5)",
      [messageId, ticketId, authorUserId, cleanBody, isInternal],
    );
    if (!isInternal) {
      await this.db.query(
        "UPDATE support_tickets SET status=CASE WHEN status='WAITING_ON_CUSTOMER' THEN 'IN_PROGRESS' ELSE status END WHERE id=$1",
        [ticketId],
      );
    }
    const recipients = authorUserId === ticket.created_by_user_id ? await this.platformSupportUserIds() : [ticket.created_by_user_id];
    await this.notifyUsers(recipients, ticket.organization_id, 'SUPPORT_TICKET_MESSAGE', 'Support ticket updated', cleanBody.slice(0, 180), 'SUPPORT_TICKET', ticketId);
    await this.writeAudit(ticket.organization_id, authorUserId, 'SUPPORT_TICKET_MESSAGE_ADDED', ticketId, { messageId, isInternal });
    return this.getTicket(ticketId);
  }

  async updateTicket(ticketId: string, patch: { status?: SupportTicketStatus; priority?: SupportTicketPriority; assignedToUserId?: string | null }, actorUserId: string) {
    const current = await this.getTicket(ticketId);
    if (!current) throw new Error('TICKET_NOT_FOUND');
    const status = patch.status || current.status;
    const priority = patch.priority || current.priority;
    if (!['OPEN','IN_PROGRESS','WAITING_ON_CUSTOMER','RESOLVED','CLOSED'].includes(status)) throw new Error('INVALID_TICKET_STATUS');
    if (!['LOW','NORMAL','HIGH','URGENT'].includes(priority)) throw new Error('INVALID_TICKET_PRIORITY');
    const assigned = patch.assignedToUserId === undefined ? current.assigned_to_user_id : patch.assignedToUserId;
    await this.db.query(
      "UPDATE support_tickets SET status=$2, priority=$3, assigned_to_user_id=$4, resolved_at=CASE WHEN $2 IN ('RESOLVED','CLOSED') THEN COALESCE(resolved_at,CURRENT_TIMESTAMP) ELSE NULL END WHERE id=$1",
      [ticketId, status, priority, assigned || null],
    );
    await this.writeAudit(current.organization_id, actorUserId, 'SUPPORT_TICKET_UPDATED', ticketId, { status, priority, assignedToUserId: assigned });
    if (status !== current.status || assigned !== current.assigned_to_user_id) {
      await this.notifyUsers([current.created_by_user_id, ...(assigned ? [assigned] : [])], current.organization_id, 'SUPPORT_TICKET_STATUS', 'Support ticket status changed', 'Ticket ' + ticketId + ' is now ' + status + '.', 'SUPPORT_TICKET', ticketId, status === 'RESOLVED' || status === 'CLOSED' ? 'SUCCESS' : 'INFO');
    }
    return this.getTicket(ticketId);
  }

  async listNotifications(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}) {
    const limit = Math.min(Math.max(options.limit || 50, 1), 100);
    const result = await this.db.query(
      "SELECT * FROM notifications WHERE recipient_user_id=$1 " + (options.unreadOnly ? "AND read_at IS NULL " : "") + "ORDER BY created_at DESC LIMIT $2",
      [userId, limit],
    );
    return result.rows;
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const result = await this.db.query("UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=$1 AND recipient_user_id=$2 RETURNING id,read_at", [notificationId, userId]);
    if (!result.rows[0]) throw new Error('NOTIFICATION_NOT_FOUND');
    return result.rows[0];
  }

  async markAllNotificationsRead(userId: string) {
    const result = await this.db.query("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE recipient_user_id=$1 AND read_at IS NULL", [userId]);
    return { updated: result.rowCount || 0 };
  }
}
