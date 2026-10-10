import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const location = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryLocationSelector.tsx'), 'utf8');
const search = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoverySearchResults.tsx'), 'utf8');
const home = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryHome.tsx'), 'utf8');
const hero = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryHero.tsx'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'server/routes/discoveryRoutes.ts'), 'utf8');
const map = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryMapPanel.tsx'), 'utf8');

assert.match(location, /navigator\.geolocation\.getCurrentPosition/);
assert.match(location, /Location permission was denied/);
assert.match(location, /coordinates are never shared/);
assert.match(location, /district\?: string/);
assert.match(location, /region\?: string/);
assert.match(location, /Search Radius/);
assert.match(location, /Clear location filter/);
assert.match(location, /loadGeoLocations/);
assert.match(location, /Retry loading locations/);
assert.match(location, /location_type === 'COMMUNITY'/);

assert.match(search, /district: loc\.district/);
assert.match(search, /region: loc\.region/);
assert.match(search, /district: sp\.get\('district'\)/);
assert.match(search, /region: sp\.get\('region'\)/);
assert.match(search, /const radiusVal = sp\.get\('radiusKm'\)/);
assert.match(search, /const parseFinite = \(value: string \| null\): number \| null =>/);
assert.match(search, /const parsedRadius = parseFinite\(radiusVal\)/);
assert.match(search, /rawLat >= -90 && rawLat <= 90/);
assert.match(search, /rawLng >= -180 && rawLng <= 180/);
assert.match(search, /const hasCoordinatePair = parsedLat != null && parsedLng != null/);
assert.match(search, /lat: hasCoordinatePair \? parsedLat : undefined/);
assert.match(search, /lng: hasCoordinatePair \? parsedLng : undefined/);
assert.match(search, /radiusKm: parsedRadius != null \? Math\.max\(1, Math\.min\(500, parsedRadius\)\) : 25/);

assert.match(home, /locality: sp\.get\('locality'\) \|\| undefined/);
assert.match(home, /locality: selectedLocality/);
assert.match(home, /setSelectedLocality\(loc\.locality\)/);
assert.match(home, /services=\{servicesState\.data\}/);
assert.match(hero, /availableCommunities/);
assert.match(hero, /handleCommunitySelect/);
assert.match(home, /selectedLocality=\{selectedLocality\}/);
assert.match(hero, /selectedLocality \|\| selectedCity/);
assert.match(routes, /lower\(coalesce\(sl\.address_line_1,''\)\)/);
assert.match(routes, /l\.name AS location_name,l\.city,l\.district,l\.region,l\.latitude,l\.longitude/);

assert.match(map, /selectedPoint/);
assert.match(map, /loadLeaflet/);
assert.match(map, /tileLayer\('https:\/\/\{s\}\.tile\.openstreetmap\.org/);
assert.match(map, /h-\[460px\] sm:h-\[560px\] lg:h-\[680px\]/);
assert.match(map, /unmappedBusinessCount/);
assert.match(map, /unmappedServiceCount/);
assert.match(map, /services\?: DiscoveryService\[\]/);
assert.match(map, /point\.services\.forEach/);
assert.match(map, /Interactive map unavailable/);
assert.match(map, /openstreetmap\.org/);

console.log('Discovery PAGE-005 location/map contract tests passed.');
