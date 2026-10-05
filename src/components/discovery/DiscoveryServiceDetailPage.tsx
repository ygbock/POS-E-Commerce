import React, { useEffect, useState } from 'react';
import { ArrowLeft, Clock3, MapPin, Send, AlertCircle, Loader2 } from 'lucide-react';
import type { DiscoveryService } from '../../types/discovery';
import { discoveryApi, DiscoveryApiError } from '../../services/discoveryApi';
import { VerificationBadge } from './VerificationBadge';

export interface DiscoveryServiceDetailPageProps {
  serviceId: string;
  onBack?: () => void;
  onRequestService?: (service: DiscoveryService) => void;
  onOpenBusiness?: (businessId: string) => void;
}

export const DiscoveryServiceDetailPage: React.FC<DiscoveryServiceDetailPageProps> = ({
  serviceId, onBack, onRequestService, onOpenBusiness,
}) => {
  const [service, setService] = useState<DiscoveryService | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void discoveryApi.getService(serviceId).then((data) => {
      if (active) setService(data);
    }).catch((err: unknown) => {
      if (!active) return;
      setError(err instanceof DiscoveryApiError ? err.message : 'Unable to load this service.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [serviceId]);

  if (loading) return (
    <main className="min-h-screen flex items-center justify-center text-slate-500">
      <div className="text-center"><Loader2 className="w-7 h-7 animate-spin mx-auto text-indigo-600" /><p className="mt-3 text-sm">Loading service…</p></div>
    </main>
  );

  if (error || !service) return (
    <main className="min-h-screen px-4 py-16 max-w-2xl mx-auto text-center">
      <AlertCircle className="w-10 h-10 mx-auto text-rose-500" />
      <h1 className="mt-4 text-2xl font-black">Service unavailable</h1>
      <p className="mt-2 text-sm text-slate-500">{error || 'This service is no longer available.'}</p>
      <button type="button" onClick={onBack} className="mt-6 inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold"><ArrowLeft className="w-4 h-4" />Back to discovery</button>
    </main>
  );

  const price = service.price_from != null
    ? `From ${Number(service.price_from).toLocaleString()} ${service.currency || 'SLE'}`
    : 'Quote on request';

  const request = () => {
    void discoveryApi.trackEvent({ eventType: 'SERVICE_REQUEST', businessId: service.business_id, serviceId: service.id });
    onRequestService?.(service);
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold min-h-[44px]"><ArrowLeft className="w-4 h-4" />Back to discovery</button>
        <section className="mt-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl sm:text-4xl font-black">{service.name}</h1>
                {service.verification_status && <VerificationBadge status={service.verification_status} showText={false} />}
              </div>
              <button type="button" onClick={() => onOpenBusiness?.(service.business_id)} className="mt-2 text-sm font-bold text-indigo-600 hover:underline">
                {service.business_name || 'Service provider'}
              </button>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-xs uppercase tracking-widest font-black text-slate-400">Estimate</div>
              <div className="mt-1 text-xl font-black">{price}</div>
            </div>
          </div>

          <p className="mt-6 text-sm sm:text-base leading-7 text-slate-600 dark:text-slate-300">
            {service.description || 'Professional service offered by this local business.'}
          </p>

          <div className="mt-6 grid sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border p-4"><div className="text-xs font-bold text-slate-400">Service area</div><div className="mt-1 inline-flex items-center gap-2 text-sm font-bold"><MapPin className="w-4 h-4" />{service.service_area_text || [service.city, service.district, service.region].filter(Boolean).join(', ') || 'Local area'}</div></div>
            <div className="rounded-2xl border p-4"><div className="text-xs font-bold text-slate-400">Duration</div><div className="mt-1 inline-flex items-center gap-2 text-sm font-bold"><Clock3 className="w-4 h-4" />{service.duration_minutes ? `${service.duration_minutes} minutes` : 'Flexible'}</div></div>
            <div className="rounded-2xl border p-4"><div className="text-xs font-bold text-slate-400">Booking mode</div><div className="mt-1 text-sm font-bold">{service.booking_mode === 'QUOTE' ? 'Request a quote' : service.booking_mode === 'BOOKING' ? 'Booking' : 'Service request'}</div></div>
          </div>

          <button type="button" onClick={request} className="mt-7 w-full sm:w-auto inline-flex justify-center items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 font-black">
            <Send className="w-4 h-4" />Request a quote
          </button>
        </section>
      </div>
    </main>
  );
};
