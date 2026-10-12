import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const location = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryLocationSelector.tsx'), 'utf8');
const search = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoverySearchResults.tsx'), 'utf8');
const home = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryHome.tsx'), 'utf8');
const hero = fs.readFileSync(path.join(root, 'src/components/discovery/DiscoveryHero.tsx'), 'utf8');
const onboarding = fs.readFileSync(path.join(root, 'src/components/discovery/business/DiscoveryOnboardingWizard.tsx'), 'utf8');
const mapEditor = fs.readFileSync(path.join(root, 'src/components/discovery/business/DiscoveryLocationMapEditor.tsx'), 'utf8');
const locationsPanel = fs.readFileSync(path.join(root, 'src/components/discovery/business/DiscoveryLocationsPanel.tsx'), 'utf8');
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
// GPS selection must replace, not combine with, a previously selected locality.
assert.match(location, /city: undefined, district: undefined, region: undefined, locality: undefined, lat: position\.coords\.latitude/);
assert.match(home, /const hasValidGpsPair/);
assert.match(home, /const next = hasValidGpsPair[\s\S]*?city: undefined, district: undefined, region: undefined, locality: undefined/);
assert.match(home, /latitude != null && longitude != null/);
// Auto-detect only when browser permission was already granted; never prompt on page load.
assert.match(home, /navigator\.permissions\?\.query\(\{ name: 'geolocation' \}\)/);
assert.match(home, /permission\.state !== 'granted'/);
assert.match(home, /locationChoiceMadeRef\.current/);

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

// Onboarding must never treat a city-center fallback as a confirmed business pin.
assert.match(onboarding, /if \(coordsAutoAssigned\)/);
assert.match(onboarding, /approximate city or district center/i);
assert.match(onboarding, /Accurate map coordinates are required/);
assert.doesNotMatch(onboarding, /const resolvedCoords =/);
assert.match(onboarding, /locationSource: locationAccuracyM != null \? 'GPS' : 'MANUAL'/);
assert.match(onboarding, /coordinatesConfirmed=\{!coordsAutoAssigned\}/);

// The location editor starts at a useful locality center without saving it as exact,
// and provides visible GPS failure/accuracy feedback.
assert.match(mapEditor, /fallbackLatitude\?: number/);
assert.match(mapEditor, /coordinatesConfirmed\?: boolean/);
assert.match(mapEditor, /Location request timed out/);
assert.match(mapEditor, /Device location found/);
assert.match(locationsPanel, /coordinatesConfirmed/);
assert.match(locationsPanel, /These coordinates are only an approximate area center/);
assert.match(locationsPanel, /latitude: ''/);

console.log('Discovery PAGE-005 location/map and GPS onboarding contract tests passed.');
