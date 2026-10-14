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
assert.match(ui, /import \{ canAccessPlatform \} from '\.\/platformAccess'/, 'Dashboard shortcuts must use the canonical platform access policy');
assert.match(ui, /canAccessPlatform\(accessRole, 'billing'\)/, 'Billing shortcut visibility must follow canonical billing permissions');
assert.match(ui, /canAccessPlatform\(accessRole, 'support'\)/, 'Support shortcut visibility must be restricted to authorized platform roles');
assert.match(ui, /canAccessPlatform\(accessRole, 'manage'\)/, 'Security and Discovery shortcuts must follow platform management permissions');
assert.match(ui, /normalizedRole === 'platform_support' \? 'Platform Support'/, 'Platform Support must be explicitly mapped instead of inheriting access by exclusion');
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
assert.match(ui, /function readMetricNumber\(value: unknown\): number \| null/, 'Optional API metrics must be normalized without coercing null to zero');
assert.match(ui, /typeof value !== 'string' \|\| value\.trim\(\) === ''/, 'Missing and blank metric values must remain unavailable');
assert.match(ui, /activeUsers: readMetricNumber\(overview\.activeUsers\)/, 'Missing active-user metrics must not be rendered as zero');
assert.match(ui, /mrr: billing \? readMetricNumber\(billing\.mrr\) : null/, 'Missing billing revenue must remain unavailable rather than zero');
assert.match(ui, /overviewUpdatedAt: new Date\(\)\.toISOString\(\)/, 'Overview refresh time must reflect a successful overview response');
assert.match(ui, /billingUpdatedAt: billing\?\.lastUpdated \|\| null/, 'Billing refresh time must come from the billing API rather than a fabricated client timestamp');
assert.match(ui, /Billing update timestamp unavailable/, 'Dashboard must distinguish unavailable billing timestamps from overview refresh time');
assert.doesNotMatch(ui, /updatedAt: billing\?\.lastUpdated \|\| new Date\(\)\.toISOString\(\)/, 'Dashboard must not label the client refresh time as authoritative billing update time');
assert.doesNotMatch(ui, /totalTenants:\s*12|activeSubscriptions:\s*11|mrr:\s*4890|99\.99%|All micro-services fully operational/, 'Dashboard must not display fabricated metrics');
assert.doesNotMatch(ui, /<div\s+[^>]*onClick=/, 'Clickable dashboard actions must not be non-semantic div elements');

// Tenant Management UI must use canonical lifecycle endpoints and the list API's
// filtering/pagination contract; lifecycle and billing mutations remain separated.
const tenantUi = fs.readFileSync(path.join(root, 'src/components/platform/TenantManagementView.tsx'), 'utf8');
assert.match(tenantUi, /new URLSearchParams\(\{ status: statusFilter, limit: String\(PAGE_SIZE\), offset: String\(offset\) \}\)/, 'Tenant list must request bounded pages and the selected lifecycle filter');
assert.match(tenantUi, /params\.set\('search', searchQuery\)/, 'Tenant list must pass search terms to the API');
assert.match(tenantUi, /currentPage=\{currentPage\} totalPages=\{totalPages\}/, 'Tenant list must expose pagination controls');
assert.match(tenantUi, /Showing .*tenant organizations/, 'Tenant list must report result counts');
assert.match(tenantUi, /tenant\.planTier/, 'Tenant plan display must use the API DTO field planTier');
assert.match(tenantUi, /tenant\.subscriptionStatus/, 'Tenant list must display subscription state returned by the service');
assert.match(tenantUi, /\/\$\{action\}/, 'Lifecycle buttons must call the canonical suspend/reactivate routes');
assert.match(tenantUi, /'suspend' : 'reactivate'/, 'Active tenants suspend and suspended tenants reactivate');
assert.match(tenantUi, /tenant\.status === 'archived'/, 'Archived tenants must be treated as read-only');
assert.match(tenantUi, /form\.adminPassword\.length < 12/, 'Create button must enforce the minimum administrator password length');
assert.doesNotMatch(tenantUi, /method: 'PATCH',[\s\S]{0,100}isActive/, 'Lifecycle UI must not call the forbidden PATCH isActive mutation');
assert.doesNotMatch(tenantUi, /method: 'PATCH',[\s\S]{0,100}planTier/, 'Tenant UI must not use PATCH for billing plan changes');

assert.match(tenantUi, /PROFILE_FIELDS\.map/, 'Tenant form must expose expanded profile fields');
assert.match(tenantUi, /profile \}/, 'Tenant provisioning must submit profile data separately from credentials');
assert.match(tenantUi, /openTenantDetails/, 'Tenant table must expose a working detail action');
assert.match(tenantUi, /editTenant/, 'Tenant table must expose a working edit action');
assert.match(tenantUi, /archiveSelectedTenant/, 'Tenant table must expose archive rather than destructive delete');
assert.match(tenantUi, /discoveryListing/, 'Tenant details must distinguish linked Discovery listings from tenant provisioning');
assert.match(tenantUi, /Open Trust &amp; Moderation/, 'Tenant details must link to the separate Discovery moderation workflow');
const tenantService = fs.readFileSync(path.join(root, 'server/services/tenantProvisioningService.ts'), 'utf8');
assert.match(tenantService, /validateTenantProfile/, 'Tenant profile fields must be validated server-side');
assert.match(tenantService, /lifecycle_status === 'archived'[\s\S]{0,200}Archived tenants are read-only/, 'Archived tenant edits must be rejected server-side');
assert.match(tenantService, /FROM discovery_businesses WHERE organization_id = \$1/, 'Tenant detail must expose optional linked Discovery listing information');
const tenantProfileMigration = fs.readFileSync(path.join(root, 'server/db/migrations/071_tenant_profile_details.sql'), 'utf8');
assert.match(tenantProfileMigration, /ADD COLUMN IF NOT EXISTS profile JSONB/, 'Tenant profile data must be persisted in an organization profile field');

console.log('Platform dashboard and tenant management contracts: PASS');


// SaaS billing UI must mirror the backend's platform.billing permission boundary.
const platformNavigation = fs.readFileSync(path.join(root, 'src/components/platform/platformNavigation.ts'), 'utf8');
const platformAccess = fs.readFileSync(path.join(root, 'src/components/platform/platformAccess.ts'), 'utf8');
const subscriptionsUi = fs.readFileSync(path.join(root, 'src/components/platform/SubscriptionsManagementView.tsx'), 'utf8');
const platformAdminNav = platformNavigation.match(/case 'Platform Admin':([\s\S]*?)case 'System Owner'/)?.[1] || '';
assert.ok(platformAdminNav, 'Platform Admin navigation must be defined explicitly');
assert.match(platformAdminNav, /subscriptions|Plans & Subscriptions/, 'Platform Admin must see subscription navigation');
assert.match(platformNavigation, /case 'Platform Finance':[\s\S]*?Plans & Subscriptions/, 'Platform Finance must retain subscription navigation');
assert.match(platformAccess, /function canManagePlatformPlans\(role: Role \| string\): boolean \{\s*return role === 'System Owner' \|\| role === 'Platform Admin' \|\| role === 'Platform Finance';/, 'Plan management visibility must match backend billing authorization');
assert.match(platformAccess, /function canManagePlatformSubscriptions\(role: Role \| string\): boolean \{\s*return role === 'System Owner' \|\| role === 'Platform Admin' \|\| role === 'Platform Finance';/, 'Subscription management visibility must match backend billing authorization');
assert.match(platformAccess, /if \(role === 'Platform Admin'\) return true;/, 'Platform Admin must have frontend billing access');
assert.match(subscriptionsUi, /canAccessPlatform\(currentRole, 'billing'\)/, 'Subscription view must check canonical billing permission before loading data');
assert.match(subscriptionsUi, /Billing access required/, 'Unauthorized direct navigation must explain the correct access requirement');
assert.match(subscriptionsUi, /if \(!canViewBilling\) \{\s*setIsLoading\(false\);\s*return;/, 'Unauthorized users must not issue billing API requests from this view');

console.log('SaaS billing role-aware UI contracts: PASS');
