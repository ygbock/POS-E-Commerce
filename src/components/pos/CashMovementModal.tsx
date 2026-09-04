import React, { useState } from 'react';
import { useCommerce } from '../../context/CommerceContext';
import { AUTHORIZED_MANAGERS } from './PriceOverrideModal';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  DollarSign,
  Lock,
  ShieldCheck,
  X,
  Check,
  AlertCircle,
  Clock,
  User,
  FileText
} from 'lucide-react';

interface CashMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CashMovementModal: React.FC<CashMovementModalProps> = ({ isOpen, onClose }) => {
  const { posShift, addPosCashMovement, formatCurrency } = useCommerce();

  const [type, setType] = useState<'Cash In' | 'Cash Out'>('Cash Out');
  const [amountInput, setAmountInput] = useState<string>('');
  const [reasonInput, setReasonInput] = useState<string>('');
  const [selectedPresetReason, setSelectedPresetReason] = useState<string>('');
  const [requiresApproval, setRequiresApproval] = useState<boolean>(false);
  const [managerPin, setManagerPin] = useState<string>('1234');
  const [approvedManagerName, setApprovedManagerName] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const presetReasonsCashOut = [
    'Store Office Supplies / Petty Cash',
    'Local Courier / Delivery Fee',
    'Emergency Cleaning Services',
    'Customer Cash Change Refill',
    'Vendor Cash Payment on Delivery',
    'Mid-Day Safe Deposit Drop',
  ];

  const presetReasonsCashIn = [
    'Morning Cash Float Top-Up',
    'Safe Transfer to Register',
    'Petty Cash Expense Reimbursement Return',
    'Owner / Capital Cash Addition',
  ];

  const currentPresets = type === 'Cash Out' ? presetReasonsCashOut : presetReasonsCashIn;

  const handlePresetSelect = (reason: string) => {
    setSelectedPresetReason(reason);
    setReasonInput(reason);
  };

  const handleAmountChange = (val: string) => {
    setAmountInput(val);
    const numericVal = parseFloat(val) || 0;
    // Require manager pin if cash out > $100 or cash in > $500
    if ((type === 'Cash Out' && numericVal > 100) || (type === 'Cash In' && numericVal > 500)) {
      setRequiresApproval(true);
    } else {
      setRequiresApproval(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const numericAmount = parseFloat(amountInput);
    if (!numericAmount || numericAmount <= 0) {
      setErrorMessage('Please enter a valid positive cash amount.');
      return;
    }

    if (!reasonInput.trim()) {
      setErrorMessage('Please state a reason for this cash movement.');
      return;
    }

    let managerName = approvedManagerName;
    if (requiresApproval && !approvedManagerName) {
      const mgr = AUTHORIZED_MANAGERS.find((m) => m.pin === managerPin);
      if (!mgr) {
        setErrorMessage('Invalid Manager PIN. PIN authorization is required for cash payouts > $100.');
        return;
      }
      managerName = `${mgr.name} (${mgr.role})`;
    }

    addPosCashMovement(type, numericAmount, reasonInput.trim(), managerName || undefined);
    
    // Reset form
    setAmountInput('');
    setReasonInput('');
    setSelectedPresetReason('');
    setApprovedManagerName('');
    setErrorMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 my-auto">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-md ${
              type === 'Cash In' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {type === 'Cash In' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-black text-sm tracking-tight text-white">
                Register Cash Paid-In / Paid-Out
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">Shift ID: {posShift.id} • Cashier: {posShift.cashierName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Toggle Type */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Transaction Type
            </label>
            <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => { setType('Cash Out'); handleAmountChange(amountInput); }}
                className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  type === 'Cash Out'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Cash Paid-Out (Payout)</span>
              </button>
              <button
                type="button"
                onClick={() => { setType('Cash In'); handleAmountChange(amountInput); }}
                className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  type === 'Cash In'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>Cash Paid-In (Float Addition)</span>
              </button>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Cash Amount ($)
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-4 font-black text-slate-400 text-base">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amountInput}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-9 pr-4 text-lg font-black text-slate-900 dark:text-white font-mono focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Preset Reasons */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Quick Preset Reasons
            </label>
            <div className="flex flex-wrap gap-1.5">
              {currentPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                    reasonInput === preset
                      ? 'bg-sky-500/15 border-sky-500 text-sky-700 dark:text-sky-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Reason Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Description / Expense Reference
            </label>
            <input
              type="text"
              required
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="e.g. Paid $35 cash for emergency receipt paper & tape..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-2.5 px-3.5 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Manager Approval Section for Large Amounts */}
          {requiresApproval && (
            <div className="p-4 bg-amber-500/10 dark:bg-amber-950/40 border-2 border-amber-500/30 rounded-2xl space-y-3 animate-in fade-in">
              <div className="flex items-center space-x-2 text-amber-700 dark:text-amber-300 font-extrabold text-xs">
                <Lock className="w-4 h-4 shrink-0 text-amber-600" />
                <span>MANAGER APPROVAL REQUIRED ({type} &gt; {type === 'Cash Out' ? '$100' : '$500'})</span>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Select Authorizing Store Manager
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {AUTHORIZED_MANAGERS.map((mgr) => (
                    <button
                      key={mgr.id}
                      type="button"
                      onClick={() => {
                        setApprovedManagerName(`${mgr.name} (${mgr.role})`);
                        setManagerPin(mgr.pin);
                      }}
                      className={`p-2 rounded-xl text-left border text-xs transition-all cursor-pointer ${
                        approvedManagerName.startsWith(mgr.name)
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-black'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span className="block truncate font-bold">{mgr.name}</span>
                      <span className="text-[9px] text-slate-500">PIN: {mgr.pin}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-6 py-2.5 rounded-2xl text-xs font-black text-white flex items-center gap-2 shadow-md transition-all cursor-pointer ${
                type === 'Cash In' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20' : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>Record {type}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
