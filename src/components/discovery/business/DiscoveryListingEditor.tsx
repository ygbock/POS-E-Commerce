import React, { useState, useEffect } from 'react';
import {
  Store,
  Building2,
  Phone,
  MessageSquare,
  Mail,
  Globe,
  Image as ImageIcon,
  Tag,
  Save,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type {
  DiscoveryBusiness,
  DiscoveryCategory,
  DiscoveryBusinessMode,
} from '../../../types/discovery';
import { ListingStatusBadge } from '../ListingStatusBadge';
import { VerificationBadge } from '../VerificationBadge';

interface DiscoveryListingEditorProps {
  business: DiscoveryBusiness;
  onUpdate: (updated: DiscoveryBusiness) => void;
  onOpenStoreConversion?: () => void;
}

export const DiscoveryListingEditor: React.FC<DiscoveryListingEditorProps> = ({
  business,
  onUpdate,
  onOpenStoreConversion,
}) => {
  // Form State
  const [formData, setFormData] = useState({
    name: business.name || '',
    slug: business.slug || '',
    businessType: business.business_type || '',
    shortDescription: business.short_description || '',
    description: business.description || '',
    phone: business.phone || '',
    whatsapp: business.whatsapp || '',
    email: business.email || '',
    website: business.website || '',
    logoUrl: business.logo_url || '',
    coverImageUrl: business.cover_image_url || '',
    businessMode: business.business_mode || 'DISCOVERY_ONLY',
    isDiscoverable: business.is_discoverable ?? true,
  });

  // Categories State
  const [availableCategories, setAvailableCategories] = useState<DiscoveryCategory[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(true);

  // Status & Feedback State
  const [saving, setSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync when business prop changes
  useEffect(() => {
    setFormData({
      name: business.name || '',
      slug: business.slug || '',
      businessType: business.business_type || '',
      shortDescription: business.short_description || '',
      description: business.description || '',
      phone: business.phone || '',
      whatsapp: business.whatsapp || '',
      email: business.email || '',
      website: business.website || '',
      logoUrl: business.logo_url || '',
      coverImageUrl: business.cover_image_url || '',
      businessMode: business.business_mode || 'DISCOVERY_ONLY',
      isDiscoverable: business.is_discoverable ?? true,
    });
  }, [business]);

  // Load Categories
  useEffect(() => {
    let mounted = true;
    const fetchCats = async () => {
      try {
        const cats = await discoveryApi.getCategories();
        if (!mounted) return;
        setAvailableCategories(cats);
        // Find existing assigned categories if possible
        if (business.category_slug) {
          const matched = cats.find((c) => c.slug === business.category_slug);
          if (matched) setSelectedCategoryIds([matched.id]);
        }
      } catch (err) {
        console.error('Failed to load categories', err);
      } finally {
        if (mounted) setLoadingCategories(false);
      }
    };
    void fetchCats();
    return () => {
      mounted = false;
    };
  }, [business.category_slug]);

  const handleSlugify = () => {
    const generated = formData.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setFormData((prev) => ({ ...prev, slug: generated }));
  };

  const handleCategoryToggle = (id: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((catId) => catId !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      if (!formData.name.trim()) {
        throw new Error('Business name is required.');
      }

      const patch: Partial<DiscoveryBusiness> = {
        name: formData.name.trim(),
        slug: formData.slug.trim() || undefined,
        business_type: formData.businessType.trim() || null,
        short_description: formData.shortDescription.trim() || null,
        description: formData.description.trim() || null,
        phone: formData.phone.trim() || null,
        whatsapp: formData.whatsapp.trim() || null,
        email: formData.email.trim() || null,
        website: formData.website.trim() || null,
        logo_url: formData.logoUrl.trim() || null,
        cover_image_url: formData.coverImageUrl.trim() || null,
        business_mode: formData.businessMode as DiscoveryBusinessMode,
        is_discoverable: formData.isDiscoverable,
      };

      const updated = await discoveryApi.updateBusiness(business.id, patch);

      // Update categories if any selected
      if (selectedCategoryIds.length > 0) {
        await discoveryApi.updateBusinessCategories(business.id, selectedCategoryIds);
      }

      onUpdate(updated);
      setSuccessMessage('Business listing profile updated successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('An unexpected error occurred while saving.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8" id="discovery-listing-editor-form">
      {/* Top Notification Alerts */}
      {successMessage && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm animate-in fade-in duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Section 1: Core Business Identity */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              General Business Identity
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              How your business appears to customers browsing local discovery search.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ListingStatusBadge status={business.listing_status} />
            <VerificationBadge status={business.verification_status} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Business Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Business Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Lumley Fresh Market & Cafe"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Business Slug */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Public URL Slug
              </label>
              <button
                type="button"
                onClick={handleSlugify}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                Auto-generate
              </button>
            </div>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-xs text-slate-400 select-none">/discover/</span>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="lumley-fresh-market"
                className="w-full pl-20 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Business Type */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Business Type / Industry
            </label>
            <select
              value={formData.businessType}
              onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select industry category...</option>
              <option value="Retail & Grocery">Retail & Grocery</option>
              <option value="Restaurant & Food">Restaurant & Food</option>
              <option value="Professional Services">Professional Services</option>
              <option value="Automotive & Transport">Automotive & Transport</option>
              <option value="Health & Beauty">Health & Beauty</option>
              <option value="Crafts & Artisan">Crafts & Artisan</option>
              <option value="Electronics & Tech">Electronics & Tech</option>
              <option value="Home & Construction">Home & Construction</option>
              <option value="General Services">General Services</option>
            </select>
          </div>

          {/* Business Mode */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Operating Mode
              </label>
              {formData.businessMode === 'DISCOVERY_ONLY' && onOpenStoreConversion && (
                <button
                  type="button"
                  onClick={onOpenStoreConversion}
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Upgrade to Unified Store
                </button>
              )}
            </div>
            <select
              value={formData.businessMode}
              onChange={(e) => setFormData({ ...formData, businessMode: e.target.value as DiscoveryBusinessMode })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="DISCOVERY_ONLY">Discovery Only (Directory & Leads)</option>
              <option value="DISCOVERY_AND_STORE">Discovery + Online Store & POS</option>
            </select>
          </div>

          {/* Short Description */}
          <div className="md:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Tagline / Short Summary (Max 160 chars)
              </label>
              <span className="text-xs text-slate-400">
                {formData.shortDescription.length}/160
              </span>
            </div>
            <input
              type="text"
              maxLength={160}
              value={formData.shortDescription}
              onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
              placeholder="Fresh organic produce, artisan bakery, and daily essentials in the heart of Lumley."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Detailed Description */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Full Business Story & Overview
            </label>
            <textarea
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe your history, specialties, warranty policies, customer care standards, and what sets you apart..."
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 custom-scrollbar"
            />
          </div>
        </div>
      </div>

      {/* Section 2: Contact Channels & Links */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="pb-6 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Phone className="w-5 h-5 text-indigo-600" />
            Direct Contact & Customer Inquiries
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Allow verified customers to reach your sales or support desk with one tap.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
          {/* Phone */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              Direct Phone Number
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+232 76 123456"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* WhatsApp */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
              WhatsApp Direct Order / Chat
            </label>
            <input
              type="tel"
              value={formData.whatsapp}
              onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
              placeholder="+232 78 654321"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              Inquiry Email Address
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="contact@mybusiness.sl"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Website */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              Official Website / Social Link
            </label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://mybusiness.sl"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Section 3: Visual Branding & Images */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="pb-6 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-indigo-600" />
            Visual Branding & Media Assets
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Add high-resolution logo and cover images to stand out in neighborhood discovery cards.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Logo URL */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Logo Image URL
            </label>
            <input
              type="url"
              value={formData.logoUrl}
              onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
              placeholder="https://images.unsplash.com/..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {formData.logoUrl ? (
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                <img
                  src={formData.logoUrl}
                  alt="Logo preview"
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 bg-white"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <span className="text-xs text-slate-500">Logo preview</span>
              </div>
            ) : null}
          </div>

          {/* Cover Image URL */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Cover Banner Image URL
            </label>
            <input
              type="url"
              value={formData.coverImageUrl}
              onChange={(e) => setFormData({ ...formData, coverImageUrl: e.target.value })}
              placeholder="https://images.unsplash.com/..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {formData.coverImageUrl ? (
              <div className="h-20 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 relative">
                <img
                  src={formData.coverImageUrl}
                  alt="Cover preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Section 4: Taxonomy & Category Mapping */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="pb-6 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Tag className="w-5 h-5 text-indigo-600" />
            Category & Search Placement
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Choose categories that accurately describe your offerings to appear in relevant filtered searches.
          </p>
        </div>

        <div className="mt-6">
          {loadingCategories ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading discovery category taxonomy...
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {availableCategories.map((cat) => {
                const isSelected = selectedCategoryIds.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategoryToggle(cat.id)}
                    className={`px-4 py-2 rounded-2xl text-xs font-semibold border transition-all flex items-center gap-2 ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/20'
                        : 'bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <span>{cat.name}</span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="sticky bottom-4 z-10 flex items-center justify-between p-4 rounded-3xl bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur text-white shadow-xl border border-slate-700">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isDiscoverable}
              onChange={(e) => setFormData({ ...formData, isDiscoverable: e.target.checked })}
              className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Discoverable in Public Search</span>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{saving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
          </button>
        </div>
      </div>
    </form>
  );
};
