process.env.NODE_ENV = 'test';

import assert from 'node:assert';
import http from 'node:http';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { createApp } from '../server';
import { AuthService } from '../server/services/authService';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  const auth = new AuthService(db);
  const owner = await auth.registerBusinessOwner({
    name: 'Lifecycle Owner',
    email: 'lifecycle-owner@example.test',
    password: 'LifecycleOwner123!',
    businessName: 'Lifecycle Store',
    businessMode: 'DISCOVERY_ONLY',
  });

  const login = await auth.login({
    email: 'lifecycle-owner@example.test',
    password: 'LifecycleOwner123!',
  });
  const token = login.token;
  assert.ok(token, 'business owner login must return a JWT');

  const { app } = await createApp({ db, authService: auth, skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a port.');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const requestJson = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(baseUrl + path, { ...init, headers });
    const body = await response.json().catch(() => null);
    return { response, body };
  };

  try {
    // A converted store must start with catalog and storefront readiness incomplete.
    const locationSeed = await db.query(
      `INSERT INTO discovery_business_locations
        (id,business_id,name,location_type,city,region,country,latitude,longitude,is_primary,is_active)
       VALUES ('lifecycle_discovery_loc',$1,'Lifecycle Main Location','STORE','Freetown','Western Area','Sierra Leone',8.4840,-13.2299,TRUE,TRUE)
       RETURNING id`,
      [owner.business.id],
    );
    assert.strictEqual(locationSeed.rows[0]?.id, 'lifecycle_discovery_loc');

    const conversion = await requestJson(`/api/discovery/businesses/${owner.business.id}/convert-to-store`, {
      method: 'POST',
      body: JSON.stringify({
        storeName: 'Lifecycle Store',
        currency: 'SLE',
        enableOnlineCheckout: true,
        enablePOS: true,
        enableInventoryLedger: true,
      }),
    });
    assert.strictEqual(conversion.response.status, 200);
    assert.strictEqual(conversion.body?.store?.provisioned, true);

    // Migration 053 requires explicit tenant-owned shipping policy before public
    // storefront context can resolve commercial configuration.
    await db.query(
      `UPDATE organizations
          SET policies = COALESCE(policies, '{}'::jsonb) ||
            '{"freeShippingThreshold":100,"standardShippingFee":5,"expressShippingFee":10}'::jsonb
        WHERE id=$1`,
      [owner.user.organizationId],
    );

    const tenantSlug = String(conversion.body?.store?.tenantSlug || '');
    const locationId = String(conversion.body?.store?.locationId || '');
    assert.ok(tenantSlug, 'store conversion must provision a canonical tenant slug');
    assert.ok(locationId, 'store conversion must provision a commerce location');

    const readinessBefore = await requestJson(`/api/discovery/businesses/${owner.business.id}/store-readiness`);
    assert.strictEqual(readinessBefore.response.status, 200);
    assert.strictEqual(readinessBefore.body?.data?.catalogReady, false);
    assert.strictEqual(readinessBefore.body?.data?.storefrontReady, false);
    assert.strictEqual(readinessBefore.body?.data?.inventoryReady, false);

    // Category is created through the merchant catalog API.
    const category = await requestJson('/api/categories', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Lifecycle Category',
        slug: 'lifecycle-category',
        description: 'Lifecycle regression category',
        subcategories: ['Standard'],
      }),
    });
    assert.strictEqual(category.response.status, 201);
    assert.strictEqual(category.body?.success, true);

    // Product + variant are created through the catalog API and persisted to the tenant DB.
    const product = await requestJson('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Lifecycle Product',
        slug: 'lifecycle-product',
        category: 'Lifecycle Category',
        brand: 'Generic',
        unit: 'pcs',
        status: 'active',
        channels: { pos: true, ecommerce: true, wholesale: false },
        variants: [{
          sku: 'LIFECYCLE-001',
          barcode: '8809000000011',
          name: 'Standard',
          costPrice: '10.00',
          retailPrice: '25.00',
          wholesalePrice: '20.00',
          memberPrice: '22.00',
          minSellingPrice: '15.00',
          lowStockThreshold: 5,
        }],
      }),
    });
    assert.strictEqual(product.response.status, 201);
    assert.strictEqual(product.body?.success, true);

    const productId = String(product.body?.data?.id || '');
    assert.ok(productId, 'product creation must return an id');

    const variantRow = await db.query(
      `SELECT id, sku FROM product_variants
        WHERE organization_id=$1 AND product_id=$2
        ORDER BY created_at ASC, id ASC LIMIT 1`,
      [owner.user.organizationId, productId],
    );
    assert.strictEqual(variantRow.rows.length, 1);
    const variantId = String(variantRow.rows[0].id);
    assert.strictEqual(variantRow.rows[0].sku, 'LIFECYCLE-001');

    const readinessAfterCatalog = await requestJson(`/api/discovery/businesses/${owner.business.id}/store-readiness`);
    assert.strictEqual(readinessAfterCatalog.response.status, 200);
    assert.strictEqual(readinessAfterCatalog.body?.data?.catalogReady, true);
    assert.strictEqual(readinessAfterCatalog.body?.data?.inventoryReady, false);
    assert.strictEqual(readinessAfterCatalog.body?.data?.storefrontReady, false);
    assert.strictEqual(readinessAfterCatalog.body?.data?.counts?.products, 1);
    assert.strictEqual(readinessAfterCatalog.body?.data?.counts?.variants, 1);

    // Opening stock is written through the authoritative inventory API, not catalog state.
    const openingBalance = await requestJson('/api/inventory/opening-balance', {
      method: 'POST',
      body: JSON.stringify({
        location_id: locationId,
        variant_id: variantId,
        quantity: '12',
        unit_cost: '10.00',
        idempotency_key: `lifecycle-opening-${productId}-${variantId}-${locationId}`,
        notes: 'Store onboarding opening stock',
      }),
    });
    assert.strictEqual(openingBalance.response.status, 201);
    assert.strictEqual(openingBalance.body?.success, true);
    assert.strictEqual(openingBalance.body?.data?.balance?.on_hand, '12.0000');

    const balance = await db.query(
      `SELECT on_hand::text, reserved::text
         FROM inventory_balances
        WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3`,
      [owner.user.organizationId, locationId, variantId],
    );
    assert.strictEqual(balance.rows[0]?.on_hand, '12.0000');
    assert.strictEqual(balance.rows[0]?.reserved, '0.0000');

    const readinessReady = await requestJson(`/api/discovery/businesses/${owner.business.id}/store-readiness`);
    assert.strictEqual(readinessReady.response.status, 200);
    assert.strictEqual(readinessReady.body?.data?.catalogReady, true);
    assert.strictEqual(readinessReady.body?.data?.inventoryReady, true);
    assert.strictEqual(readinessReady.body?.data?.storefrontReady, true);

    // The canonical public storefront must now expose the same tenant and product.
    const storefrontContext = await fetch(
      baseUrl + `/api/storefront/${encodeURIComponent(tenantSlug)}/context`,
    );
    const contextBody = await storefrontContext.json();
    assert.strictEqual(storefrontContext.status, 200);
    assert.strictEqual(contextBody?.data?.tenant?.id, owner.user.organizationId);
    assert.strictEqual(contextBody?.data?.tenant?.slug, tenantSlug);

    const storefrontProducts = await fetch(
      baseUrl + `/api/storefront/${encodeURIComponent(tenantSlug)}/products?limit=10`,
    );
    const storefrontProductsBody = await storefrontProducts.json();
    assert.strictEqual(storefrontProducts.status, 200);
    assert.strictEqual(storefrontProductsBody?.count, 1);
    assert.strictEqual(storefrontProductsBody?.data?.[0]?.id, productId);
    assert.strictEqual(storefrontProductsBody?.data?.[0]?.slug, 'lifecycle-product');
    assert.strictEqual(storefrontProductsBody?.data?.[0]?.availableStock, 12);
    assert.strictEqual(storefrontProductsBody?.data?.[0]?.isOutOfStock, false);

    console.log('Discovery → Store → Catalog → Inventory → Storefront lifecycle test passed.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
