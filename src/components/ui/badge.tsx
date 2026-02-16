import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'sm', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center font-medium rounded-full';

    const variantStyles = {
      default: 'bg-foreground/10 text-foreground',
      secondary: 'bg-foreground/5 text-muted',
      success: 'bg-green-500/15 text-green-400',
      warning: 'bg-yellow-500/15 text-yellow-400',
      danger: 'bg-red-500/15 text-red-400',
      info: 'bg-primary/15 text-primary',
    };

    const sizeStyles = {
      sm: 'px-2.5 py-0.5 text-xs',
      md: 'px-3 py-1 text-sm',
    };

    return (
      <span
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

// =============================================================================
// Status Badge - Pre-configured badge for application status
// =============================================================================

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'waitlisted';

const statusConfig: Record<ApplicationStatus, { label: string; variant: BadgeProps['variant'] }> = {
  pending: { label: 'Pending', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  waitlisted: { label: 'Waitlisted', variant: 'info' },
};

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  status: string;
}

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, className, ...props }, ref) => {
    const config = statusConfig[status as ApplicationStatus] || {
      label: status,
      variant: 'default' as const,
    };

    return (
      <Badge ref={ref} variant={config.variant} className={className} {...props}>
        {config.label}
      </Badge>
    );
  }
);

StatusBadge.displayName = 'StatusBadge';

export { Badge, StatusBadge };
