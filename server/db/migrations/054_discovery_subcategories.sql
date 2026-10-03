-- AbaCha Unified Commerce
-- Migration 054: Discovery category subcategories
--
-- Forward-only migration: do not modify previously applied migrations.
-- Seeds standard subcategories under the 9 canonical platform parent categories
-- so "Explore by Category" dropdowns and discovery filters can browse granular subcategories.

INSERT INTO discovery_business_categories (id, parent_id, name, slug, description, display_order, is_active, is_system)
VALUES
  -- 1. Retail ('disc_cat_retail')
  ('disc_cat_retail_supermarkets', 'disc_cat_retail', 'Supermarkets & Groceries', 'supermarkets-groceries', 'Supermarkets, mini-marts and grocery stores', 11, TRUE, TRUE),
  ('disc_cat_retail_general', 'disc_cat_retail', 'General Merchandise', 'general-merchandise', 'Department stores, variety stores and everyday essentials', 12, TRUE, TRUE),
  ('disc_cat_retail_stationery', 'disc_cat_retail', 'Books, Office & Stationery', 'books-office-stationery', 'Bookshops, office supplies and printing materials', 13, TRUE, TRUE),
  ('disc_cat_retail_wholesale', 'disc_cat_retail', 'Wholesale & Distribution', 'wholesale-distribution', 'Bulk goods, importers and commercial distributors', 14, TRUE, TRUE),

  -- 2. Food & Dining ('disc_cat_food')
  ('disc_cat_food_restaurants', 'disc_cat_food', 'Restaurants & Local Dining', 'restaurants-local-dining', 'Sit-down restaurants, local dishes and chop bars', 21, TRUE, TRUE),
  ('disc_cat_food_fast_food', 'disc_cat_food', 'Fast Food & Takeaway', 'fast-food-takeaway', 'Quick bites, grills, shawarma and takeaway spots', 22, TRUE, TRUE),
  ('disc_cat_food_bakery', 'disc_cat_food', 'Bakeries, Cafes & Pastries', 'bakeries-cafes-pastries', 'Fresh bread, cakes, coffee shops and pastries', 23, TRUE, TRUE),
  ('disc_cat_food_catering', 'disc_cat_food', 'Catering & Event Food', 'catering-event-food', 'Event catering, party platters and bulk food orders', 24, TRUE, TRUE),

  -- 3. Services ('disc_cat_services')
  ('disc_cat_services_laundry', 'disc_cat_services', 'Laundry & Dry Cleaning', 'laundry-dry-cleaning', 'Wash, fold, ironing and dry cleaning services', 31, TRUE, TRUE),
  ('disc_cat_services_logistics', 'disc_cat_services', 'Delivery, Courier & Logistics', 'delivery-courier-logistics', 'Local dispatch riders, freight and moving services', 32, TRUE, TRUE),
  ('disc_cat_services_events', 'disc_cat_services', 'Events, Photography & Media', 'events-photography-media', 'Photographers, videographers, DJs and event planners', 33, TRUE, TRUE),
  ('disc_cat_services_tailoring', 'disc_cat_services', 'Tailoring & Alterations', 'tailoring-alterations', 'Bespoke tailoring, seamstresses and garment repairs', 34, TRUE, TRUE),

  -- 4. Automotive ('disc_cat_automotive')
  ('disc_cat_auto_repair', 'disc_cat_automotive', 'Auto Repair & Mechanics', 'auto-repair-mechanics', 'Vehicle diagnostics, engine repair and maintenance', 41, TRUE, TRUE),
  ('disc_cat_auto_parts', 'disc_cat_automotive', 'Spare Parts & Accessories', 'spare-parts-accessories', 'Genuine auto parts, tyres, batteries and lubricants', 42, TRUE, TRUE),
  ('disc_cat_auto_wash', 'disc_cat_automotive', 'Car Wash & Detailing', 'car-wash-detailing', 'Exterior wash, interior detailing and polishing', 43, TRUE, TRUE),
  ('disc_cat_auto_rentals', 'disc_cat_automotive', 'Vehicle Sales & Rentals', 'vehicle-sales-rentals', 'Car dealerships, vehicle hire and kekeh/motorbike sales', 44, TRUE, TRUE),

  -- 5. Electronics & Technology ('disc_cat_electronics')
  ('disc_cat_elec_phones', 'disc_cat_electronics', 'Phones, Tablets & Accessories', 'phones-tablets-accessories', 'Smartphones, cases, chargers and mobile accessories', 51, TRUE, TRUE),
  ('disc_cat_elec_computers', 'disc_cat_electronics', 'Computers, Laptops & Networking', 'computers-laptops-networking', 'Laptops, printers, routers and IT hardware', 52, TRUE, TRUE),
  ('disc_cat_elec_appliances', 'disc_cat_electronics', 'Home Appliances & Solar', 'home-appliances-solar', 'TVs, fridges, generators, inverters and solar systems', 53, TRUE, TRUE),
  ('disc_cat_elec_repair', 'disc_cat_electronics', 'Phone & Computer Repair', 'phone-computer-repair', 'Screen replacement, hardware repair and software troubleshooting', 54, TRUE, TRUE),

  -- 6. Health & Wellness ('disc_cat_health')
  ('disc_cat_health_pharmacy', 'disc_cat_health', 'Pharmacies & Medical Supplies', 'pharmacies-medical-supplies', 'Licensed pharmacies, prescription medicines and first aid', 61, TRUE, TRUE),
  ('disc_cat_health_clinics', 'disc_cat_health', 'Clinics, Labs & Diagnostics', 'clinics-labs-diagnostics', 'Medical clinics, dental care, optical and lab testing', 62, TRUE, TRUE),
  ('disc_cat_health_fitness', 'disc_cat_health', 'Fitness, Gyms & Wellness', 'fitness-gyms-wellness', 'Gyms, personal training, spa and wellness centers', 63, TRUE, TRUE),

  -- 7. Fashion & Beauty ('disc_cat_fashion')
  ('disc_cat_fashion_clothing', 'disc_cat_fashion', 'Clothing, Africana & Boutiques', 'clothing-africana-boutiques', 'Men, women and children apparel, native wear and textiles', 71, TRUE, TRUE),
  ('disc_cat_fashion_shoes', 'disc_cat_fashion', 'Shoes, Bags & Jewelry', 'shoes-bags-jewelry', 'Footwear, handbags, watches and fashion accessories', 72, TRUE, TRUE),
  ('disc_cat_fashion_salon', 'disc_cat_fashion', 'Hair Salons & Barbershops', 'hair-salons-barbershops', 'Braiding, wigs, haircuts, grooming and styling', 73, TRUE, TRUE),
  ('disc_cat_fashion_cosmetics', 'disc_cat_fashion', 'Cosmetics, Skincare & Perfumes', 'cosmetics-skincare-perfumes', 'Beauty products, makeup, lotions and fragrances', 74, TRUE, TRUE),

  -- 8. Home & Construction ('disc_cat_home')
  ('disc_cat_home_hardware', 'disc_cat_home', 'Hardware & Building Materials', 'hardware-building-materials', 'Cement, roofing, paint, tools and construction supplies', 81, TRUE, TRUE),
  ('disc_cat_home_furniture', 'disc_cat_home', 'Furniture, Decor & Bedding', 'furniture-decor-bedding', 'Living room, office furniture, mattresses and curtains', 82, TRUE, TRUE),
  ('disc_cat_home_plumbing_elec', 'disc_cat_home', 'Plumbing, Electrical & AC', 'plumbing-electrical-ac', 'Electricians, plumbers, AC installation and maintenance', 83, TRUE, TRUE),
  ('disc_cat_home_cleaning', 'disc_cat_home', 'Cleaning, Pest Control & Security', 'cleaning-pest-control-security', 'Home/office cleaning, fumigation and security systems', 84, TRUE, TRUE),

  -- 9. Professional Services ('disc_cat_professional')
  ('disc_cat_prof_legal_finance', 'disc_cat_professional', 'Accounting, Legal & Consulting', 'accounting-legal-consulting', 'Tax, audit, legal practice and business advisory', 91, TRUE, TRUE),
  ('disc_cat_prof_printing', 'disc_cat_professional', 'Printing, Branding & Signage', 'printing-branding-signage', 'Large format printing, T-shirt branding and graphic design', 92, TRUE, TRUE),
  ('disc_cat_prof_it_web', 'disc_cat_professional', 'Software, Web & Digital Marketing', 'software-web-digital-marketing', 'Web development, social media management and IT support', 93, TRUE, TRUE),
  ('disc_cat_prof_education', 'disc_cat_professional', 'Training, Tutoring & Education', 'training-tutoring-education', 'Vocational training, computer classes and private tutoring', 94, TRUE, TRUE)
ON CONFLICT (id) DO UPDATE SET
  parent_id = EXCLUDED.parent_id,
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  is_system = EXCLUDED.is_system,
  updated_at = CURRENT_TIMESTAMP;
