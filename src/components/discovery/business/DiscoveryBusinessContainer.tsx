import React, { useState, useEffect } from 'react';
import {
  Building2,
  MapPin,
  Clock,
  Wrench,
  FileText,
  MessageSquare,
  Star,
  ShieldCheck,
  TrendingUp,
  Sliders,
  Plus,
  RefreshCw,
  AlertCircle,
  Sparkles,
  UserCheck,
  ChevronDown,
  LayoutDashboard,
  ExternalLink,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type { DiscoveryBusiness } from '../../../types/discovery';
import { DiscoveryBusinessDashboard } from './DiscoveryBusinessDashboard';
import { DiscoveryListingEditor } from './DiscoveryListingEditor';
import { DiscoveryLocationsPanel } from './DiscoveryLocationsPanel';
import { DiscoveryHoursEditor } from './DiscoveryHoursEditor';
import { DiscoveryServicesManager } from './DiscoveryServicesManager';
import { DiscoveryQuotesInbox } from './DiscoveryQuotesInbox';
import { DiscoveryContactInbox } from './DiscoveryContactInbox';
import { DiscoveryReviewsPanel } from './DiscoveryReviewsPanel';
import { DiscoveryVerificationPanel } from './DiscoveryVerificationPanel';
import { DiscoveryTrustCenter } from './DiscoveryTrustCenter';
import { DiscoveryAnalyticsPanel } from './DiscoveryAnalyticsPanel';
import { DiscoverySettingsPanel } from './DiscoverySettingsPanel';
import { DiscoverySearchAliasesPanel } from './DiscoverySearchAliasesPanel';
import { DiscoveryStoreConversionModal } from './DiscoveryStoreConversionModal';
import { DiscoveryOnboardingWizard } from './DiscoveryOnboardingWizard';
import { DiscoveryListingManagementWorkspace } from './DiscoveryListingManagementWorkspace';
import { DiscoveryBusinessTeamPanel } from './DiscoveryBusinessTeamPanel';

interface DiscoveryBusinessContainerProps {
  initialBusinessId?: string;
  initialTab?: string;
  onNavigateCustomerDiscovery?: (path: string) => void;
}

type BusinessRole = 'OWNER' | 'MANAGER' | 'STAFF';

const ROLE_TAB_ACCESS: Record<BusinessRole, string[]> = {
  OWNER: ['dashboard','listing','submission','locations','hours','services','quotes','contacts','reviews','verification','trust','analytics','settings','team','search'],
  MANAGER: ['dashboard','listing','submission','locations','hours','services','quotes','contacts','reviews','analytics','search'],
  STAFF: ['dashboard','services','quotes','contacts','reviews','analytics'],
};

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'listing', label: 'Listing Profile', icon: Building2 },
  { id: 'submission', label: 'Submission & Review', icon: ShieldCheck },
  { id: 'locations', label: 'Branches & Map', icon: MapPin },
  { id: 'hours', label: 'Operating Hours', icon: Clock },
  { id: 'services', label: 'Services', icon: Wrench },
  { id: 'quotes', label: 'Quotes Inbox', icon: FileText },
  { id: 'contacts', label: 'Contact Inbox', icon: MessageSquare },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'verification', label: 'Verification', icon: ShieldCheck },
  { id: 'trust', label: 'Trust Center', icon: UserCheck },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'settings', label: 'Visibility Settings', icon: Sliders },
  { id: 'team', label: 'Team', icon: UserCheck },
  { id: 'search', label: 'Search & Aliases', icon: Sparkles },
];

export const DiscoveryBusinessContainer: React.FC<DiscoveryBusinessContainerProps> = ({
  initialBusinessId,
  initialTab = 'dashboard',
  onNavigateCustomerDiscovery,
}) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [businesses, setBusinesses] = useState<DiscoveryBusiness[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<DiscoveryBusiness | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [requestedBusinessMissing, setRequestedBusinessMissing] = useState(false);

  // Modals & sub-flows
  const [isStoreConversionOpen, setIsStoreConversionOpen] = useState<boolean>(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [hoursSelectedLocId, setHoursSelectedLocId] = useState<string | undefined>(undefined);

  // Load Business list
  const loadBusinesses = async () => {
    setLoading(true);
    setError(null);
    try {
      // Search for businesses owned or list businesses
      const list = await discoveryApi.getMyBusinesses();
      setBusinesses(list || []);

      if (list && list.length > 0) {
        if (initialBusinessId) {
          const found = list.find((b) => b.id === initialBusinessId || b.slug === initialBusinessId);
          if (!found) {
            setSelectedBusiness(null);
            setRequestedBusinessMissing(true);
          } else {
            setRequestedBusinessMissing(false);
            setSelectedBusiness(found);
          }
        } else {
          setRequestedBusinessMissing(false);
          setSelectedBusiness(list[0]);
        }
      } else {
        setRequestedBusinessMissing(Boolean(initialBusinessId));
        setSelectedBusiness(null);
      }
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setError(err.message);
      } else {
        setError('Failed to load discovery business accounts.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBusinesses();
  }, [initialBusinessId]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('dashboard');
    }
  }, [activeTab, businessRole]);

  const handleBusinessCreated = (newBiz: DiscoveryBusiness) => {
    setBusinesses((prev) => [newBiz, ...prev]);
    setSelectedBusiness(newBiz);
    setIsOnboardingOpen(false);
    setActiveTab('dashboard');
  };

  const handleBusinessUpdated = (updated: DiscoveryBusiness) => {
    setSelectedBusiness(updated);
    setBusinesses((prev) =>
      prev.map((b) => (b.id === updated.id ? updated : b))
    );
  };

  const handleNavigateToHoursForLocation = (locationId: string) => {
    setHoursSelectedLocId(locationId);
    setActiveTab('hours');
  };

  const businessRole = ((selectedBusiness as DiscoveryBusiness & { membership_role?: BusinessRole })?.membership_role || 'OWNER') as BusinessRole;
  const visibleTabs = TABS.filter((tab) => ROLE_TAB_ACCESS[businessRole].includes(tab.id));
  const canManageStore = businessRole === 'OWNER';

  const handleViewPublicCard = () => {
    if (selectedBusiness && onNavigateCustomerDiscovery) {
      onNavigateCustomerDiscovery(`/discover/${selectedBusiness.slug}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center text-slate-400 text-xs gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
        <span>Loading Discovery Management Console...</span>
      </div>
    );
  }

  if (isOnboardingOpen || (!selectedBusiness && businesses.length === 0)) {
    return (
      <div className="py-8 px-4 max-w-4xl mx-auto">
        <DiscoveryOnboardingWizard
          onSuccess={handleBusinessCreated}
          onCancel={businesses.length > 0 ? () => setIsOnboardingOpen(false) : undefined}
        />
      </div>
    );
  }

  if (requestedBusinessMissing) {
    return (
      <div className="mx-auto my-16 max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm dark:border-red-900 dark:bg-slate-900">
        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-500" />
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Business unavailable</h3>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          This business does not belong to your merchant workspace, no longer exists, or you do not have permission to manage it.
        </p>
        <button
          type="button"
          onClick={() => window.location.assign('/business')}
          className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white"
        >
          Back to business portal
        </button>
      </div>
    );
  }

  if (!selectedBusiness) {
    return (
      <div className="max-w-md mx-auto my-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm">
        <Building2 className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          No Discovery Business Found
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Create your business listing to start getting discovered by local buyers and clients across Sierra Leone.
        </p>
        <button
          type="button"
          onClick={() => setIsOnboardingOpen(true)}
          className="mt-6 px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-2 shadow-lg shadow-indigo-600/30"
        >
          <Plus className="w-4 h-4" />
          <span>Get Listed Now</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Bar: Business Selector & Mode Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">
            <Building2 className="w-5 h-5" />
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Active Discovery Business
            </span>
            <div className="relative inline-block mt-0.5">
              <select
                value={selectedBusiness.id}
                onChange={(e) => {
                  const b = businesses.find((x) => x.id === e.target.value);
                  if (b) setSelectedBusiness(b);
                }}
                className="appearance-none pr-8 text-sm font-bold text-slate-900 dark:text-white bg-transparent border-none focus:outline-none cursor-pointer"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.business_mode})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsOnboardingOpen(true)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-600" />
            <span>Add Business</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar border-b border-slate-200 dark:border-slate-800">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 shrink-0 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="mt-6">
        {activeTab === 'dashboard' && (
          <DiscoveryBusinessDashboard
            business={selectedBusiness}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenStoreConversion={() => canManageStore && setIsStoreConversionOpen(true)}
            onViewPublicListing={handleViewPublicCard}
          />
        )}

        {activeTab === 'submission' && (
          <DiscoveryListingManagementWorkspace
            business={selectedBusiness}
            onUpdate={handleBusinessUpdated}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenPreview={handleViewPublicCard}
          />
        )}

        {activeTab === 'listing' && (
          <DiscoveryListingEditor
            business={selectedBusiness}
            onUpdate={handleBusinessUpdated}
            onOpenStoreConversion={() => setIsStoreConversionOpen(true)}
          />
        )}

        {activeTab === 'locations' && (
          <DiscoveryLocationsPanel
            business={selectedBusiness}
            onSelectHoursLocation={handleNavigateToHoursForLocation}
          />
        )}

        {activeTab === 'hours' && (
          <DiscoveryHoursEditor
            business={selectedBusiness}
            initialLocationId={hoursSelectedLocId}
          />
        )}

        {activeTab === 'services' && (
          <DiscoveryServicesManager business={selectedBusiness} />
        )}

        {activeTab === 'quotes' && (
          <DiscoveryQuotesInbox business={selectedBusiness} />
        )}

        {activeTab === 'contacts' && (
          <DiscoveryContactInbox business={selectedBusiness} />
        )}

        {activeTab === 'reviews' && (
          <DiscoveryReviewsPanel business={selectedBusiness} />
        )}

        {activeTab === 'verification' && (
          <DiscoveryVerificationPanel
            business={selectedBusiness}
            onUpdate={handleBusinessUpdated}
          />
        )}

        {activeTab === 'trust' && (
          <DiscoveryTrustCenter
            business={selectedBusiness}
            onNavigateToVerification={() => setActiveTab('verification')}
          />
        )}

        {activeTab === 'analytics' && (
          <DiscoveryAnalyticsPanel business={selectedBusiness} />
        )}

        {activeTab === 'settings' && (
          <DiscoverySettingsPanel business={selectedBusiness} />
        )}

        {activeTab === 'team' && (
          <DiscoveryBusinessTeamPanel businessId={selectedBusiness.id} />
        )}

        {activeTab === 'search' && (
          <DiscoverySearchAliasesPanel business={selectedBusiness} />
        )}
      </div>

      {/* Store Conversion Modal */}
      {isStoreConversionOpen && (
        <DiscoveryStoreConversionModal
          business={selectedBusiness}
          isOpen={isStoreConversionOpen}
          onClose={() => setIsStoreConversionOpen(false)}
          onConverted={handleBusinessUpdated}
        />
      )}
    </div>
  );
};
