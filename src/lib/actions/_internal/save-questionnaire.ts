// =============================================================================
// saveQuestionnaireViaRpc — the one code path from "full ordered question list"
// to `save_event_questionnaire` (migration 012). Shared by the builder's
// saveEventQuestionnaire action and the template seed so both validate and
// map errors identically. Callers own the role and draft-status checks.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { questionnaireInputSchema } from '@/lib/validations/questionnaire';
import { mapSaveQuestionnaireError } from '@/lib/questionnaire/save-errors';
import type { Database, Json } from '@/types/database';

type EventQuestion = Database['public']['Tables']['event_questions']['Row'];

export type SaveQuestionnaireResult =
  | { success: true; error: null; data: EventQuestion[] }
  | { success: false; error: string; data: null };

/**
 * `questions` is the complete questionnaire in display order; array index
 * becomes `position`. Questions without an id are assigned one here so the RPC
 * can upsert by id and the caller can correlate the returned rows.
 */
export async function saveQuestionnaireViaRpc(
  supabase: SupabaseClient<Database>,
  eventId: string,
  questions: unknown,
  seededFromTemplateId?: string
): Promise<SaveQuestionnaireResult> {
  if (!Array.isArray(questions)) {
    return { success: false, error: 'Invalid input', data: null };
  }

  const parsed = questionnaireInputSchema.safeParse({
    eventId,
    questions: questions.map((q, position) => ({ ...(q as object), position })),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      data: null,
    };
  }

  const payload = parsed.data.questions.map((q) => ({
    id: q.id ?? crypto.randomUUID(),
    type: q.type,
    label: q.label,
    help_text: q.help_text ?? null,
    required: q.required,
    options: q.options && q.options.length > 0 ? q.options : null,
    show_if: q.show_if ?? null,
  }));

  const { data, error } = await supabase.rpc('save_event_questionnaire', {
    p_event_id: eventId,
    p_questions: payload as unknown as Json,
    ...(seededFromTemplateId ? { p_seeded_from_template_id: seededFromTemplateId } : {}),
  });

  if (error) {
    console.error('[saveQuestionnaireViaRpc] save_event_questionnaire failed:', error);
    return { success: false, error: mapSaveQuestionnaireError(error), data: null };
  }

  return { success: true, error: null, data: data ?? [] };
}
