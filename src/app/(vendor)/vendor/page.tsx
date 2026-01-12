import Link from 'next/link';
import { getVendorDashboardData } from '@/lib/actions/vendor-portal';

/**
 * Vendor Portal Home Page
 *
 * Displays a personalized dashboard for vendors showing:
 * - Welcome message with their name
 * - Application summary cards (counts by status)
 * - Recent applications list
 * - Quick actions (apply to new events)
 */

export default async function VendorHomePage() {
  const result = await getVendorDashboardData();

  // Handle error state
  if (!result.success || !result.data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-red-800">{result.error || 'Failed to load dashboard data'}</p>
      </div>
    );
  }

  const { user, vendor, applications, counts } = result.data;

  // Determine display name (vendor name or email)
  const displayName = vendor?.contactName || user.email.split('@')[0];

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {displayName}!
        </h1>
        <p className="mt-1 text-gray-600">
          {vendor
            ? `Manage your applications for ${vendor.businessName}`
            : 'Get started by applying to your first event'}
        </p>
      </div>

      {/* Application Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total Applications"
          value={counts.total}
          color="gray"
        />
        <SummaryCard
          label="Pending"
          value={counts.pending}
          color="amber"
        />
        <SummaryCard
          label="Approved"
          value={counts.approved}
          color="green"
        />
        <SummaryCard
          label="Waitlisted"
          value={counts.waitlisted}
          color="blue"
        />
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/apply"
            className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
          >
            <PlusIcon className="h-4 w-4" />
            Apply to New Event
          </Link>
          {vendor && (
            <Link
              href="/vendor/applications"
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <ClipboardIcon className="h-4 w-4" />
              View All Applications
            </Link>
          )}
        </div>
      </div>

      {/* Recent Applications */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Applications</h2>
          {applications.length > 3 && (
            <Link
              href="/vendor/applications"
              className="text-sm font-medium text-teal-600 hover:text-teal-700"
            >
              View all →
            </Link>
          )}
        </div>

        {applications.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-4 space-y-3">
            {applications.slice(0, 5).map((app) => (
              <ApplicationCard key={app.id} application={app} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Summary card showing a metric
 */
function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'gray' | 'amber' | 'green' | 'blue';
}) {
  const colorClasses = {
    gray: 'bg-gray-50 border-gray-200',
    amber: 'bg-amber-50 border-amber-200',
    green: 'bg-green-50 border-green-200',
    blue: 'bg-blue-50 border-blue-200',
  };

  const valueColorClasses = {
    gray: 'text-gray-900',
    amber: 'text-amber-700',
    green: 'text-green-700',
    blue: 'text-blue-700',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${valueColorClasses[color]}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * Application card for the recent applications list
 */
function ApplicationCard({
  application,
}: {
  application: {
    id: string;
    status: string;
    submittedAt: string;
    event: {
      name: string;
      eventDate: string;
      location: string;
    } | null;
  };
}) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    pending: {
      label: 'Pending',
      className: 'bg-amber-100 text-amber-800',
    },
    approved: {
      label: 'Approved',
      className: 'bg-green-100 text-green-800',
    },
    rejected: {
      label: 'Rejected',
      className: 'bg-red-100 text-red-800',
    },
    waitlisted: {
      label: 'Waitlisted',
      className: 'bg-blue-100 text-blue-800',
    },
  };

  const status = statusConfig[application.status] || {
    label: application.status,
    className: 'bg-gray-100 text-gray-800',
  };

  const formattedDate = application.event
    ? new Date(application.event.eventDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Unknown date';

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-900">
          {application.event?.name || 'Unknown Event'}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {formattedDate} • {application.event?.location || 'Unknown location'}
        </p>
      </div>
      <span
        className={`ml-4 inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
      >
        {status.label}
      </span>
    </div>
  );
}

/**
 * Empty state when vendor has no applications
 */
function EmptyState() {
  return (
    <div className="mt-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <ClipboardIcon className="h-6 w-6 text-gray-400" />
      </div>
      <h3 className="mt-3 text-sm font-medium text-gray-900">No applications yet</h3>
      <p className="mt-1 text-sm text-gray-500">
        Get started by applying to your first event.
      </p>
      <div className="mt-4">
        <Link
          href="/apply"
          className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
        >
          <PlusIcon className="h-4 w-4" />
          Apply Now
        </Link>
      </div>
    </div>
  );
}

// =============================================================================
// Icons
// =============================================================================

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
      />
    </svg>
  );
}
