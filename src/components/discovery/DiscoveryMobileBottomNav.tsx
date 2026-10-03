import React, { useEffect, useState } from 'react';
import { Compass, Search, Heart, FileText } from 'lucide-react';
import { authClient } from '../../services/authClient';

export interface DiscoveryMobileBottomNavProps {
  activeTab?: 'discover' | 'search' | 'saved' | 'requests';
  onNavigate?: (destination: 'discover' | 'search' | 'saved' | 'requests') => void;
  className?: string;
}

export const DiscoveryMobileBottomNav: React.FC<DiscoveryMobileBottomNavProps> = ({
  activeTab,
  onNavigate,
  className = '',
}) => {
  const [unreadCount, setUnreadCount] = useState(0);

  // Compute active tab from current URL if not explicitly provided
  const currentTab = activeTab || (() => {
    if (typeof window === 'undefined') return 'discover';
    const path = window.location.pathname;
    if (path.startsWith('/discover/search')) return 'search';
    if (path.startsWith('/discover/saved')) return 'saved';
    if (path.startsWith('/discover/my-requests') || path.startsWith('/discover/my-inquiries')) return 'requests';
    return 'discover';
  })();

  useEffect(() => {
    if (!authClient.getToken()) return;
    let isMounted = true;
    void (async () => {
      try {
        const { discoveryApi } = await import('../../services/discoveryApi');
        const notifs = await discoveryApi.getServiceRequestNotifications(false, 20);
        if (isMounted) {
          const unread = notifs.filter((n) => !n.read_at).length;
          setUnreadCount(unread);
        }
      } catch {
        // Notification count is non-blocking supplemental state
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleDestinationClick = (dest: 'discover' | 'search' | 'saved' | 'requests') => {
    if (onNavigate) {
      onNavigate(dest);
      return;
    }

    const token = authClient.getToken();
    switch (dest) {
      case 'discover':
        window.location.assign('/discover');
        break;
      case 'search':
        window.location.assign('/discover/search');
        break;
      case 'saved':
        window.location.assign(token ? '/discover/saved' : '/login?redirect=' + encodeURIComponent('/discover/saved'));
        break;
      case 'requests':
        window.location.assign(token ? '/discover/my-requests' : '/login?redirect=' + encodeURIComponent('/discover/my-requests'));
        break;
    }
  };

  return (
    <nav
      id="discovery-mobile-bottom-nav"
      aria-label="Discovery mobile navigation"
      className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200/90 dark:border-slate-800 px-2 sm:px-4 shadow-2xl transition-transform ${className}`}
      style={{ paddingBottom: 'max(0.4rem, env(safe-area-inset-bottom))' }}
    >
      <div className="grid grid-cols-4 items-center h-15 sm:h-16 max-w-md mx-auto">
        {/* 1. Discover Tab */}
        <button
          type="button"
          onClick={() => handleDestinationClick('discover')}
          className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition-all active:scale-95 ${
            currentTab === 'discover'
              ? 'text-indigo-600 dark:text-indigo-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          aria-label="Discovery Home"
          aria-current={currentTab === 'discover' ? 'page' : undefined}
        >
          <div className="relative">
            <Compass className={`w-5 h-5 transition-transform ${currentTab === 'discover' ? 'scale-110' : ''}`} />
            {currentTab === 'discover' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400" />
            )}
          </div>
          <span className="text-[10px] sm:text-[11px] mt-1 tracking-tight leading-none">Discover</span>
        </button>

        {/* 2. Search Tab */}
        <button
          type="button"
          onClick={() => handleDestinationClick('search')}
          className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition-all active:scale-95 ${
            currentTab === 'search'
              ? 'text-indigo-600 dark:text-indigo-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          aria-label="Search Catalog"
          aria-current={currentTab === 'search' ? 'page' : undefined}
        >
          <div className="relative">
            <Search className={`w-5 h-5 transition-transform ${currentTab === 'search' ? 'scale-110' : ''}`} />
            {currentTab === 'search' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400" />
            )}
          </div>
          <span className="text-[10px] sm:text-[11px] mt-1 tracking-tight leading-none">Search</span>
        </button>

        {/* 3. Saved Tab */}
        <button
          type="button"
          onClick={() => handleDestinationClick('saved')}
          className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition-all active:scale-95 ${
            currentTab === 'saved'
              ? 'text-indigo-600 dark:text-indigo-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          aria-label="Saved Businesses"
          aria-current={currentTab === 'saved' ? 'page' : undefined}
        >
          <div className="relative">
            <Heart className={`w-5 h-5 transition-transform ${currentTab === 'saved' ? 'scale-110 text-rose-500 fill-rose-500' : ''}`} />
            {currentTab === 'saved' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400" />
            )}
          </div>
          <span className="text-[10px] sm:text-[11px] mt-1 tracking-tight leading-none">Saved</span>
        </button>

        {/* 4. Requests & Activity Tab */}
        <button
          type="button"
          onClick={() => handleDestinationClick('requests')}
          className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition-all active:scale-95 ${
            currentTab === 'requests'
              ? 'text-indigo-600 dark:text-indigo-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          aria-label="Service Requests and Activity"
          aria-current={currentTab === 'requests' ? 'page' : undefined}
        >
          <div className="relative">
            <FileText className={`w-5 h-5 transition-transform ${currentTab === 'requests' ? 'scale-110' : ''}`} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-[9px] leading-4 text-white text-center font-black ring-2 ring-white dark:ring-slate-900">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
            {currentTab === 'requests' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400" />
            )}
          </div>
          <span className="text-[10px] sm:text-[11px] mt-1 tracking-tight leading-none">Requests</span>
        </button>
      </div>
    </nav>
  );
};
