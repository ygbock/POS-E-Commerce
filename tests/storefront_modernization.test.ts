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
assert.match(checkoutSummary, /discountCode/);
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
assert.doesNotMatch(cartService, /75\.00/);

const storefrontApi = read('src/services/storefrontApi.ts');
assert.match(storefrontApi, /fulfillmentMethod/);
