import React from 'react';
import {
  X,
  SlidersHorizontal,
  RotateCcw,
  Check,
  Star,
  Flame,
  Layers,
  Award,
  Sparkles,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';

interface MobileFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  selectedCategory: string;
  setSelectedCategory?: (cat: string) => void;
  onSelectCategory?: (cat: string) => void;
  allBrands: string[];
  selectedBrand: string;
  setSelectedBrand?: (brand: string) => void;
  onSelectBrand?: (brand: string) => void;
  minPrice?: number;
  maxPrice: number;
  onMinPriceChange?: (price: number) => void;
  setMaxPrice?: (price: number) => void;
  onMaxPriceChange?: (price: number) => void;
  inStockOnly: boolean;
  setInStockOnly?: (val: boolean) => void;
  onInStockChange?: (val: boolean) => void;
  onSaleOnly: boolean;
  setOnSaleOnly?: (val: boolean) => void;
  onOnSaleChange?: (val: boolean) => void;
  minRating: number;
  setMinRating?: (rating: number) => void;
  onMinRatingChange?: (rating: number) => void;
  onClearAll?: () => void;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
  totalProductsCount?: number;
  totalFilteredCount?: number;
  matchedCount?: number;
}

export const MobileFilterDrawer: React.FC<MobileFilterDrawerProps> = ({
  isOpen,
  onClose,
  categories,
  selectedCategory,
  setSelectedCategory,
  onSelectCategory,
  allBrands,
  selectedBrand,
  setSelectedBrand,
  onSelectBrand,
  maxPrice,
  setMaxPrice,
  onMaxPriceChange,
  inStockOnly,
  setInStockOnly,
  onInStockChange,
  onSaleOnly,
  setOnSaleOnly,
  onOnSaleChange,
  minRating,
  setMinRating,
  onMinRatingChange,
  onClearAll,
  onClearFilters,
  totalFilteredCount,
  matchedCount,
}) => {
  const { products } = useCommerce();

  if (!isOpen) return null;

  const handleCategorySelect = (cat: string) => {
    if (onSelectCategory) onSelectCategory(cat);
    else if (setSelectedCategory) setSelectedCategory(cat);
  };

  const handleBrandSelect = (brand: string) => {
    if (onSelectBrand) onSelectBrand(brand);
    else if (setSelectedBrand) setSelectedBrand(brand);
  };

  const handleMaxPriceChange = (val: number) => {
    if (onMaxPriceChange) onMaxPriceChange(val);
    else if (setMaxPrice) setMaxPrice(val);
  };

  const handleInStockToggle = (val: boolean) => {
    if (onInStockChange) onInStockChange(val);
    else if (setInStockOnly) setInStockOnly(val);
  };

  const handleOnSaleToggle = (val: boolean) => {
    if (onOnSaleChange) onOnSaleChange(val);
    else if (setOnSaleOnly) setOnSaleOnly(val);
  };

  const handleRatingChange = (val: number) => {
    if (onMinRatingChange) onMinRatingChange(val);
    else if (setMinRating) setMinRating(val);
  };

  const handleReset = () => {
    if (onClearFilters) onClearFilters();
    else if (onClearAll) onClearAll();
  };

  const displayCount = matchedCount !== undefined ? matchedCount : (totalFilteredCount !== undefined ? totalFilteredCount : products.length);

  return (
    <div 
      className="fixed inset-0 z-50 lg:hidden bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl text-slate-900 dark:text-white animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Filter Products</h3>
              <p className="text-[10px] text-slate-600 dark:text-slate-400">Refine by department, price & specs</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleReset}
              className="text-xs font-semibold text-rose-400 hover:text-rose-300 px-2 py-1"
            >
              Reset
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Filter Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {/* Category Chips */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>Department / Category</span>
              </label>
              <span className="text-[10px] text-slate-600 dark:text-slate-400">{selectedCategory}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const count = cat === 'All' ? products.length : products.filter((p) => p.category === cat).length;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCategorySelect(cat)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-slate-900 dark:text-white shadow-md shadow-sky-500/20'
                        : 'bg-slate-100/80 dark:bg-slate-800/80 border border-slate-300/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white/20 text-slate-900 dark:text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Brand Chips */}
          <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-sky-400" />
              <span>Partner Brand</span>
            </label>

            <div className="flex flex-wrap gap-2">
              {allBrands.map((b) => {
                const isSelected = selectedBrand.toLowerCase() === b.toLowerCase();
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => handleBrandSelect(b)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40 shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 border border-slate-300/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:text-white'
                    }`}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price Range Slider */}
          <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
              <span>Max Budget:</span>
              <span className="text-slate-900 dark:text-white font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700">
                ${maxPrice} USD
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1000"
              step="25"
              value={maxPrice}
              onChange={(e) => handleMaxPriceChange(Number(e.target.value))}
              className="w-full accent-sky-500 bg-slate-100 dark:bg-slate-800 h-2 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-600 dark:text-slate-400">
              <span>$0</span>
              <span>$500</span>
              <span>$1,000+</span>
            </div>
          </div>

          {/* Toggles: In-Stock & On-Sale */}
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 cursor-pointer">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">In-Stock Only (Warehouse Synced)</span>
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => handleInStockToggle(e.target.checked)}
                className="w-4 h-4 rounded accent-sky-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 cursor-pointer">
              <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                <span>On Sale & Promo Deals Only</span>
              </span>
              <input
                type="checkbox"
                checked={onSaleOnly}
                onChange={(e) => handleOnSaleToggle(e.target.checked)}
                className="w-4 h-4 rounded accent-rose-500"
              />
            </label>
          </div>

          {/* Customer Rating Filter */}
          <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Customer Rating
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[0, 4, 4.5, 4.8].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => handleRatingChange(rating)}
                  className={`py-2.5 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1 ${
                    minRating === rating
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white'
                  }`}
                >
                  {rating === 0 ? (
                    'All'
                  ) : (
                    <>
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span>{rating}+</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Drawer Bottom Action Bar */}
        <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 flex gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="w-1/3 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:text-white text-xs font-bold"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-slate-900 dark:text-white text-xs font-black shadow-lg shadow-sky-500/25 flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Show {displayCount} Products</span>
          </button>
        </div>
      </div>
    </div>
  );
};
