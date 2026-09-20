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
} from 'lucide-react';
import type { DiscoveryLocation, DiscoveryService, DiscoveryReview, DiscoveryPublicBusinessProfile } from '../../types/discovery';
import { discoveryApi, DiscoveryApiError } from '../../services/discoveryApi';
import { VerificationBadge } from './VerificationBadge';
import { DiscoveryRating } from './DiscoveryRating';
import { DiscoveryLoadingState } from './DiscoveryLoadingState';
import { ServiceCard } from './ServiceCard';

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
  const [showReviews, setShowReviews] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState<string | null>(null);

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

  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.back();
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
          <div className="h-64 rounded-3xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
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
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold shadow-md"
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
            className="mt-6 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold shadow-md"
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

  const canCall = s.allow_phone_contact && !!b.phone;
  const canWhatsApp = s.allow_whatsapp_contact && !!b.whatsapp;
  const canDirections = s.allow_directions && primary?.latitude != null && primary?.longitude != null;
  const canStore = s.allow_public_store_link && b.business_mode === 'DISCOVERY_AND_STORE';
  const storeUrl = canStore ? `/store/${encodeURIComponent(b.tenant_slug || b.slug || b.id)}` : null;

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${className}`}>
      {/* Header bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBackClick}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Discovery</span>
          </button>

          <a href="/discover" className="text-xs font-black tracking-widest text-indigo-600 dark:text-indigo-400 uppercase">
            AbaCha Discovery
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Hero Card */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          {/* Cover photo */}
          <div className="h-48 sm:h-64 lg:h-72 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-850 overflow-hidden">
            {b.cover_image_url ? (
              <img src={b.cover_image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-300 dark:text-slate-600">
                <Store className="w-20 h-20 opacity-40" />
              </div>
            )}
          </div>

          <div className="p-5 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-end gap-5">
              {/* Business Logo */}
              <div className="-mt-16 sm:-mt-20 w-24 h-24 sm:w-32 sm:h-32 rounded-3xl bg-white dark:bg-slate-900 border-4 border-white dark:border-slate-900 shadow-xl overflow-hidden flex items-center justify-center shrink-0">
                {b.logo_url ? (
                  <img src={b.logo_url} alt={`${b.name} logo`} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {b.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Title & Metadata */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white">
                    {b.name}
                  </h1>
                  <VerificationBadge status={b.verification_status} />
                </div>

                <p className="mt-1 text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
                  {b.category_name || b.business_type || 'Verified Local Merchant'}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <DiscoveryRating rating={rating} reviewCount={reviewCount} size="md" />
                  {primary && (
                    <span className="inline-flex items-center gap-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="truncate max-w-sm">{locationText(primary)}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0">
                <button
                  type="button"
                  onClick={() => void toggleFavorite()}
                  disabled={favoriteBusy}
                  aria-pressed={isFavorite}
                  aria-label={isFavorite ? 'Remove business from saved businesses' : 'Save business'}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-colors ${
                    isFavorite
                      ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
                  <span>{favoriteBusy ? 'Saving…' : isFavorite ? 'Saved' : 'Save'}</span>
                </button>


                {canCall && (
                  <a
                    href={`tel:${b.phone}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-2xs"
                  >
                    <Phone className="w-4 h-4 text-indigo-600" />
                    <span>Call</span>
                  </a>
                )}

                {canWhatsApp && (
                  <a
                    href={`https://wa.me/${b.whatsapp!.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors shadow-2xs"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                    <span>WhatsApp</span>
                  </a>
                )}

                {canDirections && (
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://www.google.com/maps/search/?api=1&query=${primary!.latitude},${primary!.longitude}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-2xs"
                  >
                    <Navigation className="w-4 h-4 text-sky-600" />
                    <span>Directions</span>
                  </a>
                )}

                {/* Visit Store strictly for DISCOVERY_AND_STORE */}
                {storeUrl && (
                  <a
                    href={storeUrl}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all hover:scale-102 active:scale-98"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Visit Store</span>
                  </a>
                )}
              </div>
            {favoriteMessage && (
              <p role="status" className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">{favoriteMessage}</p>
            )}

            </div>

            {/* Description */}
            {b.description && (
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">About This Business</h2>
                <p className="max-w-4xl text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300">
                  {b.description}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Content Layout */}
        <div className="grid lg:grid-cols-[1fr_340px] gap-6">
          <div className="space-y-6">
            {/* Storefront Integration Box */}
            {s.show_products && (
              <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xs">
                <div className="flex items-center gap-2 mb-2">
                  <BriefcaseBusiness className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">Products & Storefront</h2>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {canStore
                    ? 'This business operates a direct online storefront on AbaCha. You can browse their full product catalog, view live inventory, and place orders directly.'
                    : 'This business lists their profile on the AbaCha discovery network. Contact them directly via phone or WhatsApp for product availability.'}
                </p>
                {storeUrl && (
                  <a
                    href={storeUrl}
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Visit Merchant Store</span>
                  </a>
                )}
              </section>
            )}

            {/* Active Services */}
            {services.length > 0 && (
              <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">Services Offered</h2>
                    <p className="text-xs text-slate-500">Available services and pricing estimates</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {services.length} services
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  {services.map((svc) => (
                    <ServiceCard
                      key={svc.id}
                      service={svc}
                      onRequestService={(selected) => setActiveServiceForModal(selected)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Reviews Section */}
            {s.allow_reviews && (
              <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xs">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">Customer Reviews</h2>
                    <div className="mt-1">
                      <DiscoveryRating rating={rating} reviewCount={reviewCount} size="md" />
                    </div>
                  </div>
                </div>

                {reviews.length === 0 ? (
                  <p className="mt-5 text-xs sm:text-sm text-slate-500">No public reviews submitted yet.</p>
                ) : (
                  <div className="mt-5 space-y-4">
                    {(showReviews ? reviews : reviews.slice(0, 3)).map((r: DiscoveryReview) => (
                      <article key={r.id} className="border-t border-slate-100 dark:border-slate-800 pt-4 first:border-0 first:pt-0">
                        <div className="flex justify-between items-start gap-3">
                          <div>
                            <strong className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                              {r.reviewer_name}
                            </strong>
                            <DiscoveryRating rating={r.rating} reviewCount={1} showCount={false} size="sm" className="mt-1" />
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {r.title && <h3 className="mt-2 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">{r.title}</h3>}
                        {r.body && <p className="mt-1 text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-300">{r.body}</p>}
                        {r.verified_purchase && (
                          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Verified customer</span>
                          </span>
                        )}
                      </article>
                    ))}
                  </div>
                )}

                {reviews.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowReviews((v) => !v)}
                    className="mt-4 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {showReviews ? 'Show fewer reviews' : `Show all ${reviews.length} reviews`}
                  </button>
                )}
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Contact Details */}
            <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-2xs">
              <h2 className="font-black text-sm uppercase tracking-wider text-slate-400 mb-4">Contact Info</h2>
              <div className="space-y-3.5 text-xs sm:text-sm">
                {primary && (
                  <div className="flex items-start gap-3 text-slate-700 dark:text-slate-300">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>{locationText(primary)}</span>
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
                    <a href={b.website} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-indigo-600 hover:underline">
                      {b.website}
                    </a>
                  </div>
                )}
              </div>
            </section>

            {/* Multiple Locations */}
            {locations.length > 0 && (
              <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-2xs">
                <h2 className="font-black text-sm uppercase tracking-wider text-slate-400 mb-4">Locations & Branches</h2>
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
                          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          <Navigation className="w-3 h-3" />
                          <span>Get Directions</span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Categories */}
            {profile.categories.length > 0 && (
              <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-2xs">
                <h2 className="font-black text-sm uppercase tracking-wider text-slate-400 mb-3">Categories</h2>
                <div className="flex flex-wrap gap-1.5">
                  {profile.categories.map((c) => (
                    <span key={c.id} className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                      {c.name}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </main>

      {/* Direct Quote Modal */}
      {activeServiceForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 animate-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100">
            <button
              type="button"
              onClick={() => !quoteSubmitting && setActiveServiceForModal(null)}
              className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                    Request Quote for
                  </span>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    {activeServiceForModal.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Offered by {b.name} • {activeServiceForModal.price_from ? `From ${Number(activeServiceForModal.price_from).toLocaleString()} ${activeServiceForModal.currency || 'SLE'}` : 'Quote on request'}
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
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveServiceForModal(null)}
                    disabled={quoteSubmitting}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={quoteSubmitting}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md disabled:opacity-50"
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
    </div>
  );
};
