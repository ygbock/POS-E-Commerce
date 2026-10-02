import React, { useState } from 'react';
import { Mail, Sparkles, CheckCircle2, ShieldCheck, AlertCircle, BellRing } from 'lucide-react';

export interface NewsletterSectionProps {
  onExploreDeals?: () => void;
}

export const NewsletterSection: React.FC<NewsletterSectionProps> = ({ onExploreDeals }) => {
  const [email, setEmail] = useState('');
  const [preference, setPreference] = useState<'all' | 'tech' | 'deals'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    setIsLoading(true);
    try {
      const currentList: string[] = JSON.parse(localStorage.getItem('abacha_newsletter_subscribers') || '[]');
      if (!currentList.includes(cleanEmail.toLowerCase())) {
        currentList.push(cleanEmail.toLowerCase());
        localStorage.setItem('abacha_newsletter_subscribers', JSON.stringify(currentList));
      }
      setIsSubscribed(true);
      setEmail('');
    } catch {
      setErrorMsg('Subscription service temporarily unavailable. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 border border-slate-800 p-6 sm:p-10 shadow-2xl text-white">
      <div className="relative z-10 max-w-4xl mx-auto">
        {!isSubscribed ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-3 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-300 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Store Updates</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
                Stay Ahead of New Arrivals & Offers
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Subscribe for product updates, new arrivals, store announcements, and verified offers.
              </p>
              <div className="flex items-center gap-4 text-slate-200 text-xs">
                <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-amber-300" /> Store updates</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> No spam</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <form onSubmit={handleSubmit} className="bg-slate-900/90 backdrop-blur p-5 sm:p-6 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Your Email Address <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input id="input-newsletter-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your personal or work email..."
                    className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl py-2.5 pl-10 pr-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                </div>

                <div className="flex gap-2 text-[11px]">
                  {(['all', 'tech', 'deals'] as const).map((value) => (
                    <button key={value} type="button" onClick={() => setPreference(value)}
                      className={`px-3 py-1 rounded-lg border transition-all ${preference === value ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/60 font-bold' : 'bg-slate-950 text-slate-400 border-slate-800'}`}>
                      {value === 'all' ? 'All Updates' : value === 'tech' ? 'Tech & Hardware' : 'Offers'}
                    </button>
                  ))}
                </div>

                {errorMsg && (
                  <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{errorMsg}</span>
                  </div>
                )}

                <button id="btn-newsletter-subscribe" type="submit" disabled={isLoading}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                  <BellRing className="w-4 h-4" />
                  <span>{isLoading ? 'Saving Subscription...' : 'Subscribe to Store Updates'}</span>
                </button>
                <p className="text-[10px] text-slate-400 text-center leading-tight">
                  By subscribing, you agree to receive store updates. You can unsubscribe anytime.
                </p>
              </form>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">Subscription Confirmed</span>
              <h3 className="text-2xl font-black text-white mt-1">You’re subscribed to store updates.</h3>
              <p className="text-xs text-slate-300 max-w-md mx-auto mt-1">We’ll send product updates and verified store offers to your inbox.</p>
            </div>
            {onExploreDeals && (
              <button type="button" onClick={onExploreDeals} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold">
                Explore Current Products
              </button>
            )}
            <button type="button" onClick={() => setIsSubscribed(false)} className="text-xs text-slate-400 hover:text-white underline">
              Subscribe with another email
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
