import React, { useEffect, useMemo, useState } from 'react';
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
} from '../../../types/discovery';

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

interface DiscoveryOnboardingWizardProps {
  onSuccess: (createdBusiness: DiscoveryBusiness) => void;
  onCancel?: () => void;
  initialBusinessId?: string;
  initialStep?: WizardStep;
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

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

  useEffect(() => {
    if (initialStep >= 1 && initialStep <= 6) {
      setStep(initialStep);
    }
  }, [initialStep]);

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
    // Region/city centers are only map starting points, never confirmed business coordinates.
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
    setSavedMessage(`Approximate ${form.city || form.district || form.region || 'Freetown'} center selected. Tap or drag the pin to the actual business location, or use device GPS before saving.`);
  };

  const getDraftStepKey = (id: string) => `${DRAFT_STEP_KEY_PREFIX}${id}`;
  const readSavedStep = (id: string): WizardStep => {
    const raw = Number(window.localStorage.getItem(getDraftStepKey(id)));
    return Number.isInteger(raw) && raw >= 1 && raw <= 6 ? raw as WizardStep : 1;
  };

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
    setSavedMessage('Draft resumed.');
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
    return () => { mounted = false; };
  }, [initialBusinessId]);

  // Persist the current wizard position so Save draft / Cancel / later
  // reopening resumes at the last completed step on this device.
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
            ? `Location found. GPS accuracy is approximately ${Math.round(position.coords.accuracy)} m.`
            : 'Location found from your device.',
        );
        setLocating(false);
      },
      (positionError) => {
        const message =
          positionError.code === 1
            ? 'Location permission was denied. Allow location access in your browser/device settings or click "Snap Pin to City" below.'
            : positionError.code === 2
              ? 'Your device could not determine its location. Check that GPS/location services are enabled or set the pin on the map.'
              : 'Unable to determine your current location. Please try again or set the pin manually on the map.';
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
      setStep(2);
      setError(null);
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
    setStep((current) => Math.min(6, current + 1) as WizardStep);
    setError(null);
  };

  const handleSubmit = async () => {
    for (const checkStep of [1, 2, 3, 4, 5] as WizardStep[]) {
      const validation = validateStep(checkStep);
      if (validation) {
        setError(validation);
        setStep(checkStep);
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
      Number.isFinite(Number(form.longitude))
    );
    const hasOffering = Boolean(form.serviceName.trim());

    return [
      {
        key: 'model',
        label: 'Listing model',
        value: modeLabel,
        ready: true,
        required: true,
        targetStep: 1 as WizardStep,
      },
      {
        key: 'identity',
        label: 'Business profile & description',
        value: hasIdentity && hasDescription
          ? `${form.name.trim()} · Description provided`
          : !hasIdentity
            ? 'Business name missing'
            : 'Short tagline or description required',
        ready: hasIdentity && hasDescription,
        required: true,
        targetStep: 2 as WizardStep,
      },
      {
        key: 'category',
        label: 'Category placement',
        value: form.categoryIds.length ? `${form.categoryIds.length} category selected` : 'Missing — select at least 1 category',
        ready: hasCategory,
        required: true,
        targetStep: 2 as WizardStep,
      },
      {
        key: 'contact',
        label: 'Customer contact channel',
        value: hasContact
          ? [form.phone.trim() && 'Phone', form.whatsapp.trim() && 'WhatsApp', form.email.trim() && 'Email'].filter(Boolean).join(', ')
          : 'Missing — add Phone, WhatsApp, or Email',
        ready: hasContact,
        required: true,
        targetStep: 3 as WizardStep,
      },
      {
        key: 'location',
        label: 'Primary location',
        value: hasLocation
          ? `${form.locationName.trim()} (${form.city.trim()}, ${form.district})`
          : 'Missing city, district, or region',
        ready: hasLocation,
        required: true,
        targetStep: 4 as WizardStep,
      },
      {
        key: 'coordinates',
        label: 'Map coordinates',
        value: hasCoordinates
          ? `${Number(form.latitude).toFixed(4)}, ${Number(form.longitude).toFixed(4)}`
          : 'Missing — set pin on map or use GPS',
        ready: hasCoordinates,
        required: true,
        targetStep: 4 as WizardStep,
      },
      {
        key: 'offering',
        label: 'Service offering',
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
  }, [form, activeCategories.length, modeLabel]);

  const requiredReadinessItems = readinessChecklist.filter((item) => item.required);
  const completedRequiredCount = requiredReadinessItems.filter((item) => item.ready).length;
  const readinessPercentage = Math.round((completedRequiredCount / requiredReadinessItems.length) * 100);

  const isStepComplete = (stepNum: number): boolean => {
    if (stepNum === 1) return Boolean(form.mode);
    if (stepNum === 2) return Boolean(form.name.trim() && (form.shortDescription.trim() || form.description.trim()) && (activeCategories.length === 0 || form.categoryIds.length > 0));
    if (stepNum === 3) return Boolean(form.phone.trim() || form.whatsapp.trim() || form.email.trim());
    if (stepNum === 4) return Boolean(form.locationName.trim() && form.region && form.district && form.city.trim() && form.latitude.trim() && form.longitude.trim());
    if (stepNum === 5) return Boolean(form.serviceName.trim());
    if (stepNum === 6) return completedRequiredCount === requiredReadinessItems.length;
    return false;
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-10 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
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
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Back to Workspace
            </button>
          )}
        </div>

        {/* Live Readiness Progress Bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              Listing Readiness: <strong className="text-slate-900 dark:text-white">{completedRequiredCount} of {requiredReadinessItems.length}</strong> required checks complete
            </span>
            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{readinessPercentage}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${readinessPercentage}%` }}
            />
          </div>
        </div>

        {showResume && drafts.length > 0 && (
          <div className="mt-5 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/30 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">Resume your saved draft</p>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">
                  {drafts.find((item) => item.id === window.localStorage.getItem(DRAFT_KEY))?.name}
                  {' · '}Step {readSavedStep(window.localStorage.getItem(DRAFT_KEY) || '')} of 6
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const id = window.localStorage.getItem(DRAFT_KEY);
                  if (id) void loadDraft(id).catch((err) => setError(err instanceof Error ? err.message : 'Unable to resume draft.'));
                }}
                className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer"
              >
                Resume
              </button>
            </div>
          </div>
        )}

        {/* Interactive Stepper */}
        <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            ['1', 'Model'],
            ['2', 'Business'],
            ['3', 'Contacts'],
            ['4', 'Location'],
            ['5', 'Offerings'],
            ['6', 'Review'],
          ].map(([number, label]) => {
            const stepNum = Number(number) as WizardStep;
            const isActive = step === stepNum;
            const completed = isStepComplete(stepNum);
            return (
              <button
                key={number}
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(stepNum);
                }}
                className={`group p-2 rounded-2xl border text-center transition-all cursor-pointer ${
                  isActive
                    ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-2xs'
                    : completed
                      ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-300'
                      : 'border-slate-200/70 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div
                  className={`mx-auto w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : completed
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {completed && !isActive ? '✓' : number}
                </div>
                <div className={`mt-1 text-[10px] font-semibold truncate ${isActive ? 'text-indigo-700 dark:text-indigo-300 font-bold' : 'text-slate-500'}`}>
                  {label}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-6 flex items-start gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1">
            <span>{error}</span>
            {step === 4 && (!form.latitude.trim() || !form.longitude.trim()) && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={snapPinToSelectedArea}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                >
                  Set Pin to {form.city || form.district || 'Freetown'} Center
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {savedMessage && !error && (
        <div className="mx-6 mt-6 flex items-center gap-2 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> <span>{savedMessage}</span>
        </div>
      )}

      <div className="p-6 sm:p-8 min-h-[410px]">
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
                    className={`text-left p-5 rounded-2xl border-2 transition cursor-pointer ${selected ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}>
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

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Business Name <span className="text-rose-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Business name *"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Business Type / Industry
                </label>
                <input
                  value={form.businessType}
                  onChange={(e) => update('businessType', e.target.value)}
                  placeholder="Business type (e.g. Retail, Restaurant, Services)"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
                <div className="flex flex-wrap gap-1 pt-1">
                  {BUSINESS_TYPE_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => update('businessType', suggestion)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                        form.businessType === suggestion
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Short Tagline / Summary <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400 tabular-nums">{form.shortDescription.length}/500</span>
                </div>
                <input
                  value={form.shortDescription}
                  onChange={(e) => update('shortDescription', e.target.value)}
                  maxLength={500}
                  placeholder="Short description"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
                <p className="text-[10px] text-slate-400">Appears on search cards so customers quickly understand your business.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Full Business Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                rows={3}
                maxLength={10000}
                placeholder="Full business description"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Categories <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                  {form.categoryIds.length} selected
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {activeCategories.map((category) => {
                  const selected = form.categoryIds.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() =>
                        update(
                          'categoryIds',
                          selected
                            ? form.categoryIds.filter((id) => id !== category.id)
                            : [...form.categoryIds, category.id],
                        )
                      }
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        selected
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                      }`}
                    >
                      <Tag className="inline w-3 h-3 mr-1" />
                      {category.name}
                    </button>
                  );
                })}
              </div>
              {!activeCategories.length && (
                <p className="mt-2 text-xs text-amber-600">No active categories are currently available.</p>
              )}
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

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> Direct Phone Number
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="Phone number (e.g. +232 76 000000)"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-500" /> WhatsApp Number
                  </label>
                  {form.phone.trim() && form.whatsapp !== form.phone && (
                    <button
                      type="button"
                      onClick={() => update('whatsapp', form.phone)}
                      className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Use phone number
                    </button>
                  )}
                </div>
                <input
                  value={form.whatsapp}
                  onChange={(e) => update('whatsapp', e.target.value)}
                  placeholder="WhatsApp number"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> Business Email Address
                </label>
                <input
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  type="email"
                  placeholder="Email address"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-slate-400" /> Website or Social Link (optional)
                </label>
                <input
                  value={form.website}
                  onChange={(e) => update('website', e.target.value)}
                  placeholder="Website (optional)"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Primary location & map coordinates</h3>
                <p className="text-xs text-slate-500">Customers use your location and map pin for discovery, directions, and nearby search.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Branch / Location Name <span className="text-rose-500">*</span>
                </label>
                <input
                  value={form.locationName}
                  onChange={(e) => update('locationName', e.target.value)}
                  placeholder="Location name *"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Street / Landmark Address
                </label>
                <input
                  value={form.address}
                  onChange={(e) => update('address', e.target.value)}
                  placeholder="Street / address (e.g. 14 Wilkinson Road)"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              {/* Region/Province Select */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Region / Province *</label>
                <div className="relative">
                  <select
                    value={form.region}
                    onChange={(e) => handleRegionChangeInWizard(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none pr-8 text-slate-800 dark:text-slate-100 font-medium"
                  >
                    <option value="" className="text-slate-400">Select Region</option>
                    {availableRegionsForWizard.map((prov) => (
                      <option key={prov} value={prov} className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900">
                        {prov}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-2.5 top-4 pointer-events-none text-slate-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* District Select */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">District *</label>
                <div className="relative">
                  <select
                    disabled={!form.region}
                    value={form.district}
                    onChange={(e) => handleDistrictChangeInWizard(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 appearance-none pr-8 text-slate-800 dark:text-slate-100 font-medium"
                  >
                    <option value="" className="text-slate-400">Select District</option>
                    {availableDistrictsForWizard.map((dist) => (
                      <option key={dist} value={dist} className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900">
                        {dist}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-2.5 top-4 pointer-events-none text-slate-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* City Select */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">City / Town *</label>
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
                    className="w-full px-3 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 appearance-none pr-8 text-slate-800 dark:text-slate-100 font-medium"
                  >
                    <option value="" className="text-slate-400">Select City</option>
                    {availableCitiesForWizard.map((cityName) => (
                      <option key={cityName} value={cityName} className="text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900">
                        {cityName}
                      </option>
                    ))}
                    {form.district && <option value="CUSTOM_CITY" className="text-indigo-600 font-semibold bg-white dark:bg-slate-900">Other (Type manually)...</option>}
                  </select>
                  <div className="absolute right-2.5 top-4 pointer-events-none text-slate-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Manual City Input */}
            {isCustomCityActive && (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <label className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Type Custom City / Town Name *</label>
                <input
                  type="text"
                  placeholder="Enter city or town name"
                  value={form.city}
                  onChange={(e) => handleCityChangeInWizard(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm focus:ring-1 focus:ring-indigo-500 text-slate-850 dark:text-slate-100 font-medium"
                />
              </div>
            )}

            {/* Quick Neighborhood / Community Pin Snapping if available */}
            {availableCommunitiesForWizard.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Quick Pin Neighborhood / Community in {form.city}
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
                        setSavedMessage(`Map pin positioned at ${comm}.`);
                      }}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <MapPin className="w-3 h-3 inline mr-1 text-indigo-600" />
                      {comm}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Map Coordinates <span className="text-rose-500">*</span>
                    </p>
                    {form.latitude.trim() && form.longitude.trim() ? (
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                        ✓ Coordinates Ready
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                        Required for Readiness
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Use device GPS only when you are physically at this business. Otherwise, pan or tap the map to place the pin at the business location. City and district centers are approximate and must be refined before saving.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={snapPinToSelectedArea}
                    disabled={saving || submitting}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-indigo-300 disabled:opacity-50 cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                    Snap Pin to {form.city || form.district || 'City'}
                  </button>
                  <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={saving || submitting || locating}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                  >
                    {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
                    {locating ? 'Finding location…' : 'Use my location'}
                  </button>
                </div>
              </div>

              <DiscoveryLocationMapEditor
                latitude={form.latitude.trim() ? Number(form.latitude) : null}
                longitude={form.longitude.trim() ? Number(form.longitude) : null}
                onChange={(latitude, longitude, source = 'MANUAL', accuracyM = null) => {
                  update('latitude', latitude.toFixed(6));
                  update('longitude', longitude.toFixed(6));
                  setCoordsAutoAssigned(false);
                  setLocationAccuracyM(source === 'GPS' ? accuracyM : null);
                  if (source === 'GPS') {
                    setSavedMessage(accuracyM != null
                      ? `Device GPS location found (estimated accuracy ±${accuracyM} m).`
                      : 'Device GPS location found.');
                  }
                }}
                fallbackLatitude={(form.city || form.district || form.region) ? resolveDefaultCoordinates(form.city, form.district, form.region).lat : undefined}
                fallbackLongitude={(form.city || form.district || form.region) ? resolveDefaultCoordinates(form.city, form.district, form.region).lng : undefined}
                coordinatesConfirmed={!coordsAutoAssigned}
                height={340}
                disabled={saving || submitting}
              />

              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    Latitude <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={form.latitude}
                    onChange={(e) => {
                      update('latitude', e.target.value);
                      setCoordsAutoAssigned(false);
                      setLocationAccuracyM(null);
                    }}
                    placeholder="e.g. 8.484400"
                    inputMode="decimal"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    Longitude <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={form.longitude}
                    onChange={(e) => {
                      update('longitude', e.target.value);
                      setCoordsAutoAssigned(false);
                      setLocationAccuracyM(null);
                    }}
                    placeholder="e.g. -13.234400"
                    inputMode="decimal"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    Service Radius km (optional)
                  </label>
                  <input
                    value={form.serviceRadiusKm}
                    onChange={(e) => update('serviceRadiusKm', e.target.value)}
                    placeholder="Service radius km (e.g. 15)"
                    inputMode="decimal"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {step === 5 && (
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Services & offerings</h3>
                <p className="text-xs text-slate-500">Add a featured service customers can discover or request. You can also add or manage services later from your dashboard.</p>
              </div>
            </div>
            <input value={form.serviceName} onChange={(e) => update('serviceName', e.target.value)} placeholder="Service / offering name (optional)" maxLength={180} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white" />
            <div className="grid sm:grid-cols-2 gap-3">
              <input value={form.serviceType} onChange={(e) => update('serviceType', e.target.value)} placeholder="Service type (e.g. Consultation, Delivery, Repair)" maxLength={120} className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white" />
              <div className="grid grid-cols-2 gap-2">
                <input value={form.priceFrom} onChange={(e) => update('priceFrom', e.target.value)} placeholder="From (SLE)" inputMode="decimal" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white" />
                <input value={form.priceTo} onChange={(e) => update('priceTo', e.target.value)} placeholder="To (SLE)" inputMode="decimal" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white" />
              </div>
            </div>
            <textarea value={form.serviceDescription} onChange={(e) => update('serviceDescription', e.target.value)} rows={4} maxLength={5000} placeholder="Describe this service (optional)" className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white resize-none" />
            {form.mode === 'DISCOVERY_AND_STORE' && <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 text-xs text-indigo-800 dark:text-indigo-200">Your Store catalog will be managed after onboarding through the tenant catalog, inventory and POS workflows. This keeps product creation subject to the store's tenant permissions and catalog rules.</div>}
          </section>
        )}

        {step === 6 && (
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Readiness & submission</h3>
                <p className="text-xs text-slate-500">Review your listing checklist below. Click any item to edit it before sending your listing to moderation.</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {readinessChecklist.map((item) => (
                <div
                  key={item.key}
                  className={`flex items-center justify-between gap-3 p-4 rounded-2xl border transition ${
                    item.ready
                      ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      : 'border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {item.ready ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{item.label}</p>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{item.value}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep(item.targetStep);
                    }}
                    className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      item.ready
                        ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                        : 'bg-amber-600 hover:bg-amber-700 text-white'
                    }`}
                  >
                    <Edit3 className="w-3 h-3" />
                    {item.ready ? 'Edit' : 'Complete'}
                  </button>
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
          className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center gap-2 cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Previous
        </button>

        <div className="flex items-center gap-2">
          {businessId && (
            <button type="button" onClick={() => void createOrSaveDraft()} disabled={saving || submitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-2 cursor-pointer">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save draft
            </button>
          )}

          {step < 6 ? (
            <button type="button" onClick={() => void handleNext()} disabled={saving || submitting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Continue
            </button>
          ) : (
            <button type="button" onClick={() => void handleSubmit()} disabled={saving || submitting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Submit for review
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
