import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getApplicationById, type ApplicationDetail } from '@/lib/actions/applications';
import { StatusUpdateButtons } from './status-buttons';
import { OrganizerNotes } from './organizer-notes';
import { AttachmentsList } from './attachments-list';
import { Card, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';

// =============================================================================
// Types
// =============================================================================

interface ApplicationDetailPageProps {
  params: Promise<{ id: string }>;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// =============================================================================
// Info Section Component
// =============================================================================

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardTitle className="mb-4 font-semibold">{title}</CardTitle>
      {children}
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-2">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value || '—'}</dd>
    </div>
  );
}

// =============================================================================
// Vendor Info Component
// =============================================================================

function VendorInfo({ vendor }: { vendor: ApplicationDetail['vendor'] }) {
  return (
    <InfoSection title="Vendor Information">
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
  );
}

// =============================================================================
// Event Info Component
// =============================================================================

function EventInfo({ event }: { event: ApplicationDetail['event'] }) {
  return (
    <InfoSection title="Event Details">
      <dl className="divide-y divide-gray-100">
        <InfoRow label="Event Name" value={event.name} />
        <InfoRow label="Date" value={formatDate(event.event_date)} />
        <InfoRow label="Location" value={event.location} />
        <InfoRow
          label="Application Deadline"
          value={event.application_deadline ? formatDate(event.application_deadline) : null}
        />
        <InfoRow label="Max Vendors" value={event.max_vendors?.toString() || 'Unlimited'} />
      </dl>
    </InfoSection>
  );
}

// =============================================================================
// Application Details Component
// =============================================================================

function ApplicationDetails({ application }: { application: ApplicationDetail }) {
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
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default async function ApplicationDetailPage({ params }: ApplicationDetailPageProps) {
  const { id } = await params;

  const result = await getApplicationById(id);

  if (!result.success || !result.data) {
    notFound();
  }

  const application = result.data;

  return (
    <div>
      {/* Header with back button */}
      <div className="mb-6">
        <Link
          href="/dashboard/applications"
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
          <h1 className="text-2xl font-bold text-gray-900">{application.vendor.business_name}</h1>
          <p className="mt-1 text-sm text-gray-600">Application for {application.event.name}</p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      {/* Status Update Buttons */}
      <div className="mb-8">
        <StatusUpdateButtons applicationId={application.id} currentStatus={application.status} />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <VendorInfo vendor={application.vendor} />
        <EventInfo event={application.event} />
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

      {/* Organizer Notes Section */}
      <div className="mt-6">
        <OrganizerNotes
          applicationId={application.id}
          initialNotes={application.organizer_notes || ''}
        />
      </div>
    </div>
  );
}
