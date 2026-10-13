import React, { useEffect, useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { authClient } from '../../services/authClient';

type PlatformUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  is_active: boolean;
  organization_id: string;
  organization_name: string;
  created_at: string | null;
};

export const PlatformUsersView: React.FC = () => {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/platform/users', {
        credentials: 'include',
        headers: authClient.getAuthHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
        throw new Error(payload?.error?.message || 'Unable to load active tenant users.');
      }
      setUsers(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load active tenant users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadUsers(); }, []);

  return (
    <section className="ui-page space-y-6" aria-labelledby="platform-users-title">
      <header className="ui-page-header">
        <div className="ui-page-header__copy">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
            <Users className="h-3.5 w-3.5" aria-hidden="true" /> Platform overview
          </div>
          <h1 id="platform-users-title" className="ui-page-title">Active Tenant Users</h1>
          <p className="ui-page-description">Active user accounts associated with active tenant organizations. Platform operator identities and users without an active tenant are excluded.</p>
        </div>
        <div className="ui-page-actions">
          <button type="button" onClick={() => void loadUsers()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
        </div>
      </header>
      <div className="ui-surface overflow-hidden">
        {error && <div role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Active tenant user accounts</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr><th scope="col" className="px-4 py-3">User</th><th scope="col" className="px-4 py-3">Tenant</th><th scope="col" className="px-4 py-3">Role</th><th scope="col" className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Loading active users…</td></tr>}
              {!loading && !error && users.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No active users were found in active tenant organizations.</td></tr>}
              {!loading && users.map((user) => <tr key={user.id}>
                <td className="px-4 py-3"><div className="font-semibold text-slate-900 dark:text-slate-100">{user.name || 'Unnamed user'}</div><div className="text-xs text-slate-500">{user.email}</div></td>
                <td className="px-4 py-3">{user.organization_name}</td>
                <td className="px-4 py-3 capitalize">{user.role.replaceAll('_', ' ')}</td>
                <td className="px-4 py-3"><span className="ui-status-success">Active</span></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800">{loading ? 'Loading count…' : `${users.length} active tenant user${users.length === 1 ? '' : 's'}`}</div>
      </div>
    </section>
  );
};
