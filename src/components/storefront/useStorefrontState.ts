import { useEffect, useState, useMemo } from 'react';
import { useCommerce } from '../../context/CommerceContext';
import { useStorefrontRoute } from '../../router/StorefrontRouter';
import { Product, ProductVariant, Order } from '../../types';
import { filterStorefrontProducts, sortStorefrontProducts } from './storefrontCatalog';

export interface StorefrontStateProps { onOpenAdmin?: () => void; onOpenPos?: () => void; }
export function useStorefrontState() {
  const { route, navigate } = useStorefrontRoute();
  const { products, storeCart, addToStoreCart, wishlist, formatCurrency, getTotalStockForVariant, orders, isDarkMode, toggleTheme } = useCommerce();
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



  return { route, navigate, products, storeCart, addToStoreCart, wishlist, formatCurrency, getTotalStockForVariant, orders, isDarkMode, toggleTheme,
    activeSection, setActiveSection, searchQuery, setSearchQuery, selectedCategory, setSelectedCategory, selectedBrand, setSelectedBrand, sortBy, setSortBy,
    minPrice, setMinPrice, maxPrice, setMaxPrice, inStockOnly, setInStockOnly, onSaleOnly, setOnSaleOnly, minRating, setMinRating, isMobileFilterOpen, setIsMobileFilterOpen,
    selectedDetailProduct, setSelectedDetailProduct, isCartDrawerOpen, setIsCartDrawerOpen, isWishlistDrawerOpen, setIsWishlistDrawerOpen, isAccountModalOpen, setIsAccountModalOpen,
    accountPortalTab, setAccountPortalTab, isOrderTrackingOpen, setIsOrderTrackingOpen, initialTrackingNumber, setInitialTrackingNumber, initialTrackingEmail, setInitialTrackingEmail,
    isNotificationHubOpen, setIsNotificationHubOpen, selectedNotificationOrder, setSelectedNotificationOrder, isClaimModalOpen, setIsClaimModalOpen, claimModalEmail, setClaimModalEmail,
    isSuccessModalOpen, setIsSuccessModalOpen, successOrder, setSuccessOrder, isCheckoutOpen, setIsCheckoutOpen, categories, allBrands, filteredProducts, sortedProducts,
    featuredProducts, bestSellers, newArrivals, recommendedProducts, handleBuyNow, handleClearAllFilters, hasActiveFilters, tenantSlug, goHome, goShop, goCategory, goBrand, goSearch, goProduct, goCart, goCheckout, goAccount
  };
}
