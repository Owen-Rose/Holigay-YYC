import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id ?? generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="text-foreground mb-1 block text-sm font-medium">
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(
            'bg-surface text-foreground block w-full rounded-md border px-3 py-2 shadow-sm transition-colors',
            'focus:ring-1 focus:outline-none',
            'min-h-[100px] resize-y',
            error
              ? 'border-red-500/60 focus:border-red-400 focus:ring-red-400/50'
              : 'border-border focus:border-primary focus:ring-primary/50',
            'disabled:bg-surface-bright disabled:text-muted-foreground disabled:cursor-not-allowed',
            'placeholder:text-muted-foreground',
            className
          )}
          ref={ref}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
          {...props}
        />
        {hint && !error && (
          <p id={`${textareaId}-hint`} className="text-muted mt-1 text-sm">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${textareaId}-error`} className="mt-1 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };
