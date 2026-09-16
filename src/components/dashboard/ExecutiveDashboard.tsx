import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Boxes,
  AlertTriangle,
  ArrowUpRight,
  Monitor,
  Store,
  Layers,
  ArrowRight,
  Truck,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Users,
  CreditCard,
  Building2,
  PieChart as PieChartIcon,
  BarChart3,
  Sparkles,
  Calendar,
  Filter,
  ShieldCheck,
  Clock,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Activity,
  PackageCheck,
  Zap,
  Hourglass,
  Trash2,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { Order, BranchLocationId } from '../../types';
import { AdvancedAnalyticsView } from './AdvancedAnalyticsView';

interface DashboardProps {
  setActiveTab: (tab: string) => void;
}

type TimeframeOption = 'today' | '7days' | '30days' | 'ytd';
type ViewModeOption = 'summary' | 'analytics' | 'locations' | 'channels' | 'audit';

export const ExecutiveDashboard: React.FC<DashboardProps> = ({ setActiveTab }) => {
  const {
    currentRole,
    products,
    orders,
    formatCurrency,
    stockMovements,
    locations,
    getTotalStockForVariant,
    purchaseOrders,
    customers,
    batchLots,
    disposeExpiredBatch,
  } = useCommerce();

  // Expiring & Expired Batch Lots Alert Calculation for Inventory Manager
  const expiringBatchAlerts = useMemo(() => {
    const now = Date.now();
    const expiredLots: Array<any> = [];
    const expiringSoonLots: Array<any> = [];

    (batchLots || []).forEach((lot) => {
      if (lot.remainingQuantity <= 0) return;
      const expTime = new Date(lot.expiryDate).getTime();
      const daysLeft = Math.ceil((expTime - now) / (1000 * 60 * 60 * 24));
      const value = lot.remainingQuantity * lot.unitCost;

      if (daysLeft <= 0) {
        expiredLots.push({ ...lot, daysLeft, value });
      } else if (daysLeft <= 45) {
        expiringSoonLots.push({ ...lot, daysLeft, value });
      }
    });

    const totalAtRiskCount = expiredLots.length + expiringSoonLots.length;
    const totalAtRiskValue = [...expiredLots, ...expiringSoonLots].reduce((sum, l) => sum + l.value, 0);

    return {
      expiredLots,
      expiringSoonLots,
      totalAtRiskCount,
      totalAtRiskValue,
    };
  }, [batchLots]);

  // Interactive Controls
  const [timeframe, setTimeframe] = useState<TimeframeOption>('7days');
  const [viewMode, setViewMode] = useState<ViewModeOption>('summary');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('Just now');
  const [orderChannelFilter, setOrderChannelFilter] = useState<'all' | 'POS' | 'ECOMMERCE'>('all');
  const [chartMetric, setChartMetric] = useState<'revenue' | 'volume'>('revenue');

  // Trigger manual refresh simulation
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSyncedTime(timeStr);
    }, 600);
  };

  // Export CSV function
  const handleExportCSV = () => {
    const headers = ['Order Number', 'Date', 'Customer', 'Source/Channel', 'Payment Status', 'Fulfillment Status', 'Total Amount'];
    const rows = orders.map((o) => [
      o.orderNumber,
      o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'N/A',
      `"${o.customerName || 'Guest'}"`,
      o.source,
      o.paymentStatus,
      o.status,
      o.totalAmount.toFixed(2),
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Executive_Commerce_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Core Metrics calculations
  const totalRevenue = useMemo(() => {
    return orders.reduce((sum, o) => sum + (o.paymentStatus === 'Paid' ? o.totalAmount : 0), 0);
  }, [orders]);

  const posRevenue = useMemo(() => {
    return orders.filter((o) => o.source === 'POS' && o.paymentStatus === 'Paid').reduce((sum, o) => sum + o.totalAmount, 0);
  }, [orders]);

  const ecomRevenue = useMemo(() => {
    return orders.filter((o) => o.source === 'ECOMMERCE' && o.paymentStatus === 'Paid').reduce((sum, o) => sum + o.totalAmount, 0);
  }, [orders]);

  // Calculate COGS and Gross Profit
  const totalCOGS = useMemo(() => {
    let cogs = 0;
    orders.forEach((o) => {
      if (o.paymentStatus === 'Paid') {
        o.items.forEach((item) => {
          cogs += (item.costPrice || item.price * 0.6) * item.quantity;
        });
      }
    });
    return cogs;
  }, [orders]);

  const grossProfit = totalRevenue - totalCOGS;
  const profitMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Inventory Metrics
  const { totalInventoryUnits, totalInventoryValuationCost, totalInventoryRetailValuation, lowStockVariantsCount, outOfStockVariantsCount } = useMemo(() => {
    let units = 0;
    let costVal = 0;
    let retailVal = 0;
    let lowCount = 0;
    let outCount = 0;

    products.forEach((prod) => {
      prod.variants.forEach((v) => {
        const stock = getTotalStockForVariant(v);
        units += stock;
        costVal += stock * v.costPrice;
        retailVal += stock * v.retailPrice;
        if (stock === 0) {
          outCount++;
        } else if (stock <= v.lowStockThreshold) {
          lowCount++;
        }
      });
    });

    return {
      totalInventoryUnits: units,
      totalInventoryValuationCost: costVal,
      totalInventoryRetailValuation: retailVal,
      lowStockVariantsCount: lowCount,
      outOfStockVariantsCount: outCount,
    };
  }, [products, getTotalStockForVariant]);

  // Fulfillment Pipeline
  const pendingFulfillmentOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'Stock Reserved' || o.status === 'Picking' || o.status === 'Packed');
  }, [orders]);

  const completedOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'Completed' || o.status === 'Shipped' || o.status === 'Delivered');
  }, [orders]);

  const fulfillmentRate = orders.length > 0 ? Math.round((completedOrders.length / orders.length) * 100) : 100;
  const averageOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

  // Multi-location breakdown stats
  const locationStats = useMemo(() => {
    return locations.map((loc) => {
      let locStock = 0;
      let locValuation = 0;
      products.forEach((p) => {
        p.variants.forEach((v) => {
          const qty = v.stockByLocation[loc.id] || 0;
          locStock += qty;
          locValuation += qty * v.costPrice;
        });
      });

      // Calculate revenue attributed to this location (POS orders or fulfilled orders)
      const locRevenue = orders
        .filter((o) => o.paymentStatus === 'Paid' && (o.fulfillmentLocationId === loc.id || (o.source === 'POS' && loc.id === 'loc-store-downtown')))
        .reduce((sum, o) => sum + o.totalAmount, 0);

      return {
        ...loc,
        totalStock: locStock,
        valuationCost: locValuation,
        revenue: locRevenue,
      };
    });
  }, [locations, products, orders]);

  // Dynamic Multi-period revenue trend chart data
  const revenueTrendData = useMemo(() => {
    if (timeframe === 'today') {
      return [
        { period: '08:00', pos: 320, online: 180, total: 500, volume: 4 },
        { period: '10:00', pos: 640, online: 420, total: 1060, volume: 8 },
        { period: '12:00', pos: 1100, online: 890, total: 1990, volume: 15 },
        { period: '14:00', pos: 1450, online: 1120, total: 2570, volume: 21 },
        { period: '16:00', pos: 1820, online: 1480, total: 3300, volume: 28 },
        { period: '18:00', pos: posRevenue || 2200, online: ecomRevenue || 1750, total: (posRevenue + ecomRevenue) || 3950, volume: 34 },
      ];
    } else if (timeframe === '30days') {
      return [
        { period: 'Week 1', pos: 8400, online: 6200, total: 14600, volume: 110 },
        { period: 'Week 2', pos: 9800, online: 7500, total: 17300, volume: 135 },
        { period: 'Week 3', pos: 11200, online: 8900, total: 20100, volume: 160 },
        { period: 'Week 4', pos: posRevenue || 12800, online: ecomRevenue || 9400, total: (posRevenue + ecomRevenue) || 22200, volume: 185 },
      ];
    } else if (timeframe === 'ytd') {
      return [
        { period: 'Q1', pos: 34000, online: 28000, total: 62000, volume: 480 },
        { period: 'Q2', pos: 41000, online: 34000, total: 75000, volume: 590 },
        { period: 'Q3', pos: 48000, online: 39000, total: 87000, volume: 680 },
        { period: 'Q4 (Est)', pos: posRevenue || 52000, online: ecomRevenue || 43000, total: (posRevenue + ecomRevenue) || 95000, volume: 740 },
      ];
    }
    // Default 7 days
    return [
      { period: 'Mon', pos: 1240, online: 850, total: 2090, volume: 14 },
      { period: 'Tue', pos: 1580, online: 1100, total: 2680, volume: 19 },
      { period: 'Wed', pos: 1420, online: 950, total: 2370, volume: 17 },
      { period: 'Thu', pos: 1890, online: 1400, total: 3290, volume: 24 },
      { period: 'Fri', pos: 2450, online: 1980, total: 4430, volume: 31 },
      { period: 'Sat', pos: 3100, online: 2400, total: 5500, volume: 42 },
      { period: 'Sun', pos: posRevenue || 1850, online: ecomRevenue || 1420, total: (posRevenue + ecomRevenue) || 3270, volume: 26 },
    ];
  }, [timeframe, posRevenue, ecomRevenue]);

  const channelSplitData = [
    { name: 'POS Retail In-Store', value: posRevenue > 0 ? posRevenue : 58, color: '#0284c7' },
    { name: 'Online Storefront', value: ecomRevenue > 0 ? ecomRevenue : 42, color: '#6366f1' },
  ];

  // Payment Breakdown
  const paymentMethodData = [
    { name: 'Credit Card', value: 52, color: '#0ea5e9' },
    { name: 'Apple / G-Pay', value: 26, color: '#10b981' },
    { name: 'BNPL / Installments', value: 14, color: '#ec4899' },
    { name: 'Store Credit / Cash', value: 8, color: '#f59e0b' },
  ];

  // Filtered orders for table display
  const filteredOrders = useMemo(() => {
    if (orderChannelFilter === 'all') return orders;
    return orders.filter((o) => o.source === orderChannelFilter);
  }, [orders, orderChannelFilter]);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300 pb-12">
      
      {/* 1. EXECUTIVE HEADER & ACTION CONTROLS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-7 border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 sm:gap-6">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Executive Dashboard
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Zero-Desync Core</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Omnichannel Sales Velocity & Financial Control • Role:{' '}
            <strong className="text-sky-600 dark:text-sky-400 font-bold">{currentRole}</strong>
          </p>
        </div>

        {/* Toolbar & Filter Options */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-3">
          
          {/* Timeframe Selector Pills */}
          <div className="p-1 bg-slate-100 dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center text-xs font-bold overflow-x-auto max-w-full">
            {(['today', '7days', '30days', 'ytd'] as TimeframeOption[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all cursor-pointer whitespace-nowrap text-[11px] sm:text-xs ${
                  timeframe === tf
                    ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tf === 'today' ? 'Today' : tf === '7days' ? '7 Days' : tf === '30days' ? '30 Days' : 'YTD'}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200/80 dark:border-slate-700 cursor-pointer flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[40px] sm:min-h-[40px]"
              title="Refresh Dashboard Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRefreshing ? 'animate-spin text-sky-500' : ''}`} />
            </button>

            <button
              onClick={handleExportCSV}
              className="px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-all border border-slate-200/80 dark:border-slate-700 cursor-pointer min-h-[36px] sm:min-h-[40px]"
            >
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-500" />
              <span className="hidden sm:inline">Export Brief</span>
            </button>

            <button
              onClick={() => setActiveTab('pos')}
              className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:opacity-95 text-white rounded-xl text-xs font-extrabold shadow-md shadow-sky-600/20 flex items-center gap-1.5 transition-all cursor-pointer min-h-[36px] sm:min-h-[40px]"
            >
              <Monitor className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>POS</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. TOP 4 EXECUTIVE KPI CARDS (2 COLUMNS PER ROW ON MOBILE & TABLET, 4 ON DESKTOP) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-6">
        
        {/* KPI 1: Gross Revenue */}
        <div className="p-3 sm:p-5 lg:p-6 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-sky-500/40 transition-all">
          <div className="space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-bold">
              <span className="uppercase tracking-wider truncate">Gross Sales</span>
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
                <DollarSign className="w-3 h-3 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="flex flex-wrap items-baseline gap-1 sm:gap-2">
              <span className="text-sm xs:text-lg sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                {formatCurrency(totalRevenue)}
              </span>
              <span className="text-[9px] sm:text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center">
                <ArrowUpRight className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" /> +14%
              </span>
            </div>
          </div>
          <div className="pt-2 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-2 sm:mt-4 flex flex-col xs:flex-row items-start xs:items-center justify-between text-[9px] sm:text-[11px] gap-0.5">
            <span className="text-slate-500 dark:text-slate-400 truncate">POS: <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(posRevenue)}</strong></span>
            <span className="text-slate-500 dark:text-slate-400 truncate">Online: <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(ecomRevenue)}</strong></span>
          </div>
        </div>

        {/* KPI 2: Net Profit Margin */}
        <div className="p-3 sm:p-5 lg:p-6 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-bold">
              <span className="uppercase tracking-wider truncate">Gross Profit</span>
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="flex flex-wrap items-baseline gap-1 sm:gap-2">
              <span className="text-sm xs:text-lg sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                {formatCurrency(grossProfit)}
              </span>
              <span className="px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded-full text-[8px] sm:text-[10px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {profitMarginPercent.toFixed(0)}% Margin
              </span>
            </div>
          </div>
          <div className="pt-2 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-2 sm:mt-4 flex items-center justify-between text-[9px] sm:text-[11px] gap-0.5">
            <span className="text-slate-500 dark:text-slate-400 truncate">COGS: {formatCurrency(totalCOGS)}</span>
            <button
              onClick={() => setActiveTab('finance')}
              className="text-sky-600 dark:text-sky-400 font-bold hover:underline cursor-pointer truncate"
            >
              P&L →
            </button>
          </div>
        </div>

        {/* KPI 3: Inventory Valuation */}
        <div className="p-3 sm:p-5 lg:p-6 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-indigo-500/40 transition-all">
          <div className="space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-bold">
              <span className="uppercase tracking-wider truncate">Stock Cost</span>
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                <Boxes className="w-3 h-3 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm xs:text-lg sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                {formatCurrency(totalInventoryValuationCost)}
              </span>
            </div>
          </div>
          <div className="pt-2 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-2 sm:mt-4 flex items-center justify-between text-[9px] sm:text-[11px] gap-0.5">
            <span className="text-slate-500 dark:text-slate-400 truncate">{totalInventoryUnits} Units</span>
            <button
              onClick={() => setActiveTab('stock')}
              className="text-sky-600 dark:text-sky-400 font-bold hover:underline cursor-pointer truncate"
            >
              Stock →
            </button>
          </div>
        </div>

        {/* KPI 4: Fulfillment Pipeline & Low Stock Alerts */}
        <div className="p-3 sm:p-5 lg:p-6 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-bold">
              <span className="uppercase tracking-wider truncate">Pipeline</span>
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <Truck className="w-3 h-3 sm:w-4 sm:h-4" />
              </div>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <div>
                <span className="text-sm xs:text-lg sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                  {pendingFulfillmentOrders.length}
                </span>
                <span className="text-[9px] sm:text-xs text-slate-500 dark:text-slate-400 ml-1">Pending</span>
              </div>
              {lowStockVariantsCount > 0 && (
                <span className="px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full text-[8px] sm:text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-0.5">
                  <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  <span>{lowStockVariantsCount} Low</span>
                </span>
              )}
            </div>
          </div>
          <div className="pt-2 sm:pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-2 sm:mt-4 flex items-center justify-between text-[9px] sm:text-[11px] gap-0.5">
            <span className="text-slate-500 dark:text-slate-400 truncate">{fulfillmentRate}% On-Time</span>
            <button
              onClick={() => setActiveTab('orders')}
              className="text-sky-600 dark:text-sky-400 font-bold hover:underline cursor-pointer truncate"
            >
              Fulfill →
            </button>
          </div>
        </div>
      </div>

      {/* 2.5 INVENTORY MANAGER EXPIRING SOON STOCK ALERTS */}
      {expiringBatchAlerts.totalAtRiskCount > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-orange-500/10 border border-amber-500/30 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
                <Hourglass className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Expiring Soon Stock Alerts</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-500 text-white">
                      {expiringBatchAlerts.totalAtRiskCount} Batches at Risk
                    </span>
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Automated shelf-life & FEFO radar: <strong className="text-rose-600 dark:text-rose-400 font-bold">{expiringBatchAlerts.expiredLots.length} expired</strong> and <strong className="text-amber-600 dark:text-amber-400 font-bold">{expiringBatchAlerts.expiringSoonLots.length} expiring within 45 days</strong>. At-risk valuation: {formatCurrency(expiringBatchAlerts.totalAtRiskValue)}
                </p>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('stock')}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-amber-300 dark:shadow-none flex items-center justify-center gap-1.5 transition-colors self-start sm:self-auto shrink-0 cursor-pointer"
            >
              <span>Manage Batch Registry</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Cards of Expiring & Expired Items */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...expiringBatchAlerts.expiredLots, ...expiringBatchAlerts.expiringSoonLots].slice(0, 6).map((lot) => {
              const isExpired = lot.daysLeft <= 0;
              return (
                <div
                  key={lot.id}
                  className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                        {lot.batchNumber}
                      </span>
                      <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1 mt-1">{lot.productName}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{lot.locationName}</p>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 border ${
                        isExpired
                          ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900'
                          : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900'
                      }`}
                    >
                      {isExpired ? `Expired (${Math.abs(lot.daysLeft)}d ago)` : `Expiring in ${lot.daysLeft}d`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {lot.remainingQuantity} units ({formatCurrency(lot.value)})
                    </span>
                    {isExpired && (
                      <button
                        onClick={() => {
                          if (confirm(`Dispose and write off ${lot.remainingQuantity} expired units of ${lot.batchNumber}?`)) {
                            disposeExpiredBatch(lot.id, 'Disposed from Dashboard Alert');
                          }
                        }}
                        className="text-rose-600 dark:text-rose-400 hover:underline font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Dispose</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. EXECUTIVE VIEW TABS (SUMMARY / ANALYTICS / LOCATIONS / CHANNELS / AUDIT) */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-1 overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setViewMode('summary')}
          className={`px-3.5 sm:px-4 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            viewMode === 'summary'
              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Executive Summary</span>
        </button>

        <button
          onClick={() => setViewMode('analytics')}
          className={`px-3.5 sm:px-4 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            viewMode === 'analytics'
              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4 text-sky-500" />
          <span>Advanced Analytics</span>
        </button>

        <button
          onClick={() => setViewMode('locations')}
          className={`px-3.5 sm:px-4 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            viewMode === 'locations'
              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Branch Location Matrix ({locations.length})</span>
        </button>

        <button
          onClick={() => setViewMode('channels')}
          className={`px-3.5 sm:px-4 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            viewMode === 'channels'
              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <PieChartIcon className="w-4 h-4" />
          <span>Channel & Payment Mix</span>
        </button>

        <button
          onClick={() => setViewMode('audit')}
          className={`px-3.5 sm:px-4 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            viewMode === 'audit'
              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Live Audit Stream ({stockMovements.length})</span>
        </button>
      </div>

      {/* ADVANCED ANALYTICS VIEW MODE */}
      {viewMode === 'analytics' && <AdvancedAnalyticsView />}

      {/* 4. MAIN SUMMARY VIEW MODE */}
      {(viewMode === 'summary' || viewMode === 'channels') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
          
          {/* Revenue Velocity Chart (8 cols) */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 p-5 sm:p-7 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white tracking-tight">
                  Revenue Velocity & Channel Comparison
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Real-time sales tracking across POS Retail Stores and E-Commerce
                </p>
              </div>

              {/* Toggle Chart Metric (Revenue vs Volume) */}
              <div className="flex items-center gap-2">
                <div className="p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex text-[11px] font-bold">
                  <button
                    onClick={() => setChartMetric('revenue')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      chartMetric === 'revenue'
                        ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Revenue ($)
                  </button>
                  <button
                    onClick={() => setChartMetric('volume')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      chartMetric === 'volume'
                        ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Order Volume
                  </button>
                </div>
              </div>
            </div>

            {/* Area Chart Container */}
            <div className="h-72 sm:h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="posColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ecomColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => (chartMetric === 'revenue' ? `$${v}` : v)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#ffffff',
                      fontSize: '12px',
                    }}
                    formatter={(val: any) => [chartMetric === 'revenue' ? formatCurrency(Number(val)) : `${val} orders`, '']}
                  />
                  {chartMetric === 'revenue' ? (
                    <>
                      <Area type="monotone" dataKey="pos" stroke="#0284c7" strokeWidth={2.5} fillOpacity={1} fill="url(#posColor)" name="POS Retail" />
                      <Area type="monotone" dataKey="online" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#ecomColor)" name="E-Commerce" />
                    </>
                  ) : (
                    <Area type="monotone" dataKey="volume" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#posColor)" name="Orders Count" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Legend & Channel Total Footer */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 mt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                  <span className="w-3 h-3 rounded-full bg-sky-600"></span> POS Retail Store ({formatCurrency(posRevenue)})
                </span>
                <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                  <span className="w-3 h-3 rounded-full bg-indigo-500"></span> E-Commerce ({formatCurrency(ecomRevenue)})
                </span>
              </div>
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Average Order Value: <strong className="text-slate-900 dark:text-white font-black">{formatCurrency(averageOrderValue)}</strong>
              </span>
            </div>
          </div>

          {/* Channel Mix & Payment Gateway (4 cols) */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 p-5 sm:p-7 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-6">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white tracking-tight mb-1">
                Channel & Payment Mix
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Gross sales volume split across channels
              </p>

              <div className="h-48 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channelSplitData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {channelSplitData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                      formatter={(v: any) => [formatCurrency(Number(v)), '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2 text-xs pt-2">
                <div className="flex justify-between items-center p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                  <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span> POS Retail
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(posRevenue)}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                  <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Storefront
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(ecomRevenue)}</span>
                </div>
              </div>
            </div>

            {/* Payment Method Distribution Bar */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Preferred Payment Methods
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {paymentMethodData.map((pm) => (
                  <div key={pm.name} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/30">
                    <span className="text-slate-700 dark:text-slate-300 font-medium truncate">{pm.name}</span>
                    <strong className="text-slate-900 dark:text-white ml-1">{pm.value}%</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MULTI-LOCATION BRANCH MATRIX VIEW */}
      {(viewMode === 'locations' || viewMode === 'summary') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black text-lg text-slate-900 dark:text-white tracking-tight">
                Branch Location & Stock Hub Matrix
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Connected retail outlets, distribution centers, and warehouses
              </p>
            </div>
            <button
              onClick={() => setActiveTab('stock')}
              className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Locations & Bins</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {locationStats.map((loc) => (
              <div
                key={loc.id}
                className="p-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-4 flex flex-col justify-between hover:border-sky-500/40 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        loc.type === 'Warehouse'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          : loc.type === 'Retail Store'
                          ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
                          : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
                      }`}
                    >
                      {loc.type}
                    </span>
                    {loc.isPosEnabled && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Monitor className="w-3 h-3" />
                        <span>POS Active</span>
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="font-black text-base text-slate-900 dark:text-white truncate">
                      {loc.name}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{loc.address}</p>
                  </div>
                </div>

                <div className="space-y-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span>Units On Hand:</span>
                    <strong className="text-slate-900 dark:text-white font-extrabold">{loc.totalStock} units</strong>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span>Inventory Cost:</span>
                    <strong className="text-slate-900 dark:text-white font-extrabold">{formatCurrency(loc.valuationCost)}</strong>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span>Channel Revenue:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold">{formatCurrency(loc.revenue)}</strong>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setActiveTab('stock')}
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>View Location Bins</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. RECENT ORDERS TABLE & LIVE AUDIT STREAM SPLIT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
        
        {/* Recent Integrated Orders Table (8 cols) */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white tracking-tight">
                Recent Integrated Orders
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Unified live orders across POS and Storefront
              </p>
            </div>

            {/* Channel Filter Pills */}
            <div className="flex items-center gap-2">
              <div className="p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex text-[11px] font-bold">
                <button
                  onClick={() => setOrderChannelFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    orderChannelFilter === 'all'
                      ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  All ({orders.length})
                </button>
                <button
                  onClick={() => setOrderChannelFilter('POS')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    orderChannelFilter === 'POS'
                      ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  POS
                </button>
                <button
                  onClick={() => setOrderChannelFilter('ECOMMERCE')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    orderChannelFilter === 'ECOMMERCE'
                      ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Storefront
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Card List View (Mobile devices < sm) */}
          <div className="block sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {filteredOrders.slice(0, 6).map((o) => (
              <div key={o.id} className="p-3.5 space-y-2 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {o.orderNumber}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                        o.source === 'POS'
                          ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
                          : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
                      }`}
                    >
                      {o.source === 'POS' ? 'POS' : 'Online'}
                    </span>
                  </div>
                  <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                    {formatCurrency(o.totalAmount)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{o.customerName || 'Walk-In Customer'}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1.5">• {o.items.length} items</span>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                      o.status === 'Completed' || o.status === 'Delivered'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : o.status === 'Picking' || o.status === 'Stock Reserved'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                        : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
                    }`}
                  >
                    {o.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Table Container for Tablet & Desktop (>= sm) */}
          <div className="hidden sm:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs sm:text-sm text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-black tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-5">Order #</th>
                  <th className="py-3 px-5">Customer</th>
                  <th className="py-3 px-5">Channel</th>
                  <th className="py-3 px-5 text-right">Total</th>
                  <th className="py-3 px-5 text-center">Fulfillment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOrders.slice(0, 6).map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-5 font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {o.orderNumber}
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="font-bold text-slate-900 dark:text-white text-xs">{o.customerName || 'Walk-In Customer'}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">{o.items.length} item(s)</div>
                    </td>
                    <td className="py-3.5 px-5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          o.source === 'POS'
                            ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
                            : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
                        }`}
                      >
                        {o.source === 'POS' ? 'POS Store' : 'Online Store'}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(o.totalAmount)}
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                          o.status === 'Completed' || o.status === 'Delivered'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            : o.status === 'Picking' || o.status === 'Stock Reserved'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                            : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Showing top 6 orders</span>
            <button
              onClick={() => setActiveTab('orders')}
              className="text-sky-600 dark:text-sky-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View Full Order Pipeline ({orders.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Stock Events & Audit Activity Stream (4 cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 p-5 sm:p-7 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white tracking-tight">
                Live Stock Events Stream
              </h3>
              <button
                onClick={() => setActiveTab('movements')}
                className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
              >
                Full Audit Trail
              </button>
            </div>

            <div className="space-y-3.5 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
              {stockMovements.slice(0, 5).map((mov) => {
                const isOut = mov.type === 'POS_SALE' || mov.type === 'ECOMMERCE_SALE';
                const isReceive = mov.type === 'PURCHASE_RECEIVE' || mov.type === 'SALE_RETURN';

                return (
                  <div key={mov.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-slate-900 dark:text-white truncate max-w-[160px]">{mov.productName}</span>
                      <span
                        className={`font-mono font-bold text-xs ${
                          mov.quantityChange > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {mov.quantityChange > 0 ? `+${mov.quantityChange}` : mov.quantityChange} units
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{mov.locationName}</span>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">{mov.type}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Health Gauge Box */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-slate-700 dark:text-slate-300">Fulfillment Health</span>
              <span className="text-emerald-600 dark:text-emerald-400">99.1% Operational</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-sky-500 to-emerald-500 h-full rounded-full" style={{ width: '99.1%' }}></div>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Double-entry atomic stock deductions synchronized across all channels
            </p>
          </div>
        </div>

      </div>

    </div>
  );
};
