import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

async function main() {
  const portal = read('src/components/merchant/BusinessOwnerPortal.tsx');
  const routes = read('server/routes/merchantRoutes.ts');

  assert.match(portal, /\/api\/merchant\/businesses\/\$\{encodeURIComponent\(businessId\)\}\/overview/);
  assert.match(portal, /Operational readiness/);
  assert.match(portal, /Quick operations/);
  assert.match(portal, /workspace=\$\{workspace\}/);
  assert.match(portal, /businessId=\$\{encodeURIComponent\(business\.id\)\}/);
  for (const workspace of ['catalog', 'inventory', 'orders', 'pos']) {
    assert.match(portal, new RegExp('workspace: [\x27]' + workspace + '[\x27]'));
  }

  assert.match(routes, /router\.get\('\/businesses\/:id\/overview'/);
  assert.match(routes, /m\.business_id=\$1 AND m\.user_id=\$2 AND m\.is_active=TRUE/);
  assert.match(routes, /const readiness = \{/);
  assert.match(routes, /listing:/);
  assert.match(routes, /catalog:/);
  assert.match(routes, /inventory:/);
  assert.match(routes, /storefront:/);

  console.log('Merchant workspace consolidation contract test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
