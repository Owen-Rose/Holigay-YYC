'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/roles';
import { requireDraftEvent } from '@/lib/actions/_internal/event-status';
import {
  saveQuestionnaireViaRpc,
  type SaveQuestionnaireResult,
} from '@/lib/actions/_internal/save-questionnaire';
import type { ShowIfRule } from '@/lib/questionnaire/show-if';
import type { Database, Json } from '@/types/database';

type EventQuestionnaire = Database['public']['Tables']['event_questionnaires']['Row'];
type EventQuestion = Database['public']['Tables']['event_questions']['Row'];

type GetResult =
  | {
      success: true;
      error: null;
      data: { questionnaire: EventQuestionnaire; questions: EventQuestion[] } | null;
    }
  | { success: false; error: string; data: null };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getQuestionnaire(
  supabase: SupabaseClient<Database>,
  eventId: string
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('event_questionnaires')
    .select('id')
    .eq('event_id', eventId)
    .single();
  return data;
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

/**
 * Atomic full-state save for the questionnaire builder. `questions` is the
 * complete list in display order (persisted questions carry their id; new ones
 * carry a client-assigned UUID so show-if rules can target them before the
 * first save). One RPC call: delete-missing, upsert-by-id, position = index.
 */
export async function saveEventQuestionnaire(
  eventId: string,
  questions: unknown
): Promise<SaveQuestionnaireResult> {
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized', data: null };
  }

  const supabase = await createClient();

  // Clearer message than the RPC's P0001 for the common case; the RPC re-checks
  // status and lock itself, so a publish racing this call still fails safely.
  const draft = await requireDraftEvent(supabase, eventId);
  if (!draft.success) {
    return { success: false, error: draft.error, data: null };
  }

  const result = await saveQuestionnaireViaRpc(supabase, eventId, questions);
  if (result.success) {
    revalidatePath(`/dashboard/events/${eventId}`, 'page');
  }
  return result;
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
