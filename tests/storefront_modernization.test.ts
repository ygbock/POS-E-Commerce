import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const context = read('src/context/StorefrontContext.tsx');
assert.match(context, /storefront:\$\{encodeURIComponent\(slug\)\}:cart/);
assert.match(context, /export interface StoreCartItem/);
assert.match(context, /clearStoreCart/);

const router = read('server/routes/storefrontRoutes.ts');
assert.match(router, /p\.channels_ecommerce = true/);
assert.match(router, /ORDER_VERIFICATION_FAILED/);
assert.match(router, /router\.get\('\/orders\/:orderNumber'/);
assert.match(router, /router\.get\('\/:tenantSlug\/orders\/:orderNumber'/);

const api = read('src/services/storefrontApi.ts');
assert.match(api, /trackOrder\(tenantSlug/);
assert.match(api, /encodeURIComponent\(orderNumber\)/);

const tracking = read('src/components/storefront/OrderTrackingModal.tsx');
assert.match(tracking, /storefrontApi\.trackOrder/);
assert.doesNotMatch(tracking, /orders\.find\(/);

console.log('Storefront modernization contracts: PASS');

const cartDrawer = read('src/components/storefront/StoreCartDrawer.tsx');
assert.match(cartDrawer, /storefrontApi\s*\.\s*validateCart/);
assert.match(cartDrawer, /StorefrontCartValidation/);
assert.match(cartDrawer, /Server-Calculated Total/);
assert.match(cartDrawer, /disabled=\{!canProceedToCheckout\}/);
assert.doesNotMatch(cartDrawer, /useCommerce/);
assert.doesNotMatch(cartDrawer, /freeShippingThreshold = 75/);
assert.doesNotMatch(cartDrawer, /appliedCoupon|applyCoupon|removeCoupon/);

const checkoutModal = read('src/components/storefront/StoreCheckoutModal.tsx');
assert.match(checkoutModal, /StoreCheckoutHeader/);
assert.match(checkoutModal, /StoreCheckoutForm/);
assert.match(checkoutModal, /StoreCheckoutSummary/);
assert.doesNotMatch(checkoutModal, /useCommerce/);
assert.doesNotMatch(checkoutModal, /<form onSubmit=\{handleSubmit\}/);

const checkoutForm = read('src/components/storefront/StoreCheckoutForm.tsx');
assert.match(checkoutForm, /handleSubmit/);
assert.match(checkoutForm, /handleExpressPay/);
assert.match(checkoutForm, /setFulfillmentMethod/);

const checkoutSummary = read('src/components/storefront/StoreCheckoutSummary.tsx');
assert.match(checkoutSummary, /Order Summary/);
assert.match(checkoutSummary, /Total Amount/);

const checkoutHeader = read('src/components/storefront/StoreCheckoutHeader.tsx');
assert.match(checkoutHeader, /Secure Checkout/);
assert.match(checkoutHeader, /timerDisplay/);

assert.doesNotMatch(checkoutForm, /subtotal >= 75/);
assert.doesNotMatch(checkoutForm, /\$5\.00 Flat Rate|\$15\.00 Priority/);
assert.doesNotMatch(checkoutForm, /FREE Dispatch|FREE Collection|Free Gift Wrap/);
assert.doesNotMatch(checkoutForm, /WELCOME20|FREESHIP/);
assert.match(checkoutForm, /shippingFee/);

assert.doesNotMatch(checkoutSummary, /WELCOME20|FREESHIP/);
assert.match(checkoutSummary, /cartValidation/);

const cartService = read('server/services/storefrontCartService.ts');
assert.match(cartService, /fulfillmentMethod/);
assert.match(cartService, /expressShippingFee/);
assert.doesNotMatch(cartService, /expressShippingFee\\?\\? config\\.policies\\.standardShippingFee/);
assert.doesNotMatch(cartService, /75\.00/);

const tenantResolver = read('server/services/tenantResolver.ts');
assert.match(tenantResolver, /requiredPolicyMoney/);
assert.match(tenantResolver, /STORE_POLICY_MISSING/);
assert.match(tenantResolver, /STORE_POLICY_INVALID/);
assert.doesNotMatch(tenantResolver, /freeShippingThreshold: Number\\(rawPolicies\\.freeShippingThreshold \\?\\? 75\\.00\\)/);
assert.doesNotMatch(tenantResolver, /standardShippingFee: Number\\(rawPolicies\\.standardShippingFee \\?\\? 9\\.99\\)/);
assert.doesNotMatch(tenantResolver, /expressShippingFee: Number\\(rawPolicies\\.expressShippingFee \\?\\? 19\\.99\\)/);
assert.doesNotMatch(tenantResolver, /Standard shipping delivers within 3-5 business days/);
assert.doesNotMatch(tenantResolver, /Returns accepted within 30 days of receipt/);
assert.doesNotMatch(tenantResolver, /Standard 1-year manufacturer warranty/);
assert.doesNotMatch(tenantResolver, /Orders placed before 2 PM dispatch same-day/);
assert.doesNotMatch(tenantResolver, /Ready for pickup within 2 hours/);

const policyMigration = read('server/db/migrations/053_storefront_policy_defaults_fail_closed.sql');
assert.match(policyMigration, /ALTER COLUMN policies SET DEFAULT '\{\}'::jsonb/);
assert.doesNotMatch(policyMigration, /75\\.00|9\\.99|19\\.99/);

const storefrontApi = read('src/services/storefrontApi.ts');
assert.match(storefrontApi, /fulfillmentMethod/);

const orderService = read('server/services/orderService.ts');
assert.doesNotMatch(orderService, /75\.00|19\.99|9\.99/);
assert.match(orderService, /STORE_POLICY_MISSING/);
assert.match(orderService, /requiredPolicyMoney/);

const overlays = read('src/components/storefront/StorefrontOverlays.tsx');
assert.match(overlays, /onClose=\{\(\) => goHome\(\)\}/);
assert.match(overlays, /onClose=\{\(\) => goCart\(\)\}/);
assert.match(overlays, /onClose=\{\(\) => goShop\(\)\}/);
assert.match(overlays, /goHome: \(\) => void/);
assert.match(overlays, /goShop: \(\) => void/);

const storefront = read('src/components/storefront/Storefront.tsx');
assert.match(storefront, /onOpenCart=\{goCart\}/);
assert.match(storefront, /onOpenAccount=\{\(\) => goAccount\('profile'\)\}/);

const checkoutModalCouponGuard = read('src/components/storefront/StoreCheckoutModal.tsx');
assert.doesNotMatch(checkoutModalCouponGuard, /discount_code/);
assert.doesNotMatch(checkoutModalCouponGuard, /handleApplyCoupon|couponInput|discountCode/);
assert.doesNotMatch(checkoutModalCouponGuard, /WELCOME20|FREESHIP/);

const checkoutSummaryPolicyGuard = read('src/components/storefront/StoreCheckoutSummary.tsx');
assert.doesNotMatch(checkoutSummaryPolicyGuard, /Promo Code or Voucher|Coupon Code Engine|Same-Day Dispatch|30-Day Money Back/);
assert.match(checkoutSummaryPolicyGuard, /Checkout pricing, availability, and fulfillment fees are verified by the store server/);


const productCard = read('src/components/storefront/ProductCard.tsx');
assert.doesNotMatch(productCard, /useCommerce/);
assert.match(productCard, /useStorefrontContext/);

const mobileBottomNav = read('src/components/storefront/MobileBottomNav.tsx');
assert.doesNotMatch(mobileBottomNav, /useCommerce/);
assert.match(mobileBottomNav, /useStorefrontContext/);
assert.match(context, /toggleWishlist/);


const brandShowcase = read('src/components/storefront/BrandShowcase.tsx');
assert.doesNotMatch(brandShowcase, /useCommerce/);
assert.match(brandShowcase, /products: Product\[\]/);

const categoryShowcase = read('src/components/storefront/CategoryShowcase.tsx');
assert.doesNotMatch(categoryShowcase, /useCommerce/);
assert.match(categoryShowcase, /products: Product\[\]/);

const mobileFilters = read('src/components/storefront/MobileFilterDrawer.tsx');
assert.doesNotMatch(mobileFilters, /useCommerce/);
assert.match(mobileFilters, /products: Product\[\]/);

const promotions = read('src/components/storefront/PromotionsBanner.tsx');
assert.doesNotMatch(promotions, /useCommerce|WELCOME20|VIP15|FREESHIP|AUDIO10|GUEST5/);
assert.match(promotions, /verified by the store server during checkout/);

const newsletter = read('src/components/storefront/NewsletterSection.tsx');
assert.doesNotMatch(newsletter, /useCommerce|WELCOME15|applyCoupon/);
assert.match(newsletter, /NewsletterSectionProps/);


const wishlistDrawer = read('src/components/storefront/WishlistDrawer.tsx');
assert.doesNotMatch(wishlistDrawer, /useCommerce/);
assert.match(wishlistDrawer, /useStorefrontContext/);
assert.match(wishlistDrawer, /wishlistIds/);


const quickView = read('src/components/storefront/QuickViewModal.tsx');
assert.doesNotMatch(quickView, /useCommerce/);
assert.match(quickView, /useStorefrontContext/);
assert.match(quickView, /wishlistIds/);
assert.match(quickView, /pickupLocations/);
