import React, { useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', id, type = 'text', ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
    const hasError = Boolean(error);
    const describedBy = hasError ? errorId : helperText ? helperId : undefined;

    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {label}
          </label>
        )}

        <div className="relative w-full">
          {leftIcon && (
            <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 items-center text-slate-400">
              {leftIcon}
            </span>
          )}

          <input
            {...props}
            id={inputId}
            type={type}
            ref={ref}
            aria-invalid={hasError || undefined}
            aria-describedby={describedBy}
            className={`h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/80 focus:ring-offset-0 dark:bg-slate-900 dark:text-slate-100 ${leftIcon ? 'pl-10' : ''} ${rightIcon ? 'pr-10' : ''} ${hasError
              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 dark:border-rose-500'
              : 'border-slate-300 hover:border-slate-400 focus:border-sky-500 dark:border-slate-700 dark:hover:border-slate-600'} ${className}`}
          />

          {rightIcon && (
            <span aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center text-slate-400">
              {rightIcon}
            </span>
          )}
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

Input.displayName = 'Input';
