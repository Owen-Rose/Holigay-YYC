// =============================================================================
// S1–S10 — submit_public_application end to end (spec 006, T021)
//
// The RPC is the only write path anon has left after migration 011 dropped the
// seven broad policies, so these run against the real local stack with the
// anon key: SECURITY DEFINER behaviour, the ERRCODE contract, and — above all
// — transactional rollback are things a mock cannot prove.
//
// Every case owns a unique vendor email ending in the run suffix, so tests do
// not depend on each other's rows and cleanupFixtures sweeps them all.
//
// Matrix: specs/006-close-public-data-exposure/contracts/security-test-matrix.md
// Contract: specs/006-close-public-data-exposure/contracts/submit-public-application.md
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
import type { Json } from '@/types/database';

const NONEXISTENT_UUID = '00000000-0000-4000-8000-000000000000';
const UNIQUE_VIOLATION = '23505';
const NOT_NULL_VIOLATION = '23502';

describe.runIf(stackUp)('submit_public_application', () => {
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
  // Helpers
  // ---------------------------------------------------------------------------

  /** Unique per case, and matched by purgeRun's `LIKE %suffix@example.com`. */
  const emailFor = (local: string) => `sec-rpc-${local}-${fx.suffix}@example.com`;

  function vendorFor(local: string, phone = '403-555-0101') {
    return {
      business_name: `SEC RPC ${local}`,
      contact_name: 'RPC Contact',
      email: emailFor(local),
      phone,
      website: '',
      description: '',
    };
  }

  function submit(payload: unknown) {
    return anon.rpc('submit_public_application', { p_submission: payload as Json }).single();
  }

  async function applicationCount(eventId: string) {
    const { count } = await service
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId);
    return count ?? 0;
  }

  async function vendorRows(local: string) {
    const { data } = await service
      .from('vendors')
      .select('id, phone, business_name')
      .eq('email', emailFor(local));
    return data ?? [];
  }

  // ---------------------------------------------------------------------------
  // S1 — new vendor, legacy variant with an attachment
  // ---------------------------------------------------------------------------

  it('S1: creates vendor, application, and attachment for a legacy submission', async () => {
    const { data, error } = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s1'),
      legacy: {
        booth_preference: 'indoor',
        product_categories: ['jewelry', 'art'],
        special_requirements: 'Near a power outlet',
      },
      answers: null,
      attachments: [
        {
          file_name: 's1.pdf',
          file_path: `${fx.storagePrefix}/s1.pdf`,
          file_type: 'application/pdf',
          file_size: 2048,
        },
      ],
    });

    expect(error).toBeNull();
    expect(data?.vendor_created).toBe(true);
    expect(data?.event_name).toBe(fx.activeEventName);

    const vendors = await vendorRows('s1');
    expect(vendors).toHaveLength(1);
    expect(vendors[0]!.id).toBe(data!.vendor_id);

    const { data: application } = await service
      .from('applications')
      .select('id, status, event_id, vendor_id, booth_preference, product_categories')
      .eq('id', data!.application_id)
      .single();
    expect(application?.status).toBe('pending');
    expect(application?.event_id).toBe(fx.activeEventId);
    expect(application?.vendor_id).toBe(data!.vendor_id);
    expect(application?.booth_preference).toBe('indoor');
    expect(application?.product_categories).toEqual(['jewelry', 'art']);

    const { data: attachments } = await service
      .from('attachments')
      .select('file_name, file_path, file_size')
      .eq('application_id', data!.application_id);
    expect(attachments).toHaveLength(1);
    expect(attachments![0]!.file_name).toBe('s1.pdf');
    expect(attachments![0]!.file_size).toBe(2048);
  });

  // ---------------------------------------------------------------------------
  // S2 — new vendor, dynamic variant with answers
  // ---------------------------------------------------------------------------

  it('S2: stores answers for a dynamic submission', async () => {
    const textValue = { kind: 'text', value: 'Hand-thrown ceramics' };
    const choicesValue = { kind: 'choices', value: ['art', 'apparel'] };

    const { data, error } = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s2'),
      legacy: null,
      answers: [
        { event_question_id: fx.requiredTextQuestionId, value: textValue },
        { event_question_id: fx.requiredMultiSelectQuestionId, value: choicesValue },
      ],
      attachments: null,
    });

    expect(error).toBeNull();
    expect(data?.vendor_created).toBe(true);

    const { data: rows } = await service
      .from('application_answers')
      .select('event_question_id, value')
      .eq('application_id', data!.application_id);

    expect(rows).toHaveLength(2);
    const byQuestion = new Map(rows!.map((r) => [r.event_question_id, r.value]));
    expect(byQuestion.get(fx.requiredTextQuestionId)).toEqual(textValue);
    expect(byQuestion.get(fx.requiredMultiSelectQuestionId)).toEqual(choicesValue);

    // Legacy columns stay NULL on the dynamic path.
    const { data: application } = await service
      .from('applications')
      .select('booth_preference, product_categories, special_requirements')
      .eq('id', data!.application_id)
      .single();
    expect(application?.booth_preference).toBeNull();
    expect(application?.product_categories).toBeNull();
    expect(application?.special_requirements).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // S3 — returning vendor with changed contact details (FR-005, the old bug)
  // ---------------------------------------------------------------------------

  it("S3: updates a returning vendor's phone instead of creating a second row", async () => {
    const first = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s3', '403-555-1111'),
      legacy: null,
      answers: null,
      attachments: null,
    });
    expect(first.error).toBeNull();
    expect(first.data?.vendor_created).toBe(true);

    const second = await submit({
      event_id: fx.activeEventBId,
      vendor: { ...vendorFor('s3', '403-555-2222'), business_name: 'SEC RPC s3 renamed' },
      legacy: null,
      answers: null,
      attachments: null,
    });

    expect(second.error).toBeNull();
    expect(second.data?.vendor_created).toBe(false);
    expect(second.data?.vendor_id).toBe(first.data!.vendor_id);
    expect(second.data?.application_id).not.toBe(first.data!.application_id);

    const vendors = await vendorRows('s3');
    expect(vendors).toHaveLength(1);
    expect(vendors[0]!.phone).toBe('403-555-2222');
    expect(vendors[0]!.business_name).toBe('SEC RPC s3 renamed');
  });

  // ---------------------------------------------------------------------------
  // S4 — returning vendor, details unchanged, second event
  // ---------------------------------------------------------------------------

  it('S4: gives a returning vendor with unchanged details a second application', async () => {
    const vendor = vendorFor('s4');

    const first = await submit({
      event_id: fx.activeEventId,
      vendor,
      legacy: null,
      answers: null,
      attachments: null,
    });
    expect(first.error).toBeNull();

    const second = await submit({
      event_id: fx.activeEventBId,
      vendor,
      legacy: null,
      answers: null,
      attachments: null,
    });

    expect(second.error).toBeNull();
    expect(second.data?.vendor_created).toBe(false);
    expect(await vendorRows('s4')).toHaveLength(1);

    const { data: applications } = await service
      .from('applications')
      .select('id, event_id')
      .eq('vendor_id', second.data!.vendor_id);
    expect(applications).toHaveLength(2);
    expect(new Set(applications!.map((a) => a.event_id))).toEqual(
      new Set([fx.activeEventId, fx.activeEventBId])
    );
  });

  // ---------------------------------------------------------------------------
  // S5 — duplicate application (FR-006)
  // ---------------------------------------------------------------------------

  it('S5: rejects a duplicate submission with P0003 and changes nothing', async () => {
    const vendor = vendorFor('s5', '403-555-3333');

    const first = await submit({
      event_id: fx.activeEventId,
      vendor,
      legacy: null,
      answers: null,
      attachments: null,
    });
    expect(first.error).toBeNull();

    const applicationsBefore = await applicationCount(fx.activeEventId);

    const { error } = await submit({
      event_id: fx.activeEventId,
      vendor: { ...vendor, phone: '403-555-9999' },
      legacy: null,
      answers: null,
      attachments: null,
    });

    expect(error?.code).toBe('P0003');
    expect(await applicationCount(fx.activeEventId)).toBe(applicationsBefore);

    // The rejected transaction rolls the vendor update back with it (R17 #6).
    const vendors = await vendorRows('s5');
    expect(vendors).toHaveLength(1);
    expect(vendors[0]!.phone).toBe('403-555-3333');
  });

  // ---------------------------------------------------------------------------
  // S6 — event gate (FR-007)
  // ---------------------------------------------------------------------------

  it('S6: rejects a draft event with P0001 and an unknown event with P0002', async () => {
    const draft = await submit({
      event_id: fx.draftEventId,
      vendor: vendorFor('s6-draft'),
      legacy: null,
      answers: null,
      attachments: null,
    });
    expect(draft.error?.code).toBe('P0001');
    expect(await vendorRows('s6-draft')).toHaveLength(0);

    const missing = await submit({
      event_id: NONEXISTENT_UUID,
      vendor: vendorFor('s6-missing'),
      legacy: null,
      answers: null,
      attachments: null,
    });
    expect(missing.error?.code).toBe('P0002');
    expect(await vendorRows('s6-missing')).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // S7 — answer for a foreign question (edge case, FR-008)
  // ---------------------------------------------------------------------------

  it('S7: rejects a foreign event_question_id with P0004 and leaves no rows', async () => {
    const applicationsBefore = await applicationCount(fx.activeEventId);

    const { error } = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s7'),
      legacy: null,
      answers: [
        {
          event_question_id: fx.requiredTextQuestionId,
          value: { kind: 'text', value: 'Legitimate answer' },
        },
        { event_question_id: NONEXISTENT_UUID, value: { kind: 'text', value: 'Injected' } },
      ],
      attachments: null,
    });

    expect(error?.code).toBe('P0004');
    expect(await vendorRows('s7')).toHaveLength(0);
    expect(await applicationCount(fx.activeEventId)).toBe(applicationsBefore);

    const { data: answers } = await service
      .from('application_answers')
      .select('id')
      .eq('event_question_id', NONEXISTENT_UUID);
    expect(answers ?? []).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // S8 — duplicate answer rows: fails AFTER the vendor and application inserts
  // ---------------------------------------------------------------------------

  it('S8: rolls the whole submission back when the same question is answered twice', async () => {
    const applicationsBefore = await applicationCount(fx.activeEventId);

    const { error } = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s8'),
      legacy: null,
      answers: [
        { event_question_id: fx.requiredTextQuestionId, value: { kind: 'text', value: 'First' } },
        { event_question_id: fx.requiredTextQuestionId, value: { kind: 'text', value: 'Second' } },
      ],
      attachments: null,
    });

    expect(error?.code).toBe(UNIQUE_VIOLATION);
    expect(await vendorRows('s8')).toHaveLength(0);
    expect(await applicationCount(fx.activeEventId)).toBe(applicationsBefore);
  });

  // ---------------------------------------------------------------------------
  // S9 — attachment NOT NULL violation: the deepest failure vector (R4)
  // ---------------------------------------------------------------------------

  it('S9: rolls the whole submission back when an attachment is missing file_name', async () => {
    const applicationsBefore = await applicationCount(fx.activeEventId);

    const { error } = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s9'),
      legacy: {
        booth_preference: 'outdoor',
        product_categories: ['art'],
        special_requirements: null,
      },
      answers: null,
      attachments: [
        {
          file_path: `${fx.storagePrefix}/s9.pdf`,
          file_type: 'application/pdf',
          file_size: 128,
        },
      ],
    });

    expect(error?.code).toBe(NOT_NULL_VIOLATION);
    expect(await vendorRows('s9')).toHaveLength(0);
    expect(await applicationCount(fx.activeEventId)).toBe(applicationsBefore);

    const { data: attachments } = await service
      .from('attachments')
      .select('id')
      .eq('file_path', `${fx.storagePrefix}/s9.pdf`);
    expect(attachments ?? []).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // S10 — minimal payload
  // ---------------------------------------------------------------------------

  it('S10: accepts a minimal payload with no legacy, answers, or attachments', async () => {
    const { data, error } = await submit({
      event_id: fx.activeEventId,
      vendor: {
        business_name: 'SEC RPC s10',
        contact_name: 'RPC Contact',
        email: emailFor('s10'),
      },
    });

    expect(error).toBeNull();
    expect(data?.application_id).toBeTruthy();
    expect(data?.vendor_created).toBe(true);

    // Empty-string optionals normalize to NULL (NULLIF), and absent ones stay NULL.
    const { data: vendor } = await service
      .from('vendors')
      .select('phone, website, description')
      .eq('id', data!.vendor_id)
      .single();
    expect(vendor?.phone).toBeNull();
    expect(vendor?.website).toBeNull();
    expect(vendor?.description).toBeNull();
  });
});
