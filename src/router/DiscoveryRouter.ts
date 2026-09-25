/**
 * AbaCha Unified Commerce — Discovery Route Architecture (FRONT-001)
 *
 * Implements the URL mapping and route contract for Discovery across Customer,
 * Business-Owner, and Moderator/Admin personas.
 */

export type DiscoveryCustomerRoute =
  | { name: 'discover-home' }
  | {
      name: 'discover-search';
      query?: string;
      type?: string;
      city?: string;
      district?: string;
      region?: string;
      lat?: number;
      lng?: number;
      radiusKm?: number;
      openNow?: boolean;
      sort?: string;
      categoryId?: string;
      page?: number;
      limit?: number;
    }
  | { name: 'discover-business'; businessId: string }
  | { name: 'discover-service'; serviceId: string }
  | { name: 'discover-request-service' }
  | { name: 'discover-my-requests' }
  | { name: 'discover-saved' }
  | { name: 'discover-my-inquiries' }
  | { name: 'discover-my-claims' };

export type DiscoveryBusinessRoute =
  | { name: 'business-discovery-overview' }
  | { name: 'business-discovery-listing' }
  | { name: 'business-discovery-locations' }
  | { name: 'business-discovery-hours' }
  | { name: 'business-discovery-services' }
  | { name: 'business-discovery-requests' }
  | { name: 'business-discovery-reviews' }
  | { name: 'business-discovery-verification' }
  | { name: 'business-discovery-analytics' }
  | { name: 'business-discovery-store-conversion' };

export type DiscoveryAdminRoute =
  | { name: 'admin-discovery-overview' }
  | { name: 'admin-discovery-listings' }
  | { name: 'admin-discovery-listing-detail'; listingId: string }
  | { name: 'admin-discovery-claims' }
  | { name: 'admin-discovery-reports' }
  | { name: 'admin-discovery-moderation-history' };

export type DiscoveryRoute =
  | DiscoveryCustomerRoute
  | DiscoveryBusinessRoute
  | DiscoveryAdminRoute
  | { name: 'not-found' };

const decode = (val: string) => {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
};

export function parseDiscoveryPath(pathname = window.location.pathname, search = window.location.search): DiscoveryRoute {
  const segments = pathname.replace(/\/+/g, '/').replace(/\/$/, '').split('/').filter(Boolean).map(decode);
  const params = new URLSearchParams(search);

  // 1. Customer Routes (/discover/...)
  if (segments[0] === 'discover') {
    const second = segments[1];
    if (!second) return { name: 'discover-home' };
    if (second === 'search') {
      const pageVal = params.get('page');
      const limitVal = params.get('limit');
      const radiusVal = params.get('radiusKm');
      const latVal = params.get('lat');
      const lngVal = params.get('lng');
      return {
        name: 'discover-search',
        query: params.get('q') || undefined,
        type: params.get('type') || undefined,
        city: params.get('city') || undefined,
        district: params.get('district') || undefined,
        region: params.get('region') || undefined,
        lat: latVal ? Number(latVal) : undefined,
        lng: lngVal ? Number(lngVal) : undefined,
        radiusKm: radiusVal ? Number(radiusVal) : undefined,
        openNow: params.get('openNow') ? params.get('openNow') === 'true' : undefined,
        sort: params.get('sort') || undefined,
        categoryId: params.get('categoryId') || undefined,
        page: pageVal ? Math.max(1, Number(pageVal)) : 1,
        limit: limitVal ? Number(limitVal) : undefined,
      };
    }
    if (second === 'business' && segments[2]) {
      return { name: 'discover-business', businessId: segments[2] };
    }
    if (second === 'service' && segments[2]) {
      return { name: 'discover-service', serviceId: segments[2] };
    }
    if (second === 'request-service') {
      return { name: 'discover-request-service' };
    }
    if (second === 'my-requests') {
      return { name: 'discover-my-requests' };
    }
    if (second === 'saved') {
      return { name: 'discover-saved' };
    }
    if (second === 'my-inquiries') {
      return { name: 'discover-my-inquiries' };
    }
    if (second === 'my-claims') {
      return { name: 'discover-my-claims' };
    }
    return { name: 'discover-home' };
  }

  // 2. Business Owner Routes (/business/discovery/...)
  if (segments[0] === 'business' && segments[1] === 'discovery') {
    const sub = segments[2];
    switch (sub) {
      case 'listing': return { name: 'business-discovery-listing' };
      case 'locations': return { name: 'business-discovery-locations' };
      case 'hours': return { name: 'business-discovery-hours' };
      case 'services': return { name: 'business-discovery-services' };
      case 'requests': return { name: 'business-discovery-requests' };
      case 'reviews': return { name: 'business-discovery-reviews' };
      case 'verification': return { name: 'business-discovery-verification' };
      case 'analytics': return { name: 'business-discovery-analytics' };
      case 'store-conversion': return { name: 'business-discovery-store-conversion' };
      default: return { name: 'business-discovery-overview' };
    }
  }

  // 3. Admin / Moderation Routes (/admin/discovery/...)
  if (segments[0] === 'admin' && segments[1] === 'discovery') {
    const sub = segments[2];
    if (sub === 'listings') {
      if (segments[3]) return { name: 'admin-discovery-listing-detail', listingId: segments[3] };
      return { name: 'admin-discovery-listings' };
    }
    if (sub === 'claims') return { name: 'admin-discovery-claims' };
    if (sub === 'reports') return { name: 'admin-discovery-reports' };
    if (sub === 'moderation-history') return { name: 'admin-discovery-moderation-history' };
    return { name: 'admin-discovery-overview' };
  }

  return { name: 'not-found' };
}

export function buildDiscoveryPath(route: DiscoveryRoute): string {
  switch (route.name) {
    case 'discover-home': return '/discover';
    case 'discover-search': {
      const sp = new URLSearchParams();
      if (route.query?.trim()) sp.set('q', route.query.trim());
      if (route.type && route.type !== 'all') sp.set('type', route.type);
      if (route.city?.trim()) sp.set('city', route.city.trim());
      if (route.district?.trim()) sp.set('district', route.district.trim());
      if (route.region?.trim()) sp.set('region', route.region.trim());
      if (route.lat != null) sp.set('lat', String(route.lat));
      if (route.lng != null) sp.set('lng', String(route.lng));
      if (route.radiusKm != null && route.radiusKm !== 25) sp.set('radiusKm', String(route.radiusKm));
      if (route.openNow) sp.set('openNow', 'true');
      if (route.sort && route.sort !== 'relevance') sp.set('sort', route.sort);
      if (route.categoryId?.trim()) sp.set('categoryId', route.categoryId.trim());
      if (route.page && route.page > 1) sp.set('page', String(route.page));
      if (route.limit && route.limit !== 20) sp.set('limit', String(route.limit));
      const qs = sp.toString();
      return `/discover/search${qs ? `?${qs}` : ''}`;
    }
    case 'discover-business': return `/discover/business/${encodeURIComponent(route.businessId)}`;
    case 'discover-service': return `/discover/service/${encodeURIComponent(route.serviceId)}`;
    case 'discover-request-service': return '/discover/request-service';
    case 'discover-my-requests': return '/discover/my-requests';
    case 'discover-saved': return '/discover/saved';
    case 'discover-my-inquiries': return '/discover/my-inquiries';
    case 'discover-my-claims': return '/discover/my-claims';
    case 'business-discovery-overview': return '/business/discovery';
    case 'business-discovery-listing': return '/business/discovery/listing';
    case 'business-discovery-locations': return '/business/discovery/locations';
    case 'business-discovery-hours': return '/business/discovery/hours';
    case 'business-discovery-services': return '/business/discovery/services';
    case 'business-discovery-requests': return '/business/discovery/requests';
    case 'business-discovery-reviews': return '/business/discovery/reviews';
    case 'business-discovery-verification': return '/business/discovery/verification';
    case 'business-discovery-analytics': return '/business/discovery/analytics';
    case 'business-discovery-store-conversion': return '/business/discovery/store-conversion';
    case 'admin-discovery-overview': return '/admin/discovery';
    case 'admin-discovery-listings': return '/admin/discovery/listings';
    case 'admin-discovery-listing-detail': return `/admin/discovery/listings/${encodeURIComponent(route.listingId)}`;
    case 'admin-discovery-claims': return '/admin/discovery/claims';
    case 'admin-discovery-reports': return '/admin/discovery/reports';
    case 'admin-discovery-moderation-history': return '/admin/discovery/moderation-history';
    case 'not-found': return '/404';
  }
}
