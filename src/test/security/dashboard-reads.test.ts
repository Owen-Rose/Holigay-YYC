// =============================================================================
// D1 — the organizer dashboard still reads everything it needs (spec 006, T015)
//
// Covers SC-005: dropping the seven anon policies must not change what a
// signed-in organizer sees. The selects below are copied from the real
// dashboard queries so a policy regression fails here rather than in the UI:
//
//   * applications-with-vendor join  -> getApplications        (applications.ts:407)
//   * attachments                    -> getApplicationById     (applications.ts:691)
//   * answers + event_question join  -> getApplicationById     (applications.ts:703)
//
// Matrix: specs/006-close-public-data-exposure/contracts/security-test-matrix.md
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  stackUp,
  createAuthedOrganizer,
  seedFixtures,
  cleanupFixtures,
  type AuthedOrganizer,
  type SecurityFixtures,
} from './harness';

const SEEDED_NOTE = 'SEEDED INTERNAL NOTE — must never be readable by anon';

describe.runIf(stackUp)('organizer dashboard reads', () => {
  let fx: SecurityFixtures;
  let organizer: AuthedOrganizer;

  beforeAll(async () => {
    fx = await seedFixtures();
    // Once per file — [auth.rate_limit] sign_in_sign_ups is 30 per 5 minutes.
    organizer = await createAuthedOrganizer(fx.suffix);
    fx.authUserIds.push(organizer.userId);
  });

  afterAll(async () => {
    await cleanupFixtures(fx);
  });

  it('D1: the session really is an organizer', async () => {
    const { data, error } = await organizer.client.rpc('get_user_role');
    expect(error).toBeNull();
    expect(data).toBe('organizer');
  });

  it('D1: the applications list query returns the application with its vendor', async () => {
    const { data, error } = await organizer.client
      .from('applications')
      .select(
        `
        id,
        event_id,
        vendor_id,
        status,
        submitted_at,
        updated_at,
        booth_preference,
        product_categories,
        special_requirements,
        organizer_notes,
        vendor:vendors (
          id,
          business_name,
          contact_name,
          email,
          phone,
          website,
          description,
          user_id,
          created_at,
          updated_at
        )
      `,
        { count: 'exact' }
      )
      .eq('event_id', fx.activeEventId);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);

    const row = data![0]!;
    expect(row.id).toBe(fx.seededApplicationId);
    expect(row.status).toBe('pending');
    expect(row.organizer_notes).toBe(SEEDED_NOTE);
    expect(row.vendor).not.toBeNull();
    expect(row.vendor?.id).toBe(fx.seededVendorId);
    expect(row.vendor?.email).toBe(fx.seededVendorEmail);
    expect(row.vendor?.business_name).toBe(`SEC Vendor ${fx.suffix}`);
  });

  it('D1: the application detail query returns its attachments', async () => {
    const { data, error } = await organizer.client
      .from('attachments')
      .select('id, file_name, file_path, file_type, file_size, uploaded_at')
      .eq('application_id', fx.seededApplicationId)
      .order('uploaded_at', { ascending: true });

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(data![0]!.file_name).toBe('seeded.pdf');
    expect(data![0]!.file_path).toBe(`${fx.storagePrefix}/seeded.pdf`);
  });

  it('D1: the application detail query returns its answers with question metadata', async () => {
    const { data, error } = await organizer.client
      .from('application_answers')
      .select(
        `
        id,
        value,
        event_question:event_questions (
          id,
          label,
          type,
          options,
          position
        )
      `
      )
      .eq('application_id', fx.seededApplicationId)
      .order('position', { referencedTable: 'event_questions', ascending: true });

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);

    const row = data![0]!;
    expect(row.value).toEqual({ kind: 'text', value: 'Seeded answer' });
    expect(row.event_question).not.toBeNull();
    expect(row.event_question?.id).toBe(fx.requiredTextQuestionId);
    expect(row.event_question?.type).toBe('short_text');
    expect(row.event_question?.label).toBe('Booth name');
  });

  it('D1: an organizer sees the draft event the public cannot', async () => {
    const { data, error } = await organizer.client
      .from('events')
      .select('id, status')
      .eq('id', fx.draftEventId);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(data![0]!.status).toBe('draft');
  });
});
