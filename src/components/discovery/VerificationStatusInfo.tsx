import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, Clock3, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { DiscoveryVerificationStatus } from '../../types/discovery';

interface VerificationStatusInfoProps {
  status?: DiscoveryVerificationStatus | string | null;
  className?: string;
}

const copy: Record<string, { title: string; description: string; detail: string }> = {
  VERIFIED: { title: 'Verified business', description: 'AbaCha has completed a verification review for this business.', detail: 'Verification confirms that the submitted business evidence was reviewed by an authorized platform moderator. It does not guarantee the quality, pricing, availability, or future conduct of the business.' },
  PENDING: { title: 'Verification in progress', description: 'This business has submitted a verification application that is currently under review.', detail: 'The verification badge may change after the platform completes its review. A pending status is not a verification result.' },
  REJECTED: { title: 'Verification not approved', description: 'A submitted verification application was not approved.', detail: 'This status does not by itself mean the business is illegitimate. It means the submitted application did not satisfy the platform’s verification decision at that time.' },
  UNVERIFIED: { title: 'Not verified', description: 'AbaCha has not completed a verification review for this business.', detail: 'The absence of a verification badge is not a claim about the business. Customers should use the available business information, reviews, contact details, and other relevant signals when evaluating a listing.' },
};

const icons: Record<string, React.ComponentType<{ className?: string }>> = { VERIFIED: ShieldCheck, PENDING: Clock3, REJECTED: ShieldAlert, UNVERIFIED: ShieldQuestion };

export const VerificationStatusInfo: React.FC<VerificationStatusInfoProps> = ({ status, className = '' }) => {
  const [open, setOpen] = useState(false);
  const normalized = String(status || 'UNVERIFIED').toUpperCase();
  const value = copy[normalized] || copy.UNVERIFIED;
  const Icon = icons[normalized] || ShieldQuestion;

  return (
    <div className={'relative inline-flex ' + className}>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={'Explain verification status: ' + value.title} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 shadow-sm">
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        <span>About verification</span>
        <ChevronDown className={'w-3 h-3 transition-transform ' + (open ? 'rotate-180' : '')} aria-hidden="true" />
      </button>
      {open && (
        <div role="dialog" aria-label={value.title} className="absolute z-30 left-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <Icon className="w-4 h-4 mt-1 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white">{value.title}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{value.description}</p>
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{value.detail}</div>
          {normalized === 'VERIFIED' && <div className="mt-3 flex items-start gap-2 text-[10px] text-slate-500 dark:text-slate-400"><CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span>Verification is a point-in-time platform status and can be changed after later review.</span></div>}
        </div>
      )}
    </div>
  );
};
