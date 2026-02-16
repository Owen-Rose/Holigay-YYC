'use client';

import Link from 'next/link';
import type { Tables } from '@/types/database';
import { StatusBadge } from '@/components/ui/badge';

// Type for application with joined vendor data
export type ApplicationWithVendor = Tables<'applications'> & {
  vendor: Tables<'vendors'>;
};

interface ApplicationsTableProps {
  applications: ApplicationWithVendor[];
  isLoading?: boolean;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Loading skeleton for the table
function TableSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Desktop skeleton */}
      <div className="hidden md:block">
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
          {/* Header skeleton */}
          <div className="border-b border-border-subtle bg-surface-bright px-6 py-3">
            <div className="flex gap-4">
              <div className="h-4 w-32 rounded bg-surface-bright" />
              <div className="h-4 w-40 rounded bg-surface-bright" />
              <div className="h-4 w-20 rounded bg-surface-bright" />
              <div className="h-4 w-24 rounded bg-surface-bright" />
              <div className="h-4 w-16 rounded bg-surface-bright" />
            </div>
          </div>
          {/* Row skeletons */}
          {[...Array(5)].map((_, i) => (
            <div key={i} className="border-b border-border-subtle px-6 py-4">
              <div className="flex items-center gap-4">
                <div className="h-4 w-32 rounded bg-surface-bright" />
                <div className="flex flex-col gap-1">
                  <div className="h-4 w-28 rounded bg-surface-bright" />
                  <div className="h-3 w-40 rounded bg-surface-bright" />
                </div>
                <div className="h-6 w-20 rounded-full bg-surface-bright" />
                <div className="h-4 w-24 rounded bg-surface-bright" />
                <div className="h-8 w-16 rounded bg-surface-bright" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile skeleton */}
      <div className="space-y-4 md:hidden">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-lg border border-border-subtle bg-surface p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-5 w-32 rounded bg-surface-bright" />
                <div className="h-4 w-24 rounded bg-surface-bright" />
              </div>
              <div className="h-6 w-20 rounded-full bg-surface-bright" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-3 w-40 rounded bg-surface-bright" />
              <div className="h-3 w-32 rounded bg-surface-bright" />
            </div>
            <div className="mt-4">
              <div className="h-8 w-full rounded bg-surface-bright" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Empty state component
function EmptyState() {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface px-6 py-12 text-center">
      <svg
        className="mx-auto h-12 w-12 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"
        />
      </svg>
      <h3 className="mt-4 text-sm font-medium text-foreground">No applications</h3>
      <p className="mt-1 text-sm text-muted">No applications have been submitted yet.</p>
    </div>
  );
}

// Desktop table view
function DesktopTable({ applications }: { applications: ApplicationWithVendor[] }) {
  return (
    <div className="hidden overflow-hidden rounded-lg border border-border-subtle bg-surface md:block">
      <table className="min-w-full divide-y divide-border-subtle">
        <thead className="bg-surface-bright">
          <tr>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium tracking-wider text-muted uppercase"
            >
              Business
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium tracking-wider text-muted uppercase"
            >
              Contact
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium tracking-wider text-muted uppercase"
            >
              Status
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium tracking-wider text-muted uppercase"
            >
              Submitted
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-right text-xs font-medium tracking-wider text-muted uppercase"
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {applications.map((application) => (
            <tr key={application.id} className="hover:bg-surface-bright">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-foreground">
                  {application.vendor.business_name}
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="text-sm text-foreground">{application.vendor.contact_name}</div>
                <div className="text-sm text-muted">{application.vendor.email}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <StatusBadge status={application.status} />
              </td>
              <td className="px-6 py-4 text-sm whitespace-nowrap text-muted">
                {formatDate(application.submitted_at)}
              </td>
              <td className="px-6 py-4 text-right text-sm whitespace-nowrap">
                <Link
                  href={`/dashboard/applications/${application.id}`}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md px-3 py-2 font-medium text-primary hover:bg-primary/10 hover:text-primary-hover"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Mobile card view
function MobileCards({ applications }: { applications: ApplicationWithVendor[] }) {
  return (
    <div className="space-y-4 md:hidden">
      {applications.map((application) => (
        <div
          key={application.id}
          className="rounded-lg border border-border-subtle bg-surface p-4"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                {application.vendor.business_name}
              </h3>
              <p className="mt-1 text-sm text-muted">{application.vendor.contact_name}</p>
            </div>
            <StatusBadge status={application.status} />
          </div>

          <div className="mt-3 space-y-1 text-xs text-muted">
            <p>{application.vendor.email}</p>
            <p>Submitted {formatDate(application.submitted_at)}</p>
          </div>

          <div className="mt-4">
            <Link
              href={`/dashboard/applications/${application.id}`}
              className="block w-full rounded-md bg-primary/10 px-3 py-2 text-center text-sm font-medium text-primary hover:bg-primary/20"
            >
              View Details
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ApplicationsTable({ applications, isLoading = false }: ApplicationsTableProps) {
  if (isLoading) {
    return <TableSkeleton />;
  }

  if (applications.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <DesktopTable applications={applications} />
      <MobileCards applications={applications} />
    </>
  );
}
