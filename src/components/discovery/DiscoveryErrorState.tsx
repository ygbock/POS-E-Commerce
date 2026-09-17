import React from 'react';
import { AlertCircle, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';

interface DiscoveryErrorStateProps {
  message?: string;
  code?: string;
  status?: number;
  onRetry?: () => void;
  className?: string;
}

export const DiscoveryErrorState: React.FC<DiscoveryErrorStateProps> = ({
  message = 'An unexpected error occurred while loading discovery data.',
  code,
  status,
  onRetry,
  className = '',
}) => {
  const isNetworkError = code === 'NETWORK_ERROR' || status === 0;
  const isUnauthorized = status === 401 || status === 403;

  return (
    <div
      role="alert"
      className={`rounded-3xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 p-6 sm:p-10 text-center ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center mb-3.5">
        {isNetworkError ? (
          <WifiOff className="w-6 h-6" aria-hidden="true" />
        ) : isUnauthorized ? (
          <ShieldAlert className="w-6 h-6" aria-hidden="true" />
        ) : (
          <AlertCircle className="w-6 h-6" aria-hidden="true" />
        )}
      </div>

      <h3 className="text-base sm:text-lg font-black text-rose-950 dark:text-rose-100">
        {isNetworkError ? 'Network Connection Lost' : isUnauthorized ? 'Access Restricted' : 'Discovery Unavailable'}
      </h3>

      <p className="mt-1.5 text-xs sm:text-sm text-rose-700 dark:text-rose-300 max-w-md mx-auto leading-relaxed">
        {message}
      </p>

      {code && (
        <p className="mt-2 text-[11px] font-mono text-rose-500 dark:text-rose-400">
          Ref: {code} {status ? `(${status})` : ''}
        </p>
      )}

      {onRetry && (
        <div className="mt-5">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Try again</span>
          </button>
        </div>
      )}
    </div>
  );
};
