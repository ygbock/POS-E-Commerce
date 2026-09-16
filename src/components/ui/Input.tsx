import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
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

    const hasError = !!error;
    const hasHelper = !!helperText;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            {label}
          </label>
        )}
        <div className="relative w-full">
          {leftIcon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            type={type}
            ref={ref}
            aria-invalid={hasError ? 'true' : undefined}
            aria-describedby={
              hasError ? errorId : hasHelper ? helperId : undefined
            }
            className={`w-full h-11 px-3.5 rounded-xl border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-sky-500/80 focus:border-sky-500 dark:focus:ring-sky-400/80 ${
              leftIcon ? 'pl-10' : ''
            } ${rightIcon ? 'pr-10' : ''} ${
              hasError
                ? 'border-rose-400 dark:border-rose-500 focus:ring-rose-500/20 focus:border-rose-500'
                : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
            } ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400">
              {rightIcon}
            </div>
          )}
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

Input.displayName = 'Input';
