import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MapPin,
  Plus,
  Edit2,
  Trash2,
  X,
  Search,
  Globe2,
  Map as MapIcon,
  Building2,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Compass,
} from 'lucide-react';
import { authClient } from '../../services/authClient';
import type { DiscoveryGeoLocation, DiscoveryGeoLocationType } from '../../types/discovery';

export const PlatformDiscoveryLocationsView: React.FC = () => {
  const [locations, setLocations] = useState<DiscoveryGeoLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Tree expansion states
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({});
  const [expandedDistricts, setExpandedDistricts] = useState<Record<string, boolean>>({});

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<DiscoveryGeoLocation | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Form fields
  const [formLocationType, setFormLocationType] = useState<DiscoveryGeoLocationType>('REGION');
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formParentId, setFormParentId] = useState('');
  const [formDisplayOrder, setFormDisplayOrder] = useState('0');
  const [formIsActive, setFormIsActive] = useState(true);
  const [autoSlug, setAutoSlug] = useState(true);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/platform/discovery/geo-locations', {
        headers: {
          'Content-Type': 'application/json',
          ...authClient.getAuthHeaders(),
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error?.message || `Failed to load locations (${response.status})`);
      }
      const data = (body.data || []) as DiscoveryGeoLocation[];
      setLocations(data);

      // Auto-expand regions and districts by default
      const regIds = data.filter((l) => l.location_type === 'REGION').map((l) => l.id);
      const distIds = data.filter((l) => l.location_type === 'DISTRICT').map((l) => l.id);
      setExpandedRegions((prev) => {
        const next = { ...prev };
        regIds.forEach((id) => {
          if (next[id] === undefined) next[id] = true;
        });
        return next;
      });
      setExpandedDistricts((prev) => {
        const next = { ...prev };
        distIds.forEach((id) => {
          if (next[id] === undefined) next[id] = true;
        });
        return next;
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load geographic taxonomy.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLocations();
  }, [fetchLocations]);

  // Auto-generate slug when creating
  useEffect(() => {
    if (autoSlug && !editingLocation) {
      const generated = formName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setFormSlug(generated);
    }
  }, [formName, autoSlug, editingLocation]);

  const regions = useMemo(
    () => locations.filter((l) => l.location_type === 'REGION'),
    [locations]
  );

  const districts = useMemo(
    () => locations.filter((l) => l.location_type === 'DISTRICT'),
    [locations]
  );

  const handleOpenCreate = (type: DiscoveryGeoLocationType, parentId?: string) => {
    setEditingLocation(null);
    setFormLocationType(type);
    setFormName('');
    setFormSlug('');
    if (parentId) {
      setFormParentId(parentId);
    } else if (type === 'DISTRICT') {
      setFormParentId(regions[0]?.id || '');
    } else if (type === 'CITY') {
      setFormParentId(districts[0]?.id || '');
    } else {
      setFormParentId('');
    }
    setFormDisplayOrder('10');
    setFormIsActive(true);
    setAutoSlug(true);
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (loc: DiscoveryGeoLocation) => {
    setEditingLocation(loc);
    setFormLocationType(loc.location_type);
    setFormName(loc.name);
    setFormSlug(loc.slug);
    setFormParentId(loc.parent_id || '');
    setFormDisplayOrder(String(loc.display_order));
    setFormIsActive(loc.is_active);
    setAutoSlug(false);
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError('Location name is required.');
      return;
    }
    if (!formSlug.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formSlug.trim())) {
      setError('Slug must contain lowercase letters, numbers, and hyphens only.');
      return;
    }
    if (formLocationType === 'DISTRICT' && !formParentId) {
      setError('Please select a parent Region for this District.');
      return;
    }
    if (formLocationType === 'CITY' && !formParentId) {
      setError('Please select a parent District for this City.');
      return;
    }

    setFormSubmitting(true);
    setError(null);
    setSuccess(null);

    const payload = {
      locationType: formLocationType,
      name: formName.trim(),
      slug: formSlug.trim(),
      parentId: formLocationType === 'REGION' ? null : formParentId || null,
      displayOrder: parseInt(formDisplayOrder, 10) || 0,
      isActive: formIsActive,
    };

    try {
      const url = editingLocation
        ? `/api/platform/discovery/geo-locations/${editingLocation.id}`
        : '/api/platform/discovery/geo-locations';
      const method = editingLocation ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...authClient.getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error?.message || `Failed to save location (${response.status})`);
      }

      setSuccess(
        editingLocation
          ? `${formLocationType} "${formName}" updated successfully.`
          : `${formLocationType} "${formName}" created and added to the main search selector.`
      );
      setIsModalOpen(false);
      void fetchLocations();
    } catch (err: any) {
      setError(err?.message || 'Failed to save location.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleActive = async (loc: DiscoveryGeoLocation) => {
    setError(null);
    setSuccess(null);
    const nextState = !loc.is_active;
    try {
      const response = await fetch(`/api/platform/discovery/geo-locations/${loc.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authClient.getAuthHeaders(),
        },
        body: JSON.stringify({ isActive: nextState }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error?.message || 'Failed to update status');
      }
      setSuccess(`"${loc.name}" has been ${nextState ? 'activated' : 'disabled'} in search selectors.`);
      void fetchLocations();
    } catch (err: any) {
      setError(err?.message || 'Failed to toggle location status.');
    }
  };

  const handleDelete = async (loc: DiscoveryGeoLocation) => {
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/platform/discovery/geo-locations/${loc.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...authClient.getAuthHeaders(),
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error?.message || 'Failed to delete location');
      }
      setSuccess(`"${loc.name}" removed from search selectors.`);
      void fetchLocations();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete location.');
    }
  };

  // Build 3-tier hierarchy tree: Region -> District -> City
  const geoTree = useMemo(() => {
    const searchLower = searchQuery.toLowerCase().trim();
    const districtsByRegion = new Map<string, DiscoveryGeoLocation[]>();
    const citiesByDistrict = new Map<string, DiscoveryGeoLocation[]>();

    locations.forEach((loc) => {
      if (loc.location_type === 'DISTRICT' && loc.parent_id) {
        const list = districtsByRegion.get(loc.parent_id) || [];
        list.push(loc);
        districtsByRegion.set(loc.parent_id, list);
      } else if (loc.location_type === 'CITY' && loc.parent_id) {
        const list = citiesByDistrict.get(loc.parent_id) || [];
        list.push(loc);
        citiesByDistrict.set(loc.parent_id, list);
      }
    });

    return regions
      .map((reg) => {
        const regDistricts = districtsByRegion.get(reg.id) || [];
        const regMatches =
          !searchLower ||
          reg.name.toLowerCase().includes(searchLower) ||
          reg.slug.toLowerCase().includes(searchLower);

        const mappedDistricts = regDistricts
          .map((dist) => {
            const distCities = citiesByDistrict.get(dist.id) || [];
            const distMatches =
              !searchLower ||
              dist.name.toLowerCase().includes(searchLower) ||
              dist.slug.toLowerCase().includes(searchLower);

            const filteredCities = searchLower
              ? distCities.filter(
                  (c) =>
                    c.name.toLowerCase().includes(searchLower) ||
                    c.slug.toLowerCase().includes(searchLower)
                )
              : distCities;

            const visible = !searchLower || regMatches || distMatches || filteredCities.length > 0;
            return {
              district: dist,
              cities: distCities,
              displayCities: regMatches || distMatches ? distCities : filteredCities,
              visible,
            };
          })
          .filter((d) => d.visible);

        const visible = !searchLower || regMatches || mappedDistricts.length > 0;
        return {
          region: reg,
          districts: mappedDistricts,
          totalDistricts: regDistricts.length,
          totalCities: regDistricts.reduce(
            (sum, d) => sum + (citiesByDistrict.get(d.id)?.length || 0),
            0
          ),
          visible,
        };
      })
      .filter((r) => r.visible);
  }, [locations, regions, searchQuery]);

  const stats = useMemo(() => {
    const regCount = locations.filter((l) => l.location_type === 'REGION').length;
    const distCount = locations.filter((l) => l.location_type === 'DISTRICT').length;
    const cityCount = locations.filter((l) => l.location_type === 'CITY').length;
    const activeCount = locations.filter((l) => l.is_active).length;
    return {
      total: locations.length,
      regions: regCount,
      districts: distCount,
      cities: cityCount,
      active: activeCount,
    };
  }, [locations]);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                <Compass className="w-3.5 h-3.5 text-indigo-300" />
                Geographic Search Selector Control
              </span>
              <span className="text-xs text-indigo-400 font-mono">
                Hierarchy: Region → District → City
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Main Search Locations (Regions, Districts & Cities)
            </h2>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Create and manage the Regions/Provinces, Districts, and Cities/Towns displayed in the Discovery main search bar and location filter selectors.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenCreate('REGION')}
              className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Region</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreate('DISTRICT')}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white border border-white/15 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-indigo-300" />
              <span>Add District</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreate('CITY')}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white border border-white/15 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-300" />
              <span>Add City</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Regions / Provinces
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-900 dark:text-white">{stats.regions}</span>
            <span className="text-xs text-slate-500">top-level regions</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Districts
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-900 dark:text-white">{stats.districts}</span>
            <span className="text-xs text-slate-500">linked districts</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Cities / Towns
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-900 dark:text-white">{stats.cities}</span>
            <span className="text-xs text-slate-500">searchable cities</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Active Selectors
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{stats.active}</span>
            <span className="text-xs text-slate-400">/ {stats.total} total</span>
          </div>
        </div>
      </div>

      {/* Feedback Alerts */}
      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
            <span className="text-sm font-semibold">{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 border border-rose-200/50 dark:border-rose-800/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
            <span className="text-sm font-semibold">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filter regions, districts, or cities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button
            onClick={() => void fetchLocations()}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            title="Refresh Locations"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <span className="text-xs text-slate-400 font-medium">
            Showing {geoTree.length} regions
          </span>
        </div>
      </div>

      {/* Hierarchy Tree Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/40 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-5">Location Hierarchy (Region → District → City)</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Slug</th>
                <th className="py-3 px-4 text-center">Order</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && locations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                      <p className="text-xs font-bold text-slate-500">Loading geographic locations...</p>
                    </div>
                  </td>
                </tr>
              ) : geoTree.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500 text-xs font-semibold">
                    No geographic locations found matching your search.
                  </td>
                </tr>
              ) : (
                geoTree.map(({ region, districts: regDistricts, totalDistricts, totalCities }) => {
                  const isRegExpanded = expandedRegions[region.id] !== false;
                  return (
                    <React.Fragment key={region.id}>
                      {/* Region Row */}
                      <tr className="bg-slate-50/70 dark:bg-slate-800/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 border-b border-slate-200/70 dark:border-slate-800 font-semibold group">
                        <td className="py-3.5 px-5 flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRegions((prev) => ({
                                ...prev,
                                [region.id]: !isRegExpanded,
                              }))
                            }
                            className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 dark:hover:bg-slate-700"
                          >
                            {isRegExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                            <Globe2 className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                              <span>{region.name}</span>
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                ({totalDistricts} districts, {totalCities} cities)
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                            Region
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[10px] text-slate-500">{region.slug}</td>
                        <td className="py-3.5 px-4 text-center text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
                          {region.display_order}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(region)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase transition-all cursor-pointer border ${
                              region.is_active
                                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200/50'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200'
                            }`}
                          >
                            {region.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            <span>{region.is_active ? 'Active' : 'Disabled'}</span>
                          </button>
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenCreate('DISTRICT', region.id)}
                              className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/40 hover:bg-indigo-100 rounded-lg cursor-pointer flex items-center gap-1"
                              title="Add District to this Region"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add District</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(region)}
                              className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                              title="Edit Region"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {!region.is_system && (
                              <button
                                type="button"
                                onClick={() => handleDelete(region)}
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                                title="Delete Region"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* District Rows */}
                      {isRegExpanded &&
                        regDistricts.map(({ district, displayCities }) => {
                          const isDistExpanded = expandedDistricts[district.id] !== false;
                          return (
                            <React.Fragment key={district.id}>
                              <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800/70 text-xs font-medium group">
                                <td className="py-3 pl-12 pr-5 flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedDistricts((prev) => ({
                                        ...prev,
                                        [district.id]: !isDistExpanded,
                                      }))
                                    }
                                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  >
                                    {isDistExpanded ? (
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                    <MapIcon className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-800 dark:text-slate-200">
                                      {district.name}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      ({displayCities.length} {displayCities.length === 1 ? 'city' : 'cities'})
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/50">
                                    District
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-mono text-[10px] text-slate-500">{district.slug}</td>
                                <td className="py-3 px-4 text-center text-xs font-mono text-slate-500">
                                  {district.display_order}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleActive(district)}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase transition-all cursor-pointer border ${
                                      district.is_active
                                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200/40'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200'
                                    }`}
                                  >
                                    {district.is_active ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                                    <span>{district.is_active ? 'Active' : 'Disabled'}</span>
                                  </button>
                                </td>
                                <td className="py-3 px-5 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenCreate('CITY', district.id)}
                                      className="px-2 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 rounded-lg cursor-pointer flex items-center gap-1"
                                      title="Add City/Town to this District"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Add City</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEdit(district)}
                                      className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                                      title="Edit District"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    {!district.is_system && (
                                      <button
                                        type="button"
                                        onClick={() => handleDelete(district)}
                                        className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md cursor-pointer"
                                        title="Delete District"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {/* City Rows */}
                              {isDistExpanded &&
                                displayCities.map((city) => (
                                  <tr
                                    key={city.id}
                                    className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800/50 text-xs text-slate-600 dark:text-slate-300 bg-slate-50/20 dark:bg-slate-900/10"
                                  >
                                    <td className="py-2.5 pl-24 pr-5 flex items-center gap-2">
                                      <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                                      <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                        <MapPin className="w-3 h-3" />
                                      </div>
                                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                                        {city.name}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-4">
                                      <span className="inline-flex px-2 py-0.5 rounded-md text-[9px] font-bold uppercase bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/40">
                                        City / Town
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-4 font-mono text-[10px] text-slate-400">{city.slug}</td>
                                    <td className="py-2.5 px-4 text-center text-xs font-mono text-slate-400">
                                      {city.display_order}
                                    </td>
                                    <td className="py-2.5 px-4 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleActive(city)}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase transition-all cursor-pointer border ${
                                          city.is_active
                                            ? 'bg-emerald-50/70 dark:bg-emerald-950/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/40'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200'
                                        }`}
                                      >
                                        {city.is_active ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                                        <span>{city.is_active ? 'Active' : 'Disabled'}</span>
                                      </button>
                                    </td>
                                    <td className="py-2.5 px-5 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenEdit(city)}
                                          className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                                          title="Edit City"
                                        >
                                          <Edit2 className="w-3 h-3" />
                                        </button>
                                        {!city.is_system && (
                                          <button
                                            type="button"
                                            onClick={() => handleDelete(city)}
                                            className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md cursor-pointer"
                                            title="Delete City"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                            </React.Fragment>
                          );
                        })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  {editingLocation ? `Edit ${formLocationType}` : `Add ${formLocationType} to Search Selector`}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {editingLocation
                    ? `Updating "${editingLocation.name}"`
                    : 'This location will immediately appear in the Discovery main search selectors'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {/* Location Type Selector (when creating) */}
              {!editingLocation && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Location Level
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['REGION', 'DISTRICT', 'CITY'] as DiscoveryGeoLocationType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setFormLocationType(type);
                          if (type === 'REGION') setFormParentId('');
                          else if (type === 'DISTRICT') setFormParentId(regions[0]?.id || '');
                          else if (type === 'CITY') setFormParentId(districts[0]?.id || '');
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          formLocationType === type
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {type === 'REGION' ? 'Region / Province' : type === 'DISTRICT' ? 'District' : 'City / Town'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Parent Region or District Selector */}
              {formLocationType === 'DISTRICT' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Parent Region / Province
                  </label>
                  <select
                    required
                    value={formParentId}
                    onChange={(e) => setFormParentId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Select Parent Region...</option>
                    {regions.map((reg) => (
                      <option key={reg.id} value={reg.id}>
                        {reg.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formLocationType === 'CITY' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Parent District
                  </label>
                  <select
                    required
                    value={formParentId}
                    onChange={(e) => setFormParentId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Select Parent District...</option>
                    {regions.map((reg) => {
                      const regDists = districts.filter((d) => d.parent_id === reg.id);
                      if (regDists.length === 0) return null;
                      return (
                        <optgroup key={reg.id} label={reg.name}>
                          {regDists.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({reg.name})
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Location Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {formLocationType === 'REGION'
                    ? 'Region / Province Name'
                    : formLocationType === 'DISTRICT'
                    ? 'District Name'
                    : 'City / Town Name'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    formLocationType === 'REGION'
                      ? 'e.g. Western Area'
                      : formLocationType === 'DISTRICT'
                      ? 'e.g. Western Area Urban'
                      : 'e.g. Freetown'
                  }
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Slug & Display Order */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Slug
                    </label>
                    {!editingLocation && (
                      <button
                        type="button"
                        onClick={() => setAutoSlug((prev) => !prev)}
                        className="text-[10px] font-bold text-indigo-600 hover:underline"
                      >
                        {autoSlug ? 'Manual' : 'Auto'}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    disabled={autoSlug && !editingLocation}
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono font-semibold focus:outline-none disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formDisplayOrder}
                    onChange={(e) => setFormDisplayOrder(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none"
                  />
                </div>
              </div>

              {/* Active switch */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <input
                  type="checkbox"
                  id="geoIsActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="geoIsActive" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                  Visible in Discovery main search & location selector dropdowns
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {formSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingLocation ? 'Save Changes' : `Add ${formLocationType}`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
