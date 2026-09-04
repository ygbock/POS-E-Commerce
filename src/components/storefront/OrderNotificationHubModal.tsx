import React, { useState } from 'react';
import {
  Mail,
  Smartphone,
  MessageSquare,
  Truck,
  Package,
  ExternalLink,
  Copy,
  Check,
  X,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Send,
  Play,
  RotateCcw,
  CheckCircle2,
  Clock,
  MapPin,
  Flame,
  Bell,
  Share2,
} from 'lucide-react';
import { Order } from '../../types';
import { useCommerce } from '../../context/CommerceContext';

interface OrderNotificationHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onOpenTracking?: (orderNumber: string, email?: string) => void;
  onOpenLiveTracking?: (orderNumber: string, email?: string) => void;
  onOpenClaimModal?: (email: string) => void;
}

export const OrderNotificationHubModal: React.FC<OrderNotificationHubModalProps> = ({
  isOpen,
  onClose,
  order,
  onOpenTracking,
  onOpenLiveTracking,
}) => {
  const {
    formatCurrency,
    simulateAdvanceOrderStatus,
    sendCustomerAlert,
  } = useCommerce();

  const handleOpenTracking = (orderNum: string, email?: string) => {
    onClose();
    if (onOpenTracking) onOpenTracking(orderNum, email);
    else if (onOpenLiveTracking) onOpenLiveTracking(orderNum, email);
  };

  const [activeTab, setActiveTab] = useState<'confirmation_email' | 'dispatch_email' | 'sms_simulator' | 'whatsapp_simulator'>('confirmation_email');
  const [copiedLink, setCopiedLink] = useState(false);
  const [customMsg, setCustomMsg] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  if (!isOpen || !order) return null;

  const magicToken = order.trackingMagicToken || `tok_${order.id.slice(0, 8)}`;
  const magicLink = `https://store.omnicore.io/orders/track?id=${order.orderNumber}&token=${magicToken}`;
  const carrierTrackingUrl = `https://www.fedex.com/fedextrack/?trknbr=${order.trackingNumber || 'FDX-99824102'}`;

  const copyMagicLink = () => {
    navigator.clipboard.writeText(magicLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleSimulateAdvance = () => {
    setIsSimulating(true);
    simulateAdvanceOrderStatus(order.id);
    setTimeout(() => {
      setIsSimulating(false);
    }, 400);
  };

  const handleSendCustomerAlert = (channel: 'SMS' | 'WhatsApp') => {
    if (!customMsg.trim()) return;
    sendCustomerAlert(order.id, channel, customMsg.trim());
    setCustomMsg('');
  };

  const tabs = [
    { id: 'confirmation_email' as const, label: 'Order Email', fullLabel: '1. Confirmation Email (Magic Link)', icon: Mail },
    { id: 'dispatch_email' as const, label: 'Dispatch Email', fullLabel: '2. Shipping Dispatch Email', icon: Truck },
    { id: 'sms_simulator' as const, label: 'SMS Alerts', fullLabel: '3. SMS Live Alerts', icon: Smartphone },
    { id: 'whatsapp_simulator' as const, label: 'WhatsApp', fullLabel: '4. WhatsApp Channel', icon: MessageSquare },
  ];

  return (
    <div
      id="modal-order-notification-hub"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-4xl max-h-[92vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200 text-slate-900 dark:text-white">
        {/* Header */}
        <div className="p-3.5 sm:p-5 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 p-0.5 shadow-lg shadow-sky-500/20 flex-shrink-0">
              <div className="w-full h-full bg-slate-50 dark:bg-slate-950 rounded-[14px] flex items-center justify-center text-sky-400">
                <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-sm sm:text-lg font-black text-slate-900 dark:text-white truncate">Order Notification Hub</h2>
                <span className="font-mono text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30 flex-shrink-0">
                  {order.orderNumber}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 truncate">
                Direct Magic Links & Live SMS / WhatsApp Alerts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors flex-shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation - Scrollable on mobile with responsive labels */}
        <div className="px-2 sm:px-6 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex space-x-1 sm:space-x-3 overflow-x-auto text-xs font-bold no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isWhatsApp = tab.id === 'whatsapp_simulator';
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-2.5 sm:py-3 px-2.5 sm:px-3 border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 whitespace-nowrap flex-shrink-0 min-h-[40px] cursor-pointer ${
                  isActive
                    ? isWhatsApp
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-sky-500 text-sky-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="sm:hidden text-[11px]">{tab.label}</span>
                <span className="hidden sm:inline">{tab.fullLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 flex-1 custom-scrollbar text-xs bg-white dark:bg-slate-900">
          {/* TAB 1: ORDER CONFIRMATION EMAIL */}
          {activeTab === 'confirmation_email' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Magic Link Bar */}
              <div className="p-3 sm:p-4 bg-sky-950/40 border border-sky-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0" />
                    <span className="font-bold text-slate-900 dark:text-white">Direct Magic Tracking URL</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-mono">1-Click Auth</span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400 font-mono break-all line-clamp-2 sm:line-clamp-none">{magicLink}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={copyMagicLink}
                    className="flex-1 sm:flex-initial justify-center px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors min-h-[38px] cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenTracking(order.orderNumber, order.customerEmail)}
                    className="flex-1 sm:flex-initial justify-center px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition-colors min-h-[38px] cursor-pointer"
                  >
                    <span>Launch Tracker</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Realistic Email Client Frame */}
              <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-inner">
                {/* Email Client Header Bar */}
                <div className="p-3 sm:p-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-1 text-[11px]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-slate-600 dark:text-slate-400 gap-0.5">
                    <div>
                      <strong className="text-slate-800 dark:text-slate-200">From:</strong> OmniCore Orders &lt;orders@omnicore.io&gt;
                    </div>
                    <span className="text-slate-500 text-[10px] sm:text-[11px]">{new Date(order.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 truncate">
                    <strong className="text-slate-800 dark:text-slate-200">To:</strong> {order.customerName} &lt;{order.customerEmail || 'customer@example.com'}&gt;
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 font-semibold pt-0.5">
                    <strong>Subject:</strong> Your OmniCore Order Confirmation #{order.orderNumber}
                  </div>
                </div>

                {/* Email Body Content */}
                <div className="p-4 sm:p-6 bg-white/60 dark:bg-slate-900/60 max-w-xl mx-auto space-y-4 sm:space-y-5">
                  <div className="text-center space-y-1 pb-3 sm:pb-4 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">Thank You for Your Order!</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Hi {order.customerName.split(' ')[0]}, we’ve received your order and are currently reserving warehouse stock.
                    </p>
                  </div>

                  {/* Highlighted Direct Magic Link CTA */}
                  <div className="p-4 sm:p-5 bg-gradient-to-r from-sky-900/40 to-indigo-900/40 rounded-2xl border border-sky-500/30 text-center space-y-3">
                    <p className="text-xs font-semibold text-sky-200">
                      Track your order live without needing a password:
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenTracking(order.orderNumber, order.customerEmail)}
                      className="w-full sm:w-auto px-5 sm:px-6 py-3 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl text-xs font-black shadow-lg shadow-sky-500/25 inline-flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[42px]"
                    >
                      <Package className="w-4 h-4" />
                      <span>TRACK PACKAGE (MAGIC LINK)</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <p className="text-[10px] text-slate-400">
                      Tokenized security protects your personal data while providing instant 1-click order lookup.
                    </p>
                  </div>

                  {/* Summary Box */}
                  <div className="space-y-2.5 bg-slate-50 dark:bg-slate-950 p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-600 dark:text-slate-400">Order Number:</span>
                      <strong className="font-mono text-slate-900 dark:text-white">{order.orderNumber}</strong>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-600 dark:text-slate-400">Fulfillment Method:</span>
                      <span className="text-sky-400 font-semibold">{order.fulfillmentMethod}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-600 dark:text-slate-400">Payment Method:</span>
                      <span className="text-slate-700 dark:text-slate-300">{order.payments[0]?.method || 'Credit Card'} (Paid)</span>
                    </div>
                    {order.shippingAddress && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                        <span className="text-slate-600 dark:text-slate-400 block mb-0.5 font-semibold">Shipping Destination:</span>
                        <p className="text-slate-700 dark:text-slate-300">
                          {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Items List */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Order Summary</h4>
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-2">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="p-2 flex items-center justify-between text-xs gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 dark:text-white truncate">{item.productName}</p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400">{item.variantName} × {item.quantity}</p>
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white flex-shrink-0">{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                      ))}
                      <div className="p-2 flex justify-between font-black text-sm text-slate-900 dark:text-white pt-2.5 border-t border-slate-200 dark:border-slate-800">
                        <span>Total Paid</span>
                        <span className="text-emerald-400">{formatCurrency(order.totalAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SHIPPING DISPATCH EMAIL */}
          {activeTab === 'dispatch_email' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-3 sm:p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Truck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="font-bold text-slate-900 dark:text-white">Carrier Dispatch Notification</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                      {order.carrierName || 'FedEx / OmniTrack'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Carrier Tracking Code: <strong className="text-emerald-300 font-mono">{order.trackingNumber || 'FDX-9821448201'}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => handleOpenTracking(order.orderNumber, order.customerEmail)}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition-colors min-h-[38px] cursor-pointer"
                  >
                    <span>View On-Site Tracking</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Realistic Dispatch Email Client Frame */}
              <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-inner">
                {/* Email Client Header Bar */}
                <div className="p-3 sm:p-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-1 text-[11px]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-slate-600 dark:text-slate-400 gap-0.5">
                    <div>
                      <strong className="text-slate-800 dark:text-slate-200">From:</strong> OmniCore Shipping Dispatch &lt;dispatch@omnicore.io&gt;
                    </div>
                    <span className="text-slate-500 text-[10px] sm:text-[11px]">{new Date().toLocaleString()}</span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 truncate">
                    <strong className="text-slate-800 dark:text-slate-200">To:</strong> {order.customerName} &lt;{order.customerEmail || 'customer@example.com'}&gt;
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 font-semibold pt-0.5">
                    <strong>Subject:</strong> 🚚 Great news! Order #{order.orderNumber} is on its way
                  </div>
                </div>

                {/* Email Body Content */}
                <div className="p-4 sm:p-6 bg-white/60 dark:bg-slate-900/60 max-w-xl mx-auto space-y-4 sm:space-y-5">
                  <div className="text-center space-y-1 pb-3 sm:pb-4 border-b border-slate-200 dark:border-slate-800">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2 border border-emerald-500/30">
                      <Truck className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">Your Package Has Shipped!</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      The carrier has picked up your parcel from Central Logistics Warehouse.
                    </p>
                  </div>

                  {/* Dual Tracking Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-center">
                      <p className="text-[10px] sm:text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase">Carrier Tracking Link</p>
                      <p className="text-xs font-mono font-bold text-sky-400 truncate">{order.trackingNumber || 'FDX-9821448201'}</p>
                      <button
                        type="button"
                        onClick={() => handleOpenTracking(order.orderNumber, order.customerEmail)}
                        className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 min-h-[38px] cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Carrier Portal</span>
                      </button>
                    </div>

                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-emerald-500/30 space-y-2 text-center">
                      <p className="text-[10px] sm:text-[11px] font-bold text-emerald-400 uppercase">On-Site Live Status</p>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Picking → In Transit → Delivered</p>
                      <button
                        type="button"
                        onClick={() => handleOpenTracking(order.orderNumber, order.customerEmail)}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 min-h-[38px] cursor-pointer"
                      >
                        <Package className="w-3.5 h-3.5" />
                        <span>Live Status Page</span>
                      </button>
                    </div>
                  </div>

                  {/* Dispatch Route Specs */}
                  <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Carrier Service:</span>
                      <strong className="text-slate-900 dark:text-white">{order.carrierName || 'OmniTrack Express / FedEx'}</strong>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Estimated Delivery:</span>
                      <strong className="text-emerald-400">
                        {new Date(Date.now() + 86400000 * 2).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </strong>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Destination:</span>
                      <span className="text-slate-700 dark:text-slate-300 truncate max-w-[180px] sm:max-w-none text-right">
                        {order.shippingAddress ? `${order.shippingAddress.city}, ${order.shippingAddress.state}` : order.locationName}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SMS LIVE ALERTS SIMULATOR */}
          {activeTab === 'sms_simulator' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 animate-in fade-in duration-150">
              {/* Smartphone Simulator Preview */}
              <div className="lg:col-span-6 flex justify-center">
                <div className="w-full max-w-[280px] sm:max-w-xs bg-slate-50 dark:bg-slate-950 rounded-[36px] sm:rounded-[40px] border-4 border-slate-300 dark:border-slate-800 p-3.5 sm:p-4 shadow-2xl space-y-3 relative overflow-hidden ring-1 ring-slate-400 dark:ring-slate-700">
                  {/* Phone Notch & Status Bar */}
                  <div className="flex justify-between items-center text-[10px] text-slate-600 dark:text-slate-400 px-2 pt-0.5">
                    <span>9:41 AM</span>
                    <div className="w-14 sm:w-16 h-3.5 sm:h-4 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto" />
                    <span>5G • 100%</span>
                  </div>

                  {/* SMS Header */}
                  <div className="py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs">
                        OC
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white text-xs">OmniCore Alerts</p>
                        <p className="text-[9px] sm:text-[10px] text-slate-600 dark:text-slate-400">{order.customerPhone || '+1 (555) 349-8812'}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">SMS Active</span>
                  </div>

                  {/* SMS Messages List */}
                  <div className="space-y-2.5 min-h-[220px] sm:min-h-[260px] max-h-[280px] sm:max-h-[300px] overflow-y-auto p-1 text-[11px] custom-scrollbar">
                    {order.smsUpdatesLog && order.smsUpdatesLog.filter((l) => l.channel === 'SMS').length > 0 ? (
                      order.smsUpdatesLog
                        .filter((l) => l.channel === 'SMS')
                        .map((log, idx) => (
                          <div key={idx} className="space-y-1 animate-in slide-in-from-bottom-2 duration-150">
                            <div className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 p-2.5 sm:p-3 rounded-2xl rounded-tl-sm border border-slate-300 dark:border-slate-700 shadow-sm leading-relaxed text-[10px] sm:text-[11px]">
                              {log.message}
                            </div>
                            <span className="text-[9px] text-slate-500 pl-1">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Delivered
                            </span>
                          </div>
                        ))
                    ) : (
                      <div className="space-y-2 text-center py-8 sm:py-10 text-slate-500">
                        <Smartphone className="w-7 h-7 sm:w-8 sm:h-8 mx-auto text-slate-400 dark:text-slate-600" />
                        <p className="text-xs">No SMS notifications recorded yet.</p>
                      </div>
                    )}
                  </div>

                  {/* Phone Input Bar */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <input
                      type="text"
                      disabled
                      placeholder="Reply STOP to unsubscribe"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full px-3 py-1 text-[10px] text-slate-500"
                    />
                  </div>
                </div>
              </div>

              {/* SMS Controls & Milestone Trigger */}
              <div className="lg:col-span-6 space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-sky-400" />
                      <span>Fulfillment Milestone Simulator</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                      Current: {order.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Advance the order through its fulfillment lifecycle. Each milestone automatically dispatches realistic text alerts to the customer’s mobile number with active tracking URLs.
                  </p>

                  <button
                    type="button"
                    onClick={handleSimulateAdvance}
                    disabled={isSimulating}
                    className="w-full py-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-sky-600/25 flex items-center justify-center gap-2 transition-all min-h-[42px] cursor-pointer active:scale-98"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Advance Status & Trigger SMS Alert</span>
                  </button>
                </div>

                {/* Send Manual Custom SMS Alert */}
                <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <span className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Send className="w-4 h-4 text-sky-400" />
                    <span>Send Custom SMS Notification</span>
                  </span>

                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      placeholder="e.g. Courier is 2 stops away. Gate code required."
                      value={customMsg}
                      onChange={(e) => setCustomMsg(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendCustomerAlert('SMS')}
                      disabled={!customMsg.trim()}
                      className="w-full sm:w-auto px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-900 dark:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors min-h-[38px] cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send SMS Now</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: WHATSAPP SIMULATOR */}
          {activeTab === 'whatsapp_simulator' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 animate-in fade-in duration-150">
              {/* WhatsApp Smartphone Simulator */}
              <div className="lg:col-span-6 flex justify-center">
                <div className="w-full max-w-[280px] sm:max-w-xs bg-slate-50 dark:bg-slate-950 rounded-[36px] sm:rounded-[40px] border-4 border-slate-300 dark:border-slate-800 p-3.5 sm:p-4 shadow-2xl space-y-3 relative overflow-hidden ring-1 ring-slate-400 dark:ring-slate-700">
                  {/* Phone Notch */}
                  <div className="flex justify-between items-center text-[10px] text-slate-600 dark:text-slate-400 px-2 pt-0.5">
                    <span>9:41 AM</span>
                    <div className="w-14 sm:w-16 h-3.5 sm:h-4 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto" />
                    <span>WhatsApp</span>
                  </div>

                  {/* WhatsApp Green Chat Header */}
                  <div className="py-2 px-3 bg-emerald-800 rounded-2xl flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                        OC
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="font-bold text-xs">OmniCore Official</p>
                          <CheckCircle2 className="w-3 h-3 text-sky-300" />
                        </div>
                        <p className="text-[8px] sm:text-[9px] text-emerald-200">Verified Business</p>
                      </div>
                    </div>
                  </div>

                  {/* WhatsApp Chat Messages */}
                  <div className="space-y-2.5 min-h-[220px] sm:min-h-[250px] max-h-[270px] sm:max-h-[290px] overflow-y-auto p-1 text-[11px] custom-scrollbar">
                    {order.smsUpdatesLog && order.smsUpdatesLog.filter((l) => l.channel === 'WhatsApp').length > 0 ? (
                      order.smsUpdatesLog
                        .filter((l) => l.channel === 'WhatsApp')
                        .map((log, idx) => (
                          <div key={idx} className="space-y-1 animate-in slide-in-from-bottom-2 duration-150">
                            <div className="bg-emerald-950 border border-emerald-800/60 text-emerald-100 p-2.5 sm:p-3 rounded-2xl rounded-tl-sm shadow-sm leading-relaxed text-[10px] sm:text-[11px]">
                              {log.message}
                            </div>
                            <span className="text-[9px] text-emerald-400 pl-1 flex items-center gap-1">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Read ✓✓
                            </span>
                          </div>
                        ))
                    ) : (
                      <div className="space-y-2 text-center py-8 sm:py-10 text-slate-500">
                        <MessageSquare className="w-7 h-7 sm:w-8 sm:h-8 mx-auto text-emerald-700" />
                        <p className="text-xs">No WhatsApp updates recorded yet.</p>
                      </div>
                    )}
                  </div>

                  {/* Phone Input Bar */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <input
                      type="text"
                      disabled
                      placeholder="Type a message..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full px-3 py-1 text-[10px] text-slate-500"
                    />
                  </div>
                </div>
              </div>

              {/* WhatsApp Controls */}
              <div className="lg:col-span-6 space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-emerald-400" />
                      <span>WhatsApp Business Integration</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                      Live Hook
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Rich messaging with verified badges, real-time map links, and instant interactive customer service replies.
                  </p>

                  <button
                    type="button"
                    onClick={handleSimulateAdvance}
                    disabled={isSimulating}
                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all min-h-[42px] cursor-pointer active:scale-98"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Advance Status & Trigger WhatsApp Alert</span>
                  </button>
                </div>

                {/* Send Custom WhatsApp Msg */}
                <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <span className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Send className="w-4 h-4 text-emerald-400" />
                    <span>Send Custom WhatsApp Notification</span>
                  </span>

                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      placeholder="e.g. 🎁 Your driver has arrived with parcel #ORD-..."
                      value={customMsg}
                      onChange={(e) => setCustomMsg(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendCustomerAlert('WhatsApp')}
                      disabled={!customMsg.trim()}
                      className="w-full sm:w-auto px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors min-h-[38px] cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send WhatsApp Alert</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => handleOpenTracking(order.orderNumber, order.customerEmail)}
            className="px-3.5 py-2 text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[38px]"
          >
            <Package className="w-4 h-4" />
            <span>Open Self-Service Tracking Page</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-bold transition-all min-h-[38px] cursor-pointer"
          >
            Close Hub
          </button>
        </div>
      </div>
    </div>
  );
};
