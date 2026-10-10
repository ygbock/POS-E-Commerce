import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const home = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryHome.tsx'), 'utf8');
const selector = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryLocationSelector.tsx'), 'utf8');
const searchResults = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoverySearchResults.tsx'), 'utf8');

// The home search must actually pass the AbortSignal it creates; otherwise an older
// request can resolve after a newer query/location and overwrite the latest results.
assert.match(home, /const controller = new AbortController\(\);[\s\S]{0,100}abortControllerRef\.current = controller;/);
assert.match(home, /discoveryApi\.search\([\s\S]*?\}, \{ signal: controller\.signal \}\);/);
assert.match(home, /if \(controller\.signal\.aborted \|\| \(err instanceof DOMException && err\.name === 'AbortError'\)\) return;/);

// URL state is externally editable/bookmarkable, so malformed coordinates and filters
// must not leak NaN or half a coordinate pair into the authoritative API request.
assert.match(home, /const parseCoordinate = \(value: string \| null, min: number, max: number\)/);
assert.match(home, /parseCoordinate\(sp\.get\('lat'\), -90, 90\)/);
assert.match(home, /parseCoordinate\(sp\.get\('lng'\), -180, 180\)/);
assert.match(home, /const hasCoordinatePair = parsedLat != null && parsedLng != null/);
assert.match(home, /lat: hasCoordinatePair \? parsedLat : undefined/);
assert.match(home, /lng: hasCoordinatePair \? parsedLng : undefined/);
assert.match(home, /Math\.max\(1, Math\.min\(500, parsedRadius\)\)/);
assert.match(home, /validTypes\.includes\(rawType as DiscoverySearchType\)/);
assert.match(home, /validSorts\.includes\(rawSort as DiscoverySortOption\)/);

// Manual place selection clears GPS coordinates; browser geolocation is opt-in.
assert.match(selector, /navigator\.geolocation\.getCurrentPosition/);
assert.match(selector, /lat: null,[\s\S]*lng: null,/);
assert.match(searchResults, /discoveryApi\.search\([\s\S]*?\}, \{ signal: controller\.signal \}\)/);

console.log('Discovery home search and location resilience contract tests passed.');
