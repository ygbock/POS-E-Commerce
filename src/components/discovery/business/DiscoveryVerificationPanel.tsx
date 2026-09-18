import React, { useState } from 'react';
import {
  ShieldCheck,
  Award,
  FileCheck,
  Building,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  RefreshCw,
  Info,
} from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type { DiscoveryBusiness } from '../../../types/discovery';
import { VerificationBadge } from '../VerificationBadge';

interface DiscoveryVerificationPanelProps {
  business: DiscoveryBusiness;
  onUpdate: (updated: DiscoveryBusiness) => void;
}

export const DiscoveryVerificationPanel: React.FC<DiscoveryVerificationPanelProps> = ({
  business,
  onUpdate,
}) => {
  const [claimType, setClaimType] = useState<string>('BUSINESS_REGISTRATION');
  const [evidenceNote, setEvidenceNote] = useState<string>('');
  const [documentUrl, setDocumentUrl] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isVerified = business.verification_status === 'VERIFIED';
  const isPending = business.verification_status === 'PENDING';

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (!evidenceNote.trim()) {
        throw new Error('Please provide supporting details or registration number for verification.');
      }

      await discoveryApi.createClaim(business.id, {
        claimantName: business.name,
        evidence: {
          claimType,
          note: evidenceNote.trim(),
          documentUrl: documentUrl.trim() || undefined,
        },
      });

      setSuccess('Verification request submitted successfully. Our compliance team will review your business credentials.');
      onUpdate({ ...business, verification_status: 'PENDING' });
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to submit verification claim.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Status Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              Business Verification & Trust Seal
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Verified businesses receive official discovery badges, priority search ranking, and heightened customer trust.
            </p>
          </div>
          <VerificationBadge status={business.verification_status} />
        </div>

        {/* Status explanation */}
        <div className="mt-6">
          {isVerified ? (
            <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                  Business is Verified & Authenticated
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1 leading-relaxed">
                  Your business holds the verified merchant checkmark on all public discovery cards, search results, and map views.
                </p>
              </div>
            </div>
          ) : isPending ? (
            <div className="p-6 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100">
                  Verification Review In Progress
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
                  Our verification reviewers are actively validating your business registration and identity documents. You will be notified once verified.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-indigo-950 dark:text-indigo-100">
                  Unlock Verified Status for Your Business
                </h3>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1 leading-relaxed">
                  Submit proof of commercial registration, tax identification, or physical storefront lease to get the official verified seal.
                </p>
              </div>
            </div>
          )}
        </div>
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

      {/* Submission Form (if not verified) */}
      {!isVerified && !isPending && (
        <form
          onSubmit={handleSubmitClaim}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
        >
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-indigo-600" />
              Submit Verification Credentials
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Provide your official business registration certificate, local council license, or utility bill.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Verification Document Type
              </label>
              <select
                value={claimType}
                onChange={(e) => setClaimType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="BUSINESS_REGISTRATION">Corporate Affairs Commission (CAC) Registration</option>
                <option value="LOCAL_COUNCIL_LICENSE">City / Local Council Commercial License</option>
                <option value="TIN_CERTIFICATE">NRA / Taxpayer Identification Number (TIN)</option>
                <option value="UTILITY_BILL">Commercial Storefront Utility / Lease Document</option>
                <option value="GOVERNMENT_ID">Authorized Director National ID / Passport</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Registration Number / Details <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                placeholder="Enter your certificate number, date of registration, and authorized contact name..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Document / Scan Cloud URL (Optional)
              </label>
              <input
                type="url"
                value={documentUrl}
                onChange={(e) => setDocumentUrl(e.target.value)}
                placeholder="https://drive.google.com/... or https://..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95"
            >
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>{submitting ? 'Submitting Application...' : 'Submit Verification Request'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
