import React, { useState, useEffect } from 'react';
import {
  Clock,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Building,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type {
  DiscoveryBusiness,
  DiscoveryLocation,
  DiscoveryBusinessHours,
} from '../../../types/discovery';

interface DiscoveryHoursEditorProps {
  business: DiscoveryBusiness;
  initialLocationId?: string;
}

const DAYS = [
  { dayOfWeek: 1, name: 'Monday' },
  { dayOfWeek: 2, name: 'Tuesday' },
  { dayOfWeek: 3, name: 'Wednesday' },
  { dayOfWeek: 4, name: 'Thursday' },
  { dayOfWeek: 5, name: 'Friday' },
  { dayOfWeek: 6, name: 'Saturday' },
  { dayOfWeek: 7, name: 'Sunday' },
];

interface DaySchedule {
  dayOfWeek: number;
  isClosed: boolean;
  opensAt: string;
  closesAt: string;
}

export const DiscoveryHoursEditor: React.FC<DiscoveryHoursEditorProps> = ({
  business,
  initialLocationId,
}) => {
  const [locations, setLocations] = useState<DiscoveryLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>(initialLocationId || '');
  const [schedule, setSchedule] = useState<DaySchedule[]>(
    DAYS.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      isClosed: d.dayOfWeek === 7, // Sunday closed by default
      opensAt: '08:30',
      closesAt: '18:00',
    }))
  );

  const [loadingLocations, setLoadingLocations] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load locations
  useEffect(() => {
    let mounted = true;
    const fetchLocs = async () => {
      try {
        const locs = await discoveryApi.getBusinessLocations(business.id);
        if (!mounted) return;
        setLocations(locs);
        if (locs.length > 0 && !selectedLocationId) {
          const primary = locs.find((l) => l.is_primary) || locs[0];
          setSelectedLocationId(primary.id);
        }
      } catch (err) {
        console.error('Failed to load locations', err);
      } finally {
        if (mounted) setLoadingLocations(false);
      }
    };
    void fetchLocs();
    return () => {
      mounted = false;
    };
  }, [business.id]);

  const handleToggleClosed = (dayOfWeek: number) => {
    setSchedule((prev) =>
      prev.map((item) =>
        item.dayOfWeek === dayOfWeek ? { ...item, isClosed: !item.isClosed } : item
      )
    );
  };

  const handleTimeChange = (dayOfWeek: number, field: 'opensAt' | 'closesAt', value: string) => {
    setSchedule((prev) =>
      prev.map((item) =>
        item.dayOfWeek === dayOfWeek ? { ...item, [field]: value } : item
      )
    );
  };

  const handleCopyMondayToWeekdays = () => {
    const monday = schedule.find((d) => d.dayOfWeek === 1);
    if (!monday) return;
    setSchedule((prev) =>
      prev.map((item) =>
        item.dayOfWeek >= 1 && item.dayOfWeek <= 5
          ? { ...item, isClosed: monday.isClosed, opensAt: monday.opensAt, closesAt: monday.closesAt }
          : item
      )
    );
    setSuccess('Copied Monday operating hours to all weekdays (Mon-Fri).');
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleSetStandardHours = () => {
    setSchedule([
      { dayOfWeek: 1, isClosed: false, opensAt: '08:30', closesAt: '18:00' },
      { dayOfWeek: 2, isClosed: false, opensAt: '08:30', closesAt: '18:00' },
      { dayOfWeek: 3, isClosed: false, opensAt: '08:30', closesAt: '18:00' },
      { dayOfWeek: 4, isClosed: false, opensAt: '08:30', closesAt: '18:00' },
      { dayOfWeek: 5, isClosed: false, opensAt: '08:30', closesAt: '18:00' },
      { dayOfWeek: 6, isClosed: false, opensAt: '09:00', closesAt: '16:00' },
      { dayOfWeek: 7, isClosed: true, opensAt: '10:00', closesAt: '14:00' },
    ]);
    setSuccess('Loaded standard commercial operating hours.');
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocationId) {
      setError('Please select a branch location to update hours.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Validate
      for (const day of schedule) {
        if (!day.isClosed) {
          if (!day.opensAt || !day.closesAt) {
            const dayName = DAYS.find((d) => d.dayOfWeek === day.dayOfWeek)?.name;
            throw new Error(`Please specify both opening and closing times for ${dayName}.`);
          }
          if (day.opensAt === day.closesAt) {
            const dayName = DAYS.find((d) => d.dayOfWeek === day.dayOfWeek)?.name;
            throw new Error(`Opening and closing times cannot be identical for ${dayName}.`);
          }
        }
      }

      const payload = schedule.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        isClosed: s.isClosed,
        opensAt: s.isClosed ? null : s.opensAt,
        closesAt: s.isClosed ? null : s.closesAt,
      }));

      await discoveryApi.updateHours(business.id, selectedLocationId, payload);
      setSuccess('Weekly operating hours saved successfully.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to update operating hours.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Header & Location Picker */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              Weekly Operating Schedule
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Keep your opening times updated so customers know when your branch is ready for walk-ins or deliveries.
            </p>
          </div>

          {/* Location Selector */}
          <div className="w-full sm:w-64">
            <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">
              Select Branch
            </label>
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} {loc.is_primary ? '(Primary)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick presets buttons */}
        <div className="flex items-center gap-2.5 pt-4 flex-wrap">
          <button
            type="button"
            onClick={handleCopyMondayToWeekdays}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:border-slate-300 inline-flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5 text-indigo-500" />
            Copy Mon to Weekdays
          </button>
          <button
            type="button"
            onClick={handleSetStandardHours}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:border-slate-300"
          >
            Standard Retail Schedule (8:30 - 18:00)
          </button>
        </div>
      </div>

      {/* Alerts */}
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

      {/* 7-Day Schedule List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
        {DAYS.map((d) => {
          const item = schedule.find((s) => s.dayOfWeek === d.dayOfWeek) || {
            dayOfWeek: d.dayOfWeek,
            isClosed: false,
            opensAt: '08:30',
            closesAt: '18:00',
          };

          return (
            <div
              key={d.dayOfWeek}
              className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="w-32">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {d.name}
                </span>
              </div>

              <div className="flex items-center gap-4 flex-1">
                {/* Closed Toggle */}
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={item.isClosed}
                    onChange={() => handleToggleClosed(d.dayOfWeek)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className={item.isClosed ? 'text-rose-600 font-bold' : 'text-slate-600 dark:text-slate-400'}>
                    {item.isClosed ? 'Closed All Day' : 'Open'}
                  </span>
                </label>

                {!item.isClosed && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400">From</span>
                      <input
                        type="time"
                        value={item.opensAt}
                        onChange={(e) => handleTimeChange(d.dayOfWeek, 'opensAt', e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <span className="text-xs text-slate-400">to</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="time"
                        value={item.closesAt}
                        onChange={(e) => handleTimeChange(d.dayOfWeek, 'closesAt', e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{saving ? 'Saving Hours...' : 'Save Operating Schedule'}</span>
        </button>
      </div>
    </form>
  );
};
