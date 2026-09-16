import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  History,
  Search,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  UserCheck,
  UserX,
  FileText,
  Eye,
  X,
  Clock,
  ArrowRight,
  Filter,
  Users,
  KeyRound,
  Ban,
  Activity,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge, BadgeVariant } from '../ui/Badge';
import { auditApiClient, AuditLogItem, SecurityOverviewMetrics } from '../../services/auditApi';

const MODULE_OPTIONS = [
  { value: 'ALL', label: 'All Modules' },
  { value: 'USER', label: 'Users & Staff' },
  { value: 'SECURITY', label: 'Security & Access' },
  { value: 'POS', label: 'Point of Sale' },
  { value: 'INVENTORY', label: 'Inventory' },
  { value: 'ORDER', label: 'Orders' },
  { value: 'STOREFRONT', label: 'Storefront' },
  { value: 'CATALOG', label: 'Catalog' },
  { value: 'SYSTEM', label: 'System' },
];

const SEVERITY_OPTIONS = [
  { value: 'ALL', label: 'All Severities' },
  { value: 'Critical', label: 'Critical' },
  { value: 'High', label: 'High' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low', label: 'Low' },
  { value: 'Info', label: 'Info' },
];

const RESULT_OPTIONS = [
  { value: 'ALL', label: 'All Results' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'DENIED', label: 'Denied' },
];

const TIMEFRAME_OPTIONS = [
  { value: 'ALL', label: 'All Time' },
  { value: 'TODAY', label: 'Today' },
  { value: 'WEEK', label: 'Last 7 Days' },
  { value: 'MONTH', label: 'Last 30 Days' },
];

export const AuditLogsView: React.FC = () => {
  // Data States
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [metrics, setMetrics] = useState<SecurityOverviewMetrics | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(20);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedResult, setSelectedResult] = useState<string>('ALL');
  const [timeframe, setTimeframe] = useState<string>('ALL');

  // Drawer / Inspection State
  const [inspectLog, setInspectLog] = useState<AuditLogItem | null>(null);

  // Compute ISO date range for timeframe filter
  const dateRange = useMemo(() => {
    if (timeframe === 'TODAY') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return { startDate: start.toISOString() };
    }
    if (timeframe === 'WEEK') {
      const start = new Date(Date.now() - 7 * 86400000);
      return { startDate: start.toISOString() };
    }
    if (timeframe === 'MONTH') {
      const start = new Date(Date.now() - 30 * 86400000);
      return { startDate: start.toISOString() };
    }
    return {};
  }, [timeframe]);

  // Load authoritative audit events & metrics
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewData, queryResult] = await Promise.all([
        auditApiClient.fetchOverview().catch((err) => {
          console.warn('[AuditLogsView] Overview fetch failed:', err);
          return null;
        }),
        auditApiClient.fetchAuditLogs({
          page: currentPage,
          pageSize,
          startDate: dateRange.startDate,
          entityType: selectedModule !== 'ALL' ? selectedModule : undefined,
          severity: selectedSeverity !== 'ALL' ? selectedSeverity : undefined,
          result: selectedResult !== 'ALL' ? selectedResult : undefined,
          search: searchTerm.trim() ? searchTerm.trim() : undefined,
        }),
      ]);

      if (overviewData) {
        setMetrics(overviewData);
      }
      setLogs(queryResult.data || []);
      setTotalCount(queryResult.pagination?.totalCount || 0);
    } catch (err: any) {
      setError(err?.message || 'Unable to load authoritative audit logs.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, dateRange.startDate, selectedModule, selectedSeverity, selectedResult, searchTerm]);

  // Debounced load on filter changes
  useEffect(() => {
    const handler = setTimeout(() => {
      void loadData();
    }, 250);
    return () => clearTimeout(handler);
  }, [loadData]);

  // Keyboard accessibility for slide-over drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && inspectLog) {
        setInspectLog(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectLog]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  // Visual helper for severity badge
  const getSeverityBadgeVariant = (severity?: string): BadgeVariant => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      case 'low':
      case 'info':
      default:
        return 'neutral';
    }
  };

  // Visual helper for result badge
  const getResultBadgeVariant = (result?: string): BadgeVariant => {
    switch (result?.toUpperCase()) {
      case 'SUCCESS':
        return 'success';
      case 'FAILED':
        return 'warning';
      case 'DENIED':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  // Visual helper for action icons & badges
  const isSecuritySensitiveAction = (action: string) => {
    const act = action.toUpperCase();
    return (
      act.includes('SUSPEND') ||
      act.includes('REACTIVATE') ||
      act.includes('ROLE') ||
      act.includes('DENIED') ||
      act.includes('DELETE') ||
      act.includes('PASSWORD') ||
      act.includes('TRANSFER') ||
      act.includes('SECURITY')
    );
  };

  // Safe Export functionality
  const handleExport = () => {
    if (logs.length === 0) return;
    const sanitizedRows = logs.map((log) => ({
      id: log.id,
      timestamp: log.timestamp,
      actor: log.actor_name,
      role: log.actor_role,
      action: log.action,
      module: log.entity_type,
      targetId: log.entity_id,
      result: log.result || 'SUCCESS',
      severity: log.severity || 'Info',
      ipAddress: log.ip_address || '',
    }));
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sanitizedRows, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Security & Audit Administration
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Immutable, server-authoritative audit ledger and tenant security observability.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={logs.length === 0}
            leftIcon={<Download className="h-4 w-4" />}
          >
            Export Logs
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            isLoading={isLoading}
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        </div>
      </header>

      {/* Authoritative Security Overview Cards */}
      <section aria-labelledby="security-overview-heading">
        <h2 id="security-overview-heading" className="sr-only">
          Security Overview Metrics
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <Activity className="h-4 w-4 text-blue-500" />
              Today
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {metrics ? metrics.eventsToday.toLocaleString() : '—'}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Authoritative events</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <Clock className="h-4 w-4 text-indigo-500" />
              7 Days
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {metrics ? metrics.eventsThisWeek.toLocaleString() : '—'}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Weekly activity</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <Ban className="h-4 w-4 text-rose-500" />
              Suspensions
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {metrics ? metrics.staffSuspensions.toLocaleString() : '—'}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Staff suspended</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <KeyRound className="h-4 w-4 text-amber-500" />
              Roles & Perms
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {metrics ? metrics.rolePermissionChanges.toLocaleString() : '—'}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Privilege updates</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              Denials/Fails
            </div>
            <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
              {metrics ? metrics.failedDeniedOperations.toLocaleString() : '—'}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Denied or failed</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <AlertTriangle className="h-4 w-4 text-purple-500" />
              High/Critical
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {metrics ? metrics.criticalAndHigh.toLocaleString() : '—'}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">High severity alerts</p>
          </div>
        </div>
      </section>

      {/* Filter Toolbar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Safe Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              aria-label="Search audit records"
              placeholder="Search actor, action, target..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Timeframe */}
          <div>
            <select
              aria-label="Filter by timeframe"
              value={timeframe}
              onChange={(e) => {
                setTimeframe(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {TIMEFRAME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Module */}
          <div>
            <select
              aria-label="Filter by module"
              value={selectedModule}
              onChange={(e) => {
                setSelectedModule(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {MODULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div>
            <select
              aria-label="Filter by severity"
              value={selectedSeverity}
              onChange={(e) => {
                setSelectedSeverity(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {SEVERITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Result */}
          <div>
            <select
              aria-label="Filter by result"
              value={selectedResult}
              onChange={(e) => {
                setSelectedResult(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {RESULT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filters Summary */}
        {(selectedModule !== 'ALL' || selectedSeverity !== 'ALL' || selectedResult !== 'ALL' || timeframe !== 'ALL' || searchTerm) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Active Filters:</span>
            {searchTerm && <Badge variant="info">Search: {searchTerm}</Badge>}
            {timeframe !== 'ALL' && <Badge variant="neutral">Timeframe: {timeframe}</Badge>}
            {selectedModule !== 'ALL' && <Badge variant="neutral">Module: {selectedModule}</Badge>}
            {selectedSeverity !== 'ALL' && <Badge variant="warning">Severity: {selectedSeverity}</Badge>}
            {selectedResult !== 'ALL' && <Badge variant="danger">Result: {selectedResult}</Badge>}
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedModule('ALL');
                setSelectedSeverity('ALL');
                setSelectedResult('ALL');
                setTimeframe('ALL');
                setCurrentPage(1);
              }}
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium ml-2 underline underline-offset-2"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadData()}>
            Retry
          </Button>
        </div>
      )}

      {/* Main Audit Event Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <caption className="sr-only">Authoritative Tenant Audit Events</caption>
            <thead className="border-b border-slate-200/80 bg-slate-50/75 dark:border-slate-800 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3.5">Timestamp</th>
                <th scope="col" className="px-4 py-3.5">Actor</th>
                <th scope="col" className="px-4 py-3.5">Action</th>
                <th scope="col" className="px-4 py-3.5">Module</th>
                <th scope="col" className="px-4 py-3.5">Target</th>
                <th scope="col" className="px-4 py-3.5">Result</th>
                <th scope="col" className="px-4 py-3.5">Severity</th>
                <th scope="col" className="px-4 py-3.5 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-28"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-16"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-16"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-16"></div></td>
                    <td className="px-4 py-4 text-right"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-12 ml-auto"></div></td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
                      <FileText className="h-6 w-6" />
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
                      No audit events found
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Try adjusting your filters or search query to find records.
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isSecurityAction = isSecuritySensitiveAction(log.action);
                  const logDate = new Date(log.timestamp);
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setInspectLog(log)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      {/* Timestamp */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs font-mono text-slate-600 dark:text-slate-400">
                        <div>{logDate.toLocaleDateString()}</div>
                        <div className="text-[11px] text-slate-400">{logDate.toLocaleTimeString()}</div>
                      </td>

                      {/* Actor */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                          {log.actor_name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {log.actor_role}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isSecurityAction ? (
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                              <Lock className="h-3 w-3" />
                            </span>
                          ) : (
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                              <Activity className="h-3 w-3" />
                            </span>
                          )}
                          <span className={`font-mono text-xs font-semibold ${isSecurityAction ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {log.action}
                          </span>
                        </div>
                      </td>

                      {/* Module */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                        <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-medium text-slate-600 dark:text-slate-300">
                          {log.entity_type}
                        </span>
                      </td>

                      {/* Target */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs font-mono text-slate-600 dark:text-slate-400">
                        {log.entity_id ? (
                          <span title={log.entity_id}>
                            {log.entity_id.length > 18 ? `${log.entity_id.slice(0, 15)}…` : log.entity_id}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Result */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <Badge variant={getResultBadgeVariant(log.result)}>
                          {log.result || 'SUCCESS'}
                        </Badge>
                      </td>

                      {/* Severity */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <Badge variant={getSeverityBadgeVariant(log.severity)}>
                          {log.severity || 'Info'}
                        </Badge>
                      </td>

                      {/* Details / Inspect */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectLog(log);
                          }}
                          aria-label={`Inspect event ${log.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200/80 dark:border-slate-800 px-4 py-3.5 bg-slate-50/50 dark:bg-slate-800/30 text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-900 dark:text-slate-100">{logs.length}</span> of{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">{totalCount}</span> total records
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || isLoading}
              leftIcon={<ChevronLeft className="h-4 w-4" />}
            >
              Previous
            </Button>
            <span className="px-2 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || isLoading}
              rightIcon={<ChevronRight className="h-4 w-4" />}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Slide-Over Event Details Drawer */}
      {inspectLog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-drawer-title"
          className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-sm transition-opacity flex justify-end"
          onClick={() => setInspectLog(null)}
        >
          <div
            className="w-full max-w-xl bg-white dark:bg-slate-900 h-full shadow-2xl overflow-y-auto flex flex-col border-l border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur z-10">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <h3 id="event-drawer-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Audit Event Details
                  </h3>
                  <p className="text-xs font-mono text-slate-500">{inspectLog.id}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectLog(null)}
                aria-label="Close event details"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Authoritative Badge Banner */}
            <div className="px-6 py-3 bg-blue-50/60 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900/30 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-medium">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Authoritative Server-Generated Audit Record
              </span>
              <Badge variant={getResultBadgeVariant(inspectLog.result)}>
                {inspectLog.result || 'SUCCESS'}
              </Badge>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-6 flex-1 text-sm">
              {/* Event Metadata Grid */}
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200/60 dark:border-slate-700/60">
                <div>
                  <span className="text-xs text-slate-500 block">Action</span>
                  <span className="font-semibold text-slate-900 dark:text-white font-mono text-xs">
                    {inspectLog.action}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Module</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {inspectLog.entity_type}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Severity</span>
                  <Badge variant={getSeverityBadgeVariant(inspectLog.severity)}>
                    {inspectLog.severity || 'Info'}
                  </Badge>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Timestamp</span>
                  <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                    {new Date(inspectLog.timestamp).toISOString()}
                  </span>
                </div>
              </div>

              {/* Actor Identity */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Actor Identity (Cryptographically Bound)
                </h4>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Name / Identifier</span>
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {inspectLog.actor_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">User ID</span>
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                      {inspectLog.actor_id || 'System / Platform'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Authoritative Role</span>
                    <span className="text-xs font-medium text-slate-900 dark:text-slate-100">
                      {inspectLog.actor_role}
                    </span>
                  </div>
                  {inspectLog.ip_address && (
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-500">IP Address</span>
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                        {inspectLog.ip_address}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Target Entity */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Target Entity
                </h4>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Type</span>
                    <span className="text-xs font-medium text-slate-900 dark:text-slate-100">
                      {inspectLog.entity_type}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Entity ID</span>
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                      {inspectLog.entity_id}
                    </span>
                  </div>
                </div>
              </div>

              {/* State Transitions: Before & After */}
              {(inspectLog.before_state || inspectLog.after_state) && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    State Transitions (Sanitized)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-800/40">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                        Previous State
                      </span>
                      <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto max-h-48">
                        {inspectLog.before_state
                          ? JSON.stringify(inspectLog.before_state, null, 2)
                          : 'null'}
                      </pre>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-800/40">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                        New State
                      </span>
                      <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto max-h-48">
                        {inspectLog.after_state
                          ? JSON.stringify(inspectLog.after_state, null, 2)
                          : 'null'}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Metadata */}
              {inspectLog.metadata && Object.keys(inspectLog.metadata).length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Sanitized Context & Metadata
                  </h4>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-800/40">
                    <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto max-h-48">
                      {JSON.stringify(inspectLog.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setInspectLog(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
