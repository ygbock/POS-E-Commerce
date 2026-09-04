import React, { useState, useMemo } from 'react';
import {
  Product,
  ProductVariant,
  ProductReview,
} from '../../types';
import { useCommerce } from '../../context/CommerceContext';
import {
  Star,
  CheckCircle2,
  ShieldCheck,
  Truck,
  ArrowRight,
  X,
  ShoppingCart,
  Heart,
  RotateCcw,
  Sparkles,
  Flame,
  Check,
  Building2,
  Layers,
  FileText,
  MessageSquare,
  ThumbsUp,
  Share2,
  MapPin,
  Clock,
  Award,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  AlertCircle,
  Copy,
  CheckCheck,
  PackageCheck,
  Zap,
} from 'lucide-react';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, variant: ProductVariant, qty: number) => void;
  onBuyNow: (product: Product, variant: ProductVariant, qty: number) => void;
  onSelectRelatedProduct?: (product: Product) => void;
}

interface ProductDetailModalContentProps {
  product: Product;
  onClose: () => void;
  onAddToCart: (product: Product, variant: ProductVariant, qty: number) => void;
  onBuyNow: (product: Product, variant: ProductVariant, qty: number) => void;
  onSelectRelatedProduct?: (product: Product) => void;
}

const ProductDetailModalContent: React.FC<ProductDetailModalContentProps> = ({
  product,
  onClose,
  onAddToCart,
  onBuyNow,
  onSelectRelatedProduct,
}) => {
  const {
    formatCurrency,
    getTotalStockForVariant,
    getLocationStockForVariant,
    locations,
    currentRole,
    products,
    toggleWishlist,
    isInWishlist,
    activeCustomerUser,
    addProductReview,
  } = useCommerce();

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant>(
    product.variants && product.variants.length > 0 ? product.variants[0] : ({} as ProductVariant)
  );
  const [selectedImage, setSelectedImage] = useState<string>(
    product.images && product.images.length > 0 ? product.images[0] : ''
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'description' | 'specifications' | 'reviews' | 'shipping'>('description');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [postalCode, setPostalCode] = useState('');
  const [shippingEstimate, setShippingEstimate] = useState<string | null>(null);
  const [helpfulVotes, setHelpfulVotes] = useState<{ [reviewId: string]: boolean }>({});

  // Review form state
  const [isWritingReview, setIsWritingReview] = useState(false);
  const [reviewerName, setReviewerName] = useState(activeCustomerUser?.name || 'Verified Customer');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  // Sync state if product changes
  React.useEffect(() => {
    if (product) {
      setSelectedVariant(product.variants?.[0] || ({} as ProductVariant));
      setSelectedImage(product.images?.[0] || '');
      setQuantity(1);
      setShippingEstimate(null);
      setIsWritingReview(false);
    }
  }, [product?.id]);

  const availableStock = selectedVariant?.id ? getTotalStockForVariant(selectedVariant) : 0;
  const isOutOfStock = availableStock <= 0;
  const isWishlisted = isInWishlist(product.id);

  // Price calculations
  const priceToDisplay =
    currentRole === 'E-commerce Customer'
      ? selectedVariant?.retailPrice || 0
      : selectedVariant?.memberPrice || selectedVariant?.retailPrice || 0;

  const compareAtPrice = selectedVariant?.compareAtPrice || (product.compareAtPrice ? product.compareAtPrice : null);
  const discountPercent =
    compareAtPrice && compareAtPrice > priceToDisplay
      ? Math.round(((compareAtPrice - priceToDisplay) / compareAtPrice) * 100)
      : null;

  // Image index tracking
  const currentImageIdx = product.images.indexOf(selectedImage);

  const handleNextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!product.images || product.images.length === 0) return;
    const nextIdx = (currentImageIdx + 1) % product.images.length;
    setSelectedImage(product.images[nextIdx]);
  };

  const handlePrevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!product.images || product.images.length === 0) return;
    const prevIdx = (currentImageIdx - 1 + product.images.length) % product.images.length;
    setSelectedImage(product.images[prevIdx]);
  };

  // Share functionality
  const handleShareProduct = async () => {
    const shareData = {
      title: product.name,
      text: `${product.name} on Aura Commerce - ${product.shortDescription}`,
      url: window.location.href,
    };

    if (navigator.share && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or share failed, fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Ignore clipboard write errors
    }
  };

  // Review submission
  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTitle.trim() || !reviewComment.trim()) return;

    addProductReview(product.id, {
      author: reviewerName.trim() || 'Verified Customer',
      rating: reviewRating,
      title: reviewTitle.trim(),
      comment: reviewComment.trim(),
      verifiedPurchase: true,
    });

    setReviewSubmitted(true);
    setReviewTitle('');
    setReviewComment('');
    setTimeout(() => {
      setIsWritingReview(false);
      setReviewSubmitted(false);
    }, 2000);
  };

  // Toggle helpful vote
  const toggleHelpful = (reviewId: string) => {
    setHelpfulVotes((prev) => ({
      ...prev,
      [reviewId]: !prev[reviewId],
    }));
  };

  // Shipping estimate calculator
  const handleCalculateShipping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!postalCode.trim()) return;
    setShippingEstimate(`Estimated Delivery to ${postalCode.trim().toUpperCase()}: 2 business days via Express Priority (Free Shipping)`);
  };

  // Review rating breakdown stats
  const reviewsList = product.reviewsList || [];
  const totalReviewsCount = reviewsList.length || product.reviewCount || 1;
  const ratingDistribution = useMemo(() => {
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    if (reviewsList.length > 0) {
      reviewsList.forEach((r) => {
        const star = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
        dist[star] = (dist[star] || 0) + 1;
      });
    } else {
      dist[5] = Math.round(totalReviewsCount * 0.75);
      dist[4] = Math.round(totalReviewsCount * 0.2);
      dist[3] = Math.round(totalReviewsCount * 0.05);
    }
    return dist;
  }, [reviewsList, totalReviewsCount]);

  // Related products from same category or brand
  const relatedProducts = products
    .filter((p) => p.id !== product.id && (p.category === product.category || p.brand === product.brand))
    .slice(0, 4);

  return (
    <>
      <div
        id="product-detail-modal-backdrop"
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 lg:p-6 animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          id="product-detail-modal-container"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-[28px] sm:rounded-3xl w-full max-w-6xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 text-slate-900 dark:text-white max-h-[92vh] sm:max-h-[90vh] flex flex-col mt-8 sm:mt-0 relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mobile Sheet Drag Handle Indicator */}
          <div className="sm:hidden w-full flex justify-center pt-2.5 pb-1 flex-shrink-0 bg-slate-50 dark:bg-slate-900">
            <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
          </div>

          {/* Top Sticky Bar */}
          <div className="px-4 sm:px-6 py-3 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0 z-20">
            {/* Breadcrumbs */}
            <div className="flex items-center space-x-2 text-xs truncate mr-2">
              <span className="font-black uppercase tracking-wider text-sky-600 dark:text-sky-400 truncate">
                {product.brand}
              </span>
              <span className="text-slate-400 dark:text-slate-600">/</span>
              <span className="text-slate-600 dark:text-slate-300 font-medium truncate">
                {product.category}
              </span>
              {product.subcategory && (
                <>
                  <span className="text-slate-400 dark:text-slate-600 hidden md:inline">/</span>
                  <span className="text-slate-500 dark:text-slate-400 hidden md:inline truncate">
                    {product.subcategory}
                  </span>
                </>
              )}
            </div>

            {/* Quick Actions Header: Wishlist, Share, Close */}
            <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
              <button
                onClick={handleShareProduct}
                className="p-2 sm:px-3 sm:py-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                title="Share product link"
                aria-label="Share product"
              >
                {copiedLink ? (
                  <>
                    <CheckCheck className="w-4 h-4 text-emerald-500" />
                    <span className="hidden sm:inline text-emerald-500 font-bold">Link Copied</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Share</span>
                  </>
                )}
              </button>

              <button
                onClick={() => toggleWishlist(product.id)}
                className={`p-2 sm:px-3 sm:py-1.5 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                  isWishlisted
                    ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/80'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
                title={isWishlisted ? 'Remove from Wishlist' : 'Save to Wishlist'}
                aria-label="Toggle wishlist"
              >
                <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-rose-500 text-rose-500' : ''}`} />
                <span className="hidden sm:inline">{isWishlisted ? 'Saved' : 'Wishlist'}</span>
              </button>

              <button
                id="btn-close-product-detail-modal"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Scrollable Content Area */}
          <div className="p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-8 sm:space-y-10 custom-scrollbar pb-28 lg:pb-8 flex-1">
            {/* Top Grid: Gallery (Col 5) & Buy Box (Col 7) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-10">
              {/* Left Column: Media Gallery & Assurance */}
              <div className="lg:col-span-5 space-y-4">
                {/* Main Featured Image Container */}
                <div className="aspect-square sm:aspect-[4/3] lg:aspect-square w-full rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 relative group select-none shadow-sm">
                  <img
                    src={selectedImage}
                    alt={product.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />

                  {/* Left & Right Image Switch Arrows (Desktop & Mobile) */}
                  {product.images.length > 1 && (
                    <>
                      <button
                        onClick={handlePrevImage}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white shadow-lg backdrop-blur-md border border-white/20 flex items-center justify-center opacity-85 hover:opacity-100 hover:scale-110 transition-all z-10 cursor-pointer"
                        aria-label="Previous image"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleNextImage}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white shadow-lg backdrop-blur-md border border-white/20 flex items-center justify-center opacity-85 hover:opacity-100 hover:scale-110 transition-all z-10 cursor-pointer"
                        aria-label="Next image"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </>
                  )}

                  {/* Floating Badges */}
                  <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10 pointer-events-none">
                    {discountPercent && discountPercent > 0 && (
                      <span className="inline-flex items-center gap-1 bg-rose-600 text-white text-[11px] font-black px-2.5 py-1 rounded-full shadow-md">
                        <Flame className="w-3.5 h-3.5" />
                        <span>SAVE {discountPercent}%</span>
                      </span>
                    )}
                    {product.featured && (
                      <span className="inline-flex items-center gap-1 bg-sky-500 text-slate-950 text-[11px] font-black px-2.5 py-1 rounded-full shadow-md">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>FEATURED</span>
                      </span>
                    )}
                    {availableStock <= 3 && availableStock > 0 && (
                      <span className="inline-flex items-center gap-1 bg-amber-500 text-slate-950 text-[11px] font-black px-2.5 py-1 rounded-full shadow-md">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>ONLY {availableStock} LEFT</span>
                      </span>
                    )}
                  </div>

                  {/* Expand Lightbox Button */}
                  <button
                    onClick={() => setIsLightboxOpen(true)}
                    className="absolute bottom-3 right-3 p-2 rounded-xl bg-slate-900/80 hover:bg-slate-900 backdrop-blur-md text-white border border-white/20 shadow-md transition-all opacity-80 sm:opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="View full resolution"
                    aria-label="Expand image"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>

                  {/* Image Counter Badge */}
                  {product.images.length > 1 && (
                    <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-white text-[11px] font-semibold border border-white/10">
                      {currentImageIdx + 1} / {product.images.length}
                    </div>
                  )}
                </div>

                {/* Gallery Row: Thumbnails and Trust Badges in the exact same row */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  {/* Thumbnails Ribbon */}
                  {product.images.length > 1 ? (
                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar snap-x flex-1 min-w-0">
                      {product.images.map((img, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedImage(img)}
                          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 transition-all flex-shrink-0 relative snap-start cursor-pointer ${
                            selectedImage === img
                              ? 'border-sky-500 shadow-md ring-2 ring-sky-500/30 scale-105'
                              : 'border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100'
                          }`}
                          aria-label={`Select product image ${idx + 1}`}
                        >
                          <img
                            src={img}
                            alt={`${product.name} thumbnail ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex-1" />
                  )}

                  {/* Assurance & Trust Badges - In the same row as gallery */}
                  <div className="flex items-center justify-end flex-nowrap gap-2.5 sm:gap-4 text-[10px] sm:text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap flex-shrink-0 ml-auto">
                    <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                      <Truck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-500 dark:text-sky-400 flex-shrink-0" />
                      <span>Free Express Dispatch</span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                      <span>2-Year Warranty</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Title, Pricing, Variants, Multi-Warehouse Sync & Purchase Actions */}
              <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                <div className="space-y-5">
                  {/* Brand, Title & Reviews Anchor */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 px-2.5 py-0.5 rounded-md border border-sky-200 dark:border-sky-800/60">
                        {product.brand}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        SKU: {selectedVariant.sku || 'AURA-001'}
                      </span>
                    </div>

                    <h1
                      className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-white truncate"
                      title={product.name}
                    >
                      {product.name}
                    </h1>

                    {/* Rating, Reviews Counter & Stock Pulse */}
                    <div className="flex flex-wrap items-center gap-3 text-xs pt-0.5">
                      <div className="flex items-center text-amber-500">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        <span className="font-black ml-1 text-slate-900 dark:text-white">
                          {product.rating.toFixed(1)}
                        </span>
                      </div>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <button
                        onClick={() => setActiveTab('reviews')}
                        className="text-sky-600 dark:text-sky-400 hover:underline font-semibold cursor-pointer"
                      >
                        {reviewsList.length || product.reviewCount} customer reviews
                      </button>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        Unit: {product.unit || 'pcs'}
                      </span>
                    </div>
                  </div>

                  {/* Live Price & Dynamic Discount Card */}
                  <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-baseline gap-2.5">
                          <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                            {formatCurrency(priceToDisplay)}
                          </span>
                          {compareAtPrice && compareAtPrice > priceToDisplay && (
                            <span className="text-base text-slate-400 dark:text-slate-500 line-through font-semibold">
                              {formatCurrency(compareAtPrice)}
                            </span>
                          )}
                        </div>
                        {compareAtPrice && compareAtPrice > priceToDisplay && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-1 flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Save {formatCurrency(compareAtPrice - priceToDisplay)} ({discountPercent}% Discount)</span>
                          </p>
                        )}
                      </div>

                      {/* Stock Badge */}
                      <div className="text-left sm:text-right">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black shadow-sm ${
                            availableStock > 5
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/80'
                              : availableStock > 0
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800/80'
                              : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800/80'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full animate-pulse ${
                              availableStock > 0 ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          {availableStock > 0 ? `${availableStock} in Stock (Live Sync)` : 'Out of Stock'}
                        </span>
                      </div>
                    </div>

                    {/* Real Multi-Location Inventory & Fulfillment Hub Status */}
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-700/60 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Omnichannel Stock Availability:
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2 pt-0.5">
                        {locations && locations.length > 0 ? (
                          locations.map((loc) => {
                            const locQty = getLocationStockForVariant(selectedVariant, loc.id);
                            return (
                              <div
                                key={loc.id}
                                className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 dark:border-slate-800 text-[11px] min-w-0"
                              >
                                <span className="flex items-center gap-1.5 truncate mr-1.5 min-w-0">
                                  <Building2 className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 flex-shrink-0" />
                                  <span className="truncate font-medium text-slate-800 dark:text-slate-200">{loc.name}</span>
                                </span>
                                <span className={`font-bold flex-shrink-0 text-[10px] sm:text-[11px] ${locQty > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                  {locQty > 0 ? `${locQty} ready` : 'Transferable'}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <>
                            <div className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] min-w-0">
                              <span className="flex items-center gap-1.5 truncate mr-1.5 min-w-0">
                                <Building2 className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 flex-shrink-0" />
                                <span className="truncate font-medium">Central Distribution Hub</span>
                              </span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px] sm:text-[11px] flex-shrink-0">Ready to Dispatch</span>
                            </div>
                            <div className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] min-w-0">
                              <span className="flex items-center gap-1.5 truncate mr-1.5 min-w-0">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                                <span className="truncate font-medium">Downtown Flagship Store</span>
                              </span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px] sm:text-[11px] flex-shrink-0">Click & Collect</span>
                            </div>
                            <div className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] min-w-0">
                              <span className="flex items-center gap-1.5 truncate mr-1.5 min-w-0">
                                <Building2 className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 flex-shrink-0" />
                                <span className="truncate font-medium">North Branch Store</span>
                              </span>
                              <span className="text-sky-600 dark:text-sky-400 font-bold text-[10px] sm:text-[11px] flex-shrink-0">Transferable</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Variant Selection Chips */}
                  {product.variants && product.variants.length > 1 && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Select Variant / Option:
                        </label>
                        <span className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                          Selected: {selectedVariant.name}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {product.variants.map((v) => {
                          const vStock = getTotalStockForVariant(v);
                          const isSelected = selectedVariant.id === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setSelectedVariant(v)}
                              className={`p-3 rounded-xl border text-left transition-all relative cursor-pointer ${
                                isSelected
                                  ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-500 text-slate-900 dark:text-white shadow-sm ring-2 ring-sky-500/20'
                                  : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                              }`}
                            >
                              {isSelected && (
                                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-sky-500" />
                              )}
                              <p className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                {v.name}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {formatCurrency(v.retailPrice)} • {vStock > 0 ? `${vStock} in stock` : 'Sold out'}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Short Description */}
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {product.shortDescription}
                  </p>
                </div>

                {/* Desktop Quantity & Action Buttons (Hidden on mobile & tablet since available in bottom dock) */}
                <div className="hidden lg:block space-y-3 pt-5 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center space-x-3">
                    {/* Stepper */}
                    <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 p-1">
                      <button
                        type="button"
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        disabled={quantity <= 1 || isOutOfStock}
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-black text-base disabled:opacity-30 transition-colors cursor-pointer"
                        aria-label="Decrease quantity"
                      >
                        -
                      </button>
                      <span className="w-10 text-center font-black text-slate-900 dark:text-white text-sm">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}
                        disabled={quantity >= availableStock || isOutOfStock}
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-black text-base disabled:opacity-30 transition-colors cursor-pointer"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    {/* Add to Cart */}
                    <button
                      type="button"
                      id="btn-modal-add-to-cart"
                      disabled={isOutOfStock}
                      onClick={() => {
                        onAddToCart(product, selectedVariant, quantity);
                        onClose();
                      }}
                      className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 disabled:opacity-40 text-slate-900 dark:text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-700 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <ShoppingCart className="w-4 h-4 text-sky-500" />
                      <span>Add to Cart ({formatCurrency(priceToDisplay * quantity)})</span>
                    </button>
                  </div>

                  {/* Express Buy Now */}
                  <button
                    type="button"
                    id="btn-modal-express-buy-now"
                    disabled={isOutOfStock}
                    onClick={() => {
                      onBuyNow(product, selectedVariant, quantity);
                      onClose();
                    }}
                    className="w-full py-3.5 bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-600 hover:opacity-95 disabled:opacity-40 text-white rounded-xl text-xs sm:text-sm font-black shadow-lg shadow-sky-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <Zap className="w-4 h-4 fill-current" />
                    <span>Express Buy Now ({formatCurrency(priceToDisplay * quantity)})</span>
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Tabbed Content Section: Description, Specifications, Reviews, Shipping */}
            <div className="space-y-5 pt-6 border-t border-slate-200 dark:border-slate-800">
              {/* Tab Navigation Ribbon */}
              <div className="flex space-x-2 sm:space-x-4 border-b border-slate-200 dark:border-slate-800 text-xs font-bold overflow-x-auto whitespace-nowrap custom-scrollbar pb-1">
                <button
                  onClick={() => setActiveTab('description')}
                  className={`py-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-2 flex-shrink-0 cursor-pointer ${
                    activeTab === 'description'
                      ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-black'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Overview & Highlights</span>
                </button>

                <button
                  onClick={() => setActiveTab('specifications')}
                  className={`py-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-2 flex-shrink-0 cursor-pointer ${
                    activeTab === 'specifications'
                      ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-black'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Technical Specs</span>
                </button>

                <button
                  onClick={() => setActiveTab('reviews')}
                  className={`py-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-2 flex-shrink-0 cursor-pointer ${
                    activeTab === 'reviews'
                      ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-black'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Verified Reviews ({reviewsList.length || product.reviewCount})</span>
                </button>

                <button
                  onClick={() => setActiveTab('shipping')}
                  className={`py-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-2 flex-shrink-0 cursor-pointer ${
                    activeTab === 'shipping'
                      ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-black'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Truck className="w-4 h-4" />
                  <span>Delivery & Returns</span>
                </button>
              </div>

              {/* Tab 1: Description */}
              {activeTab === 'description' && (
                <div className="space-y-6 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed animate-in fade-in duration-150">
                  <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <p className="font-semibold text-slate-900 dark:text-white leading-relaxed">
                      {product.description}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/10 dark:bg-sky-500/20 text-sky-500 dark:text-sky-400 flex items-center justify-center mb-2">
                        <Award className="w-4 h-4" />
                      </div>
                      <p className="font-bold text-slate-900 dark:text-white text-xs">Authentic Hardware</p>
                      <p className="text-slate-500 dark:text-slate-400 text-xs">
                        100% genuine factory sealed inventory with official manufacturer guarantees.
                      </p>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 flex items-center justify-center mb-2">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <p className="font-bold text-slate-900 dark:text-white text-xs">Omnichannel Allocation</p>
                      <p className="text-slate-500 dark:text-slate-400 text-xs">
                        Instant stock reservation across retail registers and automated regional fulfillment centers.
                      </p>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center mb-2">
                        <RotateCcw className="w-4 h-4" />
                      </div>
                      <p className="font-bold text-slate-900 dark:text-white text-xs">30-Day Easy Returns</p>
                      <p className="text-slate-500 dark:text-slate-400 text-xs">
                        Full satisfaction guarantee with prepaid return shipping labels generated instantly.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Technical Specifications */}
              {activeTab === 'specifications' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-200 dark:divide-slate-800/80 text-xs">
                    <div className="grid grid-cols-3 p-3.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                      <span className="font-bold text-slate-500 dark:text-slate-400">Brand / Manufacturer</span>
                      <span className="col-span-2 font-semibold text-slate-900 dark:text-white">{product.brand}</span>
                    </div>
                    <div className="grid grid-cols-3 p-3.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                      <span className="font-bold text-slate-500 dark:text-slate-400">Category & Subcategory</span>
                      <span className="col-span-2 font-semibold text-slate-900 dark:text-white">
                        {product.category} {product.subcategory ? `› ${product.subcategory}` : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 p-3.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                      <span className="font-bold text-slate-500 dark:text-slate-400">Primary SKU</span>
                      <span className="col-span-2 font-mono text-sky-600 dark:text-sky-400 font-bold">{selectedVariant.sku}</span>
                    </div>
                    <div className="grid grid-cols-3 p-3.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                      <span className="font-bold text-slate-500 dark:text-slate-400">UPC / Barcode</span>
                      <span className="col-span-2 font-mono text-slate-700 dark:text-slate-300">
                        {selectedVariant.barcode || '789123456789'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 p-3.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                      <span className="font-bold text-slate-500 dark:text-slate-400">Unit of Measurement</span>
                      <span className="col-span-2 font-semibold text-slate-900 dark:text-white">{product.unit || 'Pieces (pcs)'}</span>
                    </div>
                    {product.specifications && product.specifications.length > 0 ? (
                      product.specifications.map((spec, idx) => (
                        <div key={idx} className="grid grid-cols-3 p-3.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                          <span className="font-bold text-slate-500 dark:text-slate-400">{spec.name}</span>
                          <span className="col-span-2 text-slate-900 dark:text-white font-medium">{spec.value}</span>
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="grid grid-cols-3 p-3.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                          <span className="font-bold text-slate-500 dark:text-slate-400">Stock Threshold</span>
                          <span className="col-span-2 font-medium text-slate-900 dark:text-white">
                            Low-stock alert at {selectedVariant.lowStockThreshold || 5} units
                          </span>
                        </div>
                        <div className="grid grid-cols-3 p-3.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                          <span className="font-bold text-slate-500 dark:text-slate-400">Quality Guarantee</span>
                          <span className="col-span-2 font-medium text-slate-900 dark:text-white">ISO 9001 Certified Quality Inspection</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Customer Reviews */}
              {activeTab === 'reviews' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  {/* Reviews Summary & Breakdown Card */}
                  <div className="p-5 sm:p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                    {/* Overall Score */}
                    <div className="md:col-span-4 text-center sm:text-left flex flex-col items-center sm:items-start space-y-1">
                      <span className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
                        {product.rating.toFixed(1)}
                      </span>
                      <div className="flex items-center text-amber-400">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-4 h-4 ${
                              s <= Math.round(product.rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-700'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                        Based on {totalReviewsCount} verified customer ratings
                      </p>
                    </div>

                    {/* Rating Distribution Bars */}
                    <div className="md:col-span-5 space-y-1.5 text-xs">
                      {[5, 4, 3, 2, 1].map((stars) => {
                        const count = ratingDistribution[stars as 1 | 2 | 3 | 4 | 5] || 0;
                        const pct = Math.round((count / totalReviewsCount) * 100) || 0;
                        return (
                          <div key={stars} className="flex items-center space-x-2">
                            <span className="w-7 text-slate-500 dark:text-slate-400 font-semibold text-right">{stars}★</span>
                            <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                              <div
                                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-8 text-right text-slate-500 dark:text-slate-400 font-medium text-[11px]">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Write Review Trigger */}
                    <div className="md:col-span-3 flex justify-center md:justify-end">
                      <button
                        onClick={() => setIsWritingReview(!isWritingReview)}
                        className="px-5 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 transition-all cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>{isWritingReview ? 'Cancel Review' : 'Write a Review'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Interactive Review Form */}
                  {isWritingReview && (
                    <form
                      onSubmit={handleReviewSubmit}
                      className="p-5 sm:p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-sky-500/30 dark:border-sky-500/40 space-y-4 text-xs animate-in fade-in duration-150"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/80 pb-3">
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                          Write a Verified Review
                        </h4>
                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">Instant live sync</span>
                      </div>

                      {reviewSubmitted ? (
                        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-300 flex items-center gap-2 font-bold">
                          <Check className="w-4 h-4" />
                          <span>Thank you! Your verified review has been published.</span>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                                Your Display Name
                              </label>
                              <input
                                type="text"
                                required
                                value={reviewerName}
                                onChange={(e) => setReviewerName(e.target.value)}
                                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                                Star Rating
                              </label>
                              <div className="flex items-center space-x-1 pt-1.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    type="button"
                                    key={star}
                                    onClick={() => setReviewRating(star)}
                                    className="p-1 text-amber-400 hover:scale-125 transition-transform cursor-pointer"
                                    aria-label={`Rate ${star} star`}
                                  >
                                    <Star
                                      className={`w-6 h-6 ${
                                        star <= reviewRating
                                          ? 'fill-amber-400 text-amber-400'
                                          : 'text-slate-300 dark:text-slate-700'
                                      }`}
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                                Headline / Summary
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Flawless performance and outstanding craftsmanship"
                              value={reviewTitle}
                              onChange={(e) => setReviewTitle(e.target.value)}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                              Detailed Feedback
                            </label>
                            <textarea
                              rows={3}
                              required
                              placeholder="Share your practical experience on build quality, reliability, and value..."
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                            />
                          </div>

                          <div className="flex justify-end pt-1">
                            <button
                              type="submit"
                              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                            >
                              Submit Review
                            </button>
                          </div>
                        </>
                      )}
                    </form>
                  )}

                  {/* Reviews List */}
                  <div className="space-y-3.5">
                    {reviewsList.length > 0 ? (
                      reviewsList.map((rev) => {
                        const isVotedHelpful = helpfulVotes[rev.id];
                        const totalHelpful = (rev.helpfulCount || 0) + (isVotedHelpful ? 1 : 0);
                        return (
                          <div
                            key={rev.id}
                            className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs transition-colors"
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-900 dark:text-white text-sm">
                                  {rev.author}
                                </span>
                                {rev.verifiedPurchase && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/80 font-semibold">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Verified Purchase</span>
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 dark:text-slate-500">{rev.date}</span>
                            </div>

                            <div className="flex items-center text-amber-400 space-x-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`w-3.5 h-3.5 ${
                                    s <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-700'
                                  }`}
                                />
                              ))}
                            </div>

                            <h5 className="font-bold text-slate-900 dark:text-white text-sm">{rev.title}</h5>
                            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{rev.comment}</p>

                            <div className="pt-1 flex items-center justify-between border-t border-slate-200/60 dark:border-slate-700/60 text-[11px]">
                              <button
                                onClick={() => toggleHelpful(rev.id)}
                                className={`flex items-center gap-1.5 transition-colors font-medium cursor-pointer ${
                                  isVotedHelpful
                                    ? 'text-sky-600 dark:text-sky-400 font-bold'
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                              >
                                <ThumbsUp className="w-3.5 h-3.5" />
                                <span>Helpful ({totalHelpful})</span>
                              </button>
                              <span className="text-slate-400 dark:text-slate-500">Certified Review</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-10 text-center text-slate-500 dark:text-slate-400 text-xs space-y-2">
                        <MessageSquare className="w-8 h-8 mx-auto text-slate-400 dark:text-slate-600 opacity-50" />
                        <p className="font-medium">No written reviews yet for this product variant.</p>
                        <p className="text-[11px]">Be the first to share your experience!</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 4: Shipping & Returns */}
              {activeTab === 'shipping' && (
                <div className="space-y-6 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed animate-in fade-in duration-150">
                  {/* Shipping Estimator Card */}
                  <div className="p-5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                      <span>Estimate Delivery Date for Your Location</span>
                    </h4>
                    <form onSubmit={handleCalculateShipping} className="flex gap-2 max-w-md">
                      <input
                        type="text"
                        placeholder="Enter ZIP / Postal Code (e.g. 90210)"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-slate-900 dark:bg-sky-500 text-white dark:text-slate-950 rounded-xl font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        Calculate
                      </button>
                    </form>
                    {shippingEstimate && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80 rounded-xl text-emerald-700 dark:text-emerald-300 font-semibold text-xs flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>{shippingEstimate}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                      <p className="font-bold text-slate-900 dark:text-white text-xs">Standard & Express Dispatch</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Orders placed before 2:00 PM EST qualify for same-day dispatch from our central distribution network.
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                      <p className="font-bold text-slate-900 dark:text-white text-xs">Free Local In-Store Pickup</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Select "In-Store Pickup" during checkout to collect your items from any nearby retail store in 2 hours or less.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Related Products Carousel / Grid */}
            {relatedProducts.length > 0 && (
              <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                      Frequently Bought Together
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Top recommended companions from {product.brand} and {product.category}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  {relatedProducts.map((rel) => {
                    const relPrice = rel.variants[0]?.retailPrice || 0;
                    return (
                      <div
                        key={rel.id}
                        onClick={() => {
                          if (onSelectRelatedProduct) {
                            onSelectRelatedProduct(rel);
                          } else {
                            setSelectedVariant(rel.variants[0] || ({} as ProductVariant));
                            setSelectedImage(rel.images[0] || '');
                          }
                        }}
                        className="p-3 bg-slate-50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-sky-500/50 rounded-2xl cursor-pointer transition-all duration-200 space-y-2 group shadow-sm hover:shadow-md"
                      >
                        <div className="aspect-square w-full rounded-xl bg-slate-100 dark:bg-slate-950 overflow-hidden relative">
                          <img
                            src={rel.images[0]}
                            alt={rel.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                            {rel.brand}
                          </p>
                          <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate group-hover:text-sky-500 transition-colors">
                            {rel.name}
                          </h4>
                          <p className="text-xs font-black text-slate-900 dark:text-white mt-1">
                            {formatCurrency(relPrice)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Mobile & Tablet Sticky Bottom Action Bar (Fixed, with Safe Area Inset) */}
          <div
            id="mobile-product-detail-bottom-dock"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            className="lg:hidden p-3 sm:p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 sm:gap-3 flex-shrink-0 z-30 shadow-2xl"
          >
            {/* Quantity Stepper */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 p-0.5 sm:p-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1 || isOutOfStock}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-black text-sm sm:text-base disabled:opacity-30 transition-colors cursor-pointer"
                aria-label="Decrease quantity"
              >
                -
              </button>
              <span className="w-7 sm:w-8 text-center font-black text-slate-900 dark:text-white text-xs sm:text-sm">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}
                disabled={quantity >= availableStock || isOutOfStock}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-black text-sm sm:text-base disabled:opacity-30 transition-colors cursor-pointer"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            {/* Mobile & Tablet Add to Cart */}
            <button
              type="button"
              id="btn-dock-add-to-cart"
              disabled={isOutOfStock}
              onClick={() => {
                onAddToCart(product, selectedVariant, quantity);
                onClose();
              }}
              className="flex-1 py-3 sm:py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 disabled:opacity-40 text-slate-900 dark:text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 border border-slate-300 dark:border-slate-700 transition-colors active:scale-95 cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4 text-sky-500 dark:text-sky-400 flex-shrink-0" />
              <span>Add to Cart</span>
            </button>

            {/* Mobile & Tablet Express Buy Now */}
            <button
              type="button"
              id="btn-dock-express-buy-now"
              disabled={isOutOfStock}
              onClick={() => {
                onBuyNow(product, selectedVariant, quantity);
                onClose();
              }}
              className="flex-1 py-3 sm:py-3.5 bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-600 hover:opacity-95 disabled:opacity-40 text-white rounded-xl text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-1.5 sm:gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current flex-shrink-0" />
              <span className="truncate">Buy Now ({formatCurrency(priceToDisplay * quantity)})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Full Resolution Lightbox Preview */}
      {isLightboxOpen && (
        <div
          id="product-lightbox-preview"
          className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-4 right-4 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
            aria-label="Close lightbox"
          >
            <X className="w-6 h-6" />
          </button>

          <div
            className="relative max-w-4xl max-h-[85vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImage}
              alt={product.name}
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
            />

            {product.images.length > 1 && (
              <>
                <button
                  onClick={handlePrevImage}
                  className="absolute -left-4 sm:-left-12 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center backdrop-blur transition-all"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={handleNextImage}
                  className="absolute -right-4 sm:-right-12 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center backdrop-blur transition-all"
                  aria-label="Next image"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          <p className="text-slate-400 text-xs mt-4">
            {product.name} • Image {currentImageIdx + 1} of {product.images.length}
          </p>
        </div>
      )}
    </>
  );
};

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
  onBuyNow,
  onSelectRelatedProduct,
}) => {
  if (!product) return null;

  return (
    <ProductDetailModalContent
      product={product}
      onClose={onClose}
      onAddToCart={onAddToCart}
      onBuyNow={onBuyNow}
      onSelectRelatedProduct={onSelectRelatedProduct}
    />
  );
};
