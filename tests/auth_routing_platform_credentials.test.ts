import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeRole } from '../server/auth/roles.ts';

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

async function main() {
  assert.strictEqual(normalizeRole('platform_admin'), 'platform_admin');
  assert.strictEqual(normalizeRole('Platform Admin'), 'platform_admin');
  assert.strictEqual(normalizeRole('PLATFORM-ADMIN'), 'platform_admin');
  assert.strictEqual(normalizeRole(' business_owner '), 'business_owner');

  const authService = read('server/services/authService.ts');
  assert.match(authService, /const role = normalizeRole\(user\.role\)/);
  assert.match(authService, /process\.env\.ABACHA_PLATFORM_ADMIN_EMAIL/);
  assert.match(authService, /process\.env\.ABACHA_PLATFORM_ADMIN_PASSWORD\?\.trim\(\)/);
  assert.match(authService, /platformAdminEmail/);

  const authClient = read('src/services/authClient.ts');
  assert.match(authClient, /import\.meta\.env as Record<string, string \| undefined>/);
  assert.match(authClient, /PERSONA_ROLE_MISMATCH/);
  assert.match(authClient, /'Platform Admin': 'platform_admin'/);

  const login = read('src/components/auth/LoginPage.tsx');
  assert.match(login, /user\.role === 'business_owner'/);
  assert.match(login, /fetch\('\/api\/merchant\/me'/);
  assert.match(login, /requestedWorkspace/);
  assert.match(login, /businessId: assignedBusiness\.id/);
  assert.match(login, /window\.location\.assign\('\/business\/'/);
  assert.match(login, /'\/inventory': 'inventory'/);
  assert.match(login, /'\/pos': 'pos'/);

  console.log('Authentication routing and platform credential regression contract passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
