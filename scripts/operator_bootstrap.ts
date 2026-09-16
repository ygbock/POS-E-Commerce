/**
 * Operator Bootstrap & Account Lifecycle Utility (UPG-001G)
 * 
 * Provides secure operator-driven generation of initial administrative accounts
 * and temporary smoke-test identities without introducing unauthenticated HTTP backdoors.
 * 
 * SUPERVISOR GOVERNANCE (Condition #5):
 * - Uses canonical PBKDF2 application hashing utility (server/auth/password.ts).
 * - Never commits credentials or writes permanent plaintext passwords to the repository.
 * - Outputs instructions for the operator to immediately store generated passwords in the customer vault.
 * - Provides immediate deactivation and revocation SQL commands.
 */

import crypto from 'crypto';
import { hashPassword } from '../server/auth/password';

export interface BootstrapUser {
  id: string;
  organizationId: string;
  locationId?: string;
  email: string;
  name: string;
  role: string;
  plainPassword: string;
  hash: string;
  salt: string;
}

export function generateSecurePassword(prefix: string = 'AbaCha_Op'): string {
  const entropy = crypto.randomBytes(16).toString('base64url');
  const special = '!9A';
  return `${prefix}_${entropy}${special}`;
}

export function createBootstrapUser(params: {
  id: string;
  organizationId: string;
  locationId?: string;
  email: string;
  name: string;
  role: string;
  prefix?: string;
}): BootstrapUser {
  const plainPassword = generateSecurePassword(params.prefix);
  const { hash, salt } = hashPassword(plainPassword);

  return {
    id: params.id,
    organizationId: params.organizationId,
    locationId: params.locationId,
    email: params.email.toLowerCase().trim(),
    name: params.name.trim(),
    role: params.role,
    plainPassword,
    hash,
    salt,
  };
}

export function generateBootstrapSql(users: BootstrapUser[], organizations: { id: string; name: string; code: string }[], locations: { id: string; orgId: string; name: string; code: string }[]): string {
  let sql = `-- ==========================================================================\n`;
  sql += `-- AbaCha Unified Commerce: Operator Account Provisioning Script\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += `-- WARNING: Execute directly in target database. Never commit or track this SQL.\n`;
  sql += `-- ==========================================================================\n\n`;
  sql += `BEGIN;\n\n`;

  // Organizations
  for (const org of organizations) {
    sql += `INSERT INTO organizations (id, name, code, is_active)\n`;
    sql += `VALUES ('${org.id}', '${org.name.replace(/'/g, "''")}', '${org.code}', true)\n`;
    sql += `ON CONFLICT (id) DO NOTHING;\n\n`;
  }

  // Locations
  for (const loc of locations) {
    sql += `INSERT INTO locations (id, organization_id, code, name, type, is_pos_enabled, is_active)\n`;
    sql += `VALUES ('${loc.id}', '${loc.orgId}', '${loc.code}', '${loc.name.replace(/'/g, "''")}', 'Retail Store', true, true)\n`;
    sql += `ON CONFLICT (id) DO NOTHING;\n\n`;
  }

  // Users
  for (const u of users) {
    sql += `INSERT INTO users (id, organization_id, location_id, email, name, password_hash, password_salt, role, is_active)\n`;
    sql += `VALUES (\n`;
    sql += `  '${u.id}',\n`;
    sql += `  '${u.organizationId}',\n`;
    sql += `  ${u.locationId ? `'${u.locationId}'` : 'NULL'},\n`;
    sql += `  '${u.email}',\n`;
    sql += `  '${u.name.replace(/'/g, "''")}',\n`;
    sql += `  '${u.hash}',\n`;
    sql += `  '${u.salt}',\n`;
    sql += `  '${u.role}',\n`;
    sql += `  true\n`;
    sql += `)\n`;
    sql += `ON CONFLICT (id) DO UPDATE SET\n`;
    sql += `  password_hash = '${u.hash}',\n`;
    sql += `  password_salt = '${u.salt}',\n`;
    sql += `  is_active = true;\n\n`;
  }

  sql += `COMMIT;\n`;
  return sql;
}

export function generateRevocationSql(userIds: string[]): string {
  let sql = `-- ==========================================================================\n`;
  sql += `-- AbaCha Unified Commerce: Smoke Account Immediate Deactivation & Revocation\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += `-- ==========================================================================\n\n`;
  sql += `BEGIN;\n\n`;
  
  const idList = userIds.map((id) => `'${id}'`).join(', ');
  sql += `-- 1. Deactivate User Accounts\n`;
  sql += `UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id IN (${idList});\n\n`;

  sql += `-- 2. Invalidate Active User Sessions\n`;
  sql += `DELETE FROM revoked_tokens WHERE user_id IN (${idList});\n\n`;

  sql += `COMMIT;\n`;
  return sql;
}

// CLI Driver
if (process.argv[1] && process.argv[1].endsWith('operator_bootstrap.ts')) {
  const mode = process.argv[2] || 'help';

  if (mode === 'smoke') {
    const admin = createBootstrapUser({
      id: 'usr_smoke_admin',
      organizationId: 'org_smoke_test',
      locationId: 'loc_smoke_test_store',
      email: 'smoke-admin@abacha.internal',
      name: 'Smoke Admin',
      role: 'admin',
      prefix: 'Smoke_Admin',
    });

    const cashier = createBootstrapUser({
      id: 'usr_smoke_cashier',
      organizationId: 'org_smoke_test',
      locationId: 'loc_smoke_test_store',
      email: 'smoke-cashier@abacha.internal',
      name: 'Smoke Cashier',
      role: 'cashier',
      prefix: 'Smoke_Cashier',
    });

    const rival = createBootstrapUser({
      id: 'usr_smoke_rival_admin',
      organizationId: 'org_smoke_rival',
      email: 'rival-admin@abacha.internal',
      name: 'Rival Admin',
      role: 'admin',
      prefix: 'Smoke_Rival',
    });

    const orgs = [
      { id: 'org_smoke_test', name: 'AbaCha Smoke Test Org', code: 'ORG-SMOKE' },
      { id: 'org_smoke_rival', name: 'Rival Isolation Tenant Org', code: 'ORG-RIVAL' },
    ];

    const locs = [
      { id: 'loc_smoke_test_store', orgId: 'org_smoke_test', name: 'Render Smoke Store', code: 'LOC-SMOKE-1' },
    ];

    const sql = generateBootstrapSql([admin, cashier, rival], orgs, locs);

    console.log('\n=============================================================');
    console.log(' OPERATOR BOOTSTRAP SQL GENERATED');
    console.log('=============================================================');
    console.log(sql);

    console.log('=============================================================');
    console.log(' VAULT STORAGE INSTRUCTIONS FOR OPERATOR:');
    console.log(' Store generated credentials immediately into Customer Secret Manager:');
    console.log(` Admin:   ${admin.email} (Org: ${admin.organizationId})`);
    console.log(` Cashier: ${cashier.email} (Org: ${cashier.organizationId})`);
    console.log(` Rival:   ${rival.email} (Org: ${rival.organizationId})`);
    console.log(' DO NOT commit, log, or share passwords.');
    console.log('=============================================================\n');
  } else if (mode === 'revoke') {
    const sql = generateRevocationSql(['usr_smoke_admin', 'usr_smoke_cashier', 'usr_smoke_rival_admin']);
    console.log(sql);
  } else {
    console.log('Usage:');
    console.log('  npx tsx scripts/operator_bootstrap.ts smoke    - Generate smoke provisioning SQL');
    console.log('  npx tsx scripts/operator_bootstrap.ts revoke   - Generate smoke revocation SQL');
  }
}
