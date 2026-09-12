import React from 'react';
import { Flame, ShoppingBag, SlidersHorizontal } from 'lucide-react';
import { Product } from '../../types';
import { ProductCard } from './ProductCard';

export interface StorefrontCatalogProps {
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
  selectedBrand: string;
  setSelectedBrand: (value: string) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  inStockOnly: boolean;
  setInStockOnly: (value: boolean) => void;
  onSaleOnly: boolean;
  setOnSaleOnly: (value: boolean) => void;
  minRating: number;
  setMinRating: (value: number) => void;
  maxPrice: number;
  setMaxPrice: (value: number) => void;
  sortBy: string;
  setSortBy: (value: 'featured' | 'best-sellers' | 'newest' | 'price-low' | 'price-high' | 'rating') => void;
  categories: string[];
  allBrands: string[];
  products: Product[];
  sortedProducts: Product[];
  hasActiveFilters: boolean;
  isMobileFilterOpen: boolean;
  setIsMobileFilterOpen: (value: boolean) => void;
  handleClearAllFilters: () => void;
  goProduct: (product: Product) => void;
}

export const StorefrontCatalog: React.FC<StorefrontCatalogProps> = (props) => {
  const {
    selectedCategory, setSelectedCategory, selectedBrand, setSelectedBrand,
    searchQuery, setSearchQuery, inStockOnly, setInStockOnly, onSaleOnly, setOnSaleOnly,
    minRating, setMinRating, maxPrice, setMaxPrice, sortBy, setSortBy,
    categories, allBrands, products, sortedProducts, hasActiveFilters,
    isMobileFilterOpen, setIsMobileFilterOpen, handleClearAllFilters, goProduct,
  } = props;

  {/* FULL SHOPPING CATALOG VIEW (With Search, Filters, Sorting) */}
  {(activeSection === 'catalog' || hasActiveFilters) && (
    <div id="store-catalog-section" className="space-y-6">
      {/* Catalog Top Header & Controls */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Catalog & Inventory</h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
              {sortedProducts.length} Items
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Showing live warehouse availability for {selectedCategory !== 'All' ? selectedCategory : 'all categories'}
            {selectedBrand !== 'All' ? ` • ${selectedBrand}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mobile Filter Sheet Button */}
          <button
            onClick={() => setIsMobileFilterOpen(!isMobileFilterOpen)}
            className="lg:hidden px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-900 dark:text-white rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-300 dark:border-slate-700 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filters {hasActiveFilters && '(Active)'}</span>
          </button>

          {/* Sorting Select */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600 dark:text-slate-400 hidden sm:inline">Sort:</span>
            <select
              aria-label="Sort Catalog"
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white rounded-xl py-2.5 px-3 focus:outline-none focus:border-sky-500"
            >
              <option value="featured">Featured First</option>
              <option value="best-sellers">Best Sellers</option>
              <option value="newest">Newest Arrivals</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Top Customer Rated</option>
            </select>
          </div>
        </div>
      </div>

      {/* Active Filter Badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 bg-white/60 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Active Filters:</span>
          {selectedCategory !== 'All' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 text-xs font-semibold border border-sky-500/30">
              Category: {selectedCategory}
              <button onClick={() => setSelectedCategory('All')}>✕</button>
            </span>
          )}
          {selectedBrand !== 'All' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 text-xs font-semibold border border-sky-500/30">
              Brand: {selectedBrand}
              <button onClick={() => setSelectedBrand('All')}>✕</button>
            </span>
          )}
          {searchQuery.trim() && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
              Search: "{searchQuery}"
              <button onClick={() => setSearchQuery('')}>✕</button>
            </span>
          )}
          {inStockOnly && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
              In Stock Only
              <button onClick={() => setInStockOnly(false)}>✕</button>
            </span>
          )}
          {onSaleOnly && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-500/30">
              On Sale Deals
              <button onClick={() => setOnSaleOnly(false)}>✕</button>
            </span>
          )}
          {minRating > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30">
              {minRating}+ Stars
              <button onClick={() => setMinRating(0)}>✕</button>
            </span>
          )}
          <button
            onClick={handleClearAllFilters}
            className="text-xs font-bold text-rose-400 hover:text-rose-300 underline ml-auto"
          >
            Reset All Filters
          </button>
        </div>
      )}

      {/* Main Shopping Layout: Sidebar + Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        {/* Desktop Filters Sidebar (hidden on mobile/tablet, handled by MobileFilterDrawer) */}
        <aside className="hidden lg:block space-y-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl sticky top-24">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-2">
              <SlidersHorizontal className="w-4 h-4 text-sky-400" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Filter Catalog</h3>
            </div>
            {hasActiveFilters && (
              <button
                onClick={handleClearAllFilters}
                className="text-xs text-rose-400 hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Category
            </label>
            <div className="space-y-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-between ${
                    selectedCategory === cat
                      ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-50 dark:bg-slate-850'
                  }`}
                >
                  <span>{cat}</span>
                  <span className="text-[10px] text-slate-500">
                    {cat === 'All'
                      ? products.length
                      : products.filter((p) => p.category === cat).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Brands */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Partner Brand
            </label>
            <select
              aria-label="Filter by Brand"
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white rounded-xl p-2.5 focus:border-sky-500"
            >
              {allBrands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Price Range */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
              <span>Max Price</span>
              <span className="text-slate-900 dark:text-white">${maxPrice}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1000"
              step="25"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="w-full accent-sky-500 bg-slate-100 dark:bg-slate-800"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>$0</span>
              <span>$500</span>
              <span>$1,000+</span>
            </div>
          </div>

          {/* Availability & Deals Toggles */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center space-x-2.5 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="rounded accent-sky-500 w-4 h-4 bg-slate-100 dark:bg-slate-800"
              />
              <span className="text-slate-700 dark:text-slate-300 font-medium">In Stock Only</span>
            </label>

            <label className="flex items-center space-x-2.5 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={onSaleOnly}
                onChange={(e) => setOnSaleOnly(e.target.checked)}
                className="rounded accent-sky-500 w-4 h-4 bg-slate-100 dark:bg-slate-800"
              />
              <span className="text-rose-400 font-medium flex items-center gap-1">
                <Flame className="w-3 h-3" />
                <span>On Sale / Special Deals</span>
              </span>
            </label>
          </div>

          {/* Rating Filter */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Minimum Rating
            </label>
            <div className="flex gap-1.5">
              {[0, 4, 4.5, 4.8].map((rating) => (
                <button
                  key={rating}
                  onClick={() => setMinRating(rating)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                    minRating === rating
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white'
                  }`}
                >
                  {rating === 0 ? 'All' : `${rating}★`}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Products Cards Grid */}
        <div className="lg:col-span-3 space-y-6">
          {sortedProducts.length === 0 ? (
            <div className="py-24 text-center text-slate-500 space-y-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8">
              <ShoppingBag className="w-14 h-14 mx-auto text-slate-700 stroke-1" />
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">No products matched your criteria</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  Try resetting your search query, price ranges, or category filters to see more results.
                </p>
              </div>
              <button
                onClick={handleClearAllFilters}
                className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-slate-900 dark:text-white rounded-xl text-xs font-bold transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-6">
              {sortedProducts.map((prod) => (
                <ProductCard
                  key={prod.id}
                  product={prod}
                  onSelectProduct={goProduct}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )}

};
