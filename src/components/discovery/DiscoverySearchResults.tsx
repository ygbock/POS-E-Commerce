import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Filter,
  X,
  ChevronRight,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  DiscoverySearchType,
  DiscoverySortOption,
  DiscoveryBusiness,
  DiscoveryProduct,
  DiscoveryService,
  DiscoverySearchCounts,
  DiscoveryDataState,
} from '../../types/discovery';
import { discoveryApi, DiscoveryApiError } from '../../services/discoveryApi';
import { buildDiscoveryPath } from '../../router/DiscoveryRouter';
import {
  DiscoverySearchBar,
  DiscoveryLocationSelector,
  DiscoveryTabs,
  DiscoveryFilters,
  DiscoverySort,
  BusinessCard,
  ProductDiscoveryCard,
  ServiceCard,
  DiscoveryEmptyState,
  DiscoveryLoadingState,
  DiscoveryErrorState,
  DiscoveryRateLimitState,
  DiscoveryPagination,
  DiscoveryResultCount,
  type DiscoveryFilterState,
} from './index';

// ---------------------------------------------------------------------------
// Page size constant — must match discoveryApi limit semantics
// ---------------------------------------------------------------------------
const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Section State
// ---------------------------------------------------------------------------
interface SectionState<T> {
  status: DiscoveryDataState;
  data: T[];
  error?: string;
  errorCode?: string;
  errorStatus?: number;
  total: number;
}

function initSection<T>(): SectionState<T> {
  return { status: 'loading', data: [], total: 0 };
}

// ---------------------------------------------------------------------------
// URL state helpers — URL is the canonical source of truth
// ---------------------------------------------------------------------------
function readUrlParams(): {
  q: string;
  type: DiscoverySearchType;
  city?: string;
  district?: string;
  region?: string;
  lat?: number | null;
  lng?: number | null;
  radiusKm: number;
  openNow: boolean;
  sort: DiscoverySortOption;
  page: number;
} {
  if (typeof window === 'undefined') {
    return { q: '', type: 'all', radiusKm: 25, openNow: false, sort: 'relevance', page: 1 };
  }
  const sp = new URLSearchParams(window.location.search);
  const pageVal = sp.get('page');
  const radiusVal = sp.get('radiusKm');
  const latVal = sp.get('lat');
  const lngVal = sp.get('lng');
  const rawSort = sp.get('sort') || 'relevance';
  const validSorts: DiscoverySortOption[] = ['relevance', 'rating', 'review_count', 'name_asc', 'newest'];
  const sort: DiscoverySortOption = validSorts.includes(rawSort as DiscoverySortOption)
    ? (rawSort as DiscoverySortOption)
    : 'relevance';
  const rawType = sp.get('type') || 'all';
  const validTypes: DiscoverySearchType[] = ['all', 'businesses', 'products', 'services'];
  const type: DiscoverySearchType = validTypes.includes(rawType as DiscoverySearchType)
    ? (rawType as DiscoverySearchType)
    : 'all';
  return {
    q: sp.get('q') || '',
    type,
    city: sp.get('city') || undefined,
    district: sp.get('district') || undefined,
    region: sp.get('region') || undefined,
    lat: latVal ? Number(latVal) : null,
    lng: lngVal ? Number(lngVal) : null,
    radiusKm: radiusVal ? Math.max(1, Math.min(500, Number(radiusVal))) : 25,
    openNow: sp.get('openNow') === 'true',
    sort,
    page: pageVal ? Math.max(1, Number(pageVal)) : 1,
  };
}

/**
 * Writes URL parameters using the existing buildDiscoveryPath routing abstraction,
 * then pushes/replaces history state without a full page reload.
 */
function applyUrlUpdate(
  updates: Partial<{
    q: string;
    type: DiscoverySearchType;
    city?: string;
    district?: string;
    region?: string;
    lat?: number | null;
    lng?: number | null;
    radiusKm?: number;
    openNow?: boolean;
    sort?: DiscoverySortOption;
    page?: number;
  }>,
  replace = false,
) {
  const current = readUrlParams();
  const merged = { ...current, ...updates };
  const path = buildDiscoveryPath({
    name: 'discover-search',
    query: merged.q || undefined,
    type: merged.type !== 'all' ? merged.type : undefined,
    city: merged.city,
    district: merged.district,
    region: merged.region,
    lat: merged.lat ?? undefined,
    lng: merged.lng ?? undefined,
    radiusKm: merged.radiusKm,
    openNow: merged.openNow || undefined,
    sort: merged.sort !== 'relevance' ? merged.sort : undefined,
    page: merged.page && merged.page > 1 ? merged.page : undefined,
  });

  const currentFull = window.location.pathname + window.location.search;
  if (currentFull === path) return;

  if (replace) {
    window.history.replaceState({}, '', path);
  } else {
    window.history.pushState({}, '', path);
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface DiscoverySearchResultsProps {
  onReturnToStore?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const DiscoverySearchResults: React.FC<DiscoverySearchResultsProps> = ({
  onReturnToStore,
  className = '',
}) => {
  // -------------------------------------------------------------------------
  // URL-derived state (source of truth)
  // -------------------------------------------------------------------------
  const [urlState, setUrlState] = useState(readUrlParams);

  const { q, type: activeType, city, district, region, lat, lng, radiusKm, openNow, sort, page } = urlState;

  // Derived filter state for DiscoveryFilters
  const [filters, setFilters] = useState<DiscoveryFilterState>({
    openNow: urlState.openNow || undefined,
  });

  // Resync from URL on popstate (browser Back/Forward)
  useEffect(() => {
    const handlePop = () => {
      const next = readUrlParams();
      setUrlState(next);
      setFilters({ openNow: next.openNow || undefined });
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // -------------------------------------------------------------------------
  // Section results state (independent resilient loading per group)
  // -------------------------------------------------------------------------
  const [businessesState, setBusinessesState] = useState<SectionState<DiscoveryBusiness>>(initSection);
  const [productsState, setProductsState] = useState<SectionState<DiscoveryProduct>>(initSection);
  const [servicesState, setServicesState] = useState<SectionState<DiscoveryService>>(initSection);
  const [counts, setCounts] = useState<DiscoverySearchCounts>({ businesses: 0, products: 0, services: 0 });

  // Track whether a search has been run at least once (used to gate initial loading render)
  const [hasSearched, setHasSearched] = useState(false);

  // Mobile filter drawer
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // AbortController ref for request cancellation
  const abortRef = useRef<AbortController | null>(null);

  // Results region ref for scroll-into-view after pagination
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // -------------------------------------------------------------------------
  // Core search function
  // -------------------------------------------------------------------------
  const runSearch = useCallback(async (params: ReturnType<typeof readUrlParams>) => {
    // Cancel any prior in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const offset = (params.page - 1) * PAGE_SIZE;

    // Mark sections loading (preserve previous data for a smoother transition)
    const setLoading = <T,>(setter: React.Dispatch<React.SetStateAction<SectionState<T>>>) =>
      setter((prev) => ({ ...prev, status: 'loading' as DiscoveryDataState }));

    if (params.type === 'all' || params.type === 'businesses') setLoading(setBusinessesState);
    if (params.type === 'all' || params.type === 'products') setLoading(setProductsState);
    if (params.type === 'all' || params.type === 'services') setLoading(setServicesState);

    try {
      const response = await discoveryApi.search({
        q: params.q || undefined,
        type: params.type,
        city: params.city,
        district: params.district,
        region: params.region,
        lat: params.lat ?? undefined,
        lng: params.lng ?? undefined,
        radiusKm: params.radiusKm,
        openNow: params.openNow || undefined,
        limit: PAGE_SIZE,
        offset,
      });

      if (controller.signal.aborted) return;

      const { data, counts: responseCounts } = response;

      setCounts(responseCounts);
      setHasSearched(true);

      setBusinessesState({
        status: data.businesses.length > 0 ? 'loaded' : 'empty',
        data: data.businesses,
        total: responseCounts.businesses,
      });
      setProductsState({
        status: data.products.length > 0 ? 'loaded' : 'empty',
        data: data.products,
        total: responseCounts.products,
      });
      setServicesState({
        status: data.services.length > 0 ? 'loaded' : 'empty',
        data: data.services,
        total: responseCounts.services,
      });
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;

      let status = 500;
      let code = 'DISCOVERY_ERROR';
      let message = 'Unable to load search results. Please try again.';

      if (err instanceof DiscoveryApiError) {
        status = err.status;
        code = err.code;
        message = err.message;
      }

      const errStatus: DiscoveryDataState =
        status === 429
          ? 'rate_limited'
          : status === 401
          ? 'unauthorized'
          : status === 403
          ? 'forbidden'
          : status === 422
          ? 'invalid_input'
          : code === 'NETWORK_ERROR'
          ? 'network_error'
          : 'error';

      const errSection = <T,>(): SectionState<T> => ({
        status: errStatus,
        data: [],
        total: 0,
        error: message,
        errorCode: code,
        errorStatus: status,
      });

      if (params.type === 'all' || params.type === 'businesses') setBusinessesState(errSection());
      if (params.type === 'all' || params.type === 'products') setProductsState(errSection());
      if (params.type === 'all' || params.type === 'services') setServicesState(errSection());

      setHasSearched(true);
    }
  }, []);

  // Re-run search whenever URL-derived state changes
  useEffect(() => {
    void runSearch(urlState);
  }, [runSearch, urlState]);

  // -------------------------------------------------------------------------
  // Navigation helpers (all updates go through URL)
  // -------------------------------------------------------------------------
  const navigateTo = useCallback(
    (updates: Parameters<typeof applyUrlUpdate>[0], replace = false) => {
      applyUrlUpdate(updates, replace);
      setUrlState(readUrlParams());
    },
    [],
  );

  const handleSearchSubmit = (newQuery: string) => {
    navigateTo({ q: newQuery, page: 1 });
  };

  const handleTypeChange = (newType: DiscoverySearchType) => {
    navigateTo({ type: newType, page: 1 });
  };

  const handleSortChange = (newSort: DiscoverySortOption) => {
    navigateTo({ sort: newSort, page: 1 });
  };

  const handleLocationChange = (loc: {
    city?: string;
    lat?: number | null;
    lng?: number | null;
    radiusKm?: number;
  }) => {
    navigateTo({
      city: loc.city,
      lat: loc.lat,
      lng: loc.lng,
      radiusKm: loc.radiusKm ?? radiusKm,
      page: 1,
    });
  };

  const handleFilterChange = (newFilters: DiscoveryFilterState) => {
    setFilters(newFilters);
    navigateTo({
      openNow: newFilters.openNow,
      page: 1,
    });
  };

  const handlePageChange = (newOffset: number) => {
    const newPage = Math.floor(newOffset / PAGE_SIZE) + 1;
    navigateTo({ page: newPage });
    // Scroll results region into view for accessibility
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const handleClearFilters = () => {
    const cleared: DiscoveryFilterState = {};
    setFilters(cleared);
    navigateTo({
      city: undefined,
      district: undefined,
      region: undefined,
      lat: null,
      lng: null,
      radiusKm: 25,
      openNow: false,
      page: 1,
    });
  };

  const handleRetrySearch = () => {
    void runSearch(urlState);
  };

  // Navigate to a specific type section from "All" mode
  const handleViewAllType = (t: DiscoverySearchType) => {
    navigateTo({ type: t, page: 1 });
  };

  // -------------------------------------------------------------------------
  // Derived helpers
  // -------------------------------------------------------------------------
  const hasLocation = (lat != null && lng != null) || Boolean(city);
  const activeFilterCount = [openNow].filter(Boolean).length + (city ? 1 : 0);

  const totalForActiveType =
    activeType === 'businesses'
      ? businessesState.total
      : activeType === 'products'
      ? productsState.total
      : activeType === 'services'
      ? servicesState.total
      : counts.businesses + counts.products + counts.services;

  const currentOffset = (page - 1) * PAGE_SIZE;

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  const renderSectionResult = <T extends { id?: string; variant_id?: string }>(
    sectionState: SectionState<T>,
    type: DiscoverySearchType,
    renderCard: (item: T) => React.ReactNode,
    gridClass: string,
    emptyTitle: string,
    emptyDesc: string,
    showPagination = true,
  ) => {
    if (sectionState.status === 'loading') {
      return <DiscoveryLoadingState type={type === 'businesses' ? 'businesses' : type === 'products' ? 'products' : 'services'} count={type === 'products' ? 8 : 6} />;
    }
    if (sectionState.status === 'rate_limited') {
      return <DiscoveryRateLimitState onRetry={handleRetrySearch} />;
    }
    if (
      sectionState.status === 'error' ||
      sectionState.status === 'network_error' ||
      sectionState.status === 'unauthorized' ||
      sectionState.status === 'forbidden' ||
      sectionState.status === 'invalid_input'
    ) {
      return (
        <DiscoveryErrorState
          message={sectionState.error}
          code={sectionState.errorCode}
          status={sectionState.errorStatus}
          onRetry={handleRetrySearch}
        />
      );
    }
    if (sectionState.status === 'empty' || sectionState.data.length === 0) {
      return (
        <DiscoveryEmptyState
          title={emptyTitle}
          description={emptyDesc}
          onClearFilters={handleClearFilters}
        />
      );
    }
    return (
      <>
        <div className={gridClass}>
          {sectionState.data.map((item) => renderCard(item))}
        </div>
        {showPagination && (
          <DiscoveryPagination
            totalItems={sectionState.total}
            pageSize={PAGE_SIZE}
            currentOffset={currentOffset}
            onOffsetChange={handlePageChange}
            className="mt-6"
          />
        )}
      </>
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans ${className}`}>
      {/* ------------------------------------------------------------------ */}
      {/* 1. DISCOVERY HEADER                                                */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-b border-slate-200/70 dark:border-slate-800/70 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {onReturnToStore && (
              <button
                type="button"
                onClick={onReturnToStore}
                aria-label="Return to store"
                className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors rounded-lg px-2 py-1 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Back to Store</span>
              </button>
            )}
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-black text-slate-900 dark:text-white truncate">
                  AbaCha Discovery
                </h1>
                {city && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                    {city}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Back to Discovery Home */}
          <a
            href="/discover"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/discover');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="flex-shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            Discovery Home
          </a>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* 2. SEARCH BAR + LOCATION CONTROLS                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-3">
          <DiscoverySearchBar
            value={q}
            onChange={(val) => {
              // Controlled update — only fire search on submit
              applyUrlUpdate({ q: val }, true);
              setUrlState(readUrlParams());
            }}
            onSearch={handleSearchSubmit}
            placeholder="Search businesses, products or services…"
            autoFocus={!q}
          />
          <DiscoveryLocationSelector
            selectedCity={city}
            selectedRadiusKm={radiusKm}
            latitude={lat}
            longitude={lng}
            onLocationChange={handleLocationChange}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. TABS                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <DiscoveryTabs
            activeType={activeType}
            onChange={handleTypeChange}
            counts={hasSearched ? counts : undefined}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* MAIN CONTENT                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ---------------------------------------------------------------- */}
        {/* 4. RESULTS TOOLBAR: count + sort + mobile filter trigger          */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            {/* Mobile filter button */}
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              aria-expanded={mobileFiltersOpen}
              aria-controls="discovery-filters-drawer"
              className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs"
            >
              <Filter className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {hasSearched && (
              <DiscoveryResultCount
                count={totalForActiveType}
                type={activeType === 'all' ? 'matches' : activeType === 'businesses' ? 'businesses' : activeType === 'products' ? 'products' : 'services'}
                query={q || undefined}
                location={city}
              />
            )}
          </div>

          <DiscoverySort value={sort} onChange={handleSortChange} />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* 5. LAYOUT: desktop sidebar + results, mobile full-width          */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex gap-6 items-start">
          {/* Desktop filter sidebar */}
          <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-20">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                  Filters
                </h2>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    Clear ({activeFilterCount})
                  </button>
                )}
              </div>
              <DiscoveryFilters
                filters={filters}
                onChange={handleFilterChange}
                hasLocation={hasLocation}
                onRequestLocation={() => {
                  // Trigger geolocation on explicit user action only
                  if (!navigator.geolocation) return;
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      handleLocationChange({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        radiusKm: radiusKm,
                      });
                    },
                    () => {
                      // Permission denied or unavailable — do nothing, offer manual selection
                    },
                    { timeout: 8000, enableHighAccuracy: false },
                  );
                }}
              />
            </div>
          </aside>

          {/* Results area */}
          <main className="flex-1 min-w-0" ref={resultsRef} aria-label="Discovery search results">
            {activeType === 'all' ? (
              /* ------------------------------------------------------------ */
              /* ALL MODE: grouped, independently resilient sections           */
              /* ------------------------------------------------------------ */
              <div className="space-y-10" aria-live="polite" aria-atomic="false">
                {/* Businesses group */}
                <section aria-labelledby="results-heading-businesses">
                  <div className="flex items-center justify-between mb-3">
                    <h2
                      id="results-heading-businesses"
                      className="text-base font-black text-slate-900 dark:text-white"
                    >
                      Businesses
                    </h2>
                    {hasSearched && businessesState.status === 'loaded' && counts.businesses > businessesState.data.length && (
                      <button
                        type="button"
                        onClick={() => handleViewAllType('businesses')}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                      >
                        View all {counts.businesses}
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {renderSectionResult(
                    businessesState,
                    'businesses',
                    (biz) => <BusinessCard key={biz.id} business={biz} />,
                    'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5',
                    q ? `No businesses found for "${q}"` : 'No businesses found',
                    `${city ? `No businesses in ${city}.` : 'No businesses in this area.'} Try removing a filter or widening your search radius.`,
                    false, // no pagination in grouped all mode — use tab to paginate
                  )}
                </section>

                {/* Products group */}
                <section aria-labelledby="results-heading-products">
                  <div className="flex items-center justify-between mb-3">
                    <h2
                      id="results-heading-products"
                      className="text-base font-black text-slate-900 dark:text-white"
                    >
                      Products
                    </h2>
                    {hasSearched && productsState.status === 'loaded' && counts.products > productsState.data.length && (
                      <button
                        type="button"
                        onClick={() => handleViewAllType('products')}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                      >
                        View all {counts.products}
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {renderSectionResult(
                    productsState,
                    'products',
                    (prod) => <ProductDiscoveryCard key={prod.variant_id} product={prod} />,
                    'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4',
                    q ? `No products found for "${q}"` : 'No products found nearby',
                    `${city ? `No products listed in ${city}.` : 'No products found in this area.'} Try broadening your search or removing filters.`,
                    false,
                  )}
                </section>

                {/* Services group */}
                <section aria-labelledby="results-heading-services">
                  <div className="flex items-center justify-between mb-3">
                    <h2
                      id="results-heading-services"
                      className="text-base font-black text-slate-900 dark:text-white"
                    >
                      Services
                    </h2>
                    {hasSearched && servicesState.status === 'loaded' && counts.services > servicesState.data.length && (
                      <button
                        type="button"
                        onClick={() => handleViewAllType('services')}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                      >
                        View all {counts.services}
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {renderSectionResult(
                    servicesState,
                    'services',
                    (svc) => <ServiceCard key={svc.id} service={svc} />,
                    'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5',
                    q ? `No services found for "${q}"` : 'No services found nearby',
                    'Try searching for a broader term or selecting a different location.',
                    false,
                  )}
                </section>
              </div>
            ) : activeType === 'businesses' ? (
              /* ------------------------------------------------------------ */
              /* BUSINESSES TAB                                                 */
              /* ------------------------------------------------------------ */
              <div aria-live="polite" aria-atomic="true">
                {renderSectionResult(
                  businessesState,
                  'businesses',
                  (biz) => <BusinessCard key={biz.id} business={biz} />,
                  'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5',
                  q ? `No businesses found for "${q}"` : 'No businesses found',
                  [
                    'Try:',
                    '• removing a filter',
                    '• expanding your search radius',
                    '• choosing another location',
                    '• searching for a broader term',
                  ].join(' '),
                  true,
                )}
              </div>
            ) : activeType === 'products' ? (
              /* ------------------------------------------------------------ */
              /* PRODUCTS TAB                                                   */
              /* ------------------------------------------------------------ */
              <div aria-live="polite" aria-atomic="true">
                {renderSectionResult(
                  productsState,
                  'products',
                  (prod) => <ProductDiscoveryCard key={prod.variant_id} product={prod} />,
                  'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4',
                  q ? `No products found for "${q}"` : 'No products found nearby',
                  [
                    'Try:',
                    '• removing a filter',
                    '• expanding your search radius',
                    '• choosing another location',
                    '• searching for a broader term',
                  ].join(' '),
                  true,
                )}
              </div>
            ) : (
              /* ------------------------------------------------------------ */
              /* SERVICES TAB                                                   */
              /* ------------------------------------------------------------ */
              <div aria-live="polite" aria-atomic="true">
                {renderSectionResult(
                  servicesState,
                  'services',
                  (svc) => <ServiceCard key={svc.id} service={svc} />,
                  'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5',
                  q ? `No services found for "${q}"` : 'No services found nearby',
                  [
                    'Try:',
                    '• removing a filter',
                    '• expanding your search radius',
                    '• choosing another location',
                    '• searching for a broader term',
                  ].join(' '),
                  true,
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* MOBILE FILTER DRAWER                                                */}
      {/* ------------------------------------------------------------------ */}
      {mobileFiltersOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          aria-modal="true"
          role="dialog"
          aria-label="Search filters"
          id="discovery-filters-drawer"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileFiltersOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer sheet */}
          <div className="relative mt-auto w-full max-h-[80vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-2xl p-6">
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto mb-5" aria-hidden="true" />

            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Filter className="w-4 h-4 text-blue-600" aria-hidden="true" />
                Filters
              </h2>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                aria-label="Close filters"
                className="w-8 h-8 flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <DiscoveryFilters
              filters={filters}
              onChange={(newFilters) => {
                handleFilterChange(newFilters);
                setMobileFiltersOpen(false);
              }}
              hasLocation={hasLocation}
              onRequestLocation={() => {
                if (!navigator.geolocation) return;
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    handleLocationChange({
                      lat: pos.coords.latitude,
                      lng: pos.coords.longitude,
                      radiusKm: radiusKm,
                    });
                    setMobileFiltersOpen(false);
                  },
                  () => {
                    setMobileFiltersOpen(false);
                  },
                  { timeout: 8000, enableHighAccuracy: false },
                );
              }}
            />

            {activeFilterCount > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    handleClearFilters();
                    setMobileFiltersOpen(false);
                  }}
                  className="w-full py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Clear all filters ({activeFilterCount})
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
