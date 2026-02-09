'use client';

import { useState, useEffect, useCallback } from 'react';
import { getUsers, type UserWithRole } from '@/lib/actions/admin';
import type { Role } from '@/lib/constants/roles';

// =============================================================================
// Role Badge
// =============================================================================

function RoleBadge({ role }: { role: Role }) {
  const config: Record<Role, { bg: string; text: string }> = {
    admin: { bg: 'bg-purple-100', text: 'text-purple-700' },
    organizer: { bg: 'bg-blue-100', text: 'text-blue-700' },
    vendor: { bg: 'bg-gray-100', text: 'text-gray-700' },
  };

  const { bg, text } = config[role];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bg} ${text}`}
    >
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

// =============================================================================
// Helpers
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
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
          <div className="grid grid-cols-3 gap-4">
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-12 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="border-b border-gray-100 px-6 py-4 last:border-0">
            <div className="grid grid-cols-3 items-center gap-4">
              <div className="h-4 w-48 rounded bg-gray-200" />
              <div className="h-6 w-20 rounded-full bg-gray-200" />
              <div className="h-4 w-24 rounded bg-gray-200" />
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
      <h3 className="mt-4 text-sm font-medium text-gray-900">No team members yet</h3>
      <p className="mt-1 text-sm text-gray-500">
        Invite organizers to help manage your events.
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
        <ExclamationIcon className="h-5 w-5 flex-shrink-0 text-red-400" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800">Failed to load team</h3>
          <p className="mt-1 text-sm text-red-700">{message}</p>
          <button
            onClick={onRetry}
            className="mt-3 text-sm font-medium text-red-600 hover:text-red-500"
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

function EnvelopeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
      />
    </svg>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function TeamPage() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getUsers();

      if (!result.success) {
        setError(result.error || 'Failed to fetch team members');
        return;
      }

      setUsers(result.data || []);
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Fetch team error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Filter to organizers and admins only
  const teamMembers = users.filter((u) => u.role === 'organizer' || u.role === 'admin');

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
        <p className="mt-1 text-sm text-gray-600">
          View your team and invite new organizers.
        </p>
      </div>

      {/* Invite Organizer Form */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <EnvelopeIcon className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">Invite Organizer</h2>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Send an invitation email to add a new organizer to your team.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Server action will be wired in Task 4.2.2
          }}
          className="mt-4 flex gap-3"
        >
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="organizer@example.com"
            required
            disabled
            className="min-h-[44px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled
            className="min-h-[44px] rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send Invite
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          Invite functionality requires email service configuration (coming soon).
        </p>
      </div>

      {/* Stats */}
      {!isLoading && !error && teamMembers.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-500">Team Members</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{teamMembers.length}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-500">Organizers</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">
              {teamMembers.filter((u) => u.role === 'organizer').length}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-500">Admins</p>
            <p className="mt-1 text-2xl font-bold text-purple-600">
              {teamMembers.filter((u) => u.role === 'admin').length}
            </p>
          </div>
        </div>
      )}

      {/* Team Members List */}
      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchUsers} />
      ) : teamMembers.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {/* Table Header */}
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
            <div className="grid grid-cols-12 gap-4 text-xs font-medium uppercase tracking-wider text-gray-500">
              <div className="col-span-6">Email</div>
              <div className="col-span-3">Role</div>
              <div className="col-span-3">Joined</div>
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-gray-100">
            {teamMembers.map((member) => (
              <div key={member.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="grid grid-cols-12 items-center gap-4">
                  <div className="col-span-6">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {member.email}
                    </p>
                  </div>
                  <div className="col-span-3">
                    <RoleBadge role={member.role} />
                  </div>
                  <div className="col-span-3">
                    <p className="text-sm text-gray-500">{formatDate(member.createdAt)}</p>
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
