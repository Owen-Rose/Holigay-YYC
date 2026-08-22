// =============================================================================
// R1 / R2 / R3 — anon read posture (spec 006, T012)
//
// Covers FR-001, FR-003, US1-AC1, US1-AC3, SC-001.
//
// The four private tables still carry anon's table-level SELECT grant; what
// migration 011 removed is the RLS policy that made rows visible. PostgREST
// therefore answers with an empty array rather than an error, so every
// assertion here is "zero rows", never "the query failed".
//
// Matrix: specs/006-close-public-data-exposure/contracts/security-test-matrix.md
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  stackUp,
  anonClient,
  serviceClient,
  seedFixtures,
  cleanupFixtures,
  type SecurityFixtures,
} from './harness';

const SEEDED_NOTE = 'SEEDED INTERNAL NOTE — must never be readable by anon';

describe.runIf(stackUp)('anon reads', () => {
  let fx: SecurityFixtures;
  const anon = anonClient();
  const service = serviceClient();

  beforeAll(async () => {
    fx = await seedFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures(fx);
  });

  // ---------------------------------------------------------------------------
  // R1 — private tables return nothing, while the rows demonstrably exist
  // ---------------------------------------------------------------------------

  it('R1: the seeded private rows really exist (ground truth via service role)', async () => {
    const [vendors, applications, attachments, answers] = await Promise.all([
      service.from('vendors').select('id').eq('id', fx.seededVendorId),
      service.from('applications').select('id, organizer_notes').eq('id', fx.seededApplicationId),
      service.from('attachments').select('id').eq('application_id', fx.seededApplicationId),
      service.from('application_answers').select('id').eq('application_id', fx.seededApplicationId),
    ]);

    expect(vendors.data ?? []).toHaveLength(1);
    expect(applications.data ?? []).toHaveLength(1);
    expect(applications.data?.[0]?.organizer_notes).toBe(SEEDED_NOTE);
    expect(attachments.data ?? []).toHaveLength(1);
    expect(answers.data ?? []).toHaveLength(1);
  });

  it('R1: anon reads zero rows from vendors', async () => {
    const { data } = await anon.from('vendors').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('R1: anon reads zero rows from applications, and never sees organizer_notes', async () => {
    const { data } = await anon.from('applications').select('*');
    expect(data ?? []).toHaveLength(0);
    expect(JSON.stringify(data ?? [])).not.toContain(SEEDED_NOTE);
  });

  it('R1: anon reads zero rows from attachments', async () => {
    const { data } = await anon.from('attachments').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('R1: anon reads zero rows from application_answers', async () => {
    const { data } = await anon.from('application_answers').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('R1: anon cannot reach a private row by targeting its id directly', async () => {
    const [vendor, application] = await Promise.all([
      anon.from('vendors').select('*').eq('id', fx.seededVendorId),
      anon.from('applications').select('*').eq('id', fx.seededApplicationId),
    ]);

    expect(vendor.data ?? []).toHaveLength(0);
    expect(application.data ?? []).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // R2 — the intentionally public reads still work
  // ---------------------------------------------------------------------------

  it('R2: anon sees the active event', async () => {
    const { data, error } = await anon
      .from('events')
      .select('id, name, status')
      .eq('id', fx.activeEventId);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(data?.[0]?.name).toBe(fx.activeEventName);
    expect(data?.[0]?.status).toBe('active');
  });

  it("R2: anon sees the active event's questionnaire and questions", async () => {
    const { data: questionnaires, error: qError } = await anon
      .from('event_questionnaires')
      .select('id')
      .eq('event_id', fx.activeEventId);

    expect(qError).toBeNull();
    expect(questionnaires ?? []).toHaveLength(1);
    expect(questionnaires?.[0]?.id).toBe(fx.questionnaireId);

    const { data: questions, error: questionsError } = await anon
      .from('event_questions')
      .select('id, label, type, required, position')
      .eq('event_questionnaire_id', fx.questionnaireId)
      .order('position', { ascending: true });

    expect(questionsError).toBeNull();
    expect(questions ?? []).toHaveLength(fx.questions.length);
    expect(questions?.map((q) => q.id)).toEqual(fx.questions.map((q) => q.id));
  });

  // ---------------------------------------------------------------------------
  // R3 — draft events stay hidden
  // ---------------------------------------------------------------------------

  it('R3: anon cannot see the draft event', async () => {
    const { data } = await anon.from('events').select('id').eq('id', fx.draftEventId);
    expect(data ?? []).toHaveLength(0);
  });

  it('R3: anon sees no draft events at all', async () => {
    const { data } = await anon.from('events').select('id').eq('status', 'draft');
    expect(data ?? []).toHaveLength(0);
  });
});
