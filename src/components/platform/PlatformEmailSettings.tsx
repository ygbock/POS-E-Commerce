import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Mail, Save, Trash2 } from 'lucide-react';
import { authClient } from '../../services/authClient';

interface EmailSettingsStatus {
  provider: 'resend';
  configured: boolean;
  fromEmail: string | null;
  updatedAt: string | null;
}

export const PlatformEmailSettings: React.FC = () => {
  const [status, setStatus] = useState<EmailSettingsStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/platform/settings/email', {
        credentials: 'include',
        headers: authClient.getAuthHeaders(),
      });
      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(body.error?.message || 'Unable to load platform email settings.');
      }
      const data = body.data as EmailSettingsStatus;
      setStatus(data);
      setFromEmail(data.fromEmail || '');
    } catch (err: any) {
      setError(err.message || 'Unable to load platform email settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/platform/settings/email', {
        method: 'PUT',
        credentials: 'include',
        headers: { ...authClient.getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEmail: fromEmail.trim(), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(body.error?.message || 'Unable to save platform email settings.');
      }
      setStatus(body.data as EmailSettingsStatus);
      setApiKey('');
      setNotice('Email delivery settings saved. The API key is encrypted and cannot be viewed again.');
    } catch (err: any) {
      setError(err.message || 'Unable to save platform email settings.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Remove the saved Resend credentials? Verification and password-reset emails will stop being delivered.')) return;
    setRemoving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/platform/settings/email', {
        method: 'DELETE',
        credentials: 'include',
        headers: authClient.getAuthHeaders(),
      });
      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(body.error?.message || 'Unable to remove Resend settings.');
      }
      setStatus(body.data as EmailSettingsStatus);
      setApiKey('');
      setFromEmail('');
      setNotice('Resend credentials removed. Email delivery is disabled until configured again.');
    } catch (err: any) {
      setError(err.message || 'Unable to remove Resend settings.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className="mx-auto max-w-4xl space-y-6" aria-labelledby="platform-email-settings-title">
      <header className="flex items-start gap-3 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          <Mail className="h-6 w-6" />
        </div>
        <div>
          <h1 id="platform-email-settings-title" className="text-2xl font-bold text-slate-900 dark:text-white">Platform Settings</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Configure account verification and password-reset email delivery for the platform.</p>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Resend Email Delivery</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">One platform-wide provider is used for verification and password reset.</p>
          </div>
          {status?.configured ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> API key saved
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Not configured
            </span>
          )}
        </div>

        {error && <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {notice && <div role="status" className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

        {loading ? (
          <div role="status" className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading email settings…</div>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={save}>
            <div className="space-y-2">
              <label htmlFor="resend-api-key" className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Resend API key</label>
              <input
                id="resend-api-key"
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={status?.configured ? 'Saved securely — enter a new key only to rotate it' : 're_…'}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                aria-describedby="resend-api-key-help"
              />
              <p id="resend-api-key-help" className="text-xs text-slate-500 dark:text-slate-400">The key is encrypted before it is stored. It is never sent back to the browser. Leave blank to keep the existing key.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="resend-from-email" className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Verified sender address</label>
              <input
                id="resend-from-email"
                type="text"
                autoComplete="email"
                required
                maxLength={254}
                value={fromEmail}
                onChange={(event) => setFromEmail(event.target.value)}
                placeholder="AbaCha <no-reply@your-verified-domain.com>"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Use an email address or display-name format from a domain verified in Resend.</p>
            </div>

            {status?.configured && status.updatedAt && <p className="text-xs text-slate-500 dark:text-slate-400">Last updated: {new Date(status.updatedAt).toLocaleString()}</p>}

            <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
              <button type="submit" disabled={saving || removing} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving…' : 'Save settings'}
              </button>
              {status?.configured && <button type="button" disabled={saving || removing} onClick={remove} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30">
                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {removing ? 'Removing…' : 'Remove credentials'}
              </button>}
            </div>
          </form>
        )}
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-200">
        <strong>Security note:</strong> Only System Owner and Platform Admin roles can manage these settings. The API key is encrypted at rest using the platform's existing MFA encryption key. Keep that encryption key backed up securely; losing it makes the saved Resend credential unreadable.
      </div>
    </section>
  );
};
