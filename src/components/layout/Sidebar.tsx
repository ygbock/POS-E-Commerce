import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Monitor,
  Store,
  Package,
  Boxes,
  ArrowLeftRight,
  ClipboardCheck,
  History,
  Truck,
  PackageCheck,
  Building2,
  Users,
  BadgePercent,
  ReceiptText,
  BarChart3,
  ShieldAlert,
  Settings,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  ExternalLink,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;
  isMobileOpen?: boolean;
  setIsMobileOpen?: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isCollapsed = false,
  setIsCollapsed,
  isMobileOpen = false,
  setIsMobileOpen,
}) => {
  const { currentRole, currentLocation, orders, purchaseOrders, heldCarts } = useCommerce();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [navSearch, setNavSearch] = useState('');

  const collapsed = setIsCollapsed ? isCollapsed : internalCollapsed;
  const toggleCollapsed = () => {
    if (setIsCollapsed) {
      setIsCollapsed(!isCollapsed);
    } else {
      setInternalCollapsed(!internalCollapsed);
    }
  };

  // Close mobile sidebar on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen && setIsMobileOpen) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, setIsMobileOpen]);

  const handleNavClick = (tabId: string) => {
    setActiveTab(tabId);
    if (setIsMobileOpen) {
      setIsMobileOpen(false);
    }
  };

  // Metrics for badges
  const pendingOrdersCount = orders.filter(
    (o) => o.status === 'Pending' || o.status === 'Stock Reserved' || o.status === 'Picking'
  ).length;
  const pendingPOCount = purchaseOrders.filter((p) => p.status === 'Sent' || p.status === 'Approved').length;
  const activeHeldCount = heldCarts.length;

  const navGroups = useMemo(
    () => [
      {
        group: 'Sales & Channels',
        items: [
          { id: 'dashboard', label: 'Executive Overview', icon: LayoutDashboard },
          {
            id: 'pos',
            label: 'POS Register',
            icon: Monitor,
            badge: activeHeldCount > 0 ? `${activeHeldCount} Held` : undefined,
            badgeColor: 'bg-blue-600 text-white',
          },
          {
            id: 'storefront',
            label: 'Storefront Portal',
            icon: Store,
            badge: 'Live',
            badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
            isExternalStyle: true,
          },
        ],
      },
      {
        group: 'Inventory & Catalog',
        items: [
          { id: 'products', label: 'Products & Master SKUs', icon: Package },
          { id: 'stock', label: 'Multi-Branch Inventory', icon: Boxes },
          { id: 'movements', label: 'Audit Trail / Movements', icon: History },
          { id: 'transfers', label: 'Inter-Branch Transfers', icon: ArrowLeftRight },
          { id: 'stocktaking', label: 'Stocktaking & Variances', icon: ClipboardCheck },
        ],
      },
      {
        group: 'Procurement & Orders',
        items: [
          {
            id: 'purchasing',
            label: 'Purchasing & Supplier Portal',
            icon: Truck,
            badge: pendingPOCount > 0 ? `${pendingPOCount}` : undefined,
            badgeColor: 'bg-emerald-600 text-white',
          },
          {
            id: 'orders',
            label: 'Fulfillment Pipeline',
            icon: PackageCheck,
            badge: pendingOrdersCount > 0 ? `${pendingOrdersCount}` : undefined,
            badgeColor: 'bg-amber-500 text-white',
          },
          { id: 'warehouse', label: 'Warehouses & Zones', icon: Building2 },
        ],
      },
      {
        group: 'CRM & Accounting',
        items: [
          { id: 'crm', label: 'Customers & CRM', icon: Users },
          { id: 'pricing', label: 'Pricing Rules & Tiers', icon: BadgePercent },
          { id: 'finance', label: 'General Ledger & P&L', icon: ReceiptText },
          { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
        ],
      },
      {
        group: 'Administration',
        items: [
          { id: 'audit', label: 'Security & Audit Logs', icon: ShieldAlert },
          { id: 'settings', label: 'System Settings', icon: Settings },
        ],
      },
    ],
    [activeHeldCount, pendingPOCount, pendingOrdersCount]
  );

  // Filter items if search is typed
  const filteredGroups = useMemo(() => {
    if (!navSearch.trim()) return navGroups;
    const query = navSearch.toLowerCase().trim();
    return navGroups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            item.label.toLowerCase().includes(query) ||
            item.id.toLowerCase().includes(query) ||
            g.group.toLowerCase().includes(query)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [navGroups, navSearch]);

  return (
    <>
      {/* Mobile & Tablet Backdrop Overlay */}
      {isMobileOpen && (
        <div
          id="sidebar-mobile-backdrop"
          onClick={() => setIsMobileOpen && setIsMobileOpen(false)}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 lg:hidden transition-opacity duration-300 animate-in fade-in"
          aria-hidden="true"
        />
      )}

      <aside
        id="main-app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 h-full w-72 max-w-[85vw] bg-slate-950/95 backdrop-blur-md text-slate-400 flex flex-col flex-shrink-0 select-none border-r border-slate-800/80 shadow-2xl transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:h-[calc(100vh-4rem)] lg:z-30 lg:shadow-none ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        {/* Brand & Collapse / Close Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between min-h-[4.25rem]">
          {/* Logo & Title (Expanded or on mobile/tablet) */}
          <div
            id="btn-brand-logo"
            onClick={() => handleNavClick('dashboard')}
            className={`items-center space-x-3 cursor-pointer group flex-1 min-w-0 ${
              collapsed ? 'hidden lg:hidden' : 'flex'
            }`}
            title="Go to Executive Dashboard"
          >
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center font-black text-lg text-white shadow-md shadow-blue-500/25 group-hover:scale-105 transition-transform flex-shrink-0">
              O
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base tracking-tight text-white block leading-tight truncate">
                  OMNICORE
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="System Live" />
              </div>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block truncate">
                Unified Commerce
              </span>
            </div>
          </div>

          {/* Desktop Collapsed Logo Only */}
          {collapsed && (
            <div
              onClick={() => handleNavClick('dashboard')}
              className="hidden lg:flex w-9 h-9 mx-auto bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl items-center justify-center font-black text-lg text-white shadow-md shadow-blue-500/25 cursor-pointer hover:scale-105 transition-transform"
              title="OMNICORE - Go to Dashboard"
            >
              O
            </div>
          )}

          {/* Mobile Close Button */}
          <button
            id="btn-close-mobile-sidebar"
            onClick={() => setIsMobileOpen && setIsMobileOpen(false)}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-850 transition-colors ml-2 flex-shrink-0"
            title="Close navigation"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Desktop Toggle Collapse Button */}
          <button
            onClick={toggleCollapsed}
            className={`hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors ${
              collapsed ? 'mx-auto mt-2' : 'ml-2'
            }`}
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick Search Filter */}
        <div className={`px-3 pt-3 pb-1 ${collapsed ? 'lg:hidden' : 'block'}`}>
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              placeholder="Filter modules..."
              className="w-full pl-8 pr-7 py-1.5 bg-slate-900/90 border border-slate-800 focus:border-blue-500/60 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 outline-none transition-all"
            />
            {navSearch && (
              <button
                onClick={() => setNavSearch('')}
                className="absolute right-2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Nav List with Smooth Dark Scrollbar */}
        <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto sidebar-scrollbar">
          {filteredGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              <div
                className={`text-[11px] font-bold text-slate-400/90 uppercase tracking-wider px-2.5 py-1.5 flex items-center justify-between ${
                  collapsed ? 'lg:hidden' : 'block'
                }`}
              >
                <span>{group.group}</span>
              </div>

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    activeTab === item.id ||
                    (item.id === 'products' && activeTab === 'catalog') ||
                    (item.id === 'stock' && activeTab === 'inventory') ||
                    (item.id === 'finance' && activeTab === 'fintech');

                  return (
                    <div key={item.id} className="relative group">
                      <button
                        id={`nav-${item.id}`}
                        onClick={() => handleNavClick(item.id)}
                        className={`w-full flex items-center ${
                          collapsed ? 'lg:justify-center lg:px-0 lg:py-2.5 justify-between px-3 py-2.5' : 'justify-between px-3 py-2'
                        } rounded-xl text-xs font-semibold transition-all duration-200 ${
                          isActive
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/25 font-bold'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/80'
                        }`}
                        title={collapsed ? item.label : undefined}
                      >
                        <div
                          className={`flex items-center ${
                            collapsed ? 'lg:justify-center' : 'space-x-3'
                          } min-w-0 space-x-3`}
                        >
                          <Icon
                            className={`w-4 h-4 flex-shrink-0 transition-transform ${
                              isActive
                                ? 'text-white scale-110'
                                : 'text-slate-400 group-hover:text-slate-200 group-hover:scale-105'
                            }`}
                          />
                          <span className={`${collapsed ? 'lg:hidden' : 'inline'} truncate`}>{item.label}</span>
                        </div>

                        {item.badge && (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                              collapsed ? 'lg:hidden' : 'inline-flex'
                            } ${item.badgeColor || 'bg-blue-600 text-white'}`}
                          >
                            {item.badge}
                            {item.isExternalStyle && <ExternalLink className="w-2.5 h-2.5" />}
                          </span>
                        )}

                        {/* Collapsed dot badge for desktop only */}
                        {collapsed && item.badge && (
                          <span className="hidden lg:block absolute top-1.5 right-2 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-slate-950" />
                        )}
                      </button>

                      {/* Floating Tooltip when Collapsed on desktop */}
                      {collapsed && (
                        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 hidden lg:group-hover:flex items-center z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                          <div className="bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xl border border-slate-800 whitespace-nowrap flex items-center gap-2">
                            <span>{item.label}</span>
                            {item.badge && (
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-black ${
                                  item.badgeColor || 'bg-blue-600 text-white'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {filteredGroups.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-slate-500">
              No matching modules found
            </div>
          )}
        </nav>

        {/* Footer / Operator Profile */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/80">
          <div className={`space-y-2.5 ${collapsed ? 'lg:hidden' : 'block'}`}>
            {/* Operator Card */}
            <div className="flex items-center space-x-2.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600/30 to-indigo-600/30 border border-blue-500/40 flex items-center justify-center font-black text-xs text-blue-400 flex-shrink-0">
                {currentRole.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-200 truncate">Operator Active</p>
                  <span className="text-[9px] text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Online
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5 text-blue-400 flex-shrink-0" />
                  <span className="truncate">{currentLocation.name}</span>
                </p>
              </div>
            </div>

            {/* Quick Switch to Storefront */}
            <button
              onClick={() => handleNavClick('storefront')}
              className="w-full py-1.5 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800 text-[11px] font-semibold transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-12 transition-transform" />
                <span>Customer Storefront</span>
              </div>
              <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-slate-300" />
            </button>
          </div>

          {collapsed && (
            <div className="hidden lg:flex flex-col items-center gap-2">
              <button
                onClick={() => handleNavClick('storefront')}
                className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-amber-400 hover:text-amber-300 transition-colors"
                title="Open Customer Storefront"
              >
                <Store className="w-4 h-4" />
              </button>
              <div
                className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-black text-xs text-blue-400"
                title={`Active: ${currentRole} (${currentLocation.name})`}
              >
                {currentRole.charAt(0)}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
