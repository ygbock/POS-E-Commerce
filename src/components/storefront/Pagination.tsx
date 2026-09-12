import React from 'react';
import type { StorefrontPagination } from '../../services/storefrontApi';

interface Props { pagination: StorefrontPagination; onPageChange: (page: number) => void; disabled?: boolean; }

export const StorefrontPagination: React.FC<Props> = ({ pagination, onPageChange, disabled = false }) => {
  if (pagination.totalPages <= 1) return null;
  const current = pagination.page;
  const total = pagination.totalPages;
  return (
    <nav aria-label="Product pagination" className="flex items-center justify-center gap-3 py-6">
      <button type="button" disabled={disabled || current <= 1} onClick={() => onPageChange(current - 1)} aria-label="Previous page">
        Previous
      </button>
      <span aria-live="polite">Page {current} of {total}</span>
      <button type="button" disabled={disabled || !pagination.hasMore} onClick={() => onPageChange(current + 1)} aria-label="Next page">
        Next
      </button>
    </nav>
  );
};
