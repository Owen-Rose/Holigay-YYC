import Link from 'next/link';
import { getActiveEvents } from '@/lib/actions/applications';
import { getEventQuestionnaire } from '@/lib/actions/questionnaires';
import { ApplicationPageClient } from './client';
import { DynamicApplicationForm } from './_components/dynamic-application-form';

export const metadata = {
  title: 'Apply as a Vendor | Holigay Vendor Market',
  description:
    'Submit your vendor application to participate in upcoming Holigay Vendor Market events.',
};

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ event_id?: string }>;
}) {
  const { event_id } = await searchParams;
  const events = await getActiveEvents();

  const formattedEvents = events.map((event) => ({
    id: event.id,
    name: event.name,
    date: event.event_date,
  }));

  const pageHeader = (
    <div className="mb-8">
      <h1 className="text-foreground text-3xl font-bold">Vendor Application</h1>
      <p className="text-muted mt-2">
        Apply to be a vendor at our upcoming market events. Fill out the form below and we&apos;ll
        review your application.
      </p>
    </div>
  );

  const noEventsMessage = (
    <div className="border-border-subtle bg-surface rounded-lg border p-8 text-center">
      <div className="text-muted-foreground mx-auto mb-4 h-12 w-12">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-12 w-12">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
      <h2 className="text-foreground text-xl font-semibold">No Events Available</h2>
      <p className="text-muted mt-2">
        There are currently no events accepting vendor applications. Please check back later!
      </p>
    </div>
  );

  // -------------------------------------------------------------------------
  // Event selected via URL param — branch on questionnaire presence
  // -------------------------------------------------------------------------
  if (event_id) {
    const selectedEvent = formattedEvents.find((e) => e.id === event_id);

    if (!selectedEvent) {
      return (
        <div>
          {pageHeader}
          <div className="border-border-subtle bg-surface rounded-lg border p-6 sm:p-8">
            <p className="text-muted text-center">
              Event not found.{' '}
              <Link href="/apply" className="text-primary underline">
                Browse available events
              </Link>
            </p>
          </div>
        </div>
      );
    }

    const questionnaireResult = await getEventQuestionnaire(event_id);
    const hasQuestionnaire =
      questionnaireResult.success && questionnaireResult.data !== null;

    return (
      <div>
        {pageHeader}
        <div className="border-border-subtle bg-surface rounded-lg border p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <Link href="/apply" className="text-primary text-sm hover:underline">
              ← Back to events
            </Link>
            <span className="text-muted">·</span>
            <span className="text-foreground font-medium">{selectedEvent.name}</span>
          </div>

          {hasQuestionnaire ? (
            <DynamicApplicationForm
              eventId={event_id}
              eventName={selectedEvent.name}
              questions={questionnaireResult.data!.questions}
            />
          ) : (
            <ApplicationPageClient events={[selectedEvent]} />
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // No event selected — show event picker
  // -------------------------------------------------------------------------
  return (
    <div>
      {pageHeader}

      {formattedEvents.length > 0 ? (
        <div className="space-y-4">
          {formattedEvents.map((event) => (
            <div
              key={event.id}
              className="border-border-subtle bg-surface flex items-center justify-between rounded-lg border p-5"
            >
              <div>
                <h2 className="text-foreground font-semibold">{event.name}</h2>
                <p className="text-muted mt-0.5 text-sm">
                  {new Date(event.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <Link
                href={`/apply?event_id=${event.id}`}
                className="bg-primary text-primary-foreground hover:bg-primary-hover focus:ring-primary/50 focus:ring-offset-background rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none"
              >
                Apply
              </Link>
            </div>
          ))}
        </div>
      ) : (
        noEventsMessage
      )}
    </div>
  );
}
