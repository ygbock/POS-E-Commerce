import React, { useState } from 'react';
import { DiscoveryHome } from './DiscoveryHome';
import { DiscoverySearchResults } from './DiscoverySearchResults';
import { DiscoveryBusinessProfile } from './DiscoveryBusinessProfile';
import { DiscoveryServiceRequestPage } from './DiscoveryServiceRequestPage';
import { DiscoveryServiceRequestsPage } from './DiscoveryServiceRequestsPage';
import { DiscoverySavedBusinessesPage } from './DiscoverySavedBusinessesPage';
import { DiscoveryMyContactInquiriesPage } from './DiscoveryMyContactInquiriesPage';
import { DiscoveryMyClaimsPage } from './DiscoveryMyClaimsPage';
import { DiscoveryBusinessContainer } from './business/DiscoveryBusinessContainer';
import { useDiscoveryRoute } from '../../router/useDiscoveryRoute';
import { Store, Compass, LayoutDashboard } from 'lucide-react';

/**
 * DiscoveryMarketplace
 *
 * Single Discovery shell entry point.
 * Seamlessly routes across:
 * 1. Customer Discovery (Home, Search Results, Business Profiles, Service Inquiries)
 * 2. Business Owner Discovery Console (Dashboard, Listings, Locations, Hours, Services, Quotes, Reviews, Verification, Analytics, Store Conversion)
 */
export const DiscoveryMarketplace: React.FC = () => {
  const { route, navigate } = useDiscoveryRoute();
  const [viewMode, setViewMode] = useState<'customer' | 'business'>(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/business/discovery')) {
      return 'business';
    }
    return 'customer';
  });

  // Check if current route is a business discovery route
  const isBusinessRoute =
    viewMode === 'business' ||
    route.name.startsWith('business-discovery');

  // Customer sub-routes
  if (!isBusinessRoute) {
    if (route.name === 'discover-search') {
      return (
        <div className="space-y-4">
          <div className="flex justify-end px-4 pt-2">
            <button
              type="button"
              onClick={() => setViewMode('business')}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 flex items-center gap-1.5 shadow-sm"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-indigo-600" />
              <span>Business Owner Hub</span>
            </button>
          </div>
          <DiscoverySearchResults onReturnToStore={() => navigate('discover-home')} />
        </div>
      );
    }

    if (route.name === 'discover-business') {
      return (
        <DiscoveryBusinessProfile
          businessId={route.businessId}
          onBack={() => navigate('discover-home')}
          onRequestService={(service) =>
            navigate(
              '/discover/request-service?serviceId=' +
                encodeURIComponent(service.id) +
                '&serviceName=' +
                encodeURIComponent(service.name)
            )
          }
        />
      );
    }

    if (route.name === 'discover-saved') {
      return (
        <DiscoverySavedBusinessesPage
          onBack={() => navigate('discover-home')}
          onOpenBusiness={(businessId) => navigate('/discover/business/' + encodeURIComponent(businessId))}
        />
      );
    }

    if (route.name === 'discover-my-requests') {
      return (
        <DiscoveryServiceRequestsPage onBack={() => navigate('discover-home')} />
      );
    }

    if (route.name === 'discover-my-inquiries') {
      return <DiscoveryMyContactInquiriesPage onBack={() => navigate('discover-home')} />;
    }

    if (route.name === 'discover-my-claims') {
      return <DiscoveryMyClaimsPage onBack={() => navigate('discover-home')} />;
    }

    if (route.name === 'discover-request-service') {
      const params = new URLSearchParams(window.location.search);
      return (
        <DiscoveryServiceRequestPage
          serviceName={params.get('serviceName') || undefined}
          serviceId={params.get('serviceId') || undefined}
          onBack={() => navigate('discover-home')}
        />
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex justify-end px-4 pt-2">
          <button
            type="button"
            onClick={() => setViewMode('business')}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-indigo-600" />
            <span>Manage My Business Listing</span>
          </button>
        </div>
        <DiscoveryHome />
      </div>
    );
  }

  // Business Owner View
  const getInitialTabFromRoute = () => {
    switch (route.name) {
      case 'business-discovery-listing':
        return 'listing';
      case 'business-discovery-locations':
        return 'locations';
      case 'business-discovery-hours':
        return 'hours';
      case 'business-discovery-services':
        return 'services';
      case 'business-discovery-requests':
        return 'quotes';
      case 'business-discovery-reviews':
        return 'reviews';
      case 'business-discovery-verification':
        return 'verification';
      case 'business-discovery-analytics':
        return 'analytics';
      case 'business-discovery-store-conversion':
        return 'dashboard';
      default:
        return 'dashboard';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner to toggle back to customer discovery */}
      <div className="flex items-center justify-between px-4 pt-2">
        <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
          <LayoutDashboard className="w-4 h-4 text-indigo-600" />
          Business Owner Console
        </span>

        <button
          type="button"
          onClick={() => {
            setViewMode('customer');
            navigate('discover-home');
          }}
          className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1.5 shadow-sm transition-colors"
        >
          <Compass className="w-3.5 h-3.5 text-indigo-600" />
          <span>Switch to Marketplace Search</span>
        </button>
      </div>

      <DiscoveryBusinessContainer
        initialTab={getInitialTabFromRoute()}
        onNavigateCustomerDiscovery={(path) => {
          setViewMode('customer');
          navigate(path);
        }}
      />
    </div>
  );
};
