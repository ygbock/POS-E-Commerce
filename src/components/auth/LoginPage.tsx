import React, { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Check, Copy, Eye, EyeOff, QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { authClient, AuthUser, PlatformMfaChallengeError } from '../../services/authClient';

interface LoginPageProps {
  onAuthenticated: (user: AuthUser) => void;
  mode?: 'customer' | 'business' | 'platform';
}

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated, mode = 'customer' }) => {
  const [activeMode, setActiveMode] = useState<'customer' | 'business' | 'platform'>(mode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaEnrollment, setMfaEnrollment] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaOtpauthUri, setMfaOtpauthUri] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // Customer registration states
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

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
    window.history.pushState({}, '', safePlatformRedirect);
    window.dispatchEvent(new PopStateEvent('popstate'));
    onAuthenticated(user);
  };

  const submitMfa = async (event: FormEvent) => {
    event.preventDefault();
    if (!mfaChallenge) return;
    setError('');
    setLoading(true);
    try {
      const normalizedCode = mfaCode.trim().replace(/\s+/g, '');
      if (mfaEnrollment) {
        const result = await authClient.confirmPlatformMfaEnrollment(mfaChallenge, normalizedCode);
        setRecoveryCodes(result.recoveryCodes);
      } else {
        const user = await authClient.verifyPlatformMfa(mfaChallenge, normalizedCode);
        finishPlatformAuthentication(user);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'INVALID_MFA_CHALLENGE' || code === 'MFA_CHALLENGE_LOCKED') {
        setMfaChallenge(null);
        setMfaCode('');
        setMfaSecret(null);
        setMfaOtpauthUri(null);
      }
      setError(err instanceof Error ? err.message : 'Unable to verify the MFA code.');
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);
    try {
      if (!name.trim()) {
        throw new Error('Please enter your full name');
      }
      if (!email.trim() || !email.includes('@')) {
        throw new Error('Please enter a valid email address');
      }
      if (!password || password.length < 12) {
        throw new Error('Password must be at least 12 characters.');
      }

      await authClient.registerCustomer({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
      });

      setSuccessMessage('🎉 Customer account registered successfully! Please verify your email and sign in.');
      setIsRegistering(false);
      setPassword('');
      setName('');
      setPhone('');
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const submitForgotPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);
    try {
      if (!email.trim() || !email.includes('@')) {
        throw new Error('Please enter a valid email address');
      }
      await authClient.forgotPassword(email.trim());
      setSuccessMessage('✉️ If an account with this email exists, we have sent a password reset link.');
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to request password reset link.');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const isBusinessOwnerSignIn = activeMode === 'business' || window.location.pathname === '/business/signin' || window.location.pathname === '/business' || window.location.pathname.startsWith('/business/');
      let effectiveMode = activeMode;
      let user: AuthUser;

      if (effectiveMode === 'platform') {
        user = await authClient.loginPlatform(email.trim(), password);
      } else if (isBusinessOwnerSignIn) {
        user = await authClient.loginBusinessOwner(email.trim(), password);
      } else {
        try {
          user = await authClient.login(email.trim(), password);
        } catch (loginErr: any) {
          if (loginErr?.code === 'PLATFORM_LOGIN_REQUIRED' || String(loginErr?.message || '').includes('Platform operators must sign in')) {
            effectiveMode = 'platform';
            setActiveMode('platform');
            user = await authClient.loginPlatform(email.trim(), password);
          } else {
            throw loginErr;
          }
        }
      }

      if (effectiveMode === 'platform' && !['system_owner', 'platform_admin', 'platform_support', 'platform_finance'].includes(user.role)) {
        await authClient.logout();
        throw new Error('PLATFORM_ACCESS_DENIED: This sign-in is restricted to authorized platform operators.');
      }
      localStorage.setItem('abacha_login_email', email.trim());
      const redirectParam = new URLSearchParams(window.location.search).get('redirect');

      if (effectiveMode === 'platform') {
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

      const defaultLanding =
        user.role === 'customer'
          ? '/discover'
          : user.role === 'cashier'
            ? '/?workspace=pos'
            : '/?workspace=dashboard';

      const safeRedirect = redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
        ? redirectParam
        : defaultLanding;
      window.location.assign(safeRedirect);
      onAuthenticated(user);
    } catch (err) {
      if (err instanceof PlatformMfaChallengeError) {
        setActiveMode('platform');
        setMfaChallenge(err.challenge);
        setMfaEnrollment(err.code === 'MFA_ENROLLMENT_REQUIRED');
        if (err.code === 'MFA_ENROLLMENT_REQUIRED') {
          try {
            const enrollment = await authClient.setupPlatformMfa(err.challenge);
            setMfaSecret(enrollment.secret);
            setMfaOtpauthUri(
              enrollment.otpauthUri ||
                `otpauth://totp/${encodeURIComponent(`AbaCha:${email.trim()}`)}?secret=${encodeURIComponent(enrollment.secret)}&issuer=AbaCha&algorithm=SHA1&digits=6&period=30`
            );
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
          <p className="mt-2 text-sm text-slate-400">{activeMode === 'platform' ? 'Platform Control Plane' : 'Unified Commerce Platform'}</p>
        </div>

        <form
          onSubmit={
            mfaChallenge
              ? submitMfa
              : isRegistering
              ? submitRegister
              : isForgotPassword
              ? submitForgotPassword
              : submit
          }
          className="rounded-2xl bg-white p-6 sm:p-8 shadow-2xl relative"
        >
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
                    ? 'Scan the QR code or enter the secret key in your authenticator app, then enter the six-digit code it generates.'
                    : 'Enter the six-digit code from your authenticator app. A recovery code may also be used.'}
                </p>
              </div>

              {mfaEnrollment && mfaSecret && (
                <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="flex flex-col items-center mb-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2.5">
                      <QrCode className="w-4 h-4 text-slate-600" />
                      <span>Scan with Authenticator App</span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <QRCodeSVG
                        value={
                          mfaOtpauthUri ||
                          `otpauth://totp/${encodeURIComponent(`AbaCha:${email.trim()}`)}?secret=${encodeURIComponent(mfaSecret)}&issuer=AbaCha&algorithm=SHA1&digits=6&period=30`
                        }
                        size={176}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900 text-xs uppercase tracking-wider">Authenticator secret</p>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(mfaSecret);
                          setSecretCopied(true);
                          setTimeout(() => setSecretCopied(false), 2000);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition"
                      >
                        {secretCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{secretCopied ? 'Copied' : 'Copy key'}</span>
                      </button>
                    </div>
                    <p className="mt-1.5 break-all rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 select-all">
                      {mfaSecret}
                    </p>
                    <p className="mt-2.5 text-xs text-slate-500">
                      Scan the QR code above or manually add this secret to your authenticator app, then enter the generated six-digit code below.
                    </p>
                  </div>
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
                    <input type="text" inputMode={mfaEnrollment ? "numeric" : "text"} autoComplete="one-time-code" required autoFocus value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono tracking-widest outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200" placeholder={mfaEnrollment ? '123456' : '123456 or recovery code'} />
                  </label>
                  <button type="submit" disabled={loading} className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                    {loading ? 'Verifying…' : mfaEnrollment ? 'Enable MFA & continue' : 'Verify & continue'}
                  </button>
                  {email && password && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={async () => {
                        setError('');
                        setLoading(true);
                        try {
                          const user = await authClient.skipPlatformMfa(email.trim(), password);
                          finishPlatformAuthentication(user);
                        } catch (skipErr: any) {
                          setError(skipErr instanceof Error ? skipErr.message : 'Unable to continue without MFA.');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="mt-2.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Skip MFA for now & continue to dashboard
                    </button>
                  )}
                  <div className="mt-4 flex flex-col items-center gap-2 text-xs">
                    {!mfaEnrollment && email && password && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={async () => {
                          setError('');
                          setLoading(true);
                          try {
                            const enrollment = await authClient.resetPlatformMfaEnrollment(email, password);
                            setMfaChallenge(enrollment.challenge);
                            setMfaEnrollment(true);
                            setMfaSecret(enrollment.secret);
                            setMfaOtpauthUri(enrollment.otpauthUri);
                            setMfaCode('');
                          } catch (resetErr: any) {
                            setError(resetErr instanceof Error ? resetErr.message : 'Unable to reset MFA setup.');
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline transition"
                      >
                        Lost authenticator or need a new QR code? Re-setup MFA
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMfaChallenge(null);
                        setMfaEnrollment(false);
                        setMfaSecret(null);
                        setMfaOtpauthUri(null);
                        setMfaCode('');
                        setError('');
                      }}
                      className="text-slate-500 hover:text-slate-700 hover:underline transition"
                    >
                      Back to sign in
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="mb-6 pr-6">
              <h2 className="text-xl font-bold text-slate-900">
                {activeMode === 'platform'
                  ? 'Platform administrator sign in'
                  : isForgotPassword
                  ? 'Forgot Password'
                  : isRegistering
                  ? 'Register Customer Account'
                  : 'Sign in'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {activeMode === 'platform'
                  ? 'Use an authorized platform operator account.'
                  : isForgotPassword
                  ? 'Enter your email address to receive secure instructions to reset your password.'
                  : isRegistering
                  ? 'Sign up and get custom perks with security-verified server-side checks.'
                  : 'Use your authorized account to continue.'}
              </p>
            </div>
          )}

          {error && (
            <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {successMessage && (
            <div role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 animate-fade-in">
              {successMessage}
            </div>
          )}

          {!mfaChallenge && !isRegistering && !isForgotPassword && (
            <>
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
                <div className="flex justify-between items-center mb-1.5">
                  <span>Password</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true);
                      setError('');
                      setSuccessMessage('');
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
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
            </>
          )}

          {!mfaChallenge && isForgotPassword && (
            <label className="block text-sm font-medium text-slate-700 animate-fade-in">
              Email Address
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                placeholder="you@example.com"
              />
            </label>
          )}

          {!mfaChallenge && isRegistering && (<>
          <label className="block text-sm font-medium text-slate-700 animate-fade-in">
            Full Name
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              placeholder="John Doe"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700 animate-fade-in">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              placeholder="you@example.com"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700 animate-fade-in">
            Phone Number (optional)
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              placeholder="+1 (555) 019-9234"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700 animate-fade-in">
            Password (minimum 12 characters)
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
          </>)}

          {!mfaChallenge && (
            <button type="submit" disabled={loading} className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
              {loading
                ? isRegistering
                  ? 'Registering…'
                  : isForgotPassword
                  ? 'Sending Link…'
                  : 'Signing in…'
                : isRegistering
                ? 'Register Customer Account'
                : isForgotPassword
                ? 'Send Reset Link'
                : 'Sign in'}
            </button>
          )}

          {!mfaChallenge && (
            <div className="mt-4 text-center text-xs">
              {isForgotPassword ? (
                <button type="button" onClick={() => { setIsForgotPassword(false); setError(''); setSuccessMessage(''); }} className="font-bold text-slate-900 hover:underline">
                  Back to Sign In
                </button>
              ) : activeMode === 'customer' ? (
                isRegistering ? (
                  <button type="button" onClick={() => { setIsRegistering(false); setError(''); }} className="font-bold text-slate-900 hover:underline">
                    Already have an account? Sign in
                  </button>
                ) : (
                  <button type="button" onClick={() => { setIsRegistering(true); setError(''); }} className="font-bold text-slate-900 hover:underline">
                    Don't have an account? Create a Customer Account
                  </button>
                )
              ) : null}
            </div>
          )}

          {activeMode !== 'platform' && !isForgotPassword && (
            <div className="mt-5 border-t border-slate-100 pt-4 text-center text-xs text-slate-600">
              <a href="/business/signin" className="font-bold text-slate-900 hover:underline">
                Business owner sign in
              </a>
              <span className="mx-2 text-slate-300">•</span>
              <a href="/business/signup" className="font-bold text-slate-900 hover:underline">
                Register your business
              </a>
              <span className="mx-2 text-slate-300">•</span>
              <a href="/platform/signin" className="font-bold text-slate-900 hover:underline">
                Platform admin sign in
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
