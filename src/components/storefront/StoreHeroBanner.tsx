import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ArrowRight,
  Tag,
  Clock,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Truck,
  RotateCcw,
  Zap,
  Percent,
} from 'lucide-react';

interface StoreHeroBannerProps {
  onExploreCatalog: () => void;
  onFilterNewArrivals: () => void;
  onFilterDeals: () => void;
}

const PROMO_SLIDES = [
  {
    id: 1,
    badge: 'EXCLUSIVE SPRING FLASH SALE',
    badgeColor: 'from-amber-400/20 to-orange-500/20 text-amber-300 border-amber-400/30',
    title: 'Precision Audio & Intelligent Wearables',
    highlight: 'Up to 25% Off',
    subtitle: 'Experience studio acoustic fidelity and aerospace grade titanium smartwatches with real-time stock sync.',
    ctaText: 'Shop Now',
    secondaryCta: 'Claim Coupon WELCOME20',
    bgGradient: 'from-slate-900 via-indigo-950 to-slate-950',
    accentColor: 'text-amber-400',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 2,
    badge: 'BARISTA CRAFT EDITION',
    badgeColor: 'from-amber-400/20 to-amber-500/20 text-amber-300 border-amber-400/30',
    title: 'Artisan Pour-Over & Specialty Roasts',
    highlight: 'Micro-Batch Freshness',
    subtitle: 'Single-origin Ethiopian Yirgacheffe coffee beans paired with 1-degree precision variable temperature kettles.',
    ctaText: 'Shop Kitchen Craft',
    secondaryCta: 'View Brew Gear',
    bgGradient: 'from-slate-900 via-indigo-950 to-slate-950',
    accentColor: 'text-amber-400',
    image: 'https://images.unsplash.com/photo-1574914629385-46448b767aec?w=800&auto=format&fit=crop&q=80',
  },
  {
    id: 3,
    badge: 'LUXURY ESSENTIALS',
    badgeColor: 'from-amber-400/20 to-orange-400/20 text-amber-300 border-amber-400/30',
    title: 'Extra-Fine Australian Merino & Leather',
    highlight: 'Handcrafted Perfection',
    subtitle: '100% natural fibers and vegetable-tanned full-grain Italian leather built for decades of refined travel.',
    ctaText: 'Shop Apparel & Bags',
    secondaryCta: 'View Lookbook',
    bgGradient: 'from-slate-900 via-indigo-950 to-slate-950',
    accentColor: 'text-amber-400',
    image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80',
  },
];

export const StoreHeroBanner: React.FC<StoreHeroBannerProps> = ({
  onExploreCatalog,
  onFilterNewArrivals,
  onFilterDeals,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [timeLeft, setTimeLeft] = useState({ hours: 14, minutes: 42, seconds: 18 });

  // Slide timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % PROMO_SLIDES.length);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  // Flash sale countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, minutes: 59, seconds: 59 };
        if (prev.hours > 0) return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        return { hours: 24, minutes: 0, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const slide = PROMO_SLIDES[currentSlide];

  return (
    <section className="relative">
      {/* Banner Container */}
      <div
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-r ${slide.bgGradient} border border-slate-800 text-white shadow-2xl transition-all duration-700 p-5 sm:p-8 md:p-12`}
      >
        {/* Glow Spheres */}
        <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-24 w-80 h-80 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
          {/* Visual Showcase Card - Ordered 1st on mobile/tablet (top), 2nd on desktop (right) */}
          <div className="order-1 lg:order-2 lg:col-span-5 relative">
            <div className="relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-square w-full rounded-2xl overflow-hidden bg-slate-950/80 border border-slate-700/60 shadow-2xl group">
              <img
                src={slide.image}
                alt="Showcase hero"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent" />

              {/* Floating Live Stock Tag */}
              <div className="absolute top-3 sm:top-4 left-3 sm:left-4 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl flex items-center gap-2 shadow-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[10px] sm:text-[11px] font-bold text-emerald-300">Live Inventory Synced</span>
              </div>

              {/* Floating Promo Tag */}
              <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-4 bg-slate-900/90 backdrop-blur-md border border-slate-750 p-2.5 sm:p-3 rounded-2xl flex items-center justify-between shadow-xl">
                <div>
                  <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">Flash Coupon</p>
                  <p className="text-[11px] sm:text-xs font-black text-amber-300 tracking-wider">WELCOME20</p>
                </div>
                <button
                  onClick={onFilterDeals}
                  className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] sm:text-[11px] font-black shadow transition-all cursor-pointer"
                >
                  Apply Deal
                </button>
              </div>
            </div>
          </div>

          {/* Headlines & CTAs - Ordered 2nd on mobile/tablet (underneath image), 1st on desktop (left) */}
          <div className="order-2 lg:order-1 lg:col-span-7 space-y-4 sm:space-y-6">
            {/* Top Badges Row */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <div
                className={`inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-gradient-to-r ${slide.badgeColor} border text-[10px] sm:text-[11px] font-black uppercase tracking-wider`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{slide.badge}</span>
              </div>

              {/* Countdown pill */}
              <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 text-amber-300 text-[11px] sm:text-xs font-mono font-bold shadow-inner">
                <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
                <span>
                  Ends in {String(timeLeft.hours).padStart(2, '0')}:{String(timeLeft.minutes).padStart(2, '0')}:
                  {String(timeLeft.seconds).padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Title & Accent */}
            <div className="space-y-1.5 sm:space-y-2">
              <h1 className="text-xl sm:text-3xl md:text-5xl font-black tracking-tight text-white leading-tight">
                {slide.title}
              </h1>
              <p className={`text-base sm:text-xl font-bold ${slide.accentColor}`}>
                {slide.highlight}
              </p>
            </div>

            <p className="text-xs sm:text-sm text-slate-200 max-w-xl leading-relaxed">
              {slide.subtitle}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-1 sm:pt-2">
              <button
                id="btn-hero-explore"
                onClick={onExploreCatalog}
                className="flex-1 sm:flex-none px-4 sm:px-6 py-3 sm:py-3.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black shadow-xl shadow-amber-400/20 flex items-center justify-center gap-1.5 sm:gap-2 transition-all hover:scale-[1.02] min-h-[44px]"
              >
                <span>{slide.ctaText}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={onFilterDeals}
                className="flex-1 sm:flex-none px-3 sm:px-5 py-3 sm:py-3.5 bg-slate-800/80 hover:bg-slate-750 text-slate-200 hover:text-white rounded-xl text-xs font-bold border border-slate-700 flex items-center justify-center gap-1.5 sm:gap-2 transition-all min-h-[44px]"
              >
                <Tag className="w-3.5 h-3.5 text-amber-400" />
                <span className="whitespace-nowrap">{slide.secondaryCta}</span>
              </button>
            </div>

            {/* Slide Indicators & Navigation Controls */}
            <div className="flex items-center gap-3 pt-2 sm:pt-4">
              <div className="flex items-center gap-1.5">
                {PROMO_SLIDES.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlide(idx)}
                    aria-label={`Go to slide ${idx + 1}`}
                    className={`h-2 rounded-full transition-all ${
                      currentSlide === idx ? 'w-8 bg-amber-400' : 'w-2.5 bg-slate-700 hover:bg-slate-500'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1.5 ml-auto sm:ml-4">
                <button
                  onClick={() => setCurrentSlide((prev) => (prev - 1 + PROMO_SLIDES.length) % PROMO_SLIDES.length)}
                  className="p-2 rounded-xl bg-slate-850/80 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center shadow-sm"
                  aria-label="Previous slide"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentSlide((prev) => (prev + 1) % PROMO_SLIDES.length)}
                  className="p-2 rounded-xl bg-slate-850/80 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center shadow-sm"
                  aria-label="Next slide"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
