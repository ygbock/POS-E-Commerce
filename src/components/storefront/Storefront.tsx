import React, { useState, useMemo } from 'react';
import {
  Search,
  ShoppingCart,
  Heart,
  Star,
  Sparkles,
  Tag,
  ArrowRight,
  Plus,
  Minus,
  Trash2,
  Check,
  ShieldCheck,
  Truck,
  RotateCcw,
  Boxes,
  X,
  Package,
  SlidersHorizontal,
  Flame,
  Zap,
  Filter,
  CheckCircle2,
  Award,
  Layers,
  ShoppingBag,
  Clock,
  Percent,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { Product, ProductVariant, Order } from '../../types';
import { StoreHeader } from './StoreHeader';
import { StoreHeroBanner } from './StoreHeroBanner';
import { CategoryShowcase } from './CategoryShowcase';
import { BrandShowcase } from './BrandShowcase';
import { PromotionsBanner } from './PromotionsBanner';
import { ProductCard } from './ProductCard';
import { ProductCarouselSection } from './ProductCarouselSection';
import { ProductDetailModal } from './ProductDetailModal';
import { OrderTrackingModal } from './OrderTrackingModal';
import { OrderNotificationHubModal } from './OrderNotificationHubModal';
import { AccountClaimModal } from './AccountClaimModal';
import { OrderSuccessModal } from './OrderSuccessModal';
import { NewsletterSection } from './NewsletterSection';
import { WishlistDrawer } from './WishlistDrawer';
import { StoreCartDrawer } from './StoreCartDrawer';
import { CustomerAccountModal, AccountPortalTab } from './CustomerAccountModal';
import { StoreCheckoutModal } from './StoreCheckoutModal';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileFilterDrawer } from './MobileFilterDrawer';

export interface StorefrontProps {
  onOpenAdmin?: () => void;
  onOpenPos?: () => void;
}

export const Storefront: React.FC<StorefrontProps> = ({ onOpenAdmin, onOpenPos }) => {
  const {
    products,
    storeCart,
    addToStoreCart,
    wishlist,
    formatCurrency,
    getTotalStockForVariant,
    orders,
    isDarkMode,
    toggleTheme,
  } = useCommerce();

  // Navigation & View state
  const [activeSection, setActiveSection] = useState<'home' | 'catalog'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedBrand, setSelectedBrand] = useState('All');
  const [sortBy, setSortBy] = useState<
    'featured' | 'price-low' | 'price-high' | 'rating' | 'best-sellers' | 'newest'
  >('featured');

  // Advanced Filters
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(1000);
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [onSaleOnly, setOnSaleOnly] = useState<boolean>(false);
  const [minRating, setMinRating] = useState<number>(0);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Modals & Drawers
  const [selectedDetailProduct, setSelectedDetailProduct] = useState<Product | null>(null);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [isWishlistDrawerOpen, setIsWishlistDrawerOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountPortalTab, setAccountPortalTab] = useState<AccountPortalTab>('profile');
  
  // Tracking & 4 Methods Hub State
  const [isOrderTrackingOpen, setIsOrderTrackingOpen] = useState(false);
  const [initialTrackingNumber, setInitialTrackingNumber] = useState('');
  const [initialTrackingEmail, setInitialTrackingEmail] = useState('');
  const [isNotificationHubOpen, setIsNotificationHubOpen] = useState(false);
  const [selectedNotificationOrder, setSelectedNotificationOrder] = useState<Order | null>(null);
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [claimModalEmail, setClaimModalEmail] = useState('');
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  const categories = ['All', 'Electronics', 'Home & Kitchen', 'Food & Beverage', 'Apparel'];
  const allBrands = ['All', ...Array.from(new Set(products.map((p) => p.brand)))];

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.status !== 'active') return false;

      // Category filter
      if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;

      // Brand filter
      if (selectedBrand !== 'All' && p.brand.toLowerCase() !== selectedBrand.toLowerCase()) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesBrand = p.brand.toLowerCase().includes(query);
        const matchesCat = p.category.toLowerCase().includes(query);
        const matchesTags = p.tags.some((t) => t.toLowerCase().includes(query));
        if (!matchesName && !matchesBrand && !matchesCat && !matchesTags) return false;
      }

      // Price filter
      const primaryPrice = p.variants[0]?.retailPrice || 0;
      if (primaryPrice < minPrice || primaryPrice > maxPrice) return false;

      // In stock filter
      if (inStockOnly) {
        const stock = getTotalStockForVariant(p.variants[0]);
        if (stock <= 0) return false;
      }

      // On sale filter
      if (onSaleOnly) {
        const compareAt = p.variants[0]?.compareAtPrice || p.compareAtPrice;
        if (!compareAt || compareAt <= primaryPrice) return false;
      }

      // Rating filter
      if (minRating > 0 && p.rating < minRating) return false;

      return true;
    });
  }, [
    products,
    selectedCategory,
    selectedBrand,
    searchQuery,
    minPrice,
    maxPrice,
    inStockOnly,
    onSaleOnly,
    minRating,
    getTotalStockForVariant,
  ]);

  // Sort products
  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      const priceA = a.variants[0]?.retailPrice || 0;
      const priceB = b.variants[0]?.retailPrice || 0;

      if (sortBy === 'price-low') return priceA - priceB;
      if (sortBy === 'price-high') return priceB - priceA;
      if (sortBy === 'rating') return b.rating - a.rating;
      if (sortBy === 'best-sellers') return (b.salesCount || 0) - (a.salesCount || 0);
      if (sortBy === 'newest') return b.id.localeCompare(a.id);
      return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    });
  }, [filteredProducts, sortBy]);

  // Homepage specific product sections
  const featuredProducts = products.filter((p) => p.featured && p.status === 'active');
  const bestSellers = [...products]
    .filter((p) => p.status === 'active')
    .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
    .slice(0, 10);
  const newArrivals = [...products]
    .filter((p) => p.status === 'active')
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, 10);
  const recommendedProducts = [...products]
    .filter((p) => p.rating >= 4.5 && p.status === 'active')
    .slice(0, 10);

  const handleBuyNow = (product: Product, variant: ProductVariant, qty: number) => {
    addToStoreCart(product, variant, qty);
    setIsCartDrawerOpen(false);
    setIsCheckoutOpen(true);
  };

  const handleClearAllFilters = () => {
    setSelectedCategory('All');
    setSelectedBrand('All');
    setSearchQuery('');
    setMinPrice(0);
    setMaxPrice(1000);
    setInStockOnly(false);
    setOnSaleOnly(false);
    setMinRating(0);
    setSortBy('featured');
  };

  const hasActiveFilters =
    selectedCategory !== 'All' ||
    selectedBrand !== 'All' ||
    searchQuery.trim() !== '' ||
    minPrice > 0 ||
    maxPrice < 1000 ||
    inStockOnly ||
    onSaleOnly ||
    minRating > 0;

  return (
    <div className={`${isDarkMode ? 'dark' : ''}`}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-sky-500 selection:text-slate-900 dark:text-white pb-20">
        {/* Top Main Navigation Header */}
        <StoreHeader
        searchQuery={searchQuery}
        setSearchQuery={(q) => {
          setSearchQuery(q);
          if (q.trim()) setActiveSection('catalog');
        }}
        selectedCategory={selectedCategory}
        setSelectedCategory={(cat) => {
          setSelectedCategory(cat);
          if (cat !== 'All') setActiveSection('catalog');
        }}
        selectedBrand={selectedBrand}
        setSelectedBrand={(b) => {
          setSelectedBrand(b);
          if (b !== 'All') setActiveSection('catalog');
        }}
        onOpenCart={() => setIsCartDrawerOpen(true)}
        onOpenWishlist={() => {
          setAccountPortalTab('wishlist');
          setIsAccountModalOpen(true);
        }}
        onOpenAccount={() => {
          setAccountPortalTab('profile');
          setIsAccountModalOpen(true);
        }}
        onOpenOrderTracking={() => {
          setInitialTrackingNumber('');
          setInitialTrackingEmail('');
          setAccountPortalTab('tracking');
          setIsAccountModalOpen(true);
        }}
        onOpenNotificationHub={() => {
          const sampleOrder = orders[0] || null;
          setSelectedNotificationOrder(sampleOrder);
          setIsNotificationHubOpen(true);
        }}
        onOpenClaimModal={() => {
          setClaimModalEmail('');
          setIsClaimModalOpen(true);
        }}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onOpenAdmin={onOpenAdmin}
        onOpenPos={onOpenPos}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
      />

      <main className="max-w-[1700px] 2xl:max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-10 xl:px-12 pt-4 sm:pt-6 pb-32 lg:pb-12 space-y-10 sm:space-y-12">
        {/* HOMEPAGE VIEW */}
        {activeSection === 'home' && !hasActiveFilters && (
          <div className="space-y-10 sm:space-y-14">
            {/* 1. Hero Promotional Slider Banner */}
            <StoreHeroBanner
              onExploreCatalog={() => {
                setActiveSection('catalog');
                const el = document.getElementById('store-catalog-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              onFilterNewArrivals={() => {
                const el = document.getElementById('store-new-arrivals');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              onFilterDeals={() => {
                setOnSaleOnly(true);
                setActiveSection('catalog');
              }}
            />

            {/* 2. Trust Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
              <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center space-x-2.5 sm:space-x-3 shadow-lg">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center flex-shrink-0">
                  <Truck className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white text-xs">Same-Day Dispatch</p>
                  <p className="text-slate-600 dark:text-slate-400 text-[10px] sm:text-[11px]">Free delivery over $75</p>
                </div>
              </div>

              <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center space-x-2.5 sm:space-x-3 shadow-lg">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <Boxes className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white text-xs">Live Stock Accuracy</p>
                  <p className="text-slate-600 dark:text-slate-400 text-[10px] sm:text-[11px]">Zero latency POS sync</p>
                </div>
              </div>

              <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center space-x-2.5 sm:space-x-3 shadow-lg">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white text-xs">Authentic Hardware</p>
                  <p className="text-slate-600 dark:text-slate-400 text-[10px] sm:text-[11px]">2-year full warranty</p>
                </div>
              </div>

              <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center space-x-2.5 sm:space-x-3 shadow-lg">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0">
                  <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white text-xs">30-Day Free Returns</p>
                  <p className="text-slate-600 dark:text-slate-400 text-[10px] sm:text-[11px]">In-store or postal pickup</p>
                </div>
              </div>
            </div>

            {/* 3. Featured Categories Showcase */}
            <CategoryShowcase
              selectedCategory={selectedCategory}
              onSelectCategory={(cat) => {
                setSelectedCategory(cat);
                setActiveSection('catalog');
              }}
            />

            {/* 4. Featured Products Section */}
            <ProductCarouselSection
              id="store-featured-products"
              badgeIcon={<Sparkles className="w-3.5 h-3.5" />}
              badgeText="Handpicked For Quality"
              badgeColorClass="bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30"
              title="Featured Products"
              subtitle="Curated premium hardware, culinary craft, and lifestyle essentials"
              products={featuredProducts}
              onSelectProduct={(prod) => setSelectedDetailProduct(prod)}
              actionButton={{
                text: 'View All Products',
                onClick: () => setActiveSection('catalog'),
                colorClass: 'text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300',
              }}
            />

            {/* 5. Active Promotions & Coupons */}
            <PromotionsBanner onOpenCart={() => setIsCartDrawerOpen(true)} />

            {/* 6. Best Sellers Section */}
            <ProductCarouselSection
              id="store-best-sellers"
              badgeIcon={<Flame className="w-3.5 h-3.5" />}
              badgeText="Top Rated & High Volume"
              badgeColorClass="bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
              title="Best Sellers"
              subtitle="Customer favorites backed by verified multi-location reviews"
              products={bestSellers}
              onSelectProduct={(prod) => setSelectedDetailProduct(prod)}
              actionButton={{
                text: 'See Full Leaderboard',
                onClick: () => {
                  setSortBy('best-sellers');
                  setActiveSection('catalog');
                },
                colorClass: 'text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300',
              }}
            />

            {/* 7. New Arrivals Section */}
            <ProductCarouselSection
              id="store-new-arrivals"
              badgeIcon={<Clock className="w-3.5 h-3.5" />}
              badgeText="Just Stocked In Logistics"
              badgeColorClass="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30"
              title="New Arrivals"
              subtitle="Fresh releases with live barcode serial inventory tracking"
              products={newArrivals}
              onSelectProduct={(prod) => setSelectedDetailProduct(prod)}
              actionButton={{
                text: 'View Recent Stock',
                onClick: () => {
                  setSortBy('newest');
                  setActiveSection('catalog');
                },
                colorClass: 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300',
              }}
            />

            {/* 8. Recommended For You Section */}
            <ProductCarouselSection
              id="store-recommended-products"
              badgeIcon={<Sparkles className="w-3.5 h-3.5" />}
              badgeText="Top Customer Satisfaction (4.5+ Rating)"
              badgeColorClass="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30"
              title="Recommended For You"
              subtitle="Algorithmic matches tailored to high community acclaim and quality scores"
              products={recommendedProducts}
              onSelectProduct={(prod) => setSelectedDetailProduct(prod)}
              actionButton={{
                text: 'Explore Top Rated',
                onClick: () => {
                  setMinRating(4.5);
                  setActiveSection('catalog');
                },
                colorClass: 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300',
              }}
            />

            {/* 9. Partner Brands Showcase */}
            <BrandShowcase
              selectedBrand={selectedBrand}
              onSelectBrand={(b) => {
                setSelectedBrand(b);
                setActiveSection('catalog');
              }}
            />

            {/* 10. High-Conversion Newsletter Subscription Section */}
            <NewsletterSection onExploreDeals={() => {
              setOnSaleOnly(true);
              setActiveSection('catalog');
            }} />
          </div>
        )}

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
                        onSelectProduct={(p) => setSelectedDetailProduct(p)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Storefront Footer */}
      <footer className="mt-16 sm:mt-20 border-t border-slate-800 bg-[#020618] backdrop-blur text-slate-400 text-xs pb-24 lg:pb-0">
        <div className="max-w-[1700px] 2xl:max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-10 xl:px-12 py-10 sm:py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
            {/* Brand column */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 p-0.5 shadow-md shadow-sky-500/20">
                  <div className="w-full h-full bg-slate-50 dark:bg-slate-950 rounded-[10px] flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                  </div>
                </div>
                <span className="text-base font-black text-white tracking-tight">AURA STORE</span>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
                Premium multi-channel retail platform connecting real-time inventory, in-store registers, and instant omnichannel fulfillment.
              </p>
              <div className="flex items-center gap-4 text-slate-400 pt-1">
                <div className="flex items-center gap-1.5 text-xs text-sky-300">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <span>256-Bit SSL Encrypted Checkout</span>
                </div>
              </div>
            </div>

            {/* Shop Categories */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-200">Catalog</p>
              <ul className="space-y-2 text-xs">
                {categories.slice(1).map((cat) => (
                  <li key={cat}>
                    <button
                      onClick={() => {
                        setSelectedCategory(cat);
                        setActiveSection('catalog');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      {cat}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    onClick={() => {
                      setOnSaleOnly(true);
                      setActiveSection('catalog');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-amber-400 hover:text-amber-300 font-semibold"
                  >
                    Special Offers & Deals
                  </button>
                </li>
              </ul>
            </div>

            {/* Customer Care & Tracking Strategy */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-200">Customer Care & Portal</p>
              <ul className="space-y-2 text-xs">
                <li>
                  <button
                    onClick={() => {
                      setInitialTrackingNumber('');
                      setInitialTrackingEmail('');
                      setAccountPortalTab('tracking');
                      setIsAccountModalOpen(true);
                    }}
                    className="text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>Track Order (Account Portal)</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      const sampleOrder = orders[0] || null;
                      setSelectedNotificationOrder(sampleOrder);
                      setIsNotificationHubOpen(true);
                    }}
                    className="hover:text-emerald-400 flex items-center gap-1.5 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>SMS / WhatsApp Alerts Hub</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setClaimModalEmail('');
                      setIsClaimModalOpen(true);
                    }}
                    className="hover:text-amber-400 flex items-center gap-1.5 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    <span>Claim Guest Orders</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setAccountPortalTab('orders');
                      setIsAccountModalOpen(true);
                    }}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Order History
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setAccountPortalTab('wishlist');
                      setIsAccountModalOpen(true);
                    }}
                    className="hover:text-rose-400 flex items-center gap-1.5 transition-colors"
                  >
                    <Heart className="w-3.5 h-3.5" />
                    <span>Saved Wishlist ({wishlist.length})</span>
                  </button>
                </li>
                <li className="text-slate-500">30-Day Hassle-Free Returns</li>
              </ul>
            </div>

            {/* Staff & Administration */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-200">Operations & Staff</p>
              <ul className="space-y-2 text-xs">
                {onOpenAdmin && (
                  <li>
                    <button
                      id="btn-footer-admin-portal"
                      onClick={onOpenAdmin}
                      className="text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <span>Super Admin Portal</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </li>
                )}
                {onOpenPos && (
                  <li>
                    <button
                      id="btn-footer-pos-terminal"
                      onClick={onOpenPos}
                      className="text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
                    >
                      <span>POS Cashier Register</span>
                    </button>
                  </li>
                )}
                <li className="text-slate-500">Real-Time Sync Engine</li>
                <li className="text-slate-500">Inventory Matrix Active</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <p>© 2026 Aura Store & Omnicore Enterprise Commerce. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span>Privacy Policy</span>
              <span>•</span>
              <span>Terms of Service</span>
              <span>•</span>
              <span>Security Compliance</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Order Tracking Live Modal (Method 1 & on-site tracking) */}
      <OrderTrackingModal
        isOpen={isOrderTrackingOpen}
        onClose={() => setIsOrderTrackingOpen(false)}
        initialOrderNumber={initialTrackingNumber}
        initialEmail={initialTrackingEmail}
        onOpenNotificationHub={(ord) => {
          setSelectedNotificationOrder(ord);
          setIsNotificationHubOpen(true);
        }}
        onOpenClaimAccount={(email) => {
          setClaimModalEmail(email || '');
          setIsClaimModalOpen(true);
        }}
      />

      {/* Order Notification & Magic Links Hub Modal (Method 2 & Method 3) */}
      <OrderNotificationHubModal
        isOpen={isNotificationHubOpen}
        onClose={() => setIsNotificationHubOpen(false)}
        order={selectedNotificationOrder}
        onOpenLiveTracking={(orderNumber, email) => {
          setInitialTrackingNumber(orderNumber);
          setInitialTrackingEmail(email || '');
          setIsOrderTrackingOpen(true);
        }}
        onOpenClaimModal={(email) => {
          setClaimModalEmail(email || '');
          setIsClaimModalOpen(true);
        }}
      />

      {/* Retroactive Account Claim Modal (Method 4) */}
      <AccountClaimModal
        isOpen={isClaimModalOpen}
        onClose={() => setIsClaimModalOpen(false)}
        initialEmail={claimModalEmail}
        onOpenOrderTracking={(orderNumber, email) => {
          setInitialTrackingNumber(orderNumber);
          setInitialTrackingEmail(email || '');
          setIsOrderTrackingOpen(true);
        }}
      />

      {/* Product Detail Modal */}
      {selectedDetailProduct && (
        <ProductDetailModal
          product={selectedDetailProduct}
          onClose={() => setSelectedDetailProduct(null)}
          onAddToCart={addToStoreCart}
          onBuyNow={handleBuyNow}
          onSelectRelatedProduct={(rel) => setSelectedDetailProduct(rel)}
        />
      )}

      {/* Cart Drawer */}
      <StoreCartDrawer
        isOpen={isCartDrawerOpen}
        onClose={() => setIsCartDrawerOpen(false)}
        onProceedToCheckout={() => setIsCheckoutOpen(true)}
      />

      {/* Wishlist Drawer */}
      <WishlistDrawer
        isOpen={isWishlistDrawerOpen}
        onClose={() => setIsWishlistDrawerOpen(false)}
        onSelectProduct={(prod) => setSelectedDetailProduct(prod)}
        onOpenCart={() => setIsCartDrawerOpen(true)}
      />

      {/* Customer Account Portal Modal with integrated Tracking & Wishlist */}
      <CustomerAccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        initialTab={accountPortalTab}
        initialOrderNumber={initialTrackingNumber}
        initialTrackingEmail={initialTrackingEmail}
        onSelectProduct={(prod) => setSelectedDetailProduct(prod)}
        onOpenCart={() => setIsCartDrawerOpen(true)}
        onOpenNotificationHub={(ord) => {
          setSelectedNotificationOrder(ord);
          setIsNotificationHubOpen(true);
        }}
        onOpenClaimModal={(email) => {
          setClaimModalEmail(email || '');
          setIsClaimModalOpen(true);
        }}
      />

      {/* Checkout Modal */}
      <StoreCheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        onOrderSuccess={(order) => {
          setSuccessOrder(order);
          setIsSuccessModalOpen(true);
        }}
      />

      {/* Enhanced Order Success Modal with 4-Way Tracking Access */}
      <OrderSuccessModal
        isOpen={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        order={successOrder}
        onOpenTracking={(num, email) => {
          setInitialTrackingNumber(num);
          setInitialTrackingEmail(email || '');
          setAccountPortalTab('tracking');
          setIsAccountModalOpen(true);
        }}
        onOpenNotificationHub={(ord) => {
          setSelectedNotificationOrder(ord);
          setIsNotificationHubOpen(true);
        }}
        onOpenClaimModal={(email) => {
          setClaimModalEmail(email || '');
          setIsClaimModalOpen(true);
        }}
      />

      {/* Mobile Slide-Over Filter Drawer */}
      <MobileFilterDrawer
        isOpen={isMobileFilterOpen}
        onClose={() => setIsMobileFilterOpen(false)}
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={(cat) => {
          setSelectedCategory(cat);
          if (cat !== 'All') setActiveSection('catalog');
        }}
        allBrands={allBrands}
        selectedBrand={selectedBrand}
        onSelectBrand={(b) => {
          setSelectedBrand(b);
          if (b !== 'All') setActiveSection('catalog');
        }}
        minPrice={minPrice}
        maxPrice={maxPrice}
        onMinPriceChange={setMinPrice}
        onMaxPriceChange={setMaxPrice}
        inStockOnly={inStockOnly}
        onInStockChange={setInStockOnly}
        onSaleOnly={onSaleOnly}
        onOnSaleChange={setOnSaleOnly}
        minRating={minRating}
        onMinRatingChange={setMinRating}
        onClearFilters={handleClearAllFilters}
        hasActiveFilters={hasActiveFilters}
        totalProductsCount={products.length}
        matchedCount={sortedProducts.length}
      />

      {/* Mobile Bottom Navigation Dock */}
      <MobileBottomNav
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onNavigateHome={() => {
          setActiveSection('home');
          setSelectedCategory('All');
          setSelectedBrand('All');
          setSearchQuery('');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onNavigateCatalog={() => {
          setActiveSection('catalog');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenCart={() => setIsCartDrawerOpen(true)}
        onOpenAccount={() => {
          setAccountPortalTab('profile');
          setIsAccountModalOpen(true);
        }}
        onOpenFilterDrawer={() => setIsMobileFilterOpen(true)}
        hasActiveFilters={hasActiveFilters}
      />
      </div>
    </div>
  );
};
