import React, { useState } from 'react';
import { CommerceProvider, useCommerce } from './context/CommerceContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { AdminMobileBottomNav } from './components/layout/AdminMobileBottomNav';
import { ExecutiveDashboard } from './components/dashboard/ExecutiveDashboard';
import { PosTerminal } from './components/pos/PosTerminal';
import { Storefront } from './components/storefront/Storefront';
import { ProductManagement } from './components/catalog/ProductManagement';
import { StockManagement } from './components/inventory/StockManagement';
import { OrderFulfillment } from './components/orders/OrderFulfillment';
import { PurchasingManagement } from './components/purchasing/PurchasingManagement';
import { LedgerAndFinance } from './components/fintech/LedgerAndFinance';
import { CustomerManagement } from './components/crm/CustomerManagement';
import { AuditLogsView } from './components/admin/AuditLogsView';

const MainLayout: React.FC = () => {
  // Default first page is the public customer Storefront
  const [activeTab, setActiveTab] = useState<string>('storefront');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const { currentRole } = useCommerce();

  // Handle role-based navigation changes
  React.useEffect(() => {
    if (currentRole === 'E-commerce Customer' && activeTab !== 'storefront') {
      setActiveTab('storefront');
    } else if (currentRole === 'Cashier' && activeTab === 'dashboard') {
      setActiveTab('pos');
    }
  }, [currentRole]);

  // When activeTab is 'storefront', render the full customer-facing store as the root page
  if (activeTab === 'storefront') {
    return (
      <Storefront
        onOpenAdmin={() => setActiveTab('dashboard')}
        onOpenPos={() => setActiveTab('pos')}
      />
    );
  }

  // When in Admin / POS / Back-Office mode, render the enterprise management layout
  return (
    <div className="h-screen bg-[#f8fafc] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white overflow-hidden transition-colors">
      {/* Top Admin Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSearch={() => setIsSearchOpen(true)}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        isMobileSidebarOpen={isMobileSidebarOpen}
      />

      {/* Main Container with Sticky Sidebar and Scrollable Content */}
      <div className="flex-1 flex overflow-hidden relative">
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

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 pb-20 lg:pb-8 custom-scrollbar bg-[#f8fafc] dark:bg-slate-950">
          <div className="max-w-7xl mx-auto space-y-6">
            {activeTab === 'dashboard' && <ExecutiveDashboard setActiveTab={setActiveTab} />}
            {activeTab === 'pos' && <PosTerminal />}
            {(activeTab === 'catalog' || activeTab === 'products') && <ProductManagement />}
            {(activeTab === 'inventory' || activeTab === 'stock' || activeTab === 'movements' || activeTab === 'transfers' || activeTab === 'stocktaking') && (
              <StockManagement initialSubTab={activeTab === 'movements' ? 'movements' : activeTab === 'transfers' ? 'transfers' : activeTab === 'stocktaking' ? 'adjustments' : 'matrix'} />
            )}
            {activeTab === 'orders' && <OrderFulfillment />}
            {activeTab === 'purchasing' && <PurchasingManagement />}
            {(activeTab === 'fintech' || activeTab === 'finance') && <LedgerAndFinance />}
            {activeTab === 'crm' && <CustomerManagement />}
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
  return (
    <CommerceProvider>
      <MainLayout />
    </CommerceProvider>
  );
}
