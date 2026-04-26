'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/roles';
import { requireDraftEvent } from '@/lib/actions/_internal/event-status';
import { questionInputSchema } from '@/lib/validations/questionnaire';
import { validateShowIfRules, type ShowIfRule } from '@/lib/questionnaire/show-if';
import type { Database, Json } from '@/types/database';

type EventQuestionnaire = Database['public']['Tables']['event_questionnaires']['Row'];
type EventQuestion = Database['public']['Tables']['event_questions']['Row'];
type QuestionForValidation = {
  id: string;
  position: number;
  type: EventQuestion['type'];
  options: { key: string }[] | null;
  show_if: ShowIfRule | null;
};

type GetResult =
  | { success: true; error: null; data: { questionnaire: EventQuestionnaire; questions: EventQuestion[] } | null }
  | { success: false; error: string; data: null };

type QuestionResult =
  | { success: true; error: null; data: EventQuestion }
  | { success: false; error: string; data: null };

type VoidResult =
  | { success: true; error: null; data: null }
  | { success: false; error: string; data: null };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getQuestionnaire(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('event_questionnaires')
    .select('id')
    .eq('event_id', eventId)
    .single();
  return data;
}

async function getAllQuestions(
  supabase: SupabaseClient<Database>,
  questionnaireId: string,
): Promise<QuestionForValidation[]> {
  const { data } = await supabase
    .from('event_questions')
    .select('id, position, type, options, show_if')
    .eq('event_questionnaire_id', questionnaireId)
    .order('position', { ascending: true });
  return (data ?? []).map((q) => ({
    id: q.id,
    position: q.position,
    type: q.type,
    options: (q.options as { key: string }[] | null) ?? null,
    show_if: (q.show_if as ShowIfRule | null) ?? null,
  }));
}

// Two-step position update to avoid unique-constraint violations.
// Step A sets temporary negative positions; Step B sets final positions.
async function twoStepPositionUpdate(
  supabase: SupabaseClient<Database>,
  entries: Array<{ id: string; targetPosition: number }>,
): Promise<boolean> {
  for (let i = 0; i < entries.length; i++) {
    const { error } = await supabase
      .from('event_questions')
      .update({ position: -(i + 1) })
      .eq('id', entries[i].id);
    if (error) return false;
  }
  for (const entry of entries) {
    const { error } = await supabase
      .from('event_questions')
      .update({ position: entry.targetPosition })
      .eq('id', entry.id);
    if (error) return false;
  }
  return true;
}

function toJson<T>(value: T | null | undefined): Json | null {
  if (value == null) return null;
  return value as unknown as Json;
}

// ---------------------------------------------------------------------------
// Exported actions
// ---------------------------------------------------------------------------

export async function getEventQuestionnaire(eventId: string): Promise<GetResult> {
  const supabase = await createClient();

  const { data: questionnaire, error: qError } = await supabase
    .from('event_questionnaires')
    .select('*')
    .eq('event_id', eventId)
    .single();

  if (qError) {
    if (qError.code === 'PGRST116') {
      return { success: true, error: null, data: null };
    }
    return { success: false, error: 'Failed to load questionnaire', data: null };
  }

  const { data: questions, error: qsError } = await supabase
    .from('event_questions')
    .select('*')
    .eq('event_questionnaire_id', questionnaire.id)
    .order('position', { ascending: true });

  if (qsError) {
    return { success: false, error: 'Failed to load questions', data: null };
  }

  return { success: true, error: null, data: { questionnaire, questions: questions ?? [] } };
}

export async function addEventQuestion(
  eventId: string,
  input: unknown,
): Promise<QuestionResult> {
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized', data: null };
  }

  const supabase = await createClient();

  const draft = await requireDraftEvent(supabase, eventId);
  if (!draft.success) {
    return { success: false, error: draft.error, data: null };
  }

  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input', data: null };
  }

  const questionnaire = await getQuestionnaire(supabase, eventId);
  if (!questionnaire) {
    return { success: false, error: 'Questionnaire not found for event', data: null };
  }

  const { data: last } = await supabase
    .from('event_questions')
    .select('position')
    .eq('event_questionnaire_id', questionnaire.id)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = last?.length ? last[0].position + 1 : 1;

  const { data: newQuestion, error: insertError } = await supabase
    .from('event_questions')
    .insert({
      event_questionnaire_id: questionnaire.id,
      type: parsed.data.type,
      label: parsed.data.label,
      help_text: parsed.data.help_text ?? null,
      required: parsed.data.required,
      options: toJson(parsed.data.options),
      show_if: toJson(parsed.data.show_if),
      position: nextPosition,
    })
    .select()
    .single();

  if (insertError || !newQuestion) {
    return { success: false, error: 'Failed to add question', data: null };
  }

  const allQuestions = await getAllQuestions(supabase, questionnaire.id);
  const validation = validateShowIfRules(allQuestions);
  if (!validation.ok) {
    await supabase.from('event_questions').delete().eq('id', newQuestion.id);
    return { success: false, error: validation.errors[0]?.message ?? 'Show-if validation failed', data: null };
  }

  revalidatePath(`/dashboard/events/${eventId}`, 'page');
  return { success: true, error: null, data: newQuestion };
}

export async function updateEventQuestion(
  eventId: string,
  questionId: string,
  input: unknown,
): Promise<QuestionResult> {
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized', data: null };
  }

  const supabase = await createClient();

  const draft = await requireDraftEvent(supabase, eventId);
  if (!draft.success) {
    return { success: false, error: draft.error, data: null };
  }

  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input', data: null };
  }

  const questionnaire = await getQuestionnaire(supabase, eventId);
  if (!questionnaire) {
    return { success: false, error: 'Questionnaire not found for event', data: null };
  }

  const { data: existing } = await supabase
    .from('event_questions')
    .select('*')
    .eq('id', questionId)
    .eq('event_questionnaire_id', questionnaire.id)
    .single();

  if (!existing) {
    return { success: false, error: 'Question not found', data: null };
  }

  const { data: updated, error: updateError } = await supabase
    .from('event_questions')
    .update({
      type: parsed.data.type,
      label: parsed.data.label,
      help_text: parsed.data.help_text ?? null,
      required: parsed.data.required,
      options: toJson(parsed.data.options),
      show_if: toJson(parsed.data.show_if),
    })
    .eq('id', questionId)
    .select()
    .single();

  if (updateError || !updated) {
    return { success: false, error: 'Failed to update question', data: null };
  }

  const allQuestions = await getAllQuestions(supabase, questionnaire.id);
  const validation = validateShowIfRules(allQuestions);
  if (!validation.ok) {
    await supabase
      .from('event_questions')
      .update({
        type: existing.type,
        label: existing.label,
        help_text: existing.help_text,
        required: existing.required,
        options: existing.options,
        show_if: existing.show_if,
      })
      .eq('id', questionId);
    return { success: false, error: validation.errors[0]?.message ?? 'Show-if validation failed', data: null };
  }

  revalidatePath(`/dashboard/events/${eventId}`, 'page');
  return { success: true, error: null, data: updated };
}

export async function deleteEventQuestion(
  eventId: string,
  questionId: string,
): Promise<VoidResult> {
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized', data: null };
  }

  const supabase = await createClient();

  const draft = await requireDraftEvent(supabase, eventId);
  if (!draft.success) {
    return { success: false, error: draft.error, data: null };
  }

  const questionnaire = await getQuestionnaire(supabase, eventId);
  if (!questionnaire) {
    return { success: false, error: 'Questionnaire not found for event', data: null };
  }

  const { data: allQuestions } = await supabase
    .from('event_questions')
    .select('id, label, show_if')
    .eq('event_questionnaire_id', questionnaire.id);

  const dependent = allQuestions?.find(
    (q) => q.id !== questionId && (q.show_if as ShowIfRule | null)?.questionId === questionId,
  );
  if (dependent) {
    return {
      success: false,
      error: `Cannot delete: "${dependent.label}" has a show-if rule referencing this question`,
      data: null,
    };
  }

  const { error: deleteError } = await supabase
    .from('event_questions')
    .delete()
    .eq('id', questionId)
    .eq('event_questionnaire_id', questionnaire.id);

  if (deleteError) {
    return { success: false, error: 'Failed to delete question', data: null };
  }

  revalidatePath(`/dashboard/events/${eventId}`, 'page');
  return { success: true, error: null, data: null };
}

export async function reorderEventQuestions(
  eventId: string,
  questionIds: string[],
): Promise<VoidResult> {
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized', data: null };
  }

  const supabase = await createClient();

  const draft = await requireDraftEvent(supabase, eventId);
  if (!draft.success) {
    return { success: false, error: draft.error, data: null };
  }

  const questionnaire = await getQuestionnaire(supabase, eventId);
  if (!questionnaire) {
    return { success: false, error: 'Questionnaire not found for event', data: null };
  }

  const currentQuestions = await getAllQuestions(supabase, questionnaire.id);

  const currentIds = new Set(currentQuestions.map((q) => q.id));
  if (
    currentIds.size !== questionIds.length ||
    questionIds.some((id) => !currentIds.has(id))
  ) {
    return { success: false, error: 'Question IDs do not match the current questionnaire', data: null };
  }

  const forward = questionIds.map((id, i) => ({ id, targetPosition: i + 1 }));
  const ok = await twoStepPositionUpdate(supabase, forward);
  if (!ok) {
    return { success: false, error: 'Failed to reorder questions', data: null };
  }

  const reordered = await getAllQuestions(supabase, questionnaire.id);
  const validation = validateShowIfRules(reordered);
  if (!validation.ok) {
    const rollback = currentQuestions.map((q) => ({ id: q.id, targetPosition: q.position }));
    await twoStepPositionUpdate(supabase, rollback);
    return { success: false, error: validation.errors[0]?.message ?? 'Show-if validation failed after reorder', data: null };
  }

  revalidatePath(`/dashboard/events/${eventId}`, 'page');
  return { success: true, error: null, data: null };
}

// ---------------------------------------------------------------------------
// saveEventQuestionnaireAsTemplate
// ---------------------------------------------------------------------------

const saveAsTemplateSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
});

export async function saveEventQuestionnaireAsTemplate(input: unknown): Promise<{
  success: boolean;
  error: string | null;
  data: { id: string } | null;
}> {
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized', data: null };
  }

  const parsed = saveAsTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      data: null,
    };
  }

  const supabase = await createClient();

  const questionnaire = await getQuestionnaire(supabase, parsed.data.eventId);
  if (!questionnaire) {
    return { success: false, error: 'Questionnaire not found for event', data: null };
  }

  const { data: eventQuestions, error: eqError } = await supabase
    .from('event_questions')
    .select('*')
    .eq('event_questionnaire_id', questionnaire.id)
    .order('position', { ascending: true });

  if (eqError) {
    return { success: false, error: 'Failed to load event questions', data: null };
  }

  const questions = eventQuestions ?? [];
  const newIds = questions.map(() => crypto.randomUUID());
  const oldToNew = new Map<string, string>();
  questions.forEach((eq, i) => oldToNew.set(eq.id, newIds[i]));

  const { data: tmpl, error: insertError } = await supabase
    .from('questionnaire_templates')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      created_by: auth.data!.userId,
    })
    .select('id')
    .single();

  if (insertError || !tmpl) {
    return { success: false, error: 'Failed to create template', data: null };
  }

  if (questions.length > 0) {
    const rows = questions.map((eq, i) => {
      const oldShowIf = eq.show_if as ShowIfRule | null;
      const remapped = oldShowIf
        ? { ...oldShowIf, questionId: oldToNew.get(oldShowIf.questionId) ?? oldShowIf.questionId }
        : null;
      return {
        id: newIds[i],
        template_id: tmpl.id,
        position: i,
        type: eq.type,
        label: eq.label,
        help_text: eq.help_text,
        required: eq.required,
        options: eq.options,
        show_if: toJson(remapped),
      };
    });

    const { error: qInsertError } = await supabase.from('template_questions').insert(rows);
    if (qInsertError) {
      return { success: false, error: 'Failed to save template questions', data: null };
    }
  }

  revalidatePath('/dashboard/templates');
  return { success: true, error: null, data: { id: tmpl.id } };
}
