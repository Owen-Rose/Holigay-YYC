'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/roles';
import { requireDraftEvent } from '@/lib/actions/_internal/event-status';
import { templateInputSchema } from '@/lib/validations/questionnaire';
import type { ShowIfRule } from '@/lib/questionnaire/show-if';
import type { Database, Json } from '@/types/database';

type TemplateRow = Database['public']['Tables']['questionnaire_templates']['Row'];
type TemplateQuestionRow = Database['public']['Tables']['template_questions']['Row'];
type UsersWithRolesRow = Database['public']['Views']['users_with_roles']['Row'];

// ---------------------------------------------------------------------------
// Schemas (not exported — internal to this file)
// ---------------------------------------------------------------------------

const updateTemplateSchema = templateInputSchema.and(z.object({ id: z.string().uuid() }));

const seedSchema = z.object({
  eventId: z.string().uuid(),
  templateId: z.string().uuid(),
  replaceExisting: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toJson<T>(value: T | null | undefined): Json | null {
  if (value == null) return null;
  return value as unknown as Json;
}

function remapShowIf(showIf: ShowIfRule | null, oldToNew: Map<string, string>): ShowIfRule | null {
  if (!showIf) return null;
  return { ...showIf, questionId: oldToNew.get(showIf.questionId) ?? showIf.questionId };
}

// ---------------------------------------------------------------------------
// listTemplates
// ---------------------------------------------------------------------------

type TemplateWithQuestions = TemplateRow & { template_questions: { id: string }[] };

type ListTemplateItem = {
  id: string;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
  questionCount: number;
};

export async function listTemplates(): Promise<{
  success: boolean;
  error: string | null;
  data: ListTemplateItem[] | null;
}> {
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized', data: null };
  }

  const supabase = await createClient();

  const { data: templates, error } = await supabase
    .from('questionnaire_templates')
    .select('id, name, description, created_by, created_at, updated_at, template_questions(id)')
    .order('created_at', { ascending: false })
    .returns<TemplateWithQuestions[]>();

  if (error) {
    return { success: false, error: 'Failed to load templates', data: null };
  }

  const creatorIds = [
    ...new Set(
      (templates ?? [])
        .map((t) => t.created_by)
        .filter((id): id is string => id !== null),
    ),
  ];

  const emailMap = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: users } = await supabase
      .from('users_with_roles' as 'user_profiles')
      .select('id, email')
      .in('id', creatorIds)
      .returns<UsersWithRolesRow[]>();
    (users ?? []).forEach((u) => {
      if (u.id && u.email) emailMap.set(u.id, u.email);
    });
  }

  const data = (templates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    createdBy: t.created_by,
    createdByEmail: t.created_by ? (emailMap.get(t.created_by) ?? null) : null,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    questionCount: (t.template_questions ?? []).length,
  }));

  return { success: true, error: null, data };
}

// ---------------------------------------------------------------------------
// getTemplate
// ---------------------------------------------------------------------------

export async function getTemplate(id: string): Promise<{
  success: boolean;
  error: string | null;
  data: { template: TemplateRow; questions: TemplateQuestionRow[] } | null;
}> {
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized', data: null };
  }

  const supabase = await createClient();

  const { data: template, error: tError } = await supabase
    .from('questionnaire_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (tError) {
    if (tError.code === 'PGRST116') {
      return { success: true, error: null, data: null };
    }
    return { success: false, error: 'Failed to load template', data: null };
  }

  const { data: questions, error: qError } = await supabase
    .from('template_questions')
    .select('*')
    .eq('template_id', id)
    .order('position', { ascending: true });

  if (qError) {
    return { success: false, error: 'Failed to load template questions', data: null };
  }

  return { success: true, error: null, data: { template, questions: questions ?? [] } };
}

// ---------------------------------------------------------------------------
// createTemplate
// ---------------------------------------------------------------------------

export async function createTemplate(input: unknown): Promise<{
  success: boolean;
  error: string | null;
  data: { id: string } | null;
}> {
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized', data: null };
  }

  const parsed = templateInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      data: null,
    };
  }

  const supabase = await createClient();

  // Normalise question IDs — callers may pre-generate UUIDs for show_if references
  const questionsWithIds = parsed.data.questions.map((q) => ({
    ...q,
    id: q.id ?? crypto.randomUUID(),
  }));

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

  if (questionsWithIds.length > 0) {
    const rows = questionsWithIds.map((q, i) => ({
      id: q.id,
      template_id: tmpl.id,
      position: i,
      type: q.type,
      label: q.label,
      help_text: q.help_text ?? null,
      required: q.required,
      options: toJson(q.options),
      show_if: toJson(q.show_if),
    }));

    const { error: qInsertError } = await supabase.from('template_questions').insert(rows);
    if (qInsertError) {
      return { success: false, error: 'Failed to save template questions', data: null };
    }
  }

  revalidatePath('/dashboard/templates');
  return { success: true, error: null, data: { id: tmpl.id } };
}

// ---------------------------------------------------------------------------
// updateTemplate
// ---------------------------------------------------------------------------

export async function updateTemplate(input: unknown): Promise<{
  success: boolean;
  error: string | null;
  data: { id: string } | null;
}> {
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized', data: null };
  }

  const parsed = updateTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      data: null,
    };
  }

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from('questionnaire_templates')
    .update({ name: parsed.data.name, description: parsed.data.description ?? null })
    .eq('id', parsed.data.id)
    .select('id');

  if (updateError) {
    return { success: false, error: 'Failed to update template', data: null };
  }
  if (!updated || updated.length === 0) {
    return { success: false, error: 'Template not found or access denied', data: null };
  }

  const { error: deleteError } = await supabase
    .from('template_questions')
    .delete()
    .eq('template_id', parsed.data.id);

  if (deleteError) {
    return { success: false, error: 'Failed to replace template questions', data: null };
  }

  const questionsWithIds = parsed.data.questions.map((q) => ({
    ...q,
    id: q.id ?? crypto.randomUUID(),
  }));

  if (questionsWithIds.length > 0) {
    const rows = questionsWithIds.map((q, i) => ({
      id: q.id,
      template_id: parsed.data.id,
      position: i,
      type: q.type,
      label: q.label,
      help_text: q.help_text ?? null,
      required: q.required,
      options: toJson(q.options),
      show_if: toJson(q.show_if),
    }));

    const { error: qInsertError } = await supabase.from('template_questions').insert(rows);
    if (qInsertError) {
      return { success: false, error: 'Failed to save template questions', data: null };
    }
  }

  revalidatePath('/dashboard/templates');
  revalidatePath('/dashboard/templates/[id]', 'page');
  return { success: true, error: null, data: { id: parsed.data.id } };
}

// ---------------------------------------------------------------------------
// deleteTemplate
// ---------------------------------------------------------------------------

export async function deleteTemplate(id: string): Promise<{
  success: boolean;
  error: string | null;
  data: null;
}> {
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized', data: null };
  }

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from('questionnaire_templates')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return { success: false, error: 'Failed to delete template', data: null };
  }

  revalidatePath('/dashboard/templates');
  return { success: true, error: null, data: null };
}

// ---------------------------------------------------------------------------
// seedEventQuestionnaireFromTemplate
// ---------------------------------------------------------------------------

export async function seedEventQuestionnaireFromTemplate(input: unknown): Promise<{
  success: boolean;
  error: string | null;
  data: { eventQuestionnaireId: string; questionsCount: number } | null;
}> {
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized', data: null };
  }

  const parsed = seedSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      data: null,
    };
  }

  const supabase = await createClient();

  const draft = await requireDraftEvent(supabase, parsed.data.eventId);
  if (!draft.success) {
    return { success: false, error: draft.error, data: null };
  }

  const { data: questionnaire, error: qError } = await supabase
    .from('event_questionnaires')
    .select('id')
    .eq('event_id', parsed.data.eventId)
    .single();

  if (qError || !questionnaire) {
    return { success: false, error: 'Questionnaire not found for event', data: null };
  }

  const { data: templateQuestions, error: tqError } = await supabase
    .from('template_questions')
    .select('*')
    .eq('template_id', parsed.data.templateId)
    .order('position', { ascending: true });

  if (tqError) {
    return { success: false, error: 'Failed to load template questions', data: null };
  }

  const questions = templateQuestions ?? [];

  if (parsed.data.replaceExisting) {
    const { error: delError } = await supabase
      .from('event_questions')
      .delete()
      .eq('event_questionnaire_id', questionnaire.id);
    if (delError) {
      return { success: false, error: 'Failed to clear existing questions', data: null };
    }
  }

  let startPosition = 0;
  if (!parsed.data.replaceExisting) {
    const { data: existing } = await supabase
      .from('event_questions')
      .select('position')
      .eq('event_questionnaire_id', questionnaire.id)
      .order('position', { ascending: false })
      .limit(1);
    startPosition = existing?.length ? existing[0].position + 1 : 0;
  }

  if (questions.length > 0) {
    const newIds = questions.map(() => crypto.randomUUID());
    const oldToNew = new Map<string, string>();
    questions.forEach((tq, i) => oldToNew.set(tq.id, newIds[i]));

    const rows = questions.map((tq, i) => ({
      id: newIds[i],
      event_questionnaire_id: questionnaire.id,
      position: startPosition + i,
      type: tq.type,
      label: tq.label,
      help_text: tq.help_text,
      required: tq.required,
      options: tq.options,
      show_if: toJson(remapShowIf(tq.show_if as ShowIfRule | null, oldToNew)),
    }));

    const { error: insertError } = await supabase.from('event_questions').insert(rows);
    if (insertError) {
      return { success: false, error: 'Failed to seed questions from template', data: null };
    }
  }

  // Best-effort: RLS has no UPDATE policy on event_questionnaires; this is informational only.
  await supabase
    .from('event_questionnaires')
    .update({ seeded_from_template_id: parsed.data.templateId })
    .eq('id', questionnaire.id);

  revalidatePath(`/dashboard/events/${parsed.data.eventId}`, 'page');
  return {
    success: true,
    error: null,
    data: { eventQuestionnaireId: questionnaire.id, questionsCount: questions.length },
  };
}
