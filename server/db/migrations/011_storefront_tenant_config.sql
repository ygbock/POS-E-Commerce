-- AbaCha Unified Commerce
-- Migration 011: Storefront Multi-Tenant Configuration & Domain Binding

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS slug VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(16) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(8) NOT NULL DEFAULT '$',
  ADD COLUMN IF NOT EXISTS locale VARCHAR(16) NOT NULL DEFAULT 'en-US',
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS branding JSONB NOT NULL DEFAULT '{
    "storeName": "AbaCha Unified Commerce",
    "logoUrl": null,
    "faviconUrl": null,
    "primaryColor": "#4f46e5",
    "accentColor": "#f59e0b",
    "heroTitle": "Modern Unified Commerce",
    "heroSubtitle": "Engineered for speed, reliability, and precision inventory.",
    "trustBadges": [
      { "icon": "Truck", "title": "Free Delivery", "subtitle": "On qualifying orders" },
      { "icon": "ShieldCheck", "title": "Official Warranty", "subtitle": "Guaranteed quality" },
      { "icon": "RotateCcw", "title": "Hassle-Free Returns", "subtitle": "Customer first policy" }
    ]
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS policies JSONB NOT NULL DEFAULT '{
    "freeShippingThreshold": 75.00,
    "standardShippingFee": 9.99,
    "expressShippingFee": 19.99,
    "shippingPolicy": "Standard shipping delivers within 3-5 business days.",
    "returnPolicy": "Returns accepted within 30 days of receipt in original condition.",
    "warrantyPolicy": "Standard 1-year manufacturer warranty applies to all electronics.",
    "deliveryPromise": "Orders placed before 2 PM dispatch same-day.",
    "pickupEnabled": true,
    "pickupInstructions": "Ready for pickup within 2 hours at your selected branch."
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS catalog_policy JSONB NOT NULL DEFAULT '{
    "allowBackorders": false,
    "showInventoryCount": true,
    "lowStockThreshold": 5,
    "defaultSort": "featured"
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{
    "reviewsEnabled": true,
    "wishlistEnabled": true,
    "couponsEnabled": true,
    "pickupEnabled": true,
    "guestCheckoutEnabled": true,
    "orderTrackingEnabled": true
  }'::jsonb;

-- Ensure canonical default organization has valid slug
UPDATE organizations 
SET slug = 'default' 
WHERE id = 'org_default' AND (slug IS NULL OR slug = '');
