import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Customer, Order } from '../../types';
import { useStorefrontContext } from '../../context/StorefrontContext';
import { storefrontApi } from '../../services/storefrontApi';
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

  // Coupon & Extras
  const [couponInput, setCouponInput] = useState('');
  const [couponMsg, setCouponMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [discountCode, setDiscountCode] = useState('');
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

  // Live Timer (15 minutes countdown)
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(899);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setTimeLeftSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
  
  const checkout = { activeCustomerUser, customers, setActiveCustomerUser, isGuestMode, setIsGuestMode, customerName, setCustomerName, customerEmail, setCustomerEmail, customerPhone, setCustomerPhone, street, setStreet, apartment, setApartment, city, setCity, state, setState, zip, setZip, country, setCountry, selectedAddressIndex, setSelectedAddressIndex, fulfillmentMethod, setFulfillmentMethod, paymentMethod, setPaymentMethod, cardNumber, setCardNumber, cardHolder, setCardHolder, cardExpiry, setCardExpiry, cardCvc, setCardCvc, saveCard, setSaveCard, couponInput, setCouponInput, couponMsg, discountCode, setDiscountCode, setCouponMsg, smsOptIn, setSmsOptIn, whatsappOptIn, setWhatsappOptIn, isGift, setIsGift, giftMessage, setGiftMessage, orderNotes, setOrderNotes, agreeTerms, setAgreeTerms, isSubmitting, errorMsg, storeCart, total, subtotal, tax, shippingFee, displayCurrency, currentBrand, handleApplyCoupon, handleExpressPay, handleSubmit };
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
