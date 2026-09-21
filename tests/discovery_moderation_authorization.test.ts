import assert from 'assert';
import { DiscoveryBusinessService } from '../server/services/discoveryBusinessService';

const assertModerator = (
  actor: { userId: string; role: string; organizationId?: string },
  business?: { organization_id?: string | null },
) => (DiscoveryBusinessService.prototype as any).assertModerator(actor, business);

const businessA = { organization_id: 'org-a' };
const businessWithoutOrg = { organization_id: null };

// Tenant admin may moderate a business in the same organization.
assert.doesNotThrow(() =>
  assertModerator({ userId: 'admin-a', role: 'admin', organizationId: 'org-a' }, businessA),
);

// Super admin is platform-wide and may moderate any business.
assert.doesNotThrow(() =>
  assertModerator({ userId: 'root', role: 'super_admin' }, businessA),
);
assert.doesNotThrow(() =>
  assertModerator({ userId: 'root', role: 'super_admin' }, businessWithoutOrg),
);

// A tenant admin cannot cross organization boundaries.
assert.throws(
  () => assertModerator({ userId: 'admin-a', role: 'admin', organizationId: 'org-b' }, businessA),
  /TENANT_ACCESS_DENIED:Administrators may moderate only businesses belonging to their organization/,
);

// Merchant-scoped roles must never gain moderator privileges.
for (const role of ['business_owner', 'manager', 'staff', 'viewer']) {
  assert.throws(
    () => assertModerator({ userId: `${role}-a`, role, organizationId: 'org-a' }, businessA),
    /PERMISSION_DENIED:Discovery moderation requires administrator authorization/,
  );
}

// A missing organization boundary must deny ordinary admins.
assert.throws(
  () => assertModerator({ userId: 'admin-a', role: 'admin', organizationId: 'org-a' }, businessWithoutOrg),
  /TENANT_ACCESS_DENIED:Administrators may moderate only businesses belonging to their organization/,
);

// Platform roles are intentionally not implicitly moderator roles.
// They require an explicit moderation policy rather than inheriting tenant-admin power.
for (const role of ['platform_admin', 'platform_support', 'platform_finance', 'system_owner']) {
  assert.throws(
    () => assertModerator({ userId: `${role}-1`, role }, businessA),
    /PERMISSION_DENIED:Discovery moderation requires administrator authorization/,
  );
}

console.log('Discovery moderation authorization tests passed.');
