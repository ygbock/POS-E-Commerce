import React from 'react';
import {
  LayoutDashboard,
  Monitor,
  Boxes,
  PackageCheck,
  Menu,
  Store,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';

interface AdminMobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenMobileSidebar: () => void;
}

export const AdminMobileBottomNav: React.FC<AdminMobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  onOpenMobileSidebar,
}) => {
  const { orders, heldCarts } = useCommerce();

  const pendingOrdersCount = orders.filter(
    (o) => o.status === 'Pending' || o.status === 'Stock Reserved' || o.status === 'Picking'
  ).length;

  const activeHeldCount = heldCarts.length;

  const navItems = [
    {
      id: 'dashboard',
      label: 'Overview',
      icon: LayoutDashboard,
    },
    {
      id: 'pos',
      label: 'POS',
      icon: Monitor,
      badge: activeHeldCount > 0 ? activeHeldCount : undefined,
      badgeColor: 'bg-blue-600',
    },
    {
      id: 'products',
      label: 'Inventory',
      icon: Boxes,
    },
    {
      id: 'orders',
      label: 'Orders',
      icon: PackageCheck,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
      badgeColor: 'bg-amber-500',
    },
  ];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 text-slate-400 px-2 py-1.5 shadow-2xl flex items-center justify-around select-none">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          activeTab === item.id ||
          (item.id === 'products' && (activeTab === 'stock' || activeTab === 'catalog'));

        return (
          <button
            key={item.id}
            id={`mobile-nav-${item.id}`}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all cursor-pointer relative ${
              isActive
                ? 'text-sky-400 font-bold'
                : 'text-slate-400 hover:text-slate-200 active:scale-95'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-sky-400' : ''}`} />
              {item.badge && (
                <span className={`absolute -top-1.5 -right-2 text-[9px] font-black text-white px-1.2 py-0.2 rounded-full ring-2 ring-slate-950 ${item.badgeColor || 'bg-blue-600'}`}>
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight mt-0.5">{item.label}</span>
            {isActive && (
              <span className="w-1 h-1 rounded-full bg-sky-400 mt-0.5 animate-pulse" />
            )}
          </button>
        );
      })}

      {/* Menu / Drawer Toggle */}
      <button
        id="mobile-nav-menu"
        onClick={onOpenMobileSidebar}
        className="flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-slate-400 hover:text-slate-200 active:scale-95 transition-all cursor-pointer"
      >
        <Menu className="w-5 h-5 text-slate-400" />
        <span className="text-[10px] tracking-tight mt-0.5">More</span>
      </button>

      {/* Quick Storefront View Pill */}
      <button
        id="mobile-nav-storefront"
        onClick={() => setActiveTab('storefront')}
        className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-emerald-400 hover:text-emerald-300 active:scale-95 transition-all cursor-pointer border border-emerald-500/30 bg-emerald-500/10"
        title="View Customer Storefront"
      >
        <Store className="w-4 h-4 text-emerald-400" />
        <span className="text-[9px] font-extrabold tracking-tight mt-0.5 text-emerald-300">Store</span>
      </button>
    </div>
  );
};
