import React, { useState, useEffect } from 'react';
import {
  Compass,
  Store,
  Package,
  Wrench,
  LogIn,
  Menu,
  X,
  MapPin,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Heart,
  FileText,
  MessageSquare,
  UserCheck,
  ClipboardPlus,
  ChevronDown,
  Star,
  Users,
} from 'lucide-react';
import { DiscoveryLocationSelector } from './DiscoveryLocationSelector';
import type { DiscoverySearchType } from '../../types/discovery';
import { authClient } from '../../services/authClient';

interface DiscoveryHeaderProps {
  selectedCity?: string;
  selectedRadiusKm?: number;
  latitude?: number | null;
  longitude?: number | null;
  onLocationChange: (loc: {
    city?: string;
    lat?: number | null;
    lng?: number | null;
    radiusKm?: number;
  }) => void;
  activeNav?: string;
  onNavigateSection?: (section: 'all' | 'businesses' | 'products' | 'services') => void;
  className?: string;
  transparent?: boolean;
}

export const DiscoveryHeader: React.FC<DiscoveryHeaderProps> = ({
  selectedCity,
  selectedRadiusKm = 25,
  latitude,
  longitude,
  onLocationChange,
  activeNav = 'all',
  onNavigateSection,
  className = '',
  transparent = false,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems: Array<{ id: 'all' | 'businesses' | 'products' | 'services'; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'all', label: 'Discover', icon: Compass },
    { id: 'businesses', label: 'Businesses', icon: Store },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'services', label: 'Services', icon: Wrench },
  ];

  const handleNavClick = (id: 'all' | 'businesses' | 'products' | 'services') => {
    setMobileMenuOpen(false);
    if (onNavigateSection) {
      onNavigateSection(id);
    } else {
      const sp = new URLSearchParams(window.location.search);
      if (id === 'all') sp.delete('type');
      else sp.set('type', id);
      const newPath = `/discover/search${sp.toString() ? `?${sp.toString()}` : ''}`;
      window.history.pushState({}, '', newPath);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const workspaceHref = (path: string) => authClient.getToken() ? path : '/login?redirect=' + encodeURIComponent(path);

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 ${
        transparent
          ? isScrolled
            ? 'bg-slate-950/90 backdrop-blur-md shadow-2xl border-b border-slate-900'
            : 'bg-transparent border-b border-transparent'
          : isScrolled
          ? 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xs border-b border-slate-200/80 dark:border-slate-800'
          : 'bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/80'
      } ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-20 flex items-center justify-between gap-4">
          {/* Left: Logo & Browse Dropdown */}
          <div className="flex items-center gap-6">
            <a
              href="/discover"
              className="flex items-center gap-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-xl"
              aria-label="superpages Home"
            >
              <svg className="w-8 h-8 shrink-0 select-none group-hover:scale-105 transition-transform" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L4 5V11C4 16.52 7.42 21.64 12 23C16.58 21.64 20 16.52 20 11V5L12 2Z" fill="#f97316" stroke="#f59e0b" strokeWidth="2"/>
                <text x="12" y="15.5" fill="white" fontSize="11" fontWeight="900" textAnchor="middle">s</text>
              </svg>
              <div className="flex flex-col">
                <div className="flex items-baseline">
                  <span className="font-sans font-black text-white tracking-tight text-lg leading-none">
                    AbaCha
                  </span>
                  <sup className="text-[9px] font-bold text-slate-400 align-super leading-none ml-0.5">®</sup>
                </div>
                <span className="text-[10px] font-semibold tracking-widest text-indigo-400 uppercase mt-1 leading-none">
                  Discovery
                </span>
              </div>
            </a>

            {/* Browse Dropdown Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBrowseOpen(!browseOpen)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold tracking-wide uppercase transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <span>Browse</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-300 transition-transform duration-200" style={{ transform: browseOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
              </button>
              
              {browseOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBrowseOpen(false)} />
                  <div className="absolute left-0 mt-2.5 w-60 rounded-xl bg-white border border-slate-200 shadow-2xl z-50 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    <a
                      href="/discover/search?type=businesses"
                      onClick={() => setBrowseOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-[#0054a6] transition-colors"
                    >
                      <Star className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>Popular Categories</span>
                    </a>
                    <a
                      href="/discover"
                      onClick={() => setBrowseOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-[#0054a6] transition-colors"
                    >
                      <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                      <span>State Directory</span>
                    </a>
                    <a
                      href="/discover/search?type=services"
                      onClick={() => setBrowseOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-[#0054a6] transition-colors"
                    >
                      <Users className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Find People</span>
                    </a>
                    
                    <div className="h-px bg-slate-100 my-1" />
                    
                    <a
                      href={workspaceHref("/discover/request-service")}
                      onClick={() => setBrowseOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-[#0054a6] transition-colors"
                    >
                      <ClipboardPlus className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span>Request Service</span>
                    </a>
                    <a
                      href={workspaceHref("/discover/saved")}
                      onClick={() => setBrowseOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-[#0054a6] transition-colors"
                    >
                      <Heart className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>Saved Businesses</span>
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: Join • Sign In / Profile Navigation */}
          <div className="hidden md:flex items-center gap-3 font-bold text-sm text-white">
            <a
              href="/business/signup"
              className="hover:text-amber-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded px-1"
            >
              Join
            </a>
            <span className="text-white/40 font-normal select-none">•</span>
            <a
              href="/login"
              className="hover:text-amber-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded px-1"
            >
              Sign In
            </a>
          </div>

          {/* Mobile menu toggle */}
          <div className="md:hidden flex items-center">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-white hover:bg-white/10 transition-colors focus:outline-none"
              aria-label="Toggle Navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-20 bottom-0 z-30 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-slate-950 border-b border-slate-900 shadow-2xl p-4 space-y-4 text-white">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2">
              Browse Discovery
            </span>
            <div className="grid grid-cols-1 gap-2">
              <a
                href="/discover/search?type=businesses"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 p-3 rounded-xl text-xs font-bold bg-slate-900 border border-slate-800"
              >
                <Star className="w-4 h-4 text-amber-500" />
                <span>Popular Categories</span>
              </a>
              <a
                href="/discover"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 p-3 rounded-xl text-xs font-bold bg-slate-900 border border-slate-800"
              >
                <FileText className="w-4 h-4 text-blue-500" />
                <span>State Directory</span>
              </a>
              <a
                href="/discover/search?type=services"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 p-3 rounded-xl text-xs font-bold bg-slate-900 border border-slate-800"
              >
                <Users className="w-4 h-4 text-emerald-500" />
                <span>Find People</span>
              </a>
            </div>

            <div className="pt-3 border-t border-slate-900">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2">My Shortcuts</span>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <a href={workspaceHref("/discover/request-service")} onClick={() => setMobileMenuOpen(false)} className="col-span-2 rounded-xl border border-indigo-900 bg-indigo-950/40 p-3 text-xs font-bold flex items-center gap-2"><ClipboardPlus className="w-4 h-4 text-indigo-400" />Request Service</a>
                <a href={workspaceHref("/discover/saved")} onClick={() => setMobileMenuOpen(false)} className="rounded-xl bg-slate-900 border border-slate-800 p-3 text-xs font-bold flex items-center gap-2"><Heart className="w-4 h-4 text-rose-500" />Saved</a>
                <a href={workspaceHref("/discover/my-requests")} onClick={() => setMobileMenuOpen(false)} className="rounded-xl bg-slate-900 border border-slate-800 p-3 text-xs font-bold flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-400" />Requests</a>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-900 flex flex-col gap-2">
              <a
                href="/login"
                className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4 text-slate-400" />
                <span>Sign In</span>
              </a>
              <a
                href="/business/signup"
                className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black flex items-center justify-center gap-2"
              >
                <Store className="w-4 h-4" />
                <span>Get Listed</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
