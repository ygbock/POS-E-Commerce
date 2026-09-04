import React, { useState } from 'react';
import {
  Landmark,
  Scale,
  TrendingUp,
  Search,
  Layers,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';

export const LedgerAndFinance: React.FC = () => {
  const { ledgerEntries, formatCurrency } = useCommerce();

  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>('All');
  const [searchRef, setSearchRef] = useState('');
  const [activeFinanceTab, setActiveFinanceTab] = useState<'journal' | 'pnl' | 'balancesheet'>('journal');

  // Filtered Journal
  const filteredJournal = ledgerEntries.filter((entry) => {
    const matchesSource = selectedSourceFilter === 'All' || entry.source === selectedSourceFilter;
    const matchesSearch =
      entry.transactionNumber.toLowerCase().includes(searchRef.toLowerCase()) ||
      entry.referenceId.toLowerCase().includes(searchRef.toLowerCase()) ||
      entry.description.toLowerCase().includes(searchRef.toLowerCase()) ||
      entry.accountDebited.toLowerCase().includes(searchRef.toLowerCase()) ||
      entry.accountCredited.toLowerCase().includes(searchRef.toLowerCase());
    return matchesSource && matchesSearch;
  });

  // Calculate high-level financial summary
  let totalRevenue = 0;
  let totalCogs = 0;
  let cashAndBank = 25000; // Baseline starting balance
  let inventoryAssetVal = 18450;
  let accountsPayable = 3500;
  let accountsReceivable = 1200;

  ledgerEntries.forEach((e) => {
    if (e.source === 'POS_SALE' || e.source === 'ECOMMERCE_SALE') {
      if (e.accountCredited.includes('Revenue')) {
        totalRevenue += e.amount;
        cashAndBank += e.amount;
      }
      if (e.accountDebited.includes('Cost of Goods Sold')) {
        totalCogs += e.amount;
        inventoryAssetVal = Math.max(0, inventoryAssetVal - e.amount);
      }
    } else if (e.source === 'PO_PAYMENT') {
      accountsPayable += e.amount;
      inventoryAssetVal += e.amount;
    } else if (e.source === 'SALE_REFUND') {
      totalRevenue -= e.amount;
      cashAndBank -= e.amount;
    }
  });

  const grossProfit = totalRevenue - totalCogs;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const totalAssets = cashAndBank + inventoryAssetVal + accountsReceivable;
  const totalLiabilities = accountsPayable;
  const netEquity = totalAssets - totalLiabilities;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Landmark className="w-6 h-6 text-blue-600" />
            <span>Fintech Core & General Ledger</span>
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Real-time automated double-entry bookkeeping capturing every sale, supplier invoice, inventory revaluation, and tax liability
          </p>
        </div>

        {/* Quick Snapshot KPIs */}
        <div className="flex items-center space-x-2 text-xs">
          <div className="px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-800 font-bold font-mono">
            Cash in Bank: {formatCurrency(cashAndBank)}
          </div>
          <div className="px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200 text-blue-800 font-bold font-mono">
            Inventory Asset: {formatCurrency(inventoryAssetVal)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold text-slate-600 shadow-sm">
        <button
          onClick={() => setActiveFinanceTab('journal')}
          className={`flex-1 py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeFinanceTab === 'journal' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Double-Entry General Journal ({ledgerEntries.length})</span>
        </button>

        <button
          onClick={() => setActiveFinanceTab('pnl')}
          className={`flex-1 py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeFinanceTab === 'pnl' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Real-time Income Statement (P&L)</span>
        </button>

        <button
          onClick={() => setActiveFinanceTab('balancesheet')}
          className={`flex-1 py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeFinanceTab === 'balancesheet' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Balance Sheet & Equity Equation</span>
        </button>
      </div>

      {/* TAB 1: General Journal */}
      {activeFinanceTab === 'journal' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search tx #, reference, account..."
                value={searchRef}
                onChange={(e) => setSearchRef(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center space-x-2 text-xs text-slate-600">
              <span>Transaction Type:</span>
              <select
                aria-label="Transaction Type"
                value={selectedSourceFilter}
                onChange={(e) => setSelectedSourceFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs text-slate-800 rounded-lg py-1 px-2.5 focus:outline-none focus:border-blue-500"
              >
                <option value="All">All Transactions</option>
                <option value="POS_SALE">POS Retail Sales</option>
                <option value="POS_SHIFT_RECONCILIATION">POS Shift Cashier Reconciliations</option>
                <option value="ECOMMERCE_SALE">E-Commerce Web Sales</option>
                <option value="PO_PAYMENT">Purchasing & Inbound GRN</option>
                <option value="INVENTORY_ADJUSTMENT">Inventory Revaluations</option>
                <option value="SALE_REFUND">Returns & Refunds</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Tx Number</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Description / Reference</th>
                    <th className="py-3 px-4">Account Debited (+)</th>
                    <th className="py-3 px-4">Account Credited (-)</th>
                    <th className="py-3 px-4 text-right">Amount ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                  {filteredJournal.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 text-slate-500 font-sans">
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {entry.transactionNumber}
                      </td>
                      <td className="py-2.5 px-4 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                            entry.source === 'POS_SALE'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : entry.source === 'POS_SHIFT_RECONCILIATION'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : entry.source === 'ECOMMERCE_SALE'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : entry.source === 'PO_PAYMENT'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {entry.source.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-sans text-slate-700">
                        {entry.description} <span className="text-slate-400 font-mono">[{entry.referenceId}]</span>
                      </td>
                      <td className="py-2.5 px-4 font-sans text-emerald-700 font-semibold">
                        {entry.accountDebited}
                      </td>
                      <td className="py-2.5 px-4 font-sans text-rose-700 font-semibold">
                        {entry.accountCredited}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                        {formatCurrency(entry.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: P&L */}
      {activeFinanceTab === 'pnl' && (
        <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 text-sm text-slate-900">
          <div className="border-b border-slate-200 pb-3 text-center">
            <h3 className="text-base font-bold uppercase tracking-wider text-slate-900">OmniCore Statement of Profit & Loss</h3>
            <p className="text-slate-500 text-xs mt-0.5">Real-time consolidated multi-channel accounting</p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm font-bold text-blue-700 border-b border-slate-100 pb-2">
              <span>Gross Operating Revenue:</span>
              <span className="font-mono text-base">{formatCurrency(totalRevenue)}</span>
            </div>

            <div className="flex justify-between items-center text-rose-700 border-b border-slate-100 pb-2">
              <span>Less: Cost of Goods Sold (COGS):</span>
              <span className="font-mono font-bold">-{formatCurrency(totalCogs)}</span>
            </div>

            <div className="flex justify-between items-center text-base font-bold text-emerald-700 border-b border-slate-200 pb-3 pt-1">
              <span>GROSS PROFIT:</span>
              <span className="font-mono font-bold">{formatCurrency(grossProfit)}</span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl flex justify-between items-center text-xs border border-slate-200">
              <span className="text-slate-600 font-semibold">Gross Profit Margin:</span>
              <span className="font-bold text-emerald-700 text-sm font-mono">{grossMargin.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Balance Sheet */}
      {activeFinanceTab === 'balancesheet' && (
        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-900">
          {/* ASSETS */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold uppercase text-emerald-700 tracking-wider">Total Assets</h3>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between text-slate-600">
                <span>Cash & Equivalents:</span>
                <strong className="font-mono text-slate-900">{formatCurrency(cashAndBank)}</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Central Inventory Asset:</span>
                <strong className="font-mono text-slate-900">{formatCurrency(inventoryAssetVal)}</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Accounts Receivable:</span>
                <strong className="font-mono text-slate-900">{formatCurrency(accountsReceivable)}</strong>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold text-emerald-700">
                <span>TOTAL ASSETS:</span>
                <span className="font-mono">{formatCurrency(totalAssets)}</span>
              </div>
            </div>
          </div>

          {/* LIABILITIES & EQUITY */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold uppercase text-amber-800 tracking-wider">Liabilities & Net Equity</h3>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between text-slate-600">
                <span>Accounts Payable (Suppliers):</span>
                <strong className="font-mono text-slate-900">{formatCurrency(accountsPayable)}</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Total Liabilities:</span>
                <strong className="font-mono text-amber-800">{formatCurrency(totalLiabilities)}</strong>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold text-blue-700">
                <span>RETAINED NET EQUITY:</span>
                <span className="font-mono">{formatCurrency(netEquity)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
