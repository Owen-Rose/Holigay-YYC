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
import { mapSubmissionError, INVALID_ANSWERS_MESSAGE } from '@/lib/submission/errors';
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
    })
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
  rawInput: unknown
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

  // Load questionnaire — reject if none (legacy event).
  //
  // This is now the first database read: the event's existence and status are
  // checked inside submit_public_application (P0002 / P0001), not here. A
  // bogus event id therefore stops at this lookup with the legacy-form
  // message; unreachable from the UI, which only renders this form for events
  // that already have a questionnaire.
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

  // Reject answers for questions that are not part of this event's
  // questionnaire (research.md R11). They used to be dropped silently by the
  // visibility filter below; the RPC independently raises P0004 for them.
  const knownQuestionIds = new Set(questions.map((q) => q.id));
  for (const questionId of answerMap.keys()) {
    if (!knownQuestionIds.has(questionId)) {
      return { success: false, error: INVALID_ANSWERS_MESSAGE, data: null };
    }
  }

  const answersForSchema = Object.fromEntries(answerMap);
  const answersSchema = buildAnswersSchema(
    questions.map((q) => ({ id: q.id, type: q.type as never, required: false }))
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

  // -------------------------------------------------------------------------
  // Single transactional write (spec 006, FR-004/005/006/007)
  //
  // Vendor upsert, duplicate rejection, the application row, and every answer
  // row happen inside submit_public_application. A failure at any step rolls
  // the whole thing back, so there is no orphan cleanup to do (FR-008).
  // -------------------------------------------------------------------------
  const payload = {
    event_id: eventId,
    vendor: {
      business_name: businessName,
      contact_name: contactName,
      email,
      phone: phone || null,
      website: website || null,
      description: description || null,
    },
    legacy: null,
    answers: questions
      .filter((q) => visibleQuestionIds.has(q.id) && answerMap.has(q.id))
      .map((q) => ({
        event_question_id: q.id,
        value: coerceAnswerToJsonb(answerMap.get(q.id)!),
      })),
    attachments: null,
  };

  const { data: submission, error: submissionError } = await supabase
    .rpc('submit_public_application', { p_submission: payload as unknown as Json })
    .single();

  if (submissionError || !submission) {
    // Raw PostgREST text stays server-side; the caller gets a canned message.
    console.error('Error submitting dynamic application:', submissionError);
    return { success: false, error: mapSubmissionError(submissionError), data: null };
  }

  const applicationId = submission.application_id;

  // Send confirmation email (best-effort) from the details the RPC returned
  try {
    const eventDate = new Date(submission.event_date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const emailContent = applicationReceivedEmail({
      vendorName: contactName,
      businessName,
      eventName: submission.event_name,
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
