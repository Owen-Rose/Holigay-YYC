import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, hint, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <input
          type={type}
          id={inputId}
          className={cn(
            'block min-h-[44px] w-full rounded-md border bg-surface text-foreground px-3 py-2.5 shadow-sm transition-colors',
            'focus:ring-1 focus:outline-none',
            error
              ? 'border-red-500/60 focus:border-red-400 focus:ring-red-400/50'
              : 'border-border focus:border-primary focus:ring-primary/50',
            'disabled:cursor-not-allowed disabled:bg-surface-bright disabled:text-muted-foreground',
            'placeholder:text-muted-foreground',
            className
          )}
          ref={ref}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {hint && !error && (
          <p id={`${inputId}-hint`} className="mt-1 text-sm text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
