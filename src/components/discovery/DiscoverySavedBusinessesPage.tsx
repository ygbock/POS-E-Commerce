import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Heart, MapPin, RefreshCw, Store, Trash2, AlertCircle } from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../services/discoveryApi';
import type { DiscoveryFavoriteBusiness } from '../../types/discovery';

interface DiscoverySavedBusinessesPageProps {
  onBack?: () => void;
  onOpenBusiness?: (businessId: string) => void;
}

export const DiscoverySavedBusinessesPage: React.FC<DiscoverySavedBusinessesPageProps> = ({
  onBack,
  onOpenBusiness,
}) => {
  const [items, setItems] = useState<DiscoveryFavoriteBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await discoveryApi.getMyFavoriteBusinesses());
    } catch (err: unknown) {
      setError(err instanceof DiscoveryApiError ? err.message : err instanceof Error ? err.message : 'Unable to load saved businesses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = async (businessId: string) => {
    try {
      await discoveryApi.removeBusinessFavorite(businessId);
      setItems((prev) => prev.filter((item) => item.id !== businessId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to remove saved business.');
    }
  };

  return (
    <div className="min-h-[70vh] bg-slate-50 dark:bg-slate-950 px-4 sm:px-6 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <button type="button" onClick={onBack || (() => window.history.back())} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600">
              <ArrowLeft className="w-4 h-4" /> Back to Discovery
            </button>
            <h1 className="mt-4 text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Heart className="w-6 h-6 text-rose-500 fill-current" /> Saved Businesses
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Businesses you saved for quick access later.</p>
          </div>
          <button type="button" onClick={() => void load()} aria-label="Refresh saved businesses" className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <RefreshCw className="w-4 h-4" />
          </button>
        </header>

        {error && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 p-4 text-xs text-rose-700 dark:text-rose-200 flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-indigo-600" /></div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center">
            <Heart className="w-10 h-10 mx-auto text-slate-300" />
            <h2 className="mt-4 text-sm font-bold text-slate-800 dark:text-white">No saved businesses yet</h2>
            <p className="mt-1 text-xs text-slate-500">Save a business from its Discovery profile to find it here.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => {
              const location = [item.city, item.district, item.region].filter(Boolean).join(', ');
              return (
                <article key={item.id} className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => onOpenBusiness?.(item.slug)} className="text-left flex-1">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 font-black">
                        {item.logo_url ? <img src={item.logo_url} alt="" className="w-full h-full rounded-2xl object-cover" /> : <Store className="w-6 h-6" />}
                      </div>
                      <h2 className="mt-4 text-sm font-black text-slate-900 dark:text-white">{item.name}</h2>
                    </button>
                    <button type="button" onClick={() => void remove(item.id)} aria-label={`Remove ${item.name} from saved businesses`} className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {item.short_description && <p className="mt-2 text-xs text-slate-500 line-clamp-2">{item.short_description}</p>}
                  {location && <p className="mt-3 text-[11px] text-slate-400 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{location}</p>}
                  <button type="button" onClick={() => onOpenBusiness?.(item.slug)} className="mt-4 w-full rounded-xl bg-indigo-600 text-white py-2.5 text-xs font-bold">
                    View Business
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
