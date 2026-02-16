import { getActiveEvents } from '@/lib/actions/applications';
import { ApplicationPageClient } from './client';

export const metadata = {
  title: 'Apply as a Vendor | Holigay Vendor Market',
  description:
    'Submit your vendor application to participate in upcoming Holigay Vendor Market events.',
};

export default async function ApplyPage() {
  // Fetch active events from the database
  const events = await getActiveEvents();

  // Transform events to match the form component's expected format
  const formattedEvents = events.map((event) => ({
    id: event.id,
    name: event.name,
    date: event.event_date,
  }));

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Vendor Application</h1>
        <p className="mt-2 text-muted">
          Apply to be a vendor at our upcoming market events. Fill out the form below and we&apos;ll
          review your application.
        </p>
      </div>

      {/* Application Form or No Events Message */}
      {formattedEvents.length > 0 ? (
        <div className="rounded-lg border border-border-subtle bg-surface p-6 sm:p-8">
          <ApplicationPageClient events={formattedEvents} />
        </div>
      ) : (
        <div className="rounded-lg border border-border-subtle bg-surface p-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 text-muted-foreground">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-12 w-12">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-foreground">No Events Available</h2>
          <p className="mt-2 text-muted">
            There are currently no events accepting vendor applications. Please check back later!
          </p>
        </div>
      )}
    </div>
  );
}
