import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Calendar,
  CreditCard,
  X,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Copy,
  Check,
  RotateCcw,
  ArrowRight,
  Boxes,
  Sparkles,
  Mail,
  Smartphone,
  MessageSquare,
  UserPlus,
  Play,
  Lock,
} from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import { useStorefrontContext } from '../../context/StorefrontContext';
import { storefrontApi, StorefrontTrackedOrder } from '../../services/storefrontApi';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';

interface OrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOrderNumber?: string;
  initialEmail?: string;
  onOpenNotificationHub?: (order: Order) => void;
  onOpenClaimModal?: (email: string) => void;
  onOpenClaimAccount?: (email: string) => void;
}

const STATUS_STEPS: { status: OrderStatus; label: string; description: string }[] = [
  { status: 'Pending', label: 'Order Placed', description: 'Order logged & payment verified' },
  { status: 'Payment Confirmed', label: 'Processing', description: 'Warehouse allocation confirmed' },
  { status: 'Picking', label: 'Picking & Packing', description: 'Items packed in warehouse' },
  { status: 'Dispatched', label: 'In Transit', description: 'Carrier tracking active on route' },
  { status: 'Delivered', label: 'Delivered', description: 'Delivered to address or pickup' },
];

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  isOpen,
  onClose,
  initialOrderNumber = '',
  initialEmail = '',
  onOpenNotificationHub,
  onOpenClaimModal,
  onOpenClaimAccount,
}) => {
  const { tenant, formatCurrency } = useStorefrontContext();
  const orders: Order[] = [];

  const toOrder = (tracked: StorefrontTrackedOrder): Order => ({
    id: tracked.id,
    orderNumber: tracked.orderNumber,
    status: tracked.status as OrderStatus,
    paymentStatus: tracked.paymentStatus as Order['paymentStatus'],
    fulfillmentMethod: tracked.fulfillmentMethod as Order['fulfillmentMethod'],
    carrierName: tracked.carrierName,
    trackingNumber: tracked.trackingNumber,
    createdAt: tracked.createdAt,
    customerName: tracked.customerName,
    customerEmail: tracked.maskedEmail,
    customerPhone: '',
    channel: 'Online Web Store',
    loyaltyPointsEarned: 0,
    shippingAddress: {},
    locationName: '',
    items: tracked.items.map((item) => ({
      productName: item.name,
      variantName: item.name,
      sku: item.sku || '',
      quantity: Number(item.quantity),
      price: Number(item.unitPrice),
      image: item.image,
    })),
    subtotal: Number(tracked.totals.subtotal),
    discountAmount: 0,
    discountCode: '',
    shippingFee: Number(tracked.totals.shippingFee),
    taxAmount: Number(tracked.totals.taxAmount),
    totalAmount: Number(tracked.totals.totalAmount),
  } as Order);

  const handleClaimAccount = (email: string) => {
    onClose();
    if (onOpenClaimModal) onOpenClaimModal(email);
    else if (onOpenClaimAccount) onOpenClaimAccount(email);
  };

  const [orderQuery, setOrderQuery] = useState(initialOrderNumber);
  const [emailQuery, setEmailQuery] = useState(initialEmail || '');
  const [searchedOrder, setSearchedOrder] = useState<Order | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-search when the route supplies an order number. Contact is required
  // for public verification; no client-side order array is consulted.
  useEffect(() => {
    if (!isOpen || !initialOrderNumber || !tenant?.slug) return;
    setOrderQuery(initialOrderNumber);
    if (initialEmail) setEmailQuery(initialEmail);
    void storefrontApi.trackOrder(tenant.slug, initialOrderNumber, initialEmail || undefined)
      .then((tracked) => {
        setSearchedOrder(toOrder(tracked));
        setHasSearched(true);
        setErrorMessage('');
      })
      .catch(() => {
        setSearchedOrder(null);
        setHasSearched(true);
        setErrorMessage('Order not found or contact verification failed.');
      });
  }, [isOpen, initialOrderNumber, initialEmail, tenant?.slug]);

  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(isOpen, onClose, modalRef);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    const cleanOrder = orderQuery.trim();
    const cleanContact = emailQuery.trim();

    if (!cleanOrder || !cleanContact || !tenant?.slug) {
      setErrorMessage('Please enter an order number and the email or phone used at checkout.');
      return;
    }

    setHasSearched(false);
    try {
      const tracked = await storefrontApi.trackOrder(tenant.slug, cleanOrder, cleanContact);
      setSearchedOrder(toOrder(tracked));
      setHasSearched(true);
    } catch {
      setSearchedOrder(null);
      setHasSearched(true);
      setErrorMessage('Order not found or contact verification failed.');
    }
  };

  const handleSelectQuickOrder = (order: Order) => {
    setOrderQuery(order.orderNumber);
    setEmailQuery(order.customerEmail || '');
    setSearchedOrder(order);
    setHasSearched(true);
    setErrorMessage('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  };

  const getStepIndex = (status: OrderStatus) =>   const handleSelectQuickOrder = () => {
    setErrorMessage('Sample orders are disabled in production storefront tracking.');
  };


