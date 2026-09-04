import React, { useState } from 'react';
import { useCommerce } from '../../context/CommerceContext';
import { PosShiftReconciliation, CashDenominations, PosShift } from '../../types';
import { CashMovementModal } from './CashMovementModal';
import { ReconciliationReportModal } from './ReconciliationReportModal';
import {
  Lock,
  Unlock,
  Calculator,
  X,
  CheckCircle,
  AlertTriangle,
  Scale,
  ShieldCheck,
  Landmark,
  Layers,
  History,
  Banknote,
  UserCheck,
  ChevronRight,
  ArrowLeft,
  FileSpreadsheet,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Printer,
} from 'lucide-react';

interface ShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShiftModal: React.FC<ShiftModalProps> = ({ isOpen, onClose }) => {
  const {
    posShift,
    posShiftHistory,
    openPosShift,
    closePosShift,
    formatCurrency,
    currentLocation,
  } = useCommerce();

  const [openingCashInput, setOpeningCashInput] = useState<string>('300.00');
  const [cashierNameInput, setCashierNameInput] = useState<string>(posShift.cashierName || 'Elena Rostova');

  // Modal sub-states
  const [showCashMovementModal, setShowCashMovementModal] = useState<boolean>(false);
  const [selectedReportShift, setSelectedReportShift] = useState<PosShift | null>(null);

  // Multi-step Reconciliation State
  const [reconStep, setReconStep] = useState<1 | 2 | 3 | 4>(1);
  const [activeTab, setActiveTab] = useState<'status' | 'close' | 'history' | 'open'>('status');

  // Step 1: Denominations & Primary Count
  const [denominations, setDenominations] = useState<CashDenominations>({
    hundreds: 0,
    fifties: 0,
    twenties: 0,
    tens: 0,
    fives: 0,
    ones: 0,
    coins: 0,
  });

  const denominationSum =
    denominations.hundreds * 100 +
    denominations.fifties * 50 +
    denominations.twenties * 20 +
    denominations.tens * 10 +
    denominations.fives * 5 +
    denominations.ones * 1 +
    (parseFloat(String(denominations.coins)) || 0);

  const [primaryCountInput, setPrimaryCountInput] = useState<string>('');
  const activePrimaryCash = primaryCountInput !== '' ? parseFloat(primaryCountInput) || 0 : denominationSum;

  // Step 2: Second Count / Double Check
  const [secondCountInput, setSecondCountInput] = useState<string>('');
  const [verifierNameInput, setVerifierNameInput] = useState<string>('Marcus Vance (Store Manager)');
  const [doubleCheckError, setDoubleCheckError] = useState<string>('');

  // Step 3: Variance Reason & Notes
  const [varianceReason, setVarianceReason] = useState<PosShiftReconciliation['varianceReason']>('Balanced');
  const [closeNotes, setCloseNotes] = useState<string>('');

  // Step 4: Supervisor Approval & Sign-Off
  const [supervisorApproved, setSupervisorApproved] = useState<boolean>(true);
  const [supervisorNameInput, setSupervisorNameInput] = useState<string>('Marcus Vance');
  const [supervisorPin, setSupervisorPin] = useState<string>('1234');

  // Selected History Shift Modal view
  const [viewHistoryShift, setViewHistoryShift] = useState<any | null>(null);

  if (!isOpen) return null;

  const handleDenomChange = (field: keyof CashDenominations, value: string) => {
    const val = parseFloat(value) || 0;
    setDenominations((prev) => ({ ...prev, [field]: val }));
  };

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    const cash = parseFloat(openingCashInput) || 0;
    openPosShift(cash, cashierNameInput);
    onClose();
  };

  const expectedCash = posShift.closingCashCalculated;
  const calculatedDifference = activePrimaryCash - expectedCash;

  // Step 1 -> Step 2 Validation
  const goToStep2 = () => {
    setSecondCountInput('');
    setDoubleCheckError('');
    setReconStep(2);
  };

  // Step 2 -> Step 3 Validation (Double Check Match Enforcement)
  const verifyStep2DoubleCheck = () => {
    const secVal = parseFloat(secondCountInput);
    if (isNaN(secVal)) {
      setDoubleCheckError('Please enter a numeric second cash count for verification.');
      return;
    }
    if (Math.abs(secVal - activePrimaryCash) > 0.01) {
      setDoubleCheckError(
        `Count Mismatch! Primary count (${formatCurrency(activePrimaryCash)}) does not match Second count (${formatCurrency(secVal)}). Re-count drawer cash to confirm accuracy.`
      );
      return;
    }

    setDoubleCheckError('');
    // Auto-select variance reason based on diff
    const diff = activePrimaryCash - expectedCash;
    if (Math.abs(diff) < 0.01) {
      setVarianceReason('Balanced');
    } else if (diff < 0) {
      setVarianceReason('Change Dispense Error');
    } else {
      setVarianceReason('Unrecorded Petty Expense');
    }
    setReconStep(3);
  };

  // Final Submit: Close Shift & Post to Ledger
  const handleFinalReconciliationClose = (e: React.FormEvent) => {
    e.preventDefault();
    const secondCountVal = parseFloat(secondCountInput) || activePrimaryCash;

    closePosShift(activePrimaryCash, {
      secondCount: secondCountVal,
      verifierName: verifierNameInput,
      varianceReason,
      denominations,
      supervisorApproved,
      supervisorName: supervisorNameInput,
      notes: closeNotes,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 text-slate-900 dark:text-slate-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>POS Register & Cashier Reconciliation</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {currentLocation.name} • Terminal 01 • Double-Check Financial Audit
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-4 text-xs font-semibold overflow-x-auto shrink-0">
          <button
            onClick={() => {
              setActiveTab('status');
              setViewHistoryShift(null);
            }}
            className={`py-3 px-3 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'status' ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Shift Summary</span>
          </button>

          {posShift.status === 'Open' ? (
            <button
              onClick={() => {
                setActiveTab('close');
                setReconStep(1);
                setViewHistoryShift(null);
              }}
              className={`py-3 px-3 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === 'close' ? 'border-rose-600 text-rose-600 dark:text-rose-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Cashier Reconciliation</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setActiveTab('open');
                setViewHistoryShift(null);
              }}
              className={`py-3 px-3 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === 'open' ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Open New Shift</span>
            </button>
          )}

          <button
            onClick={() => {
              setActiveTab('history');
              setViewHistoryShift(null);
            }}
            className={`py-3 px-3 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'history' ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Past Shift Ledger Logs ({posShiftHistory.length})</span>
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* TAB 1: STATUS SUMMARY */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Active Terminal Register Status</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                        posShift.status === 'Open'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${posShift.status === 'Open' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                      {posShift.status} Shift
                    </span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Cashier: <strong>{posShift.cashierName}</strong>
                    </span>
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                  <p>Started: {new Date(posShift.openedAt).toLocaleTimeString()}</p>
                  <p className="font-mono text-[10px] mt-0.5">ID: {posShift.id}</p>
                </div>
              </div>

              {/* Financial Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Opening Float</span>
                  <p className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5">{formatCurrency(posShift.openingCash)}</p>
                </div>
                <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Expected Cash</span>
                  <p className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">{formatCurrency(posShift.closingCashCalculated)}</p>
                </div>
                <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Cash Paid-In (+)</span>
                  <p className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">+{formatCurrency(posShift.cashInTotal || 0)}</p>
                </div>
                <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Cash Paid-Out (-)</span>
                  <p className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400 mt-0.5">-{formatCurrency(posShift.cashOutTotal || 0)}</p>
                </div>
              </div>

              {/* Quick Cash Movement & Statement Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowCashMovementModal(true)}
                  className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowUpRight className="w-4 h-4 text-rose-500" />
                  <span>Record Cash In / Cash Out</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReportShift(posShift)}
                  className="py-2.5 px-3 bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>View Shift Report</span>
                </button>
              </div>

              {/* Tender breakdown */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <p className="font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider">Tender Method Breakdown</p>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Cash Collections:</span>
                  <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(posShift.totalCashSales)}</strong>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Credit/Debit Card:</span>
                  <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(posShift.totalCardSales)}</strong>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Mobile Money / Fintech Wallet:</span>
                  <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(posShift.totalMobileSales + posShift.totalWalletSales)}</strong>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>Refunds Processed:</span>
                  <strong className="font-mono text-rose-600 dark:text-rose-400">-{formatCurrency(posShift.totalRefunds)}</strong>
                </div>
              </div>

              {posShift.status === 'Open' ? (
                <button
                  onClick={() => {
                    setActiveTab('close');
                    setReconStep(1);
                  }}
                  className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>Begin Double-Check Cashier Reconciliation</span>
                </button>
              ) : (
                <button
                  onClick={() => setActiveTab('open')}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Open New Shift</span>
                </button>
              )}
            </div>
          )}

          {/* TAB 2: CASHIER RECONCILIATION MULTI-STEP FLOW */}
          {activeTab === 'close' && (
            <div className="space-y-4">
              {/* Stepper Progress Bar */}
              <div className="grid grid-cols-4 gap-1 text-[11px] font-bold text-center">
                <div className={`p-2 rounded-lg border transition-all ${reconStep === 1 ? 'bg-blue-600 text-white border-blue-600' : reconStep > 1 ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                  1. Count Cash
                </div>
                <div className={`p-2 rounded-lg border transition-all ${reconStep === 2 ? 'bg-blue-600 text-white border-blue-600' : reconStep > 2 ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                  2. Double Check
                </div>
                <div className={`p-2 rounded-lg border transition-all ${reconStep === 3 ? 'bg-blue-600 text-white border-blue-600' : reconStep > 3 ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                  3. Variance & Reason
                </div>
                <div className={`p-2 rounded-lg border transition-all ${reconStep === 4 ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                  4. Post to Ledger
                </div>
              </div>

              {/* STEP 1: DENOMINATIONS & PRIMARY COUNT */}
              {reconStep === 1 && (
                <div className="space-y-4">
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                    <Banknote className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Step 1 of 4: Primary Physical Cash Drawer Count</p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        Count physical bills & coins in drawer. Enter denomination bill quantities or set total count directly.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Expected Register Cash (Opening + Cash Sales - Refunds):</span>
                    <strong className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400">{formatCurrency(expectedCash)}</strong>
                  </div>

                  {/* Denomination Counter Matrix */}
                  <div className="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2.5">
                    <p className="font-bold text-slate-800 dark:text-white text-[11px] uppercase tracking-wider flex items-center justify-between">
                      <span>Denomination Bill Counter</span>
                      <span className="text-blue-600 dark:text-blue-400 font-mono font-bold">Sum: {formatCurrency(denominationSum)}</span>
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div className="p-2 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                        <label className="text-[10px] font-bold text-slate-500">$100 Bills</label>
                        <input
                          type="number"
                          min="0"
                          value={denominations.hundreds || ''}
                          onChange={(e) => handleDenomChange('hundreds', e.target.value)}
                          placeholder="0"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded p-1 text-slate-900 dark:text-white font-mono text-xs font-bold"
                        />
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                        <label className="text-[10px] font-bold text-slate-500">$50 Bills</label>
                        <input
                          type="number"
                          min="0"
                          value={denominations.fifties || ''}
                          onChange={(e) => handleDenomChange('fifties', e.target.value)}
                          placeholder="0"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded p-1 text-slate-900 dark:text-white font-mono text-xs font-bold"
                        />
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                        <label className="text-[10px] font-bold text-slate-500">$20 Bills</label>
                        <input
                          type="number"
                          min="0"
                          value={denominations.twenties || ''}
                          onChange={(e) => handleDenomChange('twenties', e.target.value)}
                          placeholder="0"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded p-1 text-slate-900 dark:text-white font-mono text-xs font-bold"
                        />
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                        <label className="text-[10px] font-bold text-slate-500">$10 Bills</label>
                        <input
                          type="number"
                          min="0"
                          value={denominations.tens || ''}
                          onChange={(e) => handleDenomChange('tens', e.target.value)}
                          placeholder="0"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded p-1 text-slate-900 dark:text-white font-mono text-xs font-bold"
                        />
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                        <label className="text-[10px] font-bold text-slate-500">$5 Bills</label>
                        <input
                          type="number"
                          min="0"
                          value={denominations.fives || ''}
                          onChange={(e) => handleDenomChange('fives', e.target.value)}
                          placeholder="0"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded p-1 text-slate-900 dark:text-white font-mono text-xs font-bold"
                        />
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                        <label className="text-[10px] font-bold text-slate-500">Loose Coins ($ Total)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={denominations.coins || ''}
                          onChange={(e) => handleDenomChange('coins', e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded p-1 text-slate-900 dark:text-white font-mono text-xs font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Primary Total Override */}
                  <div className="space-y-1">
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold">Primary Counted Cash Total ($):</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={primaryCountInput !== '' ? primaryCountInput : denominationSum > 0 ? denominationSum.toFixed(2) : ''}
                        onChange={(e) => setPrimaryCountInput(e.target.value)}
                        placeholder={denominationSum > 0 ? denominationSum.toFixed(2) : '0.00'}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl py-2.5 pl-8 pr-3 text-slate-900 dark:text-white text-base font-bold font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Auto-populated from bill matrix above or override with total cash count.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('status')}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={goToStep2}
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Proceed to Step 2: Double-Check Verification</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: SECOND COUNT / DOUBLE CHECK ENFORCEMENT */}
              {reconStep === 2 && (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl text-blue-900 dark:text-blue-300 flex items-start gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Step 2 of 4: Mandatory Second Verification Count</p>
                      <p className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">
                        Financial audit rule: A second physical count is required to verify the cash total ({formatCurrency(activePrimaryCash)}) before closing.
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Primary Count Recorded:</span>
                      <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(activePrimaryCash)}</strong>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Expected Register Cash:</span>
                      <strong className="font-mono text-blue-600 dark:text-blue-400">{formatCurrency(expectedCash)}</strong>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                        Re-enter Second Count Total ($):
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={secondCountInput}
                          onChange={(e) => {
                            setSecondCountInput(e.target.value);
                            setDoubleCheckError('');
                          }}
                          placeholder="Re-enter count total..."
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl py-2.5 pl-8 pr-3 text-slate-900 dark:text-white text-base font-bold font-mono focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                        Verifier / Secondary Cashier Name:
                      </label>
                      <input
                        type="text"
                        value={verifierNameInput}
                        onChange={(e) => setVerifierNameInput(e.target.value)}
                        placeholder="Name of secondary cashier or supervisor..."
                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {doubleCheckError && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 rounded-xl text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{doubleCheckError}</span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setReconStep(1)}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors flex items-center gap-1"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={verifyStep2DoubleCheck}
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Confirm Double-Check Verification</span>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: VARIANCE REASON & NOTES */}
              {reconStep === 3 && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Double-Checked Cash Count:</span>
                      <strong className="font-mono text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(activePrimaryCash)}</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Expected Cash in Drawer:</span>
                      <strong className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">{formatCurrency(expectedCash)}</strong>
                    </div>

                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold ${
                        calculatedDifference === 0
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : calculatedDifference > 0
                          ? 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                      }`}
                    >
                      <span>Reconciliation Variance:</span>
                      <span className="font-mono text-sm">
                        {calculatedDifference > 0 ? '+' : ''}
                        {formatCurrency(calculatedDifference)}
                        {calculatedDifference === 0
                          ? ' (Perfect Match)'
                          : calculatedDifference > 0
                          ? ' (Cash Overage)'
                          : ' (Cash Shortage)'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                        Variance Classification Reason:
                      </label>
                      <select
                        value={varianceReason}
                        onChange={(e) => setVarianceReason(e.target.value as any)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:border-blue-500"
                      >
                        <option value="Balanced">Balanced (Perfect Match / Zero Variance)</option>
                        <option value="Change Dispense Error">Change Dispense Error</option>
                        <option value="Unrecorded Petty Expense">Unrecorded Petty Expense</option>
                        <option value="Drawer Float Mismatch">Drawer Float Mismatch</option>
                        <option value="Counterfeit Bill">Counterfeit Bill Discovered</option>
                        <option value="Bank Deposit Transfer">Bank Deposit Transfer Adjustment</option>
                        <option value="Other">Other Unclassified Discrepancy</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                        End of Shift Reconciliation Notes:
                      </label>
                      <textarea
                        rows={2}
                        value={closeNotes}
                        onChange={(e) => setCloseNotes(e.target.value)}
                        placeholder="Enter explanatory audit comments for accounting..."
                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setReconStep(2)}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors flex items-center gap-1"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReconStep(4)}
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Preview Ledger Journal Entry</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: LEDGER POSTING PREVIEW & SUPERVISOR SIGN-OFF */}
              {reconStep === 4 && (
                <form onSubmit={handleFinalReconciliationClose} className="space-y-4">
                  {/* Ledger Posting Card */}
                  <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2 border border-slate-800 shadow-md">
                    <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <Landmark className="w-4 h-4 text-emerald-400" />
                        <span className="font-bold text-slate-200">General Ledger Auto-Posting Preview</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        SOURCE: POS_SHIFT_RECONCILIATION
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                      <div>
                        <span className="text-slate-400 block">Account Debited:</span>
                        <strong className="text-emerald-400 font-mono">
                          {calculatedDifference < 0
                            ? 'Cash Shortage Expense'
                            : `POS Cash Drawer (${currentLocation.name})`}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Account Credited:</span>
                        <strong className="text-emerald-400 font-mono">
                          {calculatedDifference > 0
                            ? 'Cash Overage Income'
                            : `POS Sales Clearing Account (${currentLocation.name})`}
                        </strong>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800">
                      <span className="text-slate-400">Journal Amount Posted:</span>
                      <strong className="text-base font-mono font-bold text-emerald-400">
                        {formatCurrency(Math.abs(calculatedDifference) > 0 ? Math.abs(calculatedDifference) : activePrimaryCash)}
                      </strong>
                    </div>
                  </div>

                  {/* Supervisor Sign-Off Controls */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={supervisorApproved}
                          onChange={(e) => setSupervisorApproved(e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span>Supervisor Approval Signed Off</span>
                      </label>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">PIN Authorized</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500">Supervisor Name</label>
                        <input
                          type="text"
                          value={supervisorNameInput}
                          onChange={(e) => setSupervisorNameInput(e.target.value)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded p-1.5 text-slate-900 dark:text-white text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500">Supervisor PIN</label>
                        <input
                          type="password"
                          maxLength={4}
                          value={supervisorPin}
                          onChange={(e) => setSupervisorPin(e.target.value)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded p-1.5 text-slate-900 dark:text-white text-xs font-mono font-bold tracking-widest"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setReconStep(3)}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors flex items-center gap-1"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Lock className="w-4 h-4" />
                      <span>Post Reconciliation to Ledger & Close Register</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: PAST SHIFT LEDGER LOGS & AUDIT RECONCILIATIONS */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {viewHistoryShift ? (
                /* Detail view of selected past shift */
                <div className="space-y-3 bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => setViewHistoryShift(null)}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Shift History List</span>
                    </button>
                    <span className="font-mono text-[10px] text-slate-500">ID: {viewHistoryShift.id}</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cashier:</span>
                      <strong className="text-slate-900 dark:text-white">{viewHistoryShift.cashierName}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Closed Time:</span>
                      <strong className="text-slate-900 dark:text-white">{new Date(viewHistoryShift.closedAt || viewHistoryShift.openedAt).toLocaleString()}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Expected Cash:</span>
                      <strong className="font-mono text-blue-600">{formatCurrency(viewHistoryShift.closingCashCalculated)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Actual Counted Cash:</span>
                      <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(viewHistoryShift.closingCashActual || 0)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Variance:</span>
                      <strong className={`font-mono font-bold ${viewHistoryShift.cashDifference === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCurrency(viewHistoryShift.cashDifference || 0)}
                      </strong>
                    </div>
                    {viewHistoryShift.reconciliation && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                        <p className="font-bold text-[11px] text-slate-700 dark:text-slate-300">Reconciliation Audit Trail:</p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">
                          Verifier: <strong>{viewHistoryShift.reconciliation.verifierName}</strong>
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">
                          Classification Reason: <strong className="text-blue-600">{viewHistoryShift.reconciliation.varianceReason}</strong>
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">
                          Supervisor Sign-Off: <strong>{viewHistoryShift.reconciliation.supervisorName}</strong>
                        </p>
                        <button
                          type="button"
                          onClick={() => setSelectedReportShift(viewHistoryShift)}
                          className="w-full mt-2 py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                        >
                          <FileText className="w-4 h-4" />
                          <span>View & Print Reconciliation Report</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* List of history shifts */
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Audit log of closed shift reconciliations & financial double-entry ledger postings:
                  </p>

                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                    {posShiftHistory.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-xs">No past shift reconciliations recorded yet.</div>
                    ) : (
                      posShiftHistory.map((shift) => {
                        const isBalanced = (shift.cashDifference || 0) === 0;
                        return (
                          <div
                            key={shift.id}
                            onClick={() => setViewHistoryShift(shift)}
                            className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-900 dark:text-white">{shift.cashierName}</span>
                                <span className="font-mono text-[10px] text-slate-400">({shift.id})</span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {shift.closedAt ? new Date(shift.closedAt).toLocaleDateString() : 'Active'} • {shift.transactionsCount} bills
                              </p>
                            </div>

                            <div className="text-right flex items-center space-x-3">
                              <div>
                                <p className="font-mono font-bold text-slate-900 dark:text-white">
                                  {formatCurrency(shift.closingCashActual || shift.closingCashCalculated)}
                                </p>
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isBalanced
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                                  }`}
                                >
                                  {isBalanced ? 'Balanced' : `Variance: ${formatCurrency(shift.cashDifference || 0)}`}
                                </span>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: OPEN NEW SHIFT */}
          {activeTab === 'open' && (
            <form onSubmit={handleOpenShift} className="space-y-4 text-xs">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl text-blue-900 dark:text-blue-300">
                Opening a new shift assigns register transactions to the specified cashier and establishes the starting cash float.
              </div>

              <div className="space-y-1">
                <label className="block text-slate-700 dark:text-slate-300 font-semibold">Cashier Name:</label>
                <input
                  type="text"
                  required
                  value={cashierNameInput}
                  onChange={(e) => setCashierNameInput(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl py-2 px-3 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-700 dark:text-slate-300 font-semibold">Opening Cash Float ($):</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={openingCashInput}
                    onChange={(e) => setOpeningCashInput(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl py-2 pl-8 pr-3 text-slate-900 dark:text-white text-sm font-bold font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
                <span>Open Shift & Activate Scanner Terminal</span>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Sub-modals */}
      <CashMovementModal
        isOpen={showCashMovementModal}
        onClose={() => setShowCashMovementModal(false)}
      />

      <ReconciliationReportModal
        shift={selectedReportShift}
        isOpen={!!selectedReportShift}
        onClose={() => setSelectedReportShift(null)}
      />
    </div>
  );
};
