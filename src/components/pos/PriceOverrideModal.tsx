import React, { useState, useEffect } from 'react';
import { CartItem } from '../../types';
import { useCommerce } from '../../context/CommerceContext';
import {
  ShieldAlert,
  ShieldCheck,
  Calculator,
  Lock,
  Unlock,
  AlertTriangle,
  X,
  Check,
  Tag,
  DollarSign,
  Percent,
  TrendingDown,
  UserCheck,
  HelpCircle,
  Sparkles
} from 'lucide-react';

export interface ManagerAccount {
  id: string;
  name: string;
  role: string;
  pin: string;
  avatarBg: string;
}

export const AUTHORIZED_MANAGERS: ManagerAccount[] = [
  { id: 'mgr-1', name: 'Sarah Jenkins', role: 'Store Manager', pin: '1234', avatarBg: 'bg-indigo-600' },
  { id: 'mgr-2', name: 'Marcus Vance', role: 'Ops Supervisor', pin: '8888', avatarBg: 'bg-emerald-600' },
  { id: 'mgr-3', name: 'System Admin', role: 'Super Admin', pin: '9999', avatarBg: 'bg-amber-600' },
];

export const OVERRIDE_REASONS = [
  'Damaged Box / Cosmetic Blemish',
  'Competitor Price Match',
  'Volume Customer Bulk Order',
  'Customer Service / Dispute Resolution',
  'Clearance / Discontinued Floor Model',
  'Manager Discretionary Promotion',
];

interface PriceOverrideModalProps {
  item: CartItem | null;
  isOpen: boolean;
  onClose: () => void;
  onApplyOverride: (
    variantId: string,
    newUnitPrice: number,
    discountPercentage: number,
    overrideInfo?: { approvedBy: string; reason: string }
  ) => void;
}

export const PriceOverrideModal: React.FC<PriceOverrideModalProps> = ({
  item,
  isOpen,
  onClose,
  onApplyOverride,
}) => {
  const { formatCurrency, logAuditAction } = useCommerce();

  const [overrideMode, setOverrideMode] = useState<'discount' | 'directPrice'>('discount');
  const [discountInput, setDiscountInput] = useState<string>('0');
  const [directPriceInput, setDirectPriceInput] = useState<string>('0');

  // Manager PIN State
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [selectedReason, setSelectedReason] = useState<string>(OVERRIDE_REASONS[0]);
  const [pinError, setPinError] = useState<string | null>(null);
  const [approvedManager, setApprovedManager] = useState<ManagerAccount | null>(null);
  const [showPinPad, setShowPinPad] = useState<boolean>(false);

  useEffect(() => {
    if (item) {
      setDiscountInput(item.discountPercentage ? item.discountPercentage.toString() : '0');
      setDirectPriceInput(item.price.toFixed(2));
      setEnteredPin('');
      setPinError(null);
      setApprovedManager(null);
      setShowPinPad(false);
      setSelectedReason(OVERRIDE_REASONS[0]);
    }
  }, [item, isOpen]);

  if (!isOpen || !item) return null;

  const originalBasePrice = item.originalPrice || item.price;
  const minSellingPrice = item.minSellingPrice || Math.round(originalBasePrice * 0.85);
  const costPrice = item.costPrice || 0;

  // Calculate Effective Selling Price based on mode
  let targetUnitPrice = originalBasePrice;
  let targetDiscountPct = 0;

  if (overrideMode === 'discount') {
    const parsedDisc = Math.min(100, Math.max(0, parseFloat(discountInput) || 0));
    targetDiscountPct = parsedDisc;
    targetUnitPrice = originalBasePrice * (1 - parsedDisc / 100);
  } else {
    const parsedPrice = Math.max(0, parseFloat(directPriceInput) || 0);
    targetUnitPrice = parsedPrice;
    targetDiscountPct = originalBasePrice > 0 ? Math.max(0, ((originalBasePrice - parsedPrice) / originalBasePrice) * 100) : 0;
  }

  const effectiveLineTotal = targetUnitPrice * item.quantity;
  const unitProfit = targetUnitPrice - costPrice;
  const profitMarginPct = targetUnitPrice > 0 ? (unitProfit / targetUnitPrice) * 100 : 0;

  // Threshold evaluation
  const isBelowMinSellingPrice = targetUnitPrice < minSellingPrice - 0.01;
  const exceedsCashierMaxDiscount = targetDiscountPct > 15.01;
  const requiresManagerApproval = isBelowMinSellingPrice || exceedsCashierMaxDiscount;

  const handleKeypadPress = (digit: string) => {
    setPinError(null);
    if (enteredPin.length < 4) {
      const nextPin = enteredPin + digit;
      setEnteredPin(nextPin);
      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handleKeypadBackspace = () => {
    setPinError(null);
    setEnteredPin((prev) => prev.slice(0, -1));
  };

  const verifyPin = (pinToTest: string) => {
    const manager = AUTHORIZED_MANAGERS.find((m) => m.pin === pinToTest);
    if (manager) {
      setApprovedManager(manager);
      setPinError(null);
    } else {
      setPinError('Invalid Manager PIN code. Please try again.');
      setEnteredPin('');
    }
  };

  const handleQuickSelectManagerPin = (mgr: ManagerAccount) => {
    setEnteredPin(mgr.pin);
    verifyPin(mgr.pin);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (requiresManagerApproval && !approvedManager) {
      setShowPinPad(true);
      if (enteredPin.length === 4) {
        verifyPin(enteredPin);
      } else {
        setPinError('Please enter a valid 4-digit Manager PIN to authorize this override.');
      }
      return;
    }

    let overrideInfo: { approvedBy: string; reason: string } | undefined = undefined;
    if (approvedManager) {
      overrideInfo = {
        approvedBy: `${approvedManager.name} (${approvedManager.role})`,
        reason: selectedReason,
      };
      logAuditAction(
        'POS Price Override Approved',
        'POS',
        item.sku,
        undefined,
        `Approved unit price ${formatCurrency(targetUnitPrice)} (Retail: ${formatCurrency(originalBasePrice)}, Min: ${formatCurrency(minSellingPrice)}) by ${approvedManager.name}. Reason: ${selectedReason}`
      );
    }

    onApplyOverride(item.variantId, targetUnitPrice, targetDiscountPct, overrideInfo);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 my-auto">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-md ${
              requiresManagerApproval ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
            }`}>
              {requiresManagerApproval ? <ShieldAlert className="w-5 h-5" /> : <Tag className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-black text-sm tracking-tight text-white flex items-center gap-2">
                <span>POS Price Override & Discount Manager</span>
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">SKU: {item.sku} • {item.variantName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Item Summary Banner */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">{item.productName}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{item.variantName}</p>
              </div>
              <span className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-black rounded-xl">
                Qty: {item.quantity} {item.unit}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/70 text-center">
              <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Regular Price</span>
                <span className="text-xs font-black text-slate-800 dark:text-slate-200 font-mono">
                  {formatCurrency(originalBasePrice)}
                </span>
              </div>
              <div className="p-2 bg-amber-500/10 dark:bg-amber-500/15 rounded-xl border border-amber-500/20">
                <span className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase block">Min Selling Price</span>
                <span className="text-xs font-black text-amber-800 dark:text-amber-300 font-mono">
                  {formatCurrency(minSellingPrice)}
                </span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Unit Cost</span>
                <span className="text-xs font-black text-slate-800 dark:text-slate-200 font-mono">
                  {formatCurrency(costPrice)}
                </span>
              </div>
            </div>
          </div>

          {/* Mode Tabs: Discount % vs Direct Unit Price */}
          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              1. Choose Override Mode
            </label>
            <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setOverrideMode('discount')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  overrideMode === 'discount'
                    ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm font-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Percent className="w-3.5 h-3.5" />
                <span>Line Discount (%)</span>
              </button>
              <button
                type="button"
                onClick={() => setOverrideMode('directPrice')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  overrideMode === 'directPrice'
                    ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm font-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Direct Custom Unit Price ($)</span>
              </button>
            </div>
          </div>

          {/* Value Input Controls */}
          <div className="space-y-3">
            {overrideMode === 'discount' ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Discount Percentage (%)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl py-2.5 px-4 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:border-sky-500 font-mono"
                    placeholder="e.g. 15"
                  />
                  <span className="absolute right-4 font-black text-slate-400 text-sm">%</span>
                </div>
                {/* Preset Chips */}
                <div className="flex gap-1.5 mt-2">
                  {[5, 10, 15, 20, 25, 30, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDiscountInput(pct.toString())}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                        discountInput === pct.toString()
                          ? 'bg-sky-500 text-white border-sky-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Custom Unit Selling Price ($)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 font-black text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={directPriceInput}
                    onChange={(e) => setDirectPriceInput(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl py-2.5 pl-8 pr-4 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:border-sky-500 font-mono"
                    placeholder="0.00"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Real-time Calculation & Impact Summary */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400 font-medium">New Effective Unit Price:</span>
              <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                {formatCurrency(targetUnitPrice)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Effective Discount Equivalent:</span>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {targetDiscountPct.toFixed(1)}% off regular price
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Estimated Line Total ({item.quantity} qty):</span>
              <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                {formatCurrency(effectiveLineTotal)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Gross Unit Margin:</span>
              <span className={`font-mono font-bold ${unitProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {formatCurrency(unitProfit)} ({profitMarginPct.toFixed(1)}%)
              </span>
            </div>
          </div>

          {/* POLICY STATUS BANNER */}
          {requiresManagerApproval ? (
            <div className="p-4 bg-amber-500/10 dark:bg-amber-950/40 border-2 border-amber-500/40 rounded-2xl space-y-2 animate-in fade-in">
              <div className="flex items-center space-x-2 text-amber-700 dark:text-amber-300 font-extrabold text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>MANAGER APPROVAL REQUIRED</span>
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-snug">
                {isBelowMinSellingPrice ? (
                  <>Effective unit price ({formatCurrency(targetUnitPrice)}) drops below the <strong>Minimum Selling Price threshold ({formatCurrency(minSellingPrice)})</strong>.</>
                ) : (
                  <>Discount percentage ({targetDiscountPct.toFixed(1)}%) exceeds the <strong>15% standard cashier limit</strong>.</>
                )}
              </p>
            </div>
          ) : (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center space-x-2.5 text-xs text-emerald-700 dark:text-emerald-300 font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Within standard cashier authority (Price ≥ Min Selling Price & Discount ≤ 15%). Direct approval granted.</span>
            </div>
          )}

          {/* MANAGER PIN PAD SECTION (If required or triggered) */}
          {(requiresManagerApproval || showPinPad) && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-800 dark:text-white tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>2. Manager PIN Authentication</span>
                </span>
                {approvedManager && (
                  <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 text-[10px] font-black rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>Authorized by {approvedManager.name}</span>
                  </span>
                )}
              </div>

              {/* Override Reason Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Override (Compulsory for Audit)
                </label>
                <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:border-amber-500"
                >
                  {OVERRIDE_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Quick Helper / Demo Manager PIN Picker */}
              <div className="bg-slate-100 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Store Manager Directory (Click to Auto-Authenticate for Demo)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {AUTHORIZED_MANAGERS.map((mgr) => (
                    <button
                      key={mgr.id}
                      type="button"
                      onClick={() => handleQuickSelectManagerPin(mgr)}
                      className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                        approvedManager?.id === mgr.id
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-300'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-amber-500/50'
                      }`}
                    >
                      <span className="text-[11px] font-black block truncate text-slate-900 dark:text-white">
                        {mgr.name}
                      </span>
                      <span className="text-[9px] text-slate-500 block">
                        {mgr.role} • PIN: <strong className="font-mono">{mgr.pin}</strong>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Keypad & Input Display */}
              <div className="max-w-xs mx-auto space-y-3 pt-1">
                <div className="flex justify-center space-x-3">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`w-11 h-12 rounded-xl border-2 flex items-center justify-center font-mono font-black text-lg transition-all ${
                        enteredPin.length > idx
                          ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400'
                      }`}
                    >
                      {enteredPin.length > idx ? '•' : ''}
                    </div>
                  ))}
                </div>

                {pinError && (
                  <p className="text-center text-xs font-bold text-rose-600 dark:text-rose-400 animate-shake">
                    {pinError}
                  </p>
                )}

                {/* Keypad Grid */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleKeypadPress(digit)}
                      className="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-mono font-black text-sm border border-slate-200/80 dark:border-slate-700 transition-colors cursor-pointer"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setEnteredPin(''); setPinError(null); setApprovedManager(null); }}
                    className="py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('0')}
                    className="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-mono font-black text-sm border border-slate-200/80 dark:border-slate-700 transition-colors cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleKeypadBackspace}
                    className="py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
                  >
                    ⌫
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              className={`px-6 py-2.5 rounded-2xl text-xs font-black text-white flex items-center gap-2 shadow-md transition-all cursor-pointer ${
                requiresManagerApproval && !approvedManager
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
              }`}
            >
              {requiresManagerApproval && !approvedManager ? (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Authenticate & Apply</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Apply Price Override</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
