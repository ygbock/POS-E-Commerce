import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');
const router=read('src/router/DiscoveryRouter.ts');
const market=read('src/components/discovery/DiscoveryMarketplace.tsx');
const saved=read('src/components/discovery/DiscoverySavedBusinessesPage.tsx');
const requests=read('src/components/discovery/DiscoveryServiceRequestsPage.tsx');
const inquiries=read('src/components/discovery/DiscoveryMyContactInquiriesPage.tsx');
const claims=read('src/components/discovery/DiscoveryMyClaimsPage.tsx');
const header=read('src/components/discovery/DiscoveryHeader.tsx');
const mobile=read('src/components/discovery/DiscoveryMobileBottomNav.tsx');
const api=read('src/services/discoveryApi.ts');
const routes=read('server/routes/discoveryRoutes.ts');

for(const route of ['discover-my-requests','discover-saved','discover-my-inquiries','discover-my-claims']) assert.match(router,new RegExp(route));
assert.match(market,/requireCustomerAuth/);
assert.match(market,/\/login\?redirect=/);
assert.match(market,/route\.name === 'discover-saved'/);
assert.match(market,/route\.name === 'discover-my-requests'/);
assert.match(market,/route\.name === 'discover-my-inquiries'/);
assert.match(market,/route\.name === 'discover-my-claims'/);

for(const [file,msg] of [[saved,'saved businesses'],[requests,'service requests'],[inquiries,'contact inquiries'],[claims,'ownership claims']] as const){
 assert.match(file,/authClient\.getToken\(\)/);
 assert.match(file,new RegExp('Sign in is required'));
}
assert.match(header,/workspaceHref = \(path: string\) => authClient\.getToken\(\) \? path : '\/login\?redirect='/);
assert.match(mobile,/token \? '\/discover\/saved' : '\/login\?redirect=/);
assert.match(mobile,/token \? '\/discover\/my-requests' : '\/login\?redirect=/);

assert.match(api,/getMyFavoriteBusinesses/);
assert.match(api,/getMyContactInquiries/);
assert.match(api,/getMyClaims/);
assert.match(routes,/WHERE f\.user_id=\$1/);
assert.match(routes,/WHERE i\.customer_user_id=\$1/);
assert.match(routes,/WHERE c\.claimant_user_id=\$1/);
assert.match(routes,/router\.get\('\/favorites', requireAuth\(\), requireCustomerIdentity\(\)/);
assert.match(routes,/router\.get\('\/my-claims', requireAuth\(\), requireCustomerIdentity\(\)/);
assert.match(routes,/identityType === 'customer' \|\| req\.auth!\.role === 'customer'/);
assert.match(routes,/router\.post\('\/service-requests', requireAuth\(\), requireCustomerIdentity\(\)/);
assert.match(routes,/router\.get\('\/service-requests', requireAuth\(\), requireCustomerIdentity\(\)/);
assert.match(routes,/router\.get\('\/service-requests\/:id', requireAuth\(\), requireCustomerIdentity\(\)/);
assert.match(routes,/router\.post\('\/service-requests\/:id\/cancel', requireAuth\(\), requireCustomerIdentity\(\)/);
assert.match(routes,/router\.post\('\/service-requests\/:id\/quotes\/:quoteId\/accept', requireAuth\(\), requireCustomerIdentity\(\)/);
assert.match(routes,/router\.post\('\/service-requests\/:id\/quotes\/:quoteId\/decline', requireAuth\(\), requireCustomerIdentity\(\)/);
assert.match(routes,/router\.post\('\/businesses\/:id\/reviews', requireAuth\(\), requireCustomerIdentity\(\)/);
assert.match(routes,/router\.get\('\/contact-inquiries', requireAuth\(\), requireCustomerIdentity\(\)/);
assert.match(routes,/router\.post\('\/businesses\/:id\/claims', requireAuth\(\), requireCustomerIdentity\(\)/);

console.log('Discovery PAGE-008 customer workspace contract tests passed.');

const categoryRoutes = routes.match(/router\.get\('\/categories'/g) || [];
assert.strictEqual(categoryRoutes.length, 1, 'Discovery categories route must have one authoritative declaration');
const providerRequestRoutes = routes.match(/router\.get\('\/businesses\/:id\/service-requests'/g) || [];
assert.strictEqual(providerRequestRoutes.length, 1, 'Provider service-request route must have one authoritative declaration');
