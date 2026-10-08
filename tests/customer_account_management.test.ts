import assert from 'assert';
import fs from 'fs';
import path from 'path';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

async function main() {
  const server = read('server.ts');
  const authService = read('server/services/authService.ts');
  const middleware = read('server/middleware/auth.ts');

  // Global customer account APIs must exist and be customer-only.
  assert.match(server, /app\.get\('\/api\/auth\/customer\/account'/);
  assert.match(server, /app\.patch\('\/api\/auth\/customer\/account'/);
  assert.match(server, /app\.post\('\/api\/auth\/customer\/change-password'/);
  assert.match(server, /app\.post\('\/api\/auth\/customer\/deactivate'/);

  const accountSection = server.slice(server.indexOf("app.get('/api/auth/customer/account'"), server.indexOf("app.post('/api/auth/refresh'"));
  assert.match(accountSection, /requireAuth\(\), requireCustomerIdentity\(\)/);
  assert.match(accountSection, /changeCustomerPassword/);
  assert.match(accountSection, /deactivateCustomerAccount/);

  // Profile editing deliberately does not expose email mutation. Email changes require
  // a future verified-email change workflow rather than silently bypassing verification.
  assert.doesNotMatch(accountSection, /req\.body\?\.email/);

  // Service layer is defense-in-depth: every global customer account mutation/query is
  // constrained to role='customer' and identity_type='customer'.
  assert.match(authService, /getCustomerAccount[\s\S]*?role='customer' AND identity_type='customer'/);
  assert.match(authService, /updateCustomerAccount[\s\S]*?role='customer' AND identity_type='customer'/);
  assert.match(authService, /changeCustomerPassword[\s\S]*?role='customer' AND identity_type='customer'/);
  assert.match(authService, /deactivateCustomerAccount[\s\S]*?role='customer' AND identity_type='customer'/);

  // Sensitive account operations revoke durable sessions.
  assert.match(authService, /changeCustomerPassword[\s\S]*?revokeAllUserSessions\(this\.db, userId, 'password-changed'\)/);
  assert.match(authService, /deactivateCustomerAccount[\s\S]*?revokeAllUserSessions\(this\.db, userId, 'customer-account-deactivated'\)/);

  // Customer-only middleware remains the server-side boundary.
  assert.match(middleware, /export function requireCustomerIdentity/);
  assert.match(middleware, /identityType !== 'customer' \|\| req\.auth\.role !== 'customer'/);

  console.log('Customer account management boundary PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
