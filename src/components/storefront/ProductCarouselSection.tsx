import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { Product, ProductVariant } from '../../types';
import { ProductCard } from './ProductCard';

interface ProductCarouselSectionProps {
  id?: string;
  badgeIcon: React.ReactNode;
  badgeText: string;
  badgeColorClass?: string;
  title: string;
  subtitle?: string;
  products: Product[];
  onQuickView?: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onQuickAdd?: (product: Product, variant: ProductVariant) => void;
  actionButton?: {
    text: string;
    onClick: () => void;
    colorClass?: string;
  };
}

export const ProductCarouselSection: React.FC<ProductCarouselSectionProps> = ({
  id,
  badgeIcon,
  badgeText,
  badgeColorClass = 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-500/30',
  title,
  subtitle,
  products,
  onQuickView,
  onSelectProduct,
  onQuickAdd,
  actionButton,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 4);
    // Allow 4px margin of error for fractional scaling
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();

    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, products]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const firstCard = container.firstElementChild as HTMLElement;
    if (!firstCard) return;

    const cardRect = firstCard.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(container);
    const gap = parseFloat(computedStyle.columnGap || computedStyle.gap || '16') || 16;
    const cardStep = cardRect.width + gap;

    // Advance by exact number of fully visible cards (or at least 1 card)
    const visibleCards = Math.max(1, Math.floor((container.clientWidth + 4) / cardStep));
    const scrollAmount = cardStep * visibleCards;

    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  if (!products || products.length === 0) return null;

  return (
    <section id={id} className="space-y-4">
      {/* Header with Title and Scroll Controls */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider mb-1.5 border ${badgeColorClass}`}
          >
            {badgeIcon}
            <span>{badgeText}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>

        {/* Action button & Left/Right Scroll Arrows */}
        <div className="flex items-center justify-between sm:justify-end gap-3">
          {actionButton && (
            <button
              onClick={actionButton.onClick}
              className={`text-xs font-bold flex items-center gap-1 transition-colors ${
                actionButton.colorClass ||
                'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300'
              }`}
            >
              <span>{actionButton.text}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Left / Right Carousel Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              aria-label={`Scroll ${title} left`}
              className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900 disabled:hover:text-slate-700 dark:disabled:hover:text-slate-300 transition-all shadow-xs"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              aria-label={`Scroll ${title} right`}
              className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900 disabled:hover:text-slate-700 dark:disabled:hover:text-slate-300 transition-all shadow-xs"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Scroll Container with Snap Points and Precise Fraction Widths */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 pt-1 no-scrollbar focus:outline-none"
        tabIndex={0}
        role="region"
        aria-label={`${title} carousel`}
      >
        {products.map((product) => (
          <div
            key={product.id}
            className="flex-shrink-0 w-[260px] xs:w-[280px] sm:w-[calc(50%-8px)] md:w-[calc(33.333%-11px)] lg:w-[calc(25%-12px)] 2xl:w-[calc(20%-13px)] snap-start snap-always"
          >
            <ProductCard
              product={product}
              onQuickView={onQuickView}
              onSelectProduct={onSelectProduct}
              onQuickAdd={onQuickAdd}
            />
          </div>
        ))}
      </div>
    </section>
  );
};
