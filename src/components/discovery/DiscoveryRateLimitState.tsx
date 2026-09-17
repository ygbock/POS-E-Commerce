import React, { useState, useEffect } from 'react';
import { Hourglass, RefreshCw } from 'lucide-react';

interface DiscoveryRateLimitStateProps {
  cooldownSeconds?: number;
  onRetry?: () => void;
  className?: string;
}

export const DiscoveryRateLimitState: React.FC<DiscoveryRateLimitStateProps> = ({
  cooldownSeconds = 15,
  onRetry,
  className = '',
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(cooldownSeconds);

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsRemaining]);

  const canRetry = secondsRemaining === 0;

  return (
    <div
      role="alert"
      className={`rounded-3xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-6 sm:p-10 text-center ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center mb-3.5">
        <Hourglass className="w-6 h-6 animate-pulse" aria-hidden="true" />
      </div>

      <h3 className="text-base sm:text-lg font-black text-amber-950 dark:text-amber-100">
        Rate Limit Reached
      </h3>

      <p className="mt-1.5 text-xs sm:text-sm text-amber-700 dark:text-amber-300 max-w-md mx-auto leading-relaxed">
        You have made several rapid search requests. To protect platform performance for all users, please pause briefly before continuing.
      </p>

      <div className="mt-4">
        {secondsRemaining > 0 ? (
          <span className="inline-block px-3 py-1 rounded-full bg-amber-200/60 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-mono text-xs font-bold">
            Retry available in {secondsRemaining}s
          </span>
        ) : (
          <span className="inline-block px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
            Ready to retry
          </span>
        )}
      </div>

      {onRetry && (
        <div className="mt-5">
          <button
            type="button"
            disabled={!canRetry}
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold transition-all shadow-sm active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Try search again</span>
          </button>
        </div>
      )}
    </div>
  );
};
