// =============================================================================
// Q1–Q16 — save_event_questionnaire posture and atomicity (spec 005, T053)
//
// The builder and the template seed both write through this one SECURITY
// DEFINER RPC (migration 012). SECURITY DEFINER bypasses the `status='draft'`
// RLS gates on event_questions, so everything RLS used to enforce — role,
// draft status, lock, row ownership — must be re-proven here against a real
// database. Q5 is the reason the RPC exists: a failure mid-batch must leave
// every row exactly as it was.
//
// Sign-ins: organizer + vendor = 2 ([auth.rate_limit] sign_in_sign_ups 30/5min).
// Tests in this file run in order and share the draft event's state.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  stackUp,
  anonClient,
  serviceClient,
  createAuthedOrganizer,
  createAuthedVendor,
  seedFixtures,
  cleanupFixtures,
  type AuthedUser,
  type SecurityFixtures,
} from './harness';
import type { Database, Json } from '@/types/database';

type Client = ReturnType<typeof anonClient>;
type QuestionRow = Database['public']['Tables']['event_questions']['Row'];

const RLS_DENIED = '42501';
const NOT_DRAFT_OR_LOCKED = 'P0001';
const NOT_FOUND = 'P0002';
const INVALID_PAYLOAD = 'P0004';
const FK_RESTRICT = '23503';
const CHECK_VIOLATION = '23514';
const NONEXISTENT_UUID = '00000000-0000-4000-8000-000000000000';

type QuestionPayload = {
  id: string;
  type: Database['public']['Enums']['question_type'];
  label: string;
  help_text?: string | null;
  required?: boolean;
  options?: Array<{ key: string; label: string }> | null;
  show_if?: { questionId: string; operator: 'equals'; value: string } | null;
};

function save(
  client: Client,
  eventId: string,
  questions: QuestionPayload[],
  seededFromTemplateId?: string
) {
  return client.rpc('save_event_questionnaire', {
    p_event_id: eventId,
    p_questions: questions as unknown as Json,
    ...(seededFromTemplateId ? { p_seeded_from_template_id: seededFromTemplateId } : {}),
  });
}

/** Stable projection for before/after deep-equality (Q5, Q7, Q9, Q11). */
function snapshot(rows: QuestionRow[]) {
  return rows
    .map((r) => ({
      id: r.id,
      position: r.position,
      type: r.type,
      label: r.label,
      help_text: r.help_text,
      required: r.required,
      options: r.options,
      show_if: r.show_if,
    }))
    .sort((a, b) => a.position - b.position);
}

describe.runIf(stackUp)('save_event_questionnaire', () => {
  let fx: SecurityFixtures;
  let organizer: AuthedUser;
  let vendor: AuthedUser;
  const anon = anonClient();
  const service = serviceClient();

  // Ids for the draft event's questions; assigned client-side as the builder does.
  const A_ID = crypto.randomUUID(); // yes_no
  const B_ID = crypto.randomUUID(); // short_text — dropped in Q4
  const C_ID = crypto.randomUUID(); // short_text, show_if → A
  const D_ID = crypto.randomUUID(); // added in Q4

  const A: QuestionPayload = { id: A_ID, type: 'yes_no', label: 'Need power?' };
  const B: QuestionPayload = { id: B_ID, type: 'short_text', label: 'Booth name' };
  const C: QuestionPayload = {
    id: C_ID,
    type: 'short_text',
    label: 'Which appliances?',
    show_if: { questionId: A_ID, operator: 'equals', value: 'true' },
  };
  const D: QuestionPayload = { id: D_ID, type: 'long_text', label: 'Anything else?' };

  // Q11/Q12: a draft event that already carries an answer (service-seeded —
  // impossible through the app since answers need an active event).
  let answeredEventId: string;
  let answeredQuestionId: string;
  let unansweredQuestionId: string;

  async function questionsOf(eventId: string): Promise<QuestionRow[]> {
    const { data: q } = await service
      .from('event_questionnaires')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle();
    if (!q) return [];
    const { data } = await service
      .from('event_questions')
      .select('*')
      .eq('event_questionnaire_id', q.id)
      .order('position', { ascending: true });
    return data ?? [];
  }

  async function questionnaireOf(eventId: string) {
    const { data } = await service
      .from('event_questionnaires')
      .select('*')
      .eq('event_id', eventId)
      .maybeSingle();
    return data;
  }

  beforeAll(async () => {
    fx = await seedFixtures();
    organizer = await createAuthedOrganizer(fx.suffix);
    vendor = await createAuthedVendor(fx.suffix);
    fx.authUserIds.push(organizer.userId, vendor.userId);

    const { data: event, error: eventError } = await service
      .from('events')
      .insert({
        name: `SEC Answered Draft ${fx.suffix}`,
        event_date: '2030-04-15',
        location: 'Calgary',
        status: 'draft',
      })
      .select('id')
      .single();
    if (eventError || !event) throw new Error(`answered draft event: ${eventError?.message}`);
    answeredEventId = event.id;
    fx.extraEventIds.push(answeredEventId);

    const { data: questionnaire, error: qError } = await service
      .from('event_questionnaires')
      .insert({ event_id: answeredEventId })
      .select('id')
      .single();
    if (qError || !questionnaire) throw new Error(`answered questionnaire: ${qError?.message}`);

    answeredQuestionId = crypto.randomUUID();
    unansweredQuestionId = crypto.randomUUID();
    const { error: questionsError } = await service.from('event_questions').insert([
      {
        id: answeredQuestionId,
        event_questionnaire_id: questionnaire.id,
        position: 0,
        type: 'short_text',
        label: 'Answered question',
      },
      {
        id: unansweredQuestionId,
        event_questionnaire_id: questionnaire.id,
        position: 1,
        type: 'short_text',
        label: 'Unanswered question',
      },
    ]);
    if (questionsError) throw new Error(`answered questions: ${questionsError.message}`);

    const { data: application, error: applicationError } = await service
      .from('applications')
      .insert({
        event_id: answeredEventId,
        vendor_id: fx.seededVendorId,
        status: 'pending',
      })
      .select('id')
      .single();
    if (applicationError || !application) {
      throw new Error(`answered application: ${applicationError?.message}`);
    }
    const { error: answerError } = await service.from('application_answers').insert({
      application_id: application.id,
      event_question_id: answeredQuestionId,
      value: { kind: 'text', value: 'kept' },
    });
    if (answerError) throw new Error(`answer: ${answerError.message}`);
  });

  afterAll(async () => {
    await cleanupFixtures(fx);
  });

  // ---------------------------------------------------------------------------
  // Q1 / Q2 — callers without the organizer role
  // ---------------------------------------------------------------------------

  it('Q1: anon cannot invoke the RPC', async () => {
    const { error } = await save(anon, fx.draftEventId, [A]);

    expect(error?.code).toBe(RLS_DENIED);
    expect(await questionnaireOf(fx.draftEventId)).toBeNull();
  });

  it('Q2: a signed-in vendor is rejected by the in-function role gate', async () => {
    const { data: role } = await vendor.client.rpc('get_user_role');
    expect(role).toBe('vendor');

    const { error } = await save(vendor.client, fx.draftEventId, [A]);

    expect(error?.code).toBe(RLS_DENIED);
    expect(await questionnaireOf(fx.draftEventId)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Q3 / Q4 — the organizer path
  // ---------------------------------------------------------------------------

  it('Q3: organizer creates the questionnaire row and saves three questions', async () => {
    const { data, error } = await save(organizer.client, fx.draftEventId, [A, B, C]);

    expect(error).toBeNull();
    expect(data?.map((r) => r.id)).toEqual([A_ID, B_ID, C_ID]);
    expect(data?.map((r) => r.position)).toEqual([0, 1, 2]);

    const questionnaire = await questionnaireOf(fx.draftEventId);
    expect(questionnaire).not.toBeNull();
    expect(questionnaire?.seeded_from_template_id).toBeNull();

    const rows = await questionsOf(fx.draftEventId);
    expect(rows.map((r) => r.label)).toEqual(['Need power?', 'Booth name', 'Which appliances?']);
    expect(rows[2].show_if).toEqual({ questionId: A_ID, operator: 'equals', value: 'true' });
  });

  it('Q4: edit + drop + add + reorder land together in one call', async () => {
    const editedA = { ...A, label: 'Do you need power?', required: true };

    const { data, error } = await save(organizer.client, fx.draftEventId, [editedA, D, C]);

    expect(error).toBeNull();
    expect(data?.map((r) => r.id)).toEqual([A_ID, D_ID, C_ID]);

    const rows = await questionsOf(fx.draftEventId);
    expect(rows.map((r) => [r.id, r.position])).toEqual([
      [A_ID, 0],
      [D_ID, 1],
      [C_ID, 2],
    ]);
    expect(rows[0].label).toBe('Do you need power?');
    expect(rows[0].required).toBe(true);
    expect(rows.find((r) => r.id === B_ID)).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Q5 — atomicity: a CHECK failure on one row rolls back the whole batch
  // ---------------------------------------------------------------------------

  it('Q5: a constraint failure mid-batch leaves every row untouched', async () => {
    const before = snapshot(await questionsOf(fx.draftEventId));
    const E: QuestionPayload = {
      id: crypto.randomUUID(),
      type: 'short_text',
      label: 'x'.repeat(201),
    };

    const { error } = await save(organizer.client, fx.draftEventId, [
      { ...A, label: 'SHOULD NOT PERSIST' },
      E,
      C,
    ]);

    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(snapshot(await questionsOf(fx.draftEventId))).toEqual(before);
  });

  // ---------------------------------------------------------------------------
  // Q6 / Q7 / Q8 — payload gates (P0004)
  // ---------------------------------------------------------------------------

  it('Q6: a show_if pointing at a later question is rejected', async () => {
    const before = snapshot(await questionsOf(fx.draftEventId));

    const { error } = await save(organizer.client, fx.draftEventId, [C, A]);

    expect(error?.code).toBe(INVALID_PAYLOAD);
    expect(snapshot(await questionsOf(fx.draftEventId))).toEqual(before);
  });

  it("Q7: a question id belonging to another event's questionnaire is rejected", async () => {
    const draftBefore = snapshot(await questionsOf(fx.draftEventId));
    const activeBefore = snapshot(await questionsOf(fx.activeEventId));
    const hijacked: QuestionPayload = {
      id: fx.questions[0].id,
      type: 'short_text',
      label: 'PWNED',
    };

    const { error } = await save(organizer.client, fx.draftEventId, [A, hijacked]);

    expect(error?.code).toBe(INVALID_PAYLOAD);
    expect(snapshot(await questionsOf(fx.draftEventId))).toEqual(draftBefore);
    expect(snapshot(await questionsOf(fx.activeEventId))).toEqual(activeBefore);
  });

  it('Q8: a duplicate id within the payload is rejected', async () => {
    const { error } = await save(organizer.client, fx.draftEventId, [A, { ...A, label: 'Again' }]);

    expect(error?.code).toBe(INVALID_PAYLOAD);
  });

  // ---------------------------------------------------------------------------
  // Q9 / Q10 — lock-on-publish, both signals
  // ---------------------------------------------------------------------------

  it('Q9: saving against a published event fails with P0001', async () => {
    const before = snapshot(await questionsOf(fx.activeEventId));

    const { error } = await save(organizer.client, fx.activeEventId, [A]);

    expect(error?.code).toBe(NOT_DRAFT_OR_LOCKED);
    expect(snapshot(await questionsOf(fx.activeEventId))).toEqual(before);
  });

  it('Q10: a locked questionnaire on a draft event also fails with P0001', async () => {
    const questionnaire = await questionnaireOf(fx.draftEventId);
    await service
      .from('event_questionnaires')
      .update({ locked_at: new Date().toISOString() })
      .eq('id', questionnaire!.id);

    const { error } = await save(organizer.client, fx.draftEventId, [A]);

    await service
      .from('event_questionnaires')
      .update({ locked_at: null })
      .eq('id', questionnaire!.id);

    expect(error?.code).toBe(NOT_DRAFT_OR_LOCKED);
  });

  // ---------------------------------------------------------------------------
  // Q11 / Q12 — answered questions (FK ON DELETE RESTRICT)
  // ---------------------------------------------------------------------------

  it('Q11: dropping a question that already has an answer fails with 23503', async () => {
    const before = snapshot(await questionsOf(answeredEventId));

    const { error } = await save(organizer.client, answeredEventId, [
      { id: unansweredQuestionId, type: 'short_text', label: 'Unanswered question' },
    ]);

    expect(error?.code).toBe(FK_RESTRICT);
    expect(snapshot(await questionsOf(answeredEventId))).toEqual(before);
  });

  it('Q12: keeping and editing the answered question succeeds', async () => {
    const { error } = await save(organizer.client, answeredEventId, [
      { id: unansweredQuestionId, type: 'short_text', label: 'Unanswered question' },
      { id: answeredQuestionId, type: 'short_text', label: 'Answered question (edited)' },
    ]);

    expect(error).toBeNull();
    const rows = await questionsOf(answeredEventId);
    expect(rows.map((r) => [r.id, r.label])).toEqual([
      [unansweredQuestionId, 'Unanswered question'],
      [answeredQuestionId, 'Answered question (edited)'],
    ]);
  });

  // ---------------------------------------------------------------------------
  // Q13 / Q14 / Q15 — seeded_from_template_id and not-found cases
  // ---------------------------------------------------------------------------

  it('Q13: p_seeded_from_template_id is written and updated_at bumped', async () => {
    const { data: template, error: templateError } = await service
      .from('questionnaire_templates')
      .insert({ name: `SEC Template ${fx.suffix}` })
      .select('id')
      .single();
    if (templateError || !template) throw new Error(`template: ${templateError?.message}`);
    fx.extraTemplateIds.push(template.id);

    const before = await questionnaireOf(fx.draftEventId);

    const { error } = await save(organizer.client, fx.draftEventId, [A, D, C], template.id);

    expect(error).toBeNull();
    const after = await questionnaireOf(fx.draftEventId);
    expect(after?.seeded_from_template_id).toBe(template.id);
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime()
    );

    // A later plain save must not clear the seed record.
    await save(organizer.client, fx.draftEventId, [A, C]);
    expect((await questionnaireOf(fx.draftEventId))?.seeded_from_template_id).toBe(template.id);
  });

  it('Q14: a nonexistent template id fails with P0002 and changes nothing', async () => {
    const before = snapshot(await questionsOf(fx.draftEventId));

    const { error } = await save(organizer.client, fx.draftEventId, [A], NONEXISTENT_UUID);

    expect(error?.code).toBe(NOT_FOUND);
    expect(snapshot(await questionsOf(fx.draftEventId))).toEqual(before);
  });

  it('Q15: a nonexistent event id fails with P0002', async () => {
    const { error } = await save(organizer.client, NONEXISTENT_UUID, [A]);

    expect(error?.code).toBe(NOT_FOUND);
  });

  // ---------------------------------------------------------------------------
  // Q16 — the two older organizer RPCs now carry the same role gate (012 §3)
  // ---------------------------------------------------------------------------

  it('Q16: a vendor cannot invoke ensure_event_questionnaire or create_event_with_default_questionnaire', async () => {
    const { count: eventsBefore } = await service
      .from('events')
      .select('id', { count: 'exact', head: true });
    const { count: questionnairesBefore } = await service
      .from('event_questionnaires')
      .select('id', { count: 'exact', head: true });

    const ensure = await vendor.client.rpc('ensure_event_questionnaire', {
      p_event_id: fx.activeEventBId,
    });
    const create = await vendor.client.rpc('create_event_with_default_questionnaire', {
      p_event: {
        name: `PWNED ${fx.suffix}`,
        event_date: '2030-12-31',
        location: 'Calgary',
        status: 'active',
      },
    });

    expect(ensure.error?.code).toBe(RLS_DENIED);
    expect(create.error?.code).toBe(RLS_DENIED);

    const { count: eventsAfter } = await service
      .from('events')
      .select('id', { count: 'exact', head: true });
    const { count: questionnairesAfter } = await service
      .from('event_questionnaires')
      .select('id', { count: 'exact', head: true });
    expect(eventsAfter).toBe(eventsBefore);
    expect(questionnairesAfter).toBe(questionnairesBefore);
  });
});
