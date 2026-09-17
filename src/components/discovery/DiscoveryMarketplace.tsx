import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Send, MapPin, Sparkles, X } from 'lucide-react';
import type {
  DiscoverySearchType,
  DiscoverySearchResult,
  DiscoverySearchCounts,
  DiscoveryDataState,
  DiscoverySortOption,
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
  DiscoveryResultCount,
  DiscoveryStateContainer,
  type DiscoveryFilterState,
} from './index';

export const DiscoveryMarketplace: React.FC = () => {
  const [query, setQuery] = useState('');
  const [locationCity, setLocationCity] = useState<string | undefined>(undefined);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [type, setType] = useState<DiscoverySearchType>('all');
  const [filters, setFilters] = useState<DiscoveryFilterState>({});
  const [sort, setSort] = useState<DiscoverySortOption>('relevance');

  const [results, setResults] = useState<DiscoverySearchResult>({
    businesses: [],
    products: [],
    services: [],
  });
  const [counts, setCounts] = useState<DiscoverySearchCounts>({
    businesses: 0,
    products: 0,
    services: 0,
  });

  const [dataState, setDataState] = useState<DiscoveryDataState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);

  // Service Request Modal state
  const [requestOpen, setRequestOpen] = useState(false);
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

  const executeSearch = useCallback(async (currentQuery = query) => {
    setDataState('loading');
    setErrorMessage(undefined);
    setErrorCode(undefined);
    setErrorStatus(undefined);

    try {
      const response = await discoveryApi.search({
        q: currentQuery,
        type,
        city: locationCity,
        lat: latitude ?? undefined,
        lng: longitude ?? undefined,
        radiusKm,
        openNow: filters.openNow,
        limit: 40,
      });

      const biz = response.data.businesses || [];
      const prods = response.data.products || [];
      const svcs = response.data.services || [];

      setResults({ businesses: biz, products: prods, services: svcs });
      setCounts(response.counts || { businesses: biz.length, products: prods.length, services: svcs.length });

      const totalItems = biz.length + prods.length + svcs.length;
      if (totalItems === 0) {
        setDataState('empty');
      } else {
        setDataState('loaded');
      }
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setErrorCode(err.code);
        setErrorStatus(err.status);
        setErrorMessage(err.message);

        if (err.status === 429) {
          setDataState('rate_limited');
        } else if (err.status === 401) {
          setDataState('unauthorized');
        } else if (err.status === 403) {
          setDataState('forbidden');
        } else if (err.status === 422) {
          setDataState('invalid_input');
        } else if (err.code === 'NETWORK_ERROR') {
          setDataState('network_error');
        } else {
          setDataState('error');
        }
      } else {
        setDataState('error');
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
    }
  }, [query, type, locationCity, latitude, longitude, radiusKm, filters.openNow]);

  // Trigger search on filter / location / type changes
  useEffect(() => {
    void executeSearch();
  }, [type, locationCity, latitude, longitude, radiusKm, filters.openNow]);

  const totalResults = useMemo(
    () => results.businesses.length + results.products.length + results.services.length,
    [results]
  );

  const handleLocationChange = (loc: {
    city?: string;
    lat?: number | null;
    lng?: number | null;
    radiusKm?: number;
  }) => {
    setLocationCity(loc.city);
    setLatitude(loc.lat ?? null);
    setLongitude(loc.lng ?? null);
    if (loc.radiusKm) setRadiusKm(loc.radiusKm);
  };

  const handleClearFilters = () => {
    setQuery('');
    setFilters({});
    setLocationCity(undefined);
    setLatitude(null);
    setLongitude(null);
    void executeSearch('');
  };

  const submitServiceRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestForm.customerName.trim() || !requestForm.description.trim()) return;

    setRequestSubmitting(true);
    try {
      await discoveryApi.createServiceRequest({
        customerName: requestForm.customerName.trim(),
        customerPhone: requestForm.customerPhone.trim() || undefined,
        customerEmail: requestForm.customerEmail.trim() || undefined,
        city: requestForm.city.trim() || locationCity || undefined,
        description: requestForm.description.trim(),
        preferredDate: requestForm.preferredDate || undefined,
        budgetTo: requestForm.budgetTo ? Number(requestForm.budgetTo) : undefined,
      });

      setRequestSuccess(true);
      setTimeout(() => {
        setRequestOpen(false);
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to post service request';
      alert(msg);
    } finally {
      setRequestSubmitting(false);
    }
  };

  return (
    <div className="min-h-full space-y-6 pb-12">
      {/* Discovery Hero Section */}
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center space-y-5 relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs font-semibold backdrop-blur-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
            <span>Discover local businesses, products & services in Sierra Leone</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
            What are you looking for?
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto">
            Find nearby verified providers, check product inventory, request personalized quotes, or get directions.
          </p>

          {/* Unified Search + Location Input Bar */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2.5 p-2 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl text-slate-900 dark:text-slate-100">
            <DiscoverySearchBar
              value={query}
              onChange={setQuery}
              onSearch={(q) => void executeSearch(q)}
              placeholder="Search products, businesses or services…"
              isLoading={dataState === 'loading'}
            />

            <div className="flex items-center justify-end px-1">
              <DiscoveryLocationSelector
                selectedCity={locationCity}
                selectedRadiusKm={radiusKm}
                latitude={latitude}
                longitude={longitude}
                onLocationChange={handleLocationChange}
              />
            </div>
          </div>

          {/* Quick Action: Post Service Request */}
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={() => setRequestOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 px-4 py-2 text-xs sm:text-sm font-bold transition-all shadow-xs active:scale-95"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>Post a service request</span>
            </button>
          </div>
        </div>
      </section>

      {/* Navigation Controls: Tabs, Filters, Sort & Count */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <DiscoveryTabs
            activeType={type}
            onChange={setType}
            counts={counts}
          />

          <div className="flex items-center justify-between md:justify-end gap-3">
            <DiscoveryFilters
              filters={filters}
              onChange={setFilters}
              hasLocation={latitude != null && longitude != null}
              onRequestLocation={() => handleLocationChange({ lat: 8.484, lng: -13.234, radiusKm: 25 })}
            />

            <DiscoverySort
              value={sort}
              onChange={setSort}
            />
          </div>
        </div>

        {/* Results Counter Live Region */}
        <div className="flex items-center justify-between px-1">
          <DiscoveryResultCount
            count={totalResults}
            type={type}
            query={query}
            location={locationCity || (latitude ? 'near your location' : undefined)}
          />
        </div>
      </div>

      {/* Main Results Container wrapping all 13 states */}
      <DiscoveryStateContainer
        state={dataState}
        searchType={type}
        errorMessage={errorMessage}
        errorCode={errorCode}
        status={errorStatus}
        onRetry={() => void executeSearch()}
        onClearFilters={handleClearFilters}
        onRequestService={() => setRequestOpen(true)}
        emptyTitle={query ? `No results for "${query}"` : 'No listings in this area yet'}
        emptyDescription="Try searching for a different keyword, expanding your radius, or posting a service request to local providers."
      >
        <div className="space-y-8">
          {/* Businesses Section */}
          {(type === 'all' || type === 'businesses') && results.businesses.length > 0 && (
            <section className="space-y-4" aria-labelledby="heading-businesses">
              <div className="flex items-center justify-between">
                <h2 id="heading-businesses" className="text-lg font-black text-slate-900 dark:text-white">
                  Local Businesses
                </h2>
                <span className="text-xs text-slate-500">{results.businesses.length} available</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {results.businesses.map((biz) => (
                  <BusinessCard key={biz.id} business={biz} />
                ))}
              </div>
            </section>
          )}

          {/* Products Section */}
          {(type === 'all' || type === 'products') && results.products.length > 0 && (
            <section className="space-y-4" aria-labelledby="heading-products">
              <div className="flex items-center justify-between">
                <h2 id="heading-products" className="text-lg font-black text-slate-900 dark:text-white">
                  Products Available from Local Stores
                </h2>
                <span className="text-xs text-slate-500">{results.products.length} products</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {results.products.map((prod) => (
                  <ProductDiscoveryCard key={prod.variant_id} product={prod} />
                ))}
              </div>
            </section>
          )}

          {/* Services Section */}
          {(type === 'all' || type === 'services') && results.services.length > 0 && (
            <section className="space-y-4" aria-labelledby="heading-services">
              <div className="flex items-center justify-between">
                <h2 id="heading-services" className="text-lg font-black text-slate-900 dark:text-white">
                  Services Near You
                </h2>
                <span className="text-xs text-slate-500">{results.services.length} services</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {results.services.map((svc) => (
                  <ServiceCard
                    key={svc.id}
                    service={svc}
                    onRequestService={() => setRequestOpen(true)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </DiscoveryStateContainer>

      {/* Post Service Request Modal */}
      {requestOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="request-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 id="request-modal-title" className="text-xl font-black text-slate-900 dark:text-white">
                  Post a Service Request
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Describe what you need and local businesses will respond with tailored quotes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRequestOpen(false)}
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
              <form onSubmit={submitServiceRequest} className="space-y-4">
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
                    onClick={() => setRequestOpen(false)}
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
