'use client';

import { useRole } from '@/lib/context/role-context';
import type { Role } from '@/lib/constants/roles';

// Color configuration for each role
const roleConfig: Record<Role, { label: string; bgColor: string; textColor: string }> = {
  admin: {
    label: 'Admin',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-800',
  },
  organizer: {
    label: 'Organizer',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
  },
  vendor: {
    label: 'Vendor',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
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
    return <span className="inline-flex h-5 w-16 animate-pulse rounded-full bg-gray-200" />;
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
