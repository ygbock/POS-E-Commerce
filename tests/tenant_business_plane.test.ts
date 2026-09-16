import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateLocationPayload, validateCustomerPayload, validateUserPayload, ValidationError } from '../server/validation/index.ts';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../server/auth/roles.ts';

const root = process.cwd();

function expectValidation(fn:()=>unknown, message:string) {
  assert.throws(fn, (err) => err instanceof ValidationError, message);
}

assert.equal(PERMISSIONS.LOCATIONS_VIEW, 'locations.view');
assert.equal(PERMISSIONS.LOCATIONS_MANAGE, 'locations.manage');
assert.ok(ROLE_PERMISSIONS.admin.includes(PERMISSIONS.LOCATIONS_MANAGE));
assert.ok(ROLE_PERMISSIONS.manager.includes(PERMISSIONS.LOCATIONS_MANAGE));
assert.ok(ROLE_PERMISSIONS.inventory_manager.includes(PERMISSIONS.LOCATIONS_VIEW));

assert.deepEqual(validateLocationPayload({
  code:'STORE-01', name:'Main Store', type:'Retail Store', is_pos_enabled:true, is_active:true
}), { code:'STORE-01', name:'Main Store', type:'Retail Store', is_pos_enabled:true, is_active:true });
expectValidation(()=>validateLocationPayload({code:'x',name:'A',type:'Invalid'}),'invalid location must fail');
expectValidation(()=>validateLocationPayload({code:'STORE-01',name:'Main Store',type:'Retail Store',organization_id:'other'}),'organization spoofing must fail');

assert.equal(validateCustomerPayload({name:'Jane Doe',email:'jane@example.com',store_credit_balance:'25.00'}).name,'Jane Doe');
expectValidation(()=>validateCustomerPayload({name:'Jane',store_credit_balance:25}),'numeric money must fail');
expectValidation(()=>validateCustomerPayload({name:'Jane',organizationId:'other'}),'customer tenant spoofing must fail');

assert.equal(validateUserPayload({name:'Cashier',email:'cashier@example.com',password:'Password123!',role:'cashier'}).role,'cashier');
expectValidation(()=>validateUserPayload({name:'Admin',email:'a@example.com',password:'Password123!',role:'system_owner'}),'platform role must not be accepted by tenant user UI contract');

const serverSource=fs.readFileSync(path.join(root,'server.ts'),'utf8');
assert.match(serverSource,/app\.post\(\s*['"]\/api\/locations['"]/);
assert.match(serverSource,/app\.put\(\s*['"]\/api\/locations\/:id['"]/);
assert.match(serverSource,/app\.post\(\s*['"]\/api\/customers['"]/);
assert.match(serverSource,/app\.put\(\s*['"]\/api\/customers\/:id['"]/);
assert.match(serverSource,/WHERE id = \$1 AND organization_id = \$2/);
assert.match(serverSource,/DUPLICATE_LOCATION_CODE/);

assert.ok(fs.existsSync(path.join(root,'src/components/admin/UserManagementView.tsx')));
assert.ok(fs.existsSync(path.join(root,'src/components/admin/LocationManagementView.tsx')));
assert.ok(fs.existsSync(path.join(root,'src/components/crm/CustomerManagementView.tsx')));

console.log('Tenant business-plane contract tests: 18 assertions passed.');
