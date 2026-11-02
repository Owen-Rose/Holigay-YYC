// =============================================================================
// L1–L11 — account linking (spec 011, migration 015)
//
// A vendor must see every application submitted with their account's address,
// whichever came first: the account, the application, or a signed-in
// submission. Two write paths tie an account to its vendor row, both through
// the private helper link_vendor_account_rows (which never re-points a tie):
//
//   - submit_public_application, when the caller is signed in — the account
//     address wins over whatever the payload says (FR-002);
//   - link_vendor_account(), the no-argument self-heal the vendor dashboard
//     calls, keyed on auth.uid() and the account's own address (FR-001/FR-003).
//
// handle_new_user's tie at account creation (L2) is existing behaviour, kept.
//
// Users: U1, U3, U4, U5, U6 sign in (≤ 6 — GoTrue allows 30 sign-ins per 5
// minutes); L2's account is created with the admin API and never signs in.
// Every address ends in the run suffix so purgeRun sweeps the vendor rows.
//
// Matrix: specs/011-vendor-linking-and-contact-fields/contracts/security-test-matrix.md
// Contracts: contracts/link-vendor-account.md, contracts/submit-public-application-v2.md
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  stackUp,
  anonClient,
  serviceClient,
  seedFixtures,
  cleanupFixtures,
  createAuthedVendor,
  type AuthedUser,
  type SecurityFixtures,
} from './harness';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';

type Client = SupabaseClient<Database>;

const PERMISSION_DENIED = '42501';

describe.runIf(stackUp)('account linking (spec 011)', () => {
  let fx: SecurityFixtures;
  const anon = anonClient();
  const service = serviceClient();

  let u1: AuthedUser;
  let u3: AuthedUser;
  let u4: AuthedUser;
  let u5: AuthedUser;
  let u6: AuthedUser;

  /** U1's vendor row, tied in L1; L8 and L9 lean on it. */
  let v1: string;
  /** U3's vendor row, tied in L3; L8 checks it is left alone. */
  let v3: string;

  beforeAll(async () => {
    fx = await seedFixtures();
    // Sequential on purpose: each call is one GoTrue sign-in.
    u1 = await createAuthedVendor(`l1-${fx.suffix}`);
    fx.authUserIds.push(u1.userId);
    u3 = await createAuthedVendor(`l3-${fx.suffix}`);
    fx.authUserIds.push(u3.userId);
    u4 = await createAuthedVendor(`l4-${fx.suffix}`);
    fx.authUserIds.push(u4.userId);
    u5 = await createAuthedVendor(`l5-${fx.suffix}`);
    fx.authUserIds.push(u5.userId);
    u6 = await createAuthedVendor(`l6-${fx.suffix}`);
    fx.authUserIds.push(u6.userId);
  });

  afterAll(async () => {
    await cleanupFixtures(fx);
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** An address no user owns, matched by purgeRun's `LIKE %suffix@example.com`. */
  const emailFor = (local: string) => `sec-link-${local}-${fx.suffix}@example.com`;

  function payload(eventId: string, email: string, extra: Record<string, unknown> = {}) {
    return {
      event_id: eventId,
      vendor: {
        business_name: `SEC Link ${email}`,
        contact_name: 'Link Contact',
        email,
        description: '',
        product_links: ['https://link.example'],
      },
      answers: [
        {
          event_question_id: fx.requiredTextQuestionId,
          value: { kind: 'text', value: 'Linked booth' },
        },
      ],
      ...extra,
    };
  }

  function submit(client: Client, body: unknown) {
    return client.rpc('submit_public_application', { p_submission: body as Json }).single();
  }

  /** Both sides of the tie, read as ground truth with the service client. */
  async function links(userId: string, vendorId: string) {
    const profile = await service
      .from('user_profiles')
      .select('vendor_id')
      .eq('id', userId)
      .single();
    const vendorRow = await service.from('vendors').select('user_id').eq('id', vendorId).single();
    expect(profile.error).toBeNull();
    expect(vendorRow.error).toBeNull();
    return { vendorId: profile.data!.vendor_id, userId: vendorRow.data!.user_id };
  }

  async function profileVendorId(userId: string) {
    const { data, error } = await service
      .from('user_profiles')
      .select('vendor_id')
      .eq('id', userId)
      .single();
    expect(error).toBeNull();
    return data!.vendor_id;
  }

  async function insertVendor(email: string, userId: string | null = null) {
    const { data, error } = await service
      .from('vendors')
      .insert({
        business_name: `SEC Link ${email}`,
        contact_name: 'Link Contact',
        email,
        user_id: userId,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    return data!.id;
  }

  async function visibleApplications(client: Client, applicationId: string) {
    const { data, error } = await client.from('applications').select('id').eq('id', applicationId);
    expect(error).toBeNull();
    return data ?? [];
  }

  // ---------------------------------------------------------------------------
  // L1 — apply signed in: tied inside the submission (FR-002)
  // ---------------------------------------------------------------------------

  it('L1: a signed-in submission ties the account to the new vendor row', async () => {
    const { data, error } = await submit(u1.client, payload(fx.activeEventId, u1.email));

    expect(error).toBeNull();
    expect(data?.vendor_created).toBe(true);
    v1 = data!.vendor_id;

    expect(await links(u1.userId, v1)).toEqual({ vendorId: v1, userId: u1.userId });
    expect(await visibleApplications(u1.client, data!.application_id)).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // L2 — apply signed out, then the account: handle_new_user ties it (FR-005)
  // ---------------------------------------------------------------------------

  it('L2: an account created after a signed-out submission is tied at creation', async () => {
    const address = emailFor('l2');
    const { data, error } = await submit(anon, payload(fx.activeEventId, address));
    expect(error).toBeNull();

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: address,
      password: 'sec-harness-password',
      email_confirm: true,
    });
    expect(createError).toBeNull();
    fx.authUserIds.push(created.user!.id);

    expect(await links(created.user!.id, data!.vendor_id)).toEqual({
      vendorId: data!.vendor_id,
      userId: created.user!.id,
    });
  });

  // ---------------------------------------------------------------------------
  // L3 — account, then apply signed out, then a dashboard read (FR-001)
  // ---------------------------------------------------------------------------

  it('L3: the self-heal ties an existing account to a later signed-out submission', async () => {
    const { data, error } = await submit(anon, payload(fx.activeEventId, u3.email));
    expect(error).toBeNull();
    v3 = data!.vendor_id;

    expect(await links(u3.userId, v3)).toEqual({ vendorId: null, userId: null });
    expect(await visibleApplications(u3.client, data!.application_id)).toHaveLength(0);

    const healed = await u3.client.rpc('link_vendor_account');
    expect(healed.error).toBeNull();
    expect(healed.data).toBe(v3);
    expect(await links(u3.userId, v3)).toEqual({ vendorId: v3, userId: u3.userId });
    expect(await visibleApplications(u3.client, data!.application_id)).toHaveLength(1);

    // Idempotent: the second call returns the same row and writes nothing.
    const before = await service.from('vendors').select('updated_at').eq('id', v3).single();
    const again = await u3.client.rpc('link_vendor_account');
    expect(again.error).toBeNull();
    expect(again.data).toBe(v3);
    const after = await service.from('vendors').select('updated_at').eq('id', v3).single();
    expect(after.data?.updated_at).toBe(before.data?.updated_at);
  });

  // ---------------------------------------------------------------------------
  // L4 — a mixed-case vendor row is matched case-insensitively
  // ---------------------------------------------------------------------------

  it('L4: the self-heal matches a vendor row whose email differs only in case', async () => {
    // Only a service insert can produce such a row: the form and the submission
    // RPC both lower-case (Clarifications 2026-11-02 Q2). Upper-casing the local
    // part only keeps the run suffix intact for purgeRun.
    const [local, domain] = u4.email.split('@');
    const mixed = `${local!.replace('sec-vendor-user-l4', 'Sec-Vendor-User-L4')}@${domain}`;
    expect(mixed).not.toBe(u4.email);
    expect(mixed.toLowerCase()).toBe(u4.email);
    const v4 = await insertVendor(mixed);

    const healed = await u4.client.rpc('link_vendor_account');

    expect(healed.error).toBeNull();
    expect(healed.data).toBe(v4);
    expect(await links(u4.userId, v4)).toEqual({ vendorId: v4, userId: u4.userId });
  });

  // ---------------------------------------------------------------------------
  // L5 — no match: nothing changes
  // ---------------------------------------------------------------------------

  it('L5: the self-heal returns NULL and changes nothing when no row matches', async () => {
    const healed = await u5.client.rpc('link_vendor_account');

    expect(healed.error).toBeNull();
    expect(healed.data).toBeNull();
    expect(await profileVendorId(u5.userId)).toBeNull();

    const { count } = await service
      .from('vendors')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u5.userId);
    expect(count).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // L6 — a row tied to another account is left alone (FR-004)
  // ---------------------------------------------------------------------------

  it('L6: the self-heal never re-points a row tied to another account', async () => {
    const v6 = await insertVendor(u5.email, u4.userId);

    const healed = await u5.client.rpc('link_vendor_account');

    expect(healed.error).toBeNull();
    expect(healed.data).toBeNull();
    const { data: row } = await service.from('vendors').select('user_id').eq('id', v6).single();
    expect(row?.user_id).toBe(u4.userId);
    expect(await profileVendorId(u5.userId)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // L7 — anon is refused (FR-022)
  // ---------------------------------------------------------------------------

  it('L7: anon cannot call the self-heal', async () => {
    const { error } = await anon.rpc('link_vendor_account');

    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  // ---------------------------------------------------------------------------
  // L8 — only your own account; the helper is not callable (FR-003, FR-022)
  // ---------------------------------------------------------------------------

  it('L8: the self-heal acts only on the caller, and the helper is not exposed', async () => {
    const before = [await links(u1.userId, v1), await links(u3.userId, v3)];

    const healed = await u5.client.rpc('link_vendor_account');
    expect(healed.error).toBeNull();

    const direct = await u5.client.rpc('link_vendor_account_rows', {
      p_vendor_id: v1,
      p_user_id: u5.userId,
    });
    expect(direct.error?.code).toBe(PERMISSION_DENIED);

    const after = [await links(u1.userId, v1), await links(u3.userId, v3)];
    expect(after).toEqual(before);
    expect(await profileVendorId(u5.userId)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // L9 — a tampered address is ignored when signed in (FR-002, SC-003)
  // ---------------------------------------------------------------------------

  it("L9: a signed-in submission lands under the account's address, not the payload's", async () => {
    const stranger = emailFor('stranger');

    // Event B has no questionnaire, so no answers (else P0004).
    const { data, error } = await submit(
      u1.client,
      payload(fx.activeEventBId, stranger, { answers: null })
    );

    expect(error).toBeNull();
    expect(data?.vendor_id).toBe(v1);
    expect(data?.vendor_created).toBe(false);

    const { data: strangerRows } = await service.from('vendors').select('id').eq('email', stranger);
    expect(strangerRows ?? []).toHaveLength(0);

    const { data: application } = await service
      .from('applications')
      .select('vendor_id')
      .eq('id', data!.application_id)
      .single();
    expect(application?.vendor_id).toBe(v1);
  });

  // ---------------------------------------------------------------------------
  // L10 — the fixed form's keys are ignored (FR-019)
  // ---------------------------------------------------------------------------

  it('L10: legacy, attachments and phone in the payload write nothing', async () => {
    const body = payload(fx.activeEventId, emailFor('l10'), {
      legacy: {
        booth_preference: 'indoor',
        product_categories: ['art'],
        special_requirements: 'x',
      },
      attachments: [
        {
          file_name: 'a.png',
          file_path: `${fx.storagePrefix}/l10.png`,
          file_type: 'image/png',
          file_size: 1,
        },
      ],
    });
    (body.vendor as Record<string, unknown>)['phone'] = '403-555-0000';

    const { data, error } = await submit(anon, body);
    expect(error).toBeNull();

    const { data: application } = await service
      .from('applications')
      .select('booth_preference, product_categories, special_requirements')
      .eq('id', data!.application_id)
      .single();
    expect(application?.booth_preference).toBeNull();
    expect(application?.product_categories).toBeNull();
    expect(application?.special_requirements).toBeNull();

    const { count } = await service
      .from('attachments')
      .select('id', { count: 'exact', head: true })
      .eq('application_id', data!.application_id);
    expect(count).toBe(0);

    const { data: vendor } = await service
      .from('vendors')
      .select('phone')
      .eq('id', data!.vendor_id)
      .single();
    expect(vendor?.phone).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // L11 — any role links (Clarifications 2026-10-31 Q3)
  // ---------------------------------------------------------------------------

  it('L11: an organizer account is tied by the self-heal like any other', async () => {
    const { error: promoteError } = await service
      .from('user_profiles')
      .update({ role: 'organizer' })
      .eq('id', u6.userId);
    expect(promoteError).toBeNull();
    const v11 = await insertVendor(u6.email);

    const healed = await u6.client.rpc('link_vendor_account');

    expect(healed.error).toBeNull();
    expect(healed.data).toBe(v11);
    expect(await links(u6.userId, v11)).toEqual({ vendorId: v11, userId: u6.userId });

    const { data: profile } = await service
      .from('user_profiles')
      .select('role')
      .eq('id', u6.userId)
      .single();
    expect(profile?.role).toBe('organizer');
  });
});
