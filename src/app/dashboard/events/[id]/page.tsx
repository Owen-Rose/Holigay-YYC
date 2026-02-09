import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getEventById } from '@/lib/actions/events'
import { EditEventForm } from './edit-event-form'

// =============================================================================
// Types
// =============================================================================

interface EditEventPageProps {
  params: Promise<{ id: string }>
}

// =============================================================================
// Main Page
// =============================================================================

export default async function EditEventPage({ params }: EditEventPageProps) {
  const { id } = await params

  const result = await getEventById(id)

  if (!result.success || !result.data) {
    notFound()
  }

  const event = result.data

  // Map database fields (snake_case) to form fields (camelCase)
  const defaultValues = {
    name: event.name,
    description: event.description ?? '',
    eventDate: event.event_date,
    location: event.location,
    applicationDeadline: event.application_deadline ?? '',
    status: event.status as 'draft' | 'active' | 'closed',
    maxVendors: event.max_vendors?.toString() ?? '',
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/events"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Events
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Event</h1>
        <p className="mt-1 text-sm text-gray-600">
          Update the details for <span className="font-medium">{event.name}</span>.
        </p>
      </div>

      {/* Event Form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <EditEventForm eventId={id} defaultValues={defaultValues} />
      </div>
    </div>
  )
}
