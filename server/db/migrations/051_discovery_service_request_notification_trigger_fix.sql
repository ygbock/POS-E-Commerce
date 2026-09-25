-- AbaCha Unified Commerce
-- Migration 051: Fix discovery notification trigger record-variable usage.
-- Forward-only. Migration 050 remains immutable.

CREATE OR REPLACE FUNCTION discovery_create_request_notifications()
RETURNS trigger AS $$
DECLARE
  recipient RECORD;
  request_customer VARCHAR(64);
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
      ('notif_' || md5(random()::text || clock_timestamp()::text || NEW.id || request_customer),
       NEW.request_id,NEW.id,request_customer,NEW.business_id,ntype,ntitle,nmessage,
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
          ('notif_' || md5(random()::text || clock_timestamp()::text || NEW.id || recipient.user_id),
           NEW.request_id,NEW.id,recipient.user_id,NEW.business_id,ntype,ntitle,nmessage,
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
        ('notif_' || md5(random()::text || clock_timestamp()::text || NEW.id || recipient.user_id),
         NEW.request_id,NEW.id,recipient.user_id,NEW.business_id,ntype,ntitle,nmessage,
         jsonb_build_object('eventType',NEW.event_type));
    END LOOP;
  ELSIF request_customer IS NOT NULL AND NEW.event_type IN ('REQUEST_CREATED','STATUS_CHANGED') THEN
    INSERT INTO discovery_service_request_notifications
      (id,request_id,event_id,recipient_user_id,business_id,notification_type,title,message,metadata)
    VALUES
      ('notif_' || md5(random()::text || clock_timestamp()::text || NEW.id || request_customer),
       NEW.request_id,NEW.id,request_customer,NEW.business_id,ntype,ntitle,nmessage,
       jsonb_build_object('eventType',NEW.event_type));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
