import React from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  className = '',
  type = 'button',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-xl transition-all cursor-pointer select-none active:scale-98 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950';

  const variantStyles: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600 shadow-sm border border-transparent',
    secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border border-transparent',
    outline: 'bg-transparent hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-500 dark:hover:bg-rose-600 shadow-sm border border-transparent',
    ghost: 'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-transparent',
  };

  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-xs h-9 min-w-[36px]',
    md: 'px-4 py-2.5 text-sm h-11 min-w-[44px]', // Mobile-friendly target size default
    lg: 'px-6 py-3.5 text-base h-13 min-w-[52px]',
  };

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {isLoading && (
        <Spinner
          size="xs"
          className={`mr-2 ${
            variant === 'primary' || variant === 'danger'
              ? 'text-white'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        />
      )}
      {!isLoading && leftIcon && <span className="mr-2 inline-flex flex-shrink-0">{leftIcon}</span>}
      <span className="whitespace-nowrap">{children}</span>
      {!isLoading && rightIcon && <span className="ml-2 inline-flex flex-shrink-0">{rightIcon}</span>}
    </button>
  );
};
