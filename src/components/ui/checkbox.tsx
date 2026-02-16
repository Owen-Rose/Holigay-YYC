import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, id, ...props }, ref) => {
    const generatedId = React.useId();
    const checkboxId = id ?? generatedId;

    return (
      <label
        htmlFor={checkboxId}
        className={cn(
          '-mx-2 flex min-h-[44px] cursor-pointer items-center rounded-md px-2 py-2 hover:bg-surface-bright',
          props.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent'
        )}
      >
        <input
          type="checkbox"
          id={checkboxId}
          className={cn(
            'h-5 w-5 shrink-0 rounded border-border',
            'text-primary focus:ring-primary/50 focus:ring-offset-0',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          ref={ref}
          {...props}
        />
        <div className="ml-3 text-sm">
          <span className="font-medium text-foreground">{label}</span>
          {description && <p className="text-muted">{description}</p>}
        </div>
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };
