import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Building2,
  MapPin,
  Clock,
  Phone,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Store,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type { DiscoveryBusiness, DiscoveryCategory } from '../../../types/discovery';

interface DiscoveryOnboardingWizardProps {
  onSuccess: (createdBusiness: DiscoveryBusiness) => void;
  onCancel?: () => void;
}

export const DiscoveryOnboardingWizard: React.FC<DiscoveryOnboardingWizardProps> = ({
  onSuccess,
  onCancel,
}) => {
  const [step, setStep] = useState<number>(1);
  const [categories, setCategories] = useState<DiscoveryCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // Form State
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState('Retail & Grocery');
  const [shortDescription, setShortDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  // Location Step
  const [branchName, setBranchName] = useState('Main Store / Office');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('Freetown');
  const [district, setDistrict] = useState('Western Area Urban');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // Status
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadCats = async () => {
      try {
        const data = await discoveryApi.getCategories();
        if (mounted) setCategories(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load categories', err);
      } finally {
        if (mounted) setLoadingCategories(false);
      }
    };
    void loadCats();
    return () => {
      mounted = false;
    };
  }, []);

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!name.trim()) {
        setError('Please enter your business name.');
        return;
      }
    } else if (step === 2) {
      if (!phone.trim() && !whatsapp.trim() && !email.trim()) {
        setError('Please provide at least one contact method (phone, WhatsApp, or email).');
        return;
      }
    }
    setStep((prev) => Math.min(prev + 1, 3));
  };

  const handlePrev = () => {
    setError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleFinish = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const generatedSlug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // 1. Create Business Profile
      const newBusiness = await discoveryApi.createBusiness({
        name: name.trim(),
        businessType: businessType,
        shortDescription: shortDescription.trim() || undefined,
        phone: phone.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
        email: email.trim() || undefined,
        businessMode: 'DISCOVERY_AND_STORE',
      });

      // 2. Assign Categories if any
      if (selectedCategoryIds.length > 0) {
        await discoveryApi.updateBusinessCategories(newBusiness.id, selectedCategoryIds);
      }

      // 3. Create First Location if address or branch is provided
      if (branchName.trim()) {
        const latNum = latitude ? Number(latitude) : undefined;
        const lngNum = longitude ? Number(longitude) : undefined;
        await discoveryApi.createLocation(newBusiness.id, {
          name: branchName.trim(),
          location_type: 'STORE',
          address_line_1: streetAddress.trim() || undefined,
          city: city.trim() || undefined,
          district: district.trim() || undefined,
          country: 'Sierra Leone',
          latitude: latNum,
          longitude: lngNum,
          is_primary: true,
          is_active: true,
        });
      }

      onSuccess(newBusiness);
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create your discovery business listing.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-xl max-w-2xl mx-auto space-y-8">
      {/* Step Indicator */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-slate-800">
        <div>
          <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 tracking-wider">
            Step {step} of 3
          </span>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
            {step === 1 && 'Business Identity & Industry'}
            {step === 2 && 'Direct Contact Channels'}
            {step === 3 && 'Storefront Location & Branch'}
          </h2>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold"
          >
            Cancel
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Identity */}
      {step === 1 && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Business Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Freetown Solar & Electricals"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Primary Business Category
            </label>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="Retail & Grocery">Retail & Grocery</option>
              <option value="Restaurant & Food">Restaurant & Food</option>
              <option value="Professional Services">Professional Services</option>
              <option value="Automotive & Transport">Automotive & Transport</option>
              <option value="Health & Beauty">Health & Beauty</option>
              <option value="Crafts & Artisan">Crafts & Artisan</option>
              <option value="Electronics & Tech">Electronics & Tech</option>
              <option value="Home & Construction">Home & Construction</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Tagline / Short Summary
            </label>
            <input
              type="text"
              maxLength={160}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder="Certified solar inverter installation, batteries, and backup power solutions."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Discovery Taxonomy Tags */}
          <div className="space-y-2 pt-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Select Search Categories
            </label>
            {loadingCategories ? (
              <span className="text-xs text-slate-400">Loading categories...</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(Array.isArray(categories) ? categories : []).map((cat) => {
                  const isSelected = selectedCategoryIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() =>
                        setSelectedCategoryIds((prev) =>
                          prev.includes(cat.id)
                            ? prev.filter((id) => id !== cat.id)
                            : [...prev, cat.id]
                        )
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Contacts */}
      {step === 2 && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Direct Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+232 76 123456"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              WhatsApp Instant Order Number
            </label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+232 78 654321"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Inquiry Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@mycompany.sl"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Step 3: Location */}
      {step === 3 && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Branch Name
            </label>
            <input
              type="text"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="e.g. Lumley Central Store"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Street Address
            </label>
            <input
              type="text"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              placeholder="e.g. 25 Wilkinson Road"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Freetown"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                District / Area
              </label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="Western Urban"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Wizard Footer Nav */}
      <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
        <div>
          {step > 1 && (
            <button
              type="button"
              onClick={handlePrev}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>
          )}
        </div>

        <div>
          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleFinish}
              className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
            >
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{submitting ? 'Creating Listing...' : 'Publish Discovery Listing'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
