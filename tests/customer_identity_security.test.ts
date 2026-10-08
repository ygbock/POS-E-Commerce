import assert from 'assert';
import { getPermissionsForRole, PERMISSIONS } from '../server/auth/roles';
import { requireCustomerIdentity } from '../server/middleware/auth';

async function main() {
  const customerPermissions = getPermissionsForRole('customer');

  // Global customers must never inherit tenant back-office permissions.
  assert.deepStrictEqual(customerPermissions, []);
  assert.strictEqual(customerPermissions.includes(PERMISSIONS.ORDERS_VIEW), false);
  assert.strictEqual(customerPermissions.includes(PERMISSIONS.CUSTOMERS_VIEW), false);
  assert.strictEqual(customerPermissions.includes(PERMISSIONS.ORDERS_CREATE), false);

  const runGate = async (auth: any) => {
    let status = 200;
    let payload: any = null;
    let nextCalled = false;
    const middleware = requireCustomerIdentity();
    await middleware(
      { auth } as any,
      {
        status(code: number) {
          status = code;
          return {
            json(body: any) {
              payload = body;
              return body;
            },
          };
        },
      } as any,
      () => { nextCalled = true; },
    );
    return { status, payload, nextCalled };
  };

  const customer = await runGate({
    userId: 'customer-1',
    organizationId: 'org_default',
    role: 'customer',
    identityType: 'customer',
    permissions: [],
  });
  assert.strictEqual(customer.status, 200);
  assert.strictEqual(customer.nextCalled, true);

  const businessOwner = await runGate({
    userId: 'owner-1',
    organizationId: 'org_merchant_1',
    role: 'business_owner',
    identityType: 'business_owner',
    permissions: getPermissionsForRole('business_owner'),
  });
  assert.strictEqual(businessOwner.status, 403);
  assert.strictEqual(businessOwner.payload?.error?.code, 'CUSTOMER_ACCESS_REQUIRED');
  assert.strictEqual(businessOwner.nextCalled, false);

  const staff = await runGate({
    userId: 'staff-1',
    organizationId: 'org_merchant_1',
    role: 'cashier',
    identityType: 'staff',
    permissions: getPermissionsForRole('cashier'),
  });
  assert.strictEqual(staff.status, 403);
  assert.strictEqual(staff.payload?.error?.code, 'CUSTOMER_ACCESS_REQUIRED');

  const platform = await runGate({
    userId: 'platform-1',
    organizationId: 'org_default',
    role: 'platform_admin',
    identityType: 'platform',
    permissions: getPermissionsForRole('platform_admin'),
  });
  assert.strictEqual(platform.status, 403);
  assert.strictEqual(platform.payload?.error?.code, 'CUSTOMER_ACCESS_REQUIRED');

  const unauthenticated = await runGate(undefined);
  assert.strictEqual(unauthenticated.status, 401);
  assert.strictEqual(unauthenticated.payload?.error?.code, 'UNAUTHORIZED');

  console.log('Customer identity security boundary PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
