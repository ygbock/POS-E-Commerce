import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rect' | 'circle';
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', variant = 'rect' }) => {
  const variantClasses = {
    text: 'h-4 w-full rounded-sm',
    rect: 'rounded-md',
    circle: 'rounded-full',
  };

  return (
    <div
      role="status"
      aria-label="Loading content placeholder"
      className={`animate-pulse bg-slate-200 dark:bg-slate-800 ${variantClasses[variant]} ${className}`}
    >
      <span className="sr-only">Loading placeholder...</span>
    </div>
  );
};
