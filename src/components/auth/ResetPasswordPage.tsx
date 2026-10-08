import React, { FormEvent, useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle2, XCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { authClient } from '../../services/authClient';

export const ResetPasswordPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'form' | 'success' | 'invalid_token'>('form');
  const [countdown, setCountdown] = useState(5);

  const token = new URLSearchParams(window.location.search).get('token') || '';

  useEffect(() => {
    if (!token || token.length < 20) {
      setStatus('invalid_token');
      setError('The password reset link is invalid or has expired.');
    }
  }, [token]);

  useEffect(() => {
    if (status !== 'success') return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          window.location.assign('/login');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Reset token is missing.');
      return;
    }

    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authClient.resetPassword(token, password);
      setStatus('success');
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 shadow-2xl text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-slate-950 text-white flex items-center justify-center text-2xl font-black">
          A
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">AbaCha</h1>
        <p className="text-sm text-slate-500 mb-8">Reset Your Password</p>

        {status === 'invalid_token' && (
          <div className="space-y-4 py-4">
            <XCircle className="w-16 h-16 text-rose-500 mx-auto" />
            <h2 className="text-xl font-bold text-slate-900">Link Invalid or Expired</h2>
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold">
              {error || 'This password reset link is invalid, expired, or has already been used.'}
            </div>
            <p className="text-xs text-slate-400">
              Password reset requests are only valid for 30 minutes from the time of issue.
            </p>
            <a
              href="/login"
              className="mt-6 inline-flex items-center justify-center gap-2 w-full py-3 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-xl transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Login</span>
            </a>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4 py-4">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-bold text-slate-900">Password Reset!</h2>
            <p className="text-sm text-slate-600">
              Your password has been updated successfully. All other active sessions have been revoked for security.
            </p>
            <p className="text-xs text-slate-400 mt-4">
              Redirecting you to the login page in <span className="font-bold text-indigo-600">{countdown}</span> seconds...
            </p>
            <a
              href="/login"
              className="mt-6 inline-block w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl transition"
            >
              Sign In Now
            </a>
          </div>
        )}

        {status === 'form' && (
          <form onSubmit={handleSubmit} className="text-left space-y-4">
            {error && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">
                New Password (minimum 12 characters)
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-11 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                    placeholder="••••••••••••"
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
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Confirm New Password
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                    placeholder="••••••••••••"
                  />
                </div>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Updating Password…' : 'Reset Password'}</span>
            </button>

            <div className="text-center pt-2">
              <a
                href="/login"
                className="text-xs font-bold text-slate-900 hover:underline inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Return to login</span>
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
