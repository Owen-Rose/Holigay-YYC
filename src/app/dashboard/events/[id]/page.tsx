import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEventById } from '@/lib/actions/events';
import { getEventQuestionnaire } from '@/lib/actions/questionnaires';
import { listTemplates } from '@/lib/actions/templates';
import { createClient } from '@/lib/supabase/server';
import { EditEventForm } from './edit-event-form';
import { QuestionnaireBuilder } from './questionnaire-builder';
import { SaveAsTemplateButton } from './save-as-template-button';

// =============================================================================
// Types
// =============================================================================

interface EditEventPageProps {
  params: Promise<{ id: string }>;
}

// =============================================================================
// Main Page
// =============================================================================

export default async function EditEventPage({ params }: EditEventPageProps) {
  const { id } = await params;

  const [result, questionnaireResult, templatesResult] = await Promise.all([
    getEventById(id),
    getEventQuestionnaire(id),
    listTemplates(),
  ]);

  if (!result.success || !result.data) {
    notFound();
  }

  const event = result.data;
  const initialQuestions = questionnaireResult.data?.questions ?? [];
  const isLocked = !!questionnaireResult.data?.questionnaire.locked_at;

  let hasAnswers = false;
  if (initialQuestions.length > 0) {
    const supabase = await createClient();
    const { count } = await supabase
      .from('application_answers')
      .select('id', { count: 'exact', head: true })
      .in('event_question_id', initialQuestions.map((q) => q.id));
    hasAnswers = (count ?? 0) > 0;
  }

  const templates = (templatesResult.data ?? []).map((t) => ({ id: t.id, name: t.name }));

  // Map database fields (snake_case) to form fields (camelCase)
  const defaultValues = {
    name: event.name,
    description: event.description ?? '',
    eventDate: event.event_date,
    location: event.location,
    applicationDeadline: event.application_deadline ?? '',
    status: event.status as 'draft' | 'active' | 'closed',
    maxVendors: event.max_vendors?.toString() ?? '',
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/events"
          className="text-muted hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
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
          Back to Events
        </Link>
        <h1 className="text-foreground text-2xl font-bold">Edit Event</h1>
        <p className="text-muted mt-1 text-sm">
          Update the details for <span className="font-medium">{event.name}</span>.
        </p>
      </div>

      {/* Event Form */}
      <div className="border-border-subtle bg-surface rounded-lg border p-6">
        <EditEventForm eventId={id} defaultValues={defaultValues} />
      </div>

      {/* Questionnaire Builder */}
      <div className="border-border-subtle bg-surface mt-6 rounded-lg border p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-foreground text-lg font-semibold">Questionnaire</h2>
            <p className="text-muted mt-1 text-sm">
              Questions vendors will answer when applying to this event.
            </p>
          </div>
          {!isLocked && <SaveAsTemplateButton eventId={id} />}
        </div>
        <QuestionnaireBuilder
          key={initialQuestions.map((q) => q.id).join(',')}
          eventId={id}
          initialQuestions={initialQuestions}
          isLocked={isLocked}
          templates={templates}
          hasAnswers={hasAnswers}
        />
      </div>
    </div>
  );
}
