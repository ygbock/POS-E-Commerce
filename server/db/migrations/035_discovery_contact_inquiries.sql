-- Discovery customer-to-business contact inquiry workflow
-- Forward-only migration: preserve prior migration history.

CREATE TABLE IF NOT EXISTS discovery_contact_inquiries (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) NOT NULL REFERENCES discovery_businesses(id) ON DELETE CASCADE,
  customer_user_id VARCHAR(64),
  customer_name VARCHAR(160) NOT NULL,
  customer_email VARCHAR(320),
  customer_phone VARCHAR(64),
  subject VARCHAR(180),
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  merchant_note TEXT,
  responded_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_discovery_contact_inquiry_status CHECK (status IN ('OPEN','READ','RESPONDED','CLOSED')),
  CONSTRAINT ck_discovery_contact_inquiry_message CHECK (length(trim(message)) > 0 AND length(message) <= 10000),
  CONSTRAINT ck_discovery_contact_inquiry_subject CHECK (subject IS NULL OR length(trim(subject)) <= 180),
  CONSTRAINT ck_discovery_contact_inquiry_name CHECK (length(trim(customer_name)) > 0 AND length(trim(customer_name)) <= 160)
);

CREATE INDEX IF NOT EXISTS idx_discovery_contact_inquiries_business_status_created
  ON discovery_contact_inquiries(business_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_contact_inquiries_customer_created
  ON discovery_contact_inquiries(customer_user_id, created_at DESC)
  WHERE customer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovery_contact_inquiries_business_created
  ON discovery_contact_inquiries(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_contact_inquiries_open
  ON discovery_contact_inquiries(business_id, created_at DESC)
  WHERE status IN ('OPEN','READ');
