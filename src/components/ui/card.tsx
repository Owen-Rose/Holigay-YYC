import * as React from 'react';
import { cn } from '@/lib/utils';

// =============================================================================
// Card Root Component
// =============================================================================

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'outlined' | 'glass';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', children, ...props }, ref) => {
    const baseStyles = 'rounded-xl border bg-surface/80 backdrop-blur-sm';

    const variantStyles = {
      default: 'border-border-subtle',
      interactive: 'border-border-subtle transition-shadow hover:shadow-lg hover:shadow-primary/5 hover:border-border',
      outlined: 'border-border',
      glass: 'border-border-subtle/50 bg-surface/50 backdrop-blur-lg',
    };

    const paddingStyles = {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    };

    return (
      <div
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], paddingStyles[padding], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// =============================================================================
// Card Header Component
// =============================================================================

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Display a border below the header */
  bordered?: boolean;
}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, bordered = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-between',
          bordered && 'border-b border-border-subtle pb-4',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardHeader.displayName = 'CardHeader';

// =============================================================================
// Card Title Component
// =============================================================================

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as: Component = 'h3', children, ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={cn('text-lg font-medium text-foreground', className)}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

CardTitle.displayName = 'CardTitle';

// =============================================================================
// Card Description Component
// =============================================================================

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  return (
    <p ref={ref} className={cn('text-sm text-muted', className)} {...props}>
      {children}
    </p>
  );
});

CardDescription.displayName = 'CardDescription';

// =============================================================================
// Card Content Component
// =============================================================================

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(className)} {...props}>
        {children}
      </div>
    );
  }
);

CardContent.displayName = 'CardContent';

// =============================================================================
// Card Footer Component
// =============================================================================

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Display a border above the footer */
  bordered?: boolean;
}

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, bordered = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex items-center', bordered && 'border-t border-border-subtle pt-4', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
