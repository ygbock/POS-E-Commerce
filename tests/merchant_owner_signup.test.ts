import assert from 'assert';
import { createIsolatedTestClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { AuthService } from '../server/services/authService';

async function main() {
  const db = createIsolatedTestClient();
  await runMigrations(db);
  const auth = new AuthService(db);

  const discovery = await auth.registerBusinessOwner({
    name: 'AbaCha Merchant Owner',
    email: 'merchant-owner@example.com',
    password: 'MerchantOwner123!',
    businessName: 'Freetown Discovery Hub',
    businessMode: 'DISCOVERY_ONLY',
  });

  assert.ok(discovery.token);
  assert.strictEqual(discovery.user.role, 'business_owner');
  assert.strictEqual(discovery.business.businessMode, 'DISCOVERY_ONLY');

  // A business owner must be able to sign in later without knowing or supplying
  // an organization ID. AuthService resolves the single active organization by email.
  const signedIn = await auth.login({
    email: 'merchant-owner@example.com',
    password: 'MerchantOwner123!',
  });
  assert.strictEqual(signedIn.user.id, discovery.user.id);
  assert.strictEqual(signedIn.user.role, 'business_owner');
  assert.ok(signedIn.token);

  const row = await db.query(
    `SELECT b.organization_id,b.listing_status,m.role,u.role AS user_role
       FROM discovery_businesses b
       JOIN discovery_business_memberships m ON m.business_id=b.id
       JOIN users u ON u.id=m.user_id
      WHERE b.id=$1`,
    [discovery.business.id],
  );
  assert.strictEqual(row.rows[0].organization_id, null);
  assert.strictEqual(row.rows[0].listing_status, 'DRAFT');
  assert.strictEqual(row.rows[0].role, 'OWNER');
  assert.strictEqual(row.rows[0].user_role, 'business_owner');

  const store = await auth.registerBusinessOwner({
    name: 'Store Merchant Owner',
    email: 'store-owner@example.com',
    password: 'StoreOwner123!',
    businessName: 'Freetown Commerce Hub',
    businessMode: 'DISCOVERY_AND_STORE',
  });

  const storeRow = await db.query(
    `SELECT b.organization_id,b.business_mode,m.role
       FROM discovery_businesses b
       JOIN discovery_business_memberships m ON m.business_id=b.id
      WHERE b.id=$1`,
    [store.business.id],
  );
  assert.ok(storeRow.rows[0].organization_id);
  assert.strictEqual(storeRow.rows[0].business_mode, 'DISCOVERY_AND_STORE');
  assert.strictEqual(storeRow.rows[0].role, 'OWNER');

  await assert.rejects(
    () => auth.registerBusinessOwner({
      name: 'Duplicate',
      email: 'merchant-owner@example.com',
      password: 'Duplicate123!',
      businessName: 'Duplicate Business',
      businessMode: 'DISCOVERY_ONLY',
    }),
    /EMAIL_ALREADY_REGISTERED/,
  );

  const invitation = await db.query(
    `INSERT INTO discovery_business_invitations
      (id,business_id,invited_email,role,invited_by_user_id,expires_at)
     VALUES ($1,$2,$3,'STAFF',$4,CURRENT_TIMESTAMP + INTERVAL '7 days')
     RETURNING id,status,role`,
    ['d_inv_test', discovery.business.id, 'staff@example.com', discovery.user.id],
  );
  assert.strictEqual(invitation.rows[0].status, 'PENDING');
  assert.strictEqual(invitation.rows[0].role, 'STAFF');

  await assert.rejects(
    () => db.query(
      `INSERT INTO discovery_business_invitations
        (id,business_id,invited_email,role,invited_by_user_id,expires_at)
       VALUES ($1,$2,$3,'STAFF',$4,CURRENT_TIMESTAMP + INTERVAL '7 days')`,
      ['d_inv_test_2', discovery.business.id, 'STAFF@EXAMPLE.COM', discovery.user.id],
    ),
    /uq_discovery_business_pending_invitation|duplicate key|unique/i,
  );

  const migrationCheck = await db.query(
    `SELECT version,name FROM schema_migrations WHERE version='044'`,
  );
  assert.strictEqual(migrationCheck.rows.length, 1);
  assert.strictEqual(migrationCheck.rows[0].name, 'business_team_invitations');

  console.log('Merchant owner signup tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
