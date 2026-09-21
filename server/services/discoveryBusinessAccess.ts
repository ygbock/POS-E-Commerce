import { DatabaseClient } from '../db/client.ts';

export type DiscoveryBusinessScopedRole = 'OWNER' | 'MANAGER' | 'STAFF';
export type DiscoveryBusinessPermission =
  | 'business.listing.manage'
  | 'business.listing.submit'
  | 'business.locations.manage'
  | 'business.services.manage'
  | 'business.leads.manage'
  | 'business.reviews.manage'
  | 'business.analytics.view'
  | 'business.search_aliases.manage'
  | 'business.verification.manage'
  | 'business.settings.manage'
  | 'business.team.manage'
  | 'business.store.manage';

const ROLE_PERMISSIONS: Record<DiscoveryBusinessScopedRole, readonly DiscoveryBusinessPermission[]> = {
  OWNER: [
    'business.listing.manage',
    'business.listing.submit',
    'business.locations.manage',
    'business.services.manage',
    'business.leads.manage',
    'business.reviews.manage',
    'business.analytics.view',
    'business.search_aliases.manage',
    'business.verification.manage',
    'business.settings.manage',
    'business.team.manage',
    'business.store.manage',
  ],
  MANAGER: [
    'business.listing.manage',
    'business.listing.submit',
    'business.locations.manage',
    'business.services.manage',
    'business.leads.manage',
    'business.reviews.manage',
    'business.analytics.view',
    'business.search_aliases.manage',
  ],
  STAFF: [
    'business.services.manage',
    'business.leads.manage',
    'business.reviews.manage',
    'business.analytics.view',
  ],
};

export function permissionsForBusinessRole(role: DiscoveryBusinessScopedRole): DiscoveryBusinessPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasBusinessPermission(role: DiscoveryBusinessScopedRole, permission: DiscoveryBusinessPermission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) === true;
}

export async function getBusinessMembership(
  db: DatabaseClient,
  businessId: string,
  userId: string,
): Promise<DiscoveryBusinessScopedRole | null> {
  const result = await db.query<{ role: DiscoveryBusinessScopedRole }>(
    `SELECT role
       FROM discovery_business_memberships
      WHERE business_id=$1 AND user_id=$2 AND is_active=TRUE
      LIMIT 1`,
    [businessId, userId],
  );
  return result.rows[0]?.role || null;
}

export async function assertBusinessPermission(
  db: DatabaseClient,
  businessId: string,
  userId: string,
  permission: DiscoveryBusinessPermission,
): Promise<DiscoveryBusinessScopedRole> {
  const role = await getBusinessMembership(db, businessId, userId);
  if (!role) throw new Error('PERMISSION_DENIED:You are not an active member of this business.');
  if (!hasBusinessPermission(role, permission)) {
    throw new Error(`PERMISSION_DENIED:Your business role does not allow ${permission}.`);
  }
  return role;
}
