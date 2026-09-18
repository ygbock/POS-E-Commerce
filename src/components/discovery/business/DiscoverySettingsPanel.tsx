import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Eye,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Phone,
  MessageSquare,
  Navigation,
  FileText,
  Star,
  ExternalLink,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type {
  DiscoveryBusiness,
  DiscoveryBusinessSettings,
} from '../../../types/discovery';

interface DiscoverySettingsPanelProps {
  business: DiscoveryBusiness;
}

export const DiscoverySettingsPanel: React.FC<DiscoverySettingsPanelProps> = ({
  business,
}) => {
  const [settings, setSettings] = useState<DiscoveryBusinessSettings>({
    business_id: business.id,
    show_products: true,
    show_prices: true,
    show_stock_status: true,
    allow_phone_contact: true,
    allow_whatsapp_contact: true,
    allow_directions: true,
    allow_service_requests: true,
    allow_reviews: true,
    allow_public_store_link: true,
  });

  const [saving, setSaving] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = (key: keyof DiscoveryBusinessSettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await discoveryApi.updateSettings(business.id, {
        show_products: settings.show_products,
        show_prices: settings.show_prices,
        show_stock_status: settings.show_stock_status,
        allow_phone_contact: settings.allow_phone_contact,
        allow_whatsapp_contact: settings.allow_whatsapp_contact,
        allow_directions: settings.allow_directions,
        allow_service_requests: settings.allow_service_requests,
        allow_reviews: settings.allow_reviews,
        allow_public_store_link: settings.allow_public_store_link,
      });

      if (updated) {
        setSettings(updated);
      }
      setSuccess('Discovery visibility and interaction permissions updated.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to update settings.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="pb-6 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            Public Visibility & Interaction Preferences
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Fine-tune what customer information, products, prices, and direct communication channels are exposed in discovery search.
          </p>
        </div>

        {/* Alerts */}
        {success && (
          <div className="mt-4 flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {/* Catalog & Inventory Visibility */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-indigo-600" />
              Catalog & Product Projection
            </h3>

            {/* Show Products */}
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Project Catalog Products
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Allow your active store products to appear in discovery product search.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.show_products}
                onChange={() => handleToggle('show_products')}
                className="w-4 h-4 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              />
            </label>

            {/* Show Prices */}
            <label className="flex items-start justify-between gap-3 cursor-pointer pt-3 border-t border-slate-200/60 dark:border-slate-800">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Display Retail Prices
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Show transparent pricing (SLE) directly on public product cards.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.show_prices}
                onChange={() => handleToggle('show_prices')}
                className="w-4 h-4 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              />
            </label>

            {/* Show Stock Status */}
            <label className="flex items-start justify-between gap-3 cursor-pointer pt-3 border-t border-slate-200/60 dark:border-slate-800">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Display Real-Time Stock Status
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Inform customers if an item is "In Stock", "Limited", or "Out of Stock".
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.show_stock_status}
                onChange={() => handleToggle('show_stock_status')}
                className="w-4 h-4 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              />
            </label>
          </div>

          {/* Customer Interaction & Contact Channels */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-600" />
              Customer Contact & Communication
            </h3>

            {/* Phone contact */}
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Direct Phone Calling
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Display "Call Now" button on public business profile.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.allow_phone_contact}
                onChange={() => handleToggle('allow_phone_contact')}
                className="w-4 h-4 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              />
            </label>

            {/* WhatsApp contact */}
            <label className="flex items-start justify-between gap-3 cursor-pointer pt-3 border-t border-slate-200/60 dark:border-slate-800">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  WhatsApp Instant Message
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Allow customers to initiate WhatsApp order chats directly.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.allow_whatsapp_contact}
                onChange={() => handleToggle('allow_whatsapp_contact')}
                className="w-4 h-4 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              />
            </label>

            {/* Directions */}
            <label className="flex items-start justify-between gap-3 cursor-pointer pt-3 border-t border-slate-200/60 dark:border-slate-800">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Navigation & Directions
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Provide turn-by-turn map directions to your storefronts.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.allow_directions}
                onChange={() => handleToggle('allow_directions')}
                className="w-4 h-4 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              />
            </label>
          </div>

          {/* Marketplace & Inquiries */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-600" />
              Service Requests & Quotes
            </h3>

            {/* Service Requests */}
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Receive Service Quote Requests
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Allow nearby customers to submit customized job inquiries and request quotes.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.allow_service_requests}
                onChange={() => handleToggle('allow_service_requests')}
                className="w-4 h-4 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              />
            </label>

            {/* Public Store Link */}
            <label className="flex items-start justify-between gap-3 cursor-pointer pt-3 border-t border-slate-200/60 dark:border-slate-800">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Online Storefront Link
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Show a prominent "Visit Online Store" button for full digital checkout.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.allow_public_store_link}
                onChange={() => handleToggle('allow_public_store_link')}
                className="w-4 h-4 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              />
            </label>
          </div>

          {/* Reviews & Social Proof */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500" />
              Reviews & Social Proof
            </h3>

            {/* Allow Reviews */}
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Customer Reviews & Ratings
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Allow verified buyers and visitors to leave public feedback and star ratings.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.allow_reviews}
                onChange={() => handleToggle('allow_reviews')}
                className="w-4 h-4 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{saving ? 'Saving Settings...' : 'Save Visibility Settings'}</span>
        </button>
      </div>
    </form>
  );
};
