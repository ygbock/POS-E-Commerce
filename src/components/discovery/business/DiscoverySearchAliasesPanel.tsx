import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw, Search, Trash2, Info, AlertCircle } from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type { DiscoveryBusiness, DiscoverySearchAlias } from '../../../types/discovery';

interface Props { business: DiscoveryBusiness; }

export const DiscoverySearchAliasesPanel: React.FC<Props> = ({ business }) => {
  const [aliases, setAliases] = useState<DiscoverySearchAlias[]>([]);
  const [alias, setAlias] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { setAliases(await discoveryApi.getSearchAliases(business.id)); }
    catch (err) { setError(err instanceof DiscoveryApiError ? err.message : 'Unable to load search aliases.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [business.id]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = alias.trim();
    if (!value) return;
    if (value.length > 180) { setError('Search alias must be 180 characters or fewer.'); return; }
    setSaving(true); setError(null);
    try {
      const created = await discoveryApi.createSearchAlias(business.id, { alias: value, entityType: 'BUSINESS' });
      setAliases((current) => current.some((x) => x.id === created.id) ? current.map((x) => x.id === created.id ? created : x) : [...current, created].sort((a,b) => a.alias.localeCompare(b.alias)));
      setAlias('');
    } catch (err) { setError(err instanceof DiscoveryApiError ? err.message : 'Unable to save search alias.'); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    setRemovingId(id); setError(null);
    try { await discoveryApi.deleteSearchAlias(business.id, id); setAliases((current) => current.filter((x) => x.id !== id)); }
    catch (err) { setError(err instanceof DiscoveryApiError ? err.message : 'Unable to remove search alias.'); }
    finally { setRemovingId(null); }
  };

  return (
    <section className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Search & Aliases</h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
              Add alternate names, common spellings and phrases customers may use to find this business. Aliases affect Discovery search and suggestions; they do not change your public business name.
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1.5 rounded-full whitespace-nowrap">{aliases.length} active</span>
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 text-[11px] text-slate-600 dark:text-slate-300">
          <Info className="w-4 h-4 shrink-0 text-indigo-600 mt-0.5" />
          <p>Use real customer terminology rather than keyword stuffing. For example, a business named “Mobile Phones SL” might add “phone shop” or a commonly used local name.</p>
        </div>

        <form onSubmit={add} className="mt-5 flex flex-col sm:flex-row gap-2">
          <label className="sr-only" htmlFor="discovery-search-alias">Add search alias</label>
          <input
            id="discovery-search-alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            maxLength={180}
            placeholder="e.g. phone shop, mobile dealer"
            className="flex-1 min-w-0 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button type="submit" disabled={saving || !alias.trim()} className="px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center justify-center gap-2">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add alias
          </button>
        </form>

        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Active aliases</h3>
        {loading ? (
          <div className="py-10 flex items-center justify-center text-xs text-slate-400 gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Loading aliases...</div>
        ) : aliases.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">No custom aliases yet. Add terms customers actually use to find {business.name}.</div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {aliases.map((item) => (
              <li key={item.id} className="py-3 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{item.alias}</span>
                <button type="button" onClick={() => void remove(item.id)} disabled={removingId === item.id} aria-label={`Remove alias ${item.alias}`} className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50">
                  {removingId === item.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
