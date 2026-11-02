// =============================================================================
// S1–S14 — submit_public_application end to end (spec 006 T021; v2 by spec 011)
//
// The RPC is the only write path anon has left after migration 011 dropped the
// seven broad policies, so these run against the real local stack with the
// anon key: SECURITY DEFINER behaviour, the ERRCODE contract, and — above all
// — transactional rollback are things a mock cannot prove.
//
// Migration 015 replaced the body: the vendor carries `product_links` (≤ 3
// absolute http(s) URLs) instead of phone/website, the fixed-form `legacy` and
// `attachments` keys are ignored, and a signed-in caller is tied to the row
// (that half is vendor-linking.test.ts; every case here is anon).
//
// Every case owns a unique vendor email ending in the run suffix, so tests do
// not depend on each other's rows and cleanupFixtures sweeps them all.
//
// Matrix: specs/011-vendor-linking-and-contact-fields/contracts/security-test-matrix.md
// (extends specs/006-close-public-data-exposure/contracts/security-test-matrix.md)
// Contract: specs/011-vendor-linking-and-contact-fields/contracts/submit-public-application-v2.md
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
const INVALID_PARAMETER = '22023';

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

  function vendorFor(local: string, productLinks: string[] = ['https://shop.example']) {
    return {
      business_name: `SEC RPC ${local}`,
      contact_name: 'RPC Contact',
      email: emailFor(local),
      description: '',
      product_links: productLinks,
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
      .select('id, product_links, business_name')
      .eq('email', emailFor(local));
    return data ?? [];
  }

  // ---------------------------------------------------------------------------
  // S1 — new vendor with three product links
  // ---------------------------------------------------------------------------

  it('S1: creates the vendor with its three product links stored in order', async () => {
    const productLinks = ['https://a.example', 'https://b.example', 'https://c.example'];

    const { data, error } = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s1', productLinks),
      answers: null,
    });

    expect(error).toBeNull();
    expect(data?.vendor_created).toBe(true);
    expect(data?.event_name).toBe(fx.activeEventName);

    const vendors = await vendorRows('s1');
    expect(vendors).toHaveLength(1);
    expect(vendors[0]!.id).toBe(data!.vendor_id);
    expect(vendors[0]!.product_links).toEqual(productLinks);

    const { data: application } = await service
      .from('applications')
      .select('id, status, event_id, vendor_id')
      .eq('id', data!.application_id)
      .single();
    expect(application?.status).toBe('pending');
    expect(application?.event_id).toBe(fx.activeEventId);
    expect(application?.vendor_id).toBe(data!.vendor_id);
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
      answers: [
        { event_question_id: fx.requiredTextQuestionId, value: textValue },
        { event_question_id: fx.requiredMultiSelectQuestionId, value: choicesValue },
      ],
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

    // The fixed-form columns are never written.
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
  // S3 — returning vendor with changed contact details (006 FR-005)
  // ---------------------------------------------------------------------------

  it("S3: replaces a returning vendor's links instead of creating a second row", async () => {
    const first = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s3', ['https://old.example', 'https://older.example']),
      answers: null,
    });
    expect(first.error).toBeNull();
    expect(first.data?.vendor_created).toBe(true);

    const second = await submit({
      event_id: fx.activeEventBId,
      vendor: {
        ...vendorFor('s3', ['https://new.example']),
        business_name: 'SEC RPC s3 renamed',
      },
      answers: null,
    });

    expect(second.error).toBeNull();
    expect(second.data?.vendor_created).toBe(false);
    expect(second.data?.vendor_id).toBe(first.data!.vendor_id);
    expect(second.data?.application_id).not.toBe(first.data!.application_id);

    const vendors = await vendorRows('s3');
    expect(vendors).toHaveLength(1);
    expect(vendors[0]!.product_links).toEqual(['https://new.example']);
    expect(vendors[0]!.business_name).toBe('SEC RPC s3 renamed');
  });

  // ---------------------------------------------------------------------------
  // S4 — returning vendor, details unchanged, second event
  // ---------------------------------------------------------------------------

  it('S4: gives a returning vendor with unchanged details a second application', async () => {
    const vendor = vendorFor('s4');

    const first = await submit({ event_id: fx.activeEventId, vendor, answers: null });
    expect(first.error).toBeNull();

    const second = await submit({ event_id: fx.activeEventBId, vendor, answers: null });

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
  // S5 — duplicate application (006 FR-006)
  // ---------------------------------------------------------------------------

  it('S5: rejects a duplicate submission with P0003 and changes nothing', async () => {
    const first = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s5', ['https://kept.example']),
      answers: null,
    });
    expect(first.error).toBeNull();

    const applicationsBefore = await applicationCount(fx.activeEventId);

    const { error } = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s5', ['https://replaced.example']),
      answers: null,
    });

    expect(error?.code).toBe('P0003');
    expect(await applicationCount(fx.activeEventId)).toBe(applicationsBefore);

    // The rejected transaction rolls the vendor update back with it (R17 #6).
    const vendors = await vendorRows('s5');
    expect(vendors).toHaveLength(1);
    expect(vendors[0]!.product_links).toEqual(['https://kept.example']);
  });

  // ---------------------------------------------------------------------------
  // S6 — event gate (006 FR-007)
  // ---------------------------------------------------------------------------

  it('S6: rejects a draft event with P0001 and an unknown event with P0002', async () => {
    const draft = await submit({
      event_id: fx.draftEventId,
      vendor: vendorFor('s6-draft'),
      answers: null,
    });
    expect(draft.error?.code).toBe('P0001');
    expect(await vendorRows('s6-draft')).toHaveLength(0);

    const missing = await submit({
      event_id: NONEXISTENT_UUID,
      vendor: vendorFor('s6-missing'),
      answers: null,
    });
    expect(missing.error?.code).toBe('P0002');
    expect(await vendorRows('s6-missing')).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // S7 — answer for a foreign question (006 edge case, FR-008)
  // ---------------------------------------------------------------------------

  it('S7: rejects a foreign event_question_id with P0004 and leaves no rows', async () => {
    const applicationsBefore = await applicationCount(fx.activeEventId);

    const { error } = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s7'),
      answers: [
        {
          event_question_id: fx.requiredTextQuestionId,
          value: { kind: 'text', value: 'Legitimate answer' },
        },
        { event_question_id: NONEXISTENT_UUID, value: { kind: 'text', value: 'Injected' } },
      ],
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
      answers: [
        { event_question_id: fx.requiredTextQuestionId, value: { kind: 'text', value: 'First' } },
        { event_question_id: fx.requiredTextQuestionId, value: { kind: 'text', value: 'Second' } },
      ],
    });

    expect(error?.code).toBe(UNIQUE_VIOLATION);
    expect(await vendorRows('s8')).toHaveLength(0);
    expect(await applicationCount(fx.activeEventId)).toBe(applicationsBefore);
  });

  // ---------------------------------------------------------------------------
  // S9 — more than three links: refused, nothing written (011 FR-011/FR-012)
  // ---------------------------------------------------------------------------

  it('S9: refuses four product links with 22023 and writes no rows', async () => {
    const applicationsBefore = await applicationCount(fx.activeEventId);

    const { error } = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s9', [
        'https://a.example',
        'https://b.example',
        'https://c.example',
        'https://d.example',
      ]),
      answers: null,
    });

    expect(error?.code).toBe(INVALID_PARAMETER);
    expect(await vendorRows('s9')).toHaveLength(0);
    expect(await applicationCount(fx.activeEventId)).toBe(applicationsBefore);
  });

  // ---------------------------------------------------------------------------
  // S10 — minimal payload
  // ---------------------------------------------------------------------------

  it('S10: accepts a minimal payload with no links or answers', async () => {
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

    // Absent links store as the empty array; absent optionals stay NULL.
    const { data: vendor } = await service
      .from('vendors')
      .select('product_links, phone, website, description')
      .eq('id', data!.vendor_id)
      .single();
    expect(vendor?.product_links).toEqual([]);
    expect(vendor?.phone).toBeNull();
    expect(vendor?.website).toBeNull();
    expect(vendor?.description).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // S11 — the RPC does not normalize: a scheme-less link is refused
  // ---------------------------------------------------------------------------

  it('S11: refuses a link without an http(s) scheme with 22023', async () => {
    const { error } = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s11', ['instagram.com/x']),
      answers: null,
    });

    expect(error?.code).toBe(INVALID_PARAMETER);
    expect(await vendorRows('s11')).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // S12 — the old payload's website becomes Link 1 (deploy window, research R3)
  // ---------------------------------------------------------------------------

  it('S12: stores an old-payload website as the only product link', async () => {
    const { error } = await submit({
      event_id: fx.activeEventId,
      vendor: {
        business_name: 'SEC RPC s12',
        contact_name: 'RPC Contact',
        email: emailFor('s12'),
        phone: '403-555-0101',
        website: 'shop.example',
        description: '',
      },
      legacy: null,
      answers: null,
      attachments: null,
    });

    expect(error).toBeNull();
    const vendors = await vendorRows('s12');
    expect(vendors).toHaveLength(1);
    expect(vendors[0]!.product_links).toEqual(['https://shop.example']);
  });

  // ---------------------------------------------------------------------------
  // S13 — empty links on a returning vendor keep what is stored
  // ---------------------------------------------------------------------------

  it('S13: keeps a returning vendor’s stored links when the submission sends none', async () => {
    const stored = ['https://a.example', 'https://b.example'];

    const first = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s13', stored),
      answers: null,
    });
    expect(first.error).toBeNull();

    const second = await submit({
      event_id: fx.activeEventBId,
      vendor: vendorFor('s13', []),
      answers: null,
    });
    expect(second.error).toBeNull();
    expect(second.data?.vendor_created).toBe(false);

    const vendors = await vendorRows('s13');
    expect(vendors).toHaveLength(1);
    expect(vendors[0]!.product_links).toEqual(stored);
  });

  // ---------------------------------------------------------------------------
  // S14 — an anonymous submission ties nothing (011 FR-005)
  // ---------------------------------------------------------------------------

  it('S14: leaves vendors.user_id NULL and touches no profile on an anon submission', async () => {
    const { count: tiedBefore } = await service
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .not('vendor_id', 'is', null);

    const { data, error } = await submit({
      event_id: fx.activeEventId,
      vendor: vendorFor('s14'),
      answers: null,
    });
    expect(error).toBeNull();

    const { data: vendor } = await service
      .from('vendors')
      .select('user_id')
      .eq('id', data!.vendor_id)
      .single();
    expect(vendor?.user_id).toBeNull();

    const { count: pointingHere } = await service
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', data!.vendor_id);
    expect(pointingHere).toBe(0);

    const { count: tiedAfter } = await service
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .not('vendor_id', 'is', null);
    expect(tiedAfter).toBe(tiedBefore);
  });
});
