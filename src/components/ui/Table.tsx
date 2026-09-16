import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
  headerClassName?: string;
  ariaLabel?: string;
}

export interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  caption?: string;
  emptyStateMessage?: string;
  loadingMessage?: string;
  isLoading?: boolean;
  getRowKey?: (row: T, index: number) => React.Key;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export function Table<T>({
  data,
  columns,
  caption,
  emptyStateMessage = 'No matching records found.',
  loadingMessage = 'Loading data…',
  isLoading = false,
  getRowKey,
  currentPage,
  totalPages,
  onPageChange,
}: TableProps<T>) {
  const showPagination =
    currentPage !== undefined &&
    totalPages !== undefined &&
    onPageChange !== undefined &&
    totalPages > 1;

  const canGoPrevious = currentPage !== undefined && currentPage > 1;
  const canGoNext =
    currentPage !== undefined &&
    totalPages !== undefined &&
    currentPage < totalPages;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full border-collapse text-left text-sm">
          {caption && (
            <caption className="sr-only">{caption}</caption>
          )}
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  scope="col"
                  aria-label={col.ariaLabel}
                  className={`px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 select-none dark:text-slate-400 ${col.headerClassName || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center" aria-live="polite">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div
                      className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-r-transparent"
                      role="status"
                      aria-label={loadingMessage}
                    />
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {loadingMessage}
                    </p>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-16 text-center" aria-live="polite">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {emptyStateMessage}
                  </p>
                </td>
              </tr>
            ) : (
              data.map((row, rowIdx) => (
                <tr
                  key={getRowKey ? getRowKey(row, rowIdx) : rowIdx}
                  className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
                >
                  {columns.map((col, colIdx) => {
                    const content =
                      typeof col.accessor === 'function'
                        ? col.accessor(row)
                        : (row[col.accessor] as React.ReactNode);

                    return (
                      <td
                        key={colIdx}
                        className={`px-6 py-4 text-slate-700 dark:text-slate-300 ${col.className || ''}`}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && currentPage !== undefined && totalPages !== undefined && (
        <nav
          className="flex flex-col gap-3 px-2 py-1 sm:flex-row sm:items-center sm:justify-between"
          aria-label="Table pagination"
        >
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Page <span className="text-slate-800 dark:text-slate-200">{currentPage}</span> of{' '}
            <span className="text-slate-800 dark:text-slate-200">{totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canGoPrevious}
              onClick={() => onPageChange(currentPage - 1)}
              aria-label="Go to previous page"
              leftIcon={<ChevronLeft className="h-4 w-4" />}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canGoNext}
              onClick={() => onPageChange(currentPage + 1)}
              aria-label="Go to next page"
              rightIcon={<ChevronRight className="h-4 w-4" />}
            >
              Next
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
