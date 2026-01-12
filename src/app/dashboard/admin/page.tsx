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
import { getUsers, type UserWithRole } from '@/lib/actions/admin';
import { UserRoleSelect } from '@/components/admin/user-role-select';
import type { Role } from '@/lib/constants/roles';

// =============================================================================
// Role Badge Component
// =============================================================================

function RoleBadge({ role }: { role: Role }) {
  const config: Record<Role, { bg: string; text: string }> = {
    admin: { bg: 'bg-purple-100', text: 'text-purple-700' },
    organizer: { bg: 'bg-blue-100', text: 'text-blue-700' },
    vendor: { bg: 'bg-gray-100', text: 'text-gray-700' },
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
      <div className="rounded-lg border border-gray-200 bg-white">
        {/* Header skeleton */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
          <div className="grid grid-cols-4 gap-4">
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-12 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
          </div>
        </div>
        {/* Row skeletons */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border-b border-gray-100 px-6 py-4 last:border-0">
            <div className="grid grid-cols-4 items-center gap-4">
              <div className="h-4 w-48 rounded bg-gray-200" />
              <div className="h-6 w-20 rounded-full bg-gray-200" />
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="h-8 w-28 rounded bg-gray-200" />
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
    <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <UsersIcon className="h-6 w-6 text-gray-400" />
      </div>
      <h3 className="mt-4 text-sm font-medium text-gray-900">No users found</h3>
      <p className="mt-1 text-sm text-gray-500">
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
    <div className="rounded-lg border border-red-200 bg-red-50 p-6">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <ExclamationIcon className="h-5 w-5 text-red-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800">Failed to load users</h3>
          <p className="mt-1 text-sm text-red-700">{message}</p>
          <button
            onClick={onRetry}
            className="mt-3 text-sm font-medium text-red-600 hover:text-red-500"
          >
            Try again →
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Success Toast
// =============================================================================

function SuccessToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-green-50 p-4 shadow-lg">
      <div className="flex items-center gap-3">
        <CheckIcon className="h-5 w-5 text-green-400" />
        <p className="text-sm font-medium text-green-800">{message}</p>
        <button onClick={onClose} className="text-green-400 hover:text-green-500">
          <CloseIcon className="h-4 w-4" />
        </button>
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    setSuccessMessage('User role updated successfully');
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="mt-1 text-sm text-gray-600">
          View all users and manage their roles. Changes take effect immediately.
        </p>
      </div>

      {/* Stats Summary */}
      {!isLoading && !error && users.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-500">Total Users</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{users.length}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-500">Organizers</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">
              {users.filter((u) => u.role === 'organizer').length}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-500">Admins</p>
            <p className="mt-1 text-2xl font-bold text-purple-600">
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
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {/* Table Header */}
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
            <div className="grid grid-cols-12 gap-4 text-xs font-medium uppercase tracking-wider text-gray-500">
              <div className="col-span-5">Email</div>
              <div className="col-span-2">Current Role</div>
              <div className="col-span-2">Joined</div>
              <div className="col-span-3">Change Role</div>
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-gray-100">
            {users.map((user) => (
              <div key={user.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="grid grid-cols-12 items-center gap-4">
                  {/* Email */}
                  <div className="col-span-5">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {user.email}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      ID: {user.id.slice(0, 8)}...
                    </p>
                  </div>

                  {/* Current Role */}
                  <div className="col-span-2">
                    <RoleBadge role={user.role} />
                  </div>

                  {/* Joined Date */}
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500">{formatDate(user.createdAt)}</p>
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

      {/* Success Toast */}
      {successMessage && (
        <SuccessToast
          message={successMessage}
          onClose={() => setSuccessMessage(null)}
        />
      )}
    </div>
  );
}
