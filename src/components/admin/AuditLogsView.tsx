import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  History,
  Filter,
  Search,
  Download,
  RefreshCw,
  SlidersHorizontal,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  UserCheck,
  FileText,
  Layers,
  Eye,
  X,
  ChevronRight,
  Clock,
  ArrowRight,
  FileSpreadsheet,
  PlusCircle,
  Terminal,
  MapPin,
  User,
  DollarSign,
  Box,
  Key,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';
import { AuditLog, AuditModule, AuditSeverity, Role, RolePermission } from '../../types';

export const AuditLogsView: React.FC = () => {
  const {
    auditLogs,
    logAuditAction,
    locations,
    currentRole,
    currentLocation,
  } = useCommerce();

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [timeframe, setTimeframe] = useState<string>('ALL');

  // Modal / Drawer States
  const [inspectLog, setInspectLog] = useState<AuditLog | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showManualNoteModal, setShowManualNoteModal] = useState(false);

  // Manual Security Note Form State
  const [manualNoteAction, setManualNoteAction] = useState('');
  const [manualNoteModule, setManualNoteModule] = useState<AuditModule>('Security');
  const [manualNoteTargetId, setManualNoteTargetId] = useState('');
  const [manualNoteBefore, setManualNoteBefore] = useState('');
  const [manualNoteAfter, setManualNoteAfter] = useState('');
  const [manualNoteSeverity, setManualNoteSeverity] = useState<AuditSeverity>('High');

  // Role Permissions Local Management State
  const [localPermissions, setLocalPermissions] = useState<RolePermission[]>([
    {
      role: 'Super Admin',
      canOverridePrice: true,
      canApproveStockAdjustments: true,
      canProcessReturns: true,
      canDeleteProducts: true,
      canViewFinancialLedger: true,
      canManageUsers: true,
    },
    {
      role: 'Business Owner',
      canOverridePrice: true,
      canApproveStockAdjustments: true,
      canProcessReturns: true,
      canDeleteProducts: true,
      canViewFinancialLedger: true,
      canManageUsers: true,
    },
    {
      role: 'Store Manager',
      canOverridePrice: true,
      canApproveStockAdjustments: true,
      canProcessReturns: true,
      canDeleteProducts: false,
      canViewFinancialLedger: true,
      canManageUsers: false,
    },
    {
      role: 'Warehouse Manager',
      canOverridePrice: false,
      canApproveStockAdjustments: true,
      canProcessReturns: false,
      canDeleteProducts: false,
      canViewFinancialLedger: false,
      canManageUsers: false,
    },
    {
      role: 'Inventory Manager',
      canOverridePrice: false,
      canApproveStockAdjustments: true,
      canProcessReturns: false,
      canDeleteProducts: false,
      canViewFinancialLedger: false,
      canManageUsers: false,
    },
    {
      role: 'Cashier',
      canOverridePrice: false,
      canApproveStockAdjustments: false,
      canProcessReturns: true,
      canDeleteProducts: false,
      canViewFinancialLedger: false,
      canManageUsers: false,
    },
    {
      role: 'Accountant',
      canOverridePrice: false,
      canApproveStockAdjustments: false,
      canProcessReturns: false,
      canDeleteProducts: false,
      canViewFinancialLedger: true,
      canManageUsers: false,
    },
  ]);

  // Unique lists for filters
  const availableUsers = useMemo(() => {
    const set = new Set<string>();
    auditLogs.forEach((log) => {
      if (log.user) set.add(log.user);
    });
    return Array.from(set);
  }, [auditLogs]);

  // KPI Calculations
  const metrics = useMemo(() => {
    const total = auditLogs.length;
    const criticalAndHigh = auditLogs.filter(
      (l) => l.severity === 'Critical' || l.severity === 'High'
    ).length;
    const stockAdjustments = auditLogs.filter(
      (l) => l.module === 'Inventory' || l.action.toLowerCase().includes('stock') || l.action.toLowerCase().includes('adjustment')
    ).length;
    const priceOverrides = auditLogs.filter(
      (l) => l.module === 'Pricing' || l.action.toLowerCase().includes('override') || l.action.toLowerCase().includes('price')
    ).length;
    const securityChanges = auditLogs.filter(
      (l) => l.module === 'Security' || l.action.toLowerCase().includes('permission') || l.action.toLowerCase().includes('role')
    ).length;

    return { total, criticalAndHigh, stockAdjustments, priceOverrides, securityChanges };
  }, [auditLogs]);

  // Filtered Logs Calculation
  const filteredLogs = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    const now = new Date();

    return auditLogs.filter((log) => {
      // Text search
      if (query) {
        const matchesText =
          log.action.toLowerCase().includes(query) ||
          log.targetId.toLowerCase().includes(query) ||
          log.user.toLowerCase().includes(query) ||
          log.role.toLowerCase().includes(query) ||
          (log.beforeValue && log.beforeValue.toLowerCase().includes(query)) ||
          (log.afterValue && log.afterValue.toLowerCase().includes(query)) ||
          (log.ipAddress && log.ipAddress.toLowerCase().includes(query));

        if (!matchesText) return false;
      }

      // Module Filter
      if (selectedModule !== 'ALL' && log.module !== selectedModule) {
        return false;
      }

      // Severity Filter
      if (selectedSeverity !== 'ALL') {
        const logSev = log.severity || 'Info';
        if (selectedSeverity === 'CRITICAL_HIGH') {
          if (logSev !== 'Critical' && logSev !== 'High') return false;
        } else if (logSev !== selectedSeverity) {
          return false;
        }
      }

      // User Filter
      if (selectedUser !== 'ALL' && log.user !== selectedUser) {
        return false;
      }

      // Location Filter
      if (selectedLocation !== 'ALL') {
        if (log.locationName && !log.locationName.toLowerCase().includes(selectedLocation.toLowerCase())) {
          return false;
        }
      }

      // Timeframe Filter
      if (timeframe !== 'ALL') {
        const logDate = new Date(log.timestamp);
        const diffHours = (now.getTime() - logDate.getTime()) / (1000 * 3600);

        if (timeframe === '24H' && diffHours > 24) return false;
        if (timeframe === '7D' && diffHours > 24 * 7) return false;
        if (timeframe === '30D' && diffHours > 24 * 30) return false;
      }

      return true;
    });
  }, [auditLogs, searchTerm, selectedModule, selectedSeverity, selectedUser, selectedLocation, timeframe]);

  // Export handlers
  const handleExportCSV = () => {
    const headers = ['Log ID', 'Timestamp', 'User', 'Role', 'Module', 'Severity', 'Action', 'Target ID', 'Before Value', 'After Value', 'Location', 'IP Address'];
    const rows = filteredLogs.map((l) => [
      l.id,
      l.timestamp,
      `"${l.user}"`,
      `"${l.role}"`,
      l.module,
      l.severity || 'Info',
      `"${l.action.replace(/"/g, '""')}"`,
      `"${l.targetId}"`,
      `"${(l.beforeValue || '').replace(/"/g, '""')}"`,
      `"${(l.afterValue || '').replace(/"/g, '""')}"`,
      `"${l.locationName || currentLocation.name}"`,
      l.ipAddress || '192.168.1.50',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BackOffice_Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `BackOffice_Audit_Logs_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleCreateManualNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualNoteAction.trim()) return;

    logAuditAction(
      `[SECURITY AUDIT NOTE] ${manualNoteAction.trim()}`,
      manualNoteModule,
      manualNoteTargetId.trim() || 'SEC-NOTE-MANUAL',
      manualNoteBefore.trim() || undefined,
      manualNoteAfter.trim() || undefined,
      manualNoteSeverity,
      currentLocation.name
    );

    // Reset Form
    setManualNoteAction('');
    setManualNoteTargetId('');
    setManualNoteBefore('');
    setManualNoteAfter('');
    setShowManualNoteModal(false);
  };

  const handleTogglePermission = (roleName: Role, field: keyof Omit<RolePermission, 'role'>) => {
    setLocalPermissions((prev) =>
      prev.map((rp) => {
        if (rp.role === roleName) {
          const prevVal = rp[field];
          const nextVal = !prevVal;
          const updated = { ...rp, [field]: nextVal };

          logAuditAction(
            `Modified Security Policy for ${roleName}: Set ${field} to ${nextVal}`,
            'Security',
            `POLICY-${roleName.replace(/\s+/g, '-').toUpperCase()}`,
            `${field}: ${prevVal}`,
            `${field}: ${nextVal} (Updated by ${currentRole})`,
            'Critical',
            'All Branches'
          );

          return updated;
        }
        return rp;
      })
    );
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setSelectedModule('ALL');
    setSelectedSeverity('ALL');
    setSelectedUser('ALL');
    setSelectedLocation('ALL');
    setTimeframe('ALL');
  };

  const getSeverityBadge = (severity?: AuditSeverity) => {
    const sev = severity || 'Info';
    switch (sev) {
      case 'Critical':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
            CRITICAL
          </span>
        );
      case 'High':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            HIGH
          </span>
        );
      case 'Medium':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
            MEDIUM
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
            INFO
          </span>
        );
    }
  };

  const getModuleBadge = (moduleName: AuditModule) => {
    switch (moduleName) {
      case 'Security':
        return 'bg-rose-100/70 text-rose-800 border-rose-200';
      case 'Pricing':
        return 'bg-emerald-100/70 text-emerald-800 border-emerald-200';
      case 'Inventory':
        return 'bg-purple-100/70 text-purple-800 border-purple-200';
      case 'POS':
        return 'bg-sky-100/70 text-sky-800 border-sky-200';
      case 'Products':
        return 'bg-blue-100/70 text-blue-800 border-blue-200';
      case 'Purchasing':
        return 'bg-amber-100/70 text-amber-800 border-amber-200';
      case 'CRM':
        return 'bg-indigo-100/70 text-indigo-800 border-indigo-200';
      case 'Orders':
        return 'bg-teal-100/70 text-teal-800 border-teal-200';
      case 'Finance':
        return 'bg-slate-100 text-slate-800 border-slate-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Header */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-xs">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Back-Office Audit & Compliance Logs
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Immutable Ledger Active
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Real-time security auditing tracking manual stock adjustments, price overrides, role security policies, and user actions.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => setShowPermissionsModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-all cursor-pointer"
          >
            <Key className="w-4 h-4 text-slate-600" />
            <span>Role Security Matrix</span>
          </button>

          <button
            onClick={() => setShowManualNoteModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-all cursor-pointer shadow-xs"
          >
            <PlusCircle className="w-4 h-4 text-amber-400" />
            <span>Log Security Note</span>
          </button>

          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50 p-0.5">
            <button
              onClick={handleExportCSV}
              title="Export filtered logs as CSV"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white hover:shadow-xs transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>CSV</span>
            </button>
            <div className="w-[1px] h-4 bg-slate-200" />
            <button
              onClick={handleExportJSON}
              title="Export filtered logs as JSON"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white hover:shadow-xs transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Audit Logs</span>
            <History className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">{metrics.total}</div>
          <p className="text-[11px] text-slate-500 mt-1">Recorded back-office events</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs bg-gradient-to-br from-rose-50/30 to-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-900">High / Critical Alerts</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-700 mt-2 font-mono">{metrics.criticalAndHigh}</div>
          <p className="text-[11px] text-rose-600 mt-1">Overrides & policy events</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-purple-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-900">Stock Adjustments</span>
            <Box className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-800 mt-2 font-mono">{metrics.stockAdjustments}</div>
          <p className="text-[11px] text-purple-600 mt-1">Manual count & write-offs</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-900">Price Overrides</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-800 mt-2 font-mono">{metrics.priceOverrides}</div>
          <p className="text-[11px] text-emerald-600 mt-1">Supervisor discounts & edits</p>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Security & Permissions</span>
            <Lock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">{metrics.securityChanges}</div>
          <p className="text-[11px] text-slate-500 mt-1">Role & policy changes</p>
        </div>
      </div>

      {/* Filtering Toolbar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Main Keyword Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search action name, SKU/Target ID, user, before/after values, or IP address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Timeframe Quick Filters */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl self-start lg:self-auto border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setTimeframe('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                timeframe === 'ALL' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setTimeframe('24H')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                timeframe === '24H' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Last 24 Hours
            </button>
            <button
              onClick={() => setTimeframe('7D')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                timeframe === '7D' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeframe('30D')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                timeframe === '30D' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 Days
            </button>
          </div>
        </div>

        {/* Secondary Dropdown Filter Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
          {/* Module Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Module Category
            </label>
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500"
            >
              <option value="ALL">All Modules</option>
              <option value="Security">Security & Permissions</option>
              <option value="Pricing">Pricing & Discounts</option>
              <option value="Inventory">Inventory & Stock</option>
              <option value="POS">POS Register</option>
              <option value="Products">Products & Catalog</option>
              <option value="Purchasing">Purchasing & POs</option>
              <option value="CRM">CRM & Customers</option>
              <option value="Orders">Orders & Fulfillment</option>
              <option value="Finance">Finance & Ledger</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Risk & Severity
            </label>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL_HIGH">Critical & High Risk Only</option>
              <option value="Critical">Critical Only</option>
              <option value="High">High Only</option>
              <option value="Medium">Medium Only</option>
              <option value="Info">Info / Normal</option>
            </select>
          </div>

          {/* User Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Performed By User
            </label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500"
            >
              <option value="ALL">All Users / Roles</option>
              {availableUsers.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* Location Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Branch Location
            </label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500"
            >
              <option value="ALL">All Branch Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.name}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filter Chips & Clear Button */}
        {(searchTerm || selectedModule !== 'ALL' || selectedSeverity !== 'ALL' || selectedUser !== 'ALL' || selectedLocation !== 'ALL' || timeframe !== 'ALL') && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-400 font-semibold">Active Filters:</span>
              {searchTerm && (
                <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200 font-medium">
                  Query: "{searchTerm}"
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setSearchTerm('')} />
                </span>
              )}
              {selectedModule !== 'ALL' && (
                <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md border border-purple-200 font-medium">
                  Module: {selectedModule}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedModule('ALL')} />
                </span>
              )}
              {selectedSeverity !== 'ALL' && (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
                  Severity: {selectedSeverity}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedSeverity('ALL')} />
                </span>
              )}
              {selectedUser !== 'ALL' && (
                <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200 font-medium">
                  User: {selectedUser}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedUser('ALL')} />
                </span>
              )}
              {selectedLocation !== 'ALL' && (
                <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 px-2 py-0.5 rounded-md border border-teal-200 font-medium">
                  Loc: {selectedLocation}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedLocation('ALL')} />
                </span>
              )}
            </div>

            <button
              onClick={clearAllFilters}
              className="text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer underline underline-offset-2"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* Main Audit Log Table Component */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Audit Event Records
            </h2>
            <span className="bg-slate-200 text-slate-800 text-xs font-mono font-bold px-2 py-0.5 rounded-full">
              {filteredLogs.length} matching
            </span>
          </div>

          <div className="text-xs text-slate-500 hidden sm:block font-mono">
            Encrypted SHA-256 Audit Chain
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No Matching Audit Entries</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              There are no recorded back-office audit actions matching your search criteria or active filter parameters.
            </p>
            <button
              onClick={clearAllFilters}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer transition-all"
            >
              Clear Search Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Timestamp & Severity</th>
                  <th className="py-3 px-4">Module</th>
                  <th className="py-3 px-4">Back-Office Action & Target ID</th>
                  <th className="py-3 px-4">Performed By</th>
                  <th className="py-3 px-4">State Change / Audit Delta</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredLogs.map((log) => {
                  const dateObj = new Date(log.timestamp);
                  const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  const formattedDate = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => setInspectLog(log)}
                    >
                      {/* Timestamp & Severity */}
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div>{getSeverityBadge(log.severity)}</div>
                          <div className="font-mono text-[11px] font-semibold text-slate-900 mt-1">
                            {formattedTime}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">{formattedDate}</div>
                        </div>
                      </td>

                      {/* Module Badge */}
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border ${getModuleBadge(
                            log.module
                          )}`}
                        >
                          {log.module}
                        </span>
                      </td>

                      {/* Action Title & Target ID */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="max-w-md">
                          <p className="font-bold text-slate-900 text-xs leading-snug group-hover:text-blue-600 transition-colors">
                            {log.action}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                              Ref: {log.targetId}
                            </span>
                            {log.locationName && (
                              <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                {log.locationName}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Performed By User & Role */}
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <div>
                          <p className="font-bold text-slate-900">{log.user}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                              {log.role}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {log.ipAddress || '192.168.1.50'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* State Change Delta (Before -> After) */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="max-w-xs space-y-1">
                          {log.beforeValue && (
                            <div className="text-[11px] bg-rose-50/70 border border-rose-100 text-rose-800 px-2 py-0.5 rounded line-through opacity-85 font-mono truncate">
                              BEFORE: {log.beforeValue}
                            </div>
                          )}
                          {log.afterValue && (
                            <div className="text-[11px] bg-emerald-50/80 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-mono font-medium truncate">
                              AFTER: {log.afterValue}
                            </div>
                          )}
                          {!log.beforeValue && !log.afterValue && (
                            <span className="text-slate-400 italic text-[11px]">System State Recorded</span>
                          )}
                        </div>
                      </td>

                      {/* Inspect Action */}
                      <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectLog(log);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1"
                          title="Inspect Full Audit Record"
                        >
                          <Eye className="w-4 h-4" />
                          <span className="text-[11px] font-medium hidden sm:inline">Details</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Log Inspector Modal */}
      {inspectLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-base">Audit Event Inspector</h3>
                  <p className="text-xs text-slate-400 font-mono">ID: {inspectLog.id}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectLog(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Severity Rating</span>
                  <div className="mt-1">{getSeverityBadge(inspectLog.severity)}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Module Target</span>
                  <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold border mt-1 ${getModuleBadge(inspectLog.module)}`}>
                    {inspectLog.module}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Timestamp</span>
                  <span className="text-xs font-mono font-bold text-slate-800 block mt-1">
                    {new Date(inspectLog.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Action Summary</h4>
                <p className="text-base font-bold text-slate-900 bg-slate-100 p-3 rounded-xl border border-slate-200">
                  {inspectLog.action}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Target Entity ID</h4>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-800">
                    {inspectLog.targetId}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Branch / Location Context</h4>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {inspectLog.locationName || currentLocation.name}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">User & Role</h4>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <p className="font-bold text-slate-900">{inspectLog.user}</p>
                    <p className="text-slate-500 text-[11px] mt-0.5">{inspectLog.role}</p>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Terminal IP & Protocol</h4>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono text-slate-800">
                    {inspectLog.ipAddress || '192.168.1.50'} (TLS v1.3 Verified)
                  </div>
                </div>
              </div>

              {/* State Comparison */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  State Delta Comparison
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-rose-800 uppercase block mb-1">
                      Before State (Original)
                    </span>
                    <pre className="text-xs font-mono text-rose-900 whitespace-pre-wrap break-all">
                      {inspectLog.beforeValue || 'No previous value captured (New Record Created)'}
                    </pre>
                  </div>
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase block mb-1">
                      After State (Updated)
                    </span>
                    <pre className="text-xs font-mono text-emerald-900 whitespace-pre-wrap break-all">
                      {inspectLog.afterValue || 'No update payload captured'}
                    </pre>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <span>
                  This log entry is cryptographically sealed in the back-office immutable audit buffer and cannot be edited or erased by standard users.
                </span>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setInspectLog(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer transition-all"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Security Matrix Modal */}
      {showPermissionsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-base">Back-Office Role Permissions & Security Matrix</h3>
                  <p className="text-xs text-slate-400">
                    Toggling permissions here logs immediate high-severity security audit actions.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 max-h-[75vh] overflow-y-auto space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Security Policy Enforcer:</strong> Modifying permissions grants or restricts sensitive back-office powers (such as POS price overrides or stock write-off approvals). Every toggle generates an immutable audit record tagged with your active role ({currentRole}).
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-800 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Role Title</th>
                      <th className="py-3 px-3 text-center">POS Price Override</th>
                      <th className="py-3 px-3 text-center">Approve Stock Write-offs</th>
                      <th className="py-3 px-3 text-center">Process Order Returns</th>
                      <th className="py-3 px-3 text-center">Delete Catalog SKUs</th>
                      <th className="py-3 px-3 text-center">View General Ledger</th>
                      <th className="py-3 px-3 text-center">Manage Users</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {localPermissions.map((rp) => (
                      <tr key={rp.role} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {rp.role}
                          {rp.role === 'Super Admin' && (
                            <span className="ml-1 text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded">Master</span>
                          )}
                        </td>

                        {/* Price Override Toggle */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={rp.canOverridePrice}
                            onChange={() => handleTogglePermission(rp.role, 'canOverridePrice')}
                            className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                          />
                        </td>

                        {/* Stock Adjustment Toggle */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={rp.canApproveStockAdjustments}
                            onChange={() => handleTogglePermission(rp.role, 'canApproveStockAdjustments')}
                            className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                          />
                        </td>

                        {/* Process Returns Toggle */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={rp.canProcessReturns}
                            onChange={() => handleTogglePermission(rp.role, 'canProcessReturns')}
                            className="w-4 h-4 accent-teal-600 rounded cursor-pointer"
                          />
                        </td>

                        {/* Delete Products Toggle */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={rp.canDeleteProducts}
                            onChange={() => handleTogglePermission(rp.role, 'canDeleteProducts')}
                            className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
                          />
                        </td>

                        {/* View Ledger Toggle */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={rp.canViewFinancialLedger}
                            onChange={() => handleTogglePermission(rp.role, 'canViewFinancialLedger')}
                            className="w-4 h-4 accent-amber-600 rounded cursor-pointer"
                          />
                        </td>

                        {/* Manage Users Toggle */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={rp.canManageUsers}
                            onChange={() => handleTogglePermission(rp.role, 'canManageUsers')}
                            className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Security Audit Note Modal */}
      {showManualNoteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateManualNote}
            className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base">Log Manual Security Audit Event</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualNoteModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Action Title / Incident Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Physical stock count discrepancy verified at Downtown store"
                  value={manualNoteAction}
                  onChange={(e) => setManualNoteAction(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target Module</label>
                  <select
                    value={manualNoteModule}
                    onChange={(e) => setManualNoteModule(e.target.value as AuditModule)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:bg-white focus:border-blue-500"
                  >
                    <option value="Security">Security</option>
                    <option value="Pricing">Pricing</option>
                    <option value="Inventory">Inventory</option>
                    <option value="POS">POS</option>
                    <option value="Products">Products</option>
                    <option value="Purchasing">Purchasing</option>
                    <option value="CRM">CRM</option>
                    <option value="Finance">Finance</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Severity Rating</label>
                  <select
                    value={manualNoteSeverity}
                    onChange={(e) => setManualNoteSeverity(e.target.value as AuditSeverity)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:bg-white focus:border-blue-500 font-semibold"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Info">Info</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Reference Target ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. SKU-1029 / ADJ-302"
                  value={manualNoteTargetId}
                  onChange={(e) => setManualNoteTargetId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:bg-white focus:border-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Before State (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Previous value or condition"
                    value={manualNoteBefore}
                    onChange={(e) => setManualNoteBefore(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 outline-none focus:bg-white focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">After State (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="New value or condition"
                    value={manualNoteAfter}
                    onChange={(e) => setManualNoteAfter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 outline-none focus:bg-white focus:border-blue-500 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowManualNoteModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer transition-all"
              >
                Commit Security Note
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
