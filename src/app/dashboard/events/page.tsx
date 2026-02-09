import Link from 'next/link';
import { getEvents, type EventWithCount } from '@/lib/actions/events';
import { Badge } from '@/components/ui/badge';
import { EventStatusActions } from './event-status-actions';

// =============================================================================
// Event Status Badge
// =============================================================================

type EventStatus = 'draft' | 'active' | 'closed';

const eventStatusConfig: Record<EventStatus, { label: string; variant: 'default' | 'success' | 'secondary' }> = {
  draft: { label: 'Draft', variant: 'default' },
  active: { label: 'Active', variant: 'success' },
  closed: { label: 'Closed', variant: 'secondary' },
};

function EventStatusBadge({ status }: { status: string }) {
  const config = eventStatusConfig[status as EventStatus] || {
    label: status,
    variant: 'default' as const,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
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
// Icons
// =============================================================================

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
      />
    </svg>
  );
}

// =============================================================================
// Empty State
// =============================================================================

function EmptyState() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <CalendarIcon className="h-6 w-6 text-gray-400" />
      </div>
      <h3 className="mt-4 text-sm font-medium text-gray-900">No events yet</h3>
      <p className="mt-1 text-sm text-gray-500">
        Get started by creating your first market event.
      </p>
      <div className="mt-6">
        <Link
          href="/dashboard/events/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
        >
          <PlusIcon className="h-4 w-4" />
          Create Event
        </Link>
      </div>
    </div>
  );
}

// =============================================================================
// Event Row
// =============================================================================

function EventRow({ event }: { event: EventWithCount }) {
  const isPastDeadline =
    event.application_deadline && new Date(event.application_deadline) < new Date();

  return (
    <Link
      href={`/dashboard/events/${event.id}`}
      className="block px-6 py-4 hover:bg-gray-50"
    >
      <div className="grid grid-cols-12 items-center gap-4">
        {/* Name and location */}
        <div className="col-span-12 sm:col-span-3">
          <p className="truncate text-sm font-medium text-gray-900">{event.name}</p>
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <MapPinIcon className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        </div>

        {/* Event date */}
        <div className="col-span-4 sm:col-span-2">
          <p className="text-sm text-gray-900">{formatDate(event.event_date)}</p>
        </div>

        {/* Deadline */}
        <div className="col-span-4 sm:col-span-2">
          {event.application_deadline ? (
            <p className={`text-sm ${isPastDeadline ? 'text-red-600' : 'text-gray-500'}`}>
              {formatDate(event.application_deadline)}
            </p>
          ) : (
            <p className="text-sm text-gray-400">No deadline</p>
          )}
        </div>

        {/* Status */}
        <div className="col-span-2 sm:col-span-1">
          <EventStatusBadge status={event.status} />
        </div>

        {/* Application count */}
        <div className="col-span-2 sm:col-span-2 text-right">
          <span className="text-sm font-medium text-gray-900">{event.application_count}</span>
          <span className="ml-1 text-sm text-gray-500">
            {event.application_count === 1 ? 'app' : 'apps'}
          </span>
        </div>

        {/* Status actions */}
        <div className="col-span-4 sm:col-span-2 text-right">
          <EventStatusActions eventId={event.id} status={event.status} />
        </div>
      </div>
    </Link>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default async function EventsPage() {
  const result = await getEvents();

  // Handle error state
  if (!result.success || !result.data) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Events</h1>
          <p className="mt-1 text-sm text-gray-600">Create and manage your market events.</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">
            {result.error || 'Failed to load events. Please try again.'}
          </p>
        </div>
      </div>
    );
  }

  const events = result.data;

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Events</h1>
          <p className="mt-1 text-sm text-gray-600">Create and manage your market events.</p>
        </div>
        <div className="flex-shrink-0">
          <Link
            href="/dashboard/events/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
          >
            <PlusIcon className="h-4 w-4" />
            Create Event
          </Link>
        </div>
      </div>

      {/* Events List */}
      {events.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {/* Table Header */}
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
            <div className="grid grid-cols-12 gap-4 text-xs font-medium uppercase tracking-wider text-gray-500">
              <div className="col-span-12 sm:col-span-3">Event</div>
              <div className="col-span-4 sm:col-span-2">Date</div>
              <div className="col-span-4 sm:col-span-2">Deadline</div>
              <div className="col-span-2 sm:col-span-1">Status</div>
              <div className="col-span-2 sm:col-span-2 text-right">Applications</div>
              <div className="col-span-4 sm:col-span-2 text-right">Actions</div>
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-gray-100">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
