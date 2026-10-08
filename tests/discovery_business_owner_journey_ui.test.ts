import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const container = fs.readFileSync(path.join(root, 'src/components/discovery/business/DiscoveryBusinessContainer.tsx'), 'utf8');
const listing = fs.readFileSync(path.join(root, 'src/components/discovery/business/DiscoveryListingManagementWorkspace.tsx'), 'utf8');
const hours = fs.readFileSync(path.join(root, 'src/components/discovery/business/DiscoveryHoursEditor.tsx'), 'utf8');
const verification = fs.readFileSync(path.join(root, 'src/components/discovery/business/DiscoveryVerificationPanel.tsx'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryBusinessProfile.tsx'), 'utf8');

assert.match(container, /'listing','submission','locations','hours','services'/);
assert.match(container, /'verification','trust','analytics'/);
assert.match(container, /discoveryApi\.getMyBusinesses\(\)/);
assert.match(container, /membership_role/);

assert.match(listing, /business\.listing_status === 'PUBLISHED'/);
assert.match(listing, /Submit updated listing for review/);
assert.match(listing, /Submit Updated Listing/);
assert.match(listing, /temporarily hidden while the review is active/);

assert.match(hours, /discoveryApi\.getBusinessHours\(business\.id\)/);
assert.match(hours, /initialLocationId/);
assert.match(hours, /row\.location_id === preferredLocationId/);
assert.match(hours, /row\.location_id === selectedLocationId/);

assert.match(verification, /discoveryApi\.getVerification\(business\.id\)/);
assert.match(verification, /discoveryApi\.submitVerification\(business\.id/);

assert.match(profile, /role === 'business_owner'/);
assert.match(profile, /identityType === 'business_owner'/);
assert.match(profile, /discoveryApi\.createClaim\(profile\.business\.id/);

console.log('Discovery Business Owner journey UI contract: PASS');
