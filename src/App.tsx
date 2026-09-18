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
import { TenantManagementView } from './components/platform/TenantManagementView';
import { SubscriptionsManagementView } from './components/platform/SubscriptionsManagementView';
import { UserManagementView } from './components/admin/UserManagementView';
import { LocationManagementView } from './components/admin/LocationManagementView';
import { isPlatformRole } from './components/platform/platformAccess';
import { DiscoveryMarketplace } from './components/discovery/DiscoveryMarketplace';
import { DiscoveryHome } from './components/discovery/DiscoveryHome';
import { LoginPage } from './components/auth/LoginPage';
import { authClient, AuthUser } from './services/authClient';

const StorefrontRouteShell: React.FC<{ onOpenAdmin: () => void; onOpenPos: () => void }> = ({ onOpenAdmin, onOpenPos }) => {
  const { route } = useStorefrontRoute();
  return (
    <div data-storefront-route={route.name} data-storefront-tenant={route.tenantSlug || ''} className="min-h-screen">
      <Storefront onOpenAdmin={onOpenAdmin} onOpenPos={onOpenPos} />
    </div>
  );
};

const PublicDiscoveryShell: React.FC = () =>
  window.location.pathname === '/' || window.location.pathname === '/discover'
    ? <DiscoveryHome />
    : <DiscoveryMarketplace />;

const PublicStorefrontShell: React.FC = () => (
  <CommerceProvider>
    <StorefrontProvider>
      <StorefrontRouteShell onOpenAdmin={() => window.location.assign('/')} onOpenPos={() => window.location.assign('/')} />
    </StorefrontProvider>
  </CommerceProvider>
);

const isPublicDiscoveryPath = (pathname: string) =>
  pathname === '/' || pathname === '/discover' || pathname.startsWith('/discover/');

const isPublicStorefrontPath = (pathname: string) =>
  pathname.startsWith('/store/');

const MainLayout: React.FC = () => {
  const { currentRole } = useCommerce();
  const isPlatform = isPlatformRole(currentRole);

  // Default initial active tab: platform control plane for platform operators, storefront for customer/tenant
  const [activeTab, setActiveTab] = useState<string>(() =>
    isPlatform ? 'platform-dashboard' : 'storefront'
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Enforce strict boundary between platform control plane and tenant operations
  React.useEffect(() => {
    const platformTabs = ['platform-dashboard', 'tenants', 'subscriptions', 'support'];
    if (isPlatform) {
      if (!platformTabs.includes(activeTab) && activeTab !== 'security') {
        setActiveTab('platform-dashboard');
      }
    } else {
      if (platformTabs.includes(activeTab)) {
        setActiveTab('dashboard');
      } else if (currentRole === 'E-commerce Customer' && activeTab !== 'storefront') {
        setActiveTab('storefront');
      } else if (currentRole === 'Cashier' && activeTab === 'dashboard') {
        setActiveTab('pos');
      }
    }
  }, [currentRole, isPlatform, activeTab]);

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
            {activeTab === 'support' && <SystemOwnerDashboard onNavigate={setActiveTab} />}
            {activeTab === 'security' && <AuditLogsView />}
            {activeTab === 'dashboard' && <ExecutiveDashboard setActiveTab={setActiveTab} />}
            {(activeTab === 'discovery' || activeTab === 'discovery-admin') && <DiscoveryMarketplace />}
            {activeTab === 'users' && <UserManagementView />}
            {activeTab === 'locations' && <LocationManagementView />}
            {activeTab === 'pos' && <PosTerminal />}
            {(activeTab === 'catalog' || activeTab === 'products') && <ProductManagement />}
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

  // Public storefront and Discovery routes must be previewable without an admin session.
  if (!authLoading && !authUser && isPublicDiscoveryPath(window.location.pathname)) {
    return (
      <ErrorBoundary>
        <ToastProvider>
          <PublicDiscoveryShell />
        </ToastProvider>
      </ErrorBoundary>
    );
  }

  if (!authLoading && !authUser && isPublicStorefrontPath(window.location.pathname)) {
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
    return <LoginPage onAuthenticated={setAuthUser} />;
  }

  // Discovery is the platform landing page. Authenticated users also start here;
  // tenant storefronts are entered explicitly from a business listing.
  if (isPublicDiscoveryPath(window.location.pathname)) {
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
