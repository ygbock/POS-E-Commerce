import React from 'react';
import { ArrowRight, Heart, Package, ShieldCheck, Sparkles } from 'lucide-react';

export interface StorefrontFooterProps {
  categories: string[];
  wishlistCount: number;
  onSelectCategory: (category: string) => void;
  onOpenDeals: () => void;
  onOpenTracking: () => void;
  onOpenNotifications: () => void;
  onOpenClaimOrders: () => void;
  onOpenOrderHistory: () => void;
  onOpenWishlist: () => void;
  onOpenAdmin?: () => void;
  onOpenPos?: () => void;
}

export const StorefrontFooter: React.FC<StorefrontFooterProps> = ({
  categories, wishlistCount, onSelectCategory, onOpenDeals, onOpenTracking,
  onOpenNotifications, onOpenClaimOrders, onOpenOrderHistory, onOpenWishlist,
  onOpenAdmin, onOpenPos,
}) => (
      <footer className="mt-16 sm:mt-20 border-t border-slate-800 bg-[#020618] backdrop-blur text-slate-400 text-xs pb-24 lg:pb-0">
        <div className="max-w-[1700px] 2xl:max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-10 xl:px-12 py-10 sm:py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
            {/* Brand column */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 p-0.5 shadow-md shadow-sky-500/20">
                  <div className="w-full h-full bg-slate-50 dark:bg-slate-950 rounded-[10px] flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                  </div>
                </div>
                <span className="text-base font-black text-white tracking-tight">AbaCha Store</span>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
                Premium multi-channel retail platform connecting real-time inventory, in-store registers, and instant omnichannel fulfillment.
              </p>
              <div className="flex items-center gap-4 text-slate-400 pt-1">
                <div className="flex items-center gap-1.5 text-xs text-sky-300">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <span>256-Bit SSL Encrypted Checkout</span>
                </div>
              </div>
            </div>

            {/* Shop Categories */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-200">Catalog</p>
              <ul className="space-y-2 text-xs">
                {categories.slice(1).map((cat) => (
                  <li key={cat}>
                    <button
                      onClick={() => {
                        onSelectCategory(cat);
                        
                        
                      }}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      {cat}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    onClick={() => {
                      onOpenDeals();
                      setActiveSection('catalog');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-amber-400 hover:text-amber-300 font-semibold"
                  >
                    Special Offers & Deals
                  </button>
                </li>
              </ul>
            </div>

            {/* Customer Care & Tracking Strategy */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-200">Customer Care & Portal</p>
              <ul className="space-y-2 text-xs">
                <li>
                  <button
                    onClick={() => {
                      
                      
                      
                      onOpenTracking();
                    }}
                    className="text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>Track Order (Account Portal)</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      
                      
                      onOpenNotifications();
                    }}
                    className="hover:text-emerald-400 flex items-center gap-1.5 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>SMS / WhatsApp Alerts Hub</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      
                      onOpenClaimOrders();
                    }}
                    className="hover:text-amber-400 flex items-center gap-1.5 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    <span>Claim Guest Orders</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      
                      onOpenOrderHistory();
                    }}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Order History
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      
                      onOpenWishlist();
                    }}
                    className="hover:text-rose-400 flex items-center gap-1.5 transition-colors"
                  >
                    <Heart className="w-3.5 h-3.5" />
                    <span>Saved Wishlist ({wishlistCount})</span>
                  </button>
                </li>
                <li className="text-slate-500">30-Day Hassle-Free Returns</li>
              </ul>
            </div>

            {/* Staff & Administration */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-200">Operations & Staff</p>
              <ul className="space-y-2 text-xs">
                {onOpenAdmin && (
                  <li>
                    <button
                      id="btn-footer-admin-portal"
                      onClick={onOpenAdmin}
                      className="text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <span>Super Admin Portal</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </li>
                )}
                {onOpenPos && (
                  <li>
                    <button
                      id="btn-footer-pos-terminal"
                      onClick={onOpenPos}
                      className="text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
                    >
                      <span>POS Cashier Register</span>
                    </button>
                  </li>
                )}
                <li className="text-slate-500">Real-Time Sync Engine</li>
                <li className="text-slate-500">Inventory Matrix Active</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <p>© 2026 AbaCha Store & AbaCha Enterprise Commerce. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span>Privacy Policy</span>
              <span>•</span>
              <span>Terms of Service</span>
              <span>•</span>
              <span>Security Compliance</span>
            </div>
          </div>
        </div>
      </footer>


);
