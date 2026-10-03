import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, DollarSign, RefreshCw, TrendingUp, Download } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { reportingApi, InventoryValuation, SalesSummary } from '../../services/reportingApi';

type ChannelFilter = 'all' | 'POS' | 'ECOMMERCE' | 'PHONE' | 'WHOLESALE';

function isoDate(daysAgo = 30) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const money = (value: string | number) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const AdvancedAnalyticsView: React.FC = () => {
  const [from, setFrom] = useState(isoDate(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [sales, setSales] = useState<SalesSummary | null>(null);
  const [inventory, setInventory] = useState<InventoryValuation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [salesData, inventoryData] = await Promise.all([
        reportingApi.getSalesSummary({ from, to, channel: channel === 'all' ? undefined : channel }),
        reportingApi.getInventoryValuation(),
      ]);
      setSales(salesData);
      setInventory(inventoryData);
    } catch (err: any) {
      setError(err?.message || 'Unable to load analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [from, to, channel]);

  const handleExport = () => {
    if (!sales) return;
    const rows = [
      ['Day', 'Orders', 'Revenue', 'Gross Profit'],
      ...sales.daily.map(row => [row.day, row.orderCount, row.revenue, row.grossProfit]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AbaCha_Analytics_${from}_${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const channelData = useMemo(() => sales?.byChannel.map(row => ({
    channel: row.channel,
    revenue: Number(row.revenue),
    grossProfit: Number(row.grossProfit),
  })) || [], [sales]);

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">Reports & Analytics</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Server-aggregated financial and inventory metrics for the authenticated tenant.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-bold text-slate-500">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="block mt-1 rounded-lg border px-2 py-1.5 dark:bg-slate-800" /></label>
            <label className="text-xs font-bold text-slate-500">To<input type="date" value={to} onChange={e => setTo(e.target.value)} className="block mt-1 rounded-lg border px-2 py-1.5 dark:bg-slate-800" /></label>
            <select value={channel} onChange={e => setChannel(e.target.value as ChannelFilter)} className="rounded-lg border px-3 py-2 text-sm dark:bg-slate-800">
              <option value="all">All channels</option><option value="POS">POS</option><option value="ECOMMERCE">E-commerce</option><option value="PHONE">Phone</option><option value="WHOLESALE">Wholesale</option>
            </select>
            <button onClick={() => void load()} disabled={loading} className="p-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800" aria-label="Refresh reports"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
            <button onClick={handleExport} disabled={!sales} className="px-3 py-2 rounded-lg border text-sm font-bold flex items-center gap-2"><Download className="w-4 h-4" /> Export</button>
          </div>
        </div>
      </div>

      {error && <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric icon={<DollarSign />} label="Revenue" value={sales ? money(sales.grossSales) : '—'} />
        <Metric icon={<TrendingUp />} label="Gross Profit" value={sales ? money(sales.grossProfit) : '—'} />
        <Metric icon={<TrendingUp />} label="Gross Margin" value={sales ? `${sales.grossMarginPercent.toFixed(2)}%` : '—'} />
        <Metric icon={<Boxes />} label="Inventory Cost Value" value={inventory ? money(inventory.costValue) : '—'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
          <h3 className="font-black text-slate-900 dark:text-white mb-4">Revenue & Gross Profit</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sales?.daily || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tickFormatter={v => String(v).slice(5)} />
                <YAxis />
                <Tooltip formatter={(v: any) => money(v)} />
                <Area type="monotone" dataKey="revenue" name="Revenue" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="grossProfit" name="Gross Profit" fillOpacity={0.08} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
          <h3 className="font-black text-slate-900 dark:text-white mb-4">Sales by Channel</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="channel" />
                <YAxis />
                <Tooltip formatter={(v: any) => money(v)} />
                <Bar dataKey="revenue" name="Revenue" />
                <Bar dataKey="grossProfit" name="Gross Profit" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
          <h3 className="font-black text-slate-900 dark:text-white mb-4">Inventory Valuation</h3>
          {inventory && <div className="grid grid-cols-2 gap-4 text-sm">
            <Stat label="Variants" value={String(inventory.variantCount)} />
            <Stat label="On-hand units" value={inventory.onHandUnits} />
            <Stat label="Available units" value={inventory.availableUnits} />
            <Stat label="Reserved units" value={inventory.reservedUnits} />
            <Stat label="Cost value" value={money(inventory.costValue)} />
            <Stat label="Retail value" value={money(inventory.retailValue)} />
          </div>}
        </section>
        <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
          <h3 className="font-black text-slate-900 dark:text-white mb-4">Report Totals</h3>
          {sales && <div className="grid grid-cols-2 gap-4 text-sm">
            <Stat label="Orders" value={String(sales.orderCount)} />
            <Stat label="Average order" value={money(sales.averageOrderValue)} />
            <Stat label="Discounts" value={money(sales.discounts)} />
            <Stat label="Tax" value={money(sales.tax)} />
            <Stat label="Shipping" value={money(sales.shipping)} />
            <Stat label="COGS" value={money(sales.cogs)} />
          </div>}
        </section>
      </div>
    </div>
  );
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
    <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">{icon}<span>{label}</span></div>
    <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{value}</div>
  </div>
);

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
    <div className="text-xs text-slate-500">{label}</div>
    <div className="font-bold text-slate-900 dark:text-white mt-1">{value}</div>
  </div>
);
