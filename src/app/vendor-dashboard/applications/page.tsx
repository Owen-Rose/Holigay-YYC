import Link from 'next/link';
import { getVendorApplicationsList, type VendorApplication } from '@/lib/actions/vendor-dashboard';
import { StatusBadge } from '@/components/ui/badge';

// =============================================================================
// Types
// =============================================================================

type SearchParams = Promise<{ status?: string }>;

// =============================================================================
// Status Filter Tabs
// =============================================================================

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Waitlisted', value: 'waitlisted' },
];

function StatusFilterTabs({ activeStatus }: { activeStatus: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {STATUS_TABS.map((tab) => {
        const isActive = activeStatus === tab.value;
        const href =
          tab.value === ''
            ? '/vendor-dashboard/applications'
            : `/vendor-dashboard/applications?status=${tab.value}`;

        return (
          <Link
            key={tab.value}
            href={href}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-teal-500 text-white'
                : 'bg-surface-bright text-muted hover:bg-surface-bright/80 hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

// =============================================================================
// Applications List
// =============================================================================

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ApplicationsList({ applications }: { applications: VendorApplication[] }) {
  return (
    <div className="border-border-subtle bg-surface rounded-lg border">
      <ul className="divide-border-subtle divide-y">
        {applications.map((application) => (
          <li key={application.id}>
            <Link
              href={`/vendor-dashboard/applications/${application.id}`}
              className="hover:bg-surface-bright block px-6 py-4"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-medium">
                    {application.event.name}
                  </p>
                  <p className="text-muted mt-1 truncate text-sm">
                    {formatDate(application.event.event_date)} &middot; {application.event.location}
                  </p>
                </div>
                <div className="ml-4 flex flex-shrink-0 items-center gap-3">
                  <StatusBadge status={application.status} />
                  <span className="text-muted-foreground hidden text-xs sm:inline">
                    Submitted {formatDate(application.submitted_at)}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// Empty State
// =============================================================================

function EmptyState({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div className="border-border-subtle bg-surface rounded-lg border p-12 text-center">
      <ClipboardIcon className="text-muted-foreground mx-auto h-12 w-12" />
      {isFiltered ? (
        <>
          <p className="text-foreground mt-4 text-sm font-medium">No matching applications</p>
          <p className="text-muted mt-1 text-sm">
            Try a different filter or{' '}
            <Link
              href="/vendor-dashboard/applications"
              className="text-teal-400 hover:text-teal-300"
            >
              view all applications
            </Link>
            .
          </p>
        </>
      ) : (
        <>
          <p className="text-foreground mt-4 text-sm font-medium">No applications yet</p>
          <p className="text-muted mt-1 text-sm">
            <Link href="/apply" className="text-teal-400 hover:text-teal-300">
              Apply to an event
            </Link>{' '}
            to get started.
          </p>
        </>
      )}
    </div>
  );
}

// =============================================================================
// No Vendor Profile State
// =============================================================================

function NoVendorProfile() {
  return (
    <div className="border-border-subtle bg-surface rounded-lg border p-12 text-center">
      <ClipboardIcon className="text-muted-foreground mx-auto h-12 w-12" />
      <h2 className="text-foreground mt-4 text-lg font-medium">No vendor profile linked</h2>
      <p className="text-muted mt-2 text-sm">
        Your account isn&apos;t linked to a vendor yet.{' '}
        <Link href="/apply" className="text-teal-400 hover:text-teal-300">
          Submit an application
        </Link>{' '}
        to create your vendor profile.
      </p>
    </div>
  );
}

// =============================================================================
// Error State
// =============================================================================

function ErrorState() {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-12 text-center">
      <p className="text-sm font-medium text-red-400">
        Something went wrong loading your applications.
      </p>
      <p className="mt-1 text-sm text-red-400/80">Please try again later.</p>
    </div>
  );
}

// =============================================================================
// Icons
// =============================================================================

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-6 w-6'}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
      />
    </svg>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default async function VendorApplicationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { status } = await searchParams;
  const activeStatus = status || '';

  const result = await getVendorApplicationsList(status || null);

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">My Applications</h1>
        <p className="text-muted mt-1 text-sm">View and track all your event applications.</p>
      </div>

      {/* Error State */}
      {!result.success && result.error === 'fetch_failed' && <ErrorState />}

      {/* No Vendor Profile */}
      {!result.success && result.error === 'no_vendor_profile' && <NoVendorProfile />}

      {/* Success: show filter tabs and list */}
      {result.success && (
        <>
          <div className="mb-6">
            <StatusFilterTabs activeStatus={activeStatus} />
          </div>

          {result.data.length > 0 ? (
            <ApplicationsList applications={result.data} />
          ) : (
            <EmptyState isFiltered={activeStatus !== ''} />
          )}
        </>
      )}
    </div>
  );
}
