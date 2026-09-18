import React from 'react';
import {
  ShoppingBag,
  Utensils,
  Smartphone,
  Shirt,
  Sparkles,
  Wrench,
  HeartPulse,
  Home,
  Car,
  Layers,
  ChevronRight,
  BookOpen,
  Coffee,
} from 'lucide-react';
import type { DiscoveryCategory } from '../../types/discovery';

interface DiscoveryCategoryExplorerProps {
  categories: DiscoveryCategory[];
  selectedCategoryId?: string;
  onSelectCategory: (categoryId: string) => void;
  isLoading?: boolean;
  className?: string;
}

// Map slugs or names to appropriate Lucide icons
const getCategoryIcon = (slugOrName: string) => {
  const s = slugOrName.toLowerCase();
  if (s.includes('food') || s.includes('restaurant') || s.includes('dining')) return Utensils;
  if (s.includes('tech') || s.includes('electronic') || s.includes('phone')) return Smartphone;
  if (s.includes('fashion') || s.includes('cloth') || s.includes('apparel')) return Shirt;
  if (s.includes('health') || s.includes('pharmacy') || s.includes('medical')) return HeartPulse;
  if (s.includes('beauty') || s.includes('salon') || s.includes('barber')) return Sparkles;
  if (s.includes('home') || s.includes('furniture') || s.includes('garden')) return Home;
  if (s.includes('auto') || s.includes('car') || s.includes('mechanic')) return Car;
  if (s.includes('repair') || s.includes('plumb') || s.includes('service')) return Wrench;
  if (s.includes('grocery') || s.includes('market') || s.includes('supermarket')) return ShoppingBag;
  if (s.includes('cafe') || s.includes('drink') || s.includes('bakery')) return Coffee;
  return Layers;
};

export const DiscoveryCategoryExplorer: React.FC<DiscoveryCategoryExplorerProps> = ({
  categories,
  selectedCategoryId,
  onSelectCategory,
  isLoading = false,
  className = '',
}) => {
  if (isLoading) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="h-5 w-36 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
          <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!categories || categories.length === 0) {
    return null;
  }

  return (
    <section className={`space-y-4 ${className}`} aria-labelledby="category-explorer-heading">
      <div className="flex items-center justify-between">
        <div>
          <h2 id="category-explorer-heading" className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
            Explore by Category
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Browse local merchants and services categorized for fast discovery
          </p>
        </div>

        {selectedCategoryId && (
          <button
            type="button"
            onClick={() => onSelectCategory('')}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Clear category
          </button>
        )}
      </div>

      {/* Grid of Category cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {categories.map((cat) => {
          const Icon = getCategoryIcon(cat.slug || cat.name);
          const isSelected = selectedCategoryId === cat.id;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={`group relative p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-800 dark:text-slate-200 shadow-2xs hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/40'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <ChevronRight
                  className={`w-4 h-4 transition-transform group-hover:translate-x-0.5 ${
                    isSelected ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
              </div>

              <div>
                <h3 className="font-bold text-xs sm:text-sm truncate">
                  {cat.name}
                </h3>
                {cat.item_count !== undefined && (
                  <p
                    className={`text-[11px] font-medium mt-0.5 ${
                      isSelected ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {cat.item_count} listings
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
