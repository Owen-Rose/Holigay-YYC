// =============================================================================
// W1 / W2 / W3 — anon write posture (spec 006, T013)
//
// Covers FR-002, US1-AC2, and research.md R6 (the two privileged SECURITY
// DEFINER RPCs that were anon-callable via PostgREST before migration 011 §2).
//
// Every payload below is otherwise VALID — real FK targets, no NOT NULL gaps,
// no unique collisions — so RLS is the only thing that can reject it. A test
// that gets its 42501 from a malformed row proves nothing.
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

const RLS_DENIED = '42501';
const SEEDED_NOTE = 'SEEDED INTERNAL NOTE — must never be readable by anon';

describe.runIf(stackUp)('anon writes', () => {
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
  // W1 — inserts are refused, and nothing lands
  // ---------------------------------------------------------------------------

  it('W1: anon cannot insert a vendor', async () => {
    const email = `sec-anon-insert-${fx.suffix}@example.com`;

    const { error } = await anon.from('vendors').insert({
      business_name: `Anon Insert ${fx.suffix}`,
      contact_name: 'Anon Attacker',
      email,
      phone: '403-555-9999',
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe(RLS_DENIED);

    const { data } = await service.from('vendors').select('id').eq('email', email);
    expect(data ?? []).toHaveLength(0);
  });

  it('W1: anon cannot insert an application', async () => {
    // Event B + the seeded vendor: a real, active event and a real vendor with
    // no existing application between them, so UNIQUE(event_id, vendor_id) is
    // not what rejects this.
    const { error } = await anon.from('applications').insert({
      event_id: fx.activeEventBId,
      vendor_id: fx.seededVendorId,
      status: 'pending',
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe(RLS_DENIED);

    const { data } = await service
      .from('applications')
      .select('id')
      .eq('event_id', fx.activeEventBId);
    expect(data ?? []).toHaveLength(0);
  });

  it('W1: anon cannot insert an attachment', async () => {
    const filePath = `${fx.storagePrefix}/anon-insert.pdf`;

    const { error } = await anon.from('attachments').insert({
      application_id: fx.seededApplicationId,
      file_name: 'anon-insert.pdf',
      file_path: filePath,
      file_type: 'application/pdf',
      file_size: 512,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe(RLS_DENIED);

    const { data } = await service.from('attachments').select('id').eq('file_path', filePath);
    expect(data ?? []).toHaveLength(0);
  });

  it('W1: anon cannot insert an application answer', async () => {
    // multi_select is unanswered on the seeded application, so
    // UNIQUE(application_id, event_question_id) cannot fire first.
    const { error } = await anon.from('application_answers').insert({
      application_id: fx.seededApplicationId,
      event_question_id: fx.requiredMultiSelectQuestionId,
      value: { kind: 'choices', value: ['art'] },
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe(RLS_DENIED);

    const { data } = await service
      .from('application_answers')
      .select('id')
      .eq('application_id', fx.seededApplicationId)
      .eq('event_question_id', fx.requiredMultiSelectQuestionId);
    expect(data ?? []).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // W2 — updates and deletes touch nothing
  //
  // With no USING policy the rows are invisible to the statement, so PostgREST
  // reports success over an empty row set rather than an error. The load-bearing
  // assertion is the service-side re-read.
  // ---------------------------------------------------------------------------

  it('W2: anon update against the seeded vendor affects no rows', async () => {
    const { data: affected } = await anon
      .from('vendors')
      .update({ business_name: 'PWNED', phone: '000-000-0000' })
      .eq('id', fx.seededVendorId)
      .select('id');

    expect(affected ?? []).toHaveLength(0);

    const { data } = await service
      .from('vendors')
      .select('business_name, phone')
      .eq('id', fx.seededVendorId)
      .single();
    expect(data?.business_name).toBe(`SEC Vendor ${fx.suffix}`);
    expect(data?.phone).toBe('403-555-0000');
  });

  it('W2: anon update against the seeded application affects no rows', async () => {
    const { data: affected } = await anon
      .from('applications')
      .update({ status: 'approved', organizer_notes: 'PWNED' })
      .eq('id', fx.seededApplicationId)
      .select('id');

    expect(affected ?? []).toHaveLength(0);

    const { data } = await service
      .from('applications')
      .select('status, organizer_notes')
      .eq('id', fx.seededApplicationId)
      .single();
    expect(data?.status).toBe('pending');
    expect(data?.organizer_notes).toBe(SEEDED_NOTE);
  });

  it('W2: anon delete against the four private tables removes nothing', async () => {
    const [vendors, applications, attachments, answers] = await Promise.all([
      anon.from('vendors').delete().eq('id', fx.seededVendorId).select('id'),
      anon.from('applications').delete().eq('id', fx.seededApplicationId).select('id'),
      anon.from('attachments').delete().eq('application_id', fx.seededApplicationId).select('id'),
      anon
        .from('application_answers')
        .delete()
        .eq('application_id', fx.seededApplicationId)
        .select('id'),
    ]);

    expect(vendors.data ?? []).toHaveLength(0);
    expect(applications.data ?? []).toHaveLength(0);
    expect(attachments.data ?? []).toHaveLength(0);
    expect(answers.data ?? []).toHaveLength(0);

    const [vendorRows, applicationRows, attachmentRows, answerRows] = await Promise.all([
      service.from('vendors').select('id').eq('id', fx.seededVendorId),
      service.from('applications').select('id').eq('id', fx.seededApplicationId),
      service.from('attachments').select('id').eq('application_id', fx.seededApplicationId),
      service.from('application_answers').select('id').eq('application_id', fx.seededApplicationId),
    ]);

    expect(vendorRows.data ?? []).toHaveLength(1);
    expect(applicationRows.data ?? []).toHaveLength(1);
    expect(attachmentRows.data ?? []).toHaveLength(1);
    expect(answerRows.data ?? []).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // W3 — the privileged RPCs are no longer anon-callable (R6)
  //
  // Before 011 §2 both executed for an anonymous caller: PostgreSQL's default
  // PUBLIC EXECUTE grant made the migrations' `GRANT ... TO authenticated`
  // additive no-ops. The row-count assertions catch a regression that re-grants
  // EXECUTE without anyone noticing the error code changed.
  // ---------------------------------------------------------------------------

  it('W3: anon cannot invoke create_event_with_default_questionnaire', async () => {
    const { count: before } = await service
      .from('events')
      .select('id', { count: 'exact', head: true });

    const { error } = await anon.rpc('create_event_with_default_questionnaire', {
      p_event: {
        name: `PWNED ${fx.suffix}`,
        event_date: '2030-12-31',
        location: 'Calgary',
        status: 'active',
      },
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe(RLS_DENIED);

    const { count: after } = await service
      .from('events')
      .select('id', { count: 'exact', head: true });
    expect(after).toBe(before);
  });

  it('W3: anon cannot invoke ensure_event_questionnaire', async () => {
    const { count: before } = await service
      .from('event_questionnaires')
      .select('id', { count: 'exact', head: true });

    const { error } = await anon.rpc('ensure_event_questionnaire', {
      p_event_id: fx.activeEventBId,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe(RLS_DENIED);

    const { count: after } = await service
      .from('event_questionnaires')
      .select('id', { count: 'exact', head: true });
    expect(after).toBe(before);
  });
});
