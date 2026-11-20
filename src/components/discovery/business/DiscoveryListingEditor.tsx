import React, { useState, useEffect, useRef } from 'react';
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
  Upload,
  Trash2,
  Camera,
  Check,
  Loader2,
  Eye,
  Plus,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type {
  DiscoveryBusiness,
  DiscoveryCategory,
  DiscoveryBusinessMode,
  DiscoverySocialLink,
  DiscoverySocialPlatform,
} from '../../../types/discovery';
import {
  SOCIAL_PLATFORMS,
  detectSocialPlatform,
  getSocialPlatformConfig,
  sanitizeUrl,
} from '../socialLinks';
import { ListingStatusBadge } from '../ListingStatusBadge';
import { VerificationBadge } from '../VerificationBadge';

const parseBusinessSocialLinks = (b: DiscoveryBusiness): DiscoverySocialLink[] => {
  if (Array.isArray(b?.social_links)) return b.social_links;
  if (typeof b?.social_links === 'string') {
    try {
      const parsed = JSON.parse(b.social_links);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  if (b?.website && b.website.trim()) {
    return [{ id: `link_init_${b.id}`, platform: 'website' as const, url: b.website.trim(), label: 'Official Website' }];
  }
  return [];
};

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
    socialLinks: parseBusinessSocialLinks(business),
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

  // Visual Media Upload State
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const [uploadingBanner, setUploadingBanner] = useState<boolean>(false);
  const [mediaMessage, setMediaMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCustomBannerUrl, setShowCustomBannerUrl] = useState<boolean>(false);
  const [showCustomLogoUrl, setShowCustomLogoUrl] = useState<boolean>(false);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  const handleMediaFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMediaMessage({ type: 'error', text: 'Please select a valid image file (PNG, JPG, WebP, SVG).' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMediaMessage({ type: 'error', text: 'Image file size must be less than 5MB.' });
      return;
    }

    if (type === 'logo') setUploadingLogo(true);
    else setUploadingBanner(true);
    setMediaMessage(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const res = await discoveryApi.uploadBusinessMedia(business.id, {
          type,
          data: base64Data,
          fileName: file.name,
        });

        if (type === 'logo') {
          setFormData((prev) => ({ ...prev, logoUrl: res.url }));
          setMediaMessage({ type: 'success', text: 'Logo uploaded and saved successfully.' });
        } else {
          setFormData((prev) => ({ ...prev, coverImageUrl: res.url }));
          setMediaMessage({ type: 'success', text: 'Cover banner uploaded and saved successfully.' });
        }

        onUpdate({
          ...business,
          ...(type === 'logo' ? { logo_url: res.url } : { cover_image_url: res.url }),
        });
      } catch (err: unknown) {
        setMediaMessage({
          type: 'error',
          text: err instanceof Error ? err.message : `Failed to upload ${type}.`,
        });
      } finally {
        if (type === 'logo') setUploadingLogo(false);
        else setUploadingBanner(false);
        if (e.target) e.target.value = '';
      }
    };

    reader.onerror = () => {
      setMediaMessage({ type: 'error', text: 'Failed to read image file from device.' });
      if (type === 'logo') setUploadingLogo(false);
      else setUploadingBanner(false);
    };

    reader.readAsDataURL(file);
  };

  const handleRemoveMedia = (type: 'logo' | 'banner') => {
    if (type === 'logo') {
      setFormData((prev) => ({ ...prev, logoUrl: '' }));
      setMediaMessage({ type: 'success', text: 'Logo removed. Click Save Changes to finalize.' });
    } else {
      setFormData((prev) => ({ ...prev, coverImageUrl: '' }));
      setMediaMessage({ type: 'success', text: 'Cover banner removed. Click Save Changes to finalize.' });
    }
  };

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
      socialLinks: parseBusinessSocialLinks(business),
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
        const [cats, assigned] = await Promise.all([
          discoveryApi.getCategories(),
          discoveryApi.getBusinessCategories(business.id).catch(() => [] as DiscoveryCategory[]),
        ]);
        if (!mounted) return;
        setAvailableCategories(Array.isArray(cats) ? cats : []);
        const assignedIds = (Array.isArray(assigned) ? assigned : [])
          .filter((c) => c.is_active !== false)
          .map((c) => c.id);
        if (assignedIds.length > 0) {
          setSelectedCategoryIds(assignedIds);
        } else if (business.category_slug && Array.isArray(cats)) {
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
  }, [business.id, business.category_slug]);

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

  const handleAddSocialLink = (platform: DiscoverySocialPlatform = 'facebook') => {
    const newLink: DiscoverySocialLink = {
      id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      platform,
      url: '',
      label: '',
    };
    setFormData((prev) => ({
      ...prev,
      socialLinks: [...(prev.socialLinks || []), newLink],
    }));
  };

  const handleUpdateSocialLink = (id: string, patch: Partial<DiscoverySocialLink>) => {
    setFormData((prev) => {
      const currentLinks = prev.socialLinks || [];
      const nextLinks = currentLinks.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...patch };
        if (patch.url && (!patch.platform || item.platform === 'website' || item.platform === 'other')) {
          const detected = detectSocialPlatform(patch.url);
          if (detected !== 'website' || item.platform === 'website') {
            updated.platform = detected;
          }
        }
        return updated;
      });
      const firstWeb = nextLinks.find((l) => l.platform === 'website')?.url || nextLinks[0]?.url || '';
      return {
        ...prev,
        socialLinks: nextLinks,
        website: firstWeb || prev.website,
      };
    });
  };

  const handleRemoveSocialLink = (id: string) => {
    setFormData((prev) => {
      const currentLinks = prev.socialLinks || [];
      const nextLinks = currentLinks.filter((l) => l.id !== id);
      const firstWeb = nextLinks.find((l) => l.platform === 'website')?.url || nextLinks[0]?.url || '';
      return {
        ...prev,
        socialLinks: nextLinks,
        website: firstWeb,
      };
    });
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

      const validSocialLinks = (formData.socialLinks || [])
        .map((l) => ({ ...l, url: sanitizeUrl(l.url) }))
        .filter((l) => l.url.trim().length > 0);
      const primaryWebsite = formData.website.trim() || validSocialLinks.find((l) => l.platform === 'website')?.url || validSocialLinks[0]?.url || null;

      const patch: Partial<DiscoveryBusiness> & { socialLinks?: DiscoverySocialLink[] } = {
        name: formData.name.trim(),
        slug: formData.slug.trim() || undefined,
        business_type: formData.businessType.trim() || null,
        short_description: formData.shortDescription.trim() || null,
        description: formData.description.trim() || null,
        phone: formData.phone.trim() || null,
        whatsapp: formData.whatsapp.trim() || null,
        email: formData.email.trim() || null,
        website: primaryWebsite,
        social_links: validSocialLinks,
        socialLinks: validSocialLinks,
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="pb-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Phone className="w-5 h-5 text-indigo-600" />
              Direct Contact & Customer Inquiries
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Allow verified customers to reach your sales or support desk with one tap.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleAddSocialLink('facebook')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-colors shrink-0 min-h-[44px]"
            title="Add web or social media link"
          >
            <Plus className="w-4 h-4" />
            <span>Add Web / Social Link</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
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
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
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
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
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
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
            />
          </div>
        </div>

        {/* Dedicated Web & Social Media Customization Block */}
        <div className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-600" />
                Web & Social Media Profiles
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Customize multiple links (Facebook, Instagram, website, TikTok, etc.) shown on your public profile.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleAddSocialLink('facebook')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition min-h-[40px] shrink-0 self-start sm:self-center"
              title="Add another link"
            >
              <Plus className="w-4 h-4" />
              <span>Add Link</span>
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-semibold text-slate-400">Quick add:</span>
            {[
              { platform: 'facebook' as const, label: 'Facebook' },
              { platform: 'instagram' as const, label: 'Instagram' },
              { platform: 'website' as const, label: 'Website' },
              { platform: 'tiktok' as const, label: 'TikTok' },
              { platform: 'whatsapp' as const, label: 'WhatsApp Channel' },
            ].map((item) => (
              <button
                key={item.platform}
                type="button"
                onClick={() => handleAddSocialLink(item.platform)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition min-h-[32px]"
              >
                <Plus className="w-3 h-3 text-slate-400" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Links list */}
          {(formData.socialLinks || []).length === 0 ? (
            <div className="py-8 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center bg-white dark:bg-slate-900/60">
              <Globe className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                No web or social media links added
              </p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                Add links to your Facebook page, Instagram profile, or company website to build customer trust and grow your following.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(formData.socialLinks || []).map((link, idx) => {
                const cfg = getSocialPlatformConfig(link.platform);
                const IconComp = cfg.icon;
                return (
                  <div
                    key={link.id || idx}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 transition"
                  >
                    {/* Platform Selector */}
                    <div className="w-full sm:w-44 shrink-0">
                      <label className="sr-only">Platform</label>
                      <div className="relative">
                        <select
                          value={link.platform}
                          onChange={(e) => handleUpdateSocialLink(link.id, { platform: e.target.value as DiscoverySocialPlatform })}
                          className="w-full appearance-none pl-8 pr-7 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                        >
                          {SOCIAL_PLATFORMS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                        <div className="absolute left-2.5 top-3 pointer-events-none text-slate-400">
                          <IconComp className="w-3.5 h-3.5" />
                        </div>
                        <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-3.5 pointer-events-none text-slate-400" />
                      </div>
                    </div>

                    {/* URL Input */}
                    <div className="flex-1 min-w-0">
                      <label className="sr-only">URL</label>
                      <input
                        type="url"
                        value={link.url}
                        onChange={(e) => handleUpdateSocialLink(link.id, { url: e.target.value })}
                        placeholder={cfg.placeholder}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                      />
                    </div>

                    {/* Optional Label */}
                    <div className="w-full sm:w-40 shrink-0">
                      <label className="sr-only">Label</label>
                      <input
                        type="text"
                        value={link.label || ''}
                        onChange={(e) => handleUpdateSocialLink(link.id, { label: e.target.value })}
                        placeholder="Label (optional)"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                      />
                    </div>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveSocialLink(link.id)}
                      className="p-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center self-end sm:self-center"
                      title="Remove link"
                      aria-label={`Remove ${cfg.label} link`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Visual Branding & Images (Direct File Upload & Presets) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="pb-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-indigo-600" />
              Visual Branding & Media Assets
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Upload custom logos and cover banners to highlight your business in the discovery feed and customer storefront.
            </p>
          </div>
        </div>

        {/* Media Upload Status Notice */}
        {mediaMessage && (
          <div
            className={`mt-4 p-3.5 rounded-2xl flex items-center gap-2.5 text-xs font-semibold ${
              mediaMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
            }`}
          >
            {mediaMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{mediaMessage.text}</span>
          </div>
        )}

        {/* Hidden File Inputs */}
        <input
          type="file"
          ref={logoFileRef}
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          onChange={(e) => void handleMediaFileSelect(e, 'logo')}
          className="hidden"
        />
        <input
          type="file"
          ref={bannerFileRef}
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          onChange={(e) => void handleMediaFileSelect(e, 'banner')}
          className="hidden"
        />

        <div className="space-y-8 mt-6">
          {/* 1. Cover Banner Upload */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Storefront Cover Banner
                </label>
                <p className="text-[11px] text-slate-500">
                  Recommended: 1200 × 400px (3:1 ratio). Displayed at the top of your public business profile.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1 sm:pt-0">
                <button
                  type="button"
                  onClick={() => bannerFileRef.current?.click()}
                  disabled={uploadingBanner}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  {uploadingBanner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>{uploadingBanner ? 'Uploading…' : formData.coverImageUrl ? 'Replace Banner' : 'Upload Banner'}</span>
                </button>
                {formData.coverImageUrl && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMedia('banner')}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                    title="Remove banner"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Banner Preview Card / Dropzone */}
            <div
              onClick={() => !formData.coverImageUrl && bannerFileRef.current?.click()}
              className={`relative h-44 sm:h-52 w-full rounded-2xl overflow-hidden border-2 transition-all ${
                formData.coverImageUrl
                  ? 'border-slate-200 dark:border-slate-700'
                  : 'border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/70 dark:bg-slate-850/50 cursor-pointer flex flex-col items-center justify-center text-center p-6'
              }`}
            >
              {formData.coverImageUrl ? (
                <>
                  <img
                    src={formData.coverImageUrl}
                    alt="Cover preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-2xs">
                    <button
                      type="button"
                      onClick={() => bannerFileRef.current?.click()}
                      className="px-3.5 py-1.5 rounded-lg bg-white/90 hover:bg-white text-slate-900 text-xs font-bold shadow-md cursor-pointer"
                    >
                      Change Photo
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-2 pointer-events-none">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                    <Camera className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Click to browse or drag & drop a cover banner
                  </p>
                  <p className="text-[11px] text-slate-400">PNG, JPG, WebP or SVG up to 5MB</p>
                </div>
              )}
            </div>

            {/* Curated High-Res African Merchant Banner Themes */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Quick Banner Themes (1-Click Apply):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {[
                  {
                    name: 'Fresh Market',
                    url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80',
                  },
                  {
                    name: 'Fashion Boutique',
                    url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
                  },
                  {
                    name: 'Tech & Devices',
                    url: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=1200&q=80',
                  },
                  {
                    name: 'Restaurant & Dining',
                    url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
                  },
                  {
                    name: 'Pharmacy & Health',
                    url: 'https://images.unsplash.com/photo-1586015555751-63c23577d611?auto=format&fit=crop&w=1200&q=80',
                  },
                  {
                    name: 'Artisan Workshop',
                    url: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1200&q=80',
                  },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, coverImageUrl: preset.url }));
                      setMediaMessage({ type: 'success', text: `Selected "${preset.name}" banner theme.` });
                    }}
                    className={`group relative h-16 rounded-xl overflow-hidden border text-left transition cursor-pointer ${
                      formData.coverImageUrl === preset.url
                        ? 'border-indigo-600 ring-2 ring-indigo-500/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <img src={preset.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end p-1.5">
                      <span className="text-[10px] font-bold text-white truncate w-full">{preset.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom URL Input Toggle */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowCustomBannerUrl((v) => !v)}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                {showCustomBannerUrl ? '− Hide direct image URL input' : '+ Or paste a direct image URL'}
              </button>
              {showCustomBannerUrl && (
                <div className="mt-2 space-y-1">
                  <input
                    type="url"
                    value={formData.coverImageUrl}
                    onChange={(e) => setFormData({ ...formData, coverImageUrl: e.target.value })}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 2. Business Logo Upload */}
          <div className="space-y-3 pt-6 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Business Logo
                </label>
                <p className="text-[11px] text-slate-500">
                  Recommended: 400 × 400px (1:1 square). Appears as your merchant avatar in search and headers.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1 sm:pt-0">
                <button
                  type="button"
                  onClick={() => logoFileRef.current?.click()}
                  disabled={uploadingLogo}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>{uploadingLogo ? 'Uploading…' : formData.logoUrl ? 'Replace Logo' : 'Upload Logo'}</span>
                </button>
                {formData.logoUrl && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMedia('logo')}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                    title="Remove logo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Logo Preview Box */}
              <div
                onClick={() => !formData.logoUrl && logoFileRef.current?.click()}
                className={`w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 flex items-center justify-center shrink-0 transition-all ${
                  formData.logoUrl
                    ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xs'
                    : 'border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/80 dark:bg-slate-850/50 cursor-pointer text-slate-400'
                }`}
              >
                {formData.logoUrl ? (
                  <img
                    src={formData.logoUrl}
                    alt="Logo preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="text-center p-2">
                    <Building2 className="w-6 h-6 mx-auto mb-1 text-slate-400" />
                    <span className="text-[10px] font-bold block text-slate-500">Logo</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {formData.logoUrl ? 'Custom logo active' : 'No logo uploaded yet'}
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {formData.logoUrl
                    ? 'Your brand mark is published across discovery cards and storefront checkout.'
                    : 'If no logo is uploaded, your listing will display stylized business initials.'}
                </p>
                <button
                  type="button"
                  onClick={() => setShowCustomLogoUrl((v) => !v)}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer block pt-1"
                >
                  {showCustomLogoUrl ? '− Hide direct logo URL input' : '+ Or paste a direct logo URL'}
                </button>
                {showCustomLogoUrl && (
                  <input
                    type="url"
                    value={formData.logoUrl}
                    onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
                  />
                )}
              </div>
            </div>
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
