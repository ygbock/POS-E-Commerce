import React, { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { authClient, AuthUser } from '../../services/authClient';

interface LoginPageProps {
  onAuthenticated: (user: AuthUser) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const remembered = localStorage.getItem('abacha_login_email');
    if (remembered) setEmail(remembered);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await authClient.login(email.trim(), password);
      localStorage.setItem('abacha_login_email', email.trim());
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
          <p className="mt-2 text-sm text-slate-400">Unified Commerce Platform</p>
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
            <h2 className="text-xl font-bold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Use your authorized account to continue.</p>
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
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="mt-5 border-t border-slate-100 pt-4 text-center text-xs text-slate-600">
            Are you a business owner?{' '}
            <a href="/business/signup" className="font-bold text-slate-900 hover:underline">
              Register your business listing here
            </a>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Access is controlled by your authenticated server-side role and permissions.
        </p>
      </div>
    </div>
  );
};
