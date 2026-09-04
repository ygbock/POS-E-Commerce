import React, { useRef } from 'react';
import { PosShift } from '../../types';
import { useCommerce } from '../../context/CommerceContext';
import {
  FileText,
  Printer,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  Landmark,
  ShieldCheck,
  UserCheck,
  Building2,
  Calendar,
  Clock,
  DollarSign,
  TrendingUp,
  Receipt,
  Scale,
  Banknote,
  ArrowDownLeft,
  ArrowUpRight,
  Hash
} from 'lucide-react';

interface ReconciliationReportModalProps {
  shift: PosShift | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReconciliationReportModal: React.FC<ReconciliationReportModalProps> = ({
  shift,
  isOpen,
  onClose,
}) => {
  const { formatCurrency, currentLocation } = useCommerce();
  const reportRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !shift) return null;

  const recon = shift.reconciliation;
  const isBalanced = (shift.cashDifference || 0) === 0;
  const openedDate = new Date(shift.openedAt);
  const closedDate = shift.closedAt ? new Date(shift.closedAt) : new Date();

  // Duration calculation
  const durationMs = closedDate.getTime() - openedDate.getTime();
  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
  const durationMins = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  // Reconciliation arithmetic
  const openingFloat = shift.openingCash;
  const cashSales = shift.totalCashSales;
  const cashRefunds = shift.totalRefunds;
  const cashInTotal = shift.cashInTotal || 0;
  const cashOutTotal = shift.cashOutTotal || 0;
  const expectedCash = shift.closingCashCalculated;
  const primaryActualCash = shift.closingCashActual ?? expectedCash;
  const secondCountCash = recon?.secondCount ?? primaryActualCash;
  const variance = primaryActualCash - expectedCash;

  const netSales = shift.totalSales - shift.totalRefunds;

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const csvRows = [
      ['POS END OF SHIFT RECONCILIATION REPORT'],
      ['Store Location', currentLocation.name],
      ['Terminal ID', shift.terminalId],
      ['Shift ID', shift.id],
      ['Cashier Name', shift.cashierName],
      ['Opened At', openedDate.toLocaleString()],
      ['Closed At', closedDate.toLocaleString()],
      ['Status', shift.status],
      [''],
      ['FINANCIAL SALES SUMMARY'],
      ['Total Gross Sales', shift.totalSales.toFixed(2)],
      ['Total Refunds', shift.totalRefunds.toFixed(2)],
      ['Net Sales', netSales.toFixed(2)],
      ['Transactions Count', shift.transactionsCount],
      [''],
      ['TENDER BREAKDOWN'],
      ['Cash Sales', shift.totalCashSales.toFixed(2)],
      ['Credit/Debit Cards', shift.totalCardSales.toFixed(2)],
      ['Mobile Money', shift.totalMobileSales.toFixed(2)],
      ['Fintech Wallet', shift.totalWalletSales.toFixed(2)],
      [''],
      ['REGISTER CASH DRAWER BALANCING'],
      ['Opening Cash Float', openingFloat.toFixed(2)],
      ['+ Cash Sales Collections', cashSales.toFixed(2)],
      ['- Cash Refunds Processed', cashRefunds.toFixed(2)],
      ['+ Paid-In Cash Additions', cashInTotal.toFixed(2)],
      ['- Paid-Out Cash Expenses', cashOutTotal.toFixed(2)],
      ['= Expected Cash in Drawer', expectedCash.toFixed(2)],
      ['Physical Primary Count', primaryActualCash.toFixed(2)],
      ['Physical Second Verification Count', secondCountCash.toFixed(2)],
      ['Cash Variance (Overage/Shortage)', variance.toFixed(2)],
      ['Variance Reason Classification', recon?.varianceReason || 'N/A'],
      [''],
      ['RECONCILIATION SIGN-OFF'],
      ['Double Check Verifier', recon?.verifierName || 'N/A'],
      ['Supervisor Sign-off', recon?.supervisorName || 'N/A'],
      ['Supervisor Approved', recon?.supervisorApproved ? 'YES' : 'NO'],
      ['General Ledger Reference', recon?.ledgerEntryId || 'N/A'],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Reconciliation_Report_${shift.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Header Bar */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center shadow-md">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base tracking-tight text-white flex items-center gap-2">
                <span>End-of-Shift Reconciliation Report</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 border border-slate-700 text-slate-300">
                  {shift.id}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                {currentLocation.name} • {shift.terminalId} • Cashier: {shift.cashierName}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportCsv}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title="Export CSV Data"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-md shadow-sky-600/20"
              title="Print Official Document"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print Report</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Body */}
        <div ref={reportRef} className="p-6 overflow-y-auto space-y-6 text-slate-900 dark:text-slate-100 text-xs">
          {/* Printable Header */}
          <div className="text-center pb-4 border-b border-slate-200 dark:border-slate-800 space-y-1">
            <h2 className="text-lg font-black uppercase tracking-wider text-slate-900 dark:text-white">
              {currentLocation.name}
            </h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              REGISTER TILL AUDIT & SHIFT RECONCILIATION STATEMENT
            </p>
            <p className="text-[11px] font-mono text-slate-400">
              Terminal: {shift.terminalId} • Shift ID: {shift.id} • Cashier: {shift.cashierName}
            </p>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/80">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Opened At</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {openedDate.toLocaleDateString()} {openedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Closed At</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {closedDate.toLocaleDateString()} {closedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Shift Duration</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {durationHours}h {durationMins}m
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Terminal Status</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                {shift.status}
              </span>
            </div>
          </div>

          {/* 1. FINANCIAL SALES & TENDER SUMMARY */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase text-slate-800 dark:text-white tracking-wider flex items-center gap-2 border-b pb-1.5 border-slate-200 dark:border-slate-800">
              <TrendingUp className="w-4 h-4 text-sky-500" />
              <span>1. Shift Revenue & Tender Breakdown</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Gross Sales</span>
                <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                  {formatCurrency(shift.totalSales)}
                </span>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Refunds</span>
                <span className="text-sm font-black font-mono text-rose-600 dark:text-rose-400">
                  -{formatCurrency(shift.totalRefunds)}
                </span>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Net Revenue</span>
                <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(netSales)}
                </span>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Bills Issued</span>
                <span className="text-sm font-black text-slate-900 dark:text-white">
                  {shift.transactionsCount} receipts
                </span>
              </div>
            </div>

            {/* Tender Table */}
            <div className="overflow-hidden border border-slate-200 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800/80 font-bold text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="p-2.5">Payment Method</th>
                    <th className="p-2.5 text-right">Collection Amount</th>
                    <th className="p-2.5 text-right">% Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  <tr>
                    <td className="p-2.5 font-bold flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-emerald-500" />
                      <span>Cash Tender Collections</span>
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(shift.totalCashSales)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-500">
                      {shift.totalSales > 0 ? ((shift.totalCashSales / shift.totalSales) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-sky-500" />
                      <span>Credit / Debit Cards</span>
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(shift.totalCardSales)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-500">
                      {shift.totalSales > 0 ? ((shift.totalCardSales / shift.totalSales) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-amber-500" />
                      <span>Mobile Money / Fintech Wallet</span>
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(shift.totalMobileSales + shift.totalWalletSales)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-500">
                      {shift.totalSales > 0 ? (((shift.totalMobileSales + shift.totalWalletSales) / shift.totalSales) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. REGISTER CASH DRAWER BALANCING & VARIANCE AUDIT */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase text-slate-800 dark:text-white tracking-wider flex items-center gap-2 border-b pb-1.5 border-slate-200 dark:border-slate-800">
              <Scale className="w-4 h-4 text-amber-500" />
              <span>2. Register Till Cash Balancing Statement</span>
            </h4>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2 font-mono text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-600 dark:text-slate-400 font-sans">Starting Opening Cash Float:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(openingFloat)}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-600 dark:text-slate-400 font-sans">+ Cash Sales Collections:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">+{formatCurrency(cashSales)}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-600 dark:text-slate-400 font-sans">- Cash Refunds Processed:</span>
                <span className="font-bold text-rose-600 dark:text-rose-400">-{formatCurrency(cashRefunds)}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-600 dark:text-slate-400 font-sans">+ Paid-In Cash Additions (Cash In):</span>
                <span className="font-bold text-sky-600 dark:text-sky-400">+{formatCurrency(cashInTotal)}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-600 dark:text-slate-400 font-sans">- Paid-Out Cash Expenses (Cash Out):</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">-{formatCurrency(cashOutTotal)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-t border-b border-slate-300 dark:border-slate-600 font-black text-sm">
                <span className="font-sans">Calculated Expected Cash in Drawer:</span>
                <span className="text-sky-600 dark:text-sky-400">{formatCurrency(expectedCash)}</span>
              </div>
            </div>

            {/* Actual Physical Counts vs Variance */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Primary Physical Count</span>
                <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                  {formatCurrency(primaryActualCash)}
                </span>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Secondary Double Check</span>
                <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                  {formatCurrency(secondCountCash)}
                </span>
              </div>
              <div className={`p-3 rounded-xl border ${
                isBalanced
                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}>
                <span className="text-[10px] font-bold uppercase block opacity-80">Reconciliation Variance</span>
                <span className="text-sm font-black font-mono">
                  {variance > 0 ? '+' : ''}{formatCurrency(variance)}
                  <span className="text-[10px] font-sans font-bold ml-1">
                    ({isBalanced ? 'Balanced' : variance > 0 ? 'Overage' : 'Shortage'})
                  </span>
                </span>
              </div>
            </div>

            {/* Denomination Matrix if captured */}
            {recon?.denominations && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <p className="font-bold text-[11px] text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Physical Cash Denomination Count Matrix
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center font-mono text-[11px]">
                  <div className="p-1.5 bg-white dark:bg-slate-900 rounded border">
                    <span className="text-[9px] text-slate-400 block">$100s</span>
                    <strong className="text-slate-800 dark:text-slate-200">{recon.denominations.hundreds}</strong>
                  </div>
                  <div className="p-1.5 bg-white dark:bg-slate-900 rounded border">
                    <span className="text-[9px] text-slate-400 block">$50s</span>
                    <strong className="text-slate-800 dark:text-slate-200">{recon.denominations.fifties}</strong>
                  </div>
                  <div className="p-1.5 bg-white dark:bg-slate-900 rounded border">
                    <span className="text-[9px] text-slate-400 block">$20s</span>
                    <strong className="text-slate-800 dark:text-slate-200">{recon.denominations.twenties}</strong>
                  </div>
                  <div className="p-1.5 bg-white dark:bg-slate-900 rounded border">
                    <span className="text-[9px] text-slate-400 block">$10s</span>
                    <strong className="text-slate-800 dark:text-slate-200">{recon.denominations.tens}</strong>
                  </div>
                  <div className="p-1.5 bg-white dark:bg-slate-900 rounded border">
                    <span className="text-[9px] text-slate-400 block">$5s</span>
                    <strong className="text-slate-800 dark:text-slate-200">{recon.denominations.fives}</strong>
                  </div>
                  <div className="p-1.5 bg-white dark:bg-slate-900 rounded border">
                    <span className="text-[9px] text-slate-400 block">$1s</span>
                    <strong className="text-slate-800 dark:text-slate-200">{recon.denominations.ones}</strong>
                  </div>
                  <div className="p-1.5 bg-white dark:bg-slate-900 rounded border">
                    <span className="text-[9px] text-slate-400 block">Coins</span>
                    <strong className="text-slate-800 dark:text-slate-200">${recon.denominations.coins?.toFixed(2) || '0.00'}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. CASH MOVEMENTS LOG (PAID-IN / PAID-OUT) */}
          {shift.cashMovements && shift.cashMovements.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-800 dark:text-white tracking-wider flex items-center gap-2 border-b pb-1.5 border-slate-200 dark:border-slate-800">
                <Banknote className="w-4 h-4 text-emerald-500" />
                <span>3. Shift Cash Paid-In & Paid-Out Log</span>
              </h4>

              <div className="overflow-hidden border border-slate-200 dark:border-slate-800 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800/80 font-bold text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="p-2.5">Time</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">Reason</th>
                      <th className="p-2.5">Approved By</th>
                      <th className="p-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {shift.cashMovements.map((m) => (
                      <tr key={m.id}>
                        <td className="p-2.5 font-mono text-slate-500">
                          {new Date(m.performedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.type === 'Cash In' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}>
                            {m.type}
                          </span>
                        </td>
                        <td className="p-2.5 font-medium text-slate-800 dark:text-slate-200">{m.reason}</td>
                        <td className="p-2.5 text-slate-500">{m.approvedBy || 'Standard Cashier'}</td>
                        <td className="p-2.5 text-right font-mono font-bold">
                          {m.type === 'Cash In' ? '+' : '-'}{formatCurrency(m.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. GENERAL LEDGER POSTING & SIGN-OFF */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <h4 className="text-xs font-black uppercase text-slate-800 dark:text-white tracking-wider flex items-center gap-2">
              <Landmark className="w-4 h-4 text-sky-500" />
              <span>4. General Ledger Double-Entry Audit & Sign-Off</span>
            </h4>

            <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-2 border border-slate-800 text-xs">
              <div className="flex justify-between items-center text-[11px] font-mono border-b border-slate-800 pb-2">
                <span>GL JOURNAL ENTRY REF: {recon?.ledgerEntryId || `ledg-shf-${shift.id}`}</span>
                <span className="text-emerald-400 font-bold">POSTED & VERIFIED</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-slate-400 block">Double Check Verifier:</span>
                  <strong className="text-slate-200">{recon?.verifierName || 'Elena Rostova'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Supervisor Approval:</span>
                  <strong className="text-emerald-400">{recon?.supervisorName || 'Marcus Vance'} (PIN Validated)</strong>
                </div>
              </div>
            </div>

            {/* Signature Block */}
            <div className="grid grid-cols-2 gap-6 pt-6 text-center">
              <div className="space-y-8">
                <div className="border-b-2 border-slate-300 dark:border-slate-700 pb-1">
                  <span className="font-script text-lg text-slate-700 dark:text-slate-300">{shift.cashierName}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Cashier Signature & Acceptance
                </span>
              </div>
              <div className="space-y-8">
                <div className="border-b-2 border-slate-300 dark:border-slate-700 pb-1">
                  <span className="font-script text-lg text-slate-700 dark:text-slate-300">{recon?.supervisorName || 'Marcus Vance'}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Store Manager / Supervisor Sign-off
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
