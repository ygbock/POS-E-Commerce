import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Customer, Order } from '../../types';
import { useStorefrontContext } from '../../context/StorefrontContext';
import { storefrontApi, type StorefrontCartValidation } from '../../services/storefrontApi';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';
import { StoreCheckoutHeader } from './StoreCheckoutHeader';
import { StoreCheckoutForm } from './StoreCheckoutForm';
import { StoreCheckoutSummary } from './StoreCheckoutSummary';

interface StoreCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderSuccess: (order: Order) => void;
}

export const StoreCheckoutModal: React.FC<StoreCheckoutModalProps> = ({
  isOpen,
  onClose,
  onOrderSuccess,
}) => {
  const { tenant, storeCart, clearStoreCart, formatCurrency: formatTenantCurrency } = useStorefrontContext();

  // Public storefront checkout is deliberately guest-first. Customer account
  // state belongs to the authenticated account portal, not the back-office
  // CommerceContext. Account claiming/tracking remains available after order placement.
  const activeCustomerUser: Customer | null = null;
  const customers: Customer[] = [];
  const setActiveCustomerUser = (_customer: Customer | null) => {};

  // Mode: Guest checkout vs Customer Account
  const [isGuestMode, setIsGuestMode] = useState<boolean>(!activeCustomerUser);

  // Form Fields
  const [customerName, setCustomerName] = useState(activeCustomerUser?.name || '');
  const [customerEmail, setCustomerEmail] = useState(activeCustomerUser?.email || '');
  const [customerPhone, setCustomerPhone] = useState(activeCustomerUser?.phone || '');
  const [street, setStreet] = useState(activeCustomerUser?.addresses[0]?.street || '');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState(activeCustomerUser?.addresses[0]?.city || '');
  const [state, setState] = useState('');
  const [zip, setZip] = useState(activeCustomerUser?.addresses[0]?.zip || '');
  const [country, setCountry] = useState('');

  // Selected Saved Address Index
  const [selectedAddressIndex, setSelectedAddressIndex] = useState<number>(0);

  const [fulfillmentMethod, setFulfillmentMethod] = useState<
    'Standard Delivery' | 'Express Delivery' | 'In-Store Pickup'
  >('Standard Delivery');

  const [paymentMethod, setPaymentMethod] = useState<
    'Credit Card' | 'Mobile Money' | 'Fintech Wallet' | 'Store Credit' | 'BNPL'
  >('Credit Card');

  // Card details
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(activeCustomerUser?.name || '');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [saveCard, setSaveCard] = useState(true);

  // Checkout extras
  const [smsOptIn, setSmsOptIn] = useState(true);
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);

  // Gift Wrap & Notes
  const [isGift, setIsGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true);

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [cartValidation, setCartValidation] = useState<StorefrontCartValidation | null>(null);

  // Live Timer (15 minutes countdown)
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(899);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setTimeLeftSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Synchronize when activeCustomerUser changes
  useEffect(() => {
    if (activeCustomerUser) {
      setCustomerName(activeCustomerUser.name);
      setCustomerEmail(activeCustomerUser.email);
      setCustomerPhone(activeCustomerUser.phone);
      setCardHolder(activeCustomerUser.name);
      if (activeCustomerUser.addresses && activeCustomerUser.addresses.length > 0) {
        const addr = activeCustomerUser.addresses[selectedAddressIndex] || activeCustomerUser.addresses[0];
        setStreet(addr.street);
        setCity(addr.city);
        setState('');
        setZip(addr.zip);
        setCountry('');
      }
      setIsGuestMode(false);
    }
  }, [activeCustomerUser, selectedAddressIndex]);

  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(isOpen, onClose, modalRef, { closeOnEscape: !isSubmitting });

  if (!isOpen) return null;

  // Format time left mm:ss
  const minutes = Math.floor(timeLeftSeconds / 60);
  const seconds = timeLeftSeconds % 60;
  const timerDisplay = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  // Card brand detection logic
  const getCardBrand = (numberStr: string) => {
    const cleaned = numberStr.replace(/\D/g, '');
    if (cleaned.startsWith('4')) return { name: 'Visa', color: 'text-blue-500', bg: 'bg-blue-500/10' };
    if (/^5[1-5]/.test(cleaned) || /^2[2-7]/.test(cleaned)) return { name: 'Mastercard', color: 'text-rose-500', bg: 'bg-rose-500/10' };
    if (/^3[47]/.test(cleaned)) return { name: 'Amex', color: 'text-sky-500', bg: 'bg-sky-500/10' };
    if (/^6(?:011|5)/.test(cleaned)) return { name: 'Discover', color: 'text-amber-500', bg: 'bg-amber-500/10' };
    return { name: 'Card', color: 'text-slate-400', bg: 'bg-slate-500/10' };
  };

  const currentBrand = getCardBrand(cardNumber);

  const validateServerCart = async () => {
    if (!tenant?.slug) {
      throw new Error('Storefront tenant context is unavailable. Please refresh and try again.');
    }

    const validation = await storefrontApi.validateCart(
      tenant.slug,
      storeCart.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      })),
      undefined,
      fulfillmentMethod,
    );
    setCartValidation(validation);

    const unavailable = validation.items.filter((item) => !item.isAvailable);
    if (unavailable.length > 0) {
      const first = unavailable[0];
      throw new Error(
        first
          ? `${first.name} has only ${first.availableStock} available. Please update your cart.`
          : 'One or more cart items are no longer available.'
      );
    }

    return validation;
  };


  useEffect(() => {
    if (!isOpen || !tenant?.slug || storeCart.length === 0) {
      setCartValidation(null);
      return;
    }

    let cancelled = false;
    validateServerCart()
      .catch(() => {
        if (!cancelled) setCartValidation(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, tenant?.slug, fulfillmentMethod, storeCart]);

  // Cart pricing, tax, shipping and availability are server-authoritative.
  const subtotal = Number(cartValidation?.subtotal || 0);
  const tax = Number(cartValidation?.tax || 0);
  const shippingFee = Number(cartValidation?.shippingFee || 0);
  const discount = 0;
  const total = Number(cartValidation?.total || 0);
  const displayCurrency = formatTenantCurrency;

  const handleExpressPay = async (provider: string) => {
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await validateServerCart();

      const response = await storefrontApi.placeOrder(tenant?.slug, {
        customer: {
          name: customerName.trim(),
          email: customerEmail.trim(),
          phone: customerPhone.trim(),
          address: { street, city, state, zip, country },
        },
        fulfillmentMethod,
        paymentMethod: 'Fintech Wallet',
        smsOptIn,
        whatsappOptIn,
        cart_items: storeCart.map((item) => ({ variantId: item.variantId, quantity: String(item.quantity) })),
        idempotency_key: crypto.randomUUID(),
      });
      const rawOrder = response?.order || response;
      const order = {
        ...rawOrder,
        orderNumber: rawOrder.orderNumber || rawOrder.order_number,
        paymentStatus: rawOrder.paymentStatus || rawOrder.payment_status,
        fulfillmentMethod: rawOrder.fulfillmentMethod || rawOrder.fulfillment_method,
        createdAt: rawOrder.createdAt || rawOrder.created_at,
        customerName: rawOrder.customerName || rawOrder.customer_name || customerName,
        customerEmail: rawOrder.customerEmail || rawOrder.customer_email || customerEmail,
        totalAmount: Number(rawOrder.totalAmount ?? rawOrder.total_amount ?? 0),
      } as Order;

      try {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.6 },
        });
      } catch {
        // ignore
      }

      onOrderSuccess(order);
      clearStoreCart();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while placing the order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreeTerms) return;

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      await validateServerCart();

      const selectedPayment: 'Credit Card' | 'Mobile Money' | 'Fintech Wallet' =
        paymentMethod === 'Store Credit' || paymentMethod === 'BNPL' ? 'Fintech Wallet' : paymentMethod;

      const response = await storefrontApi.placeOrder(tenant?.slug, {
        customer: {
          name: customerName.trim(),
          email: customerEmail.trim(),
          phone: customerPhone.trim(),
          address: { street, city, state, zip, country },
        },
        fulfillmentMethod,
        paymentMethod: selectedPayment,
        smsOptIn,
        whatsappOptIn,
        cart_items: storeCart.map((item) => ({ variantId: item.variantId, quantity: String(item.quantity) })),
        idempotency_key: crypto.randomUUID(),
      });
      const rawOrder = response?.order || response;
      const order = {
        ...rawOrder,
        orderNumber: rawOrder.orderNumber || rawOrder.order_number,
        paymentStatus: rawOrder.paymentStatus || rawOrder.payment_status,
        fulfillmentMethod: rawOrder.fulfillmentMethod || rawOrder.fulfillment_method,
        createdAt: rawOrder.createdAt || rawOrder.created_at,
        customerName: rawOrder.customerName || rawOrder.customer_name || customerName,
        customerEmail: rawOrder.customerEmail || rawOrder.customer_email || customerEmail,
        totalAmount: Number(rawOrder.totalAmount ?? rawOrder.total_amount ?? 0),
      } as Order;

      try {
        confetti({
          particleCount: 110,
          spread: 85,
          origin: { y: 0.6 },
        });
      } catch {
        // ignore
      }

      onOrderSuccess(order);
      clearStoreCart();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while placing the order.');
    } finally {
      setIsSubmitting(false);
    }
  };


  const checkout = { activeCustomerUser, customers, setActiveCustomerUser, isGuestMode, setIsGuestMode, customerName, setCustomerName, customerEmail, setCustomerEmail, customerPhone, setCustomerPhone, street, setStreet, apartment, setApartment, city, setCity, state, setState, zip, setZip, country, setCountry, selectedAddressIndex, setSelectedAddressIndex, fulfillmentMethod, setFulfillmentMethod, paymentMethod, setPaymentMethod, cardNumber, setCardNumber, cardHolder, setCardHolder, cardExpiry, setCardExpiry, cardCvc, setCardCvc, saveCard, setSaveCard, smsOptIn, setSmsOptIn, whatsappOptIn, setWhatsappOptIn, isGift, setIsGift, giftMessage, setGiftMessage, orderNotes, setOrderNotes, agreeTerms, setAgreeTerms, isSubmitting, errorMsg, storeCart, total, subtotal, tax, shippingFee, discount, cartValidation, displayCurrency, currentBrand, handleExpressPay, handleSubmit };
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200" onClick={(e) => { if (!isSubmitting && e.target === e.currentTarget) onClose(); }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="store-checkout-modal-title" tabIndex={-1} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-6xl shadow-2xl overflow-hidden animate-in zoom-in-95 text-slate-900 dark:text-white max-h-[94vh] flex flex-col focus:outline-none">
        <StoreCheckoutHeader timerDisplay={timerDisplay} isSubmitting={isSubmitting} onClose={onClose} />
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-full">
            <StoreCheckoutForm checkout={checkout} />
            <StoreCheckoutSummary checkout={checkout} />
          </div>
        </div>
      </div>
    </div>
  );
};
