-- AbaCha Unified Commerce
-- Migration 026: Checkout-scoped inventory reservation uniqueness
--
-- Reservation idempotency is a database invariant. Storefront checkout
-- reservations use a deterministic key derived from the checkout idempotency
-- key plus fulfillment location and variant, while the composite constraint
-- below independently prevents duplicate reservation rows for the same
-- tenant/location/key/variant tuple.

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reservations_checkout_scope
  ON inventory_reservations (
    organization_id,
    location_id,
    idempotency_key,
    variant_id
  )
  WHERE idempotency_key IS NOT NULL;
