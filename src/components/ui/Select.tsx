import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: Array<{ value: string | number; label: string }>;
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, placeholder, className = '', id, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;

    const hasError = !!error;
    const hasHelper = !!helperText;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            {label}
          </label>
        )}
        <div className="relative w-full">
          <select
            id={selectId}
            ref={ref}
            aria-invalid={hasError ? 'true' : undefined}
            aria-describedby={
              hasError ? errorId : hasHelper ? helperId : undefined
            }
            className={`w-full h-11 px-3.5 pr-10 rounded-xl border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm appearance-none transition-all focus:outline-none focus:ring-2 focus:ring-sky-500/80 focus:border-sky-500 dark:focus:ring-sky-400/80 ${
              hasError
                ? 'border-rose-400 dark:border-rose-500 focus:ring-rose-500/20 focus:border-rose-500'
                : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
            } ${className}`}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 pointer-events-none">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
        {hasError && (
          <p
            id={errorId}
            className="text-xs font-medium text-rose-600 dark:text-rose-400"
            role="alert"
          >
            {error}
          </p>
        )}
        {!hasError && hasHelper && (
          <p
            id={helperId}
            className="text-xs text-slate-500 dark:text-slate-400"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
