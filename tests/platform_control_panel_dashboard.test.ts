import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ui = fs.readFileSync(path.join(root, 'src/components/platform/PlatformDashboard.tsx'), 'utf8');

assert.match(ui, /fetch\('\/api\/platform\/overview'/, 'Dashboard must load authoritative tenant and user metrics');
assert.match(ui, /fetch\('\/api\/platform\/billing'/, 'Billing metrics must come from the platform billing API');
const platformRoutes = fs.readFileSync(path.join(root, 'server/routes/platformRoutes.ts'), 'utf8');
assert.match(platformRoutes, /INNER JOIN organizations o ON o\.id = u\.organization_id/, 'Platform active-user count must exclude orphaned and platform-only user rows');
assert.match(platformRoutes, /router\.get\('\/users'/, 'Platform active-user workspace must have a read-only platform API');
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
assert.match(app, /activeTab === 'platform-users' && <PlatformUsersView \/>/, 'Platform user workspace must be routable from dashboard cards');
assert.match(ui, /const canViewBilling =/, 'Billing API access must be role-aware');
assert.match(ui, /go\('tenants'\)/, 'Tenant metrics must navigate to tenant management');
assert.match(ui, /onClick=\{\(\) => go\('platform-users'\)\}/, 'Active user metrics must navigate to the platform user workspace');
assert.match(ui, /Active user accounts belonging to active tenant organizations/, 'Active user metric must state its counting scope');
assert.match(ui, /go\('subscriptions'\)/, 'Billing metrics must navigate to subscriptions');
assert.match(ui, /type="button"/, 'Dashboard actions must use semantic buttons');
assert.match(ui, /focus-visible:ring-2/, 'Dashboard actions must provide visible keyboard focus');
assert.match(ui, /aria-label=/, 'Stat cards must expose accessible names');
assert.match(ui, /role="alert"/, 'Dashboard must expose API failures to assistive technology');
assert.match(ui, /Retry/, 'Dashboard errors must provide a retry action');
assert.match(ui, /billingUnavailable/, 'Billing API failure must be represented separately from tenant metrics');
assert.match(ui, /hasData/, 'Initial API failure must not display fabricated zero values');
assert.doesNotMatch(ui, /totalTenants:\s*12|activeSubscriptions:\s*11|mrr:\s*4890|99\.99%|All micro-services fully operational/, 'Dashboard must not display fabricated metrics');
assert.doesNotMatch(ui, /<div\s+[^>]*onClick=/, 'Clickable dashboard actions must not be non-semantic div elements');

console.log('Platform control panel dashboard interaction and metrics contract: PASS');
