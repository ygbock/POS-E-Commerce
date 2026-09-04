import React from 'react';
import {
  Home,
  Grid,
  Heart,
  User,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Tag,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';

interface MobileBottomNavProps {
  activeSection: string;
  setActiveSection?: (sec: string) => void;
  onNavigateHome?: () => void;
  onNavigateCatalog?: () => void;
  onOpenCart: () => void;
  onOpenAccount: () => void;
  onOpenWishlist?: () => void;
  onToggleFilters?: () => void;
  onOpenFilterDrawer?: () => void;
  hasActiveFilters?: boolean;
  activeFilterCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeSection,
  setActiveSection,
  onNavigateHome,
  onNavigateCatalog,
  onOpenCart,
  onOpenAccount,
  onOpenWishlist,
  onToggleFilters,
  onOpenFilterDrawer,
  hasActiveFilters,
  activeFilterCount = 0,
}) => {
  const { storeCart, wishlist, activeCustomerUser } = useCommerce();
  const cartItemsCount = storeCart.reduce((sum, item) => sum + item.quantity, 0);
  const wishlistCount = wishlist.length;

  const handleHomeClick = () => {
    if (onNavigateHome) {
      onNavigateHome();
    } else if (setActiveSection) {
      setActiveSection('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCatalogClick = () => {
    if (onNavigateCatalog) {
      onNavigateCatalog();
    } else if (setActiveSection) {
      setActiveSection('catalog');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFilterClick = () => {
    if (onOpenFilterDrawer) {
      onOpenFilterDrawer();
    } else if (onToggleFilters) {
      onToggleFilters();
    }
  };

  return (
    <nav
      id="mobile-bottom-navigation-dock"
      aria-label="Mobile Navigation"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800/90 px-3 pt-2 shadow-2xl"
    >
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {/* 1. Home Tab */}
        <button
          id="btn-mobilenav-home"
          type="button"
          onClick={handleHomeClick}
          className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-all ${
            activeSection === 'home'
              ? 'text-sky-400 font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
          }`}
        >
          <div className="relative">
            <Home className="w-5 h-5" />
            {activeSection === 'home' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sky-400" />
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight">Home</span>
        </button>

        {/* 2. Catalog / Browse Tab */}
        <button
          id="btn-mobilenav-catalog"
          type="button"
          onClick={handleCatalogClick}
          className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-all ${
            activeSection === 'catalog'
              ? 'text-sky-400 font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
          }`}
        >
          <div className="relative">
            <Grid className="w-5 h-5" />
            {activeSection === 'catalog' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sky-400" />
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight">Browse</span>
        </button>

        {/* 3. Dynamic Filter Button (in Catalog mode) or Deals shortcut */}
        {activeSection === 'catalog' && (onOpenFilterDrawer || onToggleFilters) ? (
          <button
            id="btn-mobilenav-filter"
            type="button"
            onClick={handleFilterClick}
            className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-all ${
              hasActiveFilters
                ? 'text-amber-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
            }`}
          >
            <div className="relative">
              <SlidersHorizontal className="w-5 h-5" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-amber-500 text-slate-950 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-1 tracking-tight">
              {hasActiveFilters ? 'Filters •' : 'Filters'}
            </span>
          </button>
        ) : (
          <button
            id="btn-mobilenav-deals"
            type="button"
            onClick={() => {
              const el = document.getElementById('store-promotions');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
              } else {
                if (setActiveSection) setActiveSection('home');
                else if (onNavigateHome) onNavigateHome();
                setTimeout(() => {
                  document.getElementById('store-promotions')?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }
            }}
            className="flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-amber-300 transition-all"
          >
            <Tag className="w-5 h-5 text-amber-400" />
            <span className="text-[10px] mt-1 tracking-tight">Deals</span>
          </button>
        )}

        {/* 4. Cart Tab */}
        <button
          id="btn-mobilenav-cart"
          type="button"
          onClick={onOpenCart}
          className="flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-sky-400 transition-all relative"
        >
          <div className="relative">
            <div className="p-1 bg-gradient-to-tr from-sky-500/20 to-indigo-500/20 rounded-lg text-sky-400">
              <ShoppingCart className="w-4 h-4" />
            </div>
            {cartItemsCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-gradient-to-r from-sky-500 to-indigo-500 text-slate-900 dark:text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow">
                {cartItemsCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-1 font-semibold text-slate-700 dark:text-slate-300 tracking-tight">Cart</span>
        </button>

        {/* 5. Customer Account / Portal Tab */}
        <button
          id="btn-mobilenav-account"
          type="button"
          onClick={onOpenAccount}
          className="flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 transition-all"
        >
          <div className="relative">
            <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-[10px] font-bold text-sky-400">
              {activeCustomerUser ? activeCustomerUser.name.charAt(0) : <User className="w-3.5 h-3.5" />}
            </div>
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-1.5 bg-rose-500 text-slate-900 dark:text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {wishlistCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight truncate max-w-[60px]">
            {activeCustomerUser ? activeCustomerUser.name.split(' ')[0] : 'Account'}
          </span>
        </button>
      </div>
    </nav>
  );
};
