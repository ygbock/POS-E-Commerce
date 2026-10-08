import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from 'lucide-react';
import { authClient } from '../../services/authClient';

export const EmailVerificationPage: React.FC = () => {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState('');
  const [countdown, setCountdown] = useState(5);

  const token = new URLSearchParams(window.location.search).get('token') || '';

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Verification token is missing from the link.');
      return;
    }

    authClient.verifyEmailConfirm(token)
      .then(() => {
        setStatus('success');
      })
      .catch((err: any) => {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'The verification link is invalid or expired.');
      });
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

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 shadow-2xl text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-slate-950 text-white flex items-center justify-center text-2xl font-black">
          A
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">AbaCha</h1>
        <p className="text-sm text-slate-500 mb-8">Unified Email Verification</p>

        {status === 'verifying' && (
          <div className="space-y-4 py-6">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-700">Verifying your email address...</p>
            <p className="text-xs text-slate-400">Please wait while we secure your account.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4 py-6">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-bold text-slate-900">Email Verified!</h2>
            <p className="text-sm text-slate-600">
              🎉 Your email address has been verified successfully. Your customer account is now fully active.
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

        {status === 'error' && (
          <div className="space-y-4 py-6">
            <XCircle className="w-16 h-16 text-rose-500 mx-auto" />
            <h2 className="text-xl font-bold text-slate-900">Verification Failed</h2>
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold">
              {errorMessage}
            </div>
            <p className="text-xs text-slate-500 mt-4">
              If you received a new registration email, please ensure you clicked the most recent link.
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
      </div>
    </div>
  );
};
