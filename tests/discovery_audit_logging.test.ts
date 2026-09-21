import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { DiscoveryBusinessRepository } from '../server/repositories/discoveryBusinessRepository';
import { DiscoveryBusinessService } from '../server/services/discoveryBusinessService';
import { AuditRepository, sanitizeAuditData } from '../server/repositories/auditRepository';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  await runMigrations(db);
  await db.query("INSERT INTO organizations (id,name,code,is_active) VALUES ('audit_disc_org','Audit Discovery Org','AUD_DISC',TRUE)");
  await db.query(
    `INSERT INTO users (id,organization_id,email,name,password_hash,password_salt,role,is_active)
     VALUES ('audit-owner','audit_disc_org','audit-owner@test.local','Audit Owner','hash','salt','admin',TRUE)`,
  );

  const audit = new AuditRepository(db);
  const repo = new DiscoveryBusinessRepository(db);
  const service = new DiscoveryBusinessService(repo, db);
  const actor = { userId: 'audit-owner', role: 'business_owner', organizationId: 'audit_disc_org' };

  const business = await service.create({
    name: 'Audited Discovery Business',
    shortDescription: 'Audit test listing',
    businessMode: 'DISCOVERY_ONLY',
    createdByUserId: actor.userId,
  }, actor);

  await service.update(business.id, { shortDescription: 'Updated audit listing' }, actor);
  await service.archive(business.id, actor, 'Audit logging lifecycle test');

  const events = await db.query(
    `SELECT action,entity_type,entity_id,actor_id,actor_role,organization_id,before_state,after_state,metadata,result
       FROM audit_events
      WHERE entity_id=$1
      ORDER BY timestamp ASC`,
    [business.id],
  );

  assert.ok(events.rows.some((row: any) => row.action === 'DISCOVERY_BUSINESS_CREATED'));
  assert.ok(events.rows.some((row: any) => row.action === 'DISCOVERY_BUSINESS_UPDATED'));
  const lifecycle = events.rows.find((row: any) => row.action === 'DISCOVERY_LISTING_ARCHIVED');
  assert.ok(lifecycle, 'archive lifecycle must be audited');
  assert.strictEqual(lifecycle.actor_id, actor.userId);
  assert.strictEqual(lifecycle.actor_role, actor.role);
  assert.strictEqual(lifecycle.organization_id, actor.organizationId);
  assert.strictEqual(lifecycle.result, 'SUCCESS');
  assert.strictEqual(lifecycle.before_state.listing_status, 'DRAFT');
  assert.strictEqual(lifecycle.after_state.listing_status, 'ARCHIVED');

  await audit.recordEvent({
    organization_id: actor.organizationId,
    actor_id: actor.userId,
    actor_name: actor.userId,
    actor_role: actor.role,
    action: 'AUDIT_SANITIZATION_TEST',
    entity_type: 'SECURITY',
    entity_id: business.id,
    metadata: { authorization: 'Bearer super-secret-token-value-should-not-persist', nested: { password: 'secret-value' } },
  });

  const sanitized = await db.query(
    "SELECT metadata FROM audit_events WHERE action='AUDIT_SANITIZATION_TEST' AND entity_id=$1 ORDER BY timestamp DESC LIMIT 1",
    [business.id],
  );
  assert.strictEqual(sanitized.rows[0].metadata.authorization, '[REDACTED]');
  assert.strictEqual(sanitized.rows[0].metadata.nested.password, '[REDACTED]');
  assert.strictEqual(sanitizeAuditData({ token: 'abc', safe: 'value' }).token, '[REDACTED]');

  console.log('Discovery audit logging tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
