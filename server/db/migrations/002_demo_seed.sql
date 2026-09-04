-- Omnicore Unified Commerce
-- Migration 002: Optional Demo Seed Data
-- Clearly isolated development seed records; runs cleanly after initial schema

-- Default Organization
INSERT INTO organizations (id, name, code, is_active)
VALUES ('org_default', 'Omnicore Global Retail Ltd', 'OMNICORE_DEFAULT', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Primary Locations
INSERT INTO locations (id, organization_id, code, name, type, address, phone, manager_name, is_pos_enabled, is_active)
VALUES 
  ('loc_central_wh', 'org_default', 'WH-MAIN', 'Central Fulfillment Warehouse', 'Warehouse', '12 Industry Road, Freetown', '+232 76 100 200', 'David Kabbah', FALSE, TRUE),
  ('loc_retail_store_1', 'org_default', 'STR-001', 'Downtown Flagship Store', 'Retail Store', '45 Siaka Stevens Street, Freetown', '+232 76 300 400', 'Fatmata Bangura', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Initial Core Categories
INSERT INTO categories (id, organization_id, name, slug, description, icon_name, accent_color, display_order, is_pos_quick_access)
VALUES
  ('cat_electronics', 'org_default', 'Consumer Electronics', 'electronics', 'Smartphones, Audio, Computing and Accessories', 'Smartphone', 'from-blue-600 to-indigo-600', 1, TRUE),
  ('cat_apparel', 'org_default', 'Apparel & Fashion', 'apparel', 'Footwear, Premium Clothing, Accessories', 'Shirt', 'from-amber-600 to-rose-600', 2, TRUE),
  ('cat_groceries', 'org_default', 'Groceries & Pantry', 'groceries', 'Fresh Food, Dry Goods, Beverages', 'Utensils', 'from-emerald-600 to-teal-600', 3, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Initial Core Brands
INSERT INTO brands (id, organization_id, name, slug, country_of_origin, website, description, is_active)
VALUES
  ('brand_omnisound', 'org_default', 'OmniSound Pro', 'omnisound-pro', 'Germany', 'https://omnisound.internal', 'Audiophile studio audio equipment and noise-cancelling headphones', TRUE),
  ('brand_aether', 'org_default', 'Aether Apparel', 'aether-apparel', 'Portugal', 'https://aether.internal', 'Sustainable urban streetwear and technical footwear', TRUE),
  ('brand_terra', 'org_default', 'Terra Harvest', 'terra-harvest', 'Sierra Leone', 'https://terraharvest.internal', 'Artisanal organic coffee, teas, and indigenous pantry staples', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Units of Measure
INSERT INTO units_of_measure (id, organization_id, code, name, category, allow_fractional, base_unit_code, conversion_factor)
VALUES
  ('uom_pcs', 'org_default', 'PCS', 'Pieces / Units', 'Count', FALSE, 'PCS', 1.0000),
  ('uom_kg', 'org_default', 'KG', 'Kilograms', 'Weight', TRUE, 'KG', 1.0000),
  ('uom_ltr', 'org_default', 'LTR', 'Liters', 'Volume', TRUE, 'LTR', 1.0000)
ON CONFLICT (id) DO NOTHING;

-- Catalog Attributes
INSERT INTO catalog_attributes (id, organization_id, name, code, type, options, is_required, description)
VALUES
  ('attr_color', 'org_default', 'Color', 'color', 'select', '["Midnight Black", "Platinum Silver", "Navy Blue", "Forest Green"]'::jsonb, FALSE, 'Physical color variation'),
  ('attr_size', 'org_default', 'Size', 'size', 'select', '["XS", "S", "M", "L", "XL", "XXL"]'::jsonb, FALSE, 'Apparel sizing dimension')
ON CONFLICT (id) DO NOTHING;

-- Demo Suppliers
INSERT INTO suppliers (id, organization_id, name, contact_person, email, phone, address, payment_terms, rating, lead_time_days, is_active)
VALUES
  ('sup_global_tech', 'org_default', 'Global Tech Distributors', 'Marcus Vance', 'orders@globaltechdist.com', '+1 800 555 0199', 'San Jose, CA', 'Net 30', 4.90, 5, TRUE),
  ('sup_west_coast_apparel', 'org_default', 'West Coast Textiles & Goods', 'Elena Rostova', 'supply@westcoasttextiles.com', '+44 20 7946 0991', 'London, UK', 'Net 15', 4.85, 8, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Demo Customer
INSERT INTO customers (id, organization_id, name, email, phone, tier, loyalty_points, store_credit_balance, customer_group)
VALUES
  ('cust_vip_001', 'org_default', 'Alhaji Ibrahim Sesay', 'ibrahim.sesay@example.com', '+232 78 889 900', 'VIP', 450, 1500.00, 'VIP Member'),
  ('cust_walk_in', 'org_default', 'Walk-in Retail Customer', NULL, NULL, 'Bronze', 0, 0.00, 'Retail')
ON CONFLICT (id) DO NOTHING;
