import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Sparkles,
  ArrowLeft,
  MapPin,
  Store,
  Layers,
  Send,
  X,
  ChevronRight,
  ExternalLink,
  Tag,
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
  type DiscoveryFilterState,
} from './index';

interface SectionState<T> {
  status: DiscoveryDataState;
  data: T[];
  error?: string;
  errorCode?: string;
  errorStatus?: number;
}

const HERO_SUGGESTIONS = [
  'groceries',
  'restaurant',
  'phone repair',
  'barber',
  'shoes',
  'plumber',
  'electronics',
];

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
      delivery: sp.get('delivery') === 'true',
      pickup: sp.get('pickup') === 'true',
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
    delivery: initialParams.delivery,
    pickup: initialParams.pickup,
    categoryId: initialParams.categoryId,
  });

  // Keep a reference to abort in-flight searches on rapid filter updates
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
        delivery: p.delivery,
        pickup: p.pickup,
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

  const [searchCounts, setSearchCounts] = useState({
    businesses: 0,
    products: 0,
    services: 0,
  });

  // Service Request Modal state
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestForm, setRequestForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    city: '',
    preferredDate: '',
    budgetTo: '',
    description: '',
  });

  // ---------------------------------------------------------------------------
  // 3. Data Fetching
  // ---------------------------------------------------------------------------

  // Load Categories (independent)
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

  // Load Main Discovery Search Content (Independent section resilience)
  const fetchDiscoveryContent = useCallback(async () => {
    // Abort previous in-flight request if still running
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Set individual section states to loading
    setBusinessesState((prev) => ({ ...prev, status: 'loading' }));
    setProductsState((prev) => ({ ...prev, status: 'loading' }));
    setServicesState((prev) => ({ ...prev, status: 'loading' }));

    try {
      const response = await discoveryApi.search({
        q: query,
        type: activeType,
        city: selectedCity,
        district: selectedDistrict,
        lat: latitude ?? undefined,
        lng: longitude ?? undefined,
        radiusKm,
        openNow: filters.openNow,
        limit: 40,
      });

      const biz = response.data?.businesses || [];
      const prods = response.data?.products || [];
      const svcs = response.data?.services || [];

      setSearchCounts(response.counts || {
        businesses: biz.length,
        products: prods.length,
        services: svcs.length,
      });

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
      // Ignore abort errors from rapid filter switching
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

      // Update all content sections gracefully
      setBusinessesState({ status: errState, data: [], error: msg, errorCode: code, errorStatus: status });
      setProductsState({ status: errState, data: [], error: msg, errorCode: code, errorStatus: status });
      setServicesState({ status: errState, data: [], error: msg, errorCode: code, errorStatus: status });
    }
  }, [query, activeType, selectedCity, selectedDistrict, latitude, longitude, radiusKm, filters.openNow]);

  // Execute content fetch on parameter changes
  useEffect(() => {
    void fetchDiscoveryContent();
  }, [fetchDiscoveryContent]);

  // ---------------------------------------------------------------------------
  // 4. User Interaction Handlers
  // ---------------------------------------------------------------------------

  const navigateToSearch = useCallback((nextType: DiscoverySearchType = activeType, nextQuery = query) => {
    const sp = new URLSearchParams();
    if (nextQuery.trim()) sp.set('q', nextQuery.trim());
    if (nextType !== 'all') sp.set('type', nextType);
    if (selectedCity) sp.set('city', selectedCity);
    if (radiusKm !== 25) sp.set('radiusKm', String(radiusKm));
    if (filters.openNow) sp.set('openNow', 'true');
    if (sort !== 'relevance') sp.set('sort', sort);
    const path = `/discover/search${sp.toString() ? `?${sp.toString()}` : ''}`;
    if (window.location.pathname + window.location.search !== path) {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, [activeType, query, selectedCity, radiusKm, filters.openNow, sort]);

  const handleSearchSubmit = (q: string) => {
    navigateToSearch(activeType, q);
  };

  const handleViewAllType = (type: DiscoverySearchType) => {
    navigateToSearch(type, query);
  };

  const handleTypeChange = (type: DiscoverySearchType) => {
    setActiveType(type);
    syncToUrl({ type });
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

  const handleFilterChange = (newFilters: DiscoveryFilterState) => {
    setFilters(newFilters);
    syncToUrl({
      openNow: newFilters.openNow,
      delivery: newFilters.delivery,
      pickup: newFilters.pickup,
      categoryId: newFilters.categoryId,
    });
  };

  const handleCategorySelect = (categoryId: string) => {
    const isAlreadySelected = filters.categoryId === categoryId;
    const nextCat = isAlreadySelected ? undefined : categoryId;
    handleFilterChange({ ...filters, categoryId: nextCat });
  };

  const handleSortChange = (newSort: DiscoverySortOption) => {
    setSort(newSort);
    syncToUrl({ sort: newSort });
  };

  const handleClearAllFilters = () => {
    setQuery('');
    setFilters({});
    setSelectedCity(undefined);
    setSelectedDistrict(undefined);
    setLatitude(null);
    setLongitude(null);
    setActiveType('all');
    syncToUrl({
      q: '',
      type: 'all',
      city: undefined,
      district: undefined,
      openNow: false,
      delivery: false,
      pickup: false,
      categoryId: undefined,
    });
  };

  const handlePostServiceRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestForm.customerName.trim() || !requestForm.description.trim()) return;

    setRequestSubmitting(true);
    discoveryApi
      .createServiceRequest({
        customerName: requestForm.customerName.trim(),
        customerPhone: requestForm.customerPhone.trim() || undefined,
        customerEmail: requestForm.customerEmail.trim() || undefined,
        city: requestForm.city.trim() || selectedCity || undefined,
        description: requestForm.description.trim(),
        preferredDate: requestForm.preferredDate || undefined,
        budgetTo: requestForm.budgetTo ? Number(requestForm.budgetTo) : undefined,
      })
      .then(() => {
        setRequestSuccess(true);
        setTimeout(() => {
          setIsRequestModalOpen(false);
          setRequestSuccess(false);
          setRequestForm({
            customerName: '',
            customerPhone: '',
            customerEmail: '',
            city: '',
            preferredDate: '',
            budgetTo: '',
            description: '',
          });
        }, 1500);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to post service request';
        alert(msg);
      })
      .finally(() => {
        setRequestSubmitting(false);
      });
  };

  // Location-aware wording
  const locationText = selectedCity ? `in ${selectedCity}` : latitude ? 'near you' : '';
  const businessHeading = locationText ? `Businesses ${locationText}` : 'Local Businesses';
  const productsHeading = locationText ? `Products ${locationText}` : 'Products Available from Local Stores';
  const servicesHeading = locationText ? `Services ${locationText}` : 'Services Near You';

  return (
    <div className={`min-h-screen bg-[#f8fafc] dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${className}`}>
      {/* ------------------------------------------------------------------ */}
      {/* 1. DISCOVERY HEADER                                                */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand Identity & Back Link */}
          <div className="flex items-center gap-3 sm:gap-4">
            {onReturnToStore ? (
              <button
                type="button"
                onClick={onReturnToStore}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Return to AbaCha Storefront"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Storefront</span>
              </button>
            ) : (
              <a
                href="/"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Storefront</span>
              </a>
            )}

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20">
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <span className="text-sm sm:text-base font-black tracking-tight text-slate-900 dark:text-white">
                  AbaCha Discovery
                </span>
                <span className="hidden md:inline-block ml-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full border border-blue-200/60 dark:border-blue-900/40">
                  Local Commerce
                </span>
              </div>
            </div>
          </div>

          {/* Location Selector in Header */}
          <div className="flex items-center gap-2">
            <DiscoveryLocationSelector
              selectedCity={selectedCity}
              selectedRadiusKm={radiusKm}
              latitude={latitude}
              longitude={longitude}
              onLocationChange={handleLocationChange}
            />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-10 sm:space-y-12">
        {/* ------------------------------------------------------------------ */}
        {/* 2. HERO / SEARCH SECTION                                           */}
        {/* ------------------------------------------------------------------ */}
        <section
          className="rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 p-6 sm:p-12 text-white shadow-xl relative overflow-hidden"
          aria-labelledby="hero-heading"
        >
          {/* Subtle Ambient Backdrops */}
          <div className="absolute -top-10 right-1/4 w-80 h-80 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 left-1/4 w-80 h-80 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-3xl mx-auto text-center space-y-5 relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs font-semibold backdrop-blur-xs">
              <MapPin className="w-3.5 h-3.5 text-blue-300" aria-hidden="true" />
              <span>Explore local businesses, products and services across Sierra Leone</span>
            </div>

            <h1
              id="hero-heading"
              className="text-3xl sm:text-5xl font-black tracking-tight leading-tight"
            >
              Discover what&apos;s near you
            </h1>

            <p className="text-xs sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
              Find verified merchants in your neighborhood, inspect live product inventory, and request direct service quotes from local professionals.
            </p>

            {/* Dominant Search Interface */}
            <div className="pt-2">
              <div className="p-2 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl text-slate-900 dark:text-slate-100">
                <DiscoverySearchBar
                  value={query}
                  onChange={setQuery}
                  onSearch={handleSearchSubmit}
                  placeholder="What are you looking for? (e.g. phone repair, groceries, shoes)"
                  isLoading={businessesState.status === 'loading'}
                  suggestions={HERO_SUGGESTIONS}
                />
              </div>
            </div>

            {/* Quick Keyword Pills Under Search */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-1.5 text-xs">
              <span className="text-slate-400 font-medium mr-1">Popular:</span>
              {HERO_SUGGESTIONS.slice(0, 5).map((kw) => (
                <button
                  key={kw}
                  type="button"
                  onClick={() => handleSearchSubmit(kw)}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-slate-200 text-[11px] font-semibold transition-all hover:scale-105 active:scale-95"
                >
                  {kw}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* 4 & 5. DISCOVERY TABS & QUICK FILTERS                              */}
        {/* ------------------------------------------------------------------ */}
        <section className="space-y-4" aria-label="Search navigation and filters">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <DiscoveryTabs
              activeType={activeType}
              onChange={handleTypeChange}
              counts={searchCounts}
            />

            <div className="flex items-center justify-between md:justify-end gap-3">
              <DiscoveryFilters
                filters={filters}
                onChange={handleFilterChange}
                categories={categoriesState.data}
                hasLocation={latitude != null && longitude != null}
                onRequestLocation={() => handleLocationChange({ lat: 8.484, lng: -13.234, radiusKm: 25 })}
              />

              <DiscoverySort
                value={sort}
                onChange={handleSortChange}
              />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* 6. EXPLORE CATEGORIES                                              */}
        {/* ------------------------------------------------------------------ */}
        <section aria-labelledby="heading-categories" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <h2 id="heading-categories" className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                Explore Categories
              </h2>
            </div>
            {filters.categoryId && (
              <button
                type="button"
                onClick={() => handleCategorySelect(filters.categoryId!)}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Show All Categories
              </button>
            )}
          </div>

          {/* Category List with Independent State Resilience */}
          {categoriesState.status === 'loading' ? (
            <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={`cat-skel-${i}`}
                  className="h-14 w-36 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse shrink-0"
                />
              ))}
            </div>
          ) : categoriesState.status === 'error' ? (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between">
              <span>Categories could not be loaded at this moment.</span>
              <button
                type="button"
                onClick={fetchCategories}
                className="font-bold underline ml-2"
              >
                Retry
              </button>
            </div>
          ) : categoriesState.data.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No categories currently configured.</p>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-1">
              {categoriesState.data.map((cat) => {
                const isSelected = filters.categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategorySelect(cat.id)}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap border transition-all shrink-0 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs'
                    }`}
                  >
                    <Tag className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} aria-hidden="true" />
                    <span>{cat.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* 7. NEARBY BUSINESSES SECTION                                       */}
        {/* ------------------------------------------------------------------ */}
        {(activeType === 'all' || activeType === 'businesses') && (
          <section aria-labelledby="heading-businesses" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 id="heading-businesses" className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  {businessHeading}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Verified shops, service points and community stores
                </p>
              </div>

              <a
                href={`/discover/search?type=businesses${selectedCity ? `&city=${encodeURIComponent(selectedCity)}` : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleViewAllType('businesses');
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                <span>View all businesses</span>
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>

            {/* Independent Section State Handling */}
            {businessesState.status === 'loading' ? (
              <DiscoveryLoadingState type="businesses" count={3} />
            ) : businessesState.status === 'rate_limited' ? (
              <DiscoveryRateLimitState onRetry={fetchDiscoveryContent} />
            ) : businessesState.status === 'error' || businessesState.status === 'network_error' ? (
              <DiscoveryErrorState
                message={businessesState.error}
                code={businessesState.errorCode}
                status={businessesState.errorStatus}
                onRetry={fetchDiscoveryContent}
              />
            ) : businessesState.data.length === 0 ? (
              <DiscoveryEmptyState
                title="No businesses found in this area"
                description={query ? `No businesses matched "${query}".` : 'Try selecting another city or widening your radius.'}
                onClearFilters={handleClearAllFilters}
                onRequestService={() => setIsRequestModalOpen(true)}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {businessesState.data.slice(0, 6).map((biz) => (
                  <BusinessCard key={biz.id} business={biz} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 8. NEARBY PRODUCTS SECTION                                         */}
        {/* ------------------------------------------------------------------ */}
        {(activeType === 'all' || activeType === 'products') && (
          <section aria-labelledby="heading-products" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 id="heading-products" className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  {productsHeading}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Physical goods in stock with price & pickup availability
                </p>
              </div>

              <a
                href={`/discover/search?type=products${selectedCity ? `&city=${encodeURIComponent(selectedCity)}` : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleViewAllType('products');
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                <span>View all products</span>
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>

            {productsState.status === 'loading' ? (
              <DiscoveryLoadingState type="products" count={5} />
            ) : productsState.status === 'rate_limited' ? (
              <DiscoveryRateLimitState onRetry={fetchDiscoveryContent} />
            ) : productsState.status === 'error' || productsState.status === 'network_error' ? (
              <DiscoveryErrorState
                message={productsState.error}
                code={productsState.errorCode}
                status={productsState.errorStatus}
                onRetry={fetchDiscoveryContent}
              />
            ) : productsState.data.length === 0 ? (
              <DiscoveryEmptyState
                title="No products available nearby"
                description={query ? `No items matched "${query}".` : 'Local businesses have not published product stock in this area.'}
                onClearFilters={handleClearAllFilters}
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {productsState.data.slice(0, 10).map((prod) => (
                  <ProductDiscoveryCard key={prod.variant_id} product={prod} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 9. NEARBY SERVICES SECTION                                         */}
        {/* ------------------------------------------------------------------ */}
        {(activeType === 'all' || activeType === 'services') && (
          <section aria-labelledby="heading-services" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 id="heading-services" className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  {servicesHeading}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  On-demand maintenance, tailoring, beauty, and professional trades
                </p>
              </div>

              <a
                href={`/discover/search?type=services${selectedCity ? `&city=${encodeURIComponent(selectedCity)}` : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleViewAllType('services');
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                <span>Explore services</span>
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>

            {servicesState.status === 'loading' ? (
              <DiscoveryLoadingState type="services" count={3} />
            ) : servicesState.status === 'rate_limited' ? (
              <DiscoveryRateLimitState onRetry={fetchDiscoveryContent} />
            ) : servicesState.status === 'error' || servicesState.status === 'network_error' ? (
              <DiscoveryErrorState
                message={servicesState.error}
                code={servicesState.errorCode}
                status={servicesState.errorStatus}
                onRetry={fetchDiscoveryContent}
              />
            ) : servicesState.data.length === 0 ? (
              <DiscoveryEmptyState
                title="No services found nearby"
                description="Can't find the service you need? Post a request to let providers bid."
                onClearFilters={handleClearAllFilters}
                onRequestService={() => setIsRequestModalOpen(true)}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {servicesState.data.slice(0, 6).map((svc) => (
                  <ServiceCard
                    key={svc.id}
                    service={svc}
                    onRequestService={() => setIsRequestModalOpen(true)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 10. SERVICE REQUEST CTA BANNER                                     */}
        {/* ------------------------------------------------------------------ */}
        <section
          aria-labelledby="cta-heading"
          className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-r from-blue-50 via-indigo-50 to-sky-50 dark:from-slate-900 dark:via-blue-950/40 dark:to-slate-900 p-8 sm:p-12 text-center relative overflow-hidden shadow-xs"
        >
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-md shadow-blue-600/30">
              <Send className="w-5 h-5" aria-hidden="true" />
            </div>

            <h2 id="cta-heading" className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              Can&apos;t find what you need?
            </h2>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
              Tell local businesses what you are searching for and let verified providers respond directly with tailored quotes.
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsRequestModalOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-lg shadow-blue-600/25 transition-all hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span>Post a Service Request</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* SERVICE REQUEST MODAL                                              */}
      {/* ------------------------------------------------------------------ */}
      {isRequestModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-request-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 id="home-request-modal-title" className="text-xl font-black text-slate-900 dark:text-white">
                  Post a Service Request
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Describe what you need and local businesses will respond with tailored quotes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRequestModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {requestSuccess ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 mx-auto flex items-center justify-center font-bold text-xl">
                  ✓
                </div>
                <h3 className="font-bold text-lg text-emerald-950 dark:text-emerald-100">Request Submitted!</h3>
                <p className="text-xs text-slate-500">Local service providers in your area have been notified.</p>
              </div>
            ) : (
              <form onSubmit={handlePostServiceRequest} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Your Name *
                    </label>
                    <input
                      required
                      value={requestForm.customerName}
                      onChange={(e) => setRequestForm({ ...requestForm, customerName: e.target.value })}
                      placeholder="e.g. Sahr Mansaray"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Phone Number
                    </label>
                    <input
                      value={requestForm.customerPhone}
                      onChange={(e) => setRequestForm({ ...requestForm, customerPhone: e.target.value })}
                      placeholder="+232 76 000000"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      City / Area
                    </label>
                    <input
                      value={requestForm.city}
                      onChange={(e) => setRequestForm({ ...requestForm, city: e.target.value })}
                      placeholder="e.g. Freetown"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Budget Ceiling (SLE)
                    </label>
                    <input
                      type="number"
                      value={requestForm.budgetTo}
                      onChange={(e) => setRequestForm({ ...requestForm, budgetTo: e.target.value })}
                      placeholder="e.g. 500"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Describe what you need *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={requestForm.description}
                    onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                    placeholder="Provide details about the service required, location, timing, and any specific requirements..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsRequestModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={requestSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm"
                  >
                    {requestSubmitting ? 'Sending…' : 'Submit Request'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
