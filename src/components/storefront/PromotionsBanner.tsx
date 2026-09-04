import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Tag,
  Copy,
  Check,
  Percent,
  ChevronLeft,
  ChevronRight,
  Gift,
  Zap,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';

interface PromotionsBannerProps {
  onOpenCart?: () => void;
}

const ACTIVE_COUPONS = [
  {
    code: 'WELCOME20',
    title: '$20 OFF First Order',
    description: 'Valid on storewide orders above $100',
    type: 'fixed',
    value: '$20',
    color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/40',
  },
  {
    code: 'VIP15',
    title: '15% OFF Member Orders',
    description: 'Exclusive tier savings on orders above $150',
    type: 'percentage',
    value: '15%',
    color: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40',
  },
  {
    code: 'FREESHIP',
    title: 'Free Express Dispatch',
    description: 'Zero shipping fee across all domestic orders',
    type: 'fixed',
    value: 'Free Shipping',
    color: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40',
  },
  {
    code: 'AUDIO10',
    title: '10% OFF Acoustic Gear',
    description: 'Save on studio headphones, speakers & DACs',
    type: 'percentage',
    value: '10%',
    color: 'bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-500/40',
  },
  {
    code: 'GUEST5',
    title: '$5 Fast Checkout Voucher',
    description: 'Instant discount valid on any cart size',
    type: 'fixed',
    value: '$5',
    color: 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/40',
  },
];

export const PromotionsBanner: React.FC<PromotionsBannerProps> = ({ onOpenCart }) => {
  const { applyCoupon, appliedCoupon } = useCommerce();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 4);
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
  }, [checkScroll]);

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

  const handleCopyAndApply = (code: string) => {
    navigator.clipboard?.writeText(code);
    applyCoupon(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <section id="store-promotions" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-[11px] font-bold uppercase tracking-wider mb-1">
            <Tag className="w-3.5 h-3.5" />
            <span>Storewide Savings</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Active Promotions & Coupons
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Click any voucher to automatically apply it to your checkout session
          </p>
        </div>

        {/* Scroll Buttons */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            aria-label="Scroll coupons left"
            className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900 disabled:hover:text-slate-700 dark:disabled:hover:text-slate-300 transition-all shadow-xs"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            aria-label="Scroll coupons right"
            className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900 disabled:hover:text-slate-700 dark:disabled:hover:text-slate-300 transition-all shadow-xs"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Coupons Container */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 pt-1 no-scrollbar focus:outline-none"
        tabIndex={0}
        role="region"
        aria-label="Promotions carousel"
      >
        {ACTIVE_COUPONS.map((promo) => {
          const isApplied = appliedCoupon?.code === promo.code;
          const isCopied = copiedCode === promo.code;

          return (
            <div
              key={promo.code}
              className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all duration-200 flex flex-col justify-between space-y-4 relative overflow-hidden shadow-xs flex-shrink-0 w-full sm:w-[calc(50%-8px)] md:w-[calc(33.333%-11px)] lg:w-[calc(33.333%-11px)] xl:w-[calc(25%-12px)] snap-start snap-always ${
                isApplied
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/30'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {/* Dashed voucher indicator */}
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <div
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${promo.color} border`}
                  >
                    <Percent className="w-3 h-3" />
                    <span>{promo.value}</span>
                  </div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">{promo.title}</h3>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-normal">{promo.description}</p>
                </div>
              </div>

              {/* Coupon Action Button */}
              <div className="flex items-center justify-between pt-3 border-t border-dashed border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black tracking-widest text-indigo-600 dark:text-indigo-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                    {promo.code}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopyAndApply(promo.code)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    isApplied
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40'
                      : isCopied
                      ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/40'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-900 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {isApplied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Applied</span>
                    </>
                  ) : isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                      <span>Apply Code</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

