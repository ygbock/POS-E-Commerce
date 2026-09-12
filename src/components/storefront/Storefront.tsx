import React, { useEffect, useState, useMemo } from 'react';
import {
  Search,
  ShoppingCart,
  Heart,
  Star,

  Tag,
  ArrowRight,
  Plus,
  Minus,
  Trash2,
  Check,

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

  Percent,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { useStorefrontRoute } from '../../router/StorefrontRouter';
import { Product, ProductVariant, Order } from '../../types';
import { StoreHeader } from './StoreHeader';
import { StorefrontFooter } from './StorefrontFooter';
import { filterStorefrontProducts, sortStorefrontProducts } from './storefrontCatalog';
import { ProductCard } from './ProductCard';
import { ProductDetailModal } from './ProductDetailModal';
import { OrderTrackingModal } from './OrderTrackingModal';
import { OrderNotificationHubModal } from './OrderNotificationHubModal';
import { AccountClaimModal } from './AccountClaimModal';
import { OrderSuccessModal } from './OrderSuccessModal';
import { WishlistDrawer } from './WishlistDrawer';
import { StoreCartDrawer } from './StoreCartDrawer';
import { CustomerAccountModal, AccountPortalTab } from './CustomerAccountModal';
import { StoreCheckoutModal } from './StoreCheckoutModal';
import { StorefrontOverlays } from './StorefrontOverlays';
import { StorefrontHome } from './StorefrontHome';
import { StorefrontCatalog } from './StorefrontCatalog';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileFilterDrawer } from './MobileFilterDrawer';

export interface StorefrontProps {
  onOpenAdmin?: () => void;
  onOpenPos?: () => void;
}

export const Storefront: React.FC<StorefrontProps> = ({ onOpenAdmin, onOpenPos }) => {
  const { route, navigate } = useStorefrontRoute();
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

  const filteredProducts = useMemo(() => filterStorefrontProducts(products, {
    category: selectedCategory,
    brand: selectedBrand,
    searchQuery,
    minPrice,
    maxPrice,
    inStockOnly,
    onSaleOnly,
    minRating,
  }, getTotalStockForVariant), [
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

  const sortedProducts = useMemo(
    () => sortStorefrontProducts(filteredProducts, sortBy),
    [filteredProducts, sortBy],
  );

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
    goCheckout();
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

  const tenantSlug = route.tenantSlug;
  const goHome = () => navigate({ name: 'home', tenantSlug });
  const goShop = () => navigate({ name: 'shop', tenantSlug });
  const goCategory = (slug: string) => navigate({ name: 'category', tenantSlug, slug });
  const goBrand = (slug: string) => navigate({ name: 'brand', tenantSlug, slug });
  const goSearch = (query: string) => navigate({ name: 'search', tenantSlug, query });
  const goProduct = (product: Product) => navigate({ name: 'product', tenantSlug, slug: product.slug || product.id });
  const goCart = () => navigate({ name: 'cart', tenantSlug });
  const goCheckout = () => navigate({ name: 'checkout', tenantSlug });
  const goAccount = (tab: AccountPortalTab = 'profile') => {
    setAccountPortalTab(tab);
    navigate({ name: 'account', tenantSlug });
  };

  // Keep the existing storefront UI state synchronized with the canonical History API route.
  // URL navigation is the source of truth for deep links, refreshes, and browser back/forward.
  useEffect(() => {
    if (route.name === 'home') {
      setActiveSection('home');
      setSelectedCategory('All');
      setSelectedBrand('All');
      setSearchQuery('');
      return;
    }
    if (route.name === 'shop') {
      setActiveSection('catalog');
      return;
    }
    if (route.name === 'category') {
      setActiveSection('catalog');
      setSelectedCategory(route.slug);
      return;
    }
    if (route.name === 'brand') {
      setActiveSection('catalog');
      setSelectedBrand(route.slug);
      return;
    }
    if (route.name === 'search') {
      setActiveSection('catalog');
      setSearchQuery(route.query || '');
      return;
    }
    if (route.name === 'product') {
      const product = products.find((item) =>
        item.id === route.slug || item.slug === route.slug
      );
      if (product) setSelectedDetailProduct(product);
      return;
    }
    if (route.name === 'cart') {
      setIsCartDrawerOpen(true);
      return;
    }
    if (route.name === 'checkout') {
      setIsCheckoutOpen(true);
      return;
    }
    if (route.name === 'account') {
      setAccountPortalTab('profile');
      setIsAccountModalOpen(true);
    }
  }, [route, products]);


  return (
    <div className={`${isDarkMode ? 'dark' : ''}`}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-sky-500 selection:text-slate-900 dark:text-white pb-20">
        {/* Top Main Navigation Header */}
        <StoreHeader
        searchQuery={searchQuery}
        setSearchQuery={(q) => {
          setSearchQuery(q);
          if (q.trim()) goSearch(q);
        }}
        selectedCategory={selectedCategory}
        setSelectedCategory={(cat) => {
          setSelectedCategory(cat);
          if (cat !== 'All') goCategory(cat); else goShop();
        }}
        selectedBrand={selectedBrand}
        setSelectedBrand={(b) => {
          setSelectedBrand(b);
          if (b !== 'All') goBrand(b); else goShop();
        }}
        onOpenCart={goCart}
        onOpenWishlist={() => {
          goAccount('wishlist');
        }}
        onOpenAccount={() => {
          goAccount('profile');
        }}
        onOpenOrderTracking={() => {
          setInitialTrackingNumber('');
          setInitialTrackingEmail('');
          goAccount('tracking');
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
          <StorefrontHome
            selectedCategory={selectedCategory}
            selectedBrand={selectedBrand}
            featuredProducts={featuredProducts}
            bestSellers={bestSellers}
            newArrivals={newArrivals}
            recommendedProducts={recommendedProducts}
            goShop={goShop}
            goCategory={goCategory}
            goBrand={goBrand}
            goProduct={goProduct}
            setOnSaleOnly={setOnSaleOnly}
            setSortBy={setSortBy}
            setMinRating={setMinRating}
            setActiveSection={setActiveSection}
        {(activeSection === 'catalog' || hasActiveFilters) && (
          <StorefrontCatalog
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            selectedBrand={selectedBrand}
            setSelectedBrand={setSelectedBrand}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            inStockOnly={inStockOnly}
            setInStockOnly={setInStockOnly}
            onSaleOnly={onSaleOnly}
            setOnSaleOnly={setOnSaleOnly}
            minRating={minRating}
            setMinRating={setMinRating}
            maxPrice={maxPrice}
            setMaxPrice={setMaxPrice}
            sortBy={sortBy}
            setSortBy={setSortBy}
            categories={categories}
            allBrands={allBrands}
            products={products}
            sortedProducts={sortedProducts}
            hasActiveFilters={hasActiveFilters}
            isMobileFilterOpen={isMobileFilterOpen}
            setIsMobileFilterOpen={setIsMobileFilterOpen}
            handleClearAllFilters={handleClearAllFilters}
            goProduct={goProduct}
          />
        )}

   </div>
            </div>
          </div>
        )}
      </main>

      <StorefrontFooter
        categories={categories}
        wishlistCount={wishlist.length}
        onSelectCategory={(cat) => { setSelectedCategory(cat); setActiveSection('catalog'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        onOpenDeals={() => { setOnSaleOnly(true); setActiveSection('catalog'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        onOpenTracking={() => { setInitialTrackingNumber(''); setInitialTrackingEmail(''); setAccountPortalTab('tracking'); setIsAccountModalOpen(true); }}
        onOpenNotifications={() => { const sampleOrder = orders[0] || null; setSelectedNotificationOrder(sampleOrder); setIsNotificationHubOpen(true); }}
        onOpenClaimOrders={() => { setClaimModalEmail(''); setIsClaimModalOpen(true); }}
        onOpenOrderHistory={() => { setAccountPortalTab('orders'); setIsAccountModalOpen(true); }}
        onOpenWishlist={() => { setAccountPortalTab('wishlist'); setIsAccountModalOpen(true); }}
        onOpenAdmin={onOpenAdmin}
        onOpenPos={onOpenPos}
      />

      <StorefrontOverlays
        selectedDetailProduct={selectedDetailProduct}
        setSelectedDetailProduct={setSelectedDetailProduct}
        addToStoreCart={addToStoreCart}
        onBuyNow={handleBuyNow}
        isOrderTrackingOpen={isOrderTrackingOpen}
        setIsOrderTrackingOpen={setIsOrderTrackingOpen}
        initialTrackingNumber={initialTrackingNumber}
        initialTrackingEmail={initialTrackingEmail}
        isNotificationHubOpen={isNotificationHubOpen}
        setIsNotificationHubOpen={setIsNotificationHubOpen}
        selectedNotificationOrder={selectedNotificationOrder}
        setSelectedNotificationOrder={setSelectedNotificationOrder}
        isClaimModalOpen={isClaimModalOpen}
        setIsClaimModalOpen={setIsClaimModalOpen}
        claimModalEmail={claimModalEmail}
        isCartDrawerOpen={isCartDrawerOpen}
        setIsCartDrawerOpen={setIsCartDrawerOpen}
        goCart={goCart}
        goCheckout={goCheckout}
        isWishlistDrawerOpen={isWishlistDrawerOpen}
        setIsWishlistDrawerOpen={setIsWishlistDrawerOpen}
        isAccountModalOpen={isAccountModalOpen}
        setIsAccountModalOpen={setIsAccountModalOpen}
        accountPortalTab={accountPortalTab}
        isCheckoutOpen={isCheckoutOpen}
        setIsCheckoutOpen={setIsCheckoutOpen}
        isSuccessModalOpen={isSuccessModalOpen}
        setIsSuccessModalOpen={setIsSuccessModalOpen}
        successOrder={successOrder}
        setInitialTrackingNumber={setInitialTrackingNumber}
        setInitialTrackingEmail={setInitialTrackingEmail}
        setClaimModalEmail={setClaimModalEmail}
      />

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
