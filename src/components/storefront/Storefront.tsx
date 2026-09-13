import React from 'react';
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
import { StorefrontHeader } from './StorefrontHeader';
import { StorefrontFooter } from './StorefrontFooter';
import { useStorefrontState } from './useStorefrontState';
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
import { StorefrontCatalog } from './StorefrontCatalog.tsx';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileFilterDrawer } from './MobileFilterDrawer';

export interface StorefrontProps {
  onOpenAdmin?: () => void;
  onOpenPos?: () => void;
}

export const Storefront: React.FC<StorefrontProps> = ({ onOpenAdmin, onOpenPos }) => {
  const state = useStorefrontState();
  const {
    route, tenant, tenantLoading, tenantError, products, storeCart, addToStoreCart, wishlist, formatCurrency, getTotalStockForVariant,
    orders, isDarkMode, toggleTheme, activeSection, setActiveSection, searchQuery, setSearchQuery,
    selectedCategory, setSelectedCategory, selectedBrand, setSelectedBrand, sortBy, setSortBy,
    minPrice, setMinPrice, maxPrice, setMaxPrice, inStockOnly, setInStockOnly, onSaleOnly, setOnSaleOnly,
    minRating, setMinRating, isMobileFilterOpen, setIsMobileFilterOpen, selectedDetailProduct, setSelectedDetailProduct,
    isCartDrawerOpen, setIsCartDrawerOpen, isWishlistDrawerOpen, setIsWishlistDrawerOpen, isAccountModalOpen, setIsAccountModalOpen,
    accountPortalTab, setAccountPortalTab, isOrderTrackingOpen, setIsOrderTrackingOpen, initialTrackingNumber, setInitialTrackingNumber,
    initialTrackingEmail, setInitialTrackingEmail, isNotificationHubOpen, setIsNotificationHubOpen, selectedNotificationOrder,
    setSelectedNotificationOrder, isClaimModalOpen, setIsClaimModalOpen, claimModalEmail, setClaimModalEmail,
    isSuccessModalOpen, setIsSuccessModalOpen, successOrder, setSuccessOrder, isCheckoutOpen, setIsCheckoutOpen,
    categories, allBrands, filteredProducts, sortedProducts, featuredProducts, bestSellers, newArrivals, recommendedProducts,
    handleBuyNow, handleClearAllFilters, hasActiveFilters, tenantSlug, goHome, goShop, goCategory, goBrand, goSearch, goProduct, goCart, goCheckout, goAccount
  } = state;

  if (tenantLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950" role="status" aria-live="polite">Loading storefront…</div>;
  }

  if (tenantError || !tenant) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-6"><div role="alert" className="max-w-md text-center"><h1 className="text-xl font-semibold">Storefront unavailable</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{tenantError || 'This store could not be resolved.'}</p></div></div>;
  }

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-sky-500 selection:text-slate-900 pb-20">
        <StorefrontHeader
          searchQuery={searchQuery}
          setSearchQuery={(q) => { setSearchQuery(q); if (q.trim()) goSearch(q); }}
          selectedCategory={selectedCategory}
          setSelectedCategory={(cat) => { setSelectedCategory(cat); if (cat !== 'All') goCategory(cat); else goShop(); }}
          selectedBrand={selectedBrand}
          setSelectedBrand={(b) => { setSelectedBrand(b); if (b !== 'All') goBrand(b); else goShop(); }}
          onOpenCart={goCart}
          onOpenWishlist={() => goAccount('wishlist')}
          onOpenAccount={() => goAccount('profile')}
          onOpenOrderTracking={() => { setInitialTrackingNumber(''); setInitialTrackingEmail(''); goAccount('tracking'); }}
          onOpenNotificationHub={() => { setSelectedNotificationOrder(orders[0] || null); setIsNotificationHubOpen(true); }}
          onOpenClaimModal={() => { setClaimModalEmail(''); setIsClaimModalOpen(true); }}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          onOpenAdmin={onOpenAdmin}
          onOpenPos={onOpenPos}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
        />

        <main className="max-w-[1700px] 2xl:max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-10 xl:px-12 pt-4 sm:pt-6 pb-32 lg:pb-12 space-y-10 sm:space-y-12">
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
              products={products}
              formatCurrency={formatCurrency}
              getTotalStockForVariant={getTotalStockForVariant}
              addToStoreCart={addToStoreCart}
            />
          )}

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
              formatCurrency={formatCurrency}
              addToStoreCart={addToStoreCart}
              getTotalStockForVariant={getTotalStockForVariant}
            />
          )}
        </main>

        <StorefrontFooter
          categories={categories}
          wishlistCount={wishlist.length}
          onSelectCategory={(cat) => { setSelectedCategory(cat); setActiveSection('catalog'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          onOpenDeals={() => { setOnSaleOnly(true); setActiveSection('catalog'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          onOpenTracking={() => { setAccountPortalTab('tracking'); setIsAccountModalOpen(true); }}
          onOpenNotifications={() => { setSelectedNotificationOrder(orders[0] || null); setIsNotificationHubOpen(true); }}
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
          setAccountPortalTab={setAccountPortalTab}
          isCheckoutOpen={isCheckoutOpen}
          setIsCheckoutOpen={setIsCheckoutOpen}
          isSuccessModalOpen={isSuccessModalOpen}
          setIsSuccessModalOpen={setIsSuccessModalOpen}
          successOrder={successOrder}
          setSuccessOrder={setSuccessOrder}
          setInitialTrackingNumber={setInitialTrackingNumber}
          setInitialTrackingEmail={setInitialTrackingEmail}
          setClaimModalEmail={setClaimModalEmail}
        />

        <MobileFilterDrawer
          isOpen={isMobileFilterOpen}
          onClose={() => setIsMobileFilterOpen(false)}
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => { setSelectedCategory(cat); if (cat !== 'All') setActiveSection('catalog'); }}
          allBrands={allBrands}
          selectedBrand={selectedBrand}
          onSelectBrand={(b) => { setSelectedBrand(b); if (b !== 'All') setActiveSection('catalog'); }}
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
          onNavigateHome={() => { setActiveSection('home'); setSelectedCategory('All'); setSelectedBrand('All'); setSearchQuery(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          onNavigateCatalog={() => { setActiveSection('catalog'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          onOpenCart={() => setIsCartDrawerOpen(true)}
          onOpenAccount={() => { setAccountPortalTab('profile'); setIsAccountModalOpen(true); }}
          onOpenFilterDrawer={() => setIsMobileFilterOpen(true)}
          hasActiveFilters={hasActiveFilters}
        />
      </div>
    </div>
  );
};
