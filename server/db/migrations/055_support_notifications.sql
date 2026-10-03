-- AbaCha Unified Commerce
-- Migration 055: Unified support tickets, ticket messages, and user notifications.
-- Forward-only. Tenant-scoped support data and durable in-app notification inbox.

CREATE TABLE IF NOT EXISTS support_tickets (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  subject VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'GENERAL',
  priority VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  CONSTRAINT support_ticket_priority_check CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  CONSTRAINT support_ticket_status_check CHECK (status IN ('OPEN','IN_PROGRESS','WAITING_ON_CUSTOMER','RESOLVED','CLOSED'))
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id VARCHAR(64) PRIMARY KEY,
  ticket_id VARCHAR(64) NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  recipient_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE CASCADE,
  notification_type VARCHAR(64) NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'INFO',
  entity_type VARCHAR(64),
  entity_id VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT notification_severity_check CHECK (severity IN ('INFO','SUCCESS','WARNING','ERROR'))
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id VARCHAR(64) PRIMARY KEY,
  notification_id VARCHAR(64) NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(notification_id, channel),
  CONSTRAINT notification_delivery_channel_check CHECK (channel IN ('IN_APP','EMAIL','SMS','PUSH')),
  CONSTRAINT notification_delivery_status_check CHECK (status IN ('PENDING','SENT','FAILED','SKIPPED'))
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_org_status_updated
  ON support_tickets(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee_status
  ON support_tickets(assigned_to_user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_created
  ON support_ticket_messages(ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread_created
  ON notifications(recipient_user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org_created
  ON notifications(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_pending
  ON notification_deliveries(status, next_attempt_at, created_at);

CREATE OR REPLACE FUNCTION support_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_ticket_updated_at ON support_tickets;
CREATE TRIGGER trg_support_ticket_updated_at
BEFORE UPDATE ON support_tickets
FOR EACH ROW EXECUTE FUNCTION support_touch_updated_at();
