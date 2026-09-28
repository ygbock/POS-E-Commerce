import React from 'react';
import * as Icons from 'lucide-react';

interface StoreCheckoutHeaderProps { timerDisplay: string; isSubmitting: boolean; onClose: () => void; }

export const StoreCheckoutHeader: React.FC<StoreCheckoutHeaderProps> = ({ timerDisplay, isSubmitting, onClose }) => (<div className="px-5 sm:px-8 py-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-emerald-500 p-0.5 shadow-lg shadow-sky-500/20">
              <div className="w-full h-full bg-white dark:bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Icons.Lock className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="store-checkout-modal-title" className="font-black text-sm sm:text-base text-slate-900 dark:text-white tracking-tight">
                  Secure Checkout
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  <Icons.ShieldCheck className="w-3 h-3" />
                  <span>Secure connection</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inventory is verified again before order placement
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Live Cart Reservation Timer */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold">
              <Icons.Clock className="w-4 h-4 animate-pulse" />
              <span>Items reserved for <strong className="font-mono text-amber-500">{timerDisplay}</strong></span>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close Checkout Modal"
            >
              <Icons.X className="w-5 h-5" />
            </button>
          </div>
        </div>


);
