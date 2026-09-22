import React, { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react';
import { authClient, AuthUser } from '../../services/authClient';

interface LoginPageProps {
  onAuthenticated: (user: AuthUser) => void;
  mode?: 'customer' | 'business' | 'platform';
}

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated, mode = 'customer' }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const remembered = localStorage.getItem('abacha_login_email');
    if (remembered) setEmail(remembered);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const isBusinessOwnerSignIn = mode === 'business' || window.location.pathname === '/business/signin' || window.location.pathname === '/business' || window.location.pathname.startsWith('/business/');
      const user = isBusinessOwnerSignIn
        ? await authClient.loginBusinessOwner(email.trim(), password)
        : await authClient.login(email.trim(), password);

      if (mode === 'platform' && !['system_owner', 'platform_admin', 'platform_support', 'platform_finance'].includes(user.role)) {
        await authClient.logout();
        throw new Error('PLATFORM_ACCESS_DENIED: This sign-in is restricted to authorized platform operators.');
      }
      localStorage.setItem('abacha_login_email', email.trim());
      const redirectParam = new URLSearchParams(window.location.search).get('redirect');
      const safeRedirect = mode === 'platform'
        ? (redirectParam && redirectParam.startsWith('/platform') && !redirectParam.startsWith('//') ? redirectParam : '/platform')
        : redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
          ? redirectParam
          : (user.role === 'business_owner' || window.location.pathname.startsWith('/business'))
            ? '/business'
            : '/discover';

      // Complete the journey the user started before authentication instead of
      // dropping them back on a generic landing page.
      window.location.assign(safeRedirect);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-8 relative">
      {/* Floating Back Button */}
      <div className="absolute top-4 left-4 z-10">
        <a
          href="/discover"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-slate-300 hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Marketplace</span>
        </a>
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-white text-slate-950 flex items-center justify-center text-2xl font-black">A</div>
          <h1 className="text-3xl font-bold text-white">AbaCha</h1>
          <p className="mt-2 text-sm text-slate-400">{mode === 'platform' ? 'Platform Control Plane' : 'Unified Commerce Platform'}</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl bg-white p-6 sm:p-8 shadow-2xl relative">
          <div className="absolute top-6 right-6">
            <a
              href="/discover"
              className="text-slate-400 hover:text-slate-600 transition"
              title="Close and return to marketplace"
            >
              <X className="w-5 h-5" />
            </a>
          </div>

          <div className="mb-6 pr-6">
            <h2 className="text-xl font-bold text-slate-900">{mode === 'platform' ? 'Platform administrator sign in' : 'Sign in'}</h2>
            <p className="mt-1 text-sm text-slate-500">{mode === 'platform' ? 'Use an authorized platform operator account.' : 'Use your authorized account to continue.'}</p>
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              placeholder="you@example.com"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Password
            <div className="relative mt-1.5">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-11 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {mode !== 'platform' && (
            <div className="mt-5 border-t border-slate-100 pt-4 text-center text-xs text-slate-600">
              <a href="/business/signin" className="font-bold text-slate-900 hover:underline">
                Business owner sign in
              </a>
              <span className="mx-2 text-slate-300">•</span>
              <a href="/business/signup" className="font-bold text-slate-900 hover:underline">
                Register your business
              </a>
            </div>
          )}
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Access is controlled by your authenticated server-side role and permissions.
        </p>
      </div>
    </div>
  );
};
