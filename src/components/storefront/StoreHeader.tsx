import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  ShoppingCart,
  Heart,
  User,
  Sparkles,
  Tag,
  SlidersHorizontal,
  X,
  Check,
  ChevronDown,
  Gift,
  ShieldCheck,
  Truck,
  LayoutDashboard,
  Monitor,
  Menu,
  Package,
  Layers,
  ChevronRight,
  LogOut,
  Sun,
  Moon,
  Bell,
  Coins,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';

interface StoreHeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  selectedBrand: string;
  setSelectedBrand: (brand: string) => void;
  onOpenCart: () => void;
  onOpenWishlist: () => void;
  onOpenAccount: () => void;
  onOpenOrderTracking?: () => void;
  onOpenNotificationHub?: () => void;
  onOpenClaimModal?: () => void;
  onToggleMobileFilters?: () => void;
  activeSection: string;
  setActiveSection: (sec: string) => void;
  onOpenAdmin?: () => void;
  onOpenPos?: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const StoreHeader: React.FC<StoreHeaderProps> = ({
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  selectedBrand,
  setSelectedBrand,
  onOpenCart,
  onOpenWishlist,
  onOpenAccount,
  onOpenOrderTracking,
  onOpenNotificationHub,
  onOpenClaimModal,
  onToggleMobileFilters,
  activeSection,
  setActiveSection,
  onOpenAdmin,
  onOpenPos,
  isDarkMode,
  onToggleTheme,
}) => {
  const {
    storeCart,
    wishlist,
    activeCustomerUser,
    products,
    appliedCoupon,
    formatCurrency,
    currencyCode,
    setCurrencyCode,
    currentCurrency,
    supportedCurrencies,
    isRatesLoading,
    refreshExchangeRates,
    lastRatesUpdate,
  } = useCommerce();
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);

  const cartItemsCount = storeCart.reduce((sum, item) => sum + item.quantity, 0);
  const wishlistCount = wishlist.length;

  // Search suggestions based on query
  const searchSuggestions = searchQuery.trim()
    ? products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
        )
        .slice(0, 5)
    : [];

  const mainCategories = ['All', 'Electronics', 'Home & Kitchen', 'Food & Beverage', 'Apparel'];
  const allCategories = ['All', ...Array.from(new Set(products.map((p) => p.category)))];

  // Prevent background scrolling when mobile drawer is open
  React.useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  const handleMobileNav = (action: () => void) => {
    action();
    setIsMobileMenuOpen(false);
  };

  return (
    <header className={`sticky top-0 ${isMobileMenuOpen ? 'z-[100]' : 'z-40'} bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-all`}>
      {/* Top Announcement Marquee Bar */}
      <div className="bg-slate-950 text-white text-[11px] font-medium py-1.5 px-4 sm:px-8 flex items-center justify-between gap-4 overflow-hidden border-b border-slate-800">
        <div className="flex items-center gap-2 mx-auto sm:mx-0">
          <Sparkles className="w-3.5 h-3.5 animate-pulse text-amber-400 flex-shrink-0" />
          <span className="truncate text-slate-300">
            Member Special: Create an account & get $20 OFF with <strong className="underline decoration-amber-400 text-amber-300 font-black">WELCOME20</strong> • Guests use <strong className="underline decoration-amber-400 text-amber-300 font-black">GUEST5</strong> for $5 OFF
          </span>
        </div>
        <div className="hidden md:flex items-center gap-3 text-slate-300 text-[10px] flex-shrink-0">
          <span className="flex items-center gap-1">
            <Truck className="w-3 h-3 text-amber-400" /> Free shipping over $75
          </span>
          <span className="opacity-40">•</span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" /> 2-Year Official Warranty
          </span>
          {onOpenAdmin && (
            <>
              <span className="opacity-40">•</span>
              <button
                id="btn-storefront-top-admin"
                onClick={onOpenAdmin}
                className="bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white px-2.5 py-0.5 rounded-full border border-slate-700 text-[10px] font-bold flex items-center gap-1.5 transition-all shadow-xs"
              >
                <LayoutDashboard className="w-3 h-3 text-indigo-400" />
                <span>Super Admin Portal</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Header Bar */}
      <div className="max-w-[1700px] 2xl:max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-10 xl:px-12 py-3">
        <div className="flex items-center justify-between gap-2.5 sm:gap-6">
          {/* Left: Mobile Hamburger & Brand Logo */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Mobile Hamburger Toggle Button */}
            <button
              id="btn-mobile-hamburger-toggle"
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden inline-flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 flex-shrink-0 cursor-pointer shadow-xs"
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Logo & Brand Identity */}
            <div
              onClick={() => {
                setActiveSection('home');
                setSelectedCategory('All');
                setSelectedBrand('All');
                setSearchQuery('');
              }}
              className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group flex-shrink-0"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 p-0.5 shadow-md shadow-indigo-600/20 group-hover:shadow-indigo-600/40 transition-shadow">
                <div className="w-full h-full bg-slate-50 dark:bg-slate-950 rounded-[14px] flex items-center justify-center">
                  <Gift className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform" />
                </div>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm sm:text-base font-black tracking-tight text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    AURA
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                    STORE
                  </span>
                </div>
                <p className="hidden sm:block text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide">Next-Gen Multi-Channel Commerce</p>
              </div>
            </div>
          </div>

          {/* Desktop/Tablet Centered Interactive Search Bar (hidden on mobile, shown on md+) */}
          <div className="hidden md:block flex-1 max-w-xl relative">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 pointer-events-none" />
              <input
                id="input-storefront-search-desktop"
                type="text"
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products, brands, categories..."
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 rounded-2xl py-2.5 pl-10 pr-10 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Instant Search Suggestions Popup */}
            {isSearchFocused && searchSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-850 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Product Suggestions</span>
                  <span>{searchSuggestions.length} items found</span>
                </div>
                {searchSuggestions.map((prod) => (
                  <div
                    key={prod.id}
                    onMouseDown={() => {
                      setSearchQuery(prod.name);
                      setIsSearchFocused(false);
                    }}
                    className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-950 overflow-hidden border border-slate-200 dark:border-slate-800 flex-shrink-0">
                        <img
                          src={prod.images[0]}
                          alt={prod.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-xs">{prod.name}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">{prod.brand} • {prod.category}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      {formatCurrency(prod.variants[0].retailPrice)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Action Icons: Cart, Customer Account Portal & Controls */}
          <div className="flex items-center space-x-1.5 sm:space-x-2.5">
            {/* Notification Bell Icon on Mobile & Tablet */}
            {onOpenNotificationHub && (
              <button
                id="btn-store-mobile-notifications"
                type="button"
                onClick={onOpenNotificationHub}
                className="lg:hidden relative p-2 sm:px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 active:scale-95 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white transition-all flex items-center justify-center shadow-xs min-h-[38px] min-w-[38px] cursor-pointer"
                title="Order Notifications & Live Updates"
                aria-label="Order Notifications & Live Updates"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full ring-2 ring-white dark:ring-slate-800 animate-pulse" />
              </button>
            )}

            {/* Shopping Cart Button - Hidden on mobile/tablet, visible on desktop */}
            <button
              id="btn-store-cart"
              onClick={onOpenCart}
              className="hidden lg:flex relative px-3 sm:px-4 py-2 sm:py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-600/20 items-center gap-1.5 sm:gap-2 text-xs font-bold transition-all min-h-[38px]"
              title="Shopping Cart"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Cart</span>
              {cartItemsCount > 0 && (
                <span className="bg-white text-indigo-600 text-[10px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                  {cartItemsCount}
                </span>
              )}
            </button>

            {/* Customer Account Portal Button - Hidden on mobile/tablet, visible on desktop */}
            <button
              id="btn-store-account"
              onClick={onOpenAccount}
              className="hidden lg:flex p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all items-center gap-2 shadow-xs min-h-[38px]"
              title="Customer Account Portal (Orders, Tracking & Wishlist)"
            >
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {activeCustomerUser ? activeCustomerUser.name.charAt(0) : <User className="w-3.5 h-3.5" />}
              </div>
              <div className="hidden xl:block text-left">
                <p className="text-[11px] font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[110px]">
                  {activeCustomerUser ? activeCustomerUser.name.split(' ')[0] : 'Account'}
                </p>
                <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
                  {activeCustomerUser ? `${activeCustomerUser.tier} Tier` : 'Sign In'}
                </p>
              </div>
            </button>

            {/* Global Currency Switcher in Storefront */}
            <div className="relative">
              <button
                id="btn-storefront-currency-switcher"
                type="button"
                onClick={() => setShowCurrencyMenu(!showCurrencyMenu)}
                className="p-2 sm:px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white transition-all flex items-center gap-1.5 shadow-xs min-h-[38px] cursor-pointer"
                title={`Active Currency: ${currentCurrency.name} (${currentCurrency.code}) - Click to change`}
              >
                <span className="text-sm leading-none">{currentCurrency.flag}</span>
                <span className="text-xs font-bold font-mono">{currentCurrency.code}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 opacity-80" />
              </button>

              {showCurrencyMenu && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 py-2.5 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-3.5 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Store Currency</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">Live rate conversion</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        refreshExchangeRates();
                      }}
                      disabled={isRatesLoading}
                      className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-40 cursor-pointer"
                      title="Refresh live exchange rates"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRatesLoading ? 'animate-spin text-indigo-500' : ''}`} />
                    </button>
                  </div>

                  <div className="py-1 max-h-64 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800/40 custom-scrollbar">
                    {supportedCurrencies.map((curr) => {
                      const isSelected = curr.code === currencyCode;
                      return (
                        <button
                          key={curr.code}
                          type="button"
                          onClick={() => {
                            setCurrencyCode(curr.code);
                            setShowCurrencyMenu(false);
                          }}
                          className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-bold'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">{curr.flag}</span>
                            <div>
                              <span className="font-bold font-mono">{curr.code}</span>
                              <span className="text-slate-400 font-mono text-[10px] ml-1">({curr.symbol})</span>
                              {curr.code === 'SLE' && (
                                <span className="ml-1.5 text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 font-bold px-1.5 py-0.2 rounded-full">
                                  Default
                                </span>
                              )}
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Admin Portal Quick Switcher */}
            {onOpenAdmin && (
              <button
                id="btn-store-admin-portal"
                onClick={onOpenAdmin}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white text-xs font-bold transition-all shadow-xs min-h-[38px]"
                title="Open Omnicore Super Admin Dashboard"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="hidden lg:inline">Admin</span>
              </button>
            )}

            {/* Theme Toggle Button - Hidden on mobile/tablet, visible on desktop */}
            <button
              onClick={onToggleTheme}
              className="hidden lg:flex p-2 sm:px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-amber-400 hover:text-indigo-600 dark:hover:text-amber-300 transition-all items-center justify-center shadow-xs min-h-[38px] min-w-[38px]"
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Dedicated Mobile Search Bar Row (shown on mobile < md) */}
        <div className="md:hidden pt-2.5 relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 pointer-events-none" />
            <input
              id="input-storefront-search-mobile"
              type="text"
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products, brands, categories..."
              className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 rounded-2xl py-2 pl-9 pr-9 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Instant Search Suggestions Popup on Mobile */}
          {isSearchFocused && searchSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in duration-150 max-h-72 overflow-y-auto">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-850 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Suggestions</span>
                <span>{searchSuggestions.length} items</span>
              </div>
              {searchSuggestions.map((prod) => (
                <div
                  key={prod.id}
                  onMouseDown={() => {
                    setSearchQuery(prod.name);
                    setIsSearchFocused(false);
                  }}
                  className="p-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-950 overflow-hidden border border-slate-200 dark:border-slate-800 flex-shrink-0">
                      <img
                        src={prod.images[0]}
                        alt={prod.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[180px]">{prod.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{prod.brand} • {prod.category}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                    {formatCurrency(prod.variants[0].retailPrice)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mobile / Tablet Quick Category Chips Bar */}
        <div className="lg:hidden flex items-center gap-2 overflow-x-auto no-scrollbar pt-2.5 pb-0.5">
          <button
            onClick={() => {
              setActiveSection('home');
              setSelectedCategory('All');
              setSelectedBrand('All');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${
              activeSection === 'home' && selectedCategory === 'All'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Featured</span>
          </button>
          {mainCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat);
                setActiveSection('catalog');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 ${
                selectedCategory === cat && activeSection === 'catalog'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => {
              const el = document.getElementById('store-promotions');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
              } else {
                setActiveSection('home');
                setTimeout(() => {
                  document.getElementById('store-promotions')?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 bg-amber-50 dark:bg-slate-800 border border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 flex items-center gap-1"
          >
            <Tag className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span>Coupons</span>
          </button>
        </div>

        {/* Secondary Category & Quick Navigation Bar (Desktop) */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 hidden lg:flex items-center justify-between gap-3 overflow-x-auto custom-scrollbar">
          {/* Section Navigation Tabs */}
          <div className="flex items-center space-x-1 sm:space-x-2">
            <button
              onClick={() => {
                setActiveSection('home');
                setSelectedCategory('All');
                setSelectedBrand('All');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeSection === 'home' && selectedCategory === 'All' && selectedBrand === 'All'
                  ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30'
                  : 'text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Featured Home
            </button>

            {mainCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  setActiveSection('catalog');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  selectedCategory === cat && activeSection === 'catalog'
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30'
                    : 'text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Quick links to special sections */}
          <div className="flex items-center space-x-3 text-xs text-slate-500 dark:text-slate-400">
            <button
              onClick={() => {
                const el = document.getElementById('store-new-arrivals');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors whitespace-nowrap"
            >
              New Arrivals
            </button>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <button
              onClick={() => {
                const el = document.getElementById('store-best-sellers');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors whitespace-nowrap"
            >
              Best Sellers
            </button>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <button
              onClick={() => {
                const el = document.getElementById('store-promotions');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-semibold flex items-center gap-1 whitespace-nowrap"
            >
              <Tag className="w-3 h-3" />
              <span>Promotions</span>
            </button>
            {onOpenPos && (
              <>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <button
                  id="btn-store-quick-pos"
                  onClick={onOpenPos}
                  className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 flex items-center gap-1 whitespace-nowrap font-medium"
                  title="Open POS Register Terminal"
                >
                  <Monitor className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  <span>POS Terminal</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE HAMBURGER SLIDE-OVER DRAWER OVERLAY */}
      {isMobileMenuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="lg:hidden fixed inset-0 z-[9999] overflow-hidden">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-in fade-in duration-200 z-[9999]"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Slide-over Drawer Panel */}
            <div className="fixed inset-y-0 left-0 max-w-[320px] sm:max-w-sm w-full bg-white dark:bg-slate-950 shadow-2xl z-[10000] flex flex-col border-r border-slate-200 dark:border-slate-800 animate-in slide-in-from-left duration-250">
            {/* Drawer Top Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/80">
              <div
                onClick={() =>
                  handleMobileNav(() => {
                    setActiveSection('home');
                    setSelectedCategory('All');
                    setSelectedBrand('All');
                  })
                }
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 p-0.5 shadow-sm shadow-indigo-600/20">
                  <div className="w-full h-full bg-slate-50 dark:bg-slate-950 rounded-[10px] flex items-center justify-center">
                    <Gift className="w-4 h-4 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-black tracking-tight text-slate-900 dark:text-white">AURA</span>
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                    STORE
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-amber-400 hover:text-indigo-600 transition-colors"
                  aria-label="Toggle theme"
                  title="Toggle Theme"
                >
                  {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                  aria-label="Close navigation menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Drawer Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {/* User Account Card */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-md shadow-indigo-600/20">
                    {activeCustomerUser ? activeCustomerUser.name.charAt(0) : <User className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                      {activeCustomerUser ? activeCustomerUser.name : 'Welcome, Guest!'}
                    </p>
                    <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                      {activeCustomerUser ? `${activeCustomerUser.tier} • ${activeCustomerUser.loyaltyPoints} pts` : 'Sign in for rewards'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleMobileNav(onOpenAccount)}
                  className="px-3 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-[11px] font-bold transition-all"
                >
                  {activeCustomerUser ? 'Manage' : 'Sign In'}
                </button>
              </div>

              {/* Quick Navigation Tiles */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleMobileNav(() => {
                      setActiveSection('home');
                      setSelectedCategory('All');
                      setSelectedBrand('All');
                    })
                  }
                  className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                    activeSection === 'home'
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <Gift className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                  <span className="text-xs font-bold">Featured Home</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleMobileNav(() => {
                      setActiveSection('catalog');
                    })
                  }
                  className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                    activeSection === 'catalog'
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                  <span className="text-xs font-bold">All Catalog</span>
                </button>
              </div>

              {/* Quick Action Buttons Grid */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleMobileNav(onOpenCart)}
                  className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between text-left hover:border-indigo-500/40 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-200">Cart</span>
                  </div>
                  {cartItemsCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                      {cartItemsCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleMobileNav(onOpenWishlist)}
                  className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between text-left hover:border-indigo-500/40 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-rose-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-200">Wishlist</span>
                  </div>
                  {wishlistCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                      {wishlistCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Browse Categories Accordion / List */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                  <span>Shop By Category</span>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">{products.length} Products</span>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs">
                  {allCategories.map((cat) => {
                    const count = cat === 'All' ? products.length : products.filter((p) => p.category === cat).length;
                    const isSelected = selectedCategory === cat && activeSection === 'catalog';

                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() =>
                          handleMobileNav(() => {
                            setSelectedCategory(cat);
                            setActiveSection('catalog');
                          })
                        }
                        className={`w-full p-3 flex items-center justify-between text-xs font-bold text-left transition-colors ${
                          isSelected
                            ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-900 dark:text-slate-200'
                        }`}
                      >
                        <span className="truncate pr-2">{cat === 'All' ? 'All Products' : cat}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex-shrink-0 font-medium">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Special Shortcuts & Deals */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">Highlights & Deals</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleMobileNav(() => {
                        const el = document.getElementById('store-promotions');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                        else {
                          setActiveSection('home');
                          setTimeout(() => document.getElementById('store-promotions')?.scrollIntoView({ behavior: 'smooth' }), 100);
                        }
                      })
                    }
                    className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 rounded-xl text-left"
                  >
                    <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mb-1" />
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Coupons & Deals</p>
                    <p className="text-[9px] text-amber-600/80 dark:text-amber-400/80">Active discounts</p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleMobileNav(() => {
                        const el = document.getElementById('store-new-arrivals');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                        else {
                          setActiveSection('home');
                          setTimeout(() => document.getElementById('store-new-arrivals')?.scrollIntoView({ behavior: 'smooth' }), 100);
                        }
                      })
                    }
                    className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-left"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 mb-1" />
                    <p className="text-xs font-bold text-slate-900 dark:text-white">New Arrivals</p>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400">Latest releases</p>
                  </button>
                </div>
              </div>

              {/* Order Services */}
              {(onOpenOrderTracking || onOpenNotificationHub) && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">Customer Care</p>
                  <div className="space-y-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-1.5">
                    {onOpenOrderTracking && (
                      <button
                        type="button"
                        onClick={() => handleMobileNav(onOpenOrderTracking)}
                        className="w-full p-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-left transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>Track Live Order</span>
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    )}
                    {onOpenNotificationHub && (
                      <button
                        type="button"
                        onClick={() => handleMobileNav(onOpenNotificationHub)}
                        className="w-full p-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-left transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>Order Status Notifications</span>
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Currency Selector (Mobile Drawer) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Currency & Rates</p>
                  <button
                    type="button"
                    onClick={refreshExchangeRates}
                    disabled={isRatesLoading}
                    className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRatesLoading ? 'animate-spin' : ''}`} />
                    <span>Live FX</span>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {supportedCurrencies.map((curr) => {
                    const isSelected = curr.code === currencyCode;
                    return (
                      <button
                        key={curr.code}
                        type="button"
                        onClick={() => setCurrencyCode(curr.code)}
                        className={`p-2 rounded-xl text-center border text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-300 font-bold shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="text-sm">{curr.flag}</div>
                        <div className="font-mono text-[11px] font-bold">{curr.code}</div>
                        <div className="text-[10px] text-slate-400">{curr.symbol}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Enterprise & Admin Switchers */}
              {(onOpenAdmin || onOpenPos) && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Enterprise Tools</p>
                  <div className="flex flex-col gap-1.5">
                    {onOpenAdmin && (
                      <button
                        type="button"
                        onClick={() => handleMobileNav(onOpenAdmin)}
                        className="w-full py-2 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2">
                          <LayoutDashboard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>Super Admin Portal</span>
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    )}
                    {onOpenPos && (
                      <button
                        type="button"
                        onClick={() => handleMobileNav(onOpenPos)}
                        className="w-full py-2 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2">
                          <Monitor className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>POS Cashier Register</span>
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Bottom Safe Area Padding */}
              <div className="h-10" />
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
};

