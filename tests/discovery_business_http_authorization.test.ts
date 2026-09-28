import assert from 'assert';
import express from 'express';
import { createServer } from 'node:http';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { UserRepository } from '../server/repositories/userRepository';
import { hashPassword } from '../server/auth/password';
import { AuthService } from '../server/services/authService';
import { DiscoveryBusinessRepository } from '../server/repositories/discoveryBusinessRepository';
import { DiscoveryBusinessService } from '../server/services/discoveryBusinessService';
import { createDiscoveryRouter } from '../server/routes/discoveryRoutes';
import { createDiscoveryBusinessRouter } from '../server/routes/discoveryBusinessRoutes';
import { createMerchantRouter } from '../server/routes/merchantRoutes';
import { createStorefrontRouter } from '../server/routes/storefrontRoutes';
import { getPermissionsForRole } from '../server/auth/roles';

type Actor = {
  userId: string;
  organizationId: string;
  role: string;
};

async function requestJson(baseUrl: string, path: string, actor: Actor, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('x-test-user', actor.userId);
  const response = await fetch(baseUrl + path, { ...init, headers });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);

  const auth = new AuthService(db);
  const ownerA = await auth.registerBusinessOwner({
    name: 'HTTP Owner A',
    email: 'http-owner-a@example.test',
    password: 'OwnerPassword123!',
    businessName: 'HTTP Business A',
    businessMode: 'DISCOVERY_ONLY',
  });
  const ownerB = await auth.registerBusinessOwner({
    name: 'HTTP Owner B',
    email: 'http-owner-b@example.test',
    password: 'OwnerPassword123!',
    businessName: 'HTTP Business B',
    businessMode: 'DISCOVERY_ONLY',
  });

  const userRepo = new UserRepository(db);
  const createMember = async (id: string, email: string, name: string, organizationId: string) => {
    const { hash, salt } = hashPassword('MemberPassword123!');
    return userRepo.createUser({
      id,
      organizationId,
      email,
      name,
      passwordHash: hash,
      passwordSalt: salt,
      role: 'business_owner',
      is_active: true,
    });
  };

  await createMember('http-manager-a', 'http-manager-a@example.test', 'HTTP Manager A', ownerA.user.organizationId);
  await createMember('http-staff-a', 'http-staff-a@example.test', 'HTTP Staff A', ownerA.user.organizationId);

  await db.query(
    `INSERT INTO discovery_business_memberships (business_id,user_id,role,is_active)
     VALUES ($1,$2,'MANAGER',TRUE),($1,$3,'STAFF',TRUE)`,
    [ownerA.business.id, 'http-manager-a', 'http-staff-a'],
  );

  const actors: Record<string, Actor> = {
    ownerA: { userId: ownerA.user.id, organizationId: ownerA.user.organizationId, role: 'business_owner' },
    ownerB: { userId: ownerB.user.id, organizationId: ownerB.user.organizationId, role: 'business_owner' },
    managerA: { userId: 'http-manager-a', organizationId: ownerA.user.organizationId, role: 'business_owner' },
    staffA: { userId: 'http-staff-a', organizationId: ownerA.user.organizationId, role: 'business_owner' },
  };

  const app = express();
  app.use(express.json());
  // Test harness supplies the same verified request context that requireAuth() consumes.
  // This keeps the matrix focused on business-scoped API authorization rather than JWT crypto.
  app.use((req, _res, next) => {
    const userId = String(req.headers['x-test-user'] || '');
    const actor = Object.values(actors).find((candidate) => candidate.userId === userId);
    if (actor) {
      req.auth = {
        userId: actor.userId,
        organizationId: actor.organizationId,
        role: actor.role as any,
        permissions: getPermissionsForRole(actor.role),
        organizationActive: true,
      };
    }
    next();
  });

  app.use('/api/merchant', createMerchantRouter(db, auth));
  // The legacy CRM customer endpoints are mounted at /api in the production server;
  // expose the merchant router at that boundary in this isolated harness as well so
  // /api/customers/:id/profile exercises the same tenant-scoped implementation.
  app.use('/api', createMerchantRouter(db, auth));
  app.use('/api/discovery', createDiscoveryBusinessRouter(db));
  app.use('/api/discovery', createDiscoveryRouter(db));
  app.use('/api/storefront', createStorefrontRouter(db));
  app.use((err: any, _req: any, res: any, _next: any) => {
    const raw = String(err?.message || 'error');
    const code = raw.split(':')[0];
    const status = ['PERMISSION_DENIED', 'TENANT_ACCESS_DENIED'].includes(code) ? 403
      : code === 'NOT_FOUND' ? 404
      : code === 'VALIDATION_ERROR' ? 422
      : 500;
    res.status(status).json({ success: false, error: { code, message: raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : raw } });
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a port.');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // Merchant owner sign-in must resolve the owner organization server-side;
    // the business owner should never need to know an internal organization ID.
    const merchantLogin = await fetch(baseUrl + '/api/merchant/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'http-owner-a@example.test', password: 'OwnerPassword123!' }),
    });
    const merchantLoginBody = await merchantLogin.json();
    assert.strictEqual(merchantLogin.status, 200);
    assert.strictEqual(merchantLoginBody?.data?.user?.id, ownerA.user.id);
    assert.strictEqual(merchantLoginBody?.data?.user?.role, 'business_owner');
    assert.ok(merchantLoginBody?.data?.token);

    // OWNER: direct API access to owner-scoped workspaces and management operations.
    const ownerMe = await requestJson(baseUrl, '/api/merchant/me', actors.ownerA);
    assert.strictEqual(ownerMe.status, 200);

    // Business creation must keep Discovery-only listings unbound while creating
    // the business-scoped OWNER membership needed by the merchant portal.
    const createdDiscovery = await requestJson(baseUrl, '/api/discovery/businesses', actors.ownerA, {
      method: 'POST',
      body: JSON.stringify({
        name: 'HTTP Created Discovery Listing',
        businessMode: 'DISCOVERY_ONLY',
      }),
    });
    assert.strictEqual(createdDiscovery.status, 201);
    assert.strictEqual(createdDiscovery.body?.data?.organization_id ?? createdDiscovery.body?.data?.organizationId, null);

    const createdDiscoveryMembership = await db.query(
      'SELECT role,is_active FROM discovery_business_memberships WHERE business_id=$1 AND user_id=$2',
      [createdDiscovery.body.data.id, actors.ownerA.userId],
    );
    assert.strictEqual(createdDiscoveryMembership.rows[0]?.role, 'OWNER');
    assert.strictEqual(createdDiscoveryMembership.rows[0]?.is_active, true);

    await db.query(
      `INSERT INTO discovery_business_locations
        (id,business_id,name,location_type,city,region,country,latitude,longitude,is_primary,is_active)
       VALUES ('http_conversion_loc',$1,'Conversion Main Location','STORE','Freetown','Western Area','Sierra Leone',8.4840,-13.2299,TRUE,TRUE)`,
      [ownerA.business.id],
    );
    const converted = await requestJson(baseUrl, `/api/discovery/businesses/${ownerA.business.id}/convert-to-store`, actors.ownerA, {
      method: 'POST',
      body: JSON.stringify({
        storeName: 'HTTP Conversion Store',
        currency: 'SLE',
        enableOnlineCheckout: true,
        enablePOS: true,
        enableInventoryLedger: true,
      }),
    });
    assert.strictEqual(converted.status, 200);
    assert.strictEqual(converted.body?.store?.provisioned, true);
    assert.ok(converted.body?.store?.locationId);
    assert.strictEqual(converted.body?.data?.business_mode, 'DISCOVERY_AND_STORE');
    const convertedLocation = await db.query(
      `SELECT id,name,is_pos_enabled FROM locations WHERE organization_id=$1 AND is_active=TRUE`,
      [actors.ownerA.organizationId],
    );
    assert.strictEqual(convertedLocation.rows.length, 1);
    assert.strictEqual(convertedLocation.rows[0].name, 'HTTP Conversion Store');
    assert.strictEqual(convertedLocation.rows[0].is_pos_enabled, true);

    const storeReadiness = await requestJson(baseUrl, '/api/discovery/businesses/' + ownerA.business.id + '/store-readiness', actors.ownerA);
    assert.strictEqual(storeReadiness.status, 200);
    assert.strictEqual(storeReadiness.body?.data?.ready, true);
    assert.ok(storeReadiness.body?.data?.tenantSlug);
    assert.strictEqual(storeReadiness.body?.data?.inventoryLedgerEnabled, true);
    assert.strictEqual(storeReadiness.body?.data?.onlineCheckoutEnabled, true);
    assert.strictEqual(storeReadiness.body?.data?.counts?.products, 0);
    assert.strictEqual(storeReadiness.body?.data?.catalogReady, false);
    assert.strictEqual(storeReadiness.body?.data?.storefrontReady, false);
    assert.ok(Array.isArray(storeReadiness.body?.data?.steps));

    const operatingOverview = await requestJson(baseUrl, '/api/merchant/businesses/' + ownerA.business.id + '/overview', actors.ownerA);
    assert.strictEqual(operatingOverview.status, 200);
    assert.strictEqual(operatingOverview.body?.data?.business?.organization_id, actors.ownerA.organizationId);
    assert.strictEqual(operatingOverview.body?.data?.commerce?.products, 0);
    assert.strictEqual(operatingOverview.body?.data?.commerce?.customers, 0);
    assert.strictEqual(operatingOverview.body?.data?.readiness?.catalog, false);
    assert.strictEqual(operatingOverview.body?.data?.readiness?.storefront, false);


    // TASK-MERCHANT-2: customer CRM profile is tenant-scoped and aggregates commerce/Discovery activity.
    const customerA = await db.query(
      `INSERT INTO customers(id,organization_id,name,email,phone,auth_user_id) VALUES ('merchant2-customer-a',$1,'Merchant2 Customer','customer-a@example.test','+232000001','http-customer-a') RETURNING id`,
      [actors.ownerA.organizationId],
    );
    const customerProfile = await requestJson(baseUrl, '/api/customers/' + customerA.rows[0].id + '/profile', actors.ownerA);
    assert.strictEqual(customerProfile.status, 200);
    assert.strictEqual(customerProfile.body?.data?.customer?.organization_id, actors.ownerA.organizationId);
    assert.strictEqual(customerProfile.body?.data?.metrics?.orderCount, 0);

    const customerB = await db.query(
      `INSERT INTO customers(id,organization_id,name,email) VALUES ('merchant2-customer-b',$1,'Other Tenant Customer','customer-b@example.test') RETURNING id`,
      [actors.ownerB.organizationId],
    );
    const crossCustomerProfile = await requestJson(baseUrl, '/api/customers/' + customerB.rows[0].id + '/profile', actors.ownerA);
    assert.strictEqual(crossCustomerProfile.status, 403);

    // TASK-MERCHANT-2: supplier directory CRUD and tenant isolation.
    const supplierCreated = await requestJson(baseUrl, '/api/suppliers', actors.ownerA, {
      method: 'POST',
      body: JSON.stringify({ name: 'Merchant2 Supplier A', contactPerson: 'Supplier Contact', paymentTerms: 'Net 30', leadTimeDays: 5 }),
    });
    assert.strictEqual(supplierCreated.status, 201);
    assert.strictEqual(supplierCreated.body?.data?.organization_id, actors.ownerA.organizationId);
    const supplierId = supplierCreated.body.data.id;

    const supplierList = await requestJson(baseUrl, '/api/suppliers', actors.ownerA);
    assert.strictEqual(supplierList.status, 200);
    assert.ok(supplierList.body?.data?.some((s: any) => s.id === supplierId));

    const supplierProfile = await requestJson(baseUrl, '/api/suppliers/' + supplierId, actors.ownerA);
    assert.strictEqual(supplierProfile.status, 200);
    assert.strictEqual(supplierProfile.body?.data?.supplier?.organization_id, actors.ownerA.organizationId);

    const crossSupplier = await requestJson(baseUrl, '/api/suppliers/' + supplierId, actors.ownerB);
    assert.strictEqual(crossSupplier.status, 403);

    const supplierUpdated = await requestJson(baseUrl, '/api/suppliers/' + supplierId, actors.ownerA, {
      method: 'PUT', body: JSON.stringify({ phone: '+232000002', leadTimeDays: 7 }),
    });
    assert.strictEqual(supplierUpdated.status, 200);
    assert.strictEqual(supplierUpdated.body?.data?.lead_time_days, 7);

    const supplierDeleted = await requestJson(baseUrl, '/api/suppliers/' + supplierId, actors.ownerA, { method: 'DELETE' });
    assert.strictEqual(supplierDeleted.status, 200);

    const crossOperatingOverview = await requestJson(baseUrl, '/api/merchant/businesses/' + ownerB.business.id + '/overview', actors.ownerA);
    assert.strictEqual(crossOperatingOverview.status, 404, 'merchant operating overview must hide another business');

    // Registration creates a DRAFT, non-discoverable listing. Public profile access is
    // intentionally gated on publication, so establish the public visibility fixture
    // before asserting the canonical tenant slug returned by the public endpoint.
    await db.query(
      `UPDATE discovery_businesses
          SET listing_status='PUBLISHED', is_discoverable=TRUE, published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
        WHERE id=$1`,
      [ownerA.business.id],
    );

    // The public Discovery profile must expose the canonical tenant slug after conversion
    // so its Visit Store link resolves to the same tenant-scoped storefront.
    const publicProfile = await fetch(baseUrl + '/api/discovery/businesses/' + encodeURIComponent(ownerA.business.slug));
    const publicProfileBody = await publicProfile.json();
    assert.strictEqual(publicProfile.status, 200);
    assert.strictEqual(publicProfileBody?.data?.business?.business_mode, 'DISCOVERY_AND_STORE');
    const ownerOrg = await db.query('SELECT slug FROM organizations WHERE id=$1', [actors.ownerA.organizationId]);
    assert.strictEqual(publicProfileBody?.data?.business?.tenant_slug, ownerOrg.rows[0]?.slug);
    assert.ok(publicProfileBody?.data?.business?.tenant_slug);

    // The canonical tenant slug exposed by Discovery must resolve to the same
    // tenant-scoped storefront context and catalog API without authentication.
    const tenantSlug = String(publicProfileBody.data.business.tenant_slug);
    const storefrontContext = await fetch(baseUrl + '/api/storefront/' + encodeURIComponent(tenantSlug) + '/context');
    const storefrontContextBody = await storefrontContext.json();
    assert.strictEqual(storefrontContext.status, 200);
    assert.strictEqual(storefrontContextBody?.data?.tenant?.id, actors.ownerA.organizationId);
    assert.strictEqual(storefrontContextBody?.data?.tenant?.slug, tenantSlug);

    const storefrontProducts = await fetch(baseUrl + '/api/storefront/' + encodeURIComponent(tenantSlug) + '/products?limit=10');
    const storefrontProductsBody = await storefrontProducts.json();
    assert.strictEqual(storefrontProducts.status, 200);
    assert.strictEqual(storefrontProductsBody?.count, 0);
    assert.deepStrictEqual(storefrontProductsBody?.data, []);

    const invalidStorefront = await fetch(baseUrl + '/api/storefront/' + encodeURIComponent(tenantSlug + '-invalid') + '/context');
    assert.strictEqual(invalidStorefront.status, 404);

    const crossStoreReadiness = await requestJson(baseUrl, '/api/discovery/businesses/' + ownerB.business.id + '/store-readiness', actors.ownerA);
    assert.strictEqual(crossStoreReadiness.status, 403, 'cross-business store readiness must be denied');

    // Repeating the same conversion must not create another commerce location.
    const replayConversion = await requestJson(baseUrl, `/api/discovery/businesses/${ownerA.business.id}/convert-to-store`, actors.ownerA, {
      method: 'POST',
      body: JSON.stringify({ storeName: 'HTTP Conversion Store', currency: 'SLE' }),
    });
    assert.strictEqual(replayConversion.status, 200);
    const replayLocations = await db.query(
      `SELECT COUNT(*)::int AS count FROM locations WHERE organization_id=$1 AND is_active=TRUE`,
      [actors.ownerA.organizationId],
    );
    assert.strictEqual(Number(replayLocations.rows[0].count), 1);

    // Store-mode creation must bind to the authenticated owner's organization.
    const createdStore = await requestJson(baseUrl, '/api/discovery/businesses', actors.ownerA, {
      method: 'POST',
      body: JSON.stringify({
        name: 'HTTP Created Store Listing',
        businessMode: 'DISCOVERY_AND_STORE',
      }),
    });
    assert.strictEqual(createdStore.status, 201);
    assert.strictEqual(createdStore.body?.data?.organization_id ?? createdStore.body?.data?.organizationId, actors.ownerA.organizationId);

    const ownerTeam = await requestJson(baseUrl, `/api/merchant/businesses/${ownerA.business.id}/team`, actors.ownerA);
    assert.strictEqual(ownerTeam.status, 200);

    // TASK-MERCHANT-2: commerce locations have one authoritative tenant primary.
    const secondLocation = await requestJson(baseUrl, '/api/locations', actors.ownerA, {
      method: 'POST',
      body: JSON.stringify({
        code: 'HTTP-SECONDARY',
        name: 'HTTP Secondary Location',
        type: 'Warehouse',
        is_active: true,
      }),
    });
    assert.strictEqual(secondLocation.status, 201);
    assert.strictEqual(secondLocation.body?.data?.is_primary, false);

    const primaryLocation = await requestJson(baseUrl, '/api/locations/' + secondLocation.body.data.id, actors.ownerA, {
      method: 'PUT',
      body: JSON.stringify({ is_primary: true }),
    });
    assert.strictEqual(primaryLocation.status, 200);
    assert.strictEqual(primaryLocation.body?.data?.is_primary, true);

    const locationRows = await db.query(
      `SELECT id,is_primary FROM locations WHERE organization_id=$1 ORDER BY is_primary DESC,id ASC`,
      [actors.ownerA.organizationId],
    );
    assert.strictEqual(locationRows.rows.filter((row: any) => row.is_primary === true).length, 1);
    assert.strictEqual(locationRows.rows[0].id, secondLocation.body.data.id);

    // Staff access is server-derived from the assigned tenant role.
    const tenantUsers = await requestJson(baseUrl, '/api/users', actors.ownerA);
    assert.strictEqual(tenantUsers.status, 200);
    const ownerUser = tenantUsers.body?.data?.find((user: any) => user.id === actors.ownerA.userId);
    assert.ok(Array.isArray(ownerUser?.permissions));
    assert.ok(ownerUser.permissions.includes('business.manage') || ownerUser.permissions.includes('*'));

    const ownerPatch = await requestJson(baseUrl, `/api/discovery/businesses/${ownerA.business.id}`, actors.ownerA, {
      method: 'PATCH',
      body: JSON.stringify({ shortDescription: 'Updated through HTTP authorization matrix.' }),
    });
    assert.strictEqual(ownerPatch.status, 200);

    const ownerSettings = await requestJson(baseUrl, `/api/discovery/businesses/${ownerA.business.id}/settings`, actors.ownerA, {
      method: 'PATCH',
      body: JSON.stringify({ allowReviews: true }),
    });
    assert.notStrictEqual(ownerSettings.status, 403, 'owner must not be blocked by business settings authorization');

    const ownerVerification = await requestJson(baseUrl, `/api/discovery/businesses/${ownerA.business.id}/verification`, actors.ownerA);
    assert.notStrictEqual(ownerVerification.status, 403, 'owner must be able to access verification workspace');

    // MANAGER: allowed business-scoped operations remain reachable.
    const managerBusiness = await requestJson(baseUrl, `/api/merchant/businesses/${ownerA.business.id}`, actors.managerA);
    assert.strictEqual(managerBusiness.status, 200);

    const managerServices = await requestJson(baseUrl, `/api/discovery/businesses/${ownerA.business.id}/services`, actors.managerA);
    assert.strictEqual(managerServices.status, 200);

    // MANAGER: UI-hidden privileged operations must also be denied at the API.
    for (const [method, path, body] of [
      ['POST', `/api/discovery/businesses/${ownerA.business.id}/convert-to-store`, {}],
      ['PATCH', `/api/discovery/businesses/${ownerA.business.id}/settings`, { allowReviews: true }],
      ['POST', `/api/discovery/businesses/${ownerA.business.id}/verification`, { status: 'VERIFIED' }],
      ['POST', `/api/merchant/businesses/${ownerA.business.id}/team/invitations`, { email: 'new@example.test', role: 'STAFF' }],
    ] as const) {
      const result = await requestJson(baseUrl, path, actors.managerA, {
        method,
        body: JSON.stringify(body),
      });
      assert.strictEqual(result.status, 403, `manager must be denied ${method} ${path}`);
    }

    // STAFF: operational permissions remain reachable, privileged workspaces remain denied.
    const staffServices = await requestJson(baseUrl, `/api/discovery/businesses/${ownerA.business.id}/services`, actors.staffA);
    assert.strictEqual(staffServices.status, 200);

    for (const [method, path, body] of [
      ['PATCH', `/api/discovery/businesses/${ownerA.business.id}/settings`, { allowReviews: true }],
      ['POST', `/api/discovery/businesses/${ownerA.business.id}/verification`, { status: 'VERIFIED' }],
      ['POST', `/api/discovery/businesses/${ownerA.business.id}/convert-to-store`, {}],
      ['POST', `/api/merchant/businesses/${ownerA.business.id}/team/invitations`, { email: 'staff2@example.test', role: 'STAFF' }],
    ] as const) {
      const result = await requestJson(baseUrl, path, actors.staffA, {
        method,
        body: JSON.stringify(body),
      });
      assert.strictEqual(result.status, 403, `staff must be denied ${method} ${path}`);
    }

    // Cross-business isolation: membership in A cannot authorize access to B.
    const crossBusiness = await requestJson(baseUrl, `/api/merchant/businesses/${ownerB.business.id}`, actors.ownerA);
    assert.strictEqual(crossBusiness.status, 404, 'merchant workspace must hide a business owned by another user');

    const crossPatch = await requestJson(baseUrl, `/api/discovery/businesses/${ownerB.business.id}`, actors.ownerA, {
      method: 'PATCH',
      body: JSON.stringify({ shortDescription: 'cross-business attempt' }),
    });
    assert.strictEqual(crossPatch.status, 403);

    const crossTeam = await requestJson(baseUrl, `/api/merchant/businesses/${ownerB.business.id}/team`, actors.managerA);
    assert.strictEqual(crossTeam.status, 404, 'cross-business team access must not disclose membership');

    // Moderation endpoints must never be reachable by merchant-scoped roles.
    for (const action of ['approve', 'publish', 'suspend'] as const) {
      const result = await requestJson(baseUrl, `/api/discovery/businesses/${ownerA.business.id}/${action}`, actors.ownerA, {
        method: 'POST',
        body: JSON.stringify({ reason: 'authorization matrix' }),
      });
      assert.strictEqual(result.status, 403, `merchant owner must not access moderation action ${action}`);
    }

    // Inactive membership loses authorization immediately.
    await db.query(
      `UPDATE discovery_businesses SET listing_status='DRAFT', is_discoverable=FALSE WHERE id=$1`,
      [ownerA.business.id],
    );
    await db.query(
      `UPDATE discovery_business_memberships SET is_active=FALSE WHERE business_id=$1 AND user_id=$2`,
      [ownerA.business.id, actors.managerA.userId],
    );
    const inactive = await requestJson(baseUrl, `/api/discovery/businesses/${ownerA.business.id}/services`, actors.managerA);
    assert.strictEqual(inactive.status, 403, 'inactive business membership must be denied at the HTTP boundary');

    console.log('Discovery HTTP/API business authorization matrix tests passed.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
