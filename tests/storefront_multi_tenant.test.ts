process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../server/db/client';
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
        '{"reviewsEnabled":true,"wishlistEnabled":true,"couponsEnabled":false,"pickupEnabled":true,"guestCheckoutEnabled":true,"orderTrackingEnabled":true}'::jsonb,
        TRUE
      ),
      (
        'org_store_inactive', 'Inactive Defunct Store', 'STORE_INACTIVE', 'inactive', 'inactive.abacha.test',
        'USD', '$', 'en-US', 'UTC',
        '{"storeName":"Inactive Store"}'::jsonb,
        '{"freeShippingThreshold":100.00}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        FALSE
      ),
      (
        'org_default', 'AbaCha Global Retail Ltd', 'ABACHA_DEFAULT', 'default', NULL,
        'USD', '$', 'en-US', 'UTC',
        '{"storeName":"AbaCha Unified Commerce"}'::jsonb,
        '{"freeShippingThreshold":75.00,"standardShippingFee":9.99}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        TRUE
      )
    ON CONFLICT (id) DO UPDATE SET
      slug = EXCLUDED.slug,
      custom_domain = EXCLUDED.custom_domain,
      currency_code = EXCLUDED.currency_code,
      currency_symbol = EXCLUDED.currency_symbol,
      branding = EXCLUDED.branding,
      policies = EXCLUDED.policies,
      is_active = EXCLUDED.is_active;

    -- Seed Locations (Tenant vs Location distinction)
    INSERT INTO locations (id, organization_id, code, name, type, is_pos_enabled, is_active, address, phone) VALUES
      ('loc_alpha_store_1', 'org_store_alpha', 'ALPHA-STR1', 'Alpha Downtown Flagship', 'Retail Store', TRUE, TRUE, '100 Broadway, NY', '+1 212 555 0100'),
      ('loc_alpha_wh_1', 'org_store_alpha', 'ALPHA-WH1', 'Alpha Central Warehouse', 'Warehouse', FALSE, TRUE, '50 Industrial Pkwy, NJ', '+1 201 555 0101'),
      ('loc_beta_store_1', 'org_store_beta', 'BETA-STR1', 'Beta Paris Flagship', 'Retail Store', TRUE, TRUE, '15 Rue de Rivoli, Paris', '+33 1 42 68 00 00')
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
    -- 1. Alpha Headphones: 20 units in Alpha Warehouse
    -- 2. Beta Coat: 0 units in Beta Store (Out of stock)
    -- 3. Alpha Multi-Loc: 10 units in Alpha Retail Store, 0 units in Alpha Warehouse (Tests location separation)
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

  // 3. Initialize Server App
  const { app } = await createApp({ db, authService, skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Tenant A cannot see Tenant B's products
    // ------------------------------------------------------------------------
    try {
      const resAlpha = await fetch(`${baseUrl}/api/storefront/alpha/products`);
      assert.strictEqual(resAlpha.status, 200);
      const jsonAlpha = await resAlpha.json();
      assert.strictEqual(jsonAlpha.success, true);
      assert(jsonAlpha.data.length >= 1, 'Alpha should have at least 1 product');
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

      markPassed('1. Tenant A cannot see Tenant B products (Cross-tenant catalog isolation)');
    } catch (err) {
      markFailed('1. Tenant A cannot see Tenant B products', err);
    }

    // ------------------------------------------------------------------------
    // TEST 2: Tenant A cannot see Tenant B's pricing
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

      markPassed('2. Tenant A cannot see Tenant B pricing (Cross-tenant price isolation)');
    } catch (err) {
      markFailed('2. Tenant A cannot see Tenant B pricing', err);
    }

    // ------------------------------------------------------------------------
    // TEST 3: Tenant A cannot see Tenant B's inventory availability
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

      markPassed('3. Tenant A cannot see Tenant B inventory availability (Stock isolation)');
    } catch (err) {
      markFailed('3. Tenant A cannot see Tenant B inventory availability', err);
    }

    // ------------------------------------------------------------------------
    // TEST 4: Tenant A cannot create a Tenant B order
    // ------------------------------------------------------------------------
    try {
      // Shopper logged into Tenant Alpha tries to order Tenant Beta variant
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

      markPassed('4. Tenant A cannot create Tenant B order (Cross-tenant order injection blocked)');
    } catch (err) {
      markFailed('4. Tenant A cannot create Tenant B order', err);
    }

    // ------------------------------------------------------------------------
    // TEST 5: Public storefront requests resolve to the correct tenant
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

      markPassed('5. Public storefront requests resolve to correct tenant (slug, host, subdomain)');
    } catch (err) {
      markFailed('5. Public storefront requests resolve to correct tenant', err);
    }

    // ------------------------------------------------------------------------
    // TEST 6: Tenant branding is isolated
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

      markPassed('6. Tenant branding is isolated');
    } catch (err) {
      markFailed('6. Tenant branding is isolated', err);
    }

    // ------------------------------------------------------------------------
    // TEST 7: Currency configuration is isolated
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

      markPassed('7. Currency configuration is isolated');
    } catch (err) {
      markFailed('7. Currency configuration is isolated', err);
    }

    // ------------------------------------------------------------------------
    // TEST 8: Policies are tenant-aware (Dynamic Free Shipping Threshold)
    // ------------------------------------------------------------------------
    try {
      // Tenant Alpha: freeShippingThreshold = 75.00, standardShippingFee = 9.99
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

      markPassed('8. Policies are tenant-aware (Free shipping threshold evaluated server-side)');
    } catch (err) {
      markFailed('8. Policies are tenant-aware', err);
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
          headers: { 'x-forwarded-host': 'alpha.abacha.test', Host: 'alpha.abacha.test' },
        });
        assert.strictEqual(resDev.status, 200);
        const jsonDev = await resDev.json();
        assert.strictEqual(jsonDev.data.tenant.slug, 'beta', 'Dev query override MUST switch to beta');

        // C2: Test query override resolves requested tenant
        process.env.NODE_ENV = 'test';
        const resTest = await fetch(`${baseUrl}/api/storefront/context?tenant=beta`, {
          headers: { 'x-forwarded-host': 'alpha.abacha.test', Host: 'alpha.abacha.test' },
        });
        assert.strictEqual(resTest.status, 200);
        const jsonTest = await resTest.json();
        assert.strictEqual(jsonTest.data.tenant.slug, 'beta', 'Test query override MUST switch to beta');

        // C3: Production query override cannot switch tenant
        process.env.NODE_ENV = 'production';
        const resProd = await fetch(`${baseUrl}/api/storefront/context?tenant=beta`, {
          headers: { 'x-forwarded-host': 'alpha.abacha.test', Host: 'alpha.abacha.test' },
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
          headers: { 'x-forwarded-host': 'alpha.abacha.test', Host: 'alpha.abacha.test' },
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
          headers: { 'x-forwarded-host': 'alpha.abacha.test', Host: 'alpha.abacha.test' },
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
        process.env.NODE_ENV = prevEnv;
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
        headers: { 'x-forwarded-host': 'localhost', Host: 'localhost' },
      });
      assert.strictEqual(resCanonical.status, 200);
      const jsonCanonical = await resCanonical.json();
      assert.strictEqual(jsonCanonical.data.tenant.id, 'org_default');

      // 2. Unknown subdomain on abacha.com MUST NOT become org_default
      const resUnknownSub = await fetch(`${baseUrl}/api/storefront/context`, {
        headers: { 'x-forwarded-host': 'unknown-branch.abacha.com', Host: 'unknown-branch.abacha.com' },
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
  } finally {
    server.close();
    await db.close();
  }

  console.log('========================================================================');
  console.log(` Storefront Multi-Tenant Verification: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

// Execute test suite if run directly
runStorefrontMultiTenantTests().catch((err) => {
  console.error('[Storefront Test Fatal]', err);
  process.exit(1);
});
