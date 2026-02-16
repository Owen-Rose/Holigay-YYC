'use client';

/**
 * User Role Select Component
 *
 * A dropdown for changing a user's role with confirmation dialog.
 * Shows loading state during updates and handles errors gracefully.
 */

import { useState } from 'react';
import { updateUserRole } from '@/lib/actions/admin';
import { ROLES, type Role } from '@/lib/constants/roles';

// =============================================================================
// Types
// =============================================================================

interface UserRoleSelectProps {
  userId: string;
  userEmail: string;
  currentRole: Role;
  onRoleChange?: (newRole: Role) => void;
}

// =============================================================================
// Role Configuration
// =============================================================================

const ROLE_CONFIG: Record<Role, { label: string; description: string }> = {
  vendor: {
    label: 'Vendor',
    description: 'Can apply to events and view their applications',
  },
  organizer: {
    label: 'Organizer',
    description: 'Can manage applications and view all vendor data',
  },
  admin: {
    label: 'Admin',
    description: 'Full access including user management',
  },
};

// =============================================================================
// Component
// =============================================================================

export function UserRoleSelect({
  userId,
  userEmail,
  currentRole,
  onRoleChange,
}: UserRoleSelectProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle dropdown change - show confirmation first
  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value as Role;
    if (newRole !== currentRole) {
      setPendingRole(newRole);
      setShowConfirm(true);
      setError(null);
    }
  }

  // Cancel the pending change
  function handleCancel() {
    setShowConfirm(false);
    setPendingRole(null);
    setError(null);
  }

  // Confirm and execute the role change
  async function handleConfirm() {
    if (!pendingRole) return;

    setIsUpdating(true);
    setError(null);

    try {
      const result = await updateUserRole(userId, pendingRole);

      if (!result.success) {
        setError(result.error || 'Failed to update role');
        return;
      }

      // Success - notify parent and close dialog
      onRoleChange?.(pendingRole);
      setShowConfirm(false);
      setPendingRole(null);
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Role update error:', err);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="relative">
      {/* Role Dropdown */}
      <select
        value={currentRole}
        onChange={handleSelectChange}
        disabled={isUpdating}
        className="min-h-[36px] w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_CONFIG[role].label}
          </option>
        ))}
      </select>

      {/* Confirmation Dialog */}
      {showConfirm && pendingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-md rounded-lg border border-border-subtle bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Confirm Role Change</h3>

            <p className="mt-2 text-sm text-muted">
              Are you sure you want to change the role for{' '}
              <span className="font-medium text-foreground">{userEmail}</span>?
            </p>

            <div className="mt-4 rounded-md bg-surface-bright p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Current:</span>
                <span className="font-medium text-foreground">
                  {ROLE_CONFIG[currentRole].label}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-muted">New:</span>
                <span className="font-medium text-primary">
                  {ROLE_CONFIG[pendingRole].label}
                </span>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {ROLE_CONFIG[pendingRole].description}
            </p>

            {/* Error Message */}
            {error && (
              <div className="mt-4 rounded-md bg-red-500/10 p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isUpdating}
                className="flex-1 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-bright focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background focus:outline-none disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isUpdating}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background focus:outline-none disabled:opacity-50"
              >
                {isUpdating ? 'Updating...' : 'Confirm Change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
