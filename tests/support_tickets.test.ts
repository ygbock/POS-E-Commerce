import assert from 'assert';
import { createIsolatedTestClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { SupportService } from '../server/services/supportService';

async function main() {
  const db = createIsolatedTestClient();
  try {
    await runMigrations(db);
    await db.query("INSERT INTO organizations (id,name,code,is_active,plan_tier) VALUES ('org_support_a','Support A','SUP-A',true,'starter'),('org_support_b','Support B','SUP-B',true,'starter'),('org_platform','Platform','PLATFORM',true,'starter')");
    await db.query("INSERT INTO users (id,organization_id,email,password_hash,password_salt,name,role,is_active) VALUES ('user_support_a','org_support_a','support-a@example.com','x','x','Tenant A','admin',true),('user_support_b','org_support_b','support-b@example.com','x','x','Tenant B','admin',true),('user_platform_support','org_platform','platform@example.com','x','x','Platform Support','platform_support',true)");

    const service = new SupportService(db);
    const ticket = await service.createTicket({ organizationId:'org_support_a', createdByUserId:'user_support_a', subject:'Inventory sync issue', description:'Stock is not reflecting after a transfer.', priority:'HIGH' });
    assert.ok(ticket?.id);
    assert.strictEqual(ticket.organization_id, 'org_support_a');
    assert.strictEqual((await service.listTickets({ organizationId:'org_support_b' })).length, 0);
    assert.strictEqual((await service.listTickets({ organizationId:'org_support_a' })).length, 1);

    await service.addMessage(ticket.id, 'user_platform_support', 'We are investigating.', false);
    assert.strictEqual((await service.getTicket(ticket.id, 'org_support_a'))?.messages.length, 1);
    await service.updateTicket(ticket.id, { status:'RESOLVED' }, 'user_platform_support');
    assert.strictEqual((await service.getTicket(ticket.id))?.status, 'RESOLVED');

    const notifications = await service.listNotifications('user_support_a', { unreadOnly:true });
    assert.ok(notifications.length >= 1);
    await service.markAllNotificationsRead('user_support_a');
    assert.strictEqual((await service.listNotifications('user_support_a', { unreadOnly:true })).length, 0);
    console.log('TASK-5.8.1 support/notifications: PASS');
  } finally { await db.close(); }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
