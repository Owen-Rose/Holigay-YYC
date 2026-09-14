'use client';

import { useState, useEffect, useCallback } from 'react';
import { getUsers, type UserWithRole } from '@/lib/actions/admin';
import { InviteForm } from '@/components/team/invite-form';
import type { Role } from '@/lib/constants/roles';

// =============================================================================
// Role Badge
// =============================================================================

function RoleBadge({ role }: { role: Role }) {
  const config: Record<Role, { bg: string; text: string }> = {
    admin: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
    organizer: { bg: 'bg-primary/15', text: 'text-primary' },
    vendor: { bg: 'bg-foreground/10', text: 'text-foreground' },
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
      <div className="border-border-subtle bg-surface rounded-lg border">
        <div className="border-border-subtle bg-surface-bright border-b px-6 py-3">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-surface-bright h-4 w-16 rounded" />
            <div className="bg-surface-bright h-4 w-12 rounded" />
            <div className="bg-surface-bright h-4 w-20 rounded" />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="border-border-subtle border-b px-6 py-4 last:border-0">
            <div className="grid grid-cols-3 items-center gap-4">
              <div className="bg-surface-bright h-4 w-48 rounded" />
              <div className="bg-surface-bright h-6 w-20 rounded-full" />
              <div className="bg-surface-bright h-4 w-24 rounded" />
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
    <div className="border-border-subtle bg-surface rounded-lg border p-12 text-center">
      <div className="bg-surface-bright mx-auto flex h-12 w-12 items-center justify-center rounded-full">
        <UsersIcon className="text-muted-foreground h-6 w-6" />
      </div>
      <h3 className="text-foreground mt-4 text-sm font-medium">No team members yet</h3>
      <p className="text-muted mt-1 text-sm">Invite organizers to help manage your events.</p>
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
        <ExclamationIcon className="h-5 w-5 flex-shrink-0 text-red-400" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-400">Failed to load team</h3>
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
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
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
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
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
        <h1 className="text-foreground text-2xl font-bold">Team Management</h1>
        <p className="text-muted mt-1 text-sm">View your team and invite new organizers.</p>
      </div>

      {/* Invite Organizer Form */}
      <div className="mb-8">
        <InviteForm onInvited={fetchUsers} />
      </div>

      {/* Stats */}
      {!isLoading && !error && teamMembers.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="border-border-subtle bg-surface rounded-lg border p-4">
            <p className="text-muted text-sm font-medium">Team Members</p>
            <p className="text-foreground mt-1 text-2xl font-bold">{teamMembers.length}</p>
          </div>
          <div className="border-border-subtle bg-surface rounded-lg border p-4">
            <p className="text-muted text-sm font-medium">Organizers</p>
            <p className="text-primary mt-1 text-2xl font-bold">
              {teamMembers.filter((u) => u.role === 'organizer').length}
            </p>
          </div>
          <div className="border-border-subtle bg-surface rounded-lg border p-4">
            <p className="text-muted text-sm font-medium">Admins</p>
            <p className="mt-1 text-2xl font-bold text-purple-400">
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
        <div className="border-border-subtle bg-surface overflow-hidden rounded-lg border">
          {/* Table Header */}
          <div className="border-border-subtle bg-surface-bright border-b px-6 py-3">
            <div className="text-muted grid grid-cols-12 gap-4 text-xs font-medium tracking-wider uppercase">
              <div className="col-span-6">Email</div>
              <div className="col-span-3">Role</div>
              <div className="col-span-3">Joined</div>
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-border-subtle divide-y">
            {teamMembers.map((member) => (
              <div key={member.id} className="hover:bg-surface-bright px-6 py-4">
                <div className="grid grid-cols-12 items-center gap-4">
                  <div className="col-span-6">
                    <p className="text-foreground truncate text-sm font-medium">{member.email}</p>
                  </div>
                  <div className="col-span-3">
                    <RoleBadge role={member.role} />
                  </div>
                  <div className="col-span-3">
                    <p className="text-muted text-sm">{formatDate(member.createdAt)}</p>
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
