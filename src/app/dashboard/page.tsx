import Link from 'next/link';
import {
  getApplicationCounts,
  getApplications,
  type ApplicationWithVendor,
} from '@/lib/actions/applications';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';

// =============================================================================
// Stat Card Components
// =============================================================================

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  href?: string;
  trend?: {
    value: number;
    label: string;
  };
}

function StatCard({ title, value, icon, href, trend }: StatCardProps) {
  const content = (
    <Card variant="interactive">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted text-sm font-medium">{title}</p>
          <p className="text-foreground mt-2 text-3xl font-bold">{value}</p>
          {trend && (
            <p className="text-muted-foreground mt-1 text-xs">
              {trend.value > 0 ? '+' : ''}
              {trend.value} {trend.label}
            </p>
          )}
        </div>
        <div className="bg-primary-soft text-primary flex h-12 w-12 items-center justify-center rounded-full">
          {icon}
        </div>
      </div>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

// =============================================================================
// Recent Applications Component
// =============================================================================

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function RecentApplications({ applications }: { applications: ApplicationWithVendor[] }) {
  if (applications.length === 0) {
    return (
      <div className="border-border-subtle bg-surface rounded-lg border p-6">
        <h2 className="text-foreground text-lg font-medium">Recent Applications</h2>
        <div className="mt-6 text-center">
          <svg
            className="text-muted-foreground mx-auto h-12 w-12"
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
          <p className="text-muted mt-4 text-sm">No applications yet.</p>
          <p className="text-muted mt-1 text-sm">
            Applications will appear here once vendors start applying.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border-subtle bg-surface rounded-lg border">
      <div className="border-border-subtle flex items-center justify-between border-b px-6 py-4">
        <h2 className="text-foreground text-lg font-medium">Recent Applications</h2>
        <Link
          href="/dashboard/applications"
          className="text-primary hover:text-primary-hover text-sm font-medium"
        >
          View all
        </Link>
      </div>
      <ul className="divide-border-subtle divide-y">
        {applications.map((application) => (
          <li key={application.id}>
            <Link
              href={`/dashboard/applications/${application.id}`}
              className="hover:bg-surface-bright block px-6 py-4"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-medium">
                    {application.vendor.business_name}
                  </p>
                  <p className="text-muted mt-1 truncate text-sm">
                    {application.vendor.contact_name} &middot; {application.vendor.email}
                  </p>
                </div>
                <div className="ml-4 flex flex-shrink-0 items-center gap-3">
                  <StatusBadge status={application.status} />
                  <span className="text-muted-foreground text-xs">
                    {formatDate(application.submitted_at)}
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
// Quick Actions Component
// =============================================================================

function QuickActions() {
  const actions = [
    {
      title: 'View Applications',
      description: 'Review and manage vendor applications',
      href: '/dashboard/applications',
      icon: (
        <svg
          className="h-6 w-6"
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
      ),
    },
    {
      title: 'Manage Events',
      description: 'Create and configure market events',
      href: '/dashboard/events',
      icon: (
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
          />
        </svg>
      ),
    },
    {
      title: 'Application Form',
      description: 'Preview the public vendor application',
      href: '/apply',
      icon: (
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="border-border-subtle bg-surface rounded-lg border p-6">
      <h2 className="text-foreground text-lg font-medium">Quick Actions</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {actions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="group border-border-subtle bg-surface hover:border-primary/50 hover:shadow-primary/5 relative flex items-center gap-4 rounded-lg border p-4 transition-all hover:shadow-md"
          >
            <div className="bg-primary-soft text-primary group-hover:bg-primary/20 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg">
              {action.icon}
            </div>
            <div>
              <p className="text-foreground group-hover:text-primary text-sm font-medium">
                {action.title}
              </p>
              <p className="text-muted mt-0.5 text-xs">{action.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Icons for Stat Cards
// =============================================================================

function ClockIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      className="h-6 w-6"
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

// =============================================================================
// Main Dashboard Page
// =============================================================================

export default async function DashboardPage() {
  // Fetch application counts for summary cards
  const counts = await getApplicationCounts();

  // Fetch recent 5 applications
  const recentResult = await getApplications({}, { page: 1, pageSize: 5 });
  const recentApplications = recentResult.data?.applications ?? [];

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-foreground text-2xl font-bold">Dashboard</h1>
        <p className="text-muted mt-1 text-sm">
          Welcome to your event organizer dashboard. Here&apos;s an overview of your vendor
          applications.
        </p>
      </div>

      {/* Summary Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Pending Review"
          value={counts.pending}
          icon={<ClockIcon />}
          href="/dashboard/applications?status=pending"
        />
        <StatCard
          title="Approved"
          value={counts.approved}
          icon={<CheckCircleIcon />}
          href="/dashboard/applications?status=approved"
        />
        <StatCard
          title="Rejected"
          value={counts.rejected}
          icon={<XCircleIcon />}
          href="/dashboard/applications?status=rejected"
        />
        <StatCard
          title="Total Applications"
          value={counts.total}
          icon={<UsersIcon />}
          href="/dashboard/applications"
        />
      </div>

      {/* Recent Applications Section */}
      <div className="mt-8">
        <RecentApplications applications={recentApplications} />
      </div>

      {/* Quick Actions Section */}
      <div className="mt-8">
        <QuickActions />
      </div>
    </div>
  );
}
