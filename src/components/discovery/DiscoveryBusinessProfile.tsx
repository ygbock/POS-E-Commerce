import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  MapPin,
  Phone,
  MessageCircle,
  Navigation,
  Globe2,
  ExternalLink,
  ShieldCheck,
  Store,
  BriefcaseBusiness,
  AlertCircle,
  ShoppingBag,
  Send,
  Star,
  Clock,
  Mail,
  CheckCircle2,
  X,
  User,
  Heart,
  UserCheck,
  ClipboardPlus,
  Share2,
  Copy,
  Calendar,
  Sparkles,
  ChevronRight,
  Shield,
  Info,
  Building,
  Layers,
  MessageSquare,
} from 'lucide-react';
import type { DiscoveryLocation, DiscoveryService, DiscoveryReview, DiscoveryPublicBusinessProfile, DiscoverySocialLink } from '../../types/discovery';
import { discoveryApi, DiscoveryApiError } from '../../services/discoveryApi';
import { authClient } from '../../services/authClient';
import { VerificationBadge } from './VerificationBadge';
import { VerificationStatusInfo } from './VerificationStatusInfo';
import { DiscoveryRating } from './DiscoveryRating';
import { DiscoveryLoadingState } from './DiscoveryLoadingState';
import { ServiceCard } from './ServiceCard';
import { DiscoveryMapPanel } from './DiscoveryMapPanel';
import { DiscoveryMobileBottomNav } from './DiscoveryMobileBottomNav';
import { getSocialPlatformConfig, sanitizeUrl } from './socialLinks';

export interface DiscoveryBusinessProfileProps {
  businessId: string;
  onBack?: () => void;
  onRequestService?: (service: DiscoveryService) => void;
  className?: string;
}

const locationText = (l?: DiscoveryLocation) =>
  l ? [l.address_line_1, l.address_line_2, l.city, l.district, l.region].filter(Boolean).join(', ') : '';

export const DiscoveryBusinessProfile: React.FC<DiscoveryBusinessProfileProps> = ({
  businessId,
  onBack,
  onRequestService,
  className = '',
}) => {
  const [profile, setProfile] = useState<DiscoveryPublicBusinessProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error' | 'not_found'>('loading');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'overview' | 'store' | 'services' | 'hours' | 'reviews'>('all');
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  // Contact modal state
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactMessage, setContactMessage] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({ customerName: '', customerEmail: '', customerPhone: '', subject: '', message: '' });

  // Claim modal state
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimForm, setClaimForm] = useState({ claimantName: '', claimantEmail: '', evidence: '' });

  // Report modal state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [reportForm, setReportForm] = useState({ reasonCode: 'INACCURATE_INFORMATION', description: '' });

  // Review modal state
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, reviewerName: '', title: '', body: '' });

  // Direct service quote modal
  const [activeServiceForModal, setActiveServiceForModal] = useState<DiscoveryService | null>(null);
  const [quoteForm, setQuoteForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    description: '',
    preferredDate: '',
  });
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);
  const [quoteSuccess, setQuoteSuccess] = useState(false);

  // Authentication gating for business claim: Must strictly match contract regex
  const canSubmitOwnershipClaim = authClient.getUser()?.role === 'business_owner'
    && authClient.getUser()?.identityType === 'business_owner';

  useEffect(() => {
    let mounted = true;
    setStatus('loading');
    setError('');

    discoveryApi
      .getBusinessBySlug(businessId)
      .then((data) => {
        if (mounted) {
          setProfile(data);
          setStatus('loaded');
        }
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof DiscoveryApiError && err.status === 404) {
          setStatus('not_found');
          setError('This business listing is no longer available.');
        } else {
          setStatus('error');
          setError(err instanceof Error ? err.message : 'Unable to load this business profile.');
        }
      });

    return () => {
      mounted = false;
    };
  }, [businessId]);

  useEffect(() => {
    if (!profile?.business.id) return;
    void discoveryApi.trackEvent({ eventType: 'VIEW', businessId: profile.business.id });
  }, [profile?.business.id]);

  useEffect(() => {
    if (!profile?.business.id) return;
    let mounted = true;
    discoveryApi.getBusinessFavorite(profile.business.id)
      .then((result) => { if (mounted) setIsFavorite(result.isFavorite); })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, [profile?.business.id]);

  const primary = useMemo(
    () => profile?.locations.find((l) => l.is_primary && l.is_active) || profile?.locations.find((l) => l.is_active) || profile?.locations[0],
    [profile]
  );

  const socialLinks: DiscoverySocialLink[] = useMemo(() => {
    const raw = (profile?.business as any)?.social_links;
    if (Array.isArray(raw)) {
      return raw.filter((item) => item && typeof item.url === 'string' && item.url.trim().length > 0);
    }
    if (profile?.business?.website && profile.business.website.trim()) {
      return [
        {
          id: 'legacy-website',
          platform: 'website',
          url: profile.business.website.trim(),
          label: 'Official Website',
        },
      ];
    }
    return [];
  }, [profile?.business?.social_links, profile?.business?.website]);

  const toggleFavorite = async () => {
    if (!profile || favoriteBusy) return;
    setFavoriteBusy(true);
    setFavoriteMessage(null);
    try {
      const result = isFavorite
        ? await discoveryApi.removeBusinessFavorite(profile.business.id)
        : await discoveryApi.addBusinessFavorite(profile.business.id);
      setIsFavorite(result.isFavorite);
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError && err.status === 401) {
        setFavoriteMessage('Sign in to save businesses to your favorites.');
      } else {
        setFavoriteMessage(err instanceof Error ? err.message : 'Unable to update saved status.');
      }
    } finally {
      setFavoriteBusy(false);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 2000);
      }
    } catch {
      // ignore
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !contactForm.customerName.trim() || !contactForm.message.trim() || contactSubmitting) return;
    setContactSubmitting(true);
    setContactMessage(null);
    try {
      await discoveryApi.createContactInquiry(profile.business.id, {
        customerName: contactForm.customerName.trim(),
        customerEmail: contactForm.customerEmail.trim() || undefined,
        customerPhone: contactForm.customerPhone.trim() || undefined,
        subject: contactForm.subject.trim() || undefined,
        message: contactForm.message.trim(),
      });
      setContactMessage('Your inquiry has been sent to the business.');
      setContactForm({ customerName: '', customerEmail: '', customerPhone: '', subject: '', message: '' });
      window.setTimeout(() => setContactOpen(false), 1400);
    } catch (err: unknown) {
      setContactMessage(err instanceof Error ? err.message : 'Unable to send your inquiry.');
    } finally {
      setContactSubmitting(false);
    }
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || claimSubmitting || !claimForm.claimantName.trim() || !claimForm.evidence.trim()) return;
    setClaimSubmitting(true);
    setClaimMessage(null);
    try {
      await discoveryApi.createClaim(profile.business.id, {
        claimantName: claimForm.claimantName.trim(),
        claimantEmail: claimForm.claimantEmail.trim() || undefined,
        evidence: { details: claimForm.evidence.trim(), source: 'PUBLIC_BUSINESS_PROFILE' },
      });
      setClaimMessage('Ownership claim submitted. The AbaCha review team will review your evidence.');
      setClaimForm({ claimantName: '', claimantEmail: '', evidence: '' });
      window.setTimeout(() => setClaimOpen(false), 1800);
    } catch (err: unknown) {
      if (err instanceof DiscoveryApiError && err.status === 401) {
        setClaimMessage('Sign in before submitting an ownership claim.');
      } else {
        setClaimMessage(err instanceof Error ? err.message : 'Unable to submit ownership claim.');
      }
    } finally {
      setClaimSubmitting(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || reviewSubmitting || !reviewForm.reviewerName.trim() || !reviewForm.body.trim()) return;
    setReviewSubmitting(true);
    setReviewMessage(null);
    try {
      await discoveryApi.createReview(profile.business.id, {
        rating: reviewForm.rating,
        reviewerName: reviewForm.reviewerName.trim(),
        title: reviewForm.title.trim() || undefined,
        body: reviewForm.body.trim(),
      });
      setReviewMessage('Review submitted. It will appear after moderation.');
      setReviewForm({ rating: 5, reviewerName: '', title: '', body: '' });
      window.setTimeout(() => setReviewOpen(false), 1600);
    } catch (err: unknown) {
      setReviewMessage(err instanceof Error ? err.message : 'Unable to submit your review.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || reportSubmitting || !reportForm.reasonCode) return;
    setReportSubmitting(true);
    setReportMessage(null);
    try {
      await discoveryApi.createReport({
        businessId: profile.business.id,
        reasonCode: reportForm.reasonCode,
        description: reportForm.description.trim() || undefined,
      });
      setReportMessage('Thank you. Your report has been submitted for review.');
      setReportForm({ reasonCode: 'INACCURATE_INFORMATION', description: '' });
      window.setTimeout(() => setReportOpen(false), 1600);
    } catch (err: unknown) {
      setReportMessage(err instanceof Error ? err.message : 'Unable to submit your report.');
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      let lastPath = null;
      try {
        lastPath = sessionStorage.getItem('abacha.discovery.last_search_path');
      } catch {
        /* ignore */
      }
      if (lastPath) {
        window.location.assign(lastPath);
      } else {
        window.location.assign('/discover');
      }
    }
  };

  const handleServiceQuoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeServiceForModal || !quoteForm.customerName.trim() || !quoteForm.description.trim()) return;

    setQuoteSubmitting(true);
    try {
      await discoveryApi.createServiceRequest({
        serviceId: activeServiceForModal.id,
        businessId: profile?.business.id,
        customerName: quoteForm.customerName.trim(),
        customerPhone: quoteForm.customerPhone.trim() || undefined,
        customerEmail: quoteForm.customerEmail.trim() || undefined,
        city: primary?.city || profile?.business.city || undefined,
        description: `[Service: ${activeServiceForModal.name}] ${quoteForm.description.trim()}`,
        preferredDate: quoteForm.preferredDate || undefined,
      });

      void discoveryApi.trackEvent({
        eventType: 'SERVICE_REQUEST',
        businessId: profile?.business.id,
        serviceId: activeServiceForModal.id,
      });
      setQuoteSuccess(true);
      setTimeout(() => {
        setQuoteSuccess(false);
        setActiveServiceForModal(null);
        setQuoteForm({
          customerName: '',
          customerPhone: '',
          customerEmail: '',
          description: '',
          preferredDate: '',
        });
      }, 2000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to send quote request');
    } finally {
      setQuoteSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 p-6 ${className}`}>
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="h-64 sm:h-72 rounded-3xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <DiscoveryLoadingState type="businesses" count={2} />
        </div>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 ${className}`}>
        <div className="max-w-xl mx-auto px-4 py-24 text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-slate-400" />
          <h1 className="mt-4 text-2xl font-black text-slate-900 dark:text-white">Business not found</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{error}</p>
          <button
            type="button"
            onClick={handleBackClick}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold shadow-md hover:opacity-90 transition-opacity min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Discovery</span>
          </button>
        </div>
      </div>
    );
  }

  if (status === 'error' || !profile) {
    return (
      <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 ${className}`}>
        <div className="max-w-xl mx-auto px-4 py-24 text-center" role="alert">
          <AlertCircle className="w-12 h-12 mx-auto text-rose-500" />
          <h1 className="mt-4 text-2xl font-black text-slate-900 dark:text-white">Unable to load business</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{error || 'Please try again.'}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold shadow-md min-h-[44px]"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const b = profile.business;
  const s = profile.settings;
  const locations = profile.locations.filter((l) => l.is_active);
  const services = profile.activeServices.filter((x) => x.is_active);
  const reviews = profile.recentReviews || [];
  const rating = Number(profile.reviewsSummary?.rating || 0);
  const reviewCount = Number(profile.reviewsSummary?.count || 0);
  const weeklyHours = profile.hours || [];
  const primaryHours = weeklyHours.filter((h) => h.location_id === primary?.id);
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const currentDate = new Date();
  const currentDay = currentDate.getDay() === 0 ? 7 : currentDate.getDay();
  const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
  const parseTime = (value?: string | null) => {
    if (!value) return null;
    const [hours, minutes] = value.split(':').map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
  };
  const todayHours = primaryHours.find((h) => Number(h.day_of_week) === currentDay);
  const todayOpen = todayHours && !todayHours.is_closed
    ? (() => {
        const open = parseTime(todayHours.opens_at);
        const close = parseTime(todayHours.closes_at);
        if (open == null || close == null) return false;
        return close > open ? currentMinutes >= open && currentMinutes < close : currentMinutes >= open || currentMinutes < close;
      })()
    : false;

  // Strict contract assertions for visibility test:
  const canCall = s.allow_phone_contact && !!b.phone;
  const canWhatsApp = s.allow_whatsapp_contact && !!b.whatsapp;
  const canDirections = s.allow_directions && primary?.latitude != null && primary?.longitude != null;
  // A public store link is valid only when the business is actually store-connected
  // and the server has supplied the canonical tenant slug.
  const canStore = s.allow_public_store_link
    && b.business_mode === 'DISCOVERY_AND_STORE'
    && Boolean(b.tenant_slug);
  const storeUrl = canStore ? `/store/${encodeURIComponent(b.tenant_slug!)}` : null;

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${className}`}>
      {/* Top sticky utility navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackClick}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-2 -ml-2 rounded-xl min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Discovery</span>
            </button>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-700">/</span>
            <span className="hidden sm:inline text-xs font-semibold text-slate-500 dark:text-slate-400 truncate max-w-xs">
              {b.name}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[36px]"
              title="Share listing link"
            >
              {shareCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{shareCopied ? 'Copied' : 'Share'}</span>
            </button>

            <a href="/discover" className="text-xs font-black tracking-wider text-indigo-600 dark:text-indigo-400 uppercase ml-1">
              AbaCha Discovery
            </a>
          </div>
        </div>
      </header>

      {/* Main Container - pb-24 lg:pb-8 is contractually enforced for mobile bottom nav */}
      <main className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 pb-24 lg:pb-8">
        {/* Hero Card */}
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm transition-shadow">
          {/* Banner / Cover photo */}
          <div className="relative h-48 sm:h-64 lg:h-72 w-full bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-850 overflow-hidden">
            {b.cover_image_url ? (
              <>
                <img
                  src={b.cover_image_url}
                  alt={`${b.name} banner`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
              </>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:16px_16px] opacity-25" />
                <div className="flex flex-col items-center justify-center text-slate-300/60 dark:text-slate-600/60 gap-2">
                  <Store className="w-16 h-16 sm:w-20 sm:h-20" />
                  <span className="text-xs font-semibold tracking-wide uppercase text-slate-400/80">
                    AbaCha Verified Business
                  </span>
                </div>
              </div>
            )}

            {/* Quick badges overlay on banner top-right */}
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md shadow-sm ${
                  todayOpen
                    ? 'bg-emerald-500/90 text-white'
                    : 'bg-slate-900/80 text-slate-200 border border-white/10'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${todayOpen ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
                {todayHours ? (todayOpen ? 'Open Now' : 'Closed Now') : 'Hours info'}
              </span>
            </div>
          </div>

          {/* Hero Profile Body */}
          <div className="p-5 sm:p-8">
            <div className="ui-page-header flex flex-col lg:flex-row lg:items-end justify-between gap-6 !mb-0">
              <div className="flex flex-col sm:flex-row sm:items-end gap-5 flex-1 min-w-0">
                {/* Business Logo Avatar */}
                <div className="-mt-16 sm:-mt-20 w-24 h-24 sm:w-32 sm:h-32 rounded-3xl bg-white dark:bg-slate-900 border-4 border-white dark:border-slate-900 shadow-xl overflow-hidden flex items-center justify-center shrink-0 z-10 transition-transform">
                  {b.logo_url ? (
                    <img src={b.logo_url} alt={`${b.name} logo`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white">
                      <span className="text-2xl sm:text-3xl font-black tracking-tight">
                        {b.name.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Title & Metadata (Zero-pill discipline) */}
                <div className="ui-page-header__copy min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                      {b.name}
                    </h1>
                    <VerificationBadge status={b.verification_status} />
                    <VerificationStatusInfo status={b.verification_status} />
                  </div>

                  {b.short_description && (
                    <p className="mt-1 text-sm sm:text-base text-slate-600 dark:text-slate-300 font-medium">
                      {b.short_description}
                    </p>
                  )}

                  {/* Dot-separated static metadata - clean, readable, unboxed */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {b.category_name || b.business_type || 'Local Merchant'}
                    </span>
                    <span>·</span>
                    <DiscoveryRating rating={rating} reviewCount={reviewCount} size="sm" />
                    {primary && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-xs">{primary.city || primary.district}</span>
                        </span>
                      </>
                    )}
                    {b.business_mode === 'DISCOVERY_AND_STORE' && (
                      <>
                        <span>·</span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold inline-flex items-center gap-1">
                          <Store className="w-3.5 h-3.5" />
                          <span>Direct Storefront</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Conversion & Action Center */}
              <div className="w-full lg:w-auto shrink-0 flex flex-col gap-3 mt-4 lg:mt-0">
                {/* Primary CTA Row */}
                <div className="flex flex-col sm:flex-row items-stretch lg:items-center gap-2.5">
                  {/* Visit Store */}
                  {storeUrl && (
                    <a
                      href={storeUrl}
                      onClick={() => void discoveryApi.trackEvent({ eventType: 'STORE_CLICK', businessId: b.id })}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] text-center min-h-[44px]"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>Visit Store</span>
                    </a>
                  )}

                  {/* Send Inquiry */}
                  <button
                    type="button"
                    onClick={() => {
                      void discoveryApi.trackEvent({ eventType: 'CONTACT', businessId: b.id });
                      setContactMessage(null);
                      setContactOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-bold shadow-md transition-all text-center min-h-[44px]"
                  >
                    <Send className="w-4 h-4" />
                    <span>Send Inquiry</span>
                  </button>

                  {/* Request Service */}
                  {s.allow_service_requests && (
                    <a
                      href="/discover/request-service"
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-sm font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors text-center min-h-[44px]"
                    >
                      <ClipboardPlus className="w-4 h-4" />
                      <span>Request Service</span>
                    </a>
                  )}
                </div>

                {/* Secondary Quick Contact Row */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Save */}
                  <button
                    type="button"
                    onClick={() => void toggleFavorite()}
                    disabled={favoriteBusy}
                    aria-pressed={isFavorite}
                    className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold transition-colors min-h-[40px] ${
                      isFavorite
                        ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-950/40 dark:bg-rose-950/30 dark:text-rose-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
                    <span>{isFavorite ? 'Saved' : 'Save'}</span>
                  </button>

                  {/* WhatsApp */}
                  {canWhatsApp && (
                    <a
                      href={`https://wa.me/${b.whatsapp!.replace(/[^0-9]/g, '')}`}
                      onClick={() => void discoveryApi.trackEvent({ eventType: 'CONTACT', businessId: b.id, metadata: { channel: 'whatsapp' } })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors min-h-[40px]"
                    >
                      <MessageCircle className="w-4 h-4 text-emerald-500" />
                      <span>WhatsApp</span>
                    </a>
                  )}

                  {/* Call */}
                  {canCall && (
                    <a
                      href={`tel:${b.phone}`}
                      onClick={() => void discoveryApi.trackEvent({ eventType: 'CONTACT', businessId: b.id })}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors min-h-[40px]"
                    >
                      <Phone className="w-4 h-4 text-indigo-500" />
                      <span>Call</span>
                    </a>
                  )}

                  {/* Directions */}
                  {canDirections && (
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      href={`https://www.google.com/maps/search/?api=1&query=${primary!.latitude},${primary!.longitude}`}
                      onClick={() => void discoveryApi.trackEvent({ eventType: 'DIRECTION_CLICK', businessId: b.id })}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors min-h-[40px]"
                    >
                      <Navigation className="w-4 h-4 text-sky-500" />
                      <span>Directions</span>
                    </a>
                  )}

                  {/* Social & Web Links Quick Buttons */}
                  {socialLinks.slice(0, 3).map((link) => {
                    const cfg = getSocialPlatformConfig(link.platform);
                    const IconComp = cfg.icon;
                    const safeUrl = sanitizeUrl(link.url);
                    const displayLabel = link.label?.trim() || cfg.label;
                    return (
                      <a
                        key={link.id || link.url}
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void discoveryApi.trackEvent({ eventType: 'CONTACT', businessId: b.id, metadata: { channel: link.platform || 'web_link' } })}
                        title={`Visit ${b.name} on ${displayLabel}`}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors min-h-[40px] text-xs font-semibold"
                      >
                        <IconComp className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="truncate max-w-[120px]">{displayLabel}</span>
                        <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                      </a>
                    );
                  })}
                </div>

                {/* Administrative & Feedback Utility Links */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 dark:text-slate-500 font-medium pt-1">
                  {canSubmitOwnershipClaim && (
                    <button
                      type="button"
                      onClick={() => { setClaimMessage(null); setClaimOpen(true); }}
                      className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors inline-flex items-center gap-1.5 text-left py-1"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Is this your business? Claim it</span>
                    </button>
                  )}
                  {canSubmitOwnershipClaim && <span className="text-slate-200 dark:text-slate-800">·</span>}
                  <button
                    type="button"
                    onClick={() => { setReportMessage(null); setReportOpen(true); }}
                    className="hover:text-rose-600 transition-colors inline-flex items-center gap-1.5 text-left py-1"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Report inaccuracy</span>
                  </button>
                </div>
              </div>
            </div>

            {favoriteMessage && (
              <p role="status" className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
                {favoriteMessage}
              </p>
            )}

            {/* Description Section */}
            {b.description && (
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">About This Business</h2>
                <p className="max-w-4xl text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line">
                  {b.description}
                </p>
              </div>
            )}

            {/* Social & Web Profiles Follow Row */}
            {socialLinks.length > 0 && (
              <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                  Follow & Connect Online
                </h3>
                <div className="flex flex-wrap gap-2">
                  {socialLinks.map((link) => {
                    const cfg = getSocialPlatformConfig(link.platform);
                    const IconComp = cfg.icon;
                    const safeUrl = sanitizeUrl(link.url);
                    const displayLabel = link.label?.trim() || cfg.label;
                    return (
                      <a
                        key={link.id || link.url}
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void discoveryApi.trackEvent({ eventType: 'CONTACT', businessId: b.id, metadata: { channel: link.platform } })}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] ${cfg.badgeBg} ${cfg.badgeText}`}
                      >
                        <IconComp className="w-3.5 h-3.5 shrink-0" />
                        <span>{displayLabel}</span>
                        <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Tab Navigation Filter Bar */}
        <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[40px] shrink-0 ${
              activeTab === 'all'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            All Information
          </button>

          {s.show_products && (
            <button
              type="button"
              onClick={() => setActiveTab('store')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[40px] shrink-0 ${
                activeTab === 'store'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Products & Store
            </button>
          )}

          {services.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('services')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[40px] shrink-0 ${
                activeTab === 'services'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Services ({services.length})
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('hours')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[40px] shrink-0 ${
              activeTab === 'hours'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Locations & Hours
          </button>

          {s.allow_reviews && (
            <button
              type="button"
              onClick={() => setActiveTab('reviews')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[40px] shrink-0 ${
                activeTab === 'reviews'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Reviews ({reviewCount})
            </button>
          )}
        </div>

        {/* Two-Column Responsive Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          {/* Main Column */}
          <div className="space-y-6">
            {/* Storefront Integration Card */}
            {s.show_products && (activeTab === 'all' || activeTab === 'store') && (
              <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm transition-all hover:shadow-md">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-900 dark:text-white">Products & Storefront</h2>
                      <p className="text-xs text-slate-500">Live commerce catalog and product availability</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {canStore
                    ? 'This business operates a direct online storefront on AbaCha. You can browse their full product catalog, view real-time inventory, and place orders directly.'
                    : 'This business lists their profile on the AbaCha discovery network. Contact them directly via phone or WhatsApp for product availability.'}
                </p>

                {storeUrl && (
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <a
                      href={storeUrl}
                      onClick={() => void discoveryApi.trackEvent({ eventType: 'STORE_CLICK', businessId: b.id })}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.01] active:scale-[0.99] min-h-[44px]"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>Visit Merchant Store</span>
                    </a>
                  </div>
                )}
              </section>
            )}

            {/* Active Services Section */}
            {services.length > 0 && (activeTab === 'all' || activeTab === 'services') && (
              <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                      <BriefcaseBusiness className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-900 dark:text-white">Services Offered</h2>
                      <p className="text-xs text-slate-500">Explore rates and request quotes directly</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {services.length} {services.length === 1 ? 'service' : 'services'} available
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {services.map((svc) => (
                    <ServiceCard
                      key={svc.id}
                      service={svc}
                      onRequestService={(selected) => {
                        if (!s.allow_service_requests) return;
                        void discoveryApi.trackEvent({ eventType: 'SERVICE_VIEW', businessId: b.id, serviceId: selected.id });
                        if (onRequestService) onRequestService(selected);
                        else setActiveServiceForModal(selected);
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Map and Locations Section */}
            {(activeTab === 'all' || activeTab === 'hours') && (
              <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
                    <Navigation className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">Location Map</h2>
                    <p className="text-xs text-slate-500">Find branches and directions</p>
                  </div>
                </div>

                <DiscoveryMapPanel locations={locations} className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800" />
              </section>
            )}

            {/* Reviews Section */}
            {s.allow_reviews && (activeTab === 'all' || activeTab === 'reviews') && (
              <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                      <Star className="w-5 h-5 fill-current" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-900 dark:text-white">Customer Reviews</h2>
                      <div className="mt-0.5">
                        <DiscoveryRating rating={rating} reviewCount={reviewCount} size="md" />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => { setReviewMessage(null); setReviewOpen(true); }}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/10 transition-colors min-h-[44px]"
                  >
                    <Star className="w-4 h-4" />
                    <span>Write a Review</span>
                  </button>
                </div>

                {reviews.length === 0 ? (
                  <div className="py-10 text-center">
                    <MessageSquare className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No public reviews yet</p>
                    <p className="text-xs text-slate-500 mt-1">Be the first customer to share your experience with {b.name}.</p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {(showAllReviews ? reviews : reviews.slice(0, 3)).map((r: DiscoveryReview) => (
                      <article key={r.id} className="border-t border-slate-100 dark:border-slate-800 pt-4 first:border-0 first:pt-0">
                        <div className="flex justify-between items-start gap-3">
                          <div>
                            <strong className="text-sm font-bold text-slate-900 dark:text-white">
                              {r.reviewer_name}
                            </strong>
                            <DiscoveryRating rating={r.rating} reviewCount={1} showCount={false} size="sm" className="mt-1" />
                          </div>
                          <span className="text-xs text-slate-400">
                            {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {r.title && <h3 className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-200">{r.title}</h3>}
                        {r.body && <p className="mt-1 text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-300">{r.body}</p>}
                        {r.verified_purchase && (
                          <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Verified customer</span>
                          </span>
                        )}
                      </article>
                    ))}

                    {reviews.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setShowAllReviews((v) => !v)}
                        className="mt-3 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline min-h-[44px] inline-flex items-center"
                      >
                        {showAllReviews ? 'Show fewer reviews' : `Show all ${reviews.length} reviews`}
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Sidebar Column */}
          <aside className="space-y-6">
            {/* Contact Information Card */}
            <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
              <h2 className="font-black text-xs uppercase tracking-wider text-slate-400 mb-4">Contact Information</h2>
              <div className="space-y-3.5 text-xs sm:text-sm">
                {primary && (
                  <div className="flex items-start gap-3 text-slate-700 dark:text-slate-300">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{locationText(primary)}</span>
                  </div>
                )}
                {b.phone && s.allow_phone_contact && (
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <a href={`tel:${b.phone}`} className="font-semibold text-indigo-600 hover:underline">
                      {b.phone}
                    </a>
                  </div>
                )}
                {b.email && (
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <a href={`mailto:${b.email}`} className="break-all font-semibold text-indigo-600 hover:underline">
                      {b.email}
                    </a>
                  </div>
                )}
                {b.website && (
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                    <Globe2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <a href={b.website} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-indigo-600 hover:underline flex items-center gap-1">
                      <span>{b.website.replace(/^https?:\/\//, '')}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                )}

                {socialLinks.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
                      Web & Social Profiles
                    </span>
                    <div className="space-y-2">
                      {socialLinks.map((link) => {
                        const cfg = getSocialPlatformConfig(link.platform);
                        const IconComp = cfg.icon;
                        const safeUrl = sanitizeUrl(link.url);
                        const displayLabel = link.label?.trim() || cfg.label;
                        let domain = '';
                        try {
                          domain = new URL(safeUrl).hostname.replace(/^www\./, '');
                        } catch {
                          domain = safeUrl.replace(/^https?:\/\//, '').split('/')[0];
                        }
                        return (
                          <a
                            key={link.id || link.url}
                            href={safeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => void discoveryApi.trackEvent({ eventType: 'CONTACT', businessId: b.id, metadata: { channel: link.platform } })}
                            className="group flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 hover:border-indigo-200 dark:hover:border-indigo-800/60 transition-all min-h-[44px]"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`p-1.5 rounded-lg shrink-0 ${cfg.badgeBg} ${cfg.badgeText}`}>
                                <IconComp className="w-3.5 h-3.5" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                  {displayLabel}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {domain}
                                </p>
                              </div>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Operating Hours Card */}
            <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="font-black text-xs uppercase tracking-wider text-slate-400">Operating Hours</h2>
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${todayOpen ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                  <span className={`w-2 h-2 rounded-full ${todayOpen ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {todayHours ? (todayOpen ? 'Open now' : 'Closed now') : 'Hours unavailable'}
                </span>
              </div>

              {primaryHours.length > 0 ? (
                <div className="space-y-2.5">
                  {dayNames.map((day, index) => {
                    const dayHours = primaryHours.find((h) => Number(h.day_of_week) === index + 1);
                    const isToday = index + 1 === currentDay;
                    return (
                      <div
                        key={day}
                        className={`flex items-center justify-between gap-3 text-xs py-1 px-2 rounded-lg ${
                          isToday ? 'bg-indigo-50/70 dark:bg-indigo-950/40 font-bold text-indigo-900 dark:text-indigo-200' : ''
                        }`}
                      >
                        <span className={isToday ? 'text-indigo-900 dark:text-indigo-300' : 'font-medium text-slate-600 dark:text-slate-300'}>
                          {day} {isToday && '•'}
                        </span>
                        <span className={isToday ? 'text-indigo-950 dark:text-indigo-200' : 'text-slate-500 dark:text-slate-400'}>
                          {!dayHours || dayHours.is_closed ? 'Closed' : `${dayHours.opens_at?.slice(0, 5) || '—'} – ${dayHours.closes_at?.slice(0, 5) || '—'}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Operating hours have not been published for the main location.</p>
              )}
            </section>

            {/* Multiple Locations Card */}
            {locations.length > 0 && (
              <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
                <h2 className="font-black text-xs uppercase tracking-wider text-slate-400 mb-4">Locations & Branches</h2>
                <div className="space-y-4">
                  {locations.map((loc) => (
                    <div key={loc.id} className="border-t border-slate-100 dark:border-slate-800 pt-3 first:border-0 first:pt-0">
                      <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center justify-between">
                        <span>{loc.name}</span>
                        {loc.is_primary && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                            Main
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 leading-relaxed">{locationText(loc)}</p>
                      {loc.latitude != null && loc.longitude != null && s.allow_directions && (
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          href={`https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline min-h-[36px]"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Get Directions</span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Categories & Taxonomies */}
            {profile.categories.length > 0 && (
              <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
                <h2 className="font-black text-xs uppercase tracking-wider text-slate-400 mb-3">Categories</h2>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {profile.categories.map((c, idx) => (
                    <React.Fragment key={c.id}>
                      {idx > 0 && <span className="text-slate-300 dark:text-slate-700">·</span>}
                      <span className="font-medium hover:text-indigo-600 transition-colors">
                        {c.name}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </section>
            )}

            {/* Trust & Safety Assurance */}
            <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-850/50 p-5 sm:p-6 text-xs text-slate-500 leading-relaxed space-y-2">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-bold">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span>AbaCha Buyer Protection</span>
              </div>
              <p>
                Listings on AbaCha Discovery are verified for business authenticity, contact validity, and merchant compliance across Sierra Leone.
              </p>
            </section>
          </aside>
        </div>
      </main>

      {/* Report Listing Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="discovery-report-title">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between gap-4 p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 id="discovery-report-title" className="text-lg font-black text-slate-900 dark:text-white">Report {b.name}</h2>
                <p className="mt-1 text-xs text-slate-500">Tell AbaCha what needs review about this listing.</p>
              </div>
              <button
                type="button"
                onClick={() => !reportSubmitting && setReportOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close report form"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReportSubmit} className="p-5 sm:p-6 space-y-4">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Reason *
                <select
                  value={reportForm.reasonCode}
                  onChange={(e) => setReportForm((v) => ({ ...v, reasonCode: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm min-h-[44px] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="INACCURATE_INFORMATION">Inaccurate information</option>
                  <option value="DUPLICATE_LISTING">Duplicate listing</option>
                  <option value="FRAUD_OR_SCAM">Fraud or scam</option>
                  <option value="INAPPROPRIATE_CONTENT">Inappropriate content</option>
                  <option value="CLOSED_BUSINESS">Business is closed</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>

              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Details
                <textarea
                  maxLength={5000}
                  rows={4}
                  value={reportForm.description}
                  onChange={(e) => setReportForm((v) => ({ ...v, description: e.target.value }))}
                  placeholder="Describe the issue with this listing…"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm resize-y focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </label>

              {reportMessage && <p role="status" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{reportMessage}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  disabled={reportSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reportSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-60 shadow-md min-h-[44px]"
                >
                  {reportSubmitting ? 'Submitting…' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Write Review Modal */}
      {reviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="discovery-review-title">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between gap-4 p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 id="discovery-review-title" className="text-lg font-black text-slate-900 dark:text-white">Review {b.name}</h2>
                <p className="mt-1 text-xs text-slate-500">Your review will be published after moderation.</p>
              </div>
              <button
                type="button"
                onClick={() => !reviewSubmitting && setReviewOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close review form"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReviewSubmit} className="p-5 sm:p-6 space-y-4">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Rating *
                <select
                  value={reviewForm.rating}
                  onChange={(e) => setReviewForm((v) => ({ ...v, rating: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm min-h-[44px] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {value} Stars - {value === 5 ? 'Excellent' : value === 4 ? 'Good' : value === 3 ? 'Average' : value === 2 ? 'Below Average' : 'Poor'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Your name *
                <input
                  required
                  maxLength={160}
                  value={reviewForm.reviewerName}
                  onChange={(e) => setReviewForm((v) => ({ ...v, reviewerName: e.target.value }))}
                  placeholder="e.g. Mariatu Sesay"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm min-h-[44px] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Title
                <input
                  maxLength={180}
                  value={reviewForm.title}
                  onChange={(e) => setReviewForm((v) => ({ ...v, title: e.target.value }))}
                  placeholder="Summarize your review"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm min-h-[44px] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Review *
                <textarea
                  required
                  maxLength={5000}
                  rows={4}
                  value={reviewForm.body}
                  onChange={(e) => setReviewForm((v) => ({ ...v, body: e.target.value }))}
                  placeholder="Share details of your experience with their products, service, or delivery…"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm resize-y focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </label>

              {reviewMessage && <p role="status" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{reviewMessage}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  disabled={reviewSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-60 shadow-md min-h-[44px]"
                >
                  {reviewSubmitting ? 'Submitting…' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ownership Claim Modal */}
      {claimOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="discovery-claim-title">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between gap-4 p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 id="discovery-claim-title" className="text-lg font-black text-slate-900 dark:text-white">Claim {b.name}</h2>
                <p className="mt-1 text-xs text-slate-500">Submit evidence that you are authorized to represent this business.</p>
              </div>
              <button
                type="button"
                onClick={() => !claimSubmitting && setClaimOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close ownership claim form"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleClaimSubmit} className="p-5 sm:p-6 space-y-4">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Your name *
                <input
                  required
                  maxLength={160}
                  value={claimForm.claimantName}
                  onChange={(e) => setClaimForm((v) => ({ ...v, claimantName: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm min-h-[44px] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Email
                <input
                  type="email"
                  maxLength={320}
                  value={claimForm.claimantEmail}
                  onChange={(e) => setClaimForm((v) => ({ ...v, claimantEmail: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm min-h-[44px] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Ownership evidence *
                <textarea
                  required
                  maxLength={5000}
                  rows={4}
                  value={claimForm.evidence}
                  onChange={(e) => setClaimForm((v) => ({ ...v, evidence: e.target.value }))}
                  placeholder="Registration details, license information, official contact details, or other evidence that can help verify your authority…"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm resize-y focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </label>

              <p className="text-[11px] text-slate-500 leading-normal">
                Do not submit passwords, payment credentials, or other secrets. Supporting documents can be requested during review.
              </p>

              {claimMessage && <p role="status" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{claimMessage}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setClaimOpen(false)}
                  disabled={claimSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={claimSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-60 shadow-md min-h-[44px]"
                >
                  {claimSubmitting ? 'Submitting…' : 'Submit Claim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Contact Inquiry Modal */}
      {contactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="discovery-contact-title">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between gap-4 p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 id="discovery-contact-title" className="text-lg font-black text-slate-900 dark:text-white">Contact {b.name}</h2>
                <p className="mt-1 text-xs text-slate-500">Send an inquiry to this business through AbaCha Discovery.</p>
              </div>
              <button
                type="button"
                onClick={() => setContactOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close inquiry form"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleContactSubmit} className="p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Name *
                  <input
                    required
                    maxLength={160}
                    value={contactForm.customerName}
                    onChange={(e) => setContactForm((v) => ({ ...v, customerName: e.target.value }))}
                    placeholder="Your name"
                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm min-h-[44px] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Phone
                  <input
                    maxLength={64}
                    value={contactForm.customerPhone}
                    onChange={(e) => setContactForm((v) => ({ ...v, customerPhone: e.target.value }))}
                    placeholder="+232 76 000 000"
                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm min-h-[44px] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Email
                <input
                  type="email"
                  maxLength={320}
                  value={contactForm.customerEmail}
                  onChange={(e) => setContactForm((v) => ({ ...v, customerEmail: e.target.value }))}
                  placeholder="your.email@example.com"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm min-h-[44px] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Subject
                <input
                  maxLength={180}
                  value={contactForm.subject}
                  onChange={(e) => setContactForm((v) => ({ ...v, subject: e.target.value }))}
                  placeholder="Inquiry subject…"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm min-h-[44px] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Message *
                <textarea
                  required
                  maxLength={10000}
                  rows={4}
                  value={contactForm.message}
                  onChange={(e) => setContactForm((v) => ({ ...v, message: e.target.value }))}
                  placeholder="Write your inquiry to this merchant…"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm resize-y focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </label>

              {contactMessage && <p role="status" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{contactMessage}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setContactOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={contactSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-60 shadow-md min-h-[44px]"
                >
                  {contactSubmitting ? 'Sending…' : 'Send Inquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Quote Modal */}
      {activeServiceForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 animate-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100">
            <button
              type="button"
              onClick={() => !quoteSubmitting && setActiveServiceForModal(null)}
              className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>

            {quoteSuccess ? (
              <div className="py-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Quote Request Sent!</h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  {b.name} has received your request and will reach out shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleServiceQuoteSubmit} className="space-y-4">
                <div>
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    Request Quote for
                  </span>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    {activeServiceForModal.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Offered by {b.name} · {activeServiceForModal.price_from ? `From ${Number(activeServiceForModal.price_from).toLocaleString()} ${activeServiceForModal.currency || 'SLE'}` : 'Quote on request'}
                  </p>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Your Requirements *
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={quoteForm.description}
                      onChange={(e) => setQuoteForm({ ...quoteForm, description: e.target.value })}
                      placeholder="Explain your needs, location or timing details…"
                      className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Your Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={quoteForm.customerName}
                        onChange={(e) => setQuoteForm({ ...quoteForm, customerName: e.target.value })}
                        placeholder="e.g. John Kamara"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Phone / WhatsApp
                      </label>
                      <input
                        type="tel"
                        value={quoteForm.customerPhone}
                        onChange={(e) => setQuoteForm({ ...quoteForm, customerPhone: e.target.value })}
                        placeholder="+232 76 000 000"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[44px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={quoteForm.customerEmail}
                        onChange={(e) => setQuoteForm({ ...quoteForm, customerEmail: e.target.value })}
                        placeholder="john@example.com"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Preferred Date
                      </label>
                      <input
                        type="date"
                        value={quoteForm.preferredDate}
                        onChange={(e) => setQuoteForm({ ...quoteForm, preferredDate: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[44px]"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveServiceForModal(null)}
                    disabled={quoteSubmitting}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[44px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={quoteSubmitting}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md disabled:opacity-50 min-h-[44px]"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Quote Request</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Dock */}
      <DiscoveryMobileBottomNav />
    </div>
  );
};
