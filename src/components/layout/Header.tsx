import React, { useState } from 'react';
import {
  Store,
  Monitor,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  MapPin,
  UserCheck,
  RefreshCw,
  Search,
  Layers,
  ChevronDown,
  Menu,
  X,
  Sun,
  Moon,
  Coins,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { Role } from '../../types';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSearch: () => void;
  onToggleMobileSidebar?: () => void;
  isMobileSidebarOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenSearch,
  onToggleMobileSidebar,
  isMobileSidebarOpen = false,
}) => {
  const {
    currentRole,
    setCurrentRole,
    currentLocationId,
    setCurrentLocationId,
    currentLocation,
    locations,
    notifications,
    markNotificationAsRead,
    clearAllNotifications,
    resetToDefaultData,
    isDarkMode,
    toggleTheme,
    currencyCode,
    setCurrencyCode,
    currentCurrency,
    supportedCurrencies,
    refreshExchangeRates,
    isRatesLoading,
    lastRatesUpdate,
  } = useCommerce();

  const [showNotifs, setShowNotifs] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showLocMenu, setShowLocMenu] = useState(false);
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const rolesList: Role[] = [
    'Super Admin',
    'Business Owner',
    'Inventory Manager',
    'Warehouse Manager',
    'Cashier',
    'Store Manager',
    'Accountant',
    'E-commerce Customer',
  ];

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 px-4 sm:px-6 lg:px-8 flex items-center justify-between shadow-xs flex-shrink-0 transition-colors">
      {/* Left Menu Toggle + Search Bar */}
      <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
        {/* Mobile & Tablet Drawer Menu Toggle */}
        <button
          id="btn-mobile-sidebar-toggle"
          type="button"
          onClick={onToggleMobileSidebar}
          className="lg:hidden inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-700 dark:text-slate-200 hover:text-slate-900 border border-slate-200 dark:border-slate-700 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 flex-shrink-0 cursor-pointer"
          title={isMobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-label={isMobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          {isMobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        <div className="flex items-center space-x-2 sm:space-x-3 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-150 focus-within:bg-white dark:focus-within:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full w-32 xs:w-44 sm:w-72 md:w-80 lg:w-96 border border-transparent dark:border-slate-700">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search SKU..."
            onClick={onOpenSearch}
            className="bg-transparent border-none text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none w-full min-w-0"
          />
          <kbd className="hidden sm:inline-block text-[10px] bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-400 dark:text-slate-300 border border-slate-200 dark:border-slate-600 font-mono shadow-xs flex-shrink-0">
            ⌘K
          </kbd>
        </div>

        {/* Global Quick Launch buttons (Desktop) */}
        <div className="hidden lg:flex items-center space-x-2 pl-2">
          <button
            id="btn-quick-pos"
            onClick={() => {
              setActiveTab('pos');
              if (currentRole === 'E-commerce Customer') setCurrentRole('Cashier');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'pos'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>POS Register</span>
          </button>
          <button
            id="btn-quick-storefront"
            onClick={() => setActiveTab('storefront')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 shadow-xs"
            title="Switch to public customer storefront"
          >
            <Store className="w-3.5 h-3.5 text-sky-600" />
            <span>View Live Store</span>
          </button>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-4 flex-shrink-0">
        {/* Branch / Warehouse Selector Badge */}
        <div className="relative">
          <button
            id="btn-location-switcher"
            onClick={() => {
              setShowLocMenu(!showLocMenu);
              setShowRoleMenu(false);
              setShowNotifs(false);
              setShowCurrencyMenu(false);
            }}
            className="flex items-center space-x-1.5 sm:space-x-2 bg-blue-50 hover:bg-blue-100/80 text-blue-700 px-2.5 sm:px-3 py-1.5 rounded-lg border border-blue-100 text-xs sm:text-sm font-medium transition-colors"
            title="Switch Operating Branch or Warehouse"
          >
            <MapPin className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            <span className="font-semibold truncate max-w-[70px] xs:max-w-[110px] sm:max-w-[150px] md:max-w-none">
              {currentLocation.name}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-blue-500 opacity-70 flex-shrink-0" />
          </button>

          {showLocMenu && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active Location Context</p>
                <p className="text-xs text-slate-500">Affects POS register & local warehouse views</p>
              </div>
              <div className="py-1 max-h-64 overflow-y-auto">
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => {
                      setCurrentLocationId(loc.id);
                      setShowLocMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                      currentLocationId === loc.id ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span>{loc.name}</span>
                        {loc.isPosEnabled && (
                          <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">POS</span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500">{loc.type}</span>
                    </div>
                    {currentLocationId === loc.id && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Role Persona Switcher */}
        <div className="relative">
          <button
            id="btn-role-switcher"
            onClick={() => {
              setShowRoleMenu(!showRoleMenu);
              setShowLocMenu(false);
              setShowNotifs(false);
              setShowCurrencyMenu(false);
            }}
            className="flex items-center space-x-1 sm:space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 transition-colors"
            title="Switch User Role & Permissions"
          >
            <UserCheck className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <span className="hidden md:inline truncate max-w-[120px]">{currentRole}</span>
            <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Switch Persona Role</p>
                <p className="text-[11px] text-slate-400">Test different permission perspectives</p>
              </div>
              <div className="py-1 max-h-64 overflow-y-auto">
                {rolesList.map((role) => (
                  <button
                    key={role}
                    onClick={() => {
                      setCurrentRole(role);
                      setShowRoleMenu(false);
                      if (role === 'E-commerce Customer') {
                        setActiveTab('storefront');
                      } else if (role === 'Cashier') {
                        setActiveTab('pos');
                      }
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                      currentRole === role ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700'
                    }`}
                  >
                    <span>{role}</span>
                    {currentRole === role && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Global Currency Switcher */}
        <div className="relative">
          <button
            id="btn-currency-switcher"
            type="button"
            onClick={() => {
              setShowCurrencyMenu(!showCurrencyMenu);
              setShowRoleMenu(false);
              setShowLocMenu(false);
              setShowNotifs(false);
            }}
            className="flex items-center space-x-1 sm:space-x-1.5 bg-emerald-50 hover:bg-emerald-100/80 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 sm:px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 text-xs font-semibold transition-all shadow-xs cursor-pointer"
            title={`Active Currency: ${currentCurrency.name} (${currentCurrency.code} ${currentCurrency.symbol}) - Click to switch or view live FX rates`}
          >
            <span className="text-sm leading-none">{currentCurrency.flag}</span>
            <span className="font-bold font-mono tracking-tight">{currentCurrency.code}</span>
            <span className="text-[11px] opacity-80 font-mono hidden xs:inline">({currentCurrency.symbol})</span>
            <ChevronDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400 opacity-80 flex-shrink-0" />
          </button>

          {showCurrencyMenu && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 py-2.5 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3.5 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Global Currency & FX
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Live exchange rate conversion across POS, Storefront & Ledger
                  </p>
                </div>
                <button
                  type="button"
                  id="btn-refresh-exchange-rates"
                  onClick={(e) => {
                    e.stopPropagation();
                    refreshExchangeRates();
                  }}
                  disabled={isRatesLoading}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-40 cursor-pointer"
                  title="Refresh live exchange rates"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRatesLoading ? 'animate-spin text-emerald-500' : ''}`} />
                </button>
              </div>

              {lastRatesUpdate && (
                <div className="px-3.5 py-1.5 bg-slate-50 dark:bg-slate-850/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Live FX Rates
                  </span>
                  <span>Updated: {lastRatesUpdate}</span>
                </div>
              )}

              <div className="py-1 max-h-72 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800/40 custom-scrollbar">
                {supportedCurrencies.map((curr) => {
                  const isSelected = curr.code === currencyCode;
                  return (
                    <button
                      key={curr.code}
                      id={`btn-currency-${curr.code.toLowerCase()}`}
                      type="button"
                      onClick={() => {
                        setCurrencyCode(curr.code);
                        setShowCurrencyMenu(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 font-bold'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-lg flex-shrink-0">{curr.flag}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold font-mono text-slate-900 dark:text-white">{curr.code}</span>
                            <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">({curr.symbol})</span>
                            {curr.code === 'SLE' && (
                              <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.2 rounded-full">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{curr.name}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 text-right">
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {curr.code === 'USD' ? '1.00 USD' : `1 USD ≈ ${curr.rate >= 10 ? curr.rate.toFixed(1) : curr.rate.toFixed(2)} ${curr.code}`}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Global Theme Toggle Button */}
        <button
          id="btn-theme-toggle"
          onClick={toggleTheme}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-transparent dark:border-slate-800 cursor-pointer flex items-center justify-center"
          title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDarkMode ? <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />}
        </button>

        {/* Notification Bell */}
        <div className="relative">
          <button
            id="btn-notifications-toggle"
            onClick={() => {
              setShowNotifs(!showNotifs);
              setShowRoleMenu(false);
              setShowLocMenu(false);
              setShowCurrencyMenu(false);
            }}
            className="relative p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Notifications & Alerts"
          >
            <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute right-0 mt-2 w-72 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">System Alerts & Notifications</h4>
                  <p className="text-[11px] text-slate-500">{unreadCount} unread alerts</p>
                </div>
                {notifications.length > 0 && (
                  <button
                    onClick={clearAllNotifications}
                    className="text-[11px] text-blue-600 hover:underline transition-colors font-medium"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">No notifications right now</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        markNotificationAsRead(n.id);
                        if (n.linkTab) {
                          setActiveTab(n.linkTab);
                          setShowNotifs(false);
                        }
                      }}
                      className={`p-3 text-xs cursor-pointer hover:bg-slate-50 transition-colors flex items-start space-x-2.5 ${
                        n.isRead ? 'opacity-70 bg-white' : 'bg-blue-50/40'
                      }`}
                    >
                      <div className="mt-0.5">
                        {n.type === 'danger' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                        {n.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                        {n.type === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {n.type === 'info' && <Info className="w-4 h-4 text-blue-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 truncate">{n.title}</span>
                          <span className="text-[10px] text-slate-400 flex-shrink-0 ml-1">
                            {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px] mt-0.5 leading-snug">{n.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Reset / Demo seed helper */}
        <button
          id="btn-reset-demo"
          onClick={() => {
            if (confirm('Reset system data to initial baseline seed data?')) {
              resetToDefaultData();
            }
          }}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Reset Seed Data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
