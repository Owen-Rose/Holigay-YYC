'use client';

/**
 * Admin Users Page
 *
 * Allows admins to view all users and manage their roles.
 * Features:
 * - User list with email, role, and registration date
 * - Role change dropdown with confirmation
 * - Success/error feedback
 * - Loading and empty states
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { getUsers, type UserWithRole } from '@/lib/actions/admin';
import { UserRoleSelect } from '@/components/admin/user-role-select';
import type { Role } from '@/lib/constants/roles';

// =============================================================================
// Role Badge Component
// =============================================================================

function RoleBadge({ role }: { role: Role }) {
  const config: Record<Role, { bg: string; text: string }> = {
    admin: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
    organizer: { bg: 'bg-primary/15', text: 'text-primary' },
    vendor: { bg: 'bg-foreground/10', text: 'text-foreground' },
  };

  const { bg, text } = config[role];

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bg} ${text}`}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

// =============================================================================
// Format Date Helper
// =============================================================================

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// =============================================================================
// Loading Skeleton
// =============================================================================

function TableSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="rounded-lg border border-border-subtle bg-surface">
        {/* Header skeleton */}
        <div className="border-b border-border-subtle bg-surface-bright px-6 py-3">
          <div className="grid grid-cols-4 gap-4">
            <div className="h-4 w-16 rounded bg-surface-bright" />
            <div className="h-4 w-12 rounded bg-surface-bright" />
            <div className="h-4 w-20 rounded bg-surface-bright" />
            <div className="h-4 w-16 rounded bg-surface-bright" />
          </div>
        </div>
        {/* Row skeletons */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border-b border-border-subtle px-6 py-4 last:border-0">
            <div className="grid grid-cols-4 items-center gap-4">
              <div className="h-4 w-48 rounded bg-surface-bright" />
              <div className="h-6 w-20 rounded-full bg-surface-bright" />
              <div className="h-4 w-24 rounded bg-surface-bright" />
              <div className="h-8 w-28 rounded bg-surface-bright" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Empty State
// =============================================================================

function EmptyState() {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-bright">
        <UsersIcon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-sm font-medium text-foreground">No users found</h3>
      <p className="mt-1 text-sm text-muted">
        Users will appear here once they sign up.
      </p>
    </div>
  );
}

// =============================================================================
// Error State
// =============================================================================

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-6">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <ExclamationIcon className="h-5 w-5 text-red-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-400">Failed to load users</h3>
          <p className="mt-1 text-sm text-red-400/80">{message}</p>
          <button
            onClick={onRetry}
            className="mt-3 text-sm font-medium text-red-400 hover:text-red-300"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Icons
// =============================================================================

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
      />
    </svg>
  );
}

function ExclamationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
      />
    </svg>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch users on mount
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getUsers();

      if (!result.success) {
        setError(result.error || 'Failed to fetch users');
        return;
      }

      setUsers(result.data || []);
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Fetch users error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Handle role change - update local state and show success
  function handleRoleChange(userId: string, newRole: Role) {
    setUsers((prevUsers) =>
      prevUsers.map((user) =>
        user.id === userId ? { ...user, role: newRole } : user
      )
    );
    toast.success('User role updated');
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">User Management</h1>
        <p className="mt-1 text-sm text-muted">
          View all users and manage their roles. Changes take effect immediately.
        </p>
      </div>

      {/* Stats Summary */}
      {!isLoading && !error && users.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <p className="text-sm font-medium text-muted">Total Users</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{users.length}</p>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <p className="text-sm font-medium text-muted">Organizers</p>
            <p className="mt-1 text-2xl font-bold text-primary">
              {users.filter((u) => u.role === 'organizer').length}
            </p>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <p className="text-sm font-medium text-muted">Admins</p>
            <p className="mt-1 text-2xl font-bold text-purple-400">
              {users.filter((u) => u.role === 'admin').length}
            </p>
          </div>
        </div>
      )}

      {/* Content Area */}
      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchUsers} />
      ) : users.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
          {/* Table Header */}
          <div className="border-b border-border-subtle bg-surface-bright px-6 py-3">
            <div className="grid grid-cols-12 gap-4 text-xs font-medium uppercase tracking-wider text-muted">
              <div className="col-span-5">Email</div>
              <div className="col-span-2">Current Role</div>
              <div className="col-span-2">Joined</div>
              <div className="col-span-3">Change Role</div>
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border-subtle">
            {users.map((user) => (
              <div key={user.id} className="px-6 py-4 hover:bg-surface-bright">
                <div className="grid grid-cols-12 items-center gap-4">
                  {/* Email */}
                  <div className="col-span-5">
                    <p className="truncate text-sm font-medium text-foreground">
                      {user.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      ID: {user.id.slice(0, 8)}...
                    </p>
                  </div>

                  {/* Current Role */}
                  <div className="col-span-2">
                    <RoleBadge role={user.role} />
                  </div>

                  {/* Joined Date */}
                  <div className="col-span-2">
                    <p className="text-sm text-muted">{formatDate(user.createdAt)}</p>
                  </div>

                  {/* Role Selector */}
                  <div className="col-span-3">
                    <UserRoleSelect
                      userId={user.id}
                      userEmail={user.email}
                      currentRole={user.role}
                      onRoleChange={(newRole) => handleRoleChange(user.id, newRole)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
