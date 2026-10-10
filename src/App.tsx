import React, { useState } from 'react';
import { CommerceProvider, useCommerce } from './context/CommerceContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { AdminMobileBottomNav } from './components/layout/AdminMobileBottomNav';
import { ExecutiveDashboard } from './components/dashboard/ExecutiveDashboard';
import { PosTerminal } from './components/pos/PosTerminal';
import { Storefront } from './components/storefront/Storefront';
import { StorefrontProvider } from './context/StorefrontContext';
import { useStorefrontRoute } from './router/StorefrontRouter';
import { ProductManagement } from './components/catalog/ProductManagement';
import { StockManagement } from './components/inventory/StockManagement';
import { OrderFulfillment } from './components/orders/OrderFulfillment';
import { PurchasingManagement } from './components/purchasing/PurchasingManagement';
import { LedgerAndFinance } from './components/fintech/LedgerAndFinance';
import { CustomerManagementView } from './components/crm/CustomerManagementView';
import { AuditLogsView } from './components/admin/AuditLogsView';
import { PlatformDashboard } from './components/platform/PlatformDashboard.tsx';
import { SystemOwnerDashboard } from './components/platform/SystemOwnerDashboard';
import { SupportWorkspace } from './components/platform/SupportWorkspace';
import { PlatformDiscoveryModerationView } from './components/platform/PlatformDiscoveryModerationView';
import { TenantManagementView } from './components/platform/TenantManagementView';
import { SubscriptionsManagementView } from './components/platform/SubscriptionsManagementView';
import { PlatformDiscoveryCategoriesView } from './components/platform/PlatformDiscoveryCategoriesView';
import { PlatformDiscoveryLocationsView } from './components/platform/PlatformDiscoveryLocationsView';
import { UserManagementView } from './components/admin/UserManagementView';
import { LocationManagementView } from './components/admin/LocationManagementView';
import { SupplierManagementView } from './components/purchasing/SupplierManagementView';
import { isPlatformRole } from './components/platform/platformAccess';
import { DiscoveryMarketplace } from './components/discovery/DiscoveryMarketplace';
import { LoginPage } from './components/auth/LoginPage';
import { EmailVerificationPage } from './components/auth/EmailVerificationPage';
import { ResetPasswordPage } from './components/auth/ResetPasswordPage';
import { authClient, AuthUser } from './services/authClient';
import { BusinessOwnerSignup } from './components/merchant/BusinessOwnerSignup';
import { BusinessOwnerPortal } from './components/merchant/BusinessOwnerPortal';

const StorefrontRouteShell: React.FC<{ onOpenAdmin: () => void; onOpenPos: () => void }> = ({ onOpenAdmin, onOpenPos }) => {
  const { route } = useStorefrontRoute();
  return (
    <div data-storefront-route={route.name} data-storefront-tenant={route.tenantSlug || ''} className="min-h-screen">
      <Storefront onOpenAdmin={onOpenAdmin} onOpenPos={onOpenPos} />
    </div>
  );
};

const PublicDiscoveryShell: React.FC = () => <DiscoveryMarketplace />;

const PublicStorefrontShell: React.FC = () => (
  <CommerceProvider>
    <StorefrontProvider>
      <StorefrontRouteShell
        onOpenAdmin={() => window.location.assign('/?workspace=dashboard')}
        onOpenPos={() => window.location.assign('/?workspace=pos')}
      />
    </StorefrontProvider>
  </CommerceProvider>
);

const isPublicDiscoveryPath = (pathname: string) =>
  pathname === '/' || pathname === '/discover' || pathname.startsWith('/discover/');

const PLATFORM_TABS = [
  'platform-dashboard',
  'tenants',
  'subscriptions',
  'support',
  'security',
  'discovery-moderation',
  'discovery-categories',
  'discovery-locations',
] as const;

const TENANT_WORKSPACE_TABS = new Set([
  'dashboard',
  'catalog',
  'products',
  'inventory',
  'stock',
  'movements',
  'transfers',
  'stocktaking',
  'orders',
  'pos',
  'users',
  'locations',
  'crm',
  'suppliers',
  'purchasing',
  'fintech',
  'finance',
  'pricing',
  'warehouse',
  'reports',
  'audit',
  'settings',
  'support',
  'discovery',
  'discovery-admin',
  'storefront',
]);

const PLATFORM_PATH_TO_TAB: Record<string, string> = {
  '': 'platform-dashboard',
  dashboard: 'platform-dashboard',
  'platform-dashboard': 'platform-dashboard',
  tenants: 'tenants',
  subscriptions: 'subscriptions',
  support: 'support',
  security: 'security',
  'discovery-moderation': 'discovery-moderation',
  moderation: 'discovery-moderation',
  'discovery-categories': 'discovery-categories',
  categories: 'discovery-categories',
  'discovery-locations': 'discovery-locations',
  locations: 'discovery-locations',
};

const getPlatformTabFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null;
  const sp = new URLSearchParams(window.location.search);
  const queryTab = sp.get('tab') || sp.get('workspace');
  if (queryTab && (PLATFORM_TABS as readonly string[]).includes(queryTab)) {
    return queryTab;
  }
  const normalized = window.location.pathname.replace(/\/$/, '');
  if (normalized.startsWith('/platform/')) {
    const slug = normalized.slice('/platform/'.length).split('/')[0];
    if (slug && PLATFORM_PATH_TO_TAB[slug]) {
      return PLATFORM_PATH_TO_TAB[slug];
    }
  }
  if (normalized === '/admin/discovery') return 'discovery-moderation';
  return null;
};

const getTenantWorkspaceFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null;
  const sp = new URLSearchParams(window.location.search);
  const queryWorkspace = sp.get('workspace') || sp.get('tab');
  if (queryWorkspace && TENANT_WORKSPACE_TABS.has(queryWorkspace)) {
    return queryWorkspace;
  }
  const normalized = window.location.pathname.replace(/\/$/, '');
  if (normalized.startsWith('/admin/')) {
    const slug = normalized.slice('/admin/'.length).split('/')[0];
    if (slug === 'discovery') return 'discovery-admin';
    if (slug && TENANT_WORKSPACE_TABS.has(slug)) return slug;
  }
  const directMap: Record<string, string> = {
    '/admin': 'dashboard',
    '/dashboard': 'dashboard',
    '/pos': 'pos',
    '/inventory': 'inventory',
    '/stock': 'stock',
    '/catalog': 'catalog',
    '/products': 'products',
    '/orders': 'orders',
    '/purchasing': 'purchasing',
    '/crm': 'crm',
    '/users': 'users',
    '/locations': 'locations',
    '/suppliers': 'suppliers',
    '/finance': 'finance',
    '/reports': 'reports',
    '/audit': 'audit',
    '/settings': 'settings',
  };
  return directMap[normalized] || null;
};

const isPublicStorefrontPath = (pathname: string) => {
  const normalized = pathname.replace(/\/$/, '') || '/';
  return normalized === '/storefront'
    || normalized.startsWith('/storefront/')
    || normalized === '/store'
    || normalized.startsWith('/store/')
    || normalized === '/shop'
    || normalized.startsWith('/shop/')
    || normalized === '/search'
    || normalized.startsWith('/search/')
    || normalized === '/product'
    || normalized.startsWith('/product/')
    || normalized === '/cart'
    || normalized === '/checkout'
    || normalized === '/account'
    || normalized.startsWith('/order/');
};

const MainLayout: React.FC = () => {
  const { currentRole } = useCommerce();
  const isPlatform = isPlatformRole(currentRole);

  const requestedBusinessId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('businessId')
    : null;

  const resolveInitialTab = React.useCallback((): string => {
    if (isPlatform) {
      const fromUrl = getPlatformTabFromUrl();
      if (fromUrl) return fromUrl;
      if (typeof window !== 'undefined') {
        const saved = window.localStorage.getItem('abacha_platform_active_tab');
        if (saved && (PLATFORM_TABS as readonly string[]).includes(saved)) {
          return saved;
        }
      }
      return 'platform-dashboard';
    }

    const fromUrl = getTenantWorkspaceFromUrl();
    if (fromUrl) return fromUrl;
    if (typeof window !== 'undefined') {
      const isStorePath = isPublicStorefrontPath(window.location.pathname);
      if (isStorePath) return 'storefront';
      const saved = window.localStorage.getItem('abacha_tenant_active_tab');
      if (saved && TENANT_WORKSPACE_TABS.has(saved)) {
        if (currentRole === 'E-commerce Customer') return 'storefront';
        return saved;
      }
    }
    return currentRole === 'E-commerce Customer' ? 'storefront' : 'dashboard';
  }, [isPlatform, currentRole]);

  const [activeTab, setActiveTabState] = useState<string>(resolveInitialTab);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('abacha_sidebar_collapsed') === 'true';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  const setActiveTab = React.useCallback((nextTab: string) => {
    setActiveTabState(nextTab);
    if (typeof window === 'undefined') return;
    try {
      if ((PLATFORM_TABS as readonly string[]).includes(nextTab)) {
        window.localStorage.setItem('abacha_platform_active_tab', nextTab);
        const targetPath = nextTab === 'platform-dashboard' ? '/platform' : `/platform/${nextTab}`;
        const sp = new URLSearchParams(window.location.search);
        sp.delete('tab');
        sp.delete('workspace');
        const nextUrl = `${targetPath}${sp.toString() ? `?${sp.toString()}` : ''}`;
        if (window.location.pathname + window.location.search !== nextUrl) {
          window.history.pushState({}, '', nextUrl);
        }
      } else if (TENANT_WORKSPACE_TABS.has(nextTab)) {
        window.localStorage.setItem('abacha_tenant_active_tab', nextTab);
        if (nextTab === 'storefront') {
          if (!isPublicStorefrontPath(window.location.pathname)) {
            window.history.pushState({}, '', '/store');
          }
        } else {
          const sp = new URLSearchParams(window.location.search);
          sp.set('workspace', nextTab);
          const basePath = window.location.pathname.startsWith('/platform') || isPublicStorefrontPath(window.location.pathname)
            ? '/'
            : window.location.pathname;
          const nextUrl = `${basePath === '/' ? '/' : basePath}?${sp.toString()}`;
          if (window.location.pathname + window.location.search !== nextUrl) {
            window.history.pushState({}, '', nextUrl);
          }
        }
      }
    } catch {
      // ignore storage/history errors
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('abacha_sidebar_collapsed', String(isSidebarCollapsed));
    } catch {
      // ignore
    }
  }, [isSidebarCollapsed]);

  // Sync activeTab when browser back/forward navigation occurs
  React.useEffect(() => {
    const onPopState = () => {
      if (isPlatform) {
        const tabFromUrl = getPlatformTabFromUrl();
        if (tabFromUrl) setActiveTabState(tabFromUrl);
      } else {
        const wsFromUrl = getTenantWorkspaceFromUrl();
        if (wsFromUrl) setActiveTabState(wsFromUrl);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isPlatform]);

  // Enforce strict boundary between platform control plane and tenant operations
  React.useEffect(() => {
    const platformTabs = [...PLATFORM_TABS] as string[];
    if (isPlatform) {
      if (!platformTabs.includes(activeTab)) {
        const restored = getPlatformTabFromUrl()
          || (typeof window !== 'undefined' ? window.localStorage.getItem('abacha_platform_active_tab') : null);
        setActiveTab(restored && platformTabs.includes(restored) ? restored : 'platform-dashboard');
      }
    } else {
      if (platformTabs.includes(activeTab)) {
        const restored = getTenantWorkspaceFromUrl()
          || (typeof window !== 'undefined' ? window.localStorage.getItem('abacha_tenant_active_tab') : null);
        setActiveTab(restored && TENANT_WORKSPACE_TABS.has(restored) ? restored : 'dashboard');
      } else if (currentRole === 'E-commerce Customer' && activeTab !== 'storefront') {
        setActiveTab('storefront');
      } else if (currentRole === 'Cashier' && activeTab === 'dashboard') {
        setActiveTab('pos');
      }
    }
  }, [currentRole, isPlatform, activeTab, setActiveTab]);

  // When activeTab is 'storefront' (and user is not a platform operator), render customer storefront
  if (activeTab === 'storefront' && !isPlatform) {
    return (
      <StorefrontRouteShell
        onOpenAdmin={() => setActiveTab('dashboard')}
        onOpenPos={() => setActiveTab('pos')}
      />
    );
  }

  // When in Admin / POS / Back-Office mode, render the enterprise management layout
  return (
    <div className="h-screen bg-[#f8fafc] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex font-sans selection:bg-blue-600 selection:text-white overflow-hidden transition-colors">
      {/* Sticky & Responsive Drawer Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setIsMobileSidebarOpen(false);
        }}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobileOpen={isMobileSidebarOpen}
        setIsMobileOpen={setIsMobileSidebarOpen}
      />

      {/* Main Column Container */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Admin Header (Now scoped within the right column) */}
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenSearch={() => setIsSearchOpen(true)}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
          isMobileSidebarOpen={isMobileSidebarOpen}
        />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 pb-20 lg:pb-8 custom-scrollbar bg-[#f8fafc] dark:bg-slate-950">
          <div className="max-w-7xl mx-auto space-y-6">
            {activeTab === 'platform-dashboard' && <PlatformDashboard setActiveTab={setActiveTab} />}
            {activeTab === 'tenants' && <TenantManagementView />}
            {activeTab === 'subscriptions' && <SubscriptionsManagementView />}
            {activeTab === 'support' && (isPlatform ? <SupportWorkspace platform /> : <SupportWorkspace />)}
            {activeTab === 'security' && <AuditLogsView />}
            {activeTab === 'discovery-moderation' && <PlatformDiscoveryModerationView />}
            {activeTab === 'discovery-categories' && <PlatformDiscoveryCategoriesView />}
            {activeTab === 'discovery-locations' && <PlatformDiscoveryLocationsView />}
            {activeTab === 'dashboard' && <ExecutiveDashboard setActiveTab={setActiveTab} />}
            {(activeTab === 'discovery' || activeTab === 'discovery-admin') && <DiscoveryMarketplace />}
            {activeTab === 'users' && <UserManagementView />}
            {activeTab === 'locations' && <LocationManagementView />}
            {activeTab === 'suppliers' && <SupplierManagementView />}
            {activeTab === 'pos' && <PosTerminal />}
            {(activeTab === 'catalog' || activeTab === 'products') && <ProductManagement storeBusinessId={requestedBusinessId} />}
            {(activeTab === 'inventory' || activeTab === 'stock' || activeTab === 'movements' || activeTab === 'transfers' || activeTab === 'stocktaking') && (
              <StockManagement initialSubTab={activeTab === 'movements' ? 'movements' : activeTab === 'transfers' ? 'transfers' : activeTab === 'stocktaking' ? 'adjustments' : 'matrix'} />
            )}
            {activeTab === 'orders' && <OrderFulfillment />}
            {activeTab === 'purchasing' && <PurchasingManagement />}
            {(activeTab === 'fintech' || activeTab === 'finance') && <LedgerAndFinance />}
            {activeTab === 'crm' && <CustomerManagementView />}
            {activeTab === 'pricing' && <ProductManagement />}
            {activeTab === 'warehouse' && <StockManagement initialSubTab="matrix" />}
            {activeTab === 'reports' && <LedgerAndFinance />}
            {activeTab === 'audit' && <AuditLogsView />}
            {activeTab === 'settings' && <ProductManagement />}
          </div>
        </main>
      </div>

      {/* Mobile-First Admin Bottom Navigation Bar */}
      <AdminMobileBottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
      />
    </div>
  );
};

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => authClient.getUser());
  const [authLoading, setAuthLoading] = useState(true);
  const [pathname, setPathname] = useState<string>(() => window.location.pathname);

  React.useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  React.useEffect(() => {
    let mounted = true;
    void authClient.fetchMe().then((user) => {
      if (!mounted) return;
      setAuthUser(user);
      setAuthLoading(false);
    }).catch(() => {
      if (mounted) setAuthLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const handleAuthenticated = (user: AuthUser) => {
    setPathname(window.location.pathname);
    setAuthUser(user);
    setAuthLoading(false);
  };

  const isLoginPath = pathname === '/login';
  const isPlatformSigninPath = pathname === '/platform/signin';
  const isPlatformPath = pathname === '/platform' || pathname.startsWith('/platform/') || pathname === '/admin/discovery' || pathname.startsWith('/admin/discovery/');
  const isMerchantPath = pathname === '/business' || pathname.startsWith('/business/');
  const isMerchantSignupPath = pathname === '/business/signup';
  const isMerchantSigninPath = pathname === '/business/signin';
  const isVerifyEmailPath = pathname === '/verify-email';
  const isResetPasswordPath = pathname === '/reset-password';
  const hasAuthenticatedWorkspaceRequest = Boolean(getTenantWorkspaceFromUrl() || getPlatformTabFromUrl());

  if (isVerifyEmailPath) {
    return <EmailVerificationPage />;
  }

  if (isResetPasswordPath) {
    return <ResetPasswordPage />;
  }

  if (isMerchantSignupPath) {
    return <BusinessOwnerSignup />;
  }

  // Platform operators have a dedicated authentication entry point. This is
  // intentionally separate from merchant/customer login so the control plane
  // boundary is visible and role-checked before entering /platform.
  if (isPlatformSigninPath) {
    return <LoginPage mode="platform" onAuthenticated={handleAuthenticated} />;
  }

  // Keep authentication outside the storefront router. /login must always
  // resolve to the shared login screen, even when reached from a storefront.
  if (isLoginPath) {
    return <LoginPage onAuthenticated={handleAuthenticated} />;
  }

  if (isMerchantSigninPath) {
    return <LoginPage onAuthenticated={handleAuthenticated} />;
  }

  if (!authLoading && isMerchantPath && authUser) {
    return <BusinessOwnerPortal />;
  }

  // Public storefront and Discovery routes must be previewable without an admin session.
  if (!authLoading && !authUser && isPublicDiscoveryPath(pathname) && !hasAuthenticatedWorkspaceRequest) {
    return (
      <ErrorBoundary>
        <ToastProvider>
          <PublicDiscoveryShell />
        </ToastProvider>
      </ErrorBoundary>
    );
  }

  if (!authLoading && !authUser && isPublicStorefrontPath(pathname)) {
    return (
      <ErrorBoundary>
        <ToastProvider>
          <PublicStorefrontShell />
        </ToastProvider>
      </ErrorBoundary>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-white" />
          <p className="text-sm text-slate-400">Checking your session…</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    if (isPlatformPath) return <LoginPage mode="platform" onAuthenticated={handleAuthenticated} />;
    if (isMerchantPath) return <LoginPage mode="business" onAuthenticated={handleAuthenticated} />;
    return <LoginPage onAuthenticated={handleAuthenticated} />;
  }

  // A valid session is not sufficient for the platform control plane. Keep
  // tenant/customer identities out of /platform and require a platform role.
  if (isPlatformPath && !['system_owner', 'platform_admin', 'platform_support', 'platform_finance'].includes(authUser.role)) {
    void authClient.logout();
    return <LoginPage mode="platform" onAuthenticated={handleAuthenticated} />;
  }

  // Discovery is the platform landing page. Authenticated users also start here;
  // tenant storefronts are entered explicitly from a business listing.
  if (isPublicDiscoveryPath(pathname) && !hasAuthenticatedWorkspaceRequest) {
    return (
      <ErrorBoundary>
        <ToastProvider>
          <PublicDiscoveryShell />
        </ToastProvider>
      </ErrorBoundary>
    );
  }

  const handleLogout = async () => {
    await authClient.logout();
    setAuthUser(null);
  };

  return (
    <ErrorBoundary>
      <ToastProvider>
        <CommerceProvider>
          <StorefrontProvider>
            <MainLayout />
          </StorefrontProvider>
        </CommerceProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
