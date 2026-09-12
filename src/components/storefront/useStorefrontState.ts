import { useEffect, useState, useMemo } from 'react';
import { useCommerce } from '../../context/CommerceContext';
import { useStorefrontRoute } from '../../router/StorefrontRouter';
import { Product, ProductVariant, Order } from '../../types';
import { filterStorefrontProducts, sortStorefrontProducts } from './storefrontCatalog';
import { useStorefrontContext } from '../../context/StorefrontContext';
import { storefrontApi, StorefrontProduct } from '../../services/storefrontApi';

export interface StorefrontStateProps { onOpenAdmin?: () => void; onOpenPos?: () => void; }
export function useStorefrontState() {
  const { route, navigate } = useStorefrontRoute();
  const { tenant, loading: tenantLoading, error: tenantError, formatCurrency: formatTenantCurrency } = useStorefrontContext();
  const { products, storeCart, addToStoreCart, wishlist, getTotalStockForVariant, orders, isDarkMode, toggleTheme } = useCommerce();
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
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogPagination, setCatalogPagination] = useState<{ page: number; pageSize: number; totalCount: number; totalPages: number; hasMore: boolean } | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);

  const toProduct = (item: StorefrontProduct): Product => ({
    id: item.id,
    organizationId: item.organization_id,
    name: item.name,
    slug: item.slug,
    brand: item.brand,
    category: item.category,
    subcategory: '',
    description: item.description || '',
    shortDescription: item.shortDescription || '',
    unit: 'pcs',
    productType: 'standard',
    status: 'active',
    channels: { pos: false, ecommerce: true, wholesale: false },
    taxRate: 0,
    rating: item.rating || 0,
    reviewCount: item.reviewCount || 0,
    tags: item.tags || [],
    images: item.images || [],
    variants: item.variants.map((v) => ({
      id: v.id,
      sku: v.sku || '',
      barcode: v.barcode || '',
      name: v.name || '',
      attributes: Object.fromEntries(Object.entries(v.attributes || {}).map(([k, value]) => [k, String(value)])),
      costPrice: 0,
      retailPrice: Number(v.retailPrice ?? v.retail_price ?? 0),
      wholesalePrice: Number(v.retailPrice ?? v.retail_price ?? 0),
      memberPrice: Number(v.retailPrice ?? v.retail_price ?? 0),
      minSellingPrice: Number(v.retailPrice ?? v.retail_price ?? 0),
      stockByLocation: Object.fromEntries((v.locationBalances || []).map((b) => [b.locationId, b.available])),
      lowStockThreshold: 0,
      image: v.imageUrl || undefined,
    })),
    featured: item.featured,
    compareAtPrice: item.compareAtPrice ?? undefined,
    salesCount: item.salesCount || 0,
    specifications: [],
    reviewsList: [],
    createdAt: new Date().toISOString(),
  });

  useEffect(() => {
    if (!tenant?.slug || tenantLoading || tenantError) return;
    let cancelled = false;
    setCatalogLoading(true); setCatalogError(null);
    void storefrontApi.getProducts(tenant.slug, {
      category: selectedCategory,
      brand: selectedBrand,
      search: searchQuery,
      minPrice,
      maxPrice,
      inStock: inStockOnly,
      onSale: onSaleOnly,
      sortBy,
      page: 1,
      limit: 48,
    }).then((result) => {
      if (cancelled) return;
      setCatalogPagination(result.pagination);
      setStorefrontProducts(result.products.map(toProduct));
    }).catch((error) => {
      if (cancelled) return;
      setCatalogError(error instanceof Error ? error.message : 'Unable to load storefront catalog.');
      setStorefrontProducts([]);
    }).finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [tenant?.slug, tenantLoading, tenantError, selectedCategory, selectedBrand, searchQuery, minPrice, maxPrice, inStockOnly, onSaleOnly, sortBy]);

  const [storefrontProducts, setStorefrontProducts] = useState<Product[]>([]);
  useEffect(() => {
    if (!tenant?.slug || tenantLoading || tenantError) return;
    let cancelled = false;
    void Promise.all([storefrontApi.getCategories(tenant.slug), storefrontApi.getBrands(tenant.slug)])
      .then(([categoriesResult, brandsResult]) => {
        if (cancelled) return;
        const categoryNames = categoriesResult.map((v: unknown) => typeof v === 'string' ? v : String((v as { name?: unknown })?.name || '')).filter(Boolean);
        const brandNames = brandsResult.map((v: unknown) => typeof v === 'string' ? v : String((v as { name?: unknown })?.name || '')).filter(Boolean);
        setCategoryOptions([...new Set(categoryNames)]);
        setBrandOptions([...new Set(brandNames)]);
      })
      .catch(() => { if (!cancelled) { setCategoryOptions([]); setBrandOptions([]); } });
    return () => { cancelled = true; };
  }, [tenant?.slug, tenantLoading, tenantError]);

  const catalogProducts = storefrontProducts;
  const categories = ['All', ...categoryOptions];
  const allBrands = ['All', ...brandOptions];

  const filteredProducts = useMemo(() => filterStorefrontProducts(catalogProducts, {
    category: selectedCategory,
    brand: selectedBrand,
    searchQuery,
    minPrice,
    maxPrice,
    inStockOnly,
    onSaleOnly,
    minRating,
  }, getTotalStockForVariant), [
    catalogProducts,
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
  const featuredProducts = catalogProducts.filter((p) => p.featured && p.status === 'active');
  const bestSellers = [...catalogProducts]
    .filter((p) => p.status === 'active')
    .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
    .slice(0, 10);
  const newArrivals = [...catalogProducts]
    .filter((p) => p.status === 'active')
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, 10);
  const recommendedProducts = [...catalogProducts]
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
    // Route-bound overlays must follow the canonical History API route.
    // Close stale route overlays first so browser back/forward cannot leave
    // a product/cart/checkout/account modal visually mounted over another route.
    setSelectedDetailProduct(null);
    setIsCartDrawerOpen(false);
    setIsCheckoutOpen(false);
    setIsAccountModalOpen(false);

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
      // Preserve the tab selected by goAccount(); direct /account navigation
      // naturally starts from the hook's default profile tab.
      setIsAccountModalOpen(true);
    }
  }, [route, products]);



  return { route, navigate, tenant, tenantLoading, tenantError, products: catalogProducts, catalogLoading, catalogError, catalogPagination, storeCart, addToStoreCart, wishlist, formatCurrency: formatTenantCurrency, getTotalStockForVariant, orders, isDarkMode, toggleTheme,
    activeSection, setActiveSection, searchQuery, setSearchQuery, selectedCategory, setSelectedCategory, selectedBrand, setSelectedBrand, sortBy, setSortBy,
    minPrice, setMinPrice, maxPrice, setMaxPrice, inStockOnly, setInStockOnly, onSaleOnly, setOnSaleOnly, minRating, setMinRating, isMobileFilterOpen, setIsMobileFilterOpen,
    selectedDetailProduct, setSelectedDetailProduct, isCartDrawerOpen, setIsCartDrawerOpen, isWishlistDrawerOpen, setIsWishlistDrawerOpen, isAccountModalOpen, setIsAccountModalOpen,
    accountPortalTab, setAccountPortalTab, isOrderTrackingOpen, setIsOrderTrackingOpen, initialTrackingNumber, setInitialTrackingNumber, initialTrackingEmail, setInitialTrackingEmail,
    isNotificationHubOpen, setIsNotificationHubOpen, selectedNotificationOrder, setSelectedNotificationOrder, isClaimModalOpen, setIsClaimModalOpen, claimModalEmail, setClaimModalEmail,
    isSuccessModalOpen, setIsSuccessModalOpen, successOrder, setSuccessOrder, isCheckoutOpen, setIsCheckoutOpen, categories, allBrands, filteredProducts, sortedProducts,
    featuredProducts, bestSellers, newArrivals, recommendedProducts, handleBuyNow, handleClearAllFilters, hasActiveFilters, tenantSlug, goHome, goShop, goCategory, goBrand, goSearch, goProduct, goCart, goCheckout, goAccount
  };
}
