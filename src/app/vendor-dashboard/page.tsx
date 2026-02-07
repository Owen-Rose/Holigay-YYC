import Link from 'next/link'
import { getVendorDashboardData, type VendorApplication } from '@/lib/actions/vendor-dashboard'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'

// =============================================================================
// Stat Card
// =============================================================================

interface StatCardProps {
  title: string
  value: number
  icon: React.ReactNode
  href?: string
}

function StatCard({ title, value, icon, href }: StatCardProps) {
  const content = (
    <Card variant="interactive">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-600">
          {icon}
        </div>
      </div>
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    )
  }

  return content
}

// =============================================================================
// Recent Applications
// =============================================================================

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function RecentApplications({ applications }: { applications: VendorApplication[] }) {
  if (applications.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900">Recent Applications</h2>
        <div className="mt-6 text-center">
          <ClipboardIcon className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-sm text-gray-500">No applications yet.</p>
          <p className="mt-1 text-sm text-gray-500">
            <Link href="/apply" className="text-teal-600 hover:text-teal-500">
              Apply to an event
            </Link>{' '}
            to get started.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-medium text-gray-900">Recent Applications</h2>
        <Link
          href="/vendor-dashboard/applications"
          className="text-sm font-medium text-teal-600 hover:text-teal-500"
        >
          View all
        </Link>
      </div>
      <ul className="divide-y divide-gray-200">
        {applications.map((application) => (
          <li key={application.id}>
            <Link
              href={`/vendor-dashboard/applications/${application.id}`}
              className="block px-6 py-4 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {application.event.name}
                  </p>
                  <p className="mt-1 truncate text-sm text-gray-500">
                    {formatDate(application.event.event_date)} &middot;{' '}
                    {application.event.location}
                  </p>
                </div>
                <div className="ml-4 flex flex-shrink-0 items-center gap-3">
                  <StatusBadge status={application.status} />
                  <span className="hidden text-xs text-gray-500 sm:inline">
                    {formatDate(application.submitted_at)}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

// =============================================================================
// No Vendor Profile State
// =============================================================================

function NoVendorProfile() {
  return (
    <div className="text-center">
      <ClipboardIcon className="mx-auto h-12 w-12 text-gray-400" />
      <h2 className="mt-4 text-lg font-medium text-gray-900">No vendor profile linked</h2>
      <p className="mt-2 text-sm text-gray-500">
        Your account isn&apos;t linked to a vendor yet.{' '}
        <Link href="/apply" className="text-teal-600 hover:text-teal-500">
          Submit an application
        </Link>{' '}
        to create your vendor profile.
      </p>
    </div>
  )
}

// =============================================================================
// Icons
// =============================================================================

function ClockIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  )
}

function XCircleIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  )
}

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
  )
}

// =============================================================================
// Main Page
// =============================================================================

export default async function VendorDashboardPage() {
  const data = await getVendorDashboardData()

  // No vendor profile linked to this user yet
  if (!data) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Vendor Dashboard</h1>
        </div>
        <NoVendorProfile />
      </div>
    )
  }

  const { counts, recentApplications } = data

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Vendor Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Track your event applications and their status.
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard
          title="Pending"
          value={counts.pending}
          icon={<ClockIcon />}
          href="/vendor-dashboard/applications?status=pending"
        />
        <StatCard
          title="Approved"
          value={counts.approved}
          icon={<CheckCircleIcon />}
          href="/vendor-dashboard/applications?status=approved"
        />
        <StatCard
          title="Rejected"
          value={counts.rejected}
          icon={<XCircleIcon />}
          href="/vendor-dashboard/applications?status=rejected"
        />
      </div>

      {/* Recent Applications */}
      <div className="mt-8">
        <RecentApplications applications={recentApplications} />
      </div>
    </div>
  )
}
