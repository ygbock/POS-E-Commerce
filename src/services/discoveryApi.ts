/**
 * AbaCha Unified Commerce — Discovery API Client (FRONT-001)
 *
 * Implements the authoritative Discovery API client matching server/routes/discoveryRoutes.ts.
 * Uses the existing fetch and auth header pattern established across the repository.
 */

import { authClient } from './authClient';
import type {
  DiscoveryBusiness,
  DiscoveryLocation,
  DiscoveryBusinessHours,
  DiscoveryBusinessSettings,
  DiscoveryCategory,
  DiscoveryService,
  DiscoveryReview,
  DiscoveryReviewsResponse,
  DiscoveryServiceRequest,
  DiscoveryServiceQuote,
  DiscoveryBusinessClaim,
  DiscoveryVerificationApplication,
  DiscoveryReport,
  DiscoveryAnalyticsSummary,
  DiscoverySearchFilters,
  DiscoverySearchResponse,
  DiscoveryPublicBusinessProfile,
  DiscoverySearchAlias,
  DiscoveryMerchantTrustCenter,
  DiscoveryFavoriteBusiness,
  DiscoveryContactInquiry,
} from '../types/discovery';

export class DiscoveryApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code = 'DISCOVERY_API_ERROR', status = 500, details?: unknown) {
    super(message);
    this.name = 'DiscoveryApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Standard request helper using the existing AbaCha API client architecture
 */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const authHeaders = authClient.getAuthHeaders();
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...authHeaders,
        ...(init?.headers || {}),
      },
      credentials: 'same-origin',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network failure';
    throw new DiscoveryApiError(
      'Unable to connect to the discovery service. Please verify your internet connection and try again.',
      'NETWORK_ERROR',
      0,
      message
    );
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errorObj = body?.error;
    const rawCode = errorObj?.code || 'DISCOVERY_ERROR';
    const rawMessage = errorObj?.message || body?.message;

    // Graceful, human-readable error messages for specific status codes
    let friendlyMessage = rawMessage || 'Discovery request failed.';
    if (response.status === 401) {
      friendlyMessage = 'Authentication is required to perform this discovery operation.';
    } else if (response.status === 403) {
      friendlyMessage = 'You do not have permission to perform this discovery action.';
    } else if (response.status === 404) {
      friendlyMessage = rawMessage || 'The requested business listing or resource was not found.';
    } else if (response.status === 409) {
      friendlyMessage = rawMessage || 'Conflict encountered during business state update.';
    } else if (response.status === 422) {
      friendlyMessage = rawMessage || 'Please check your input. Some required fields were invalid.';
    } else if (response.status === 429) {
      friendlyMessage = 'Too many requests. Please wait a moment before trying again.';
    } else if (response.status >= 500) {
      friendlyMessage = 'The discovery server encountered an unexpected error. Please try again shortly.';
    }

    throw new DiscoveryApiError(friendlyMessage, rawCode, response.status, body);
  }

  // Handle standard { success: true, data: T } wrapping
  return (body?.data !== undefined ? body.data : body) as T;
}

export const discoveryApi = {
  // ---------------------------------------------------------------------------
  // Public Discovery
  // ---------------------------------------------------------------------------

  /**
   * Unified discovery search across published businesses, products and services
   */
  async search(filters: DiscoverySearchFilters = {}, options?: { signal?: AbortSignal }): Promise<DiscoverySearchResponse> {
    const params = new URLSearchParams();
    if (filters.q?.trim()) params.set('q', filters.q.trim());
    if (filters.type && filters.type !== 'all') params.set('type', filters.type);
    if (filters.city?.trim()) params.set('city', filters.city.trim());
    if (filters.district?.trim()) params.set('district', filters.district.trim());
    if (filters.region?.trim()) params.set('region', filters.region.trim());
    if (filters.lat != null) params.set('lat', String(filters.lat));
    if (filters.lng != null) params.set('lng', String(filters.lng));
    if (filters.radiusKm != null) params.set('radiusKm', String(filters.radiusKm));
    if (filters.openNow !== undefined) params.set('openNow', String(filters.openNow));
    if (filters.categoryId?.trim()) params.set('categoryId', filters.categoryId.trim());
    if (filters.sort) params.set('sort', filters.sort);
    if (filters.limit != null) params.set('limit', String(filters.limit));
    if (filters.offset != null) params.set('offset', String(filters.offset));

    const url = `/api/discovery/search${params.toString() ? `?${params.toString()}` : ''}`;
    // Search returns { success: true, query, type, filters, data, counts }
    // We fetch the full body rather than just body.data
    const authHeaders = authClient.getAuthHeaders();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', ...authHeaders },
        credentials: 'same-origin',
        signal: options?.signal,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      const message = err instanceof Error ? err.message : 'Network failure';
      throw new DiscoveryApiError(
        'Unable to connect to discovery search. Please check your network connection.',
        'NETWORK_ERROR',
        0,
        message
      );
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const errorObj = body?.error;
      const status = response.status;
      const message =
        status === 429
          ? 'Too many search requests. Please slow down.'
          : errorObj?.message || 'Search failed. Please try again.';
      throw new DiscoveryApiError(message, errorObj?.code || 'SEARCH_ERROR', status, body);
    }
    return body as DiscoverySearchResponse;
  },

  /**
   * List published businesses with optional location and category filters
   */
  async getBusinesses(params: {
    city?: string;
    district?: string;
    region?: string;
    businessType?: string;
    categoryId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<DiscoveryBusiness[]> {
    const qs = new URLSearchParams();
    if (params.city) qs.set('city', params.city);
    if (params.district) qs.set('district', params.district);
    if (params.region) qs.set('region', params.region);
    if (params.businessType) qs.set('businessType', params.businessType);
    if (params.categoryId) qs.set('categoryId', params.categoryId);
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));

    const url = `/api/discovery/businesses${qs.toString() ? `?${qs.toString()}` : ''}`;
    return request<DiscoveryBusiness[]>(url);
  },

  async getMyFavoriteBusinesses(): Promise<DiscoveryFavoriteBusiness[]> {
    return request<DiscoveryFavoriteBusiness[]>('/api/discovery/favorites');
  },

  async getBusinessFavorite(businessId: string): Promise<{ businessId: string; isFavorite: boolean }> {
    return request<{ businessId: string; isFavorite: boolean }>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/favorite`);
  },

  async addBusinessFavorite(businessId: string): Promise<{ businessId: string; isFavorite: boolean }> {
    return request<{ businessId: string; isFavorite: boolean }>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/favorite`, { method: 'POST' });
  },

  async removeBusinessFavorite(businessId: string): Promise<{ businessId: string; isFavorite: boolean }> {
    return request<{ businessId: string; isFavorite: boolean }>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/favorite`, { method: 'DELETE' });
  },

  /**
   * Get full public business profile by slug (or public id)
   */
  async getBusinessBySlug(slug: string): Promise<DiscoveryPublicBusinessProfile> {
    return request<DiscoveryPublicBusinessProfile>(`/api/discovery/businesses/${encodeURIComponent(slug)}`);
  },

  /**
   * List all active discovery categories
   */
  async getCategories(): Promise<DiscoveryCategory[]> {
    return request<DiscoveryCategory[]>('/api/discovery/categories');
  },

  /**
   * Get public locations for a specific business
   */
  async getBusinessLocations(businessId: string): Promise<DiscoveryLocation[]> {
    return request<DiscoveryLocation[]>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/locations`);
  },

  /**
   * Get public services offered by a business
   */
  async getBusinessServices(businessId: string): Promise<DiscoveryService[]> {
    return request<DiscoveryService[]>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/services`);
  },

  /**
   * Get published reviews and summary for a business
   */
  async getBusinessReviews(businessId: string): Promise<DiscoveryReviewsResponse> {
    const authHeaders = authClient.getAuthHeaders();
    const url = `/api/discovery/businesses/${encodeURIComponent(businessId)}/reviews`;
    const res = await fetch(url, { headers: { Accept: 'application/json', ...authHeaders } });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new DiscoveryApiError(body?.error?.message || 'Failed to load reviews', body?.error?.code, res.status);
    }
    return {
      summary: body.summary || { rating: 0, count: 0 },
      data: Array.isArray(body.data) ? body.data : [],
    };
  },

  async getMyContactInquiries(status?: DiscoveryContactInquiry['status']): Promise<DiscoveryContactInquiry[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<DiscoveryContactInquiry[]>(`/api/discovery/contact-inquiries${qs}`);
  },

  async respondToReview(businessId: string, reviewId: string, response: string) {
    return request(`/api/discovery/businesses/${encodeURIComponent(businessId)}/reviews/${encodeURIComponent(reviewId)}/response`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    });
  }

  async deleteReviewResponse(businessId: string, reviewId: string) {
    return request(`/api/discovery/businesses/${encodeURIComponent(businessId)}/reviews/${encodeURIComponent(reviewId)}/response`, {
      method: 'DELETE',
    });
  }

  async createContactInquiry(businessId: string, data: {
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    subject?: string;
    message: string;
  }): Promise<DiscoveryContactInquiry> {
    return request<DiscoveryContactInquiry>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/contact-inquiries`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getBusinessContactInquiries(businessId: string, status?: DiscoveryContactInquiry['status']): Promise<DiscoveryContactInquiry[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<DiscoveryContactInquiry[]>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/contact-inquiries${qs}`);
  },

  async updateContactInquiry(businessId: string, inquiryId: string, status: 'READ' | 'RESPONDED' | 'CLOSED', merchantNote?: string): Promise<DiscoveryContactInquiry> {
    return request<DiscoveryContactInquiry>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/contact-inquiries/${encodeURIComponent(inquiryId)}/decision`, {
      method: 'POST',
      body: JSON.stringify({ status, merchantNote }),
    });
  },

  /**
   * Submit a customer service request
   */
  async createServiceRequest(data: {
    customerName: string;
    description: string;
    customerPhone?: string;
    customerEmail?: string;
    city?: string;
    district?: string;
    region?: string;
    latitude?: number;
    longitude?: number;
    preferredDate?: string;
    budgetFrom?: number;
    budgetTo?: number;
    serviceId?: string;
    businessId?: string;
  }): Promise<DiscoveryServiceRequest> {
    return request<DiscoveryServiceRequest>('/api/discovery/service-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async cancelServiceRequest(id: string, reason?: string): Promise<DiscoveryServiceRequest> {
    return request<DiscoveryServiceRequest>(`/api/discovery/service-requests/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async closeServiceRequest(id: string, reason?: string, businessId?: string): Promise<DiscoveryServiceRequest> {
    return request<DiscoveryServiceRequest>(`/api/discovery/service-requests/${encodeURIComponent(id)}/close`, {
      method: 'POST',
      body: JSON.stringify({ reason, businessId }),
    });
  },

  async matchServiceRequest(requestId: string, businessId: string, matchScore = 1): Promise<DiscoveryServiceRequest> {
    return request<DiscoveryServiceRequest>(`/api/discovery/service-requests/${encodeURIComponent(requestId)}/match`, {
      method: 'POST',
      body: JSON.stringify({ businessId, matchScore }),
    });
  },

  /**
   * Get business service requests (authenticated provider)
   */
  async getBusinessServiceRequests(businessId: string, status?: string): Promise<DiscoveryServiceRequest[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<DiscoveryServiceRequest[]>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/service-requests${qs}`);
  },

  /**
   * Get all businesses owned by currently authenticated user
   */
  async getMyBusinesses(): Promise<DiscoveryBusiness[]> {
    return request<DiscoveryBusiness[]>('/api/discovery/businesses/my');
  },

  /**
   * Get service request details including matches and quotes (authenticated)
   */
  async getMyServiceRequests(status?: DiscoveryServiceRequest['status']): Promise<DiscoveryServiceRequest[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<DiscoveryServiceRequest[]>(`/api/discovery/service-requests${qs}`);
  },

  async getServiceRequest(id: string): Promise<DiscoveryServiceRequest> {
    return request<DiscoveryServiceRequest>(`/api/discovery/service-requests/${encodeURIComponent(id)}`);
  },

  /**
   * Provider responds to a service request with a quote (authenticated)
   */
  async createQuote(requestId: string, quote: {
    businessId: string;
    amount: number;
    currency?: string;
    serviceId?: string;
    message?: string;
    estimatedDurationMinutes?: number;
    validUntil?: string;
  }): Promise<DiscoveryServiceQuote> {
    return request<DiscoveryServiceQuote>(`/api/discovery/service-requests/${encodeURIComponent(requestId)}/quotes`, {
      method: 'POST',
      body: JSON.stringify(quote),
    });
  },

  async acceptServiceQuote(requestId: string, quoteId: string): Promise<DiscoveryServiceRequest> {
    return request<DiscoveryServiceRequest>(`/api/discovery/service-requests/${encodeURIComponent(requestId)}/quotes/${encodeURIComponent(quoteId)}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async declineServiceQuote(requestId: string, quoteId: string): Promise<{ id: string; status: string }> {
    return request<{ id: string; status: string }>(`/api/discovery/service-requests/${encodeURIComponent(requestId)}/quotes/${encodeURIComponent(quoteId)}/decline`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  /**
   * File an abuse/content report
   */
  async createReport(report: {
    businessId?: string;
    serviceId?: string;
    reasonCode: string;
    description?: string;
  }): Promise<DiscoveryReport> {
    return request<DiscoveryReport>('/api/discovery/reports', {
      method: 'POST',
      body: JSON.stringify(report),
    });
  },

  /**
   * Track a client-side analytics event
   */
  async trackEvent(event: {
    eventType: string;
    businessId?: string;
    productId?: string;
    serviceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await fetch('/api/discovery/analytics/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authClient.getAuthHeaders() },
        body: JSON.stringify(event),
        credentials: 'same-origin',
      });
    } catch {
      // Analytics tracking should fail silently to protect user experience
    }
  },

  // ---------------------------------------------------------------------------
  // Business Owner Operations (Authenticated)
  // ---------------------------------------------------------------------------

  /**
   * Create a new discovery business listing
   */
  async createBusiness(data: { name: string; legalName?: string | null; businessType?: string | null; shortDescription?: string | null; description?: string | null; phone?: string | null; email?: string | null; whatsapp?: string | null; website?: string | null; logoUrl?: string | null; coverImageUrl?: string | null; businessMode?: 'DISCOVERY_ONLY' | 'DISCOVERY_AND_STORE'; organizationId?: string | null; submitImmediately?: boolean }): Promise<DiscoveryBusiness> {
    return request<DiscoveryBusiness>('/api/discovery/businesses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update existing discovery business details
   */
  async updateBusiness(id: string, patch: { name?: string; legalName?: string | null; businessType?: string | null; shortDescription?: string | null; description?: string | null; phone?: string | null; email?: string | null; whatsapp?: string | null; website?: string | null; logoUrl?: string | null; coverImageUrl?: string | null; businessMode?: 'DISCOVERY_ONLY' | 'DISCOVERY_AND_STORE'; organizationId?: string | null }): Promise<DiscoveryBusiness> {
    return request<DiscoveryBusiness>(`/api/discovery/businesses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  async convertBusinessToStore(id: string): Promise<DiscoveryBusiness> { return request<DiscoveryBusiness>('/api/discovery/businesses/' + encodeURIComponent(id) + '/convert-to-store', { method: 'POST', body: JSON.stringify({}) }); },


  /**
   * Lifecycle actions
   */
  async submitBusiness(id: string, reason?: string): Promise<DiscoveryBusiness> {
    return request<DiscoveryBusiness>(`/api/discovery/businesses/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async publishBusiness(id: string, reason?: string): Promise<DiscoveryBusiness> {
    return request<DiscoveryBusiness>(`/api/discovery/businesses/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async pauseBusiness(id: string, reason?: string): Promise<DiscoveryBusiness> {
    return request<DiscoveryBusiness>(`/api/discovery/businesses/${encodeURIComponent(id)}/pause`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async archiveBusiness(id: string, reason?: string): Promise<DiscoveryBusiness> {
    return request<DiscoveryBusiness>(`/api/discovery/businesses/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  /**
   * Location management
   */
  async createLocation(businessId: string, data: Partial<DiscoveryLocation>): Promise<DiscoveryLocation> {
    return request<DiscoveryLocation>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/locations`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateLocation(businessId: string, locationId: string, patch: Partial<DiscoveryLocation>): Promise<DiscoveryLocation> {
    return request<DiscoveryLocation>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/locations/${encodeURIComponent(locationId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  async updateHours(businessId: string, locationId: string, hours: Array<{ dayOfWeek: number; isClosed: boolean; opensAt?: string | null; closesAt?: string | null }>): Promise<DiscoveryBusinessHours[]> {
    return request<DiscoveryBusinessHours[]>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/locations/${encodeURIComponent(locationId)}/hours`, {
      method: 'PUT',
      body: JSON.stringify({ hours }),
    });
  },

  /**
   * Settings management
   */
  async updateSettings(businessId: string, settings: Partial<DiscoveryBusinessSettings>): Promise<DiscoveryBusinessSettings> {
    return request<DiscoveryBusinessSettings>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  },

  /**
   * Services management
   */
  async createService(businessId: string, data: Partial<DiscoveryService>): Promise<DiscoveryService> {
    return request<DiscoveryService>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/services`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateService(businessId: string, serviceId: string, patch: Partial<DiscoveryService>): Promise<DiscoveryService> {
    return request<DiscoveryService>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/services/${encodeURIComponent(serviceId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  /**
   * Categories assignment
   */
  async updateBusinessCategories(businessId: string, categoryIds: string[]): Promise<DiscoveryCategory[]> {
    return request<DiscoveryCategory[]>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/categories`, {
      method: 'PUT',
      body: JSON.stringify({ categoryIds }),
    });
  },

  /**
   * Submit business review (authenticated customer)
   */
  async createReview(businessId: string, review: { rating: number; title?: string; body?: string; reviewerName?: string; orderId?: string }): Promise<DiscoveryReview> {
    return request<DiscoveryReview>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/reviews`, {
      method: 'POST',
      body: JSON.stringify(review),
    });
  },

  async getMerchantTrustCenter(businessId: string): Promise<DiscoveryMerchantTrustCenter> {
    return request<DiscoveryMerchantTrustCenter>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/trust`);
  },

  async getVerification(businessId: string): Promise<{ businessId: string; verificationStatus: DiscoveryBusiness['verification_status']; applications: DiscoveryVerificationApplication[] }> {
    return request<{ businessId: string; verificationStatus: DiscoveryBusiness['verification_status']; applications: DiscoveryVerificationApplication[] }>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/verification`);
  },

  async submitVerification(businessId: string, evidence: Record<string, unknown>): Promise<DiscoveryVerificationApplication> {
    return request<DiscoveryVerificationApplication>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/verification`, {
      method: 'POST',
      body: JSON.stringify({ evidence }),
    });
  },

  /**
   * Submit business ownership claim
   */
  async createClaim(businessId: string, claim: { claimantName?: string; claimantEmail?: string; evidence?: Record<string, unknown> }): Promise<DiscoveryBusinessClaim> {
    return request<DiscoveryBusinessClaim>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/claims`, {
      method: 'POST',
      body: JSON.stringify(claim),
    });
  },

  /**
   * Search aliases managed by the business owner.
   */
  async getSearchAliases(businessId: string): Promise<DiscoverySearchAlias[]> {
    return request<DiscoverySearchAlias[]>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/search-aliases`);
  },

  async createSearchAlias(businessId: string, data: { alias: string; entityType?: 'BUSINESS' | 'PRODUCT' | 'SERVICE'; entityId?: string }): Promise<DiscoverySearchAlias> {
    return request<DiscoverySearchAlias>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/search-aliases`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteSearchAlias(businessId: string, aliasId: string): Promise<void> {
    await request<unknown>(`/api/discovery/businesses/${encodeURIComponent(businessId)}/search-aliases/${encodeURIComponent(aliasId)}`, {
      method: 'DELETE',
    });
  },

  /**
   * Business owner analytics
   */
  async getBusinessAnalytics(businessId: string, days = 30): Promise<{ periodDays: number; data: DiscoveryAnalyticsSummary[] }> {
    const authHeaders = authClient.getAuthHeaders();
    const url = `/api/discovery/businesses/${encodeURIComponent(businessId)}/analytics?days=${days}`;
    const res = await fetch(url, { headers: { Accept: 'application/json', ...authHeaders } });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new DiscoveryApiError(body?.error?.message || 'Failed to load analytics', body?.error?.code, res.status);
    }
    return {
      periodDays: body.periodDays || days,
      data: Array.isArray(body.data) ? body.data : [],
    };
  },

  // ---------------------------------------------------------------------------
  // Administrator & Moderation Operations (Super Admin / Admin)
  // ---------------------------------------------------------------------------

  async approveBusiness(id: string, reason?: string): Promise<DiscoveryBusiness> {
    return request<DiscoveryBusiness>(`/api/discovery/businesses/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async suspendBusiness(id: string, reason?: string): Promise<DiscoveryBusiness> {
    return request<DiscoveryBusiness>(`/api/discovery/businesses/${encodeURIComponent(id)}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async getModerationVerification(): Promise<DiscoveryVerificationApplication[]> {
    return request<DiscoveryVerificationApplication[]>('/api/discovery/moderation/verification');
  },

  async decideVerification(id: string, status: 'APPROVED' | 'REJECTED', reason?: string): Promise<DiscoveryVerificationApplication> {
    return request<DiscoveryVerificationApplication>(`/api/discovery/moderation/verification/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    });
  },

  async getModerationReviews(status = 'PENDING'): Promise<DiscoveryReview[]> {
    return request<DiscoveryReview[]>(`/api/discovery/moderation/reviews?status=${encodeURIComponent(status)}`);
  },

  async decideReview(id: string, status: 'PUBLISHED' | 'REJECTED' | 'HIDDEN', reason?: string): Promise<DiscoveryReview> {
    return request<DiscoveryReview>(`/api/discovery/moderation/reviews/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    });
  },

  async getModerationClaims(): Promise<DiscoveryBusinessClaim[]> {
    return request<DiscoveryBusinessClaim[]>('/api/discovery/moderation/claims');
  },

  async decideClaim(id: string, status: 'APPROVED' | 'REJECTED', reason?: string): Promise<DiscoveryBusinessClaim> {
    return request<DiscoveryBusinessClaim>(`/api/discovery/moderation/claims/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    });
  },

  async getModerationReports(status = ''): Promise<DiscoveryReport[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<DiscoveryReport[]>(`/api/discovery/moderation/reports${qs}`);
  },

  async decideReport(id: string, status: 'RESOLVED' | 'DISMISSED' | 'UNDER_REVIEW', note?: string): Promise<DiscoveryReport> {
    return request<DiscoveryReport>(`/api/discovery/moderation/reports/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    });
  },
};
