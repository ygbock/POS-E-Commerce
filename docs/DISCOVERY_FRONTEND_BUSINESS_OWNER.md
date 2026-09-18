# FRONT-006 — Business Owner Discovery UI Implementation Documentation

## Overview

The **Business Owner Discovery UI** provides merchant administrators and local service providers with an end-to-end command center to manage their public presence on AbaCha Unified Commerce Discovery.

## Implemented Components & Module Architecture

### 1. `DiscoveryBusinessDashboard` (`src/components/discovery/business/DiscoveryBusinessDashboard.tsx`)
- **Profile Health & Completeness Meter**: Real-time calculated checklist tracking business identity, direct contact channels, branch locations, operating hours, service offerings, and verification status.
- **Key 30-Day Operational Metrics**: Search impressions, profile page visits, direct phone & WhatsApp inquiries, directions & store conversion intent.
- **Module Navigation Hub**: Actionable shortcuts to jump into detailed management panels.

### 2. `DiscoveryListingEditor` (`src/components/discovery/business/DiscoveryListingEditor.tsx`)
- **Identity & Slug Management**: Real-time slug auto-generator, legal business name, industry classification, short summary tagline, and full commercial story.
- **Direct Contacts**: Telephone calling, WhatsApp direct order chat integration, customer email, and external website links.
- **Visual Branding**: High-resolution logo and banner cover image URL inputs with live rendering previews.
- **Taxonomy Assignment**: Multi-category tagging linked to `discoveryApi.updateBusinessCategories`.
- **Operating Mode & Discoverability**: Toggle discoverability in public search and upgrade trigger for unified commerce.

### 3. `DiscoveryLocationsPanel` (`src/components/discovery/business/DiscoveryLocationsPanel.tsx`)
- **Branch & Storefront Management**: Add, edit, and toggle active status for retail storefronts, service depots, and mobile coverage zones.
- **GPS Coordinates & Geolocation**: Live GPS coordinate capture via browser geolocation API and manual latitude/longitude input.
- **Primary Branch & Service Radius**: Coverage radius (km) for distance-based discovery calculations.

### 4. `DiscoveryHoursEditor` (`src/components/discovery/business/DiscoveryHoursEditor.tsx`)
- **7-Day Operating Schedule**: Granular opening and closing times per weekday with validation.
- **Productivity Shortcuts**: "Copy Monday to Weekdays (Mon-Fri)" and "Standard Commercial Hours (8:30 - 18:00)" presets.
- **Branch Selection**: Seamless location switcher for multi-location businesses.

### 5. `DiscoverySettingsPanel` (`src/components/discovery/business/DiscoverySettingsPanel.tsx`)
- **Catalog Projection**: Visibility switches for products, retail prices (SLE), and real-time inventory stock indicators.
- **Contact & Action Permissions**: Direct phone calling, WhatsApp ordering, turn-by-turn map directions, service quote intake, public store links, and customer reviews.

### 6. `DiscoveryServicesManager` (`src/components/discovery/business/DiscoveryServicesManager.tsx`)
- **Service Offerings Catalog**: Create and edit professional services (consultations, repairs, catering, installations, trade services).
- **Pricing & Booking Models**: Fixed or tiered pricing (From - To SLE), estimated duration in minutes, service area description, and booking modes (`REQUEST`, `QUOTE`, `BOOKING`).

### 7. `DiscoveryQuotesInbox` (`src/components/discovery/business/DiscoveryQuotesInbox.tsx`)
- **Incoming Lead Management**: View customer inquiries with budget ranges, requested timeline dates, and location details.
- **Quote Composer**: Submit binding proposals with price (SLE), estimated duration, validity expiry, and customized terms.

### 8. `DiscoveryReviewsPanel` (`src/components/discovery/business/DiscoveryReviewsPanel.tsx`)
- **Reputation Breakdown**: Star ratings summary, aggregate score, and verified order badges.
- **Feedback Filtering**: Filter customer reviews by star rating (1-5 stars).

### 9. `DiscoveryVerificationPanel` (`src/components/discovery/business/DiscoveryVerificationPanel.tsx`)
- **Trust Seal & Verification Status**: Current status indicator (`UNVERIFIED`, `PENDING`, `VERIFIED`).
- **Claim Submission**: Submit Corporate Affairs Commission (CAC) registration numbers, city council licenses, or tax certificates for review.

### 10. `DiscoveryAnalyticsPanel` (`src/components/discovery/business/DiscoveryAnalyticsPanel.tsx`)
- **Timeframe Selector**: Toggle analytics view across 7, 30, and 90-day periods.
- **Engagement Funnel**: Track impressions, profile visits, phone/WhatsApp leads, direction requests, service quote requests, and store conversion rate.

### 11. `DiscoveryStoreConversionModal` (`src/components/discovery/business/DiscoveryStoreConversionModal.tsx`)
- **Discovery-to-Store Upgrade**: Seamless one-click conversion from `DISCOVERY_ONLY` directory listing to full `DISCOVERY_AND_STORE` unified commerce with online checkout, inventory ledger, and POS register.

### 12. `DiscoveryOnboardingWizard` (`src/components/discovery/business/DiscoveryOnboardingWizard.tsx`)
- **3-Step Guided Setup**: Wizard for new merchants to establish their business identity, contact channels, and initial storefront location.

### 13. `DiscoveryBusinessContainer` (`src/components/discovery/business/DiscoveryBusinessContainer.tsx`)
- **Console Orchestration**: Multi-business switcher, responsive top navigation tabs, modal managers, and sub-view switching.

---

## Verification

- `npm run lint` (`tsc --noEmit`): 0 errors.
- `npm run build`: Production bundle succeeded.
