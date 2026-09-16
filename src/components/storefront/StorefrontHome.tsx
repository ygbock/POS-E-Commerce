import React from 'react';
import { Boxes, Clock, Flame, RotateCcw, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { Product } from '../../types';
import { StoreHeroBanner } from './StoreHeroBanner';
import { CategoryShowcase } from './CategoryShowcase';
import { BrandShowcase } from './BrandShowcase';
import { PromotionsBanner } from './PromotionsBanner';
import { ProductCarouselSection } from './ProductCarouselSection';
import { NewsletterSection } from './NewsletterSection';

export interface StorefrontHomeProps {
  selectedCategory: string;
  selectedBrand: string;
  featuredProducts: Product[];
  bestSellers: Product[];
  newArrivals: Product[];
  recommendedProducts: Product[];
  goShop: () => void;
  goCategory: (slug: string) => void;
  goBrand: (slug: string) => void;
  goProduct: (product: Product) => void;
  setOnSaleOnly: (value: boolean) => void;
  setSortBy: (value: 'featured' | 'best-sellers' | 'newest' | 'price-low' | 'price-high' | 'rating') => void;
  setMinRating: (value: number) => void;
  setActiveSection: (value: 'home' | 'catalog') => void;
  onOpenCart: () => void;
}

export const StorefrontHome: React.FC<StorefrontHomeProps> = ({
  selectedCategory, selectedBrand, featuredProducts, bestSellers, newArrivals,
  recommendedProducts, goShop, goCategory, goBrand, goProduct, setOnSaleOnly,
  setSortBy, setMinRating, setActiveSection, onOpenCart,
}) => (
  <div className="space-y-10 sm:space-y-14">
    <StoreHeroBanner
      onExploreCatalog={() => {
        goShop();
        document.getElementById('store-catalog-section')?.scrollIntoView({ behavior: 'smooth' });
      }}
      onFilterNewArrivals={() => {
        document.getElementById('store-new-arrivals')?.scrollIntoView({ behavior: 'smooth' });
      }}
      onFilterDeals={() => {
        setOnSaleOnly(true);
        goShop();
      }}
    />

    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
      {[
        { icon: <Truck className="w-4 h-4 sm:w-5 sm:h-5" />, title: 'Same-Day Dispatch', text: 'Free delivery over $75', tone: 'sky', iconClass: 'bg-sky-500/10 text-sky-400' },
        { icon: <Boxes className="w-4 h-4 sm:w-5 sm:h-5" />, title: 'Live Stock Accuracy', text: 'Zero latency POS sync', tone: 'emerald', iconClass: 'bg-emerald-500/10 text-emerald-400' },
        { icon: <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />, title: 'Authentic Hardware', text: '2-year full warranty', tone: 'indigo', iconClass: 'bg-indigo-500/10 text-indigo-400' },
        { icon: <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />, title: '30-Day Free Returns', text: 'In-store or postal pickup', tone: 'amber', iconClass: 'bg-amber-500/10 text-amber-400' },
      ].map((item) => (
        <div key={item.title} className="p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center space-x-2.5 sm:space-x-3 shadow-lg">
          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl ${item.iconClass} flex items-center justify-center flex-shrink-0`}>
            {item.icon}
          </div>
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-xs">{item.title}</p>
            <p className="text-slate-600 dark:text-slate-400 text-[10px] sm:text-[11px]">{item.text}</p>
          </div>
        </div>
      ))}
    </div>

    <CategoryShowcase selectedCategory={selectedCategory} onSelectCategory={goCategory} />

    <ProductCarouselSection
      id="store-featured-products"
      badgeIcon={<Sparkles className="w-3.5 h-3.5" />}
      badgeText="Handpicked For Quality"
      badgeColorClass="bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30"
      title="Featured Products"
      subtitle="Curated premium hardware, culinary craft, and lifestyle essentials"
      products={featuredProducts}
      onSelectProduct={goProduct}
      actionButton={{ text: 'View All Products', onClick: goShop, colorClass: 'text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300' }}
    />

    <PromotionsBanner onOpenCart={onOpenCart} />

    <ProductCarouselSection
      id="store-best-sellers"
      badgeIcon={<Flame className="w-3.5 h-3.5" />}
      badgeText="Top Rated & High Volume"
      badgeColorClass="bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
      title="Best Sellers"
      subtitle="Customer favorites backed by verified multi-location reviews"
      products={bestSellers}
      onSelectProduct={goProduct}
      actionButton={{ text: 'See Full Leaderboard', onClick: () => { setSortBy('best-sellers'); goShop(); }, colorClass: 'text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300' }}
    />

    <ProductCarouselSection
      id="store-new-arrivals"
      badgeIcon={<Clock className="w-3.5 h-3.5" />}
      badgeText="Just Stocked In Logistics"
      badgeColorClass="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30"
      title="New Arrivals"
      subtitle="Fresh releases with live barcode serial inventory tracking"
      products={newArrivals}
      onSelectProduct={goProduct}
      actionButton={{ text: 'View Recent Stock', onClick: () => { setSortBy('newest'); goShop(); }, colorClass: 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300' }}
    />

    <ProductCarouselSection
      id="store-recommended-products"
      badgeIcon={<Sparkles className="w-3.5 h-3.5" />}
      badgeText="Top Customer Satisfaction (4.5+ Rating)"
      badgeColorClass="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30"
      title="Recommended For You"
      subtitle="Algorithmic matches tailored to high community acclaim and quality scores"
      products={recommendedProducts}
      onSelectProduct={goProduct}
      actionButton={{ text: 'Explore Top Rated', onClick: () => { setMinRating(4.5); goShop(); }, colorClass: 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300' }}
    />

    <BrandShowcase selectedBrand={selectedBrand} onSelectBrand={goBrand} />

    <NewsletterSection onExploreDeals={() => { setOnSaleOnly(true); setActiveSection('catalog'); }} />
  </div>
);
