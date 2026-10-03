import assert from 'assert';
import { createIsolatedTestClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { verifyRestoredDatabase } from '../scripts/verify_backup_restore';
import {
  createBootstrapUser,
  generateSecurePassword,
  generateBootstrapSql,
  generateRevocationSql,
} from '../scripts/operator_bootstrap';

async function main() {
  const db = createIsolatedTestClient();
  try {
    await runMigrations(db);

    const restore = await verifyRestoredDatabase(db, 'LOCAL_RESTORE_TEST');
    assert.strictEqual(restore.scope, 'LOCAL_RESTORE_TEST');
    assert.strictEqual(restore.databaseEngine, 'embedded-pglite');
    assert.ok(restore.migrationsAppliedCount > 0);
    assert.ok(restore.tablesVerified.includes('organizations'));
    assert.ok(restore.tablesVerified.includes('orders'));
    assert.ok(restore.tablesVerified.includes('audit_events'));
    assert.strictEqual(restore.tenantIsolationVerified, true);
    assert.strictEqual(restore.sampleQueryPassed, true);
    assert.match(restore.disclaimer, /DOES NOT validate Render production PITR/i);

    const password = generateSecurePassword('Test_Operator');
    assert.ok(password.length >= 24);
    assert.notStrictEqual(password, generateSecurePassword('Test_Operator'));

    const bootstrap = createBootstrapUser({
      id: 'usr_ops_test',
      organizationId: 'org_ops_test',
      email: 'Operator@Test.Example',
      name: 'Ops Test User',
      role: 'admin',
      prefix: 'Ops_Test',
    });
    assert.strictEqual(bootstrap.email, 'operator@test.example');
    assert.ok(bootstrap.hash);
    assert.ok(bootstrap.salt);
    assert.ok(bootstrap.plainPassword);
    assert.notStrictEqual(bootstrap.hash, bootstrap.plainPassword);

    const sql = generateBootstrapSql(
      [bootstrap],
      [{ id: 'org_ops_test', name: "Ops Org O'Reilly", code: 'OPS-TEST' }],
      [],
    );
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /COMMIT;/);
    assert.ok(sql.includes("Ops Org O''Reilly"));
    assert.ok(!sql.includes(bootstrap.plainPassword));
    assert.ok(sql.includes(bootstrap.hash));

    const revokeSql = generateRevocationSql(['usr_ops_test']);
    assert.match(revokeSql, /UPDATE users SET is_active = false/);
    assert.match(revokeSql, /DELETE FROM revoked_tokens/);
    assert.ok(!revokeSql.includes('password'));

    console.log('TASK-5.9.1 production operations verification: PASS');
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
