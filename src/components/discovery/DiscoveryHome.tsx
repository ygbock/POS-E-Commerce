import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowRight,
  Store,
  ShieldCheck,
  ShoppingBag,
  Wrench,
  Package,
  MapPin,
  Compass,
  Building2,
  BriefcaseBusiness,
  Search,
  Zap,
} from 'lucide-react';
import type {
  DiscoverySearchType,
  DiscoverySortOption,
  DiscoveryBusiness,
  DiscoveryProduct,
  DiscoveryService,
  DiscoveryCategory,
  DiscoveryDataState,
} from '../../types/discovery';
import { discoveryApi, DiscoveryApiError } from '../../services/discoveryApi';
import {
  DiscoveryHeader,
  DiscoveryHero,
  DiscoveryCategoryExplorer,
  ServiceRequestModule,
  BusinessCard,
  ProductDiscoveryCard,
  ServiceCard,
  DiscoveryEmptyState,
  DiscoveryLoadingState,
  DiscoveryErrorState,
  DiscoveryRateLimitState,
  DiscoveryMapPanel,
  type DiscoveryFilterState,
} from './index';

interface SectionState<T> {
  status: DiscoveryDataState;
  data: T[];
  error?: string;
  errorCode?: string;
  errorStatus?: number;
}

export interface DiscoveryHomeProps {
  onReturnToStore?: () => void;
  className?: string;
}

export const DiscoveryHome: React.FC<DiscoveryHomeProps> = ({
  onReturnToStore,
  className = '',
}) => {
  // ---------------------------------------------------------------------------
  // 1. URL State Parsing & Synchronization
  // ---------------------------------------------------------------------------
  const parseUrlParams = () => {
    if (typeof window === 'undefined') return {};
    const sp = new URLSearchParams(window.location.search);
    return {
      q: sp.get('q') || '',
      type: (sp.get('type') || 'all') as DiscoverySearchType,
      city: sp.get('city') || undefined,
      district: sp.get('district') || undefined,
      radiusKm: sp.get('radiusKm') ? Number(sp.get('radiusKm')) : 25,
      openNow: sp.get('openNow') === 'true',
      categoryId: sp.get('categoryId') || undefined,
      sort: (sp.get('sort') || 'relevance') as DiscoverySortOption,
    };
  };

  const initialParams = parseUrlParams();

  const [query, setQuery] = useState(initialParams.q || '');
  const [activeType, setActiveType] = useState<DiscoverySearchType>(initialParams.type || 'all');
  const [selectedCity, setSelectedCity] = useState<string | undefined>(initialParams.city);
  const [selectedDistrict, setSelectedDistrict] = useState<string | undefined>(initialParams.district);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(initialParams.radiusKm || 25);
  const [sort, setSort] = useState<DiscoverySortOption>(initialParams.sort || 'relevance');

  const [filters, setFilters] = useState<DiscoveryFilterState>({
    openNow: initialParams.openNow,
    categoryId: initialParams.categoryId,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync state to URL search parameters
  const syncToUrl = useCallback((updates: Record<string, string | number | boolean | undefined | null>) => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);

    Object.entries(updates).forEach(([key, val]) => {
      if (val === undefined || val === null || val === '' || val === false || (key === 'type' && val === 'all')) {
        sp.delete(key);
      } else {
        sp.set(key, String(val));
      }
    });

    const newSearch = sp.toString() ? `?${sp.toString()}` : '';
    const newPath = `${window.location.pathname}${newSearch}`;
    if (window.location.search !== newSearch) {
      window.history.pushState({}, '', newPath);
    }
  }, []);

  // Listen to browser Back/Forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const p = parseUrlParams();
      setQuery(p.q || '');
      setActiveType(p.type || 'all');
      setSelectedCity(p.city);
      setSelectedDistrict(p.district);
      setRadiusKm(p.radiusKm || 25);
      setSort(p.sort || 'relevance');
      setFilters({
        openNow: p.openNow,
        categoryId: p.categoryId,
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // ---------------------------------------------------------------------------
  // 2. Section Data States (Independent Resilient Loading)
  // ---------------------------------------------------------------------------
  const [categoriesState, setCategoriesState] = useState<SectionState<DiscoveryCategory>>({
    status: 'loading',
    data: [],
  });

  const [businessesState, setBusinessesState] = useState<SectionState<DiscoveryBusiness>>({
    status: 'loading',
    data: [],
  });

  const [productsState, setProductsState] = useState<SectionState<DiscoveryProduct>>({
    status: 'loading',
    data: [],
  });

  const [servicesState, setServicesState] = useState<SectionState<DiscoveryService>>({
    status: 'loading',
    data: [],
  });

  // ---------------------------------------------------------------------------
  // 3. Data Fetching
  // ---------------------------------------------------------------------------
  const fetchCategories = useCallback(async () => {
    setCategoriesState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const cats = await discoveryApi.getCategories();
      setCategoriesState({
        status: cats && cats.length > 0 ? 'loaded' : 'empty',
        data: cats || [],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load categories';
      setCategoriesState({
        status: 'error',
        data: [],
        error: msg,
      });
    }
  }, []);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  // Load Main Discovery Content
  const fetchDiscoveryContent = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setBusinessesState((prev) => ({ ...prev, status: 'loading' }));
    setProductsState((prev) => ({ ...prev, status: 'loading' }));
    setServicesState((prev) => ({ ...prev, status: 'loading' }));

    try {
      const response = await discoveryApi.search({
        q: query || undefined,
        type: activeType,
        city: selectedCity,
        district: selectedDistrict,
        lat: latitude ?? undefined,
        lng: longitude ?? undefined,
        radiusKm,
        openNow: filters.openNow,
        categoryId: filters.categoryId,
        sort,
        limit: 24,
      });

      const biz = response.data?.businesses || [];
      const prods = response.data?.products || [];
      const svcs = response.data?.services || [];

      setBusinessesState({
        status: biz.length > 0 ? 'loaded' : 'empty',
        data: biz,
      });

      setProductsState({
        status: prods.length > 0 ? 'loaded' : 'empty',
        data: prods,
      });

      setServicesState({
        status: svcs.length > 0 ? 'loaded' : 'empty',
        data: svcs,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;

      let status = 500;
      let code = 'DISCOVERY_ERROR';
      let msg = 'Unable to load discovery results.';

      if (err instanceof DiscoveryApiError) {
        status = err.status;
        code = err.code;
        msg = err.message;
      }

      const errState: DiscoveryDataState =
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

      setBusinessesState({ status: errState, data: [], error: msg, errorCode: code, errorStatus: status });
      setProductsState({ status: errState, data: [], error: msg, errorCode: code, errorStatus: status });
      setServicesState({ status: errState, data: [], error: msg, errorCode: code, errorStatus: status });
    }
  }, [query, activeType, selectedCity, selectedDistrict, latitude, longitude, radiusKm, filters.openNow, filters.categoryId, sort]);

  useEffect(() => {
    void fetchDiscoveryContent();
  }, [fetchDiscoveryContent]);

  // ---------------------------------------------------------------------------
  // 4. Navigation & Interaction Handlers
  // ---------------------------------------------------------------------------
  const navigateToSearch = useCallback(
    (nextType: DiscoverySearchType = activeType, nextQuery = query) => {
      const sp = new URLSearchParams();
      if (nextQuery.trim()) sp.set('q', nextQuery.trim());
      if (nextType !== 'all') sp.set('type', nextType);
      if (selectedCity) sp.set('city', selectedCity);
      if (selectedDistrict) sp.set('district', selectedDistrict);
      if (filters.categoryId) sp.set('categoryId', filters.categoryId);
      if (radiusKm !== 25) sp.set('radiusKm', String(radiusKm));
      if (filters.openNow) sp.set('openNow', 'true');
      if (filters.categoryId) sp.set('categoryId', filters.categoryId);
      if (sort !== 'relevance') sp.set('sort', sort);

      const path = `/discover/search${sp.toString() ? `?${sp.toString()}` : ''}`;
      if (window.location.pathname + window.location.search !== path) {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    },
    [activeType, query, selectedCity, radiusKm, filters.openNow, filters.categoryId, sort]
  );

  const handleSearchSubmit = (q: string) => {
    navigateToSearch(activeType, q);
  };

  const handleLocationChange = (loc: {
    city?: string;
    lat?: number | null;
    lng?: number | null;
    radiusKm?: number;
  }) => {
    setSelectedCity(loc.city);
    setLatitude(loc.lat ?? null);
    setLongitude(loc.lng ?? null);
    if (loc.radiusKm) setRadiusKm(loc.radiusKm);
    syncToUrl({ city: loc.city, radiusKm: loc.radiusKm });
  };

  const handleCategorySelect = (categoryId: string) => {
    const nextCat = filters.categoryId === categoryId ? undefined : categoryId;
    setFilters((prev) => ({ ...prev, categoryId: nextCat }));
    syncToUrl({ categoryId: nextCat });
  };

  const locationContextLabel = selectedCity ? `in ${selectedCity}` : latitude ? 'near you' : 'in your area';

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between ${className}`}>
      <div>
        {/* ------------------------------------------------------------------ */}
        {/* 1. Header with Sticky Navigation & Location Selector               */}
        {/* ------------------------------------------------------------------ */}
        <DiscoveryHeader
          selectedCity={selectedCity}
          selectedRadiusKm={radiusKm}
          latitude={latitude}
          longitude={longitude}
          onLocationChange={handleLocationChange}
          activeNav={activeType}
          onNavigateSection={(sec) => {
            setActiveType(sec);
            syncToUrl({ type: sec });
          }}
        />

        {/* ------------------------------------------------------------------ */}
        {/* 2. Hero Search Experience                                          */}
        {/* ------------------------------------------------------------------ */}
        <DiscoveryHero
          query={query}
          onQueryChange={setQuery}
          onSearch={handleSearchSubmit}
          activeType={activeType}
          onTypeChange={(type) => {
            setActiveType(type);
            syncToUrl({ type });
          }}
          selectedCity={selectedCity}
          latitude={latitude}
          longitude={longitude}
          radiusKm={radiusKm}
        />

        {/* ------------------------------------------------------------------ */}
        {/* 3. Main Discovery Canvas                                            */}
        {/* ------------------------------------------------------------------ */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12 sm:space-y-16">
          {/* Categories Explorer Section */}
          <DiscoveryCategoryExplorer
            categories={categoriesState.data}
            selectedCategoryId={filters.categoryId}
            onSelectCategory={handleCategorySelect}
            isLoading={categoriesState.status === 'loading'}
          />

          {/* ---------------------------------------------------------------- */}
          {/* Section: Local Businesses                                        */}
          {/* ---------------------------------------------------------------- */}
          {(activeType === 'all' || activeType === 'businesses') && (
            <section aria-labelledby="businesses-section-heading" className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <div className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
                    <Store className="w-3.5 h-3.5" />
                    <span>Local Commerce</span>
                  </div>
                  <h2 id="businesses-section-heading" className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    Verified Businesses {locationContextLabel}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => navigateToSearch('businesses')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 group"
                >
                  <span>View all businesses</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {businessesState.status === 'loading' ? (
                <DiscoveryLoadingState type="businesses" count={4} />
              ) : businessesState.status === 'error' ? (
                <DiscoveryErrorState
                  error={businessesState.error || 'Failed to load local businesses.'}
                  onRetry={fetchDiscoveryContent}
                />
              ) : businessesState.status === 'rate_limited' ? (
                <DiscoveryRateLimitState onRetry={fetchDiscoveryContent} />
              ) : businessesState.data.length === 0 ? (
                <DiscoveryEmptyState
                  type="businesses"
                  query={query}
                  onClearFilters={() => {
                    setQuery('');
                    setSelectedCity(undefined);
                    setFilters({});
                  }}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {businessesState.data.slice(0, 8).map((biz) => (
                    <BusinessCard key={biz.id} business={biz} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Section: Products Available Locally                              */}
          {/* ---------------------------------------------------------------- */}
          {(activeType === 'all' || activeType === 'products') && (
            <section aria-labelledby="products-section-heading" className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <div className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
                    <Package className="w-3.5 h-3.5" />
                    <span>Marketplace Inventory</span>
                  </div>
                  <h2 id="products-section-heading" className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    Products from Local Stores {locationContextLabel}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => navigateToSearch('products')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 group"
                >
                  <span>Explore all products</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {productsState.status === 'loading' ? (
                <DiscoveryLoadingState type="products" count={4} />
              ) : productsState.status === 'error' ? (
                <DiscoveryErrorState
                  error={productsState.error || 'Failed to load local products.'}
                  onRetry={fetchDiscoveryContent}
                />
              ) : productsState.status === 'rate_limited' ? (
                <DiscoveryRateLimitState onRetry={fetchDiscoveryContent} />
              ) : productsState.data.length === 0 ? (
                <DiscoveryEmptyState
                  type="products"
                  query={query}
                  onClearFilters={() => {
                    setQuery('');
                    setSelectedCity(undefined);
                    setFilters({});
                  }}
                />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                  {productsState.data.slice(0, 8).map((prod) => (
                    <ProductDiscoveryCard key={prod.variant_id} product={prod} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ---------------------------------------------------------------- */}

          {/* ---------------------------------------------------------------- */}
          {/* Section: Interactive Map & Location Discovery                     */}
          {/* ---------------------------------------------------------------- */}
          <section aria-labelledby="map-section-heading" className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <div className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Location Discovery</span>
                </div>
                <h2 id="map-section-heading" className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  Find local businesses on the map
                </h2>
              </div>
            </div>
            <DiscoveryMapPanel
              businesses={businessesState.data}
              onSelectBusiness={(business) => window.location.assign('/discover/business/' + encodeURIComponent(business.slug))}
            />
          </section>


          {/* Section: Services Marketplace                                    */}
          {/* ---------------------------------------------------------------- */}
          {(activeType === 'all' || activeType === 'services') && (
            <section aria-labelledby="services-section-heading" className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <div className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Local Experts</span>
                  </div>
                  <h2 id="services-section-heading" className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    Services & Professionals {locationContextLabel}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => navigateToSearch('services')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 group"
                >
                  <span>Browse all services</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {servicesState.status === 'loading' ? (
                <DiscoveryLoadingState type="services" count={3} />
              ) : servicesState.status === 'error' ? (
                <DiscoveryErrorState
                  error={servicesState.error || 'Failed to load local services.'}
                  onRetry={fetchDiscoveryContent}
                />
              ) : servicesState.status === 'rate_limited' ? (
                <DiscoveryRateLimitState onRetry={fetchDiscoveryContent} />
              ) : servicesState.data.length === 0 ? (
                <DiscoveryEmptyState
                  type="services"
                  query={query}
                  onClearFilters={() => {
                    setQuery('');
                    setSelectedCity(undefined);
                    setFilters({});
                  }}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {servicesState.data.slice(0, 6).map((svc) => (
                    <ServiceCard
                      key={svc.id}
                      service={svc}
                      onRequestService={(selected) => {
                        window.location.assign(`/discover/request-service?serviceId=${encodeURIComponent(selected.id)}&serviceName=${encodeURIComponent(selected.name)}`);
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* 4. Service Request CTA Module                                    */}
          {/* ---------------------------------------------------------------- */}
          <ServiceRequestModule selectedCity={selectedCity} />

          {/* ---------------------------------------------------------------- */}
          {/* 5. Explore Sierra Leone */}
          <section aria-labelledby="explore-sierra-leone-heading" className="space-y-5">
            <div>
              <div className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>Explore Local</span>
              </div>
              <h2 id="explore-sierra-leone-heading" className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">Explore Sierra Leone</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Browse businesses, products, and services by city.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {['Freetown', 'Bo', 'Kenema', 'Makeni', 'Koidu', 'Waterloo'].map((city) => (
                <a key={city} href={'/discover/search?city=' + encodeURIComponent(city)}
                  className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{city}</span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">Find local listings</span>
                </a>
              ))}
            </div>
          </section>

          {/* 6. Merchant Acquisition */}
          <section aria-labelledby="merchant-cta-heading" className="rounded-3xl border border-indigo-200/80 dark:border-indigo-900/70 bg-indigo-50/80 dark:bg-indigo-950/30 p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-7">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 mb-2">
                  <BriefcaseBusiness className="w-4 h-4" />
                  <span>For Business Owners</span>
                </div>
                <h2 id="merchant-cta-heading" className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">Get your business discovered on AbaCha</h2>
                <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                  Create a public business listing, showcase your services, and connect customers to your AbaCha Store when you are ready to sell online.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <a href="/business/signup"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                  <Building2 className="w-4 h-4" /> Get Listed
                </a>
                <a href="/discover/search?type=businesses"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <Search className="w-4 h-4" /> Browse Businesses
                </a>
              </div>
            </div>
          </section>

          {/* 5. Trust & Quality Banner                                        */}
          {/* ---------------------------------------------------------------- */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/50">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Verified Local Merchants</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Every business profile is vetted with official credentials and authentic physical location data.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/50">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Direct Merchant Storefronts</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Visit online stores operated by local merchants to view live inventories and place orders.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-100 dark:border-amber-900/50">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Fast Local Connections</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Contact businesses instantly via phone or WhatsApp, or request quotes directly on AbaCha.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 6. Footer                                                          */}
      {/* ------------------------------------------------------------------ */}
      <footer className="mt-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm">
              A
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-sm">AbaCha Local Discovery</p>
              <p className="text-[11px] text-slate-400">Connecting local commerce, products, and services across Sierra Leone</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 font-semibold">
            <a href="/discover" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              Discover
            </a>
            <a href="/discover/search?type=businesses" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              Businesses
            </a>
            <a href="/discover/search?type=products" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              Products
            </a>
            <a href="/discover/search?type=services" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              Services
            </a>
            <a href="/discover/my-requests" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              My Requests
            </a>
            <a href="/discover/saved" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              Saved Businesses
            </a>
            <a href="/discover/my-inquiries" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              My Inquiries
            </a>
            <a href="/discover/my-claims" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              My Business Claims
            </a>
            <a href="/login" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              Merchant Login
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
