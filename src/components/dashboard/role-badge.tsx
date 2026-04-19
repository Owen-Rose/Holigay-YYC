'use client';

import { useRole } from '@/lib/context/role-context';
import type { Role } from '@/lib/constants/roles';

// Color configuration for each role — dark-friendly semi-transparent backgrounds
const roleConfig: Record<Role, { label: string; bgColor: string; textColor: string }> = {
  admin: {
    label: 'Admin',
    bgColor: 'bg-purple-500/15',
    textColor: 'text-purple-400',
  },
  organizer: {
    label: 'Organizer',
    bgColor: 'bg-primary/15',
    textColor: 'text-primary',
  },
  vendor: {
    label: 'Vendor',
    bgColor: 'bg-foreground/10',
    textColor: 'text-foreground',
  },
};

/**
 * Displays the current user's role as a colored badge.
 * Shows loading state while fetching, nothing on error.
 */
export function RoleBadge() {
  const { role, isLoading, error } = useRole();

  // Show subtle loading indicator
  if (isLoading) {
    return <span className="bg-surface-bright inline-flex h-5 w-16 animate-pulse rounded-full" />;
  }

  // Don't show anything if there's an error or no role
  if (error || !role) {
    return null;
  }

  const config = roleConfig[role];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgColor} ${config.textColor}`}
    >
      {config.label}
    </span>
  );
}
