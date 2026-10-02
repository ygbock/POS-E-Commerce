import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface PromotionsBannerProps {}

export const PromotionsBanner: React.FC<PromotionsBannerProps> = () => (
  <section id="store-promotions" className="space-y-4">
    <div className="flex items-start gap-3 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
        <ShieldCheck className="w-5 h-5" />
      </div>
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">Store Offers</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Eligible promotions and fulfillment offers are verified by the store server during checkout.
        </p>
      </div>
    </div>
  </section>
);
