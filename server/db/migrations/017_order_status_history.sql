-- AbaCha Commerce
-- Migration 017: Order Status History
-- Forward-only. Do not modify previously applied migrations.

CREATE TABLE IF NOT EXISTS order_status_history (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order
  ON order_status_history(order_id, changed_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_order_status_history_org_order
  ON order_status_history(organization_id, order_id, changed_at ASC, id ASC);

CREATE OR REPLACE FUNCTION record_order_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO order_status_history (
      id, organization_id, order_id, from_status, to_status, changed_at, metadata
    )
    VALUES (
      md5(clock_timestamp()::text || random()::text || NEW.id || COALESCE(NEW.status, '')),
      NEW.organization_id,
      NEW.id,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
      NEW.status,
      CURRENT_TIMESTAMP,
      jsonb_build_object('source', 'orders_status_trigger', 'operation', TG_OP)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_status_history ON orders;

CREATE TRIGGER trg_orders_status_history
AFTER INSERT OR UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION record_order_status_history();

INSERT INTO order_status_history (
  id, organization_id, order_id, from_status, to_status, changed_at, metadata
)
SELECT
  md5('migration:017:' || o.id),
  o.organization_id,
  o.id,
  NULL,
  o.status,
  o.created_at,
  jsonb_build_object('source', 'migration:017_backfill')
FROM orders o
WHERE NOT EXISTS (
  SELECT 1 FROM order_status_history h WHERE h.order_id = o.id
);
