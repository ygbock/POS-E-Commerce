export interface DiscoveryServiceMatchCandidate {
  serviceId: string;
  businessId: string;
  serviceName?: string | null;
  serviceDescription?: string | null;
  serviceType?: string | null;
  priceFrom?: number | string | null;
  priceTo?: number | string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  city?: string | null;
  district?: string | null;
  region?: string | null;
  locationType?: string | null;
  serviceRadiusKm?: number | string | null;
}

export interface DiscoveryServiceMatchRequest {
  description: string;
  serviceType?: string | null;
  requestedServiceId?: string | null;
  city?: string | null;
  district?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  budgetFrom?: number | null;
  budgetTo?: number | null;
}

export interface DiscoveryServiceMatchResult {
  businessId: string;
  score: number;
  reason: 'REQUESTED_SERVICE' | 'SERVICE_TYPE' | 'KEYWORD';
}

const STOP_WORDS = new Set([
  'the','and','for','with','from','this','that','need','want','service','services',
  'please','help','looking','local','business','provider',
]);

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validLatitude(value: unknown): number | null {
  const number = finiteNumber(value);
  return number != null && number >= -90 && number <= 90 ? number : null;
}

function validLongitude(value: unknown): number | null {
  const number = finiteNumber(value);
  return number != null && number >= -180 && number <= 180 ? number : null;
}

export function discoveryMatchTokens(value: unknown): string[] {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return Array.from(new Set(normalized.split(/\s+/).filter(t => t.length >= 3 && !STOP_WORDS.has(t))));
}

export function discoveryHaversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function rankDiscoveryServiceMatches(
  request: DiscoveryServiceMatchRequest,
  rows: DiscoveryServiceMatchCandidate[],
  maxMatches = 25,
): DiscoveryServiceMatchResult[] {
  const limit = Number.isInteger(maxMatches) && maxMatches > 0 ? maxMatches : 25;
  const requestLatitude = validLatitude(request.latitude);
  const requestLongitude = validLongitude(request.longitude);
  const requestHasCoordinates = requestLatitude != null && requestLongitude != null;
  const requestBudgetFrom = finiteNumber(request.budgetFrom);
  const requestBudgetTo = finiteNumber(request.budgetTo);
  const requestTokens = discoveryMatchTokens([request.serviceType, request.description].filter(Boolean).join(' '));
  const requestTypeTokens = discoveryMatchTokens(request.serviceType || '');
  const candidates = new Map<string, DiscoveryServiceMatchResult>();

  for (const row of rows) {
    const serviceTokens = discoveryMatchTokens(
      [row.serviceType, row.serviceName, row.serviceDescription].filter(Boolean).join(' '),
    );
    const overlap = requestTokens.filter(t => serviceTokens.includes(t));
    const typeOverlap = requestTypeTokens.some(t => serviceTokens.includes(t));
    const exactService = Boolean(request.requestedServiceId && row.serviceId === request.requestedServiceId);

    if (!exactService && !typeOverlap && overlap.length === 0) continue;

    const overlapRatio = requestTokens.length ? overlap.length / requestTokens.length : 0;
    const relevance = exactService
      ? 0.62
      : typeOverlap
        ? 0.42
        : Math.min(0.34, 0.16 + overlapRatio * 0.24);

    let locationScore = 0;
    let locationCompatible = true;
    if (request.city && row.city) {
      locationScore += request.city.toLowerCase() === row.city.toLowerCase() ? 0.10 : -0.03;
    }
    if (request.district && row.district && request.district.toLowerCase() === row.district.toLowerCase()) locationScore += 0.07;
    if (request.region && row.region && request.region.toLowerCase() === row.region.toLowerCase()) locationScore += 0.04;

    const rowLatitude = validLatitude(row.latitude);
    const rowLongitude = validLongitude(row.longitude);
    if (requestHasCoordinates && rowLatitude != null && rowLongitude != null) {
      const distanceKm = discoveryHaversineKm(
        requestLatitude,
        requestLongitude,
        rowLatitude,
        rowLongitude,
      );
      const radius = finiteNumber(row.serviceRadiusKm);
      if (String(row.locationType || '').toUpperCase() === 'SERVICE_AREA' && radius != null && radius > 0) {
        locationCompatible = distanceKm <= radius;
      }
      if (locationCompatible) {
        locationScore += Math.max(0, 0.20 * (1 - Math.min(distanceKm, 100) / 100));
      }
    }

    if (!locationCompatible) continue;

    const serviceFrom = finiteNumber(row.priceFrom);
    const serviceTo = finiteNumber(row.priceTo);
    if (requestBudgetTo != null && serviceFrom != null && serviceFrom > requestBudgetTo) continue;
    if (requestBudgetFrom != null && serviceTo != null && serviceTo < requestBudgetFrom) continue;

    const budgetScore =
      (requestBudgetTo != null || requestBudgetFrom != null) && (serviceFrom != null || serviceTo != null)
        ? 0.08
        : 0;

    const score = Math.max(0, Math.min(1, relevance + Math.max(0, locationScore) + budgetScore));
    if (score < 0.28) continue;

    const reason = exactService ? 'REQUESTED_SERVICE' : typeOverlap ? 'SERVICE_TYPE' : 'KEYWORD';
    const previous = candidates.get(row.businessId);
    if (!previous || score > previous.score) {
      candidates.set(row.businessId, { businessId: row.businessId, score, reason });
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score || a.businessId.localeCompare(b.businessId))
    .slice(0, limit)
    .map(x => ({ ...x, score: Number(x.score.toFixed(3)) }));
}
