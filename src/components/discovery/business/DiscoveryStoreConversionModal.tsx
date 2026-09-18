import React, { useState } from 'react';
import {
  Sparkles,
  Store,
  CreditCard,
  Package,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  X,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type { DiscoveryBusiness } from '../../../types/discovery';

interface DiscoveryStoreConversionModalProps {
  business: DiscoveryBusiness;
  isOpen: boolean;
  onClose: () => void;
  onConverted: (updated: DiscoveryBusiness) => void;
}

export const DiscoveryStoreConversionModal: React.FC<DiscoveryStoreConversionModalProps> = ({
  business,
  isOpen,
  onClose,
  onConverted,
}) => {
  const [storeName, setStoreName] = useState(business.name || '');
  const [currency, setCurrency] = useState('SLE');
  const [enableOnlineCheckout, setEnableOnlineCheckout] = useState(true);
  const [enablePOS, setEnablePOS] = useState(true);
  const [enableInventoryLedger, setEnableInventoryLedger] = useState(true);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setConverting(true);
    setError(null);

    try {
      await discoveryApi.updateBusiness(business.id, {
        name: storeName.trim() || business.name,
        businessMode: 'DISCOVERY_AND_STORE',
      });

      // Update business mode in local state
      const updatedBusiness: DiscoveryBusiness = {
        ...business,
        name: storeName.trim() || business.name,
        businessMode: 'DISCOVERY_AND_STORE',
      };

      onConverted(updatedBusiness);
      onClose();
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to upgrade business to Unified Commerce Store.');
      }
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl custom-scrollbar">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Upgrade to Unified Commerce Store
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Unlock online shopping, instant checkout, and POS terminal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleConvert} className="space-y-5 mt-5">
          {/* Features highlight */}
          <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 space-y-2.5">
            <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block">
              What gets enabled automatically:
            </span>
            <ul className="space-y-1.5 text-xs text-emerald-800 dark:text-emerald-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Dedicated e-commerce storefront linked to your Discovery listing</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Integrated AbaCha POS register for in-person cash & mobile money</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Real-time multi-location inventory ledger & low-stock alerts</span>
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Online Store Name
            </label>
            <input
              type="text"
              required
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Primary Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="SLE">Sierra Leonean Leone (SLE)</option>
              <option value="USD">US Dollar (USD)</option>
            </select>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={enableOnlineCheckout}
                onChange={(e) => setEnableOnlineCheckout(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Enable Customer Online Checkout (Orange Money & Afrimoney)</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={enablePOS}
                onChange={(e) => setEnablePOS(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Enable Point of Sale (POS) Hardware & Thermal Receipt Printing</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={converting}
              className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
            >
              {converting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{converting ? 'Provisioning Store...' : 'Confirm Upgrade'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
