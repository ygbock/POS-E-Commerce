import React from 'react';

interface DiscoveryResultCountProps {
  count: number;
  type?: string;
  query?: string;
  location?: string;
  className?: string;
}

export const DiscoveryResultCount: React.FC<DiscoveryResultCountProps> = ({
  count,
  type = 'results',
  query,
  location,
  className = '',
}) => {
  const typeLabel =
    type === 'businesses'
      ? count === 1 ? 'business' : 'businesses'
      : type === 'products'
      ? count === 1 ? 'product' : 'products'
      : type === 'services'
      ? count === 1 ? 'service' : 'services'
      : count === 1 ? 'match' : 'matches';

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={`text-xs font-semibold text-slate-500 dark:text-slate-400 ${className}`}
    >
      <span>
        Found <strong className="text-slate-900 dark:text-white font-bold">{count}</strong> {typeLabel}
      </span>
      {query && (
        <span>
          {' '}for &ldquo;<strong className="text-slate-900 dark:text-white">{query}</strong>&rdquo;
        </span>
      )}
      {location && (
        <span>
          {' '}in <strong className="text-slate-900 dark:text-white">{location}</strong>
        </span>
      )}
    </div>
  );
};
