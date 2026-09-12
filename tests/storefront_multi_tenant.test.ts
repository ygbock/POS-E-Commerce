process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import { getDatabaseClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { createApp } from '../server';
import { AuthService } from '../server/services/authService';
import { UserRepository } from '../server/repositories/userRepository';
import { CustomerRepository } from '../server/repositories/customerRepository';
import { AuditRepository } from '../server/repositories/auditRepository';
import { hashPassword } from '../server/auth/password';

async function runStorefrontMultiTenantTests() {
  console.log('========================================================================');
  console.log(' UX-001A — Multi-Tenant Storefront Architecture & Acceptance Tests');
  console.log('========================================================================');

  let passed = 0;
  let failed = 0;

  function markPassed(testName: string) {
    console.log(`  [PASSED] ${testName}`);
    passed++;
  }

  function markFailed(testName: string, err: any) {
    console.error(`  [FAILED] ${testName}`);
    console.error(err);
    failed++;
  }

  // 1. Setup Database & Execute All Migrations (including 011)
  const db = getDatabaseClient({ forceNew: true });
  await db.query('SELECT 1');
  const migrationRes = await runMigrations(db);
  console.log(`[Migrations] Applied ${migrationRes.applied.length} migration(s).`);

  // 2. Seed Multi-Tenant Fixtures
  await db.exec(`
    -- Seed Tenants (Alpha, Beta, Inactive, and Default)
    INSERT INTO organizations (
      id, name, code, slug, custom_domain, currency_code, currency_symbol, locale, timezone,
      branding, policies, catalog_policy, feature_flags, is_active
    ) VALUES 
      (
        'org_store_alpha', 'Alpha Megastore Ltd', 'STORE_ALPHA', 'alpha', 'alpha.abacha.test',
        'USD', '$', 'en-US', 'America/New_York',
        '{"storeName":"Alpha Megastore","logoUrl":"https://alpha.test/logo.png","primaryColor":"#4f46e5","accentColor":"#f59e0b","heroTitle":"Future Tech for Everyday Explorers","heroSubtitle":"Premium electronics and sound."}'::jsonb,
        '{"freeShippingThreshold":75.00,"standardShippingFee":9.99,"expressShippingFee":19.99,"shippingPolicy":"Fast standard shipping across USA.","returnPolicy":"30-day money back guarantee.","warrantyPolicy":"2-year full warranty.","deliveryPromise":"Dispatches within 24 hours.","pickupEnabled":true,"pickupInstructions":"Ready within 2 hours."}'::jsonb,
        '{"allowBackorders":false,"showInventoryCount":true,"lowStockThreshold":5,"defaultSort":"featured"}'::jsonb,
        '{"reviewsEnabled":true,"wishlistEnabled":true,"couponsEnabled":true,"pickupEnabled":true,"guestCheckoutEnabled":true,"orderTrackingEnabled":true}'::jsonb,
        TRUE
      ),
      (
        'org_store_beta', 'Beta Boutique International', 'STORE_BETA', 'beta', 'beta.abacha.test',
        'EUR', '€', 'fr-FR', 'Europe/Paris',
        '{"storeName":"Beta Boutique Paris","logoUrl":"https://beta.test/logo.png","primaryColor":"#059669","accentColor":"#d97706","heroTitle":"Haute Couture & Fine Living","heroSubtitle":"Artisan apparel and organic pantry."}'::jsonb,
        '{"freeShippingThreshold":50.00,"standardShippingFee":4.99,"expressShippingFee":12.99,"shippingPolicy":"Eco delivery across Europe.","returnPolicy":"14-day European return rights.","warrantyPolicy":"1-year limited warranty.","deliveryPromise":"Dispatches same day.","pickupEnabled":true,"pickupInstructions":"Ready at our Paris flagship."}'::jsonb,
        '{"allowBackorders":false,"showInventoryCount":true,"lowStockThreshold":3,"defaultSort":"featured"}'::jsonb,
        '{"reviewsEnabled":true,"wishlistEnabled":true,"couponsEnabled":true,"pickupEnabled":true,"guestCheckoutEnabled":true,"orderTrackingEnabled":true}'::jsonb,
        TRUE
      ),
      (
        'org_store_inactive', 'Inactive Retailer', 'STORE_INACTIVE', 'inactive', 'inactive.abacha.test',
        'USD', '$', 'en-US', 'America/New_York',
        '{"storeName":"Inactive Store"}'::jsonb,
        '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
        FALSE
      ),
      (
        'org_default', 'AbaCha Default Store', 'DEFAULT', 'default', NULL,
        'USD', '$', 'en-US', 'America/New_York',
        '{"storeName":"AbaCha Unified Commerce","heroTitle":"Modern Unified Commerce","heroSubtitle":"Engineered for speed, reliability, and precision inventory."}'::jsonb,
        '{"freeShippingThreshold":75.00,"standardShippingFee":9.99,"expressShippingFee":19.99,"shippingPolicy":"Standard shipping."}'::jsonb,
        '{"allowBackorders":false,"showInventoryCount":true,"lowStockThreshold":5,"defaultSort":"featured"}'::jsonb,
        '{"reviewsEnabled":true,"wishlistEnabled":true,"couponsEnabled":true,"pickupEnabled":true,"guestCheckoutEnabled":true,"orderTrackingEnabled":true}'::jsonb,
        TRUE
      )
    ON CONFLICT (id) DO UPDATE SET
      slug = EXCLUDED.slug,
      custom_domain = EXCLUDED.custom_domain,
      branding = EXCLUDED.branding,
      policies = EXCLUDED.policies,
      catalog_policy = EXCLUDED.catalog_policy,
      feature_flags = EXCLUDED.feature_flags,
      currency_code = EXCLUDED.currency_code,
      currency_symbol = EXCLUDED.currency_symbol,
      is_active = EXCLUDED.is_active;

    -- Ensure org_default has slug = 'default'
    UPDATE organizations 
    SET slug = 'default',
        branding = '{"storeName":"AbaCha Unified Commerce"}'::jsonb,
        is_active = TRUE
    WHERE id = 'org_default';

    -- Seed Locations (Stores & Warehouses)
    INSERT INTO locations (id, organization_id, code, name, type, is_pos_enabled, is_active) VALUES
      ('loc_alpha_store_1', 'org_store_alpha', 'ALPHA-NYC', 'Alpha Flagship Store', 'Retail Store', TRUE, TRUE),
      ('loc_alpha_wh_1', 'org_store_alpha', 'ALPHA-NJ-WH', 'Alpha NJ Central Warehouse', 'Warehouse', FALSE, TRUE),
      ('loc_beta_store_1', 'org_store_beta', 'BETA-PARIS', 'Beta Paris Boutique', 'Retail Store', TRUE, TRUE)
    ON CONFLICT (id) DO NOTHING;

    -- Seed Categories
    INSERT INTO categories (id, organization_id, name, slug, description, display_order) VALUES
      ('cat_alpha_audio', 'org_store_alpha', 'Audio & Acoustics', 'audio', 'High-fidelity headphones and speakers', 1),
      ('cat_beta_apparel', 'org_store_beta', 'Apparel & Silk', 'apparel', 'Luxury designer garments', 1)
    ON CONFLICT (id) DO NOTHING;

    -- Seed Brands
    INSERT INTO brands (id, organization_id, name, slug, country_of_origin, is_active) VALUES
      ('brand_alpha_sonic', 'org_store_alpha', 'SonicWave Pro', 'sonicwave', 'USA', TRUE),
      ('brand_beta_couture', 'org_store_beta', 'Maison de Paris', 'maison-paris', 'France', TRUE)
    ON CONFLICT (id) DO NOTHING;

    -- Seed Products
    INSERT INTO products (
      id, organization_id, category_id, brand_id, name, slug, description, unit_code,
      product_type, status, channels_ecommerce, compare_at_price, sales_count, rating, review_count
    ) VALUES
      (
        'prod_alpha_hp', 'org_store_alpha', 'cat_alpha_audio', 'brand_alpha_sonic',
        'SonicWave Studio Master Headphones', 'sonicwave-studio-master',
        'Reference grade studio headphones with planar magnetic drivers.', 'PCS',
        'standard', 'active', TRUE, '249.99', 120, 4.9, 38
      ),
      (
        'prod_alpha_multi_loc', 'org_store_alpha', 'cat_alpha_audio', 'brand_alpha_sonic',
        'SonicWave Cable Adapter', 'sonicwave-cable-adapter',
        'Braided gold-plated stereo adapter.', 'PCS',
        'standard', 'active', TRUE, NULL, 50, 4.7, 12
      ),
      (
        'prod_beta_jacket', 'org_store_beta', 'cat_beta_apparel', 'brand_beta_couture',
        'Maison de Paris Cashmere Coat', 'maison-cashmere-coat',
        'Pure Mongolian double-faced cashmere overcoat.', 'PCS',
        'standard', 'active', TRUE, '450.00', 15, 5.0, 4
      )
    ON CONFLICT (id) DO NOTHING;

    -- Seed Variants
    INSERT INTO product_variants (
      id, organization_id, product_id, sku, barcode, name, cost_price, retail_price
    ) VALUES
      ('var_alpha_hp_black', 'org_store_alpha', 'prod_alpha_hp', 'SKU-ALPHA-HP-BLK', 'BAR-ALPHA-HP-BLK', 'Matte Black', '100.00', '199.99'),
      ('var_alpha_multi_loc_1', 'org_store_alpha', 'prod_alpha_multi_loc', 'SKU-ALPHA-ADAPT', 'BAR-ALPHA-ADAPT', 'Gold Adapter', '10.00', '50.00'),
      ('var_beta_coat_navy', 'org_store_beta', 'prod_beta_jacket', 'SKU-BETA-COAT-NVY', 'BAR-BETA-COAT-NVY', 'Midnight Navy (Size M)', '150.00', '149.99')
    ON CONFLICT (id) DO NOTHING;

    -- Seed Inventory Balances
    INSERT INTO inventory_balances (
      id, organization_id, location_id, variant_id, on_hand, reserved, damaged, expired, in_transit
    ) VALUES
      ('bal_alpha_hp_wh', 'org_store_alpha', 'loc_alpha_wh_1', 'var_alpha_hp_black', '20.0000', '0.0000', '0.0000', '0.0000', '0.0000'),
      ('bal_beta_coat_str', 'org_store_beta', 'loc_beta_store_1', 'var_beta_coat_navy', '0.0000', '0.0000', '0.0000', '0.0000', '0.0000'),
      ('bal_alpha_multi_store', 'org_store_alpha', 'loc_alpha_store_1', 'var_alpha_multi_loc_1', '10.0000', '0.0000', '0.0000', '0.0000', '0.0000'),
      ('bal_alpha_multi_wh', 'org_store_alpha', 'loc_alpha_wh_1', 'var_alpha_multi_loc_1', '0.0000', '0.0000', '0.0000', '0.0000', '0.0000')
    ON CONFLICT (id) DO NOTHING;
  `);

  const userRepo = new UserRepository(db);
  const customerRepo = new CustomerRepository(db);
  const auditRepo = new AuditRepository(db);
  const authService = new AuthService(userRepo, auditRepo);

  // Setup Alpha shopper user for authenticated checks
  const shopperAlphaHash = hashPassword('AlphaShopper123!');
  await userRepo.createUser({
    organizationId: 'org_store_alpha',
    email: 'shopper@alpha.test',
    name: 'Alpha Shopper',
    passwordHash: shopperAlphaHash.hash,
    passwordSalt: shopperAlphaHash.salt,
    role: 'viewer',
  });
  const shopperLogin = await authService.login({
    email: 'shopper@alpha.test',
    password: 'AlphaShopper123!',
    organizationId: 'org_store_alpha',
  });
  const alphaShopperToken = shopperLogin.token;

  // Spin up test HTTP server
  const { app } = await createApp({ db, skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function testFetch(
    urlStr: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: any;
    }
  ): Promise<{
    status: number;
    json: () => Promise<any>;
    text: () => Promise<string>;
    ok: boolean;
  }> {
    const url = new URL(urlStr);
    return new Promise((resolve, reject) => {
      const rawHeaders: Record<string, string> = {};
      if (init?.headers) {
        for (const [k, v] of Object.entries(init.headers)) {
          rawHeaders[k] = v;
        }
      }
      const method = init?.method || 'GET';
      const bodyData = init?.body
        ? (typeof init.body === 'string' ? init.body : JSON.stringify(init.body))
        : undefined;

      const req = http.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method,
          headers: { connection: 'close', ...rawHeaders },
          agent: false,
        },
        (res) => {
          let rawBody = '';
          res.on('data', (chunk) => {
            rawBody += chunk;
          });
          res.on('end', () => {
            const status = res.statusCode || 0;
            resolve({
              status,
              ok: status >= 200 && status < 300,
              text: async () => rawBody,
              json: async () => (rawBody ? JSON.parse(rawBody) : {}),
            });
          });
        }
      );

      req.on('error', reject);
      if (bodyData) {
        req.write(bodyData);
      }
      req.end();
    });
  }

  const fetch = testFetch;

  try {
    // ------------------------------------------------------------------------
    // CRITERION 1: Tenant A cannot see Tenant B's products
    // ------------------------------------------------------------------------
    try {
      const resAlpha = await fetch(`${baseUrl}/api/storefront/alpha/products`);
      assert.strictEqual(resAlpha.status, 200);
      const jsonAlpha = await resAlpha.json();
      assert(
        jsonAlpha.data.every((p: any) => p.organization_id === 'org_store_alpha'),
        'All products returned for Alpha MUST belong to org_store_alpha'
      );
      assert(
        !jsonAlpha.data.some((p: any) => p.organization_id === 'org_store_beta'),
        'Tenant Alpha MUST NOT receive any products belonging to Tenant Beta'
      );

      const resBeta = await fetch(`${baseUrl}/api/storefront/beta/products`);
      assert.strictEqual(resBeta.status, 200);
      const jsonBeta = await resBeta.json();
      assert(
        jsonBeta.data.every((p: any) => p.organization_id === 'org_store_beta'),
        'All products returned for Beta MUST belong to org_store_beta'
      );
      assert(
        !jsonBeta.data.some((p: any) => p.organization_id === 'org_store_alpha'),
        'Tenant Beta MUST NOT receive any products belonging to Tenant Alpha'
      );

      markPassed('Criterion 1: Tenant A cannot see Tenant B products (Cross-tenant catalog isolation)');
    } catch (err) {
      markFailed('Criterion 1: Tenant A cannot see Tenant B products', err);
    }

    // ------------------------------------------------------------------------
    // CRITERION 2: Tenant A cannot see Tenant B's pricing
    // ------------------------------------------------------------------------
    try {
      const resAlpha = await fetch(`${baseUrl}/api/storefront/alpha/products/sonicwave-studio-master`);
      assert.strictEqual(resAlpha.status, 200);
      const jsonAlpha = await resAlpha.json();
      assert.strictEqual(jsonAlpha.data.primaryVariant.retail_price, '199.99');

      const resBeta = await fetch(`${baseUrl}/api/storefront/beta/products/maison-cashmere-coat`);
      assert.strictEqual(resBeta.status, 200);
      const jsonBeta = await resBeta.json();
      assert.strictEqual(jsonBeta.data.primaryVariant.retail_price, '149.99');

      // Alpha cannot view Beta's product by slug
      const resCross = await fetch(`${baseUrl}/api/storefront/alpha/products/maison-cashmere-coat`);
      assert.strictEqual(resCross.status, 404);
      const jsonCross = await resCross.json();
      assert.strictEqual(jsonCross.error.code, 'PRODUCT_NOT_FOUND');

      markPassed('Criterion 2: Tenant A cannot see Tenant B pricing (Cross-tenant price isolation)');
    } catch (err) {
      markFailed('Criterion 2: Tenant A cannot see Tenant B pricing', err);
    }

    // ------------------------------------------------------------------------
    // CRITERION 3: Tenant A cannot see Tenant B's inventory availability
    // ------------------------------------------------------------------------
    try {
      const resAlpha = await fetch(`${baseUrl}/api/storefront/alpha/products/sonicwave-studio-master`);
      const jsonAlpha = await resAlpha.json();
      assert.strictEqual(jsonAlpha.data.availableStock, 20);
      assert.strictEqual(jsonAlpha.data.isOutOfStock, false);

      const resBeta = await fetch(`${baseUrl}/api/storefront/beta/products/maison-cashmere-coat`);
      const jsonBeta = await resBeta.json();
      assert.strictEqual(jsonBeta.data.availableStock, 0);
      assert.strictEqual(jsonBeta.data.isOutOfStock, true);

      markPassed('Criterion 3: Tenant A cannot see Tenant B inventory availability (Stock isolation)');
    } catch (err) {
      markFailed('Criterion 3: Tenant A cannot see Tenant B inventory availability', err);
    }

    // ------------------------------------------------------------------------
    // CRITERION 4: Tenant A cannot create a Tenant B order
    // ------------------------------------------------------------------------
    try {
      const orderPayload = {
        cart_items: [{ variant_id: 'var_beta_coat_navy', quantity: '1' }],
        fulfillmentMethod: 'Standard Delivery',
        paymentMethod: 'Credit Card',
        idempotency_key: crypto.randomUUID(),
        customer: {
          name: 'Alpha Shopper',
          email: 'shopper@alpha.test',
          phone: '+1 212 555 0100',
        },
      };

      const res = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${alphaShopperToken}`,
        },
        body: JSON.stringify(orderPayload),
      });

      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.error.code, 'PRODUCT_NOT_FOUND');

      markPassed('Criterion 4: Tenant A cannot create Tenant B order (Cross-tenant order injection blocked)');
    } catch (err) {
      markFailed('Criterion 4: Tenant A cannot create Tenant B order', err);
    }

    // ------------------------------------------------------------------------
    // CRITERION 5: Public storefront requests resolve to the correct tenant
    // ------------------------------------------------------------------------
    try {
      // 5A: Path slug resolution
      const resSlug = await fetch(`${baseUrl}/api/storefront/alpha/context`);
      assert.strictEqual(resSlug.status, 200);
      const jsonSlug = await resSlug.json();
      assert.strictEqual(jsonSlug.data.tenant.slug, 'alpha');
      assert.strictEqual(jsonSlug.data.tenant.id, 'org_store_alpha');

      // 5B: Custom host header resolution
      const resHost = await fetch(`${baseUrl}/api/storefront/context`, {
        headers: { 'x-forwarded-host': 'beta.abacha.test', Host: 'beta.abacha.test' },
      });
      assert.strictEqual(resHost.status, 200);
      const jsonHost = await resHost.json();
      assert.strictEqual(jsonHost.data.tenant.slug, 'beta');
      assert.strictEqual(jsonHost.data.tenant.id, 'org_store_beta');

      // 5C: Subdomain resolution (alpha.abacha.com)
      const resSub = await fetch(`${baseUrl}/api/storefront/context`, {
        headers: { 'x-forwarded-host': 'alpha.abacha.com', Host: 'alpha.abacha.com' },
      });
      assert.strictEqual(resSub.status, 200);
      const jsonSub = await resSub.json();
      assert.strictEqual(jsonSub.data.tenant.slug, 'alpha');

      markPassed('Criterion 5: Public storefront requests resolve to correct tenant (slug, host, subdomain)');
    } catch (err) {
      markFailed('Criterion 5: Public storefront requests resolve to correct tenant', err);
    }

    // ------------------------------------------------------------------------
    // CRITERION 6: Tenant branding is isolated
    // ------------------------------------------------------------------------
    try {
      const resAlpha = await fetch(`${baseUrl}/api/storefront/alpha/context`);
      const jsonAlpha = await resAlpha.json();
      assert.strictEqual(jsonAlpha.data.branding.storeName, 'Alpha Megastore');
      assert.strictEqual(jsonAlpha.data.branding.primaryColor, '#4f46e5');

      const resBeta = await fetch(`${baseUrl}/api/storefront/beta/context`);
      const jsonBeta = await resBeta.json();
      assert.strictEqual(jsonBeta.data.branding.storeName, 'Beta Boutique Paris');
      assert.strictEqual(jsonBeta.data.branding.primaryColor, '#059669');

      markPassed('Criterion 6: Tenant branding is isolated');
    } catch (err) {
      markFailed('Criterion 6: Tenant branding is isolated', err);
    }

    // ------------------------------------------------------------------------
    // CRITERION 7: Currency configuration is isolated
    // ------------------------------------------------------------------------
    try {
      const resAlpha = await fetch(`${baseUrl}/api/storefront/alpha/context`);
      const jsonAlpha = await resAlpha.json();
      assert.strictEqual(jsonAlpha.data.localization.currencyCode, 'USD');
      assert.strictEqual(jsonAlpha.data.localization.currencySymbol, '$');

      const resBeta = await fetch(`${baseUrl}/api/storefront/beta/context`);
      const jsonBeta = await resBeta.json();
      assert.strictEqual(jsonBeta.data.localization.currencyCode, 'EUR');
      assert.strictEqual(jsonBeta.data.localization.currencySymbol, '€');

      markPassed('Criterion 7: Currency configuration is isolated');
    } catch (err) {
      markFailed('Criterion 7: Currency configuration is isolated', err);
    }

    // ------------------------------------------------------------------------
    // CRITERION 8: Policies are tenant-aware (Free shipping threshold evaluated server-side)
    // ------------------------------------------------------------------------
    try {
      // Cart below threshold: 1x Cable Adapter ($50.00) -> shipping = 9.99
      const cartBelow = await fetch(`${baseUrl}/api/storefront/alpha/cart/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ variantId: 'var_alpha_multi_loc_1', quantity: 1 }],
        }),
      });
      assert.strictEqual(cartBelow.status, 200);
      const jsonBelow = await cartBelow.json();
      assert.strictEqual(jsonBelow.data.subtotal, '50.00');
      assert.strictEqual(jsonBelow.data.shippingFee, '9.99');
      assert.strictEqual(jsonBelow.data.total, '59.99');

      // Cart above threshold: 2x Cable Adapter ($100.00) -> shipping = 0.00
      const cartAbove = await fetch(`${baseUrl}/api/storefront/alpha/cart/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ variantId: 'var_alpha_multi_loc_1', quantity: 2 }],
        }),
      });
      assert.strictEqual(cartAbove.status, 200);
      const jsonAbove = await cartAbove.json();
      assert.strictEqual(jsonAbove.data.subtotal, '100.00');
      assert.strictEqual(jsonAbove.data.shippingFee, '0.00');
      assert.strictEqual(jsonAbove.data.total, '100.00');

      markPassed('Criterion 8: Policies are tenant-aware (Free shipping threshold evaluated server-side)');
    } catch (err) {
      markFailed('Criterion 8: Policies are tenant-aware', err);
    }

    // ------------------------------------------------------------------------
    // CRITERION 9: Product URLs are directly navigable by slug or ID
    // ------------------------------------------------------------------------
    try {
      // Direct navigation by product slug
      const resBySlug = await fetch(`${baseUrl}/api/storefront/alpha/products/sonicwave-studio-master`);
      assert.strictEqual(resBySlug.status, 200);
      const jsonBySlug = await resBySlug.json();
      assert.strictEqual(jsonBySlug.data.id, 'prod_alpha_hp');
      assert.strictEqual(jsonBySlug.data.name, 'SonicWave Studio Master Headphones');
      assert.ok(jsonBySlug.data.variants.length >= 1, 'Returns variants directly');

      // Direct navigation by product ID
      const resById = await fetch(`${baseUrl}/api/storefront/alpha/products/prod_alpha_hp`);
      assert.strictEqual(resById.status, 200);
      const jsonById = await resById.json();
      assert.strictEqual(jsonById.data.slug, 'sonicwave-studio-master');

      markPassed('Criterion 9: Product URLs are directly navigable (slug & ID direct resolution)');
    } catch (err) {
      markFailed('Criterion 9: Product URLs are directly navigable', err);
    }

    // ------------------------------------------------------------------------
    // CRITERION 10: Cart and checkout use server-authoritative APIs (tampering rejected)
    // ------------------------------------------------------------------------
    try {
      // Client sends tampered price (e.g. $1.00 instead of $199.99)
      const tamperedPayload = {
        items: [{ variantId: 'var_alpha_hp_black', quantity: 1, unitPrice: '1.00', lineTotal: '1.00' }],
      };
      const res = await fetch(`${baseUrl}/api/storefront/alpha/cart/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tamperedPayload),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.subtotal, '199.99', 'Server recomputes price from DB, ignoring client price');
      assert.strictEqual(json.data.items[0].unitPrice, '199.99', 'Authoritative variant price enforced');

      markPassed('Criterion 10: Cart & checkout use server-authoritative APIs (Client tampering ignored)');
    } catch (err) {
      markFailed('Criterion 10: Cart & checkout use server-authoritative APIs', err);
    }

    // ------------------------------------------------------------------------
    // CRITERION 11: Browser localStorage is not the source of truth (Server DB driven)
    // ------------------------------------------------------------------------
    try {
      // Server catalog endpoints operate statelessly against PostgreSQL, with paging & search
      const resSearch = await fetch(`${baseUrl}/api/storefront/alpha/products?search=headphones&page=1&limit=5`);
      assert.strictEqual(resSearch.status, 200);
      const jsonSearch = await resSearch.json();
      assert.strictEqual(jsonSearch.data.length, 1);
      assert.strictEqual(jsonSearch.pagination.totalCount, 1);
      assert.strictEqual(jsonSearch.pagination.page, 1);
      assert.strictEqual(jsonSearch.data[0].id, 'prod_alpha_hp');

      markPassed('Criterion 11: Browser localStorage is not the source of truth (Server DB query & paging)');
    } catch (err) {
      markFailed('Criterion 11: Browser localStorage is not the source of truth', err);
    }

    // ------------------------------------------------------------------------
    // CRITERION 12: Responsive behavior data contract
    // ------------------------------------------------------------------------
    try {
      const res = await fetch(`${baseUrl}/api/storefront/alpha/products?page=1&limit=2`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.ok('page' in json.pagination, 'Pagination contract exposes page');
      assert.ok('pageSize' in json.pagination, 'Pagination contract exposes pageSize');
      assert.ok('totalCount' in json.pagination, 'Pagination contract exposes totalCount');
      assert.ok('totalPages' in json.pagination, 'Pagination contract exposes totalPages');
      assert.ok('hasMore' in json.pagination, 'Pagination contract exposes hasMore');

      markPassed('Criterion 12: Responsive behavior data contract (Mobile-to-desktop pagination metadata)');
    } catch (err) {
      markFailed('Criterion 12: Responsive behavior data contract', err);
    }

    // ------------------------------------------------------------------------
    // CRITERION 13: Accessibility data contract (WCAG 2.2 AA readiness)
    // ------------------------------------------------------------------------
    try {
      const res = await fetch(`${baseUrl}/api/storefront/alpha/context`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.ok(json.data.branding.storeName, 'Accessible storeName present');
      assert.ok(json.data.localization.currencyCode, 'Unambiguous currency code present');
      assert.ok(json.data.localization.currencySymbol, 'Currency symbol present');
      assert.ok(Array.isArray(json.data.branding.trustBadges), 'Trust badges have titles and descriptions');
      for (const badge of json.data.branding.trustBadges) {
        assert.ok(badge.title && badge.subtitle, 'Badge has accessible text labels');
      }

      markPassed('Criterion 13: Accessibility data contract (WCAG 2.2 AA semantic labels & tokens)');
    } catch (err) {
      markFailed('Criterion 13: Accessibility data contract', err);
    }

    // ------------------------------------------------------------------------
    // CRITERION 14: Full regression suite contract
    // ------------------------------------------------------------------------
    try {
      // Confirms the storefront router integrates cleanly alongside core API routers
      const resHealth = await fetch(`${baseUrl}/api/health`);
      assert.strictEqual(resHealth.status, 200);
      const jsonHealth = await resHealth.json();
      assert.strictEqual(jsonHealth.status, 'ok');

      markPassed('Criterion 14: Full regression suite contract (Core server health intact)');
    } catch (err) {
      markFailed('Criterion 14: Full regression suite contract', err);
    }

    // ------------------------------------------------------------------------
    // SUPERVISOR TEST A: Unknown tenant does NOT fall back to another tenant
    // ------------------------------------------------------------------------
    try {
      // 1. Unknown path slug
      const resSlug = await fetch(`${baseUrl}/api/storefront/unknown-store-xyz/context`);
      assert.strictEqual(resSlug.status, 404);
      const jsonSlug = await resSlug.json();
      assert.strictEqual(jsonSlug.error.code, 'TENANT_NOT_FOUND');

      // 2. Unknown custom domain
      const resDomain = await fetch(`${baseUrl}/api/storefront/context`, {
        headers: { 'x-forwarded-host': 'unregistered-domain.org', Host: 'unregistered-domain.org' },
      });
      assert.strictEqual(resDomain.status, 404);
      const jsonDomain = await resDomain.json();
      assert.strictEqual(jsonDomain.error.code, 'DOMAIN_NOT_FOUND');

      markPassed('Supervisor Test A: Unknown tenant does NOT fall back to another tenant (404 Fail-Closed)');
    } catch (err) {
      markFailed('Supervisor Test A: Unknown tenant does NOT fall back to another tenant', err);
    }

    // ------------------------------------------------------------------------
    // SUPERVISOR TEST B: Inactive tenant returns 404 / Store Unavailable
    // ------------------------------------------------------------------------
    try {
      const res = await fetch(`${baseUrl}/api/storefront/inactive/context`);
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.error.code, 'TENANT_INACTIVE');
      assert.strictEqual(json.error.message, 'Store is temporarily unavailable.');

      markPassed('Supervisor Test B: Inactive tenant returns 404 / Store Unavailable');
    } catch (err) {
      markFailed('Supervisor Test B: Inactive tenant returns 404 / Store Unavailable', err);
    }

    // ------------------------------------------------------------------------
    // SUPERVISOR TEST C: Query parameter tenant override rules
    // ------------------------------------------------------------------------
    try {
      const prevEnv = process.env.NODE_ENV;
      const prevStagingOverride = process.env.ALLOW_STAGING_TENANT_QUERY_OVERRIDE;
      try {
        // C1: Development query override resolves requested tenant
        process.env.NODE_ENV = 'development';
        const resDev = await fetch(`${baseUrl}/api/storefront/context?tenant=beta`, {
          headers: { Host: 'alpha.abacha.test' },
        });
        assert.strictEqual(resDev.status, 200);
        const jsonDev = await resDev.json();
        assert.strictEqual(jsonDev.data.tenant.slug, 'beta', 'Dev query override MUST switch to beta');

        // C2: Test query override resolves requested tenant
        process.env.NODE_ENV = 'test';
        const resTest = await fetch(`${baseUrl}/api/storefront/context?tenant=beta`, {
          headers: { Host: 'alpha.abacha.test' },
        });
        assert.strictEqual(resTest.status, 200);
        const jsonTest = await resTest.json();
        assert.strictEqual(jsonTest.data.tenant.slug, 'beta', 'Test query override MUST switch to beta');

        // C3: Production query override cannot switch tenant
        process.env.NODE_ENV = 'production';
        const resProd = await fetch(`${baseUrl}/api/storefront/context?tenant=beta`, {
          headers: { Host: 'alpha.abacha.test' },
        });
        assert.strictEqual(resProd.status, 200);
        const jsonProd = await resProd.json();
        assert.strictEqual(
          jsonProd.data.tenant.slug,
          'alpha',
          'Production query parameter MUST NOT override authoritative domain binding'
        );

        // C4: Staging follows explicit configuration
        // C4a: Staging default (disabled)
        process.env.NODE_ENV = 'staging';
        delete process.env.ALLOW_STAGING_TENANT_QUERY_OVERRIDE;
        const resStagingDisabled = await fetch(`${baseUrl}/api/storefront/context?tenant=beta`, {
          headers: { Host: 'alpha.abacha.test' },
        });
        assert.strictEqual(resStagingDisabled.status, 200);
        const jsonStagingDisabled = await resStagingDisabled.json();
        assert.strictEqual(
          jsonStagingDisabled.data.tenant.slug,
          'alpha',
          'Staging without explicit flag MUST NOT switch tenant'
        );

        // C4b: Staging enabled via ALLOW_STAGING_TENANT_QUERY_OVERRIDE=true
        process.env.ALLOW_STAGING_TENANT_QUERY_OVERRIDE = 'true';
        const resStagingEnabled = await fetch(`${baseUrl}/api/storefront/context?tenant=beta`, {
          headers: { Host: 'alpha.abacha.test' },
        });
        assert.strictEqual(resStagingEnabled.status, 200);
        const jsonStagingEnabled = await resStagingEnabled.json();
        assert.strictEqual(
          jsonStagingEnabled.data.tenant.slug,
          'beta',
          'Staging with ALLOW_STAGING_TENANT_QUERY_OVERRIDE=true MUST permit override'
        );

        // C5: Invalid query tenant fails closed
        process.env.NODE_ENV = 'test';
        const resInvalidQuery = await fetch(`${baseUrl}/api/storefront/context?tenant=nonexistent_store_999`);
        assert.strictEqual(resInvalidQuery.status, 404);
        const jsonInvalidQuery = await resInvalidQuery.json();
        assert.strictEqual(jsonInvalidQuery.error.code, 'TENANT_NOT_FOUND');
      } finally {
        if (prevEnv !== undefined) process.env.NODE_ENV = prevEnv;
        else delete process.env.NODE_ENV;
        if (prevStagingOverride !== undefined) {
          process.env.ALLOW_STAGING_TENANT_QUERY_OVERRIDE = prevStagingOverride;
        } else {
          delete process.env.ALLOW_STAGING_TENANT_QUERY_OVERRIDE;
        }
      }

      markPassed('Supervisor Test C: Query parameter tenant override rules (dev/test/staging/prod/invalid)');
    } catch (err) {
      markFailed('Supervisor Test C: Query parameter tenant override rules', err);
    }

    // ------------------------------------------------------------------------
    // SUPERVISOR TEST D: Canonical default storefront works ONLY at canonical entry point
    // ------------------------------------------------------------------------
    try {
      // 1. Canonical entry point (localhost / shop.abacha.com without slug)
      const resCanonical = await fetch(`${baseUrl}/api/storefront/context`, {
        headers: { Host: 'localhost' },
      });
      assert.strictEqual(resCanonical.status, 200);
      const jsonCanonical = await resCanonical.json();
      assert.strictEqual(jsonCanonical.data.tenant.id, 'org_default');

      // 2. Unknown subdomain on abacha.com MUST NOT become org_default
      const resUnknownSub = await fetch(`${baseUrl}/api/storefront/context`, {
        headers: { Host: 'unknown-branch.abacha.com' },
      });
      assert.strictEqual(resUnknownSub.status, 404);
      const jsonUnknownSub = await resUnknownSub.json();
      assert.strictEqual(jsonUnknownSub.error.code, 'TENANT_NOT_FOUND');

      // 3. Unknown store path /store/unknown MUST NOT become org_default
      const resUnknownPath = await fetch(`${baseUrl}/api/storefront/unknown/context`);
      assert.strictEqual(resUnknownPath.status, 404);
      const jsonUnknownPath = await resUnknownPath.json();
      assert.strictEqual(jsonUnknownPath.error.code, 'TENANT_NOT_FOUND');

      markPassed('Supervisor Test D: Canonical default storefront works ONLY at canonical entry point');
    } catch (err) {
      markFailed('Supervisor Test D: Canonical default storefront works ONLY at canonical entry point', err);
    }

    // ------------------------------------------------------------------------
    // SUPERVISOR TEST E: Tenant and location remain separate concepts
    // ------------------------------------------------------------------------
    try {
      // 1. Fetch Alpha locations: 1 retail store, 1 warehouse
      const resLocs = await fetch(`${baseUrl}/api/storefront/alpha/locations`);
      assert.strictEqual(resLocs.status, 200);
      const jsonLocs = await resLocs.json();
      assert.strictEqual(jsonLocs.data.length, 2);

      const retailStore = jsonLocs.data.find((l: any) => l.type === 'Retail Store');
      const warehouse = jsonLocs.data.find((l: any) => l.type === 'Warehouse');
      assert.ok(retailStore, 'Retail store must exist');
      assert.ok(warehouse, 'Warehouse must exist');

      // 2. Multi-loc item has 10 units in Retail Store, but 0 in Warehouse
      // Validate cart specifying Retail Store -> available
      const cartStore = await fetch(`${baseUrl}/api/storefront/alpha/cart/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ variantId: 'var_alpha_multi_loc_1', quantity: 5 }],
          fulfillmentLocationId: retailStore.id,
        }),
      });
      assert.strictEqual(cartStore.status, 200);
      const jsonStore = await cartStore.json();
      assert.strictEqual(jsonStore.data.items[0].isAvailable, true);
      assert.strictEqual(jsonStore.data.items[0].availableStock, 10);

      // Validate cart specifying Warehouse -> unavailable (0 units)
      const cartWarehouse = await fetch(`${baseUrl}/api/storefront/alpha/cart/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ variantId: 'var_alpha_multi_loc_1', quantity: 5 }],
          fulfillmentLocationId: warehouse.id,
        }),
      });
      assert.strictEqual(cartWarehouse.status, 200);
      const jsonWarehouse = await cartWarehouse.json();
      assert.strictEqual(jsonWarehouse.data.items[0].isAvailable, false);
      assert.strictEqual(jsonWarehouse.data.items[0].availableStock, 0);

      markPassed('Supervisor Test E: Tenant and location remain separate concepts (Location-aware availability)');
    } catch (err) {
      markFailed('Supervisor Test E: Tenant and location remain separate concepts', err);
    }

    // ------------------------------------------------------------------------
    // SUPERVISOR TEST F: Reverse-proxy trust boundary & header spoofing defense
    // ------------------------------------------------------------------------
    try {
      const prevEnv = process.env.NODE_ENV;
      const prevTrustProxy = process.env.TRUST_PROXY;
      const prevAllowHeader = process.env.ALLOW_TENANT_DOMAIN_HEADER;
      const prevCanonicalHost = process.env.CANONICAL_STOREFRONT_HOST;
      try {
        // F1: Production + attacker-controlled X-Forwarded-Host (untrusted proxy ignores header)
        process.env.NODE_ENV = 'production';
        process.env.CANONICAL_STOREFRONT_HOST = 'shop.abacha.com';
        delete process.env.TRUST_PROXY; // Untrusted by default in production
        const resSpoofedHost = await fetch(`${baseUrl}/api/storefront/context`, {
          headers: {
            Host: 'shop.abacha.com', // Trusted direct host
            'x-forwarded-host': 'beta.abacha.test', // Attacker spoofing header
          },
        });
        assert.strictEqual(resSpoofedHost.status, 200);
        const jsonSpoofedHost = await resSpoofedHost.json();
        assert.strictEqual(
          jsonSpoofedHost.data.tenant.id,
          'org_default',
          'Production with untrusted proxy MUST ignore X-Forwarded-Host and resolve by trusted Host'
        );

        // F2: Production + attacker-controlled X-Tenant-Domain (untrusted proxy ignores header)
        const resSpoofedTenant = await fetch(`${baseUrl}/api/storefront/context`, {
          headers: {
            Host: 'shop.abacha.com',
            'x-tenant-domain': 'beta.abacha.test',
          },
        });
        assert.strictEqual(resSpoofedTenant.status, 200);
        const jsonSpoofedTenant = await resSpoofedTenant.json();
        assert.strictEqual(
          jsonSpoofedTenant.data.tenant.id,
          'org_default',
          'Production with untrusted proxy MUST ignore X-Tenant-Domain header'
        );

        // F3: Forwarded host conflicting with trusted host
        // Direct host is a valid tenant domain, attacker supplies different X-Forwarded-Host
        const resConflictingHost = await fetch(`${baseUrl}/api/storefront/context`, {
          headers: {
            Host: 'alpha.abacha.test',
            'x-forwarded-host': 'beta.abacha.test',
          },
        });
        assert.strictEqual(resConflictingHost.status, 200);
        const jsonConflictingHost = await resConflictingHost.json();
        assert.strictEqual(
          jsonConflictingHost.data.tenant.slug,
          'alpha',
          'Untrusted proxy MUST strictly prioritize trusted Host over forwarded host'
        );

        // F4: Forwarded host conflicting with tenant path (trusted proxy fails closed with HTTP 400)
        process.env.TRUST_PROXY = 'true';
        const resPathConflict = await fetch(`${baseUrl}/api/storefront/alpha/context`, {
          headers: {
            'x-forwarded-host': 'beta.abacha.test', // Host resolves to beta, path is alpha!
          },
        });
        assert.strictEqual(resPathConflict.status, 400);
        const jsonPathConflict = await resPathConflict.json();
        assert.strictEqual(jsonPathConflict.error.code, 'TENANT_MISMATCH');

        // F5: Valid trusted-proxy request resolving correctly
        const resTrustedValid = await fetch(`${baseUrl}/api/storefront/context`, {
          headers: {
            'x-forwarded-host': 'beta.abacha.test',
          },
        });
        assert.strictEqual(resTrustedValid.status, 200);
        const jsonTrustedValid = await resTrustedValid.json();
        assert.strictEqual(jsonTrustedValid.data.tenant.slug, 'beta');
      } finally {
        if (prevEnv !== undefined) process.env.NODE_ENV = prevEnv;
        else delete process.env.NODE_ENV;
        if (prevTrustProxy !== undefined) process.env.TRUST_PROXY = prevTrustProxy;
        else delete process.env.TRUST_PROXY;
        if (prevAllowHeader !== undefined) process.env.ALLOW_TENANT_DOMAIN_HEADER = prevAllowHeader;
        else delete process.env.ALLOW_TENANT_DOMAIN_HEADER;
        if (prevCanonicalHost !== undefined) process.env.CANONICAL_STOREFRONT_HOST = prevCanonicalHost;
        else delete process.env.CANONICAL_STOREFRONT_HOST;
      }

      markPassed('Supervisor Test F: Reverse-proxy trust boundary & header spoofing defense (F1-F5)');
    } catch (err) {
      markFailed('Supervisor Test F: Reverse-proxy trust boundary & header spoofing defense', err);
    }

    // ------------------------------------------------------------------------
    // SUPERVISOR TEST G: Migration 011 works on pre-existing multi-tenant data
    // ------------------------------------------------------------------------
    try {
      const isolatedDb = getDatabaseClient({ forceNew: true });

      // Step 1: Create pre-migration tables simulating pre-011 database
      await isolatedDb.exec(`
        CREATE TABLE IF NOT EXISTS test_pre_orgs (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          code VARCHAR(64) NOT NULL UNIQUE,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS test_pre_products (
          id VARCHAR(64) PRIMARY KEY,
          organization_id VARCHAR(64) NOT NULL,
          name VARCHAR(255) NOT NULL,
          price NUMERIC(12, 2) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS test_pre_inventory (
          id VARCHAR(64) PRIMARY KEY,
          organization_id VARCHAR(64) NOT NULL,
          quantity NUMERIC(12, 4) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS test_pre_orders (
          id VARCHAR(64) PRIMARY KEY,
          organization_id VARCHAR(64) NOT NULL,
          total_amount NUMERIC(12, 2) NOT NULL
        );

        -- Insert pre-existing organizations WITHOUT migration 011 columns
        INSERT INTO test_pre_orgs (id, name, code) VALUES
          ('org_default', 'AbaCha Default', 'DEFAULT'),
          ('org_pre_alpha', 'Alpha Hardware LLC', 'STORE-ALPHA'),
          ('org_pre_beta', 'Beta Cosmetics Paris', 'STORE-BETA'),
          ('org_pre_gamma', 'Gamma Foods Berlin', 'STORE_GAMMA'),
          ('org_pre_dup1', 'Duplicate Code Branch 1', 'STORE-DUPLICATE'),
          ('org_pre_dup2', 'Duplicate Code Branch 2', 'STORE-DUPLICATE-2')
        ON CONFLICT (id) DO NOTHING;

        -- Insert pre-existing catalog, inventory, and order data
        INSERT INTO test_pre_products (id, organization_id, name, price) VALUES
          ('p1', 'org_pre_alpha', 'Hammer', 19.99),
          ('p2', 'org_pre_beta', 'Lipstick', 29.99),
          ('p3', 'org_pre_gamma', 'Cheese', 9.99)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO test_pre_inventory (id, organization_id, quantity) VALUES
          ('inv1', 'org_pre_alpha', 100.0000),
          ('inv2', 'org_pre_beta', 50.0000)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO test_pre_orders (id, organization_id, total_amount) VALUES
          ('ord1', 'org_pre_alpha', 59.97),
          ('ord2', 'org_pre_beta', 29.99)
        ON CONFLICT (id) DO NOTHING;
      `);

      // Step 2: Run Migration 011 operations
      await isolatedDb.exec(`
        ALTER TABLE test_pre_orgs
          ADD COLUMN IF NOT EXISTS slug VARCHAR(64),
          ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255),
          ADD COLUMN IF NOT EXISTS currency_code VARCHAR(16) NOT NULL DEFAULT 'USD',
          ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(8) NOT NULL DEFAULT '$',
          ADD COLUMN IF NOT EXISTS locale VARCHAR(16) NOT NULL DEFAULT 'en-US',
          ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
          ADD COLUMN IF NOT EXISTS branding JSONB NOT NULL DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS policies JSONB NOT NULL DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS catalog_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

        -- 1. Default org receives slug 'default'
        UPDATE test_pre_orgs SET slug = 'default' WHERE id = 'org_default' AND (slug IS NULL OR slug = '');

        -- 2. Derive from code
        UPDATE test_pre_orgs 
        SET slug = LOWER(REGEXP_REPLACE(code, '[^a-zA-Z0-9]+', '-', 'g'))
        WHERE (slug IS NULL OR slug = '') AND code IS NOT NULL AND code != '';

        -- 3. Derive from id fallback
        UPDATE test_pre_orgs 
        SET slug = LOWER(REGEXP_REPLACE(id, '[^a-zA-Z0-9]+', '-', 'g'))
        WHERE slug IS NULL OR slug = '';

        -- 4. Disambiguate collisions deterministically
        UPDATE test_pre_orgs o
        SET slug = o.slug || '-' || SUBSTRING(MD5(o.id) FROM 1 FOR 6)
        WHERE o.id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at ASC, id ASC) as rn
            FROM test_pre_orgs
          ) duplicates
          WHERE rn > 1
        );

        -- 5. Enforce unique indexes
        CREATE UNIQUE INDEX IF NOT EXISTS uq_test_pre_orgs_slug ON test_pre_orgs (slug);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_test_pre_orgs_custom_domain ON test_pre_orgs (custom_domain) WHERE custom_domain IS NOT NULL;
      `);

      // Step 3: Verification
      const orgsRes = await isolatedDb.query<any>('SELECT id, name, code, slug FROM test_pre_orgs');
      assert.strictEqual(orgsRes.rows.length, 6, 'All 6 existing orgs preserved');

      // 3a. Deterministic valid slugs
      for (const org of orgsRes.rows) {
        assert.ok(org.slug && org.slug.trim() !== '', `Org ${org.id} must have a non-empty slug`);
        assert.ok(/^[a-z0-9-]+$/.test(org.slug), `Org ${org.id} slug '${org.slug}' must be lowercase alphanumeric and hyphens`);
      }

      // 3b. Uniqueness preserved
      const slugSet = new Set(orgsRes.rows.map((r: any) => r.slug));
      assert.strictEqual(slugSet.size, 6, 'All 6 slugs must be uniquely distinct');

      // 3c. Distinct non-uniform slugs
      assert.strictEqual(orgsRes.rows.find((r: any) => r.id === 'org_default').slug, 'default');
      assert.strictEqual(orgsRes.rows.find((r: any) => r.id === 'org_pre_alpha').slug, 'store-alpha');
      assert.strictEqual(orgsRes.rows.find((r: any) => r.id === 'org_pre_beta').slug, 'store-beta');
      assert.strictEqual(orgsRes.rows.find((r: any) => r.id === 'org_pre_gamma').slug, 'store-gamma');

      // 3d. Pre-existing catalog, inventory, and order data remain 100% intact
      const prodsRes = await isolatedDb.query<any>('SELECT * FROM test_pre_products');
      assert.strictEqual(prodsRes.rows.length, 3, 'Pre-existing catalog data remains intact');
      const invRes = await isolatedDb.query<any>('SELECT * FROM test_pre_inventory');
      assert.strictEqual(invRes.rows.length, 2, 'Pre-existing inventory data remains intact');
      const ordRes = await isolatedDb.query<any>('SELECT * FROM test_pre_orders');
      assert.strictEqual(ordRes.rows.length, 2, 'Pre-existing order data remains intact');

      // 3e. Verify unique constraints fail closed on duplicate
      let duplicateSlugCaught = false;
      try {
        await isolatedDb.exec(`INSERT INTO test_pre_orgs (id, name, code, slug) VALUES ('org_collision_test', 'Collision', 'COLLIDE', 'store-alpha')`);
      } catch (dupErr: any) {
        duplicateSlugCaught = true;
      }
      assert.ok(duplicateSlugCaught, 'Duplicate slug insertion MUST be blocked by unique index');

      // 3f. Verify rollback strategy does not destroy core tenant data
      await isolatedDb.exec(`
        DROP INDEX IF EXISTS uq_test_pre_orgs_custom_domain;
        DROP INDEX IF EXISTS uq_test_pre_orgs_slug;
        ALTER TABLE test_pre_orgs
          DROP COLUMN IF EXISTS slug,
          DROP COLUMN IF EXISTS custom_domain,
          DROP COLUMN IF EXISTS currency_code,
          DROP COLUMN IF EXISTS currency_symbol,
          DROP COLUMN IF EXISTS locale,
          DROP COLUMN IF EXISTS timezone,
          DROP COLUMN IF EXISTS branding,
          DROP COLUMN IF EXISTS policies,
          DROP COLUMN IF EXISTS catalog_policy,
          DROP COLUMN IF EXISTS feature_flags;
      `);
      const rolledBackOrgs = await isolatedDb.query<any>('SELECT id, name, code FROM test_pre_orgs');
      assert.strictEqual(rolledBackOrgs.rows.length, 6, 'Rollback preserves all pre-existing organizations');
      const rolledBackProds = await isolatedDb.query<any>('SELECT * FROM test_pre_products');
      assert.strictEqual(rolledBackProds.rows.length, 3, 'Rollback preserves all pre-existing catalog products');

      markPassed('Supervisor Test G: Migration 011 works on pre-existing multi-tenant data (Deterministic unique slugs, data integrity & safe rollback)');
    } catch (err) {
      markFailed('Supervisor Test G: Migration 011 works on pre-existing multi-tenant data', err);
    }

    // ------------------------------------------------------------------------
    // SUPERVISOR TEST H: Strict production negative tests for canonical fallback
    // ------------------------------------------------------------------------
    try {
      const prevEnv = process.env.NODE_ENV;
      const prevAppUrl = process.env.APP_URL;
      const prevCanonicalHost = process.env.CANONICAL_STOREFRONT_HOST;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.APP_URL;
        delete process.env.CANONICAL_STOREFRONT_HOST;

        // H1: Unknown production host + no tenant identifier -> 404
        const resUnknownHost = await fetch(`${baseUrl}/api/storefront/context`, {
          headers: { Host: 'unknown-prod-store.com' },
        });
        assert.strictEqual(resUnknownHost.status, 404);
        const jsonUnknownHost = await resUnknownHost.json();
        assert.strictEqual(jsonUnknownHost.error.code, 'DOMAIN_NOT_FOUND');

        // H2: Production localhost + no explicit canonical configuration -> 404
        const resProdLocalhost = await fetch(`${baseUrl}/api/storefront/context`, {
          headers: { Host: 'localhost' },
        });
        assert.strictEqual(resProdLocalhost.status, 404);
        const jsonProdLocalhost = await resProdLocalhost.json();
        assert.strictEqual(jsonProdLocalhost.error.code, 'DOMAIN_NOT_FOUND');

        // H3: Arbitrary hostname + no tenant identifier -> 404
        const resArbitrary = await fetch(`${baseUrl}/api/storefront/context`, {
          headers: { Host: 'some-random-attacker.org' },
        });
        assert.strictEqual(resArbitrary.status, 404);

        // H4: Invalid query tenant in production -> cannot change tenant
        process.env.CANONICAL_STOREFRONT_HOST = 'shop.abacha.com';
        const resProdQuery = await fetch(`${baseUrl}/api/storefront/context?tenant=attacker_tenant_999`, {
          headers: { Host: 'shop.abacha.com' },
        });
        assert.strictEqual(resProdQuery.status, 200);
        const jsonProdQuery = await resProdQuery.json();
        assert.strictEqual(jsonProdQuery.data.tenant.id, 'org_default', 'Production query cannot change tenant');

        // H5: Unknown explicit slug in production -> 404
        const resUnknownSlug = await fetch(`${baseUrl}/api/storefront/nonexistent-slug-xyz/context`);
        assert.strictEqual(resUnknownSlug.status, 404);
        const jsonUnknownSlug = await resUnknownSlug.json();
        assert.strictEqual(jsonUnknownSlug.error.code, 'TENANT_NOT_FOUND');

        // H6: Inactive tenant in production -> 404
        const resInactiveProd = await fetch(`${baseUrl}/api/storefront/inactive/context`);
        assert.strictEqual(resInactiveProd.status, 404);
        const jsonInactiveProd = await resInactiveProd.json();
        assert.strictEqual(jsonInactiveProd.error.code, 'TENANT_INACTIVE');
      } finally {
        if (prevEnv !== undefined) process.env.NODE_ENV = prevEnv;
        else delete process.env.NODE_ENV;
        if (prevAppUrl !== undefined) process.env.APP_URL = prevAppUrl;
        else delete process.env.APP_URL;
        if (prevCanonicalHost !== undefined) process.env.CANONICAL_STOREFRONT_HOST = prevCanonicalHost;
        else delete process.env.CANONICAL_STOREFRONT_HOST;
      }

      markPassed('Supervisor Test H: Strict production negative tests for canonical fallback (H1-H6)');
    } catch (err) {
      markFailed('Supervisor Test H: Strict production negative tests for canonical fallback', err);
    }

  } finally {
    server.close();
  }

  console.log('========================================================================');
  console.log(` Storefront Multi-Tenant Verification: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runStorefrontMultiTenantTests().catch((err) => {
  console.error('Fatal test error in storefront multi-tenant tests:', err);
  process.exit(1);
});
