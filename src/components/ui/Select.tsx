import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, placeholder, className = '', id, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;
    const hasError = Boolean(error);
    const describedBy = hasError ? errorId : helperText ? helperId : undefined;

    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {label}
          </label>
        )}

        <div className="relative w-full">
          <select
            {...props}
            id={selectId}
            ref={ref}
            aria-invalid={hasError || undefined}
            aria-describedby={describedBy}
            className={`h-11 w-full appearance-none rounded-xl border bg-white px-3.5 pr-10 text-sm text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/80 dark:bg-slate-900 dark:text-slate-100 ${hasError
              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 dark:border-rose-500'
              : 'border-slate-300 hover:border-slate-400 focus:border-sky-500 dark:border-slate-700 dark:hover:border-slate-600'} ${className}`}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center text-slate-400">
            <ChevronDown className="h-4 w-4" />
          </span>
        </div>

        {hasError ? (
          <p id={errorId} className="text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">
            {error}
          </p>
        ) : helperText ? (
          <p id={helperId} className="text-xs text-slate-500 dark:text-slate-400">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';
