import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Compass,
  Building,
  Store,
  Navigation,
  RefreshCw,
  X,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import { DiscoveryLocationMapEditor } from './DiscoveryLocationMapEditor';
import type {
  DiscoveryBusiness,
  DiscoveryLocation,
  DiscoveryLocationType,
} from '../../../types/discovery';

interface DiscoveryLocationsPanelProps {
  business: DiscoveryBusiness;
  onSelectHoursLocation?: (locationId: string) => void;
}

export const DiscoveryLocationsPanel: React.FC<DiscoveryLocationsPanelProps> = ({
  business,
  onSelectHoursLocation,
}) => {
  const [locations, setLocations] = useState<DiscoveryLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal / Editor state
  const [editingLocation, setEditingLocation] = useState<DiscoveryLocation | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [gettingCoords, setGettingCoords] = useState<boolean>(false);
  const [verifyingLocationId, setVerifyingLocationId] = useState<string | null>(null);
  const [coordinatesAdjusted, setCoordinatesAdjusted] = useState<boolean>(false);

  // Form State
  const [locForm, setLocForm] = useState({
    name: '',
    locationType: 'STORE' as DiscoveryLocationType,
    addressLine1: '',
    addressLine2: '',
    city: 'Freetown',
    district: 'Western Area Urban',
    region: 'Western Area',
    country: 'Sierra Leone',
    postalCode: '',
    latitude: '',
    longitude: '',
    serviceRadiusKm: '15',
    phone: '',
    isPrimary: false,
    isActive: true,
  });

  const fetchLocations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await discoveryApi.getBusinessLocations(business.id);
      setLocations(data);
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setError(err.message);
      } else {
        setError('Failed to load locations.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLocations();
  }, [business.id]);

  const handleOpenAdd = () => {
    setEditingLocation(null);
    setLocForm({
      name: '',
      locationType: 'STORE',
      addressLine1: '',
      addressLine2: '',
      city: 'Freetown',
      district: 'Western Area Urban',
      region: 'Western Area',
      country: 'Sierra Leone',
      postalCode: '',
      latitude: '',
      longitude: '',
      serviceRadiusKm: '15',
      phone: business.phone || '',
      isPrimary: locations.length === 0,
      isActive: true,
    });
    setCoordinatesAdjusted(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (loc: DiscoveryLocation) => {
    setEditingLocation(loc);
    setLocForm({
      name: loc.name || '',
      locationType: loc.location_type || 'STORE',
      addressLine1: loc.address_line_1 || '',
      addressLine2: loc.address_line_2 || '',
      city: loc.city || 'Freetown',
      district: loc.district || '',
      region: loc.region || '',
      country: loc.country || 'Sierra Leone',
      postalCode: loc.postal_code || '',
      latitude: loc.latitude != null ? String(loc.latitude) : '',
      longitude: loc.longitude != null ? String(loc.longitude) : '',
      serviceRadiusKm: loc.service_radius_km != null ? String(loc.service_radius_km) : '15',
      phone: loc.phone || '',
      isPrimary: Boolean(loc.is_primary),
      isActive: Boolean(loc.is_active),
    });
    setCoordinatesAdjusted(false);
    setIsModalOpen(true);
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setGettingCoords(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocForm((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setCoordinatesAdjusted(false);
        setGettingCoords(false);
      },
      (err) => {
        alert(`Failed to retrieve GPS location: ${err.message}`);
        setGettingCoords(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!locForm.name.trim()) throw new Error('Location branch name is required.');
      if (locForm.locationType === 'SERVICE_AREA' && (!locForm.serviceRadiusKm || Number(locForm.serviceRadiusKm) <= 0)) {
        throw new Error('Service-area locations require a positive service radius.');
      }

      const latNum = locForm.latitude ? Number(locForm.latitude) : null;
      const lngNum = locForm.longitude ? Number(locForm.longitude) : null;

      if ((latNum == null) !== (lngNum == null)) {
        throw new Error('Latitude and Longitude must both be provided together for map discovery.');
      }

      const payload = {
        name: locForm.name.trim(),
        locationType: locForm.locationType,
        addressLine1: locForm.addressLine1.trim() || undefined,
        addressLine2: locForm.addressLine2.trim() || undefined,
        city: locForm.city.trim() || undefined,
        district: locForm.district.trim() || undefined,
        region: locForm.region.trim() || undefined,
        country: locForm.country.trim() || 'Sierra Leone',
        postalCode: locForm.postalCode.trim() || undefined,
        latitude: latNum ?? undefined,
        longitude: lngNum ?? undefined,
        serviceRadiusKm: locForm.serviceRadiusKm ? Number(locForm.serviceRadiusKm) : undefined,
        locationSource: coordinatesAdjusted ? 'MANUAL' : (editingLocation?.location_source || (latNum != null ? 'GPS' : 'MANUAL')),
        coordinateAccuracyM: editingLocation?.coordinate_accuracy_m ?? undefined,
        phone: locForm.phone.trim() || undefined,
        isPrimary: locForm.isPrimary,
        isActive: locForm.isActive,
      };

      if (editingLocation) {
        await discoveryApi.updateLocation(business.id, editingLocation.id, payload as any);
        setSuccess('Location updated successfully.');
      } else {
        await discoveryApi.createLocation(business.id, payload as any);
        setSuccess('New location added successfully.');
      }

      setIsModalOpen(false);
      await fetchLocations();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to save location.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Add Location button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-indigo-600" />
            Physical Branches & Service Areas
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage your storefronts, offices, and delivery coverage zones so nearby customers can find you.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Location</span>
        </button>
      </div>

      {/* Notifications */}
      {success && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Locations List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-xs gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading business branches...
        </div>
      ) : locations.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 mx-auto flex items-center justify-center mb-3">
            <Compass className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">No locations configured</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Adding at least one location allows your business to appear in neighborhood-based discovery searches and maps.
          </p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add First Location
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className={`p-6 rounded-3xl border transition-all bg-white dark:bg-slate-900 ${
                loc.is_primary
                  ? 'border-indigo-500/40 dark:border-indigo-500/30 shadow-md shadow-indigo-500/5'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {loc.name}
                    </h3>
                    {loc.is_primary && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        Primary
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {loc.location_type}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      {loc.address_line_1 ? `${loc.address_line_1}, ` : ''}
                      {loc.city || ''}
                      {loc.district ? `, ${loc.district}` : ''}
                      {loc.region ? `, ${loc.region}` : ''}
                    </span>
                  </p>

                  {loc.phone && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Phone: <span className="font-mono">{loc.phone}</span>
                    </p>
                  )}

                  {loc.latitude != null && loc.longitude != null && (
                    <p className="text-[11px] text-slate-400 mt-1 font-mono">
                      GPS: {Number(loc.latitude).toFixed(4)}, {Number(loc.longitude).toFixed(4)}
                    </p>
                  )}
                  {loc.latitude != null && loc.longitude != null && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        Location quality: {loc.location_quality_status || 'LOW'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Source: {loc.location_source || 'MANUAL'}
                      </span>
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${loc.latitude}&mlon=${loc.longitude}#map=17/${loc.latitude}/${loc.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold text-indigo-600 hover:underline"
                      >
                        Verify on map
                      </a>
                      {loc.location_quality_status !== 'VERIFIED' && (
                        <button
                          type="button"
                          disabled={verifyingLocationId === loc.id}
                          onClick={async () => {
                            setVerifyingLocationId(loc.id);
                            setError(null);
                            try {
                              await discoveryApi.verifyLocation(business.id, loc.id);
                              await fetchLocations();
                              setSuccess('Location marked as verified.');
                              setTimeout(() => setSuccess(null), 4000);
                            } catch (err: unknown) {
                              setError(err instanceof DiscoveryApiError ? err.message : 'Failed to verify location.');
                            } finally {
                              setVerifyingLocationId(null);
                            }
                          }}
                          className="text-[10px] font-bold text-emerald-600 hover:underline disabled:opacity-50"
                        >
                          {verifyingLocationId === loc.id ? 'Verifying…' : 'Mark verified'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(loc)}
                    className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Edit Location Details"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Action shortcuts */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {loc.is_active ? 'Active on Discovery' : 'Temporarily Inactive'}
                </span>

                {onSelectHoursLocation && (
                  <button
                    type="button"
                    onClick={() => onSelectHoursLocation(loc.id)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Edit Operating Hours</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Location Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl custom-scrollbar">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-indigo-600" />
                {editingLocation ? 'Edit Branch Location' : 'Add New Branch Location'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 mt-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Branch / Location Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={locForm.name}
                  onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                  placeholder="e.g. Lumley Flagship Store"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Location Type
                  </label>
                  <select
                    value={locForm.locationType}
                    onChange={(e) => setLocForm({ ...locForm, locationType: e.target.value as DiscoveryLocationType })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="STORE">Retail Storefront</option>
                    <option value="OFFICE">Office / Studio</option>
                    <option value="WAREHOUSE">Warehouse / Depot</option>
                    <option value="BRANCH">Branch</option>
                    <option value="HOME_BASED">Home Based</option>
                    <option value="MOBILE">Mobile</option>
                    <option value="SERVICE_AREA">Service Area / Mobile</option>
                    <option value="KIOSK">Kiosk / Stall</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={locForm.phone}
                    onChange={(e) => setLocForm({ ...locForm, phone: e.target.value })}
                    placeholder="+232 76 000000"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Street Address
                </label>
                <input
                  type="text"
                  value={locForm.addressLine1}
                  onChange={(e) => setLocForm({ ...locForm, addressLine1: e.target.value })}
                  placeholder="e.g. 14 Wilkinson Road"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    City / Town
                  </label>
                  <input
                    type="text"
                    value={locForm.city}
                    onChange={(e) => setLocForm({ ...locForm, city: e.target.value })}
                    placeholder="Freetown"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    District
                  </label>
                  <input
                    type="text"
                    value={locForm.district}
                    onChange={(e) => setLocForm({ ...locForm, district: e.target.value })}
                    placeholder="Western Urban"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Region
                  </label>
                  <input
                    type="text"
                    value={locForm.region}
                    onChange={(e) => setLocForm({ ...locForm, region: e.target.value })}
                    placeholder="Western Area"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Coordinates Section with GPS trigger */}
              <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-indigo-600" />
                    GPS Coordinates (Map Discovery)
                  </span>
                  <button
                    type="button"
                    disabled={gettingCoords}
                    onClick={handleGetCurrentLocation}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1"
                  >
                    {gettingCoords ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                    Use Current GPS
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">
                      Latitude
                    </label>
                    <input
                      type="text"
                      value={locForm.latitude}
                      onChange={(e) => setLocForm({ ...locForm, latitude: e.target.value })}
                      placeholder="8.4840"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">
                      Longitude
                    </label>
                    <input
                      type="text"
                      value={locForm.longitude}
                      onChange={(e) => setLocForm({ ...locForm, longitude: e.target.value })}
                      placeholder="-13.2299"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                  </div>
                </div>

                <DiscoveryLocationMapEditor
                  latitude={locForm.latitude ? Number(locForm.latitude) : null}
                  longitude={locForm.longitude ? Number(locForm.longitude) : null}
                  onChange={(latitude, longitude) => {
                    setLocForm((prev) => ({
                      ...prev,
                      latitude: latitude.toFixed(6),
                      longitude: longitude.toFixed(6),
                    }));
                    setCoordinatesAdjusted(true);
                  }}
                  disabled={saving}
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Dragging the pin records the merchant-adjusted coordinates as manual location data. Use GPS when you want the browser's current position.
                </p>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Service Radius (km)
                </label>
                <input
                  type="number"
                  min="0"
                  max="500"
                  step="0.5"
                  value={locForm.serviceRadiusKm}
                  onChange={(e) => setLocForm({ ...locForm, serviceRadiusKm: e.target.value })}
                  disabled={locForm.locationType !== 'SERVICE_AREA' && !locForm.serviceRadiusKm}
                  placeholder="15"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs"
                />
                <p className="text-[10px] text-slate-400">
                  Service-area businesses are eligible for discovery within this coverage radius. Physical locations can leave this empty.
                </p>
              </div>

              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={locForm.isPrimary}
                    onChange={(e) => setLocForm({ ...locForm, isPrimary: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Set as Primary Business Location</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={locForm.isActive}
                    onChange={(e) => setLocForm({ ...locForm, isActive: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Location is Active and Open to Customers</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>{saving ? 'Saving...' : editingLocation ? 'Update Location' : 'Create Location'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
