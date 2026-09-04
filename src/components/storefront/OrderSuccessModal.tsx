import React, { useState } from 'react';
import {
  CheckCircle2,
  Package,
  Mail,
  Smartphone,
  UserPlus,
  Copy,
  Check,
  ArrowRight,
  Sparkles,
  ExternalLink,
  X,
  Truck,
  ShieldCheck,
} from 'lucide-react';
import { Order } from '../../types';
import { useCommerce } from '../../context/CommerceContext';

interface OrderSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onOpenTracking: (orderNumber: string, email?: string) => void;
  onOpenNotificationHub: (order: Order) => void;
  onOpenClaimModal: (email: string) => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({
  isOpen,
  onClose,
  order,
  onOpenTracking,
  onOpenNotificationHub,
  onOpenClaimModal,
}) => {
  const { formatCurrency, activeCustomerUser } = useCommerce();
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen || !order) return null;

  const magicToken = order.trackingMagicToken || `tok_${order.id.slice(0, 8)}`;
  const magicLink = `https://store.omnicore.io/orders/track?id=${order.orderNumber}&token=${magicToken}`;

  const copyMagicLink = () => {
    navigator.clipboard.writeText(magicLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const isGuest = !activeCustomerUser || order.customerName.includes('(Guest)');

  return (
    <div
      id="modal-order-success"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200 text-slate-900 dark:text-white"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header Ribbon */}
        <div className="p-6 bg-gradient-to-r from-emerald-950 via-slate-900 to-sky-950 border-b border-slate-200 dark:border-slate-800 text-center relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-14 h-14 bg-emerald-500/20 border-2 border-emerald-500/40 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/20 animate-in zoom-in-50 duration-300">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Payment Cleared & Stock Allocated
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-2">Thank You for Your Order!</h2>
          <p className="text-xs text-slate-700 dark:text-slate-300 max-w-md mx-auto mt-1">
            Order <strong className="font-mono text-emerald-300">{order.orderNumber}</strong> has been logged. Total paid: <strong className="text-slate-900 dark:text-white">{formatCurrency(order.totalAmount)}</strong>.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 text-xs">
          {/* Method 2 Direct Magic Link Banner */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-sky-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-sky-400 flex items-center gap-1.5 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>1-Click Magic Tracking Link</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                No Password Required
              </span>
            </div>

            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
              <input
                type="text"
                readOnly
                value={magicLink}
                className="w-full bg-transparent font-mono text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={copyMagicLink}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors flex-shrink-0"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-600 dark:text-slate-400">
              Sent directly to <strong className="text-slate-700 dark:text-slate-300">{order.customerEmail}</strong>. You can bookmark or click anytime for real-time live map updates.
            </p>
          </div>

          {/* 4 Interactive Methods Navigation Cards */}
          <div className="space-y-2">
            <p className="font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[10px]">
              Ways You Can Track & Manage This Order:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Method 1: On-Site Self-Service */}
              <div
                onClick={() => {
                  onClose();
                  onOpenTracking(order.orderNumber, order.customerEmail);
                }}
                className="p-3.5 bg-slate-50 dark:bg-slate-950 hover:bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-sky-500/50 cursor-pointer transition-all space-y-1 group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-2">
                    <Truck className="w-4 h-4 text-sky-400" />
                    <span>1. Track on Website</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-sky-400 transition-colors" />
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Search with #{order.orderNumber} + {order.customerEmail} anytime in the header.
                </p>
              </div>

              {/* Method 2 & 3: Email & SMS Simulator Hub */}
              <div
                onClick={() => {
                  onClose();
                  onOpenNotificationHub(order);
                }}
                className="p-3.5 bg-slate-50 dark:bg-slate-950 hover:bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 cursor-pointer transition-all space-y-1 group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <span>2 & 3. Email & SMS Hub</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Preview confirmation & dispatch emails and live SMS/WhatsApp message stream.
                </p>
              </div>
            </div>
          </div>

          {/* Method 4 Retroactive Claim Callout (if guest) */}
          {isGuest && (
            <div className="p-4 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-950 rounded-2xl border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-slate-900 dark:text-white text-xs">Method 4: Claim This Order</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                    +{order.loyaltyPointsEarned || 20} pts
                  </span>
                </div>
                <p className="text-[11px] text-slate-700 dark:text-slate-300">
                  Create an account in 10 seconds to link this order and start collecting loyalty rewards.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenClaimModal(order.customerEmail || '');
                }}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-900 dark:text-white rounded-xl text-xs font-black shadow-md shadow-amber-500/20 flex items-center justify-center gap-1.5 transition-all flex-shrink-0"
              >
                <span>Claim Order</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>256-bit SSL encrypted transaction</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-900 dark:text-white rounded-xl text-xs font-bold transition-all"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    </div>
  );
};
