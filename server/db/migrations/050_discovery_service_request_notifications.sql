-- AbaCha Unified Commerce
-- Migration 050: Discovery service-request notification inbox.
-- Forward-only. Notifications are generated transactionally from lifecycle events.

CREATE TABLE IF NOT EXISTS discovery_service_request_notifications (
  id VARCHAR(64) PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL REFERENCES discovery_service_requests(id) ON DELETE CASCADE,
  event_id VARCHAR(64) REFERENCES discovery_service_request_events(id) ON DELETE CASCADE,
  recipient_user_id VARCHAR(64) NOT NULL,
  business_id VARCHAR(64),
  notification_type VARCHAR(64) NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_request_notification_delivery
  ON discovery_service_request_notifications(event_id, recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_discovery_request_notifications_recipient_unread
  ON discovery_service_request_notifications(recipient_user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_request_notifications_request
  ON discovery_service_request_notifications(request_id, created_at DESC);

CREATE OR REPLACE FUNCTION discovery_create_request_notifications()
RETURNS trigger AS $$
DECLARE
  recipient RECORD;
  request_customer VARCHAR(64);
  provider_business VARCHAR(64);
  ntype VARCHAR(64);
  ntitle VARCHAR(180);
  nmessage TEXT;
BEGIN
  SELECT customer_user_id INTO request_customer
  FROM discovery_service_requests WHERE id = NEW.request_id;

  ntype := NEW.event_type;
  ntitle := CASE NEW.event_type
    WHEN 'REQUEST_CREATED' THEN 'Service request created'
    WHEN 'REQUEST_MATCHED' THEN 'New service request match'
    WHEN 'QUOTE_SUBMITTED' THEN 'New service quote'
    WHEN 'QUOTE_ACCEPTED' THEN 'Quote accepted'
    WHEN 'QUOTES_DECLINED' THEN 'Quotes updated'
    ELSE 'Service request updated'
  END;

  nmessage := COALESCE(NULLIF(NEW.note,''), 'Your service request has been updated.');

  IF NEW.event_type = 'QUOTE_SUBMITTED' AND request_customer IS NOT NULL THEN
    INSERT INTO discovery_service_request_notifications
      (id,request_id,event_id,recipient_user_id,business_id,notification_type,title,message,metadata)
    VALUES
      ('notif_' || md5(random()::text || clock_timestamp()::text || NEW.id || recipient.user_id),NEW.request_id,NEW.id,request_customer,NEW.business_id,ntype,ntitle,nmessage,
       jsonb_build_object('eventType',NEW.event_type,'quoteId',NEW.quote_id));
  ELSIF NEW.event_type IN ('QUOTE_ACCEPTED','QUOTES_DECLINED') THEN
    IF NEW.business_id IS NOT NULL THEN
      FOR recipient IN
        SELECT user_id FROM discovery_business_memberships
        WHERE business_id=NEW.business_id AND is_active=TRUE
      LOOP
        INSERT INTO discovery_service_request_notifications
          (id,request_id,event_id,recipient_user_id,business_id,notification_type,title,message,metadata)
        VALUES
          ('notif_' || md5(random()::text || clock_timestamp()::text || NEW.id || recipient.user_id),NEW.request_id,NEW.id,recipient.user_id,NEW.business_id,ntype,ntitle,nmessage,
           jsonb_build_object('eventType',NEW.event_type,'quoteId',NEW.quote_id));
      END LOOP;
    END IF;
  ELSIF NEW.event_type = 'REQUEST_MATCHED' AND NEW.business_id IS NOT NULL THEN
    FOR recipient IN
      SELECT user_id FROM discovery_business_memberships
      WHERE business_id=NEW.business_id AND is_active=TRUE
    LOOP
      INSERT INTO discovery_service_request_notifications
        (id,request_id,event_id,recipient_user_id,business_id,notification_type,title,message,metadata)
      VALUES
        ('notif_' || md5(random()::text || clock_timestamp()::text || NEW.id || recipient.user_id),NEW.request_id,NEW.id,recipient.user_id,NEW.business_id,ntype,ntitle,nmessage,
         jsonb_build_object('eventType',NEW.event_type));
    END LOOP;
  ELSIF request_customer IS NOT NULL AND NEW.event_type IN ('REQUEST_CREATED','STATUS_CHANGED') THEN
    INSERT INTO discovery_service_request_notifications
      (id,request_id,event_id,recipient_user_id,business_id,notification_type,title,message,metadata)
    VALUES
      ('notif_' || md5(random()::text || clock_timestamp()::text || NEW.id || recipient.user_id),NEW.request_id,NEW.id,request_customer,NEW.business_id,ntype,ntitle,nmessage,
       jsonb_build_object('eventType',NEW.event_type));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_discovery_request_notifications
  ON discovery_service_request_events;

CREATE TRIGGER trg_discovery_request_notifications
AFTER INSERT ON discovery_service_request_events
FOR EACH ROW EXECUTE FUNCTION discovery_create_request_notifications();
