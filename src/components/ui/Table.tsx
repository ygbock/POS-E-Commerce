import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  emptyStateMessage?: string;
  isLoading?: boolean;
  
  // Optional Pagination
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export function Table<T>({
  data,
  columns,
  emptyStateMessage = 'No matching records found.',
  isLoading = false,
  currentPage,
  totalPages,
  onPageChange,
}: TableProps<T>) {
  const showPagination =
    currentPage !== undefined &&
    totalPages !== undefined &&
    onPageChange !== undefined &&
    totalPages > 1;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Responsive Horizontal Scroll Wrap */}
      <div className="w-full overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`px-6 py-4 font-semibold text-xs tracking-wider uppercase text-slate-500 dark:text-slate-400 select-none ${
                    col.className || ''
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="inline-block animate-spin rounded-full border-2 border-solid border-blue-600 border-r-transparent w-6 h-6" />
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Loading data...
                    </p>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-16 text-center">
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                    {emptyStateMessage}
                  </p>
                </td>
              </tr>
            ) : (
              data.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
                >
                  {columns.map((col, colIdx) => {
                    const content =
                      typeof col.accessor === 'function'
                        ? col.accessor(row)
                        : (row[col.accessor] as React.ReactNode);

                    return (
                      <td
                        key={colIdx}
                        className={`px-6 py-4 text-slate-700 dark:text-slate-300 ${
                          col.className || ''
                        }`}
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

      {/* Pagination Controls */}
      {showPagination && currentPage !== undefined && totalPages !== undefined && (
        <div className="flex items-center justify-between px-2 py-1 select-none">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Showing Page <span className="text-slate-800 dark:text-slate-200">{currentPage}</span> of{' '}
            <span className="text-slate-800 dark:text-slate-200">{totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => onPageChange(currentPage - 1)}
              aria-label="Go to previous page"
              leftIcon={<ChevronLeft className="w-4 h-4" />}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              aria-label="Go to next page"
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
