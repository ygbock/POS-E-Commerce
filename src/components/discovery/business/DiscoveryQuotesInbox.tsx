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

  useEffect(() => {
    void fetchRequests();
  }, [business.id, filterStatus]);

  const handleOpenQuoteModal = (req: DiscoveryServiceRequest) => {
    setActiveRequest(req);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7);
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

        {/* Filter Tabs */}
        <div className="flex items-center gap-2">
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
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {req.customer_name}
                  </span>
                </div>

                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {req.description}
                </p>

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
