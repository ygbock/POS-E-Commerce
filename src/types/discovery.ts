/**
 * AbaCha Unified Commerce — Discovery Domain Types (FRONT-001)
 *
 * Authoritative types mirroring the backend database schema and API contracts
 * established in server/routes/discoveryRoutes.ts and docs/DISCOVERY_IMPLEMENTATION_STATUS.md.
 */

export type DiscoveryListingStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'PAUSED'
  | 'SUSPENDED'
  | 'ARCHIVED';

export type DiscoveryVerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'SUSPENDED';

export type DiscoveryBusinessMode =
  | 'DISCOVERY_ONLY'
  | 'DISCOVERY_AND_STORE';

export type DiscoveryBookingMode =
  | 'REQUEST'
  | 'BOOKING'
  | 'QUOTE';

export type DiscoveryLocationType =
  | 'STORE'
  | 'OFFICE'
  | 'BRANCH'
  | 'WAREHOUSE'
  | 'HOME_BASED'
  | 'MOBILE'
  | 'SERVICE_AREA'
  | 'KIOSK'
  | 'OTHER';

export type DiscoveryLocationQualityStatus = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERIFIED';
export type DiscoveryLocationSource = 'MANUAL' | 'GPS' | 'GEOCODED' | 'IMPORTED' | 'VERIFIED';

export type DiscoveryEventType =
  | 'SEARCH'
  | 'IMPRESSION'
  | 'VIEW'
  | 'CONTACT'
  | 'DIRECTION_CLICK'
  | 'STORE_CLICK'
  | 'PRODUCT_VIEW'
  | 'SERVICE_VIEW'
  | 'SERVICE_REQUEST'
  | 'ORDER_CLICK';

export type DiscoverySearchType =
  | 'all'
  | 'businesses'
  | 'products'
  | 'services';

export type DiscoverySortOption =
  | 'relevance'
  | 'rating'
  | 'review_count'
  | 'name_asc'
  | 'newest'
  | 'distance';

export type DiscoveryAvailabilityStatus =
  | 'available'
  | 'limited'
  | 'out_of_stock'
  | 'check_stock'
  | 'unknown';

export type DiscoveryDataState =
  | 'loading'
  | 'loaded'
  | 'empty'
  | 'error'
  | 'network_error'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'invalid_input'
  | 'location_unavailable'
  | 'location_denied'
  | 'not_found'
  | 'suspended';

/**
 * Public and administrative business listing record
 */
export interface DiscoveryFavoriteBusiness extends DiscoveryBusiness {
  favorite_id: string;
  favorited_at: string;
}

export interface DiscoveryBusiness {
  id: string;
  searchId?: string;
  resultPosition?: number;
  attributionEntityType?: 'BUSINESS';
  public_id: string;
  organization_id?: string | null;
  tenant_slug?: string | null;
  name: string;
  slug: string;
  business_type?: string | null;
  short_description?: string | null;
  description?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  cover_image_url?: string | null;
  business_mode: DiscoveryBusinessMode;
  listing_status: DiscoveryListingStatus;
  verification_status: DiscoveryVerificationStatus;
  is_discoverable: boolean;
  created_at?: string;
  updated_at?: string;
  // Denormalized/Search Projection attributes
  city?: string | null;
  district?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  category_name?: string | null;
  category_slug?: string | null;
  rating?: number | string;
  review_count?: number;
  relevance?: number;
  distance_km?: number | string | null;
}

/**
 * Business physical location or service area
 */
export interface DiscoveryLocation {
  id: string;
  business_id: string;
  name: string;
  location_type: DiscoveryLocationType;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  district?: string | null;
  region?: string | null;
  service_radius_km?: number | string | null;
  location_quality_status?: DiscoveryLocationQualityStatus;
  location_source?: DiscoveryLocationSource;
  address_completeness_score?: number;
  coordinate_accuracy_m?: number | string | null;
  location_verified_at?: string | null;
  location_verified_by_user_id?: string | null;
  quality_notes?: string | null;
  country: string;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  is_primary: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Weekly operating hours per location (day_of_week 1=Monday .. 7=Sunday)
 */
export interface DiscoveryBusinessHours {
  id: string;
  location_id: string;
  day_of_week: number;
  is_closed: boolean;
  opens_at?: string | null;
  closes_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Business public discovery visibility settings
 */
export interface DiscoveryBusinessSettings {
  business_id: string;
  show_products: boolean;
  show_prices: boolean;
  show_stock_status: boolean;
  allow_phone_contact: boolean;
  allow_whatsapp_contact: boolean;
  allow_directions: boolean;
  allow_service_requests: boolean;
  allow_reviews: boolean;
  allow_public_store_link: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Discovery category taxonomy
 */
export interface DiscoveryCategory {
  id: string;
  parent_id?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  icon_name?: string | null;
  display_order: number;
  is_active: boolean;
  item_count?: number;
}

/**
 * Projected product variant in discovery search
 */
export interface DiscoveryProduct {
  product_id: string;
  searchId?: string;
  resultPosition?: number;
  attributionEntityType?: 'PRODUCT';
  product_name: string;
  product_slug: string;
  short_description?: string | null;
  description?: string | null;
  images?: string[] | null;
  organization_id: string;
  business_id: string;
  business_name: string;
  business_slug: string;
  business_public_id: string;
  city?: string | null;
  district?: string | null;
  region?: string | null;
  variant_id: string;
  sku?: string | null;
  variant_name?: string | null;
  retail_price: string | number;
  available_stock: string | number;
  show_prices?: boolean;
  show_stock_status?: boolean;
  distance_km?: number | string | null;
}

/**
 * Service listing offered by a discovery business
 */
export interface DiscoveryService {
  id: string;
  searchId?: string;
  resultPosition?: number;
  attributionEntityType?: 'SERVICE';
  business_id: string;
  name: string;
  slug: string;
  description?: string | null;
  service_type?: string | null;
  price_from?: number | string | null;
  price_to?: number | string | null;
  currency: string;
  duration_minutes?: number | null;
  service_area_text?: string | null;
  booking_mode: DiscoveryBookingMode;
  is_active: boolean;
  business_name?: string;
  business_slug?: string;
  business_public_id?: string;
  verification_status?: DiscoveryVerificationStatus;
  city?: string | null;
  district?: string | null;
  region?: string | null;
  created_at?: string;
  updated_at?: string;
  distance_km?: number | string | null;
}

/**
 * Customer review for a business
 */
export interface DiscoveryReview {
  id: string;
  reviewer_name: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  verified_purchase: boolean;
  created_at: string;  merchant_response?: string | null;
  merchant_response_created_at?: string | null;
}

export interface DiscoveryReviewsSummary {
  rating: number | string;
  count: number;
}

export interface DiscoveryReviewsResponse {
  summary: DiscoveryReviewsSummary;
  data: DiscoveryReview[];
}

export type DiscoveryContactInquiryStatus = 'OPEN' | 'READ' | 'RESPONDED' | 'CLOSED';

export interface DiscoveryContactInquiry {
  id: string;
  business_id: string;
  business_name?: string;
  customer_user_id?: string | null;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  subject?: string | null;
  message: string;
  status: DiscoveryContactInquiryStatus;
  merchant_note?: string | null;
  responded_at?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Customer service quote request
 */
export interface DiscoveryServiceRequest {
  id: string;
  customer_user_id?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  description: string;
  city?: string | null;
  district?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  preferred_date?: string | null;
  budget_from?: number | string | null;
  budget_to?: number | string | null;
  status: 'OPEN' | 'MATCHED' | 'QUOTED' | 'ACCEPTED' | 'CANCELLED' | 'CLOSED';
  created_at?: string;
  updated_at?: string;
  matches?: Array<{ businessId: string; businessName: string; score: number }>;
  quotes?: DiscoveryServiceQuote[];
}

/**
 * Provider response/quote to a service request
 */
export interface DiscoveryServiceQuote {
  id: string;
  request_id: string;
  business_id: string;
  service_id?: string | null;
  amount: number | string;
  currency: string;
  message?: string | null;
  estimated_duration_minutes?: number | null;
  valid_until?: string | null;
  business_name?: string;
  service_name?: string;
  created_at?: string;
  updated_at?: string;
  status: 'SUBMITTED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'WITHDRAWN';
}

/**
 * Business ownership claim for unverified/unclaimed businesses
 */
export interface DiscoveryVerificationApplication {
  id: string;
  business_id: string;
  applicant_user_id: string;
  evidence: Record<string, unknown>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  review_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryMerchantTrustCenter {
  businessId: string;
  businessName: string;
  verificationStatus: DiscoveryVerificationStatus;
  listingStatus: DiscoveryListingStatus;
  businessMode: DiscoveryBusinessMode;
  trustCenter: {
    verification: {
      status: DiscoveryVerificationStatus;
      applications: Array<{
        id: string;
        business_id: string;
        status: DiscoveryVerificationApplication['status'];
        created_at: string;
        updated_at: string;
        reviewed_at?: string | null;
        review_reason?: string | null;
      }>;
    };
    claims: Array<{
      id: string;
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
      created_at: string;
      reviewed_at?: string | null;
      review_reason?: string | null;
      submitted_by_current_user: boolean;
    }>;
    reviews: {
      publishedCount: number;
      pendingCount: number;
      rejectedCount: number;
      hiddenCount: number;
      publishedRating: number;
    };
    reports: Array<{
      id: string;
      reason_code: string;
      status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
      resolution_note?: string | null;
      created_at: string;
      resolved_at?: string | null;
      target_type: 'BUSINESS' | 'SERVICE';
    }>;
    timeline: Array<{
      id: string;
      entity_type: 'BUSINESS' | 'CLAIM' | 'VERIFICATION' | 'REVIEW' | 'REPORT';
      event_type: string;
      from_status?: string | null;
      to_status?: string | null;
      reason?: string | null;
      created_at: string;
    }>;
    requiredActions: string[];
  };
}

export interface DiscoveryBusinessClaim {
  id: string;
  business_id: string;
  claimant_user_id: string;
  claimant_name: string;
  claimant_email?: string | null;
  evidence: Record<string, unknown>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  business_name?: string;
  created_at: string;
  review_reason?: string | null;
  reviewed_at?: string | null;
}

/**
 * Moderation abuse report for a business or service
 */
export interface DiscoveryReport {
  id: string;
  business_id?: string | null;
  service_id?: string | null;
  reporter_user_id?: string | null;
  reason_code: string;
  description?: string | null;
  status: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
  business_name?: string | null;
  service_name?: string | null;
  resolution_note?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

/**
 * Aggregate discovery analytics summary
 */
export interface DiscoveryAnalyticsSummary {
  business_id: string; timeframe: string; impressions: number; profile_views: number; phone_clicks: number; whatsapp_clicks: number; direction_clicks: number; website_clicks: number; service_inquiries: number; store_visits: number; conversion_rate: number;
}

/**
 * Aggregated search result container
 */
export interface DiscoverySearchResult {
  businesses: DiscoveryBusiness[];
  products: DiscoveryProduct[];
  services: DiscoveryService[];
}

export interface DiscoverySearchCounts {
  businesses: number;
  products: number;
  services: number;
}

export interface DiscoverySearchFilters {
  q?: string;
  type?: DiscoverySearchType;
  city?: string;
  district?: string;
  region?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  openNow?: boolean;
  categoryId?: string;
  sort?: DiscoverySortOption;
  limit?: number;
  offset?: number;
}

export interface DiscoverySearchRankingConfig {
  id: string;
  text_match_weight: number | string;
  exact_match_weight: number | string;
  prefix_match_weight: number | string;
  verified_weight: number | string;
  rating_weight: number | string;
  review_count_weight: number | string;
  fuzzy_match_weight: number | string;
  distance_penalty_weight: number | string;
  availability_weight: number | string;
  is_active: boolean;
  updated_by_user_id?: string | null;
  updated_at?: string;
}

export interface DiscoverySearchAttributionEvent {
  eventId: string;
  searchId: string;
  eventType: 'IMPRESSION' | 'VIEW' | 'CONTACT' | 'DIRECTION_CLICK' | 'STORE_CLICK' | 'PRODUCT_VIEW' | 'SERVICE_VIEW' | 'SERVICE_REQUEST' | 'ORDER_CLICK';
  entityType: 'BUSINESS' | 'PRODUCT' | 'SERVICE';
  entityId: string;
  resultPosition?: number;
  source?: string;
}

export interface DiscoverySearchResponse {
  success: boolean;
  searchId: string;
  query: string;
  type: DiscoverySearchType;
  filters: {
    city?: string | null;
    district?: string | null;
    region?: string | null;
    openNow?: boolean;
    radiusKm?: number;
  };
  data: DiscoverySearchResult;
  counts: DiscoverySearchCounts;
}

/**
 * Full public business profile response
 */
export interface DiscoveryPublicBusinessProfile {
  business: DiscoveryBusiness;
  locations: DiscoveryLocation[];
  categories: DiscoveryCategory[];
  settings: DiscoveryBusinessSettings;
  reviewsSummary: DiscoveryReviewsSummary;
  recentReviews: DiscoveryReview[];
  activeServices: DiscoveryService[];
}

export interface DiscoverySearchAlias {
  id: string;
  entity_type: 'BUSINESS' | 'PRODUCT' | 'SERVICE';
  entity_id: string;
  alias: string;
  created_at?: string;
  updated_at?: string;
}
