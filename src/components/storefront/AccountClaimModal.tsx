import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Mail,
  Lock,
  Sparkles,
  Award,
  CheckCircle2,
  Package,
  ArrowRight,
  X,
  Phone,
  User,
  ShieldCheck,
  Zap,
  ShoppingBag,
  DollarSign,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { Order } from '../../types';

interface AccountClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
  onSuccess?: () => void;
}

export const AccountClaimModal: React.FC<AccountClaimModalProps> = ({
  isOpen,
  onClose,
  initialEmail = '',
  onSuccess,
}) => {
  const {
    orders,
    customers,
    formatCurrency,
    claimGuestOrders,
    registerNewCustomer,
    setActiveCustomerUser,
  } = useCommerce();

  const [email, setEmail] = useState(initialEmail);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [matchingOrders, setMatchingOrders] = useState<Order[]>([]);
  const [isClaimed, setIsClaimed] = useState(false);
  const [claimedSummary, setClaimedSummary] = useState<{
    ordersCount: number;
    points: number;
    totalSpent: number;
  }>({ ordersCount: 0, points: 0, totalSpent: 0 });

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  // Dynamically scan for guest orders matching this email
  useEffect(() => {
    if (email && email.includes('@')) {
      const cleanEmail = email.trim().toLowerCase();
      const matches = orders.filter(
        (o) => o.customerEmail?.trim().toLowerCase() === cleanEmail
      );
      setMatchingOrders(matches);

      // Pre-fill name and phone from the most recent order if available
      if (matches.length > 0) {
        const latest = matches[0];
        if (!fullName && latest.customerName) {
          setFullName(latest.customerName.replace('(Guest)', '').trim());
        }
        if (!phone && latest.customerPhone) {
          setPhone(latest.customerPhone);
        }
      }
    } else {
      setMatchingOrders([]);
    }
  }, [email, orders, fullName, phone]);

  if (!isOpen) return null;

  const totalMatchingSpent = matchingOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalMatchingPoints = matchingOrders.reduce(
    (sum, o) => sum + (o.loyaltyPointsEarned || Math.floor(o.totalAmount / 10)),
    0
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !fullName) return;

    // Check if an existing customer already has this email
    const existingCust = customers.find(
      (c) => c.email.toLowerCase() === email.trim().toLowerCase()
    );

    if (existingCust) {
      const res = claimGuestOrders(email, existingCust.id);
      setActiveCustomerUser(existingCust);
      setClaimedSummary({
        ordersCount: res.claimedCount,
        points: res.pointsAdded,
        totalSpent: res.totalSpentAdded,
      });
      setIsClaimed(true);
    } else {
      const res = registerNewCustomer({
        name: fullName,
        email: email.trim(),
        phone: phone || '+1 (555) 000-0000',
      });
      setClaimedSummary({
        ordersCount: res.claimedOrdersCount,
        points: res.pointsAdded,
        totalSpent: totalMatchingSpent,
      });
      setIsClaimed(true);
    }

    if (onSuccess) {
      setTimeout(() => {
        onSuccess();
      }, 2000);
    }
  };

  return (
    <div
      id="modal-account-claim"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200 text-slate-900 dark:text-white"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">Retroactive Account Claiming</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Method 4
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Link previous guest orders, claim reward points, and manage future purchases in one place.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-6">
          {!isClaimed ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Value Proposition Box */}
              <div className="p-4 bg-gradient-to-r from-amber-950/40 to-slate-900 border border-amber-500/30 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                  <Sparkles className="w-4 h-4" />
                  <span>Turn Your Guest Orders Into Member Loyalty Perks</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  Enter the email address you used at checkout. We will instantly locate all your past guest receipts and connect them to your new member profile.
                </p>

                {matchingOrders.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-amber-500/20">
                    <div className="p-2 bg-slate-950/80 rounded-xl text-center">
                      <p className="text-[10px] text-slate-600 dark:text-slate-400">Found Orders</p>
                      <p className="text-sm font-black text-amber-400">{matchingOrders.length}</p>
                    </div>
                    <div className="p-2 bg-slate-950/80 rounded-xl text-center">
                      <p className="text-[10px] text-slate-600 dark:text-slate-400">Total Spent</p>
                      <p className="text-sm font-black text-emerald-400">{formatCurrency(totalMatchingSpent)}</p>
                    </div>
                    <div className="p-2 bg-slate-950/80 rounded-xl text-center">
                      <p className="text-[10px] text-slate-600 dark:text-slate-400">Claimable Points</p>
                      <p className="text-sm font-black text-sky-400">+{totalMatchingPoints + 50}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Input Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Checkout Email Address <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      id="input-claim-email"
                      type="email"
                      required
                      placeholder="e.g. taylor.morgan@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl py-2.5 pl-10 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Your Full Name <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                      <input
                        id="input-claim-name"
                        type="text"
                        required
                        placeholder="Taylor Morgan"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl py-2.5 pl-10 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Mobile Phone (for SMS tracking)
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                      <input
                        id="input-claim-phone"
                        type="tel"
                        placeholder="+1 (555) 438-9201"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl py-2.5 pl-10 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Set Profile Password <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      id="input-claim-password"
                      type="password"
                      required
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl py-2.5 pl-10 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Found Orders Preview List */}
              {matchingOrders.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
                    Orders to be Linked ({matchingOrders.length}):
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                    {matchingOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Package className="w-3.5 h-3.5 text-amber-400" />
                          <span className="font-mono font-bold text-slate-900 dark:text-white">{ord.orderNumber}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {ord.status}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-emerald-400">{formatCurrency(ord.totalAmount)}</span>
                          <span className="text-[10px] text-slate-600 dark:text-slate-400 ml-2">
                            +{ord.loyaltyPointsEarned || Math.floor(ord.totalAmount / 10)} pts
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit CTA */}
              <div className="pt-2 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Instant 100% data sync</span>
                </span>

                <button
                  id="btn-claim-account-submit"
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-900 dark:text-white rounded-xl text-xs font-black shadow-lg shadow-amber-500/25 flex items-center gap-2 transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>CREATE ACCOUNT & CLAIM ORDERS</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          ) : (
            /* Success State */
            <div className="text-center py-8 space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-500/40 text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Account Created & Orders Claimed!</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Welcome to OmniCore Club, <strong className="text-slate-900 dark:text-white">{fullName}</strong>.
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md mx-auto grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-[10px] text-slate-500">Linked Orders</p>
                  <p className="text-base font-black text-amber-400">{claimedSummary.ordersCount}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500">Earned Points</p>
                  <p className="text-base font-black text-sky-400">+{claimedSummary.points}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500">Account Tier</p>
                  <p className="text-base font-black text-emerald-400">Bronze VIP</p>
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-bold transition-all"
                >
                  Continue Shopping
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
