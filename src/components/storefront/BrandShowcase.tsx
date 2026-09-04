import React from 'react';
import { Award, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';

interface BrandShowcaseProps {
  onSelectBrand: (brand: string) => void;
  selectedBrand: string;
}

const BRANDS_METADATA = [
  {
    name: 'AcousticTech',
    origin: 'Munich, Germany',
    specialty: 'High-Fidelity Audio',
    logoLetter: 'A',
    description: 'Precision engineered planar drivers and studio monitoring equipment.',
    accent: 'from-sky-500/20 to-indigo-500/20 text-sky-400 border-sky-500/30',
  },
  {
    name: 'Vanguard Tech',
    origin: 'Tokyo, Japan',
    specialty: 'Next-Gen Wearables',
    logoLetter: 'V',
    description: 'Aerospace-grade titanium biometric tracking and sapphire displays.',
    accent: 'from-indigo-500/20 to-purple-500/20 text-indigo-400 border-indigo-500/30',
  },
  {
    name: 'Kuro Kitchen',
    origin: 'Kyoto, Japan',
    specialty: 'Artisan Barista & Cookware',
    logoLetter: 'K',
    description: 'Minimalist kitchenware calibrated for exact extraction and thermal stability.',
    accent: 'from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30',
  },
  {
    name: 'Equator Roasters',
    origin: 'Addis Ababa / Portland',
    specialty: 'Micro-Lot Coffee',
    logoLetter: 'E',
    description: 'Direct-trade sustainably cultivated single-origin Arabica beans.',
    accent: 'from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30',
  },
  {
    name: 'Nordic Weave',
    origin: 'Stockholm, Sweden',
    specialty: 'Extra-Fine Merino',
    logoLetter: 'N',
    description: 'Ultra-soft sustainable knitwear and temperature regulating natural wool.',
    accent: 'from-cyan-500/20 to-blue-500/20 text-cyan-400 border-cyan-500/30',
  },
  {
    name: 'Atelier Craft',
    origin: 'Florence, Italy',
    specialty: 'Vegetable Tanned Leather',
    logoLetter: 'C',
    description: 'Master leatherworkers crafting durable weekenders and everyday carry goods.',
    accent: 'from-rose-500/20 to-pink-500/20 text-rose-400 border-rose-500/30',
  },
];

export const BrandShowcase: React.FC<BrandShowcaseProps> = ({
  onSelectBrand,
  selectedBrand,
}) => {
  const { products } = useCommerce();

  const getBrandCount = (brandName: string) => {
    return products.filter((p) => p.brand.toLowerCase() === brandName.toLowerCase() && p.status === 'active').length;
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <div className="inline-flex items-center gap-1.5 text-sky-400 text-[11px] font-bold uppercase tracking-wider mb-1">
            <Award className="w-3.5 h-3.5" />
            <span>Authorized Partners</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Featured Partner Brands
          </h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Direct manufacturer authorized partnerships with full global warranty
        </p>
      </div>

      {/* Brand Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {BRANDS_METADATA.map((brand) => {
          const count = getBrandCount(brand.name);
          const isSelected = selectedBrand.toLowerCase() === brand.name.toLowerCase();

          return (
            <div
              key={brand.name}
              onClick={() => onSelectBrand(brand.name)}
              className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-3 group ${
                isSelected
                  ? 'bg-slate-100 dark:bg-slate-800 border-sky-400 shadow-xl shadow-sky-500/10 ring-2 ring-sky-400/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-850'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-11 h-11 rounded-xl bg-gradient-to-br ${brand.accent} border flex items-center justify-center font-black text-lg shadow group-hover:scale-105 transition-transform`}
                  >
                    {brand.logoLetter}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-sky-300 transition-colors">
                      {brand.name}
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">{brand.origin}</p>
                  </div>
                </div>

                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-700">
                  {count} {count === 1 ? 'item' : 'items'}
                </span>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                {brand.description}
              </p>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 dark:border-slate-800/80 text-[11px] text-sky-400 font-semibold">
                <span>{brand.specialty}</span>
                <span className="flex items-center gap-1 group-hover:translate-x-1 transition-transform text-slate-700 dark:text-slate-300 group-hover:text-sky-300">
                  Explore Brand <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
