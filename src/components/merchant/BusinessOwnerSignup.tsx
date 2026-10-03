import React, { FormEvent, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, X, Building2, Store } from 'lucide-react';
import { authClient } from '../../services/authClient';

export const BusinessOwnerSignup: React.FC = () => {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    businessMode: 'DISCOVERY_ONLY' as 'DISCOVERY_ONLY' | 'DISCOVERY_AND_STORE',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (form.password.length < 12) {
      return setError('Password must be at least 12 characters.');
    }
    if (form.password !== form.confirmPassword) {
      return setError('Passwords do not match.');
    }
    
    setLoading(true);
    try {
      const result = await authClient.registerBusinessOwner({
        name: form.name,
        email: form.email,
        password: form.password,
        businessName: form.businessName,
        businessMode: form.businessMode,
      });
      window.location.assign('/business/' + encodeURIComponent(result.business.id) + '?onboarding=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create your business account.');
    } finally {
      setLoading(false);
    }
  };

  const set = (key: string, value: string) => setForm((v) => ({ ...v, [key]: value }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-8 sm:py-16 text-slate-900 relative flex items-center justify-center">
      {/* Floating Back Button */}
      <div className="absolute top-4 left-4 z-10">
        <a
          href="/discover"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-slate-300 hover:text-white transition-all backdrop-blur-md"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Marketplace</span>
        </a>
      </div>

      <div className="w-full max-w-2xl mt-4 sm:mt-0">
        {/* Brand Header */}
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-black text-white shadow-xl shadow-indigo-600/20">
            A
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Start your business on AbaCha
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            Create your owner account and begin your Discovery listing.
          </p>
        </div>

        {/* Signup Form Card */}
        <form onSubmit={submit} className="rounded-3xl bg-white p-5 sm:p-8 shadow-2xl relative border border-slate-100">
          <div className="absolute top-6 right-6">
            <a
              href="/discover"
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              title="Close and return to marketplace"
            >
              <X className="w-5 h-5" />
            </a>
          </div>

          {error && (
            <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-xs sm:text-sm text-red-700 flex items-start gap-2.5">
              <span className="font-semibold shrink-0">Error:</span>
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-4 sm:gap-5 sm:grid-cols-2">
            <label className="text-xs sm:text-sm font-semibold text-slate-700">
              Full name
              <input
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-xs text-slate-900"
                autoComplete="name"
                placeholder="First and last name"
              />
            </label>

            <label className="text-xs sm:text-sm font-semibold text-slate-700">
              Email
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-xs text-slate-900"
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>

            <label className="text-xs sm:text-sm font-semibold text-slate-700">
              Password
              <div className="relative mt-1.5">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  minLength={12}
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 pr-11 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-xs text-slate-900"
                  autoComplete="new-password"
                  placeholder="At least 12 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="text-xs sm:text-sm font-semibold text-slate-700">
              Confirm password
              <div className="relative mt-1.5">
                <input
                  required
                  type={showConfirmPassword ? 'text' : 'password'}
                  minLength={12}
                  value={form.confirmPassword}
                  onChange={(e) => set('confirmPassword', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 pr-11 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-xs text-slate-900"
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="text-xs sm:text-sm font-semibold text-slate-700 sm:col-span-2">
              Business name
              <input
                required
                value={form.businessName}
                onChange={(e) => set('businessName', e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-xs text-slate-900"
                placeholder="e.g. Freetown Mobile Hub"
              />
            </label>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-6">
            <p className="text-xs sm:text-sm font-bold text-slate-800">
              How do you want to use AbaCha?
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => set('businessMode', 'DISCOVERY_ONLY')}
                className={`rounded-2xl p-4 text-left border cursor-pointer transition-all flex flex-col justify-between ${
                  form.businessMode === 'DISCOVERY_ONLY'
                    ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-500/15'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Building2 className={`w-4 h-4 ${form.businessMode === 'DISCOVERY_ONLY' ? 'text-indigo-600' : 'text-slate-500'}`} />
                  <span className="font-extrabold text-xs sm:text-sm">Discovery listing</span>
                </div>
                <span className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                  Be discovered without opening a commerce store yet. Perfect for services and small shops.
                </span>
              </button>

              <button
                type="button"
                onClick={() => set('businessMode', 'DISCOVERY_AND_STORE')}
                className={`rounded-2xl p-4 text-left border cursor-pointer transition-all flex flex-col justify-between ${
                  form.businessMode === 'DISCOVERY_AND_STORE'
                    ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-500/15'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Store className={`w-4 h-4 ${form.businessMode === 'DISCOVERY_AND_STORE' ? 'text-indigo-600' : 'text-slate-500'}`} />
                  <span className="font-extrabold text-xs sm:text-sm">Discovery + Store</span>
                </div>
                <span className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                  Build your listing and prepare an online storefront, inventory ledger, and order fulfillment.
                </span>
              </button>
            </div>
          </div>

          <button
            disabled={loading}
            className="mt-8 w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] px-4 py-3.5 font-bold text-white text-xs sm:text-sm transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/20 min-h-[44px]"
          >
            {loading ? 'Creating your business account…' : 'Create business account'}
          </button>

          <p className="mt-5 text-center text-xs text-slate-500 font-medium">
            Already have an account?{' '}
            <a href="/business/signin" className="font-bold text-slate-900 hover:text-indigo-600 transition-colors">
              Sign in to your merchant portal
            </a>
          </p>
        </form>
      </div>
    </div>
  );
};
