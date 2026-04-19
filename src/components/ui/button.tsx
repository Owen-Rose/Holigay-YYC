import * as React from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'primary', size = 'md', isLoading, disabled, children, ...props },
    ref
  ) => {
    const baseStyles = [
      'inline-flex items-center justify-center font-medium rounded-md',
      'transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background',
      'disabled:opacity-50 disabled:cursor-not-allowed',
    ];

    const variantStyles = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary-hover focus:ring-primary/50',
      secondary:
        'bg-surface-bright text-foreground hover:bg-surface-bright/80 focus:ring-primary/50',
      outline:
        'border border-border bg-transparent text-foreground hover:bg-surface-bright focus:ring-primary/50',
      ghost: 'text-muted hover:bg-surface-bright hover:text-foreground focus:ring-primary/50',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500/50',
    };

    // All sizes ensure minimum 44px height for touch accessibility (WCAG)
    const sizeStyles = {
      sm: 'px-3 py-2.5 text-sm min-h-[44px]',
      md: 'px-4 py-2.5 text-sm min-h-[44px]',
      lg: 'px-6 py-3 text-base min-h-[44px]',
    };

    return (
      <button
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Spinner size="sm" className="mr-2 -ml-1" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
