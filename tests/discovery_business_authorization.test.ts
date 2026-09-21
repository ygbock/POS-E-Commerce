import assert from 'assert';
import {
  assertBusinessPermission,
  permissionsForBusinessRole,
  type DiscoveryBusinessPermission,
} from '../server/services/discoveryBusinessAccess';

type Membership = {
  business_id: string;
  user_id: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF';
  is_active: boolean;
};

const memberships: Membership[] = [
  { business_id: 'business-a', user_id: 'owner-a', role: 'OWNER', is_active: true },
  { business_id: 'business-a', user_id: 'manager-a', role: 'MANAGER', is_active: true },
  { business_id: 'business-a', user_id: 'staff-a', role: 'STAFF', is_active: true },
  { business_id: 'business-b', user_id: 'owner-b', role: 'OWNER', is_active: true },
  { business_id: 'business-a', user_id: 'inactive-manager', role: 'MANAGER', is_active: false },
];

const db = {
  query: async <T = any>(_sql: string, params: any[] = []) => {
    const [businessId, userId] = params;
    const membership = memberships.find(
      (item) => item.business_id === businessId && item.user_id === userId && item.is_active,
    );
    return {
      rows: membership ? [{ role: membership.role }] as T[] : [],
      rowCount: membership ? 1 : 0,
    };
  },
} as any;

const allPermissions = permissionsForBusinessRole('OWNER');

async function expectAllowed(
  businessId: string,
  userId: string,
  permission: DiscoveryBusinessPermission,
  expectedRole: 'OWNER' | 'MANAGER' | 'STAFF',
) {
  const role = await assertBusinessPermission(db, businessId, userId, permission);
  assert.strictEqual(role, expectedRole);
}

async function expectDenied(
  businessId: string,
  userId: string,
  permission: DiscoveryBusinessPermission,
  message: RegExp,
) {
  await assert.rejects(
    () => assertBusinessPermission(db, businessId, userId, permission),
    message,
  );
}

// Every OWNER permission is directly enforceable.
for (const permission of allPermissions) {
  await expectAllowed('business-a', 'owner-a', permission, 'OWNER');
}

// MANAGER has exactly the declared scoped permissions.
for (const permission of allPermissions) {
  const allowed = permissionsForBusinessRole('MANAGER').includes(permission);
  if (allowed) {
    await expectAllowed('business-a', 'manager-a', permission, 'MANAGER');
  } else {
    await expectDenied(
      'business-a',
      'manager-a',
      permission,
      /PERMISSION_DENIED:Your business role does not allow/,
    );
  }
}

// STAFF has exactly the declared scoped permissions.
for (const permission of allPermissions) {
  const allowed = permissionsForBusinessRole('STAFF').includes(permission);
  if (allowed) {
    await expectAllowed('business-a', 'staff-a', permission, 'STAFF');
  } else {
    await expectDenied(
      'business-a',
      'staff-a',
      permission,
      /PERMISSION_DENIED:Your business role does not allow/,
    );
  }
}

// Cross-business access must not inherit permissions from another business.
await expectAllowed('business-b', 'owner-b', 'business.team.manage', 'OWNER');
await expectDenied(
  'business-b',
  'owner-a',
  'business.team.manage',
  /PERMISSION_DENIED:You are not an active member of this business/,
);

// Inactive memberships must not authorize direct API/service access.
await expectDenied(
  'business-a',
  'inactive-manager',
  'business.listing.manage',
  /PERMISSION_DENIED:You are not an active member of this business/,
);

// Unknown users must be denied.
await expectDenied(
  'business-a',
  'unknown-user',
  'business.services.manage',
  /PERMISSION_DENIED:You are not an active member of this business/,
);

// Explicit privilege-escalation checks.
for (const permission of [
  'business.team.manage',
  'business.store.manage',
  'business.verification.manage',
  'business.settings.manage',
] as DiscoveryBusinessPermission[]) {
  await expectDenied(
    'business-a',
    'manager-a',
    permission,
    /PERMISSION_DENIED:Your business role does not allow/,
  );
  await expectDenied(
    'business-a',
    'staff-a',
    permission,
    /PERMISSION_DENIED:Your business role does not allow/,
  );
}

console.log('Discovery business authorization integration matrix tests passed.');
