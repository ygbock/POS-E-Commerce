import React from 'react';
import { SlidersHorizontal, Store, Package, Wrench } from 'lucide-react';
import type { DiscoverySearchType, DiscoverySearchCounts } from '../../types/discovery';

interface DiscoveryTabsProps {
  activeType: DiscoverySearchType;
  onChange: (type: DiscoverySearchType) => void;
  counts?: DiscoverySearchCounts;
  className?: string;
}

export const DiscoveryTabs: React.FC<DiscoveryTabsProps> = ({
  activeType,
  onChange,
  counts,
  className = '',
}) => {
  const tabs: Array<{ id: DiscoverySearchType; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }> = [
    {
      id: 'all',
      label: 'All',
      icon: SlidersHorizontal,
      count: counts ? counts.businesses + counts.products + counts.services : undefined,
    },
    {
      id: 'businesses',
      label: 'Businesses',
      icon: Store,
      count: counts?.businesses,
    },
    {
      id: 'products',
      label: 'Products',
      icon: Package,
      count: counts?.products,
    },
    {
      id: 'services',
      label: 'Services',
      icon: Wrench,
      count: counts?.services,
    },
  ];

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (index + 1) % tabs.length;
      onChange(tabs[nextIndex].id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (index - 1 + tabs.length) % tabs.length;
      onChange(tabs[prevIndex].id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Discovery categories"
      className={`flex items-center gap-1 sm:gap-2 p-1 rounded-2xl bg-slate-100/80 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-x-auto no-scrollbar ${className}`}
    >
      {tabs.map((tab, idx) => {
        const Icon = tab.icon;
        const isSelected = activeType === tab.id;

        return (
          <button
            key={tab.id}
            role="tab"
            id={`discovery-tab-${tab.id}`}
            aria-selected={isSelected}
            aria-controls={`discovery-tabpanel-${tab.id}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isSelected
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/40 dark:hover:bg-slate-800/40'
            }`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} aria-hidden="true" />
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-md font-semibold ${
                  isSelected
                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    : 'bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
