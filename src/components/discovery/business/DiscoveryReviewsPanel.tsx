import React, { useState, useEffect } from 'react';
import {
  Star,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ThumbsUp,
  MessageSquare,
  Calendar,
  User,
  Filter,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type {
  DiscoveryBusiness,
  DiscoveryReview,
  DiscoveryReviewsSummary,
} from '../../../types/discovery';
import { DiscoveryRating } from '../DiscoveryRating';

interface DiscoveryReviewsPanelProps {
  business: DiscoveryBusiness;
}

export const DiscoveryReviewsPanel: React.FC<DiscoveryReviewsPanelProps> = ({
  business,
}) => {
  const [reviews, setReviews] = useState<DiscoveryReview[]>([]);
  const [summary, setSummary] = useState<DiscoveryReviewsSummary>({ rating: 0, count: 0 });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [responseBusy, setResponseBusy] = useState<string | null>(null);

  const fetchReviews = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await discoveryApi.getBusinessReviews(business.id);
      setReviews(response.data || []);
      setSummary(response.summary || { rating: 0, count: 0 });
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setError(err.message);
      } else {
        setError('Failed to load reviews.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReviews();
  }, [business.id]);

  const filteredReviews = reviews.filter((r) => {
    if (starFilter != null && r.rating !== starFilter) return false;
    return true;
  });

  const numericRating = typeof summary.rating === 'string' ? parseFloat(summary.rating) || 0 : summary.rating || 0;

  return (
    <div className="space-y-6">
      {/* Header & Overall Rating Summary */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
              Customer Reviews & Reputation
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Public feedback and verified buyer ratings build trust and improve your local discovery ranking.
            </p>
          </div>

          {/* Rating Snapshot Banner */}
          <div className="flex items-center gap-4 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 p-4 rounded-2xl">
            <div className="text-3xl font-extrabold text-amber-950 dark:text-amber-100 font-mono">
              {numericRating > 0 ? numericRating.toFixed(1) : '0.0'}
            </div>
            <div>
              <DiscoveryRating rating={numericRating} count={summary.count} />
              <span className="text-[11px] text-amber-800 dark:text-amber-300 font-semibold block mt-0.5">
                {summary.count} customer {summary.count === 1 ? 'review' : 'reviews'}
              </span>
            </div>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-2 pt-4 flex-wrap">
          <span className="text-xs font-bold text-slate-500 mr-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            Filter by Stars:
          </span>
          <button
            type="button"
            onClick={() => setStarFilter(null)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
              starFilter === null
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            All Reviews
          </button>
          {[5, 4, 3, 2, 1].map((stars) => (
            <button
              key={stars}
              type="button"
              onClick={() => setStarFilter(stars)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1 ${
                starFilter === stars
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span>{stars}</span>
              <Star className="w-3 h-3 fill-current" />
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Reviews List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-xs gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading customer feedback...
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 mx-auto flex items-center justify-center mb-3">
            <Star className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {starFilter != null ? `No ${starFilter}-star reviews found` : 'No reviews received yet'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Customers will be able to review your business after discovering your listing or completing an order.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReviews.map((rev) => (
            <div
              key={rev.id}
              className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs flex items-center justify-center">
                    {rev.reviewer_name?.slice(0, 1).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      {rev.reviewer_name}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3 h-3 ${
                              i < rev.rating
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-200 dark:text-slate-700'
                            }`}
                          />
                        ))}
                      </div>
                      {rev.verified_purchase && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="w-3 h-3" />
                          Verified Order
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <span className="text-[11px] text-slate-400 font-mono">
                  {new Date(rev.created_at).toLocaleDateString()}
                </span>
              </div>

              {rev.title && (
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {rev.title}
                </h4>
              )}

              {rev.body && (
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {rev.body}
                </p>
              )}

              <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                  Merchant response
                </div>
                {rev.merchant_response && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{rev.merchant_response}</p>
                )}
                <textarea
                  value={responseDrafts[rev.id] ?? rev.merchant_response ?? ''}
                  onChange={(e) => setResponseDrafts((prev) => ({ ...prev, [rev.id]: e.target.value }))}
                  maxLength={5000}
                  rows={3}
                  placeholder="Thank the customer or address their feedback…"
                  className="mt-3 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                  aria-label={`Response to review by ${rev.reviewer_name}`}
                />
                <div className="mt-2 flex justify-end gap-2">
                  {rev.merchant_response && (
                    <button type="button" disabled={responseBusy === rev.id} onClick={async () => {
                      setResponseBusy(rev.id);
                      try { await discoveryApi.deleteReviewResponse(business.id, rev.id); await fetchReviews(); setResponseDrafts((p) => ({...p,[rev.id]:''})); }
                      catch (err) { setError(err instanceof DiscoveryApiError ? err.message : 'Unable to delete response.'); }
                      finally { setResponseBusy(null); }
                    }} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold">Delete</button>
                  )}
                  <button type="button" disabled={responseBusy === rev.id || !(responseDrafts[rev.id] ?? rev.merchant_response ?? '').trim()} onClick={async () => {
                    const response=(responseDrafts[rev.id] ?? rev.merchant_response ?? '').trim();
                    setResponseBusy(rev.id);
                    try { await discoveryApi.respondToReview(business.id, rev.id, response); await fetchReviews(); }
                    catch (err) { setError(err instanceof DiscoveryApiError ? err.message : 'Unable to save response.'); }
                    finally { setResponseBusy(null); }
                  }} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold disabled:opacity-50">
                    {responseBusy === rev.id ? 'Saving…' : rev.merchant_response ? 'Update Response' : 'Respond'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
