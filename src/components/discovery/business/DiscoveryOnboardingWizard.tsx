import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  LocateFixed,
  MapPin,
  Save,
  Sparkles,
  Store,
  Building2,
  Phone,
  Tag,
  ChevronDown,
  Edit3,
  Globe,
  Mail,
  MessageSquare,
  Search,
  Check,
  Eye,
  Info,
  Compass,
  Plus,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import { DiscoveryLocationMapEditor } from './DiscoveryLocationMapEditor';
import type {
  DiscoveryBusiness,
  DiscoveryBusinessMode,
  DiscoveryCategory,
  DiscoveryGeoLocation,
  DiscoveryLocationType,
  DiscoveryService,
  DiscoverySocialLink,
  DiscoverySocialPlatform,
} from '../../../types/discovery';
import {
  SOCIAL_PLATFORMS,
  detectSocialPlatform,
  getSocialPlatformConfig,
  sanitizeUrl,
} from '../socialLinks';

// Structured Provinces/Regions for Sierra Leone (fallback when DB taxonomy is loading)
const PROVINCES = [
  'Western Area',
  'Eastern Province',
  'Northern Province',
  'Southern Province',
  'North West Province',
];

// Districts grouped by Province/Region
const DISTRICTS_MAP: Record<string, string[]> = {
  'Western Area': ['Western Area Urban', 'Western Area Rural'],
  'Eastern Province': ['Kenema District', 'Kono District', 'Kailahun District'],
  'Northern Province': ['Bombali District', 'Tonkolili District', 'Koinadugu District', 'Falaba District'],
  'Southern Province': ['Bo District', 'Moyamba District', 'Pujehun District', 'Bonthe District'],
  'North West Province': ['Port Loko District', 'Kambia District', 'Karene District'],
};

// Cities/Towns grouped by District
const CITIES_MAP: Record<string, string[]> = {
  'Western Area Urban': ['Freetown'],
  'Western Area Rural': ['Waterloo'],
  'Bo District': ['Bo'],
  'Kenema District': ['Kenema'],
  'Bombali District': ['Makeni'],
  'Kono District': ['Koidu'],
  'Port Loko District': ['Port Loko', 'Lunsar'],
  'Koinadugu District': ['Kabala'],
  'Kailahun District': ['Kailahun'],
  'Tonkolili District': ['Magburaka'],
  'Moyamba District': ['Moyamba'],
  'Pujehun District': ['Pujehun'],
  'Bonthe District': ['Bonthe'],
  'Kambia District': ['Kambia'],
  'Falaba District': ['Bendugu'],
  'Karene District': ['Kamakwie'],
};

// Known geographic coordinate centers for Sierra Leone cities, towns, communities, and regions
export const SIERRA_LEONE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // Cities & Towns
  freetown: { lat: 8.4844, lng: -13.2344 },
  waterloo: { lat: 8.3389, lng: -13.0708 },
  bo: { lat: 7.9647, lng: -11.7383 },
  kenema: { lat: 7.8767, lng: -11.1900 },
  makeni: { lat: 8.8861, lng: -12.0442 },
  koidu: { lat: 8.6439, lng: -10.9714 },
  'port loko': { lat: 8.7661, lng: -12.7870 },
  lunsar: { lat: 8.6844, lng: -12.5350 },
  kabala: { lat: 9.5889, lng: -11.5526 },
  kailahun: { lat: 8.2783, lng: -10.5730 },
  magburaka: { lat: 8.7231, lng: -11.9489 },
  moyamba: { lat: 8.1589, lng: -12.4317 },
  pujehun: { lat: 7.3578, lng: -11.7208 },
  bonthe: { lat: 7.5264, lng: -12.5050 },
  kambia: { lat: 9.1250, lng: -12.9189 },
  bendugu: { lat: 9.5358, lng: -11.2464 },
  kamakwie: { lat: 9.4969, lng: -12.2406 },
  // Popular Freetown & Regional Communities
  lumley: { lat: 8.4319, lng: -13.2683 },
  aberdeen: { lat: 8.4972, lng: -13.2856 },
  wilberforce: { lat: 8.4631, lng: -13.2611 },
  wellington: { lat: 8.4475, lng: -13.1681 },
  goderich: { lat: 8.4294, lng: -13.2889 },
  'hill station': { lat: 8.4544, lng: -13.2494 },
  brookfields: { lat: 8.4728, lng: -13.2439 },
  kissy: { lat: 8.4689, lng: -13.1956 },
  'calaba town': { lat: 8.4267, lng: -13.1492 },
  jui: { lat: 8.3961, lng: -13.1281 },
  regent: { lat: 8.4358, lng: -13.2186 },
  congo_cross: { lat: 8.4767, lng: -13.2572 },
  // Districts & Regions fallback
  'western area urban': { lat: 8.4844, lng: -13.2344 },
  'western area rural': { lat: 8.3389, lng: -13.0708 },
  'western area': { lat: 8.4844, lng: -13.2344 },
  'eastern province': { lat: 7.8767, lng: -11.1900 },
  'northern province': { lat: 8.8861, lng: -12.0442 },
  'southern province': { lat: 7.9647, lng: -11.7383 },
  'north west province': { lat: 8.7661, lng: -12.7870 },
};

export const resolveDefaultCoordinates = (
  city?: string,
  district?: string,
  region?: string,
): { lat: number; lng: number } => {
  const candidates = [city, district, region]
    .map((v) => (v || '').trim().toLowerCase())
    .filter(Boolean);
  for (const key of candidates) {
    if (SIERRA_LEONE_COORDINATES[key]) {
      return SIERRA_LEONE_COORDINATES[key];
    }
    const stripped = key.replace(/\s+district$/, '').trim();
    if (SIERRA_LEONE_COORDINATES[stripped]) {
      return SIERRA_LEONE_COORDINATES[stripped];
    }
  }
  return SIERRA_LEONE_COORDINATES.freetown;
};

const BUSINESS_TYPE_SUGGESTIONS = [
  'Retail & Grocery',
  'Restaurant & Dining',
  'Professional Services',
  'Health & Pharmacy',
  'Electronics & Tech',
  'Home & Construction',
  'Beauty & Salon',
  'Automotive & Transport',
];

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

interface DiscoveryOnboardingWizardProps {
  onSuccess: (createdBusiness: DiscoveryBusiness) => void;
  onCancel?: () => void;
  initialBusinessId?: string;
  initialStep?: WizardStep;
}

const DRAFT_KEY = 'abacha.discovery.onboarding.draft.v2';
const DRAFT_STEP_KEY_PREFIX = 'abacha.discovery.onboarding.step.v2:';

const emptyForm = {
  name: '',
  businessType: '',
  shortDescription: '',
  description: '',
  phone: '',
  whatsapp: '',
  email: '',
  website: '',
  socialLinks: [] as DiscoverySocialLink[],
  mode: 'DISCOVERY_ONLY' as DiscoveryBusinessMode,
  categoryIds: [] as string[],
  locationName: 'Main Store / Office',
  locationType: 'STORE' as DiscoveryLocationType,
  address: '',
  city: '',
  district: '',
  region: '',
  latitude: '',
  longitude: '',
  serviceRadiusKm: '',
  serviceName: '',
  serviceDescription: '',
  serviceType: '',
  priceFrom: '',
  priceTo: '',
};

const normalizeBusinessMode = (value: unknown): DiscoveryBusinessMode =>
  value === 'DISCOVERY_AND_STORE' ? 'DISCOVERY_AND_STORE' : 'DISCOVERY_ONLY';

export const DiscoveryOnboardingWizard: React.FC<DiscoveryOnboardingWizardProps> = ({
  onSuccess,
  onCancel,
  initialBusinessId,
  initialStep = 1,
}) => {
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [form, setForm] = useState(emptyForm);
  const [isCustomCityActive, setIsCustomCityActive] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(initialBusinessId || null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [categories, setCategories] = useState<DiscoveryCategory[]>([]);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [geoLocations, setGeoLocations] = useState<DiscoveryGeoLocation[]>([]);
  const [drafts, setDrafts] = useState<DiscoveryBusiness[]>([]);
  const [showResume, setShowResume] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationAccuracyM, setLocationAccuracyM] = useState<number | null>(null);
  const [coordsAutoAssigned, setCoordsAutoAssigned] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialStep >= 1 && initialStep <= 6) {
      setStep(initialStep);
    }
  }, [initialStep]);

  // Smooth scroll to top when changing steps
  const changeStep = (newStep: WizardStep) => {
    setError(null);
    setStep(newStep);
    if (containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const addSocialLink = (platform: DiscoverySocialPlatform = 'facebook') => {
    const newLink: DiscoverySocialLink = {
      id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      platform,
      url: '',
      label: '',
    };
    setForm((current) => ({
      ...current,
      socialLinks: [...current.socialLinks, newLink],
    }));
  };

  const updateSocialLink = (id: string, patch: Partial<DiscoverySocialLink>) => {
    setForm((current) => {
      const nextLinks = current.socialLinks.map((item) => {
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
        ...current,
        socialLinks: nextLinks,
        website: firstWeb || current.website,
      };
    });
  };

  const removeSocialLink = (id: string) => {
    setForm((current) => {
      const nextLinks = current.socialLinks.filter((l) => l.id !== id);
      const firstWeb = nextLinks.find((l) => l.platform === 'website')?.url || nextLinks[0]?.url || '';
      return {
        ...current,
        socialLinks: nextLinks,
        website: firstWeb,
      };
    });
  };

  const activeGeoLocations = useMemo(
    () => (Array.isArray(geoLocations) ? geoLocations.filter((l) => l.is_active) : []),
    [geoLocations],
  );

  const availableRegionsForWizard = useMemo(() => {
    const dbRegions = activeGeoLocations.filter((l) => l.location_type === 'REGION');
    if (dbRegions.length > 0) return dbRegions.map((r) => r.name);
    return PROVINCES;
  }, [activeGeoLocations]);

  const availableDistrictsForWizard = useMemo(() => {
    if (!form.region) return [];
    const dbRegions = activeGeoLocations.filter((l) => l.location_type === 'REGION');
    if (dbRegions.length > 0) {
      const matchedRegion = dbRegions.find((r) => r.name.toLowerCase() === form.region.toLowerCase());
      if (matchedRegion) {
        const dbDistricts = activeGeoLocations
          .filter((l) => l.location_type === 'DISTRICT' && l.parent_id === matchedRegion.id)
          .map((d) => d.name);
        if (dbDistricts.length > 0) return dbDistricts;
      }
    }
    return DISTRICTS_MAP[form.region] || [];
  }, [form.region, activeGeoLocations]);

  const availableCitiesForWizard = useMemo(() => {
    if (!form.district) return [];
    const dbDistricts = activeGeoLocations.filter((l) => l.location_type === 'DISTRICT');
    if (dbDistricts.length > 0) {
      const matchedDistrict = dbDistricts.find((d) => d.name.toLowerCase() === form.district.toLowerCase());
      if (matchedDistrict) {
        const dbCities = activeGeoLocations
          .filter((l) => l.location_type === 'CITY' && l.parent_id === matchedDistrict.id)
          .map((c) => c.name);
        if (dbCities.length > 0) return dbCities;
      }
    }
    return CITIES_MAP[form.district] || [];
  }, [form.district, activeGeoLocations]);

  const availableCommunitiesForWizard = useMemo(() => {
    if (!form.city) return [];
    const dbCities = activeGeoLocations.filter((l) => l.location_type === 'CITY');
    const matchedCity = dbCities.find((c) => c.name.toLowerCase() === form.city.toLowerCase());
    if (!matchedCity) return [];
    return activeGeoLocations
      .filter((l) => l.location_type === 'COMMUNITY' && l.parent_id === matchedCity.id)
      .map((c) => c.name);
  }, [form.city, activeGeoLocations]);

  const handleRegionChangeInWizard = (region: string) => {
    const fallbackCoords = region ? resolveDefaultCoordinates(undefined, undefined, region) : null;
    setForm((current) => ({
      ...current,
      region,
      district: '',
      city: '',
      latitude: fallbackCoords ? fallbackCoords.lat.toFixed(6) : '',
      longitude: fallbackCoords ? fallbackCoords.lng.toFixed(6) : '',
    }));
    setCoordsAutoAssigned(Boolean(fallbackCoords));
    setLocationAccuracyM(null);
    setIsCustomCityActive(false);
    setError(null);
    setSavedMessage(null);
  };

  const handleDistrictChangeInWizard = (district: string) => {
    const cities = CITIES_MAP[district] || [];
    const defaultCity = cities.length === 1 ? cities[0] : '';
    const fallbackCoords = district
      ? resolveDefaultCoordinates(defaultCity || undefined, district, form.region)
      : null;
    setForm((current) => ({
      ...current,
      district,
      city: defaultCity,
      latitude: fallbackCoords ? fallbackCoords.lat.toFixed(6) : '',
      longitude: fallbackCoords ? fallbackCoords.lng.toFixed(6) : '',
    }));
    setCoordsAutoAssigned(Boolean(fallbackCoords));
    setLocationAccuracyM(null);
    setIsCustomCityActive(false);
    setError(null);
    setSavedMessage(null);
  };

  const handleCityChangeInWizard = (city: string) => {
    const fallbackCoords = city
      ? resolveDefaultCoordinates(city, form.district, form.region)
      : null;
    setForm((current) => ({
      ...current,
      city,
      latitude: fallbackCoords ? fallbackCoords.lat.toFixed(6) : '',
      longitude: fallbackCoords ? fallbackCoords.lng.toFixed(6) : '',
    }));
    setCoordsAutoAssigned(Boolean(fallbackCoords));
    setLocationAccuracyM(null);
    setError(null);
    setSavedMessage(null);
  };

  const snapPinToSelectedArea = () => {
    const coords = resolveDefaultCoordinates(form.city, form.district, form.region);
    setForm((current) => ({
      ...current,
      latitude: coords.lat.toFixed(6),
      longitude: coords.lng.toFixed(6),
    }));
    setCoordsAutoAssigned(true);
    setLocationAccuracyM(null);
    setError(null);
    setSavedMessage(`Centered near ${form.city || form.district || form.region || 'Freetown'}. You can tap or drag the pin, or click "Confirm pin location".`);
  };

  const confirmCurrentPinLocation = () => {
    if (!form.latitude.trim() || !form.longitude.trim()) {
      snapPinToSelectedArea();
    }
    setCoordsAutoAssigned(false);
    setError(null);
    setSavedMessage('Map pin confirmed for this business location.');
  };

  const getDraftStepKey = (id: string) => `${DRAFT_STEP_KEY_PREFIX}${id}`;
  const readSavedStep = (id: string): WizardStep => {
    const raw = Number(window.localStorage.getItem(getDraftStepKey(id)));
    return Number.isInteger(raw) && raw >= 1 && raw <= 6 ? (raw as WizardStep) : 1;
  };

  const activeCategories = useMemo(
    () => (Array.isArray(categories) ? categories : []).filter((category) => category.is_active),
    [categories],
  );

  const filteredCategories = useMemo(() => {
    if (!categorySearchQuery.trim()) return activeCategories;
    const q = categorySearchQuery.toLowerCase();
    return activeCategories.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description && c.description.toLowerCase().includes(q)),
    );
  }, [activeCategories, categorySearchQuery]);

  const update = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
    setSavedMessage(null);
  };

  const loadDraft = async (id: string) => {
    const businesses = await discoveryApi.getMyBusinesses();
    const draft = businesses.find((item) => item.id === id && item.listing_status === 'DRAFT');
    if (!draft) throw new Error('The saved draft is no longer available.');

    const [locations, assignedCategories, services] = await Promise.all([
      discoveryApi.getBusinessLocations(draft.id),
      discoveryApi.getBusinessCategories(draft.id),
      discoveryApi.getBusinessServices(draft.id),
    ]);

    const primary = locations.find((location) => location.is_primary) || locations[0];
    const primaryService: DiscoveryService | undefined = services[0];
    const assignedIds = assignedCategories
      .filter((category) => category.is_active)
      .map((category) => category.id);

    const isCustom = primary?.city && primary?.district && !(CITIES_MAP[primary.district] || []).includes(primary.city);
    setIsCustomCityActive(Boolean(isCustom));

    const hasExistingCoords = primary?.latitude != null && primary?.longitude != null;
    const fallbackCoords =
      !hasExistingCoords && (primary?.city || primary?.district || primary?.region)
        ? resolveDefaultCoordinates(primary?.city || undefined, primary?.district || undefined, primary?.region || undefined)
        : null;

    setCoordsAutoAssigned(!hasExistingCoords);
    setBusinessId(draft.id);
    if (initialStep === 1) {
      setStep(readSavedStep(draft.id));
    } else {
      setStep(initialStep);
    }
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
      socialLinks: Array.isArray(draft.social_links)
        ? draft.social_links
        : typeof draft.social_links === 'string'
        ? (() => { try { return JSON.parse(draft.social_links); } catch { return []; } })()
        : draft.website
        ? [{ id: `link_${draft.id}`, platform: 'website' as const, url: draft.website, label: 'Official Website' }]
        : current.socialLinks,
      mode: normalizeBusinessMode(draft.business_mode),
      categoryIds: assignedIds.length ? assignedIds : current.categoryIds,
      locationName: primary?.name || current.locationName,
      locationType: (primary?.location_type as DiscoveryLocationType) || 'STORE',
      address: primary?.address_line_1 || '',
      city: primary?.city || '',
      district: primary?.district || '',
      region: primary?.region || '',
      latitude: hasExistingCoords
        ? String(primary!.latitude)
        : fallbackCoords
          ? fallbackCoords.lat.toFixed(6)
          : '',
      longitude: hasExistingCoords
        ? String(primary!.longitude)
        : fallbackCoords
          ? fallbackCoords.lng.toFixed(6)
          : '',
      serviceRadiusKm: primary?.service_radius_km != null ? String(primary.service_radius_km) : '',
      serviceName: primaryService?.name || '',
      serviceDescription: primaryService?.description || '',
      serviceType: primaryService?.service_type || '',
      priceFrom: primaryService?.price_from != null ? String(primaryService.price_from) : '',
      priceTo: primaryService?.price_to != null ? String(primaryService.price_to) : '',
    }));
    setLocationId(primary?.id || null);
    setServiceId(primaryService?.id || null);
    setLocationAccuracyM(null);
    window.localStorage.setItem(DRAFT_KEY, draft.id);
    window.localStorage.setItem(getDraftStepKey(draft.id), String(initialStep === 1 ? readSavedStep(draft.id) : initialStep));
    setShowResume(false);
    setSavedMessage('Draft resumed successfully.');
  };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const [cats, businesses, geos] = await Promise.all([
          discoveryApi.getCategories(),
          discoveryApi.getMyBusinesses(),
          discoveryApi.getGeoLocations().catch(() => [] as DiscoveryGeoLocation[]),
        ]);
        if (!mounted) return;
        setCategories(Array.isArray(cats) ? cats : []);
        setGeoLocations(Array.isArray(geos) ? geos : []);
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
    return () => {
      mounted = false;
    };
  }, [initialBusinessId]);

  useEffect(() => {
    if (!loading && businessId) {
      window.localStorage.setItem(getDraftStepKey(businessId), String(step));
    }
  }, [businessId, loading, step]);

  const createOrSaveDraft = async () => {
    if (!form.name.trim()) {
      setError('Business name is required.');
      return null;
    }

    setSaving(true);
    setError(null);
    try {
      const validSocialLinks = (form.socialLinks || [])
        .map((l) => ({ ...l, url: sanitizeUrl(l.url) }))
        .filter((l) => l.url.trim().length > 0);
      const primaryWebsite = form.website.trim() || validSocialLinks.find((l) => l.platform === 'website')?.url || validSocialLinks[0]?.url || undefined;

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
          website: primaryWebsite,
          socialLinks: validSocialLinks,
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
          website: primaryWebsite,
          socialLinks: validSocialLinks,
          businessMode: form.mode,
        });
      }

      await discoveryApi.updateBusinessCategories(business.id, form.categoryIds);

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
    if (currentStep === 2) {
      if (!form.name.trim()) return 'Business name is required.';
      if (!form.shortDescription.trim() && !form.description.trim()) {
        return 'Please provide a short tagline or business description so customers know what you offer.';
      }
      if (activeCategories.length > 0 && form.categoryIds.length === 0) {
        return 'Select at least one category so customers can find your business.';
      }
    }
    if (currentStep === 3 && !form.phone.trim() && !form.whatsapp.trim() && !form.email.trim()) {
      return 'Provide at least one contact method (Phone, WhatsApp, or Email).';
    }
    if (currentStep === 4) {
      if (!form.locationName.trim()) return 'Location name is required.';
      if (!form.region) return 'Region/Province selection is required.';
      if (!form.district) return 'District selection is required.';
      if (!form.city.trim()) return 'City/Town selection or custom name is required.';
      const lat = form.latitude.trim();
      const lng = form.longitude.trim();
      if (coordsAutoAssigned) {
        return 'The map is centered on an approximate city or district center, not your exact business location. Use device GPS or tap/drag the pin to the actual location before continuing.';
      }
      if (!lat || !lng) {
        return 'Accurate map coordinates are required. Use device GPS or tap/drag the pin to the actual business location.';
      }
      if (!Number.isFinite(Number(lat)) || Number(lat) < -90 || Number(lat) > 90) return 'Latitude must be between -90 and 90.';
      if (!Number.isFinite(Number(lng)) || Number(lng) < -180 || Number(lng) > 180) return 'Longitude must be between -180 and 180.';
      if (form.locationType === 'SERVICE_AREA' && (!form.serviceRadiusKm.trim() || Number(form.serviceRadiusKm) <= 0)) {
        return 'Service-area locations require a service radius greater than 0 km.';
      }
      if (form.serviceRadiusKm && (!Number.isFinite(Number(form.serviceRadiusKm)) || Number(form.serviceRadiusKm) <= 0 || Number(form.serviceRadiusKm) > 500)) {
        return 'Service radius must be greater than 0 and no more than 500 km.';
      }
    }
    if (currentStep === 5 && form.serviceName.trim()) {
      if (form.priceFrom && (!Number.isFinite(Number(form.priceFrom)) || Number(form.priceFrom) < 0)) return 'Starting price must be a valid non-negative number.';
      if (form.priceTo && (!Number.isFinite(Number(form.priceTo)) || Number(form.priceTo) < 0)) return 'Maximum price must be a valid non-negative number.';
      if (form.priceFrom && form.priceTo && Number(form.priceFrom) > Number(form.priceTo)) return 'Starting price cannot exceed the maximum price.';
    }
    return null;
  };

  const useMyLocation = () => {
    if (saving || submitting || locating) return;
    if (!navigator.geolocation) {
      setError('Location services are not supported by this device or browser.');
      return;
    }

    setLocating(true);
    setError(null);
    setSavedMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        update('latitude', position.coords.latitude.toFixed(6));
        update('longitude', position.coords.longitude.toFixed(6));
        setCoordsAutoAssigned(false);
        setLocationAccuracyM(
          Number.isFinite(position.coords.accuracy) && position.coords.accuracy >= 0
            ? Math.round(position.coords.accuracy)
            : null,
        );
        setSavedMessage(
          position.coords.accuracy > 0
            ? `Location verified via GPS (±${Math.round(position.coords.accuracy)} m accuracy).`
            : 'Location verified from device GPS.',
        );
        setLocating(false);
      },
      (positionError) => {
        const message =
          positionError.code === 1
            ? 'Location permission was denied. Allow location access in browser settings or tap the map to place your pin.'
            : positionError.code === 2
              ? 'Your device could not detect GPS signal. Tap or drag the pin on the map to set your location.'
              : 'Unable to determine your GPS location. Please tap the map to place your pin.';
        setError(message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const saveLocation = async (draftBusiness?: DiscoveryBusiness | null) => {
    let id = draftBusiness?.id || businessId;
    if (!id) {
      const business = await createOrSaveDraft();
      if (!business) return false;
      id = business.id;
    }
    if (!id) return false;

    setSaving(true);
    try {
      if (coordsAutoAssigned) {
        setError('Confirm the actual business location using device GPS or the map pin before saving coordinates.');
        return false;
      }
      const latValue = form.latitude.trim() ? Number(form.latitude) : null;
      const lngValue = form.longitude.trim() ? Number(form.longitude) : null;
      if (latValue == null || lngValue == null || !Number.isFinite(latValue) || !Number.isFinite(lngValue)) {
        setError('Valid latitude and longitude are required. Use device GPS or place the pin on the map.');
        return false;
      }

      const payload = {
        name: form.locationName.trim(),
        locationType: form.locationType || 'STORE',
        addressLine1: form.address.trim() || undefined,
        city: form.city.trim(),
        district: form.district.trim() || undefined,
        region: form.region.trim() || undefined,
        country: 'Sierra Leone',
        latitude: latValue,
        longitude: lngValue,
        serviceRadiusKm: form.serviceRadiusKm.trim()
          ? Number(form.serviceRadiusKm)
          : form.locationType === 'SERVICE_AREA'
            ? 15
            : undefined,
        coordinateAccuracyM: locationAccuracyM ?? undefined,
        locationSource: locationAccuracyM != null ? 'GPS' : 'MANUAL',
        isPrimary: true,
        isActive: true,
      };
      if (locationId) {
        await discoveryApi.updateLocation(id, locationId, payload as never);
      } else {
        const location = await discoveryApi.createLocation(id, payload as never);
        setLocationId(location.id);
      }
      setSavedMessage('Location and map coordinates saved.');
      return true;
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : err instanceof Error ? err.message : 'Unable to save location.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveService = async (draftBusiness?: DiscoveryBusiness | null) => {
    const id = draftBusiness?.id || businessId;
    if (!id || !form.serviceName.trim()) return true;
    setSaving(true);
    try {
      const payload = {
        name: form.serviceName.trim(),
        description: form.serviceDescription.trim() || undefined,
        serviceType: form.serviceType.trim() || undefined,
        priceFrom: form.priceFrom.trim() ? Number(form.priceFrom) : undefined,
        priceTo: form.priceTo.trim() ? Number(form.priceTo) : undefined,
        currency: 'SLE',
        bookingMode: 'REQUEST',
        isActive: true,
      };
      if (serviceId) {
        await discoveryApi.updateService(id, serviceId, payload as never);
      } else {
        const service = await discoveryApi.createService(id, payload as never);
        setServiceId(service.id);
      }
      setSavedMessage('Service offering saved.');
      return true;
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : err instanceof Error ? err.message : 'Unable to save the service offering.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    // Auto-fill coordinates from selected city/district/region on Step 4 if left blank
    if (step === 4 && (!form.latitude.trim() || !form.longitude.trim()) && (form.city.trim() || form.district || form.region)) {
      const autoCoords = resolveDefaultCoordinates(form.city, form.district, form.region);
      setForm((current) => ({
        ...current,
        latitude: autoCoords.lat.toFixed(6),
        longitude: autoCoords.lng.toFixed(6),
      }));
    }

    const validation = validateStep(step);
    if (validation) {
      setError(validation);
      return;
    }

    if (step === 1 && !form.name.trim()) {
      changeStep(2);
      return;
    }

    if (step === 1 || step === 2 || step === 3) {
      const saved = await createOrSaveDraft();
      if (!saved) return;
    }
    if (step === 4) {
      const saved = await createOrSaveDraft();
      if (!saved) return;
      if (!(await saveLocation(saved))) return;
    }
    if (step === 5) {
      if (!(await saveService())) return;
    }
    changeStep(Math.min(6, step + 1) as WizardStep);
  };

  const handleSubmit = async () => {
    for (const checkStep of [1, 2, 3, 4, 5] as WizardStep[]) {
      const validation = validateStep(checkStep);
      if (validation) {
        setError(validation);
        changeStep(checkStep);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const business = await createOrSaveDraft();
      if (!business) return;
      if (!(await saveLocation(business))) return;
      if (!(await saveService(business))) return;
      const submitted = await discoveryApi.submitBusiness(business.id, 'Submitted through the Discovery onboarding wizard.');
      window.localStorage.removeItem(DRAFT_KEY);
      window.localStorage.removeItem(getDraftStepKey(submitted.id));
      setDrafts((current) => current.filter((item) => item.id !== submitted.id));
      onSuccess(submitted);
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : err instanceof Error ? err.message : 'Unable to submit the listing.');
    } finally {
      setSubmitting(false);
    }
  };

  const modeLabel = form.mode === 'DISCOVERY_AND_STORE' ? 'Discovery + Store' : 'Discovery Only';

  const readinessChecklist = useMemo(() => {
    const hasIdentity = Boolean(form.name.trim());
    const hasDescription = Boolean(form.shortDescription.trim() || form.description.trim());
    const hasCategory = activeCategories.length === 0 || form.categoryIds.length > 0;
    const hasContact = Boolean(form.phone.trim() || form.whatsapp.trim() || form.email.trim());
    const hasLocation = Boolean(form.locationName.trim() && form.region && form.district && form.city.trim());
    const hasCoordinates = Boolean(
      form.latitude.trim() &&
      form.longitude.trim() &&
      Number.isFinite(Number(form.latitude)) &&
      Number.isFinite(Number(form.longitude)) &&
      !coordsAutoAssigned
    );
    const hasOffering = Boolean(form.serviceName.trim());

    return [
      {
        key: 'model',
        label: 'Listing Model',
        value: modeLabel,
        ready: true,
        required: true,
        targetStep: 1 as WizardStep,
      },
      {
        key: 'identity',
        label: 'Business Name & Profile',
        value: hasIdentity
          ? `${form.name.trim()}${form.businessType ? ` · ${form.businessType}` : ''}`
          : 'Missing business name',
        ready: hasIdentity && hasDescription,
        required: true,
        targetStep: 2 as WizardStep,
      },
      {
        key: 'category',
        label: 'Category Placement',
        value: form.categoryIds.length ? `${form.categoryIds.length} category selected` : 'Missing — select at least 1 category',
        ready: hasCategory,
        required: true,
        targetStep: 2 as WizardStep,
      },
      {
        key: 'contact',
        label: 'Customer Contact Channel',
        value: hasContact
          ? [form.whatsapp.trim() && 'WhatsApp', form.phone.trim() && 'Phone', form.email.trim() && 'Email'].filter(Boolean).join(', ')
          : 'Missing — add WhatsApp, Phone, or Email',
        ready: hasContact,
        required: true,
        targetStep: 3 as WizardStep,
      },
      {
        key: 'location',
        label: 'Primary Location',
        value: hasLocation
          ? `${form.locationName.trim()} (${form.city.trim()}, ${form.district})`
          : 'Missing city, district, or region',
        ready: hasLocation,
        required: true,
        targetStep: 4 as WizardStep,
      },
      {
        key: 'coordinates',
        label: 'Map Coordinates & Pin',
        value: hasCoordinates
          ? `${Number(form.latitude).toFixed(4)}, ${Number(form.longitude).toFixed(4)}`
          : 'Missing — confirm pin on map or use GPS',
        ready: hasCoordinates,
        required: true,
        targetStep: 4 as WizardStep,
      },
      {
        key: 'offering',
        label: 'Service Offering',
        value: hasOffering
          ? form.serviceName.trim()
          : form.mode === 'DISCOVERY_AND_STORE'
            ? 'Store catalog & optional services'
            : 'Optional — can be added anytime',
        ready: true,
        required: false,
        targetStep: 5 as WizardStep,
      },
    ];
  }, [form, activeCategories.length, modeLabel, coordsAutoAssigned]);

  const requiredReadinessItems = readinessChecklist.filter((item) => item.required);
  const completedRequiredCount = requiredReadinessItems.filter((item) => item.ready).length;
  const readinessPercentage = Math.round((completedRequiredCount / requiredReadinessItems.length) * 100);

  const isStepComplete = (stepNum: number): boolean => {
    if (stepNum === 1) return Boolean(form.mode);
    if (stepNum === 2) return Boolean(form.name.trim() && (form.shortDescription.trim() || form.description.trim()) && (activeCategories.length === 0 || form.categoryIds.length > 0));
    if (stepNum === 3) return Boolean(form.phone.trim() || form.whatsapp.trim() || form.email.trim());
    if (stepNum === 4) return Boolean(form.locationName.trim() && form.region && form.district && form.city.trim() && form.latitude.trim() && form.longitude.trim() && !coordsAutoAssigned);
    if (stepNum === 5) return Boolean(form.serviceName.trim());
    if (stepNum === 6) return completedRequiredCount === requiredReadinessItems.length;
    return false;
  };

  const stepMeta: { step: WizardStep; title: string; subtitle: string }[] = [
    { step: 1, title: 'Listing Model', subtitle: 'Choose how you operate' },
    { step: 2, title: 'Business Profile', subtitle: 'Name, summary & categories' },
    { step: 3, title: 'Direct Contacts', subtitle: 'WhatsApp, phone & email' },
    { step: 4, title: 'Location & Map', subtitle: 'Address & accurate pin' },
    { step: 5, title: 'Offerings', subtitle: 'Featured services (optional)' },
    { step: 6, title: 'Review & Submit', subtitle: 'Verify & publish' },
  ];

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center justify-center gap-3 shadow-xs">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Loading your listing workspace…</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* Top Header & Context Bar */}
      <div className="p-6 sm:p-8 border-b border-slate-100 dark:border-slate-800 bg-linear-to-b from-slate-50/60 to-white dark:from-slate-900/60 dark:to-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AbaCha Discovery Onboarding</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-slate-500 font-normal">Private Draft</span>
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              List Your Business on AbaCha
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Set up your public marketplace profile. Save progress anytime and return whenever you want.
            </p>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="self-start sm:self-center px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Exit to Workspace
            </button>
          )}
        </div>

        {/* Resume Banner */}
        {showResume && drafts.length > 0 && (
          <div className="mt-5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 font-bold text-xs">
                {readSavedStep(window.localStorage.getItem(DRAFT_KEY) || '')}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-indigo-950 dark:text-indigo-100 truncate">
                  Unfinished Draft: {drafts.find((item) => item.id === window.localStorage.getItem(DRAFT_KEY))?.name || 'My Business'}
                </p>
                <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                  Pick up at Step {readSavedStep(window.localStorage.getItem(DRAFT_KEY) || '')} of 6
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const id = window.localStorage.getItem(DRAFT_KEY);
                if (id) void loadDraft(id).catch((err) => setError(err instanceof Error ? err.message : 'Unable to resume draft.'));
              }}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0 cursor-pointer shadow-2xs"
            >
              Resume Draft
            </button>
          </div>
        )}

        {/* Connected Step Navigation Track */}
        <div className="mt-6 pt-2">
          {/* Desktop Connected Stepper */}
          <div className="hidden sm:grid sm:grid-cols-6 gap-2">
            {stepMeta.map((item) => {
              const isActive = step === item.step;
              const isCompleted = isStepComplete(item.step);
              return (
                <button
                  key={item.step}
                  type="button"
                  onClick={() => changeStep(item.step)}
                  className={`group relative text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isActive
                      ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 shadow-xs'
                      : isCompleted
                        ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-300'
                        : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${
                        isActive
                          ? 'bg-indigo-600 text-white ring-2 ring-indigo-200 dark:ring-indigo-900'
                          : isCompleted
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {isCompleted && !isActive ? <Check className="w-3 h-3 stroke-[3]" /> : item.step}
                    </div>
                    <span
                      className={`text-xs font-semibold truncate ${
                        isActive
                          ? 'text-indigo-900 dark:text-indigo-200 font-bold'
                          : isCompleted
                            ? 'text-emerald-900 dark:text-emerald-300'
                            : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {item.title}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 truncate pl-7">
                    {item.subtitle}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Mobile Condensed Stepper */}
          <div className="sm:hidden">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Step {step} of 6: <span className="text-indigo-600 dark:text-indigo-400">{stepMeta[step - 1].title}</span>
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                {completedRequiredCount}/{requiredReadinessItems.length} checks
              </span>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => changeStep(s as WizardStep)}
                  className={`h-1.5 flex-1 rounded-full transition-all cursor-pointer ${
                    s === step
                      ? 'bg-indigo-600'
                      : isStepComplete(s)
                        ? 'bg-emerald-500'
                        : 'bg-slate-200 dark:bg-slate-800'
                  }`}
                  aria-label={`Go to step ${s}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Global Alerts & Guidance Feedback */}
      {error && (
        <div className="mx-6 sm:mx-8 mt-6 flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 text-rose-900 dark:text-rose-100 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{error}</p>
            {step === 4 && (!form.latitude.trim() || !form.longitude.trim() || coordsAutoAssigned) && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirmCurrentPinLocation}
                  className="px-3 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                >
                  Confirm Current Pin Location
                </button>
                <button
                  type="button"
                  onClick={snapPinToSelectedArea}
                  className="px-3 py-1 rounded-md border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 text-[11px] font-semibold cursor-pointer"
                >
                  Reset to {form.city || form.district || 'City'} Center
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {savedMessage && !error && (
        <div className="mx-6 sm:mx-8 mt-6 flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{savedMessage}</span>
        </div>
      )}

      {/* Main Wizard Form Body */}
      <div className="p-6 sm:p-8 min-h-[420px]">
        {/* STEP 1: MODEL SELECTION */}
        {step === 1 && (
          <section className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                How would you like to set up your business?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Choose the model that fits your operational needs today. You can always convert or upgrade later.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                {
                  value: 'DISCOVERY_ONLY' as DiscoveryBusinessMode,
                  title: 'Discovery Listing',
                  badge: 'Service & Local Discovery',
                  desc: 'Perfect for service providers, clinics, restaurants, salons, consultancies, or shops wanting direct customer inquiries.',
                  features: [
                    'Public listing in AbaCha Marketplace',
                    'Direct customer calls & WhatsApp messages',
                    'Location pin on the interactive search map',
                    'Customer reviews, ratings & trust badges',
                    'Showcase custom service offerings & quote requests',
                  ],
                  icon: Compass,
                },
                {
                  value: 'DISCOVERY_AND_STORE' as DiscoveryBusinessMode,
                  title: 'Discovery + Full Store',
                  badge: 'Commerce & Retail Till',
                  desc: 'Best for merchants, retail stores, supermarkets, and boutiques looking to sell items online and manage POS operations.',
                  features: [
                    'Everything in Discovery Listing',
                    'Integrated retail product catalog with variants',
                    'Authoritative multi-location inventory ledger',
                    'Point of Sale (POS) till with receipt printing',
                    'Customer e-commerce cart & online checkout',
                  ],
                  icon: Building2,
                },
              ].map((opt) => {
                const Icon = opt.icon;
                const isSelected = form.mode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update('mode', opt.value)}
                    className={`text-left p-5 rounded-2xl border-2 transition-all flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            isSelected
                              ? 'bg-indigo-600/10 text-indigo-700 dark:text-indigo-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {opt.badge}
                        </span>
                      </div>

                      <h4 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">{opt.title}</h4>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{opt.desc}</p>

                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5">
                        {opt.features.map((feat, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">
                        {isSelected ? 'Selected' : 'Click to select'}
                      </span>
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400">
              <Info className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                <strong>Selected Model:</strong> {modeLabel}. Your listing remains private in draft status until you explicitly submit it for moderation.
              </span>
            </div>
          </section>
        )}

        {/* STEP 2: BUSINESS PROFILE & CATEGORIES */}
        {step === 2 && (
          <section className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Business Profile</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tell customers who you are, what you offer, and choose relevant discovery categories.
              </p>
            </div>

            <div className="space-y-4">
              {/* Business Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Business Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="e.g. Freetown Fresh Organics, Salone Tailors"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>

              {/* Industry / Business Type */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Business Type / Industry
                </label>
                <input
                  type="text"
                  value={form.businessType}
                  onChange={(e) => update('businessType', e.target.value)}
                  placeholder="e.g. Retail & Supermarket, Boutique, Clinic, Tech Services"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
                <div className="pt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 font-medium mr-1">Quick Suggestions:</span>
                  {BUSINESS_TYPE_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => update('businessType', suggestion)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                        form.businessType === suggestion
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tagline / Short Description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Short Tagline / Summary <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                    {form.shortDescription.length}/500
                  </span>
                </div>
                <input
                  type="text"
                  value={form.shortDescription}
                  onChange={(e) => update('shortDescription', e.target.value)}
                  maxLength={500}
                  placeholder="e.g. Premium handcrafted textiles, custom tailoring and authentic West African fabrics."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
                <p className="text-[11px] text-slate-400">
                  This summary appears on marketplace search cards so customers immediately understand your offering.
                </p>
              </div>

              {/* Full Description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Full Business Story / Description <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                    {form.description.length}/10,000
                  </span>
                </div>
                <textarea
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  rows={3}
                  maxLength={10000}
                  placeholder="Share details regarding your story, specialties, certifications, or operating history…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>

              {/* Categories with Search Filter */}
              <div className="pt-2">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Discovery Categories <span className="text-rose-500">*</span>
                    </label>
                    <p className="text-[11px] text-slate-400">Select one or more categories where customers can find you.</p>
                  </div>
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-0.5 rounded-full">
                    {form.categoryIds.length} selected
                  </span>
                </div>

                {/* Category search input */}
                <div className="relative mb-3">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={categorySearchQuery}
                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                    placeholder="Search categories (e.g. Grocery, Fashion, Tech)…"
                    className="w-full pl-8 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Categories Tray */}
                <div className="max-h-52 overflow-y-auto p-1 flex flex-wrap gap-1.5 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/30 dark:bg-slate-900/30">
                  {filteredCategories.map((category) => {
                    const isSelected = form.categoryIds.includes(category.id);
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() =>
                          update(
                            'categoryIds',
                            isSelected
                              ? form.categoryIds.filter((id) => id !== category.id)
                              : [...form.categoryIds, category.id],
                          )
                        }
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                        }`}
                      >
                        <Tag className="w-3 h-3 shrink-0" />
                        <span>{category.name}</span>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>
                    );
                  })}
                  {filteredCategories.length === 0 && (
                    <p className="p-3 text-xs text-slate-400 w-full text-center">
                      No categories match "{categorySearchQuery}". Try another keyword.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* STEP 3: CONTACT CHANNELS */}
        {step === 3 && (
          <section className="space-y-6">
            {/* Section Header with top-right plus button */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Customer Contact Channels</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Provide direct contact methods and web/social links so customers can message, visit, and follow your business.
                </p>
              </div>
              <button
                type="button"
                onClick={() => addSocialLink('facebook')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-colors shrink-0 min-h-[44px]"
                title="Add web or social media link"
              >
                <Plus className="w-4 h-4" />
                <span>Add Web / Social Link</span>
              </button>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {/* WhatsApp (Primary commerce channel in Sierra Leone) */}
              <div className="space-y-1.5 p-4 rounded-xl border border-emerald-100 dark:border-emerald-950/60 bg-emerald-50/30 dark:bg-emerald-950/10">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-emerald-600" /> WhatsApp Number
                  </label>
                  {form.phone.trim() && form.whatsapp !== form.phone && (
                    <button
                      type="button"
                      onClick={() => update('whatsapp', form.phone)}
                      className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Copy phone
                    </button>
                  )}
                </div>
                <input
                  type="tel"
                  value={form.whatsapp}
                  onChange={(e) => update('whatsapp', e.target.value)}
                  placeholder="e.g. +232 76 123456"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition min-h-[44px]"
                />
                <p className="text-[10px] text-slate-500">
                  Direct WhatsApp messaging on cards and profile.
                </p>
              </div>

              {/* Direct Phone Number */}
              <div className="space-y-1.5 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/20">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-indigo-600" /> Phone Number
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="e.g. +232 76 000000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition min-h-[44px]"
                />
                <p className="text-[10px] text-slate-500">
                  Enables instant one-tap voice calling.
                </p>
              </div>

              {/* Email Address */}
              <div className="space-y-1.5 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/20">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-slate-500" /> Business Email Address
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder="contact@business.sl"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition min-h-[44px]"
                />
                <p className="text-[10px] text-slate-500">
                  For formal customer inquiries and quotes.
                </p>
              </div>
            </div>

            {/* Dedicated Web & Social Media Links Card with top-right Plus button */}
            <div className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-600" />
                    Web & Social Media Profiles
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Connect multiple social pages (Facebook, Instagram, TikTok, WhatsApp channel) and your website.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addSocialLink('facebook')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition min-h-[40px] shrink-0 self-start sm:self-center"
                  title="Add new social or web link"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Link</span>
                </button>
              </div>

              {/* Quick Preset Buttons */}
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
                    onClick={() => addSocialLink(item.platform)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition min-h-[32px]"
                  >
                    <Plus className="w-3 h-3 text-slate-400" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              {/* Links List */}
              {form.socialLinks.length === 0 ? (
                <div className="py-8 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-900/40">
                  <Globe className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    No web or social media links added yet
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                    Click the <span className="font-bold text-indigo-600">+ Add Link</span> button above or one of the quick presets to connect your Facebook, Instagram, or website.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {form.socialLinks.map((link, idx) => {
                    const cfg = getSocialPlatformConfig(link.platform);
                    const IconComp = cfg.icon;
                    return (
                      <div
                        key={link.id || idx}
                        className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/60 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 transition"
                      >
                        {/* Platform Selector */}
                        <div className="w-full sm:w-44 shrink-0">
                          <label className="sr-only">Platform</label>
                          <div className="relative">
                            <select
                              value={link.platform}
                              onChange={(e) => updateSocialLink(link.id, { platform: e.target.value as DiscoverySocialPlatform })}
                              className="w-full appearance-none pl-8 pr-7 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
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

                        {/* URL input */}
                        <div className="flex-1 min-w-0">
                          <label className="sr-only">URL</label>
                          <input
                            type="url"
                            value={link.url}
                            onChange={(e) => updateSocialLink(link.id, { url: e.target.value })}
                            placeholder={cfg.placeholder}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                          />
                        </div>

                        {/* Optional Label */}
                        <div className="w-full sm:w-40 shrink-0">
                          <label className="sr-only">Label</label>
                          <input
                            type="text"
                            value={link.label || ''}
                            onChange={(e) => updateSocialLink(link.id, { label: e.target.value })}
                            placeholder="Label (optional)"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                          />
                        </div>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => removeSocialLink(link.id)}
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
          </section>
        )}

        {/* STEP 4: LOCATION & MAP COORDINATES */}
        {step === 4 && (
          <section className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Primary Location & Map Coordinates</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Customers discover businesses nearby. Set your branch address and confirm your map pin.
              </p>
            </div>

            {/* Address Details */}
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Location / Branch Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.locationName}
                    onChange={(e) => update('locationName', e.target.value)}
                    placeholder="e.g. Main Branch, Central Office, Lumley Store"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Street Address & Landmark <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => update('address', e.target.value)}
                    placeholder="e.g. 14 Wilkinson Road, near Lumley Junction"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Cascading Location Selectors */}
              <div className="grid sm:grid-cols-3 gap-3">
                {/* Region / Province */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Region / Province <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={form.region}
                      onChange={(e) => handleRegionChangeInWizard(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 font-medium appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                    >
                      <option value="">Select Region</option>
                      {availableRegionsForWizard.map((prov) => (
                        <option key={prov} value={prov}>
                          {prov}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                  </div>
                </div>

                {/* District */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    District <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      disabled={!form.region}
                      value={form.district}
                      onChange={(e) => handleDistrictChangeInWizard(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 font-medium appearance-none pr-8 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                    >
                      <option value="">Select District</option>
                      {availableDistrictsForWizard.map((dist) => (
                        <option key={dist} value={dist}>
                          {dist}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                  </div>
                </div>

                {/* City / Town */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    City / Town <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      disabled={!form.district}
                      value={isCustomCityActive ? 'CUSTOM_CITY' : form.city}
                      onChange={(e) => {
                        if (e.target.value === 'CUSTOM_CITY') {
                          setIsCustomCityActive(true);
                          update('city', '');
                        } else {
                          setIsCustomCityActive(false);
                          handleCityChangeInWizard(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 font-medium appearance-none pr-8 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                    >
                      <option value="">Select City / Town</option>
                      {availableCitiesForWizard.map((cityName) => (
                        <option key={cityName} value={cityName}>
                          {cityName}
                        </option>
                      ))}
                      {form.district && <option value="CUSTOM_CITY">Other (Type manually)…</option>}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Custom manual city input if selected */}
              {isCustomCityActive && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    Custom City or Community Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => handleCityChangeInWizard(e.target.value)}
                    placeholder="Enter city or town name"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Quick Community snapping buttons */}
              {availableCommunitiesForWizard.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                    Quick Communities in {form.city}:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableCommunitiesForWizard.map((comm) => (
                      <button
                        key={comm}
                        type="button"
                        onClick={() => {
                          const coords = resolveDefaultCoordinates(comm, form.city, form.region);
                          update('latitude', coords.lat.toFixed(6));
                          update('longitude', coords.lng.toFixed(6));
                          if (!form.address.trim()) update('address', comm);
                          setCoordsAutoAssigned(false);
                          setSavedMessage(`Pin positioned at ${comm}.`);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-indigo-400 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer transition"
                      >
                        <MapPin className="w-3 h-3 inline mr-1 text-indigo-600" />
                        {comm}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Map Section */}
            <div className="p-4 sm:p-5 rounded-2xl border border-indigo-100 dark:border-indigo-950/60 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Map Pin & Coordinates <span className="text-rose-500">*</span>
                    </span>
                    {form.latitude.trim() && form.longitude.trim() && !coordsAutoAssigned ? (
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Check className="w-3 h-3" /> Pin Confirmed
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                        Confirmation Required
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {coordsAutoAssigned
                      ? `The pin is currently set near the approximate ${form.city || form.district || 'area'} center. Tap the map or drag the pin to your shop's exact location, or click "Confirm Pin Location".`
                      : 'Accurate pin location verified. Customers will get directions directly to this point.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* Confirm button */}
                  <button
                    type="button"
                    onClick={confirmCurrentPinLocation}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    Confirm Pin Location
                  </button>

                  {/* GPS Locator */}
                  <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={saving || submitting || locating}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition disabled:opacity-50 cursor-pointer"
                  >
                    {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
                    {locating ? 'Detecting GPS…' : 'Use My GPS'}
                  </button>
                </div>
              </div>

              {/* Map Canvas */}
              <DiscoveryLocationMapEditor
                latitude={form.latitude.trim() ? Number(form.latitude) : null}
                longitude={form.longitude.trim() ? Number(form.longitude) : null}
                onChange={(latitude, longitude, source = 'MANUAL', accuracyM = null) => {
                  update('latitude', latitude.toFixed(6));
                  update('longitude', longitude.toFixed(6));
                  setCoordsAutoAssigned(false);
                  setLocationAccuracyM(source === 'GPS' ? accuracyM : null);
                  if (source === 'GPS') {
                    setSavedMessage(
                      accuracyM != null
                        ? `GPS location updated (estimated accuracy ±${accuracyM} m).`
                        : 'GPS location updated.',
                    );
                  } else {
                    setSavedMessage('Pin placed at selected coordinates.');
                  }
                }}
                fallbackLatitude={
                  form.city || form.district || form.region
                    ? resolveDefaultCoordinates(form.city, form.district, form.region).lat
                    : undefined
                }
                fallbackLongitude={
                  form.city || form.district || form.region
                    ? resolveDefaultCoordinates(form.city, form.district, form.region).lng
                    : undefined
                }
                coordinatesConfirmed={!coordsAutoAssigned}
                height={320}
                disabled={saving || submitting}
              />

              {/* Coordinates Readout */}
              <div className="grid sm:grid-cols-3 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Latitude <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.latitude}
                    onChange={(e) => {
                      update('latitude', e.target.value);
                      setCoordsAutoAssigned(false);
                      setLocationAccuracyM(null);
                    }}
                    placeholder="e.g. 8.484400"
                    inputMode="decimal"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Longitude <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.longitude}
                    onChange={(e) => {
                      update('longitude', e.target.value);
                      setCoordsAutoAssigned(false);
                      setLocationAccuracyM(null);
                    }}
                    placeholder="e.g. -13.234400"
                    inputMode="decimal"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Delivery Radius km <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.serviceRadiusKm}
                    onChange={(e) => update('serviceRadiusKm', e.target.value)}
                    placeholder="e.g. 15 km"
                    inputMode="decimal"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* STEP 5: FEATURED SERVICES & OFFERINGS (OPTIONAL) */}
        {step === 5 && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Featured Offering / Service</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                    Optional
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Showcase a key service, specialty, or menu item so shoppers can request quotes. You can add more services later from your workspace.
                </p>
              </div>

              <button
                type="button"
                onClick={() => changeStep(6)}
                className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Skip to Review ➔
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Offering / Service Name
                </label>
                <input
                  type="text"
                  value={form.serviceName}
                  onChange={(e) => update('serviceName', e.target.value)}
                  placeholder="e.g. Bespoke Tailoring, Organic Fruit Box Delivery, Tech Diagnostics"
                  maxLength={180}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Service Type</label>
                  <input
                    type="text"
                    value={form.serviceType}
                    onChange={(e) => update('serviceType', e.target.value)}
                    placeholder="e.g. In-Store Consultation, Home Delivery, Repair"
                    maxLength={120}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Price Range (SLE)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={form.priceFrom}
                      onChange={(e) => update('priceFrom', e.target.value)}
                      placeholder="From (SLE)"
                      inputMode="decimal"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      value={form.priceTo}
                      onChange={(e) => update('priceTo', e.target.value)}
                      placeholder="To (SLE)"
                      inputMode="decimal"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Offering Description
                </label>
                <textarea
                  value={form.serviceDescription}
                  onChange={(e) => update('serviceDescription', e.target.value)}
                  rows={3}
                  maxLength={5000}
                  placeholder="Describe turnaround times, materials, warranty, or delivery policies…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>

              {form.mode === 'DISCOVERY_AND_STORE' && (
                <div className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-2.5">
                  <Store className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Store Catalog Ready:</strong> Since you chose <em>Discovery + Store</em>, your full retail product inventory, variants, POS barcodes, and stock levels will be configured right in your AbaCha Merchant Workspace after onboarding.
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* STEP 6: REVIEW & SUBMISSION */}
        {step === 6 && (
          <section className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Readiness & Submission</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review your listing checklist and preview how your card looks to shoppers before submitting.
              </p>
            </div>

            {/* Live Search Card Preview */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-indigo-600" /> Live Search Card Preview
                </span>
                <span className="text-[10px] font-normal text-slate-400">Preview as seen by customers</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {form.name || 'Your Business Name'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {form.businessType || 'General Business'} · {form.city || 'Freetown'}, {form.district || 'Sierra Leone'}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                    {modeLabel}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                  {form.shortDescription || 'Short tagline will appear here to introduce customers to your specialties and services.'}
                </p>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-500">
                    {form.whatsapp && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                        <MessageSquare className="w-3 h-3" /> WhatsApp
                      </span>
                    )}
                    {form.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Call
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-medium text-slate-400">
                    📍 {form.latitude && form.longitude ? `${Number(form.latitude).toFixed(3)}, ${Number(form.longitude).toFixed(3)}` : 'Location Pin Set'}
                  </div>
                </div>
              </div>
            </div>

            {/* Checklist */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Readiness Requirements ({completedRequiredCount} of {requiredReadinessItems.length} ready)
              </h4>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {readinessChecklist.map((item) => (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between gap-2.5 p-3 rounded-xl border transition ${
                      item.ready
                        ? 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900'
                        : 'border-amber-300 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20'
                    }`}
                  >
                    <div className="min-w-0 flex items-start gap-2">
                      {item.ready ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.label}</p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{item.value}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => changeStep(item.targetStep)}
                      className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title="Edit this step"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Transparent Moderation Note */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <strong>Next Step:</strong> When you submit, your listing is sent to the AbaCha team for quick review. Once approved, it appears live in the public directory and search results.
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Persistent Bottom Action Bar */}
      <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <button
          type="button"
          onClick={() => changeStep(Math.max(1, step - 1) as WizardStep)}
          disabled={step === 1 || saving || submitting}
          className="order-2 sm:order-1 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Previous Step
        </button>

        <div className="order-1 sm:order-2 flex items-center justify-end gap-2.5">
          {businessId && (
            <button
              type="button"
              onClick={() => void createOrSaveDraft()}
              disabled={saving || submitting}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-slate-500" />}
              <span>Save Draft</span>
            </button>
          )}

          {step < 6 ? (
            <button
              type="button"
              onClick={() => void handleNext()}
              disabled={saving || submitting}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs transition"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Continue</span>
              {!saving && <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving || submitting || completedRequiredCount < requiredReadinessItems.length}
              className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs transition"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Submit for Review</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
