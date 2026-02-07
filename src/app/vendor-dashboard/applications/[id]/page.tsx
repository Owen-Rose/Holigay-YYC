import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getVendorApplicationDetail,
  type VendorApplicationDetail,
} from '@/lib/actions/vendor-dashboard'
import { AttachmentsList } from '@/app/dashboard/applications/[id]/attachments-list'
import { Card, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'

// =============================================================================
// Types
// =============================================================================

interface VendorApplicationDetailPageProps {
  params: Promise<{ id: string }>
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// =============================================================================
// Info Section Components
// =============================================================================

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardTitle className="mb-4 font-semibold">{title}</CardTitle>
      {children}
    </Card>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-2">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value || '—'}</dd>
    </div>
  )
}

// =============================================================================
// Event Info Component
// =============================================================================

function EventInfo({ event }: { event: VendorApplicationDetail['event'] }) {
  return (
    <InfoSection title="Event Details">
      <dl className="divide-y divide-gray-100">
        <InfoRow label="Event Name" value={event.name} />
        <InfoRow label="Date" value={formatDate(event.event_date)} />
        <InfoRow label="Location" value={event.location} />
        {event.description && <InfoRow label="Description" value={event.description} />}
        <InfoRow
          label="Application Deadline"
          value={event.application_deadline ? formatDate(event.application_deadline) : null}
        />
        <InfoRow label="Max Vendors" value={event.max_vendors?.toString() || 'Unlimited'} />
      </dl>
    </InfoSection>
  )
}

// =============================================================================
// Application Details Component
// =============================================================================

function ApplicationDetails({ application }: { application: VendorApplicationDetail }) {
  return (
    <InfoSection title="Application Details">
      <dl className="divide-y divide-gray-100">
        <InfoRow label="Booth Preference" value={application.booth_preference} />
        <InfoRow
          label="Product Categories"
          value={
            application.product_categories?.length ? (
              <div className="flex flex-wrap gap-1">
                {application.product_categories.map((category) => (
                  <span
                    key={category}
                    className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800"
                  >
                    {category}
                  </span>
                ))}
              </div>
            ) : null
          }
        />
        <InfoRow label="Special Requirements" value={application.special_requirements} />
        <InfoRow label="Submitted" value={formatDateTime(application.submitted_at)} />
        <InfoRow label="Last Updated" value={formatDateTime(application.updated_at)} />
      </dl>
    </InfoSection>
  )
}

// =============================================================================
// Your Business Info Component
// =============================================================================

function BusinessInfo({ vendor }: { vendor: VendorApplicationDetail['vendor'] }) {
  return (
    <InfoSection title="Your Business Info">
      <dl className="divide-y divide-gray-100">
        <InfoRow label="Business Name" value={vendor.business_name} />
        <InfoRow label="Contact Name" value={vendor.contact_name} />
        <InfoRow
          label="Email"
          value={
            <a href={`mailto:${vendor.email}`} className="text-blue-600 hover:text-blue-800">
              {vendor.email}
            </a>
          }
        />
        <InfoRow label="Phone" value={vendor.phone} />
        <InfoRow
          label="Website"
          value={
            vendor.website ? (
              <a
                href={vendor.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                {vendor.website}
              </a>
            ) : null
          }
        />
        <InfoRow label="Description" value={vendor.description} />
      </dl>
    </InfoSection>
  )
}

// =============================================================================
// No Vendor Profile State
// =============================================================================

function NoVendorProfile() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
      <p className="text-sm font-medium text-gray-900">No vendor profile linked</p>
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
// Main Page Component
// =============================================================================

export default async function VendorApplicationDetailPage({
  params,
}: VendorApplicationDetailPageProps) {
  const { id } = await params

  const result = await getVendorApplicationDetail(id)

  // Handle error states
  if (!result.success) {
    if (result.error === 'no_vendor_profile') {
      return <NoVendorProfile />
    }
    if (result.error === 'not_found') {
      notFound()
    }
    notFound()
  }

  const application = result.data

  return (
    <div>
      {/* Back button */}
      <div className="mb-6">
        <Link
          href="/vendor-dashboard/applications"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
            />
          </svg>
          Back to Applications
        </Link>
      </div>

      {/* Page Title and Status */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Application for {application.event.name}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Submitted {formatDateTime(application.submitted_at)}
          </p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <EventInfo event={application.event} />
        <BusinessInfo vendor={application.vendor} />
      </div>

      <div className="mt-6">
        <ApplicationDetails application={application} />
      </div>

      {/* Attachments Section */}
      {application.attachments.length > 0 && (
        <div className="mt-6">
          <AttachmentsList attachments={application.attachments} />
        </div>
      )}
    </div>
  )
}
