import assert from 'node:assert/strict';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { AuthService } from '../server/services/authService';
import { UserRepository } from '../server/repositories/userRepository';
import { hashPassword } from '../server/auth/password';
import { verifyToken } from '../server/auth/token';
import { getIdentityTypeForRole, UserRole } from '../server/auth/roles';

type Fixture = {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  organizationId: string;
  identityType: 'platform' | 'business_owner' | 'staff' | 'customer';
};

async function createFixture(db: DatabaseClient, fixture: Fixture): Promise<void> {
  const repo = new UserRepository(db);
  const { hash, salt } = hashPassword(fixture.password);
  await repo.createUser({
    id: fixture.id,
    organization_id: fixture.organizationId,
    email: fixture.email,
    name: fixture.role.replace(/_/g, ' '),
    password_hash: hash,
    password_salt: salt,
    role: fixture.role,
    identity_type: fixture.identityType,
    is_active: true,
  });
}

async function expectMfaEnrollment(
  auth: AuthService,
  fixture: { email: string; password: string },
): Promise<void> {
  await assert.rejects(
    () => auth.loginPlatform({
      email: fixture.email,
      password: fixture.password,
    }),
    (error: any) => {
      assert.equal(error?.code, 'MFA_ENROLLMENT_REQUIRED');
      assert.match(error?.challenge || '', /^[A-Za-z0-9_-]{40,}$/);
      assert.ok(error?.expiresAt);
      return true;
    },
  );
}

async function main() {
  const db = createIsolatedTestClient();
  const originalPlatformPassword = process.env.ABACHA_PLATFORM_ADMIN_PASSWORD;
  const originalSystemOwnerPassword = process.env.ABACHA_SYSTEM_OWNER_PASSWORD;

  process.env.ABACHA_PLATFORM_ADMIN_PASSWORD = 'PlatformMatrix123!';
  process.env.ABACHA_SYSTEM_OWNER_PASSWORD = 'SystemOwnerMatrix123!';

  try {
    await runMigrations(db);
    const auth = new AuthService(db);
    await auth.seedDefaultUsers();

    const repo = new UserRepository(db);

    const seeded: Array<Omit<Fixture, 'identityType'>> = [
      { id: 'usr_super_admin', email: 'superadmin@abacha.internal', password: 'SuperAdmin123!', role: 'super_admin', organizationId: 'org_default' },
      { id: 'usr_admin', email: 'admin@abacha.internal', password: 'AdminPass123!', role: 'admin', organizationId: 'org_default' },
      { id: 'usr_manager', email: 'manager@abacha.internal', password: 'ManagerPass123!', role: 'manager', organizationId: 'org_default' },
      { id: 'usr_cashier', email: 'cashier@abacha.internal', password: 'CashierPass123!', role: 'cashier', organizationId: 'org_default' },
      { id: 'usr_inventory_mgr', email: 'inventory@abacha.internal', password: 'InventoryPass123!', role: 'inventory_manager', organizationId: 'org_default' },
      { id: 'usr_purchasing_mgr', email: 'purchasing@abacha.internal', password: 'PurchasingPass123!', role: 'purchasing_manager', organizationId: 'org_default' },
      { id: 'usr_sales', email: 'sales@abacha.internal', password: 'SalesPass123!', role: 'sales_user', organizationId: 'org_default' },
      { id: 'usr_viewer', email: 'viewer@abacha.internal', password: 'ViewerPass123!', role: 'viewer', organizationId: 'org_default' },
      { id: 'usr_ygbock', email: 'ygbock@gmail.com', password: 'MerchantOwner123!', role: 'business_owner', organizationId: 'org_ygbock' },
    ];

    const platform: Fixture[] = [
      { id: 'usr_matrix_support', email: 'matrix-support@abacha.internal', password: 'PlatformSupport123!', role: 'platform_support', organizationId: 'org_default', identityType: 'platform' },
      { id: 'usr_matrix_finance', email: 'matrix-finance@abacha.internal', password: 'PlatformFinance123!', role: 'platform_finance', organizationId: 'org_default', identityType: 'platform' },
    ];
    for (const fixture of platform) await createFixture(db, fixture);

    const customer: Fixture = {
      id: 'usr_matrix_customer',
      email: 'matrix-customer@abacha.internal',
      password: 'CustomerMatrix123!',
      role: 'customer',
      organizationId: 'org_default',
      identityType: 'customer',
    };
    await createFixture(db, customer);

    const tenantFixtures: Fixture[] = seeded.map((fixture) => ({
      ...fixture,
      identityType: getIdentityTypeForRole(fixture.role),
    }));

    console.log('[AUTH MATRIX] Successful tenant/business-owner logins');
    for (const fixture of tenantFixtures) {
      const result = await auth.login({
        email: fixture.email,
        password: fixture.password,
        organizationId: fixture.organizationId,
      });
      assert.equal(result.user.role, fixture.role);
      assert.equal(result.user.identityType, fixture.identityType);
      assert.equal(result.user.organizationId, fixture.organizationId);
      assert.ok(result.token);

      const claims = verifyToken(result.token);
      assert.equal(claims.role, fixture.role);
      assert.equal(claims.identityType, fixture.identityType);
      assert.equal(claims.organizationId, fixture.organizationId);
      assert.deepEqual(claims.permissions, result.user.permissions);
    }

    console.log('[AUTH MATRIX] Platform accounts require MFA enrollment');
    const platformCredentials = [
      { email: 'platformadmin@abacha.internal', password: 'PlatformMatrix123!', role: 'platform_admin' as UserRole },
      { email: 'systemowner@abacha.internal', password: 'SystemOwnerMatrix123!', role: 'system_owner' as UserRole },
      ...platform.map(({ email, password, role }) => ({ email, password, role })),
    ];

    for (const fixture of platformCredentials) {
      await expectMfaEnrollment(auth, fixture);
    }

    console.log('[AUTH MATRIX] Successful customer login');
    const customerResult = await auth.login({
      email: customer.email,
      password: customer.password,
      organizationId: customer.organizationId,
    });
    assert.equal(customerResult.user.role, 'customer');
    assert.equal(customerResult.user.identityType, 'customer');
    assert.equal(verifyToken(customerResult.token).identityType, 'customer');

    console.log('[AUTH MATRIX] Cross-boundary login rejection');
    await assert.rejects(
      () => auth.login({
        email: 'platformadmin@abacha.internal',
        password: 'PlatformMatrix123!',
        organizationId: 'org_default',
      }),
      /PLATFORM_LOGIN_REQUIRED/,
    );

    await assert.rejects(
      () => auth.loginPlatform({
        email: 'superadmin@abacha.internal',
        password: 'SuperAdmin123!',
      }),
      /Invalid platform credentials/,
    );

    await assert.rejects(
      () => auth.loginPlatform({
        email: 'manager@abacha.internal',
        password: 'ManagerPass123!',
      }),
      /Invalid platform credentials/,
    );

    await assert.rejects(
      () => auth.loginPlatform({
        email: customer.email,
        password: customer.password,
      }),
      /Invalid platform credentials/,
    );

    await assert.rejects(
      () => auth.login({
        email: 'ygbock@gmail.com',
        password: 'MerchantOwner123!',
        organizationId: 'org_default',
      }),
      /Invalid email or password/,
    );

    await assert.rejects(
      () => auth.login({
        email: 'manager@abacha.internal',
        password: 'ManagerPass123!',
        organizationId: 'org_secondary',
      }),
      /Invalid email or password/,
    );

    console.log('[AUTH MATRIX] Invalid credentials and claim integrity');
    await assert.rejects(
      () => auth.login({
        email: 'manager@abacha.internal',
        password: 'WrongPassword123!',
        organizationId: 'org_default',
      }),
      /Invalid email or password/,
    );

    const mismatch = await repo.findByEmail('org_default', 'manager@abacha.internal');
    assert.ok(mismatch);
    await db.query('UPDATE users SET identity_type = $1 WHERE id = $2', ['platform', mismatch.id]);

    const mismatchLogin = await auth.login({
      email: 'manager@abacha.internal',
      password: 'ManagerPass123!',
      organizationId: 'org_default',
    });
    assert.equal(mismatchLogin.user.role, 'manager');
    assert.equal(mismatchLogin.user.identityType, 'staff');
    assert.equal(verifyToken(mismatchLogin.token).identityType, 'staff');

    console.log('Authentication V2 role login matrix PASSED');
  } finally {
    if (originalPlatformPassword === undefined) delete process.env.ABACHA_PLATFORM_ADMIN_PASSWORD;
    else process.env.ABACHA_PLATFORM_ADMIN_PASSWORD = originalPlatformPassword;
    if (originalSystemOwnerPassword === undefined) delete process.env.ABACHA_SYSTEM_OWNER_PASSWORD;
    else process.env.ABACHA_SYSTEM_OWNER_PASSWORD = originalSystemOwnerPassword;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
