'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { vendorInfoSchema } from '@/lib/validations/application';
import { answerValueSchema } from '@/lib/validations/questionnaire';
import {
  buildAnswersSchema,
  coerceAnswerToJsonb,
  type AnswerValue,
} from '@/lib/questionnaire/answer-coercion';
import { evaluateShowIf, type ShowIfRule } from '@/lib/questionnaire/show-if';
import { sendEmail } from '@/lib/email/client';
import { applicationReceivedEmail } from '@/lib/email/templates';
import type { Json } from '@/types/database';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const submitDynamicApplicationSchema = z.object({
  eventId: z.string().uuid(),
  vendor: vendorInfoSchema,
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      value: answerValueSchema,
    }),
  ),
});

export type SubmitDynamicApplicationInput = z.infer<typeof submitDynamicApplicationSchema>;

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

export type SubmitDynamicApplicationResponse = {
  success: boolean;
  error: string | null;
  data: { applicationId: string } | null;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type QuestionRow = {
  id: string;
  type: string;
  required: boolean;
  options: Json;
  show_if: Json;
  position: number;
  label: string;
};

function toSnapshotEntry(ans: AnswerValue): { kind: string; value: unknown } {
  if (ans.kind === 'file') return { kind: 'file', value: undefined };
  return { kind: ans.kind, value: ans.value };
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function submitDynamicApplication(
  rawInput: unknown,
): Promise<SubmitDynamicApplicationResponse> {
  const parsed = submitDynamicApplicationSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      data: null,
    };
  }

  const { eventId, vendor, answers } = parsed.data;
  const { businessName, contactName, email, phone, website, description } = vendor;

  const supabase = await createClient();

  // Verify event is active
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name, event_date, status')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    return { success: false, error: 'Event not found', data: null };
  }
  if (event.status !== 'active') {
    return {
      success: false,
      error: 'This event is not currently accepting applications',
      data: null,
    };
  }

  // Load questionnaire — reject if none (legacy event)
  const { data: questionnaire, error: qError } = await supabase
    .from('event_questionnaires')
    .select('id')
    .eq('event_id', eventId)
    .single();

  if (qError || !questionnaire) {
    return { success: false, error: 'This event uses the legacy form', data: null };
  }

  // Load questions ordered by position
  const { data: questionData, error: questionsError } = await supabase
    .from('event_questions')
    .select('id, type, required, options, show_if, position, label')
    .eq('event_questionnaire_id', questionnaire.id)
    .order('position', { ascending: true });

  if (questionsError) {
    return { success: false, error: 'Failed to load questionnaire questions', data: null };
  }

  const questions = (questionData ?? []) as QuestionRow[];

  // Server-side schema re-validation (shape check only — required enforced below after show-if)
  const answerMap = new Map(answers.map((a) => [a.questionId, a.value]));
  const answersForSchema = Object.fromEntries(answerMap);
  const answersSchema = buildAnswersSchema(
    questions.map((q) => ({ id: q.id, type: q.type as never, required: false })),
  );
  const answersParsed = answersSchema.safeParse(answersForSchema);
  if (!answersParsed.success) {
    return {
      success: false,
      error: answersParsed.error.issues[0]?.message ?? 'Invalid answer format',
      data: null,
    };
  }

  // Evaluate show-if to determine visible question set
  type AnswerSnapshot = Record<string, { kind: string; value: unknown } | undefined>;
  const answersSoFar: AnswerSnapshot = {};
  const visibleQuestionIds = new Set<string>();

  for (const q of questions) {
    const showIfRule = (q.show_if ?? null) as ShowIfRule | null;
    if (evaluateShowIf(showIfRule, answersSoFar)) {
      visibleQuestionIds.add(q.id);
      const ans = answerMap.get(q.id);
      if (ans != null) {
        answersSoFar[q.id] = toSnapshotEntry(ans);
      }
    }
  }

  // Required check on visible questions only
  for (const q of questions) {
    if (!visibleQuestionIds.has(q.id)) continue;
    if (!q.required) continue;
    if (!answerMap.has(q.id)) {
      return {
        success: false,
        error: `Answer required for: ${q.label}`,
        data: null,
      };
    }
  }

  // Vendor upsert by email
  const { data: existingVendor, error: findError } = await supabase
    .from('vendors')
    .select('id')
    .eq('email', email)
    .single();

  if (findError && findError.code !== 'PGRST116') {
    return { success: false, error: 'Failed to check for existing vendor', data: null };
  }

  let vendorId: string;

  if (existingVendor) {
    vendorId = existingVendor.id;
    const { error: updateError } = await supabase
      .from('vendors')
      .update({
        business_name: businessName,
        contact_name: contactName,
        phone: phone || null,
        website: website || null,
        description: description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId);
    if (updateError) {
      return { success: false, error: 'Failed to update vendor information', data: null };
    }
  } else {
    const { data: newVendor, error: createError } = await supabase
      .from('vendors')
      .insert({
        business_name: businessName,
        contact_name: contactName,
        email,
        phone: phone || null,
        website: website || null,
        description: description || null,
      })
      .select('id')
      .single();
    if (createError || !newVendor) {
      return { success: false, error: 'Failed to create vendor record', data: null };
    }
    vendorId = newVendor.id;
  }

  // Reject duplicate application
  const { data: existingApp } = await supabase
    .from('applications')
    .select('id')
    .eq('vendor_id', vendorId)
    .eq('event_id', eventId)
    .single();

  if (existingApp) {
    return {
      success: false,
      error: 'You have already submitted an application for this event',
      data: null,
    };
  }

  // INSERT application (legacy columns NULL for dynamic submissions)
  const { data: application, error: appError } = await supabase
    .from('applications')
    .insert({
      vendor_id: vendorId,
      event_id: eventId,
      status: 'pending',
      booth_preference: null,
      product_categories: null,
      special_requirements: null,
    })
    .select('id')
    .single();

  if (appError || !application) {
    return { success: false, error: 'Failed to create application', data: null };
  }

  const applicationId = application.id;

  // Bulk INSERT application_answers for visible questions
  const answerRows = questions
    .filter((q) => visibleQuestionIds.has(q.id) && answerMap.has(q.id))
    .map((q) => ({
      application_id: applicationId,
      event_question_id: q.id,
      value: coerceAnswerToJsonb(answerMap.get(q.id)!) as Json,
    }));

  if (answerRows.length > 0) {
    const { error: answersError } = await supabase
      .from('application_answers')
      .insert(answerRows);
    if (answersError) {
      await supabase.from('applications').delete().eq('id', applicationId);
      return { success: false, error: 'Failed to save answers', data: null };
    }
  }

  // Send confirmation email (best-effort)
  try {
    const eventDate = new Date(event.event_date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const emailContent = applicationReceivedEmail({
      vendorName: contactName,
      businessName,
      eventName: event.name,
      eventDate,
      applicationId,
    });
    await sendEmail({
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  } catch {
    console.error('[Email] Failed to send dynamic application confirmation');
  }

  revalidatePath('/dashboard/applications');
  revalidatePath('/vendor-dashboard/applications');

  return { success: true, error: null, data: { applicationId } };
}
