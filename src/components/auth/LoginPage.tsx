import React, { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react';
import { authClient, AuthUser, PlatformMfaChallengeError } from '../../services/authClient';

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
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaEnrollment, setMfaEnrollment] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  useEffect(() => {
    const remembered = localStorage.getItem('abacha_login_email');
    if (remembered) setEmail(remembered);
  }, []);

  const finishPlatformAuthentication = (user: AuthUser) => {
    localStorage.setItem('abacha_login_email', email.trim());
    const redirectParam = new URLSearchParams(window.location.search).get('redirect');
    const safePlatformRedirect =
      redirectParam && redirectParam.startsWith('/platform') && !redirectParam.startsWith('//')
        ? redirectParam
        : '/platform';
    window.location.assign(safePlatformRedirect);
    onAuthenticated(user);
  };

  const submitMfa = async (event: FormEvent) => {
    event.preventDefault();
    if (!mfaChallenge) return;
    setError('');
    setLoading(true);
    try {
      if (mfaEnrollment) {
        const result = await authClient.confirmPlatformMfaEnrollment(mfaChallenge, mfaCode.trim());
        setRecoveryCodes(result.recoveryCodes);
        setRecoveryCodes(result.recoveryCodes);
      } else {
        const user = await authClient.verifyPlatformMfa(mfaChallenge, mfaCode.trim());
        finishPlatformAuthentication(user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify the MFA code.');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const isBusinessOwnerSignIn = mode === 'business' || window.location.pathname === '/business/signin' || window.location.pathname === '/business' || window.location.pathname.startsWith('/business/');
      const user = mode === 'platform'
        ? await authClient.loginPlatform(email.trim(), password)
        : isBusinessOwnerSignIn
          ? await authClient.loginBusinessOwner(email.trim(), password)
          : await authClient.login(email.trim(), password);

      if (mode === 'platform' && !['system_owner', 'platform_admin', 'platform_support', 'platform_finance'].includes(user.role)) {
        await authClient.logout();
        throw new Error('PLATFORM_ACCESS_DENIED: This sign-in is restricted to authorized platform operators.');
      }
      localStorage.setItem('abacha_login_email', email.trim());
      const redirectParam = new URLSearchParams(window.location.search).get('redirect');

      if (mode === 'platform') {
        finishPlatformAuthentication(user);
        return;
      }

      if (user.role === 'business_owner') {
        const merchantResponse = await fetch('/api/merchant/me', {
          headers: authClient.getAuthHeaders(),
        });
        const merchantPayload = await merchantResponse.json().catch(() => null);
        const assignedBusinesses = Array.isArray(merchantPayload?.data?.businesses)
          ? merchantPayload.data.businesses
          : [];

        const redirectUrl = redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
          ? new URL(redirectParam, window.location.origin)
          : null;
        const requestedWorkspace =
          redirectUrl?.searchParams.get('workspace') ||
          ({ '/inventory': 'inventory', '/stock': 'inventory', '/catalog': 'catalog', '/products': 'catalog', '/orders': 'orders', '/pos': 'pos', '/dashboard': 'dashboard' } as Record<string, string>)[redirectUrl?.pathname || ''] ||
          null;
        const requestedBusinessId = redirectUrl?.searchParams.get('businessId');
        const assignedBusiness =
          (requestedBusinessId && assignedBusinesses.find((business: any) => business.id === requestedBusinessId)) ||
          assignedBusinesses.find((business: any) => business.business_mode === 'DISCOVERY_AND_STORE') ||
          assignedBusinesses[0];

        if (requestedWorkspace && assignedBusiness?.id) {
          const params = new URLSearchParams({
            workspace: requestedWorkspace,
            businessId: assignedBusiness.id,
          });
          window.location.assign('/?' + params.toString());
        } else if (assignedBusiness?.id) {
          window.location.assign('/business/' + encodeURIComponent(assignedBusiness.id));
        } else {
          window.location.assign('/business');
        }
        onAuthenticated(user);
        return;
      }

      const safeRedirect = redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
        ? redirectParam
        : '/discover';
      window.location.assign(safeRedirect);
      onAuthenticated(user);
    } catch (err) {
      if (err instanceof PlatformMfaChallengeError) {
        setMfaChallenge(err.challenge);
        setMfaEnrollment(err.code === 'MFA_ENROLLMENT_REQUIRED');
        if (err.code === 'MFA_ENROLLMENT_REQUIRED') {
          try {
            const enrollment = await authClient.setupPlatformMfa(err.challenge);
            setMfaSecret(enrollment.secret);
          } catch (setupError) {
            setError(setupError instanceof Error ? setupError.message : 'Unable to initialize MFA enrollment.');
            setMfaChallenge(null);
          }
        }
      } else {
        setError(err instanceof Error ? err.message : 'Unable to sign in. Please check your credentials.');
      }
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

        <form onSubmit={mfaChallenge ? submitMfa : submit} className="rounded-2xl bg-white p-6 sm:p-8 shadow-2xl relative">
          <div className="absolute top-6 right-6">
            <a
              href="/discover"
              className="text-slate-400 hover:text-slate-600 transition"
              title="Close and return to marketplace"
            >
              <X className="w-5 h-5" />
            </a>
          </div>

{mfaChallenge ? (
            <>
              <div className="mb-6 pr-6">
                <h2 className="text-xl font-bold text-slate-900">{mfaEnrollment ? 'Secure your platform account' : 'Verify your platform sign in'}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {mfaEnrollment
                    ? 'Set up an authenticator app, then enter the six-digit code it generates.'
                    : 'Enter the six-digit code from your authenticator app. A recovery code may also be used.'}
                </p>
              </div>

              {mfaEnrollment && mfaSecret && (
                <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                  <p className="font-semibold text-slate-900">Authenticator secret</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-700">{mfaSecret}</p>
                  <p className="mt-3 text-xs text-slate-500">Add this secret to your authenticator app, then enter the generated six-digit code below.</p>
                </div>
              )}

              {recoveryCodes && (
                <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
                  <p className="font-semibold text-amber-900">Save your recovery codes now</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-amber-950">
                    {recoveryCodes.map((code) => <div key={code} className="rounded bg-white px-2 py-1">{code}</div>)}
                  </div>
                  <button type="button" onClick={() => finishPlatformAuthentication(authClient.getUser()!)} className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white">I saved my recovery codes</button>
                </div>
              )}

              {!recoveryCodes && (
                <>
                  <label className="block text-sm font-medium text-slate-700">
                    {mfaEnrollment ? 'Authenticator code' : 'MFA code or recovery code'}
                    <input type="text" inputMode="numeric" autoComplete="one-time-code" required autoFocus value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono tracking-widest outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200" placeholder={mfaEnrollment ? '123456' : '123456 or recovery code'} />
                  </label>
                  <button type="submit" disabled={loading} className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                    {loading ? 'Verifying…' : mfaEnrollment ? 'Enable MFA & continue' : 'Verify & continue'}
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="mb-6 pr-6">
              <h2 className="text-xl font-bold text-slate-900">{mode === 'platform' ? 'Platform administrator sign in' : 'Sign in'}</h2>
              <p className="mt-1 text-sm text-slate-500">{mode === 'platform' ? 'Use an authorized platform operator account.' : 'Use your authorized account to continue.'}</p>
            </div>
          )}

          {error && (
            <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!mfaChallenge && (<>
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

          </>)}

{!mfaChallenge && (
            <button type="submit" disabled={loading} className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          )}

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
