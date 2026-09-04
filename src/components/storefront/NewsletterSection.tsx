import React, { useState } from 'react';
import {
  Mail,
  Sparkles,
  CheckCircle2,
  Gift,
  ArrowRight,
  ShieldCheck,
  Tag,
  Copy,
  Check,
  AlertCircle,
  BellRing,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';

export const NewsletterSection: React.FC = () => {
  const { applyCoupon } = useCommerce();

  const [email, setEmail] = useState('');
  const [preference, setPreference] = useState<'all' | 'tech' | 'deals'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [couponCopied, setCouponCopied] = useState(false);
  const [couponApplied, setCouponApplied] = useState(false);

  const DISCOUNT_CODE = 'WELCOME15';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email format (e.g. name@example.com).');
      return;
    }

    setIsLoading(true);

    try {
      // Mock API endpoint call simulation
      // In production, this would call /api/newsletter/subscribe
      await new Promise((resolve) => setTimeout(resolve, 850));

      // Save email to local storage subscription list for persistence
      const currentList: string[] = JSON.parse(localStorage.getItem('omnicore_newsletter_subscribers') || '[]');
      if (!currentList.includes(cleanEmail.toLowerCase())) {
        currentList.push(cleanEmail.toLowerCase());
        localStorage.setItem('omnicore_newsletter_subscribers', JSON.stringify(currentList));
      }

      setIsSubscribed(true);
      setEmail('');
    } catch {
      setErrorMsg('Subscription service temporarily unavailable. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(DISCOUNT_CODE);
    setCouponCopied(true);
    setTimeout(() => setCouponCopied(false), 2000);
  };

  const handleApplyToCart = () => {
    applyCoupon(DISCOUNT_CODE);
    setCouponApplied(true);
    setTimeout(() => setCouponApplied(false), 3000);
  };

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 border border-slate-800 p-6 sm:p-10 shadow-2xl text-white">
      {/* Background ambient elements */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto">
        {!isSubscribed ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left pitch */}
            <div className="lg:col-span-6 space-y-3 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-300 text-xs font-bold">
                <Gift className="w-3.5 h-3.5 text-amber-400" />
                <span>Join Aura VIP Club</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
                Get 15% Off Your Next Order
              </h2>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Subscribe to our newsletter for exclusive flash deals, early product drops, member-only discounts, and tech insights.
              </p>

              <div className="flex flex-wrap items-center gap-4 text-slate-400 text-xs pt-1">
                <span className="flex items-center gap-1.5 text-slate-200">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Instant Coupon Code
                </span>
                <span className="flex items-center gap-1.5 text-slate-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> No Spam, Ever
                </span>
              </div>
            </div>

            {/* Right Form */}
            <div className="lg:col-span-6">
              <form onSubmit={handleSubmit} className="bg-slate-900/90 backdrop-blur p-5 sm:p-6 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Your Email Address <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      id="input-newsletter-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your personal or work email..."
                      className="w-full bg-slate-950 border border-slate-700 hover:border-slate-600 focus:border-indigo-500 rounded-xl py-2.5 pl-10 pr-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                    />
                  </div>
                </div>

                {/* Preference tags */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Topics of Interest:
                  </label>
                  <div className="flex gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPreference('all')}
                      className={`px-3 py-1 rounded-lg border transition-all ${
                        preference === 'all'
                          ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/60 font-bold'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      All Updates
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreference('tech')}
                      className={`px-3 py-1 rounded-lg border transition-all ${
                        preference === 'tech'
                          ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/60 font-bold'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      Tech & Hardware
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreference('deals')}
                      className={`px-3 py-1 rounded-lg border transition-all ${
                        preference === 'deals'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 font-bold'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      Flash Deals Only
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  id="btn-newsletter-subscribe"
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Connecting to Subscription API...</span>
                    </>
                  ) : (
                    <>
                      <BellRing className="w-4 h-4" />
                      <span>Subscribe & Unlock 15% OFF</span>
                    </>
                  )}
                </button>

                <p className="text-[10px] text-slate-400 text-center leading-tight">
                  By subscribing, you agree to receive marketing updates from Aura Store. You can unsubscribe anytime with 1-click.
                </p>
              </form>
            </div>
          </div>
        ) : (
          /* Subscription Confirmation View */
          <div className="text-center py-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">Subscription Confirmed</span>
              <h3 className="text-2xl font-black text-white mt-1">Welcome to Aura VIP Club!</h3>
              <p className="text-xs text-slate-300 max-w-md mx-auto mt-1">
                Your email has been registered. Here is your exclusive 15% welcome discount code:
              </p>
            </div>

            {/* Coupon Card */}
            <div className="max-w-md mx-auto p-4 bg-slate-900 rounded-2xl border border-indigo-500/40 shadow-xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Tag className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">VIP Discount Code</p>
                  <p className="text-base font-black text-indigo-300 font-mono">{DISCOUNT_CODE}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                  title="Copy code"
                >
                  {couponCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{couponCopied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleApplyToCart}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    couponApplied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                  }`}
                >
                  {couponApplied ? 'Applied to Cart!' : 'Apply Now'}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsSubscribed(false)}
              className="text-xs text-slate-400 hover:text-white underline decoration-slate-600 transition-colors pt-2"
            >
              Subscribe with another email
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
