import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Laptop,
  UtensilsCrossed,
  Coffee,
  Shirt,
  Headphones,
  Flame,
  ArrowUpRight,
  Layers,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';

interface CategoryShowcaseProps {
  onSelectCategory: (category: string) => void;
  selectedCategory: string;
}

const CATEGORIES_METADATA = [
  {
    name: 'Electronics',
    tagline: 'High-Fidelity Audio & Wearables',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
    icon: Laptop,
    accent: 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400',
    hoverBorder: 'group-hover:border-indigo-500',
  },
  {
    name: 'Home & Kitchen',
    tagline: 'Precision Barista & Culina Craft',
    image: 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=600&auto=format&fit=crop&q=80',
    icon: UtensilsCrossed,
    accent: 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400',
    hoverBorder: 'group-hover:border-amber-500',
  },
  {
    name: 'Food & Beverage',
    tagline: 'Single-Origin Coffee & Matcha',
    image: 'https://images.unsplash.com/photo-1574914629385-46448b767aec?w=600&auto=format&fit=crop&q=80',
    icon: Coffee,
    accent: 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
    hoverBorder: 'group-hover:border-emerald-500',
  },
  {
    name: 'Apparel',
    tagline: 'Merino Wool & Handcrafted Goods',
    image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&auto=format&fit=crop&q=80',
    icon: Shirt,
    accent: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200',
    hoverBorder: 'group-hover:border-slate-500',
  },
  {
    name: 'Audio & Gadgets',
    tagline: 'Studio Monitors & DAC Acoustics',
    image: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&auto=format&fit=crop&q=80',
    icon: Headphones,
    accent: 'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-500/30 text-sky-600 dark:text-sky-400',
    hoverBorder: 'group-hover:border-sky-500',
  },
  {
    name: 'Specialty Pantry',
    tagline: 'Artisanal Roasts & Organic Syrups',
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
    icon: Flame,
    accent: 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400',
    hoverBorder: 'group-hover:border-rose-500',
  },
];

export const CategoryShowcase: React.FC<CategoryShowcaseProps> = ({
  onSelectCategory,
  selectedCategory,
}) => {
  const { products } = useCommerce();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const getProductCount = (catName: string) => {
    if (catName === 'Audio & Gadgets') {
      return products.filter((p) => (p.category === 'Electronics' || p.tags.includes('Audio')) && p.status === 'active').length;
    }
    if (catName === 'Specialty Pantry') {
      return products.filter((p) => (p.category === 'Food & Beverage' || p.tags.includes('Coffee')) && p.status === 'active').length;
    }
    return products.filter((p) => p.category === catName && p.status === 'active').length;
  };

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

  const handleCategoryClick = (catName: string) => {
    if (catName === 'Audio & Gadgets') {
      onSelectCategory('Electronics');
    } else if (catName === 'Specialty Pantry') {
      onSelectCategory('Food & Beverage');
    } else {
      onSelectCategory(catName);
    }
  };

  return (
    <section id="store-browse-category" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold uppercase tracking-wider mb-1">
            <Layers className="w-3.5 h-3.5" />
            <span>Curated Departments</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Browse By Category
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Instant multi-location stock availability across all lines
          </p>
        </div>

        {/* Scroll Buttons */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            aria-label="Scroll categories left"
            className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900 disabled:hover:text-slate-700 dark:disabled:hover:text-slate-300 transition-all shadow-xs"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            aria-label="Scroll categories right"
            className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900 disabled:hover:text-slate-700 dark:disabled:hover:text-slate-300 transition-all shadow-xs"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Categories Container */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 pt-1 no-scrollbar focus:outline-none"
        tabIndex={0}
        role="region"
        aria-label="Categories carousel"
      >
        {CATEGORIES_METADATA.map((cat) => {
          const count = getProductCount(cat.name);
          const Icon = cat.icon;
          const isSelected = selectedCategory === cat.name;

          return (
            <div
              key={cat.name}
              onClick={() => handleCategoryClick(cat.name)}
              className={`group relative overflow-hidden rounded-2xl p-4 sm:p-5 border cursor-pointer transition-all duration-300 flex flex-col justify-between h-44 sm:h-52 flex-shrink-0 w-full sm:w-[calc(50%-8px)] md:w-[calc(33.333%-11px)] lg:w-[calc(25%-12px)] 2xl:w-[calc(20%-13px)] snap-start snap-always ${
                isSelected
                  ? 'bg-indigo-50/80 dark:bg-slate-800/90 border-indigo-600 shadow-xl shadow-indigo-600/10 ring-2 ring-indigo-600/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 dark:hover:border-slate-700 hover:shadow-xl'
              } ${cat.hoverBorder}`}
            >
              {/* Background Image Layer with Gradient Overlay */}
              <div className="absolute inset-0 z-0">
                <img
                  src={cat.image}
                  alt={cat.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-20 group-hover:opacity-35 group-hover:scale-105 transition-all duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/80 to-white/20 dark:from-slate-950 dark:via-slate-950/70 dark:to-slate-950/40" />
              </div>

              {/* Top Row: Icon + Count */}
              <div className="relative z-10 flex items-center justify-between">
                <div
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${cat.accent} border flex items-center justify-center shadow-xs group-hover:scale-110 transition-transform`}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-white/90 dark:bg-slate-900/80 backdrop-blur-md px-2.5 py-0.5 sm:py-1 rounded-full border border-slate-200 dark:border-slate-700 shadow-xs">
                  {count} <span className="hidden xs:inline">{count === 1 ? 'Product' : 'Products'}</span>
                </span>
              </div>

              {/* Bottom Row: Category Name & Tagline */}
              <div className="relative z-10 space-y-0.5 sm:space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                    {cat.name}
                  </h3>
                  <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 group-hover:text-white group-hover:bg-indigo-600 transition-all flex-shrink-0">
                    <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </div>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-300 font-medium line-clamp-1">{cat.tagline}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

