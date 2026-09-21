import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  Save,
  Sparkles,
  Store,
  Building2,
  Phone,
  Tag,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type {
  DiscoveryBusiness,
  DiscoveryBusinessMode,
  DiscoveryCategory,
} from '../../../types/discovery';

interface DiscoveryOnboardingWizardProps {
  onSuccess: (createdBusiness: DiscoveryBusiness) => void;
  onCancel?: () => void;
  initialBusinessId?: string;
}

type WizardStep = 1 | 2 | 3 | 4 | 5;

const DRAFT_KEY = 'abacha.discovery.onboarding.draft.v2';

const emptyForm = {
  name: '',
  businessType: '',
  shortDescription: '',
  description: '',
  phone: '',
  whatsapp: '',
  email: '',
  website: '',
  mode: 'DISCOVERY_ONLY' as DiscoveryBusinessMode,
  categoryIds: [] as string[],
  locationName: 'Main Store / Office',
  address: '',
  city: '',
  district: '',
  region: '',
  latitude: '',
  longitude: '',
  serviceRadiusKm: '',
};

const normalizeBusinessMode = (value: unknown): DiscoveryBusinessMode =>
  value === 'DISCOVERY_AND_STORE' ? 'DISCOVERY_AND_STORE' : 'DISCOVERY_ONLY';

export const DiscoveryOnboardingWizard: React.FC<DiscoveryOnboardingWizardProps> = ({
  onSuccess,
  onCancel,
  initialBusinessId,
}) => {
  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState(emptyForm);
  const [businessId, setBusinessId] = useState<string | null>(initialBusinessId || null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [categories, setCategories] = useState<DiscoveryCategory[]>([]);
  const [drafts, setDrafts] = useState<DiscoveryBusiness[]>([]);
  const [showResume, setShowResume] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const activeCategories = useMemo(
    () => (Array.isArray(categories) ? categories : []).filter((category) => category.is_active),
    [categories],
  );

  const update = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
    setSavedMessage(null);
  };

  const loadDraft = async (id: string) => {
    const businesses = await discoveryApi.getMyBusinesses();
    const draft = businesses.find((item) => item.id === id && item.listing_status === 'DRAFT');
    if (!draft) throw new Error('The saved draft is no longer available.');

    const [locations, assignedCategories] = await Promise.all([
      discoveryApi.getBusinessLocations(draft.id),
      discoveryApi.getCategories().then((all) => all),
    ]);

    const primary = locations.find((location) => location.is_primary) || locations[0];
    const assignedIds = assignedCategories
      .filter((category) => category.is_active && (draft.category_name === category.name || false))
      .map((category) => category.id);

    setBusinessId(draft.id);
    setForm((current) => ({
      ...current,
      name: draft.name || '',
      businessType: draft.business_type || '',
      shortDescription: draft.short_description || '',
      description: draft.description || '',
      phone: draft.phone || '',
      whatsapp: draft.whatsapp || '',
      email: draft.email || '',
      website: draft.website || '',
      mode: normalizeBusinessMode(draft.business_mode),
      categoryIds: assignedIds.length ? assignedIds : current.categoryIds,
      locationName: primary?.name || current.locationName,
      address: primary?.address_line_1 || '',
      city: primary?.city || '',
      district: primary?.district || '',
      region: primary?.region || '',
      latitude: primary?.latitude != null ? String(primary.latitude) : '',
      longitude: primary?.longitude != null ? String(primary.longitude) : '',
      serviceRadiusKm: primary?.service_radius_km != null ? String(primary.service_radius_km) : '',
    }));
    setLocationId(primary?.id || null);
    window.localStorage.setItem(DRAFT_KEY, draft.id);
    setShowResume(false);
    setSavedMessage('Draft resumed.');
  };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const [cats, businesses] = await Promise.all([
          discoveryApi.getCategories(),
          discoveryApi.getMyBusinesses(),
        ]);
        if (!mounted) return;
        setCategories(Array.isArray(cats) ? cats : []);
        const userDrafts = (businesses || []).filter((item) => item.listing_status === 'DRAFT');
        setDrafts(userDrafts);

        if (initialBusinessId) {
          await loadDraft(initialBusinessId);
        } else {
          const storedId = window.localStorage.getItem(DRAFT_KEY);
          if (storedId && userDrafts.some((item) => item.id === storedId)) {
            setShowResume(true);
          }
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Unable to load onboarding data.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void init();
    return () => { mounted = false; };
  }, [initialBusinessId]);

  const createOrSaveDraft = async () => {
    if (!form.name.trim()) {
      setError('Business name is required.');
      return null;
    }

    setSaving(true);
    setError(null);
    try {
      let business: DiscoveryBusiness;
      if (!businessId) {
        business = await discoveryApi.createBusiness({
          name: form.name.trim(),
          businessType: form.businessType.trim() || undefined,
          shortDescription: form.shortDescription.trim() || undefined,
          description: form.description.trim() || undefined,
          phone: form.phone.trim() || undefined,
          whatsapp: form.whatsapp.trim() || undefined,
          email: form.email.trim() || undefined,
          website: form.website.trim() || undefined,
          businessMode: form.mode,
          submitImmediately: false,
        });
        setBusinessId(business.id);
        window.localStorage.setItem(DRAFT_KEY, business.id);
      } else {
        business = await discoveryApi.updateBusiness(businessId, {
          name: form.name.trim(),
          businessType: form.businessType.trim() || undefined,
          shortDescription: form.shortDescription.trim() || undefined,
          description: form.description.trim() || undefined,
          phone: form.phone.trim() || undefined,
          whatsapp: form.whatsapp.trim() || undefined,
          email: form.email.trim() || undefined,
          website: form.website.trim() || undefined,
          businessMode: form.mode,
        });
      }

      if (form.categoryIds.length) {
        await discoveryApi.updateBusinessCategories(business.id, form.categoryIds);
      }

      setSavedMessage('Draft saved securely.');
      return business;
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : err instanceof Error ? err.message : 'Unable to save the draft.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const validateStep = (currentStep: WizardStep) => {
    if (currentStep === 1 && !form.mode) return 'Choose how you want your business listed.';
    if (currentStep === 2 && !form.name.trim()) return 'Business name is required.';
    if (currentStep === 3 && !form.phone.trim() && !form.whatsapp.trim() && !form.email.trim()) {
      return 'Provide at least one contact method.';
    }
    if (currentStep === 4) {
      if (!form.locationName.trim()) return 'Location name is required.';
      if (!form.city.trim()) return 'City is required.';
      const lat = form.latitude.trim();
      const lng = form.longitude.trim();
      if ((lat && !lng) || (!lat && lng)) return 'Latitude and longitude must be supplied together.';
      if (lat && (!Number.isFinite(Number(lat)) || Number(lat) < -90 || Number(lat) > 90)) return 'Latitude must be between -90 and 90.';
      if (lng && (!Number.isFinite(Number(lng)) || Number(lng) < -180 || Number(lng) > 180)) return 'Longitude must be between -180 and 180.';
      if (form.serviceRadiusKm && (!Number.isFinite(Number(form.serviceRadiusKm)) || Number(form.serviceRadiusKm) <= 0 || Number(form.serviceRadiusKm) > 500)) {
        return 'Service radius must be greater than 0 and no more than 500 km.';
      }
    }
    return null;
  };

  const saveLocation = async () => {
    if (!businessId) {
      const business = await createOrSaveDraft();
      if (!business) return false;
    }
    const id = businessId;
    if (!id) return false;

    setSaving(true);
    try {
      const payload = {
        name: form.locationName.trim(),
        location_type: 'STORE',
        address_line_1: form.address.trim() || undefined,
        city: form.city.trim(),
        district: form.district.trim() || undefined,
        region: form.region.trim() || undefined,
        country: 'Sierra Leone',
        latitude: form.latitude.trim() ? Number(form.latitude) : undefined,
        longitude: form.longitude.trim() ? Number(form.longitude) : undefined,
        service_radius_km: form.serviceRadiusKm.trim() ? Number(form.serviceRadiusKm) : undefined,
        is_primary: true,
        is_active: true,
      };
      if (locationId) {
        await discoveryApi.updateLocation(id, locationId, payload as never);
      } else {
        const location = await discoveryApi.createLocation(id, payload as never);
        setLocationId(location.id);
      }
      setSavedMessage('Location saved.');
      return true;
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : err instanceof Error ? err.message : 'Unable to save location.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const validation = validateStep(step);
    if (validation) {
      setError(validation);
      return;
    }

    if (step === 1 || step === 2 || step === 3) {
      const saved = await createOrSaveDraft();
      if (!saved) return;
    }
    if (step === 4) {
      const saved = await createOrSaveDraft();
      if (!saved) return;
      if (!(await saveLocation())) return;
    }
    setStep((current) => Math.min(5, current + 1) as WizardStep);
    setError(null);
  };

  const handleSubmit = async () => {
    const validation = validateStep(4);
    if (validation) {
      setError(validation);
      setStep(4);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const business = await createOrSaveDraft();
      if (!business) return;
      if (!(await saveLocation())) return;
      const submitted = await discoveryApi.submitBusiness(business.id, 'Submitted through the Discovery onboarding wizard.');
      window.localStorage.removeItem(DRAFT_KEY);
      setDrafts((current) => current.filter((item) => item.id !== submitted.id));
      onSuccess(submitted);
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : err instanceof Error ? err.message : 'Unable to submit the listing.');
    } finally {
      setSubmitting(false);
    }
  };

  const modeLabel = form.mode === 'DISCOVERY_AND_STORE' ? 'Discovery + Store' : 'Discovery Only';

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-10 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm text-slate-600 dark:text-slate-300">Loading onboarding...</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
      <div className="p-6 sm:p-8 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-widest">
              <Sparkles className="w-4 h-4" /> Get listed on AbaCha
            </div>
            <h2 className="mt-2 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Build your business listing</h2>
            <p className="mt-1 text-sm text-slate-500">Save at any stage and return later. Nothing is published until you submit.</p>
          </div>
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white">Cancel</button>
          )}
        </div>

        {showResume && drafts.length > 0 && (
          <div className="mt-5 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/30 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">Resume your saved draft</p>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">{drafts.find((item) => item.id === window.localStorage.getItem(DRAFT_KEY))?.name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const id = window.localStorage.getItem(DRAFT_KEY);
                  if (id) void loadDraft(id).catch((err) => setError(err instanceof Error ? err.message : 'Unable to resume draft.'));
                }}
                className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
              >
                Resume
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-5 gap-2">
          {[
            ['1', 'Model'],
            ['2', 'Business'],
            ['3', 'Contacts'],
            ['4', 'Location'],
            ['5', 'Review'],
          ].map(([number, label]) => (
            <div key={number} className="text-center">
              <div className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= Number(number) ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{number}</div>
              <div className="mt-1 text-[10px] font-semibold text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-6 flex items-start gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}
      {savedMessage && !error && (
        <div className="mx-6 mt-6 flex items-center gap-2 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4" /> {savedMessage}
        </div>
      )}

      <div className="p-6 sm:p-8 min-h-[390px]">
        {step === 1 && (
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <Store className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Choose your listing model</h3>
                <p className="text-xs text-slate-500">You can start with Discovery Only and convert to a Store later.</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { value: 'DISCOVERY_ONLY' as DiscoveryBusinessMode, title: 'Discovery Only', body: 'Be found by customers with your profile, locations, services, reviews and contact options.', icon: MapPin },
                { value: 'DISCOVERY_AND_STORE' as DiscoveryBusinessMode, title: 'Discovery + Store', body: 'Be discoverable and operate an AbaCha store with catalog, inventory, POS, orders and checkout.', icon: Building2 },
              ].map((option) => {
                const Icon = option.icon;
                const selected = form.mode === option.value;
                return (
                  <button key={option.value} type="button" onClick={() => update('mode', option.value)}
                    className={`text-left p-5 rounded-2xl border-2 transition ${selected ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}>
                    <Icon className={`w-6 h-6 ${selected ? 'text-indigo-600' : 'text-slate-500'}`} />
                    <h4 className="mt-3 font-bold text-sm text-slate-900 dark:text-white">{option.title}</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{option.body}</p>
                    {selected && <CheckCircle2 className="mt-3 w-5 h-5 text-indigo-600" />}
                  </button>
                );
              })}
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-600 dark:text-slate-300">
              <strong>Current choice:</strong> {modeLabel}. Your listing remains private while it is a draft.
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Business profile</h3>
                <p className="text-xs text-slate-500">Tell customers what the business is and what it offers.</p>
              </div>
            </div>
            <input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Business name *" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
            <div className="grid sm:grid-cols-2 gap-3">
              <input value={form.businessType} onChange={(e) => update('businessType', e.target.value)} placeholder="Business type (e.g. Retail, Restaurant, Services)" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
              <input value={form.shortDescription} onChange={(e) => update('shortDescription', e.target.value)} maxLength={500} placeholder="Short description" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
            </div>
            <textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={4} maxLength={10000} placeholder="Full business description" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm resize-none" />
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Categories <span className="text-rose-500">*</span></label>
              <div className="mt-2 flex flex-wrap gap-2">
                {activeCategories.map((category) => {
                  const selected = form.categoryIds.includes(category.id);
                  return (
                    <button key={category.id} type="button" onClick={() => update('categoryIds', selected ? form.categoryIds.filter((id) => id !== category.id) : [...form.categoryIds, category.id])}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border ${selected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}>
                      <Tag className="inline w-3 h-3 mr-1" />{category.name}
                    </button>
                  );
                })}
              </div>
              {!activeCategories.length && <p className="mt-2 text-xs text-amber-600">No active categories are currently available.</p>}
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Contact channels</h3>
                <p className="text-xs text-slate-500">At least one contact channel is required before submission.</p>
              </div>
            </div>
            <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="Phone number" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
            <input value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} placeholder="WhatsApp number" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
            <input value={form.email} onChange={(e) => update('email', e.target.value)} type="email" placeholder="Email address" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
            <input value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="Website (optional)" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
          </section>
        )}

        {step === 4 && (
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Primary location</h3>
                <p className="text-xs text-slate-500">Customers use this information for discovery, directions and distance search.</p>
              </div>
            </div>
            <input value={form.locationName} onChange={(e) => update('locationName', e.target.value)} placeholder="Location name *" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
            <input value={form.address} onChange={(e) => update('address', e.target.value)} placeholder="Street / address" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
            <div className="grid sm:grid-cols-3 gap-3">
              <input value={form.city} onChange={(e) => update('city', e.target.value)} placeholder="City *" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
              <input value={form.district} onChange={(e) => update('district', e.target.value)} placeholder="District" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
              <input value={form.region} onChange={(e) => update('region', e.target.value)} placeholder="Region" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <input value={form.latitude} onChange={(e) => update('latitude', e.target.value)} placeholder="Latitude (optional)" inputMode="decimal" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
              <input value={form.longitude} onChange={(e) => update('longitude', e.target.value)} placeholder="Longitude (optional)" inputMode="decimal" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
              <input value={form.serviceRadiusKm} onChange={(e) => update('serviceRadiusKm', e.target.value)} placeholder="Service radius km (optional)" inputMode="decimal" className="w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-sm" />
            </div>
          </section>
        )}

        {step === 5 && (
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Readiness & submission</h3>
                <p className="text-xs text-slate-500">Review the information below. Submission sends the listing to moderation; it does not publish it immediately.</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                ['Listing model', modeLabel, true],
                ['Business profile', form.name.trim().length > 0 ? 'Complete' : 'Missing', Boolean(form.name.trim())],
                ['Category', form.categoryIds.length ? `${form.categoryIds.length} selected` : 'Missing', form.categoryIds.length > 0],
                ['Contact', form.phone.trim() || form.whatsapp.trim() || form.email.trim() ? 'Provided' : 'Missing', Boolean(form.phone.trim() || form.whatsapp.trim() || form.email.trim())],
                ['Primary location', form.city.trim() && form.locationName.trim() ? 'Provided' : 'Missing', Boolean(form.city.trim() && form.locationName.trim())],
              ].map(([label, value, ready]) => (
                <div key={String(label)} className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{label}</p>
                    <p className="text-xs text-slate-500 mt-1">{value}</p>
                  </div>
                  {ready ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-amber-600" />}
                </div>
              ))}
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-600 dark:text-slate-300">
              <strong>Next:</strong> AbaCha will review the submitted listing. Publication only occurs after the platform's approval and publication lifecycle.
            </div>
          </section>
        )}
      </div>

      <div className="p-6 sm:p-8 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
        <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1) as WizardStep)} disabled={step === 1 || saving || submitting}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Previous
        </button>

        <div className="flex items-center gap-2">
          {businessId && (
            <button type="button" onClick={() => void createOrSaveDraft()} disabled={saving || submitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save draft
            </button>
          )}

          {step < 5 ? (
            <button type="button" onClick={() => void handleNext()} disabled={saving || submitting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Continue
            </button>
          ) : (
            <button type="button" onClick={() => void handleSubmit()} disabled={saving || submitting || !businessId}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Submit for review
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
