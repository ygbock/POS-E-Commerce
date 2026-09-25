import React, { useState, useEffect } from 'react';
import {
  FileText,
  Send,
  Calendar,
  Banknote,
  MapPin,
  Clock,
  User,
  Phone,
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  X,
  MessageSquare,
  Bell,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type {
  DiscoveryBusiness,
  DiscoveryServiceRequest,
  DiscoveryServiceQuote,
} from '../../../types/discovery';

interface DiscoveryQuotesInboxProps {
  business: DiscoveryBusiness;
}

export const DiscoveryQuotesInbox: React.FC<DiscoveryQuotesInboxProps> = ({
  business,
}) => {
  const [requests, setRequests] = useState<DiscoveryServiceRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Active quoting modal
  const [activeRequest, setActiveRequest] = useState<DiscoveryServiceRequest | null>(null);
  const [submittingQuote, setSubmittingQuote] = useState<boolean>(false);
  const [quoteSuccess, setQuoteSuccess] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<DiscoveryServiceRequest | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [businessServices, setBusinessServices] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    request_id: string;
    business_id?: string | null;
    notification_type: string;
    title: string;
    message: string;
    read_at?: string | null;
    created_at: string;
  }>>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);

  // Quote form state
  const [quoteForm, setQuoteForm] = useState({
    amount: '',
    currency: 'SLE',
    message: '',
    estimatedDurationMinutes: '120',
    validUntil: '',
  });

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await discoveryApi.getBusinessServiceRequests(business.id, filterStatus === 'ALL' ? '' : filterStatus);
      setRequests(data || []);
      setLastLoadedAt(new Date());
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setError(err.message);
      } else {
        setError('Failed to load quote requests.');
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshInbox = async () => {
    setRefreshing(true);
    try { await fetchRequests(); } finally { setRefreshing(false); }
  };

  useEffect(() => {
    void fetchRequests();
    void discoveryApi.getBusinessServices(business.id).then((services) => {
      setBusinessServices((services || []).filter((service) => service.id).map((service) => ({ id: service.id, name: service.name })));
    }).catch(() => setBusinessServices([]));
  }, [business.id, filterStatus]);

  const loadMerchantNotifications = async () => {
    setNotificationLoading(true);
    try {
      const data = await discoveryApi.getServiceRequestNotifications(false, 50);
      setNotifications((data || []).filter((notification) => notification.business_id === business.id));
    } catch {
      // Notification availability must not block the request inbox.
    } finally {
      setNotificationLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchRequests();
      void loadMerchantNotifications();
    }, 30000);
    void loadMerchantNotifications();
    const onFocus = () => void loadMerchantNotifications();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [business.id, filterStatus]);

  const unreadNotifications = notifications.filter((notification) => !notification.read_at).length;

  const openNotification = async (notification: typeof notifications[number]) => {
    if (!notification.read_at) {
      try { await discoveryApi.markServiceRequestNotificationRead(notification.id); } catch { /* keep navigation usable */ }
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: item.read_at || new Date().toISOString() } : item));
    }
    setNotificationOpen(false);
    const target = requests.find((request) => request.id === notification.request_id);
    if (target) {
      await handleOpenDetails(target);
    } else {
      try {
        const detail = await discoveryApi.getBusinessServiceRequest(business.id, notification.request_id);
        setSelectedRequest(detail);
      } catch {
        setError('Unable to open the service request from this notification.');
      }
    }
  };

  const markAllMerchantNotificationsRead = async () => {
    if (!unreadNotifications) return;
    try {
      await discoveryApi.markAllServiceRequestNotificationsRead();
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    } catch {
      setError('Unable to mark notifications as read.');
    }
  };

  const notificationAge = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const handleOpenDetails = async (req: DiscoveryServiceRequest) => {
    setLoadingDetails(true);
    setError(null);
    try {
      const detail = await discoveryApi.getBusinessServiceRequest(business.id, req.id);
      setSelectedRequest(detail);
    } catch (err: unknown) {
      setError(err instanceof DiscoveryApiError ? err.message : 'Unable to load request details.');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenQuoteModal = (req: DiscoveryServiceRequest) => {
    setActiveRequest(req);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7);
    const existingQuote = (req.quotes || []).find((quote) => quote.business_id === business.id && ['SUBMITTED', 'ACCEPTED'].includes(quote.status));
    if (existingQuote) {
      setError('Your business already has an active quote for this request. Open the request to review its current quote status.');
      return;
    }
    setSelectedServiceId(req.quotes?.find((quote) => quote.business_id === business.id)?.service_id || '');
    setQuoteForm({
      amount: req.budget_from ? String(req.budget_from) : '',
      currency: 'SLE',
      message: `Hello ${req.customer_name}, we would be delighted to assist with your request. Our team provides professional service with verified quality and standard warranty.`,
      estimatedDurationMinutes: '120',
      validUntil: tomorrow.toISOString().split('T')[0],
    });
  };

  const handleSendQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRequest) return;
    setSubmittingQuote(true);
    setError(null);

    try {
      if (!quoteForm.amount || Number(quoteForm.amount) <= 0) {
        throw new Error('Please specify a valid quote price.');
      }

      await discoveryApi.createQuote(activeRequest.id, {
        businessId: business.id,
        serviceId: selectedServiceId || undefined,
        amount: Number(quoteForm.amount),
        currency: quoteForm.currency,
        message: quoteForm.message.trim() || undefined,
        estimatedDurationMinutes: quoteForm.estimatedDurationMinutes ? Number(quoteForm.estimatedDurationMinutes) : undefined,
        validUntil: quoteForm.validUntil || undefined,
      });

      setQuoteSuccess(`Formal quote sent to ${activeRequest.customer_name}!`);
      setActiveRequest(null);
      setTimeout(() => setQuoteSuccess(null), 4000);
      await fetchRequests();
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to send service quote.');
      }
    } finally {
      setSubmittingQuote(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            Service Requests & Quote Inbox
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Review incoming job requests from local customers, send binding quotes, and win service contracts.
          </p>
        </div>

        {/* Merchant notification center */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotificationOpen((value) => !value)}
            aria-label={unreadNotifications ? `Service request notifications, ${unreadNotifications} unread` : 'Service request notifications'}
            aria-expanded={notificationOpen}
            className="relative inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifications > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] leading-4 text-center font-black">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
          </button>
          {notificationOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotificationOpen(false)} />
              <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] z-50 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-white">Request notifications</p>
                    <p className="text-[10px] text-slate-500">{unreadNotifications ? `${unreadNotifications} unread` : 'All caught up'}</p>
                  </div>
                  <button type="button" onClick={() => void markAllMerchantNotificationsRead()} disabled={!unreadNotifications} className="text-[10px] font-bold text-indigo-600 disabled:text-slate-300">Mark all read</button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notificationLoading && notifications.length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-slate-500">Loading notifications…</p>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center"><Bell className="w-6 h-6 mx-auto text-slate-300" /><p className="mt-2 text-xs font-bold text-slate-500">No request notifications</p></div>
                  ) : notifications.map((notification) => (
                    <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 ${notification.read_at ? '' : 'bg-indigo-50/60 dark:bg-indigo-950/20'}`}>
                      <div className="flex gap-2.5">
                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${notification.read_at ? 'bg-slate-200' : 'bg-indigo-500'}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-800 dark:text-slate-100">{notification.title}</p>
                          <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400 line-clamp-2">{notification.message}</p>
                          <p className="mt-1 text-[10px] text-slate-400">{notificationAge(notification.created_at)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void refreshInbox()} disabled={refreshing || loading} className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-50 flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {['ALL', 'MATCHED', 'QUOTED', 'ACCEPTED', 'CLOSED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                filterStatus === st
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        {lastLoadedAt && <p className="text-[10px] text-slate-400 sm:col-span-2">Updated {lastLoadedAt.toLocaleTimeString()}</p>}
      </div>

      {/* Notifications */}
      {quoteSuccess && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{quoteSuccess}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Requests Stream */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-xs gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading service inquiry inbox...
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 mx-auto flex items-center justify-center mb-3">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">No active quote requests</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            When nearby customers submit custom job requests matching your service categories and service radius, they will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    Status: {req.status}
                  </span>
                  {req.match_reason && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      Match: {String(req.match_reason).replace(/_/g, ' ').toLowerCase().replace(/^./, (ch) => ch.toUpperCase())}
                    </span>
                  )}
                  {req.match_score != null && (
                    <span className="text-[10px] font-semibold text-slate-400">
                      Relevance {Math.round(Number(req.match_score) * 100)}%
                    </span>
                  )}
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {req.customer_name}
                  </span>
                </div>

                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {req.description}
                </p>
                {req.status === 'ACCEPTED' && (
                  <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Customer accepted a quote — proceed with the engagement.
                  </div>
                )}
                {req.status === 'CLOSED' && <div className="text-xs font-semibold text-slate-500">This service engagement is closed.</div>}

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-1">
                  {req.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {req.city} {req.district ? `(${req.district})` : ''}
                    </span>
                  )}
                  {req.preferred_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Needed by: {new Date(req.preferred_date).toLocaleDateString()}
                    </span>
                  )}
                  {(req.budget_from || req.budget_to) && (
                    <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                      <Banknote className="w-3.5 h-3.5" />
                      Budget: SLE {req.budget_from || 0} - {req.budget_to || 'Flexible'}
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleOpenDetails(req)}
                  className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold"
                >
                  View Request
                </button>
                {req.status === 'MATCHED' && (
                  <button
                    type="button"
                    onClick={() => handleOpenQuoteModal(req)}
                    className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Quote</span>
                  </button>
                )}
                {req.status === 'ACCEPTED' && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await discoveryApi.closeServiceRequest(req.id, 'Provider completed the service engagement.', business.id);
                        await fetchRequests();
                      } catch (err: unknown) {
                        setError(err instanceof DiscoveryApiError ? err.message : 'Unable to close the request.');
                      }
                    }}
                    className="px-5 py-2.5 rounded-2xl border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-bold"
                  >
                    Mark Closed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Request Details Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-600">Incoming service request</p>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedRequest.customer_name}</h3>
              </div>
              <button type="button" onClick={() => setSelectedRequest(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mb-5">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                <p className="text-[10px] font-bold uppercase text-slate-400">Status</p>
                <p className="text-sm font-bold mt-1">{selectedRequest.status}</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                <p className="text-[10px] font-bold uppercase text-slate-400">Match</p>
                <p className="text-sm font-bold mt-1">{selectedRequest.match_score != null ? Math.round(Number(selectedRequest.match_score) * 100) + '%' : 'Matched provider'}</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                <p className="text-[10px] font-bold uppercase text-slate-400">Location</p>
                <p className="text-sm font-semibold mt-1">{[selectedRequest.city, selectedRequest.district, selectedRequest.region].filter(Boolean).join(', ') || 'Not specified'}</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                <p className="text-[10px] font-bold uppercase text-slate-400">Preferred date</p>
                <p className="text-sm font-semibold mt-1">{selectedRequest.preferred_date ? new Date(selectedRequest.preferred_date).toLocaleDateString() : 'Flexible'}</p>
              </div>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 mb-5">
              <p className="text-xs font-bold text-slate-500 mb-3">Your quote history</p>
              {selectedRequest.quotes?.filter((quote) => quote.business_id === business.id).length ? (
                <div className="space-y-2">
                  {selectedRequest.quotes.filter((quote) => quote.business_id === business.id).map((quote) => (
                    <div key={quote.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <div>
                        <p className="text-sm font-bold">{quote.currency} {Number(quote.amount).toLocaleString()}</p>
                        <p className="text-[11px] text-slate-500">{quote.service_name || 'Service quote'}{quote.created_at ? ` • ${new Date(quote.created_at).toLocaleDateString()}` : ''}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${quote.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-700' : quote.status === 'SUBMITTED' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{quote.status}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No quote submitted by your business yet.</p>
              )}
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 mb-5">
              <p className="text-xs font-bold text-slate-500 mb-2">Customer requirements</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{selectedRequest.description}</p>
              {(selectedRequest.budget_from || selectedRequest.budget_to) && (
                <p className="text-xs font-semibold text-emerald-600 mt-3">Budget: SLE {selectedRequest.budget_from || 0} — {selectedRequest.budget_to || 'Flexible'}</p>
              )}
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 mb-5">
              <p className="text-xs font-bold text-slate-500 mb-3">Request timeline</p>
              {selectedRequest.events?.length ? (
                <div className="space-y-3">
                  {selectedRequest.events.map((event) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="mt-1 h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          {String(event.event_type || 'STATUS_CHANGED').replace(/_/g, ' ')}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {event.from_status ? `${event.from_status} → ${event.to_status}` : event.to_status}
                          {event.created_at ? ` • ${new Date(event.created_at).toLocaleString()}` : ''}
                        </p>
                        {event.note && <p className="text-[11px] text-slate-500 mt-1">{event.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No lifecycle events recorded yet.</p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {selectedRequest.match_reason ? `Matched because: ${String(selectedRequest.match_reason).replace(/_/g, ' ').toLowerCase()}` : 'Matched to your business services.'}
              </div>
              {selectedRequest.status === 'MATCHED' && (
                <button type="button" onClick={() => { setSelectedRequest(null); handleOpenQuoteModal(selectedRequest); }} className="px-5 py-2.5 rounded-2xl bg-indigo-600 text-white text-xs font-bold flex items-center gap-2">
                  <Send className="w-3.5 h-3.5" /> Send Quote
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quote Composer Modal */}
      {activeRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl custom-scrollbar">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-indigo-600" />
                Submit Quote to {activeRequest.customer_name}
              </h3>
              <button
                type="button"
                onClick={() => setActiveRequest(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 mt-4 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-900 dark:text-white block mb-1">Customer Need:</span>
              <p>{activeRequest.description}</p>
            </div>

            <form onSubmit={handleSendQuote} className="space-y-4 mt-4">
              {businessServices.length > 0 && (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Service</label>
                  <select value={selectedServiceId} onChange={(e) => setSelectedServiceId(e.target.value)} className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs">
                    <option value="">Select a service (optional)</option>
                    {businessServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Quote Amount (SLE) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={quoteForm.amount}
                    onChange={(e) => setQuoteForm({ ...quoteForm, amount: e.target.value })}
                    placeholder="250.00"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Estimated Duration (Mins)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quoteForm.estimatedDurationMinutes}
                    onChange={(e) => setQuoteForm({ ...quoteForm, estimatedDurationMinutes: e.target.value })}
                    placeholder="120"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Quote Valid Until
                </label>
                <input
                  type="date"
                  value={quoteForm.validUntil}
                  onChange={(e) => setQuoteForm({ ...quoteForm, validUntil: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Proposal Message / Terms
                </label>
                <textarea
                  rows={4}
                  value={quoteForm.message}
                  onChange={(e) => setQuoteForm({ ...quoteForm, message: e.target.value })}
                  placeholder="Explain what materials, warranty, or timeline you offer..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveRequest(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingQuote}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm"
                >
                  {submittingQuote ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{submittingQuote ? 'Sending...' : 'Deliver Quote'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
