import React from 'react';
import { Star, StarHalf } from 'lucide-react';

interface DiscoveryRatingProps {
  rating?: number | string | null;
  reviewCount?: number | null;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
  className?: string;
}

export const DiscoveryRating: React.FC<DiscoveryRatingProps> = ({
  rating,
  reviewCount,
  size = 'sm',
  showCount = true,
  className = '',
}) => {
  const numericRating = Math.max(0, Math.min(5, Number(rating || 0)));
  const count = Number(reviewCount || 0);

  const starSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  if (count === 0 && numericRating === 0) {
    return (
      <div className={`inline-flex items-center gap-1 text-slate-400 dark:text-slate-500 ${textSizes[size]} ${className}`}>
        <Star className={`${starSizes[size]} fill-transparent text-slate-300 dark:text-slate-600`} aria-hidden="true" />
        <span>New</span>
      </div>
    );
  }

  // Generate 5 stars
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    if (numericRating >= i) {
      stars.push(
        <Star
          key={i}
          className={`${starSizes[size]} fill-amber-400 text-amber-400 shrink-0`}
          aria-hidden="true"
        />
      );
    } else if (numericRating >= i - 0.5) {
      stars.push(
        <StarHalf
          key={i}
          className={`${starSizes[size]} fill-amber-400 text-amber-400 shrink-0`}
          aria-hidden="true"
        />
      );
    } else {
      stars.push(
        <Star
          key={i}
          className={`${starSizes[size]} fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700 shrink-0`}
          aria-hidden="true"
        />
      );
    }
  }

  const ariaLabel = `Rated ${numericRating.toFixed(1)} out of 5 stars across ${count} ${count === 1 ? 'review' : 'reviews'}`;

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${className}`}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <div className="flex items-center gap-0.5" aria-hidden="true">
        {stars}
      </div>
      <span className={`font-semibold text-slate-800 dark:text-slate-200 ${textSizes[size]}`}>
        {numericRating.toFixed(1)}
      </span>
      {showCount && (
        <span className={`text-slate-500 dark:text-slate-400 ${textSizes[size]}`}>
          ({count})
        </span>
      )}
    </div>
  );
};
