// =============================================================================
// I1–I37 — cross-vendor isolation (spec 012, migration 016)
//
// A signed-in vendor reads only what is theirs: their own vendor record,
// applications, answers and uploaded files. They cannot open, link to, delete
// or claim another vendor's file, cannot list accounts, and never receive
// organizer notes. Nobody deletes a file from a signed-in session, and a
// submission after the deadline day in Edmonton is refused. Organizers and
// admins keep their work, minus file delete and (organizers) the account list.
//
// Callers: A and B (vendor accounts, each tied to its own vendor record by a
// signed-in submission to the fixture event), C (a vendor account with no
// vendor record), ORG (organizer), ADM (admin) and anon. The service client
// builds fixtures and reads ground truth; it is never the caller under test.
// Five sign-ins in this file (GoTrue allows 30 per 5 minutes). Every address
// ends in the run suffix, so purgeRun sweeps any vendor row a submission makes.
//
// Red first (research R10). The 21 cases that state a rule 016 adds were
// written as expected failures by the suite PR (T002): on the 015 schema their
// bodies failed, and CI passing them proved each gap real (quickstart row L1
// records the failing assertion of each). The migration PR (T003) turned each
// into a plain `it(...)` with its body unchanged (row L2). The 16 cases that
// already held were plain `it(...)` throughout, there to catch a later
// loosening.
//
// On 015 several red cases really do what they attempt (remove a file, store a
// submission, write a note or a role). Each puts back only what it changed, in
// a `finally`, so the plain cases after it still hold. After 016 those blocks
// never fire; they stay so one regression cannot cascade into other cases.
//
// Cases depend on running in this order (the file runs sequentially): I2–I4
// before A's later submissions, I13's listing before I15/I20 upload more, I18
// after I17, I20 after I17's cleanup.
//
// Matrix: specs/012-vendor-data-isolation/contracts/security-test-matrix.md
// Contracts: contracts/migration-016.md, contracts/submit-public-application-v3.md
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  stackUp,
  anonClient,
  serviceClient,
  seedFixtures,
  cleanupFixtures,
  createAuthedVendor,
  createAuthedOrganizer,
  createAuthedAdmin,
  type AuthedUser,
  type SecurityFixtures,
} from './harness';
import { todayDateOnly } from '@/lib/format-date';
import type { Database, Json } from '@/types/database';

type Client = SupabaseClient<Database>;

const BUCKET = 'attachments';
const PERMISSION_DENIED = '42501';
const CHECK_VIOLATION = '23514';
const FILE_CLAIMED = 'P0005';
const NOT_ACCEPTING = { code: 'P0001', message: 'Event is not accepting applications' };
const NOTE_A = 'NOTE-A';
const NOTE_B = 'NOTE-B';

/** Uploaded by anon in beforeAll; each body is the object's own name. */
const FIXTURE_OBJECTS = ['a-answer', 'b-answer', 'a-legacy', 'b-legacy', 'orphan'] as const;

/** What a refused download or signed URL looks like through `download` / `sign`. */
const REFUSED = { body: null, refused: true };
/** What a served download or signed URL looks like through `download` / `sign`. */
const served = (name: string) => ({ body: name, refused: false });

/** Unwraps a fixture write, or fails the whole file with what went wrong. */
function must<R extends { data: unknown; error: { message: string } | null }>(
  result: R,
  what: string
): NonNullable<R['data']> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(
      `[vendor isolation] seeding ${what} failed: ${result.error?.message ?? 'no data'}`
    );
  }
  return result.data as NonNullable<R['data']>;
}

describe.runIf(stackUp)('vendor isolation (spec 012)', () => {
  let fx: SecurityFixtures;
  const anon = anonClient();
  const service = serviceClient();

  // The matrix's A, B, C, ORG and ADM.
  let vendorA: AuthedUser;
  let vendorB: AuthedUser;
  let vendorC: AuthedUser;
  let org: AuthedUser;
  let adm: AuthedUser;

  /** A's and B's vendor rows and their applications on the fixture event. */
  let aVendorId: string;
  let bVendorId: string;
  let aAppId: string;
  let bAppId: string;
  /** The fixture questionnaire's optional long_text question (I21). */
  let longTextQuestionId: string;

  /** Event F: active, one optional file question; the claim cases submit here. */
  let eventFId: string;
  let eventFFileQuestionId: string;

  /** Active events with no questionnaire whose deadline was yesterday, is today, is unset. */
  let pastDeadlineEventId: string;
  let todayDeadlineEventId: string;
  let noDeadlineEventId: string;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const objectPath = (name: string) => `${fx.storagePrefix}/${name}`;

  /** An address no account owns, matched by purgeRun's `LIKE %suffix@example.com`. */
  const freshEmail = (local: string) => `sec-iso-${local}-${fx.suffix}@example.com`;

  function fileAnswer(questionId: string, name: string) {
    return {
      event_question_id: questionId,
      value: {
        kind: 'file',
        path: objectPath(name),
        name,
        mimeType: 'text/plain',
        size: name.length,
      },
    };
  }

  function payload(eventId: string, email: string, answers: unknown[]) {
    return {
      event_id: eventId,
      vendor: {
        business_name: `SEC ISO ${email}`,
        contact_name: 'Isolation Contact',
        email,
        description: '',
        product_links: ['https://iso.example'],
      },
      answers,
    };
  }

  function submit(client: Client, body: unknown) {
    return client.rpc('submit_public_application', { p_submission: body as Json }).single();
  }

  function upload(client: Client, name: string) {
    return client.storage
      .from(BUCKET)
      .upload(objectPath(name), new Blob([name], { type: 'text/plain' }), {
        contentType: 'text/plain',
        upsert: false,
      });
  }

  /** What `client` gets when it downloads the object: its body, or a refusal. */
  async function download(client: Client, name: string) {
    const { data, error } = await client.storage.from(BUCKET).download(objectPath(name));
    return { body: data ? await data.text() : null, refused: error !== null };
  }

  /** What `client` gets when it asks for a signed URL and fetches it (HTTP 200 only). */
  async function sign(client: Client, name: string) {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(objectPath(name), 60);
    if (!data?.signedUrl) return { body: null, refused: error !== null };
    const response = await fetch(data.signedUrl);
    return { body: response.status === 200 ? await response.text() : null, refused: false };
  }

  async function remove(client: Client, name: string) {
    const { data } = await client.storage.from(BUCKET).remove([objectPath(name)]);
    // A refusal arrives as an empty list, not an error, when RLS filters the row.
    return data ?? [];
  }

  /** The object names `client` sees under the run prefix, sorted. */
  async function listing(client: Client): Promise<string[]> {
    const { data } = await client.storage.from(BUCKET).list(fx.storagePrefix, { limit: 1000 });
    return (data ?? []).map((o) => o.name).sort();
  }

  /** Service-role ground truth: is the object still in the bucket? */
  async function stored(name: string): Promise<boolean> {
    return (await listing(service)).includes(name);
  }

  /** Puts a fixture object back if a red case removed it on the 015 schema. */
  async function restoreObject(name: string) {
    if (await stored(name)) return;
    const { error } = await upload(service, name);
    if (error) throw new Error(`[vendor isolation] could not restore ${name}: ${error.message}`);
  }

  /** Deletes the applications a red case's own submissions created on the 015 schema. */
  async function deleteApplications(ids: Array<string | undefined>) {
    const created = ids.filter((id): id is string => Boolean(id));
    if (created.length === 0) return;
    await service.from('applications').delete().in('id', created);
  }

  /** Service-role ground truth: the note stored for an application, or null. */
  async function noteOf(applicationId: string): Promise<string | null> {
    const { data, error } = await service
      .from('application_notes')
      .select('notes')
      .eq('application_id', applicationId)
      .maybeSingle();
    expect(error).toBeNull();
    return (data?.notes as string | undefined) ?? null;
  }

  const sortedIds = (rows: Array<{ id: string }> | null) => (rows ?? []).map((r) => r.id).sort();

  // ---------------------------------------------------------------------------
  // Fixtures (security-test-matrix.md "Fixtures")
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    fx = await seedFixtures();

    // Sequential on purpose: each call is one GoTrue sign-in.
    vendorA = await createAuthedVendor(`iso-a-${fx.suffix}`);
    fx.authUserIds.push(vendorA.userId);
    vendorB = await createAuthedVendor(`iso-b-${fx.suffix}`);
    fx.authUserIds.push(vendorB.userId);
    vendorC = await createAuthedVendor(`iso-c-${fx.suffix}`);
    fx.authUserIds.push(vendorC.userId);
    org = await createAuthedOrganizer(`iso-org-${fx.suffix}`);
    fx.authUserIds.push(org.userId);
    adm = await createAuthedAdmin(`iso-adm-${fx.suffix}`);
    fx.authUserIds.push(adm.userId);

    longTextQuestionId = fx.questions.find((q) => q.type === 'long_text')!.id;

    // Event F, built draft-then-published the way seedFixtures builds its event A.
    const eventF = must(
      await service
        .from('events')
        .insert({
          name: `SEC ISO F ${fx.suffix}`,
          event_date: '2030-04-15',
          location: 'Calgary',
          status: 'draft',
        })
        .select('id')
        .single(),
      'event F'
    );
    eventFId = eventF.id;
    fx.extraEventIds.push(eventFId);
    const questionnaireF = must(
      await service
        .from('event_questionnaires')
        .insert({ event_id: eventFId })
        .select('id')
        .single(),
      'event F questionnaire'
    );
    const fileQuestionF = must(
      await service
        .from('event_questions')
        .insert({
          event_questionnaire_id: questionnaireF.id,
          position: 0,
          type: 'file_upload',
          label: 'Product photo',
          required: false,
          options: null,
          show_if: null,
        })
        .select('id')
        .single(),
      'event F question'
    );
    eventFFileQuestionId = fileQuestionF.id;
    must(
      await service
        .from('events')
        .update({ status: 'active' })
        .eq('id', eventFId)
        .select('id')
        .single(),
      'event F publish'
    );

    // Three deadline events. "Today" is the Edmonton calendar day; "yesterday" is
    // computed on that date string in UTC, never from the machine's local clock.
    const today = todayDateOnly();
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const deadlineEvents = must(
      await service
        .from('events')
        .insert(
          (
            [
              ['past', yesterday],
              ['today', today],
              ['open', null],
            ] as const
          ).map(([label, deadline]) => ({
            name: `SEC ISO ${label} ${fx.suffix}`,
            event_date: '2030-05-15',
            location: 'Calgary',
            status: 'active',
            application_deadline: deadline,
          }))
        )
        .select('id, name'),
      'deadline events'
    );
    const eventIdByName = new Map(deadlineEvents.map((e) => [e.name, e.id]));
    pastDeadlineEventId = eventIdByName.get(`SEC ISO past ${fx.suffix}`)!;
    todayDeadlineEventId = eventIdByName.get(`SEC ISO today ${fx.suffix}`)!;
    noDeadlineEventId = eventIdByName.get(`SEC ISO open ${fx.suffix}`)!;
    fx.extraEventIds.push(pastDeadlineEventId, todayDeadlineEventId, noDeadlineEventId);

    for (const name of FIXTURE_OBJECTS) {
      const { error } = await upload(anon, name);
      if (error) throw new Error(`[vendor isolation] upload of ${name} failed: ${error.message}`);
    }

    // A and B apply signed in, which ties each account to its new vendor row.
    const requiredAnswers = (fileName: string) => [
      {
        event_question_id: fx.requiredTextQuestionId,
        value: { kind: 'text', value: 'Isolation booth' },
      },
      {
        event_question_id: fx.requiredMultiSelectQuestionId,
        value: { kind: 'choices', value: ['art'] },
      },
      fileAnswer(fx.requiredFileQuestionId, fileName),
    ];
    const submittedA = must(
      await submit(
        vendorA.client,
        payload(fx.activeEventId, vendorA.email, requiredAnswers('a-answer'))
      ),
      'A submission'
    );
    aVendorId = submittedA.vendor_id;
    aAppId = submittedA.application_id;
    const submittedB = must(
      await submit(
        vendorB.client,
        payload(fx.activeEventId, vendorB.email, requiredAnswers('b-answer'))
      ),
      'B submission'
    );
    bVendorId = submittedB.vendor_id;
    bAppId = submittedB.application_id;

    const ties = must(
      await service.from('vendors').select('id, user_id').in('id', [aVendorId, bVendorId]),
      'tie read'
    );
    const tiedTo = new Map(ties.map((v) => [v.id, v.user_id]));
    if (tiedTo.get(aVendorId) !== vendorA.userId || tiedTo.get(bVendorId) !== vendorB.userId) {
      throw new Error('[vendor isolation] A or B is not tied to their vendor row');
    }

    // The second reference kind (FR-007): an attachments row per application.
    must(
      await service
        .from('attachments')
        .insert([
          {
            application_id: aAppId,
            file_name: 'a-legacy',
            file_path: objectPath('a-legacy'),
            file_type: 'text/plain',
            file_size: 'a-legacy'.length,
          },
          {
            application_id: bAppId,
            file_name: 'b-legacy',
            file_path: objectPath('b-legacy'),
            file_type: 'text/plain',
            file_size: 'b-legacy'.length,
          },
        ])
        .select('id'),
      'legacy attachments'
    );

    // Since 016 a note is a row of application_notes; the old column is locked
    // (T003 moved this seed from applications.organizer_notes — a fixture edit,
    // not a change to any case body).
    for (const [applicationId, note] of [
      [aAppId, NOTE_A],
      [bAppId, NOTE_B],
    ] as const) {
      must(
        await service
          .from('application_notes')
          .insert({ application_id: applicationId, notes: note })
          .select('application_id')
          .single(),
        'note'
      );
    }

    const template = must(
      await org.client
        .from('questionnaire_templates')
        .insert({ name: `SEC ISO template ${fx.suffix}`, created_by: org.userId })
        .select('id')
        .single(),
      'template'
    );
    fx.extraTemplateIds.push(template.id);
  });

  afterAll(async () => {
    await cleanupFixtures(fx);
  });

  // ---------------------------------------------------------------------------
  // Table reads (FR-014, FR-016, FR-017)
  // ---------------------------------------------------------------------------

  it('I1: a vendor reads only their own vendor record', async () => {
    const all = await vendorA.client.from('vendors').select('id');
    expect(all.error).toBeNull();
    expect(sortedIds(all.data)).toEqual([aVendorId]);

    const other = await vendorA.client.from('vendors').select('id').eq('id', bVendorId);
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
  });

  it('I2: a vendor reads only their own applications', async () => {
    const all = await vendorA.client.from('applications').select('id');
    expect(all.error).toBeNull();
    expect(sortedIds(all.data)).toEqual([aAppId]);

    const other = await vendorA.client.from('applications').select('id').eq('id', bAppId);
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
  });

  it('I3: a vendor reads only the answers of their own application', async () => {
    const all = await vendorA.client.from('application_answers').select('application_id');
    expect(all.error).toBeNull();
    expect(all.data).toHaveLength(3);
    expect(new Set(all.data?.map((r) => r.application_id))).toEqual(new Set([aAppId]));

    const other = await vendorA.client
      .from('application_answers')
      .select('application_id')
      .eq('application_id', bAppId);
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
  });

  it('I4: a vendor reads only their own file records', async () => {
    const all = await vendorA.client.from('attachments').select('application_id, file_path');
    expect(all.error).toBeNull();
    expect(all.data).toEqual([{ application_id: aAppId, file_path: objectPath('a-legacy') }]);

    const other = await vendorA.client
      .from('attachments')
      .select('application_id')
      .eq('application_id', bAppId);
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
  });

  it("I5: organizers and admins read both vendors' rows in all four tables", async () => {
    for (const caller of [org, adm]) {
      const [vendors, applications, answers, attachments] = await Promise.all([
        caller.client.from('vendors').select('id').in('id', [aVendorId, bVendorId]),
        caller.client.from('applications').select('id').in('id', [aAppId, bAppId]),
        caller.client
          .from('application_answers')
          .select('application_id')
          .in('application_id', [aAppId, bAppId]),
        caller.client
          .from('attachments')
          .select('application_id')
          .in('application_id', [aAppId, bAppId]),
      ]);
      expect(sortedIds(vendors.data)).toEqual([aVendorId, bVendorId].sort());
      expect(sortedIds(applications.data)).toEqual([aAppId, bAppId].sort());
      expect(answers.data).toHaveLength(6);
      expect(new Set(answers.data?.map((r) => r.application_id))).toEqual(
        new Set([aAppId, bAppId])
      );
      expect(new Set(attachments.data?.map((r) => r.application_id))).toEqual(
        new Set([aAppId, bAppId])
      );
    }
  });

  it('I6: anon and an account with no vendor record read nothing from the four tables', async () => {
    for (const client of [anon, vendorC.client]) {
      const reads = await Promise.all([
        client.from('vendors').select('*'),
        client.from('applications').select('*'),
        client.from('application_answers').select('*'),
        client.from('attachments').select('*'),
      ]);
      for (const { data, error } of reads) {
        // anon's refusal shape follows anon-reads R1; C must get an empty answer.
        if (client !== anon) expect(error).toBeNull();
        expect(data ?? []).toEqual([]);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Files (FR-001, FR-003 to FR-007)
  // ---------------------------------------------------------------------------

  it('I7: a vendor downloads and links their own files', async () => {
    expect(await download(vendorA.client, 'a-answer')).toEqual(served('a-answer'));
    expect(await download(vendorA.client, 'a-legacy')).toEqual(served('a-legacy'));
    expect(await sign(vendorA.client, 'a-answer')).toEqual(served('a-answer'));
  });

  it("I8: a vendor cannot download or link another vendor's files", async () => {
    expect(await download(vendorA.client, 'b-answer')).toEqual(REFUSED);
    expect(await download(vendorA.client, 'b-legacy')).toEqual(REFUSED);
    expect(await sign(vendorA.client, 'b-answer')).toEqual(REFUSED);
    expect(await sign(vendorA.client, 'b-legacy')).toEqual(REFUSED);
  });

  it("I9: a vendor cannot delete another vendor's file", async () => {
    try {
      expect(await remove(vendorA.client, 'b-answer')).toEqual([]);
      expect(await stored('b-answer')).toBe(true);
      expect(await download(vendorB.client, 'b-answer')).toEqual(served('b-answer'));
      expect(await download(org.client, 'b-answer')).toEqual(served('b-answer'));
    } finally {
      await restoreObject('b-answer');
    }
  });

  it('I10: a vendor cannot delete their own file', async () => {
    try {
      expect(await remove(vendorA.client, 'a-answer')).toEqual([]);
      expect(await stored('a-answer')).toBe(true);
      expect(await download(vendorA.client, 'a-answer')).toEqual(served('a-answer'));
    } finally {
      await restoreObject('a-answer');
    }
  });

  it('I11: organizers and admins cannot delete a file from a session', async () => {
    // Objects of the case's own, never a fixture object.
    for (const [caller, name] of [
      [org, 'org-remove'],
      [adm, 'adm-remove'],
    ] as const) {
      const { error } = await upload(anon, name);
      expect(error).toBeNull();
      expect(await remove(caller.client, name)).toEqual([]);
      expect(await stored(name)).toBe(true);
    }
  });

  it('I12: organizers and admins download and link every file, referenced or not', async () => {
    for (const caller of [org, adm]) {
      for (const name of ['a-answer', 'b-legacy', 'orphan']) {
        expect(await download(caller.client, name)).toEqual(served(name));
        expect(await sign(caller.client, name)).toEqual(served(name));
      }
    }
  });

  it('I13: a vendor cannot open or list a file no application of theirs refers to', async () => {
    expect(await download(vendorA.client, 'orphan')).toEqual(REFUSED);
    expect(await sign(vendorA.client, 'orphan')).toEqual(REFUSED);
    expect(await listing(vendorA.client)).toEqual(['a-answer', 'a-legacy']);
  });

  it('I14: an account with no vendor record cannot open any file', async () => {
    for (const name of ['a-answer', 'orphan']) {
      expect(await download(vendorC.client, name)).toEqual(REFUSED);
      expect(await sign(vendorC.client, name)).toEqual(REFUSED);
    }
  });

  it('I15: anyone may upload; anon still cannot download, link or delete', async () => {
    for (const [client, name] of [
      [anon, 'anon-upload'],
      [vendorA.client, 'a-upload'],
      [org.client, 'org-upload'],
    ] as const) {
      const { error } = await upload(client, name);
      expect(error).toBeNull();
      expect(await stored(name)).toBe(true);
    }

    expect(await download(anon, 'a-answer')).toEqual(REFUSED);
    expect(await sign(anon, 'a-answer')).toEqual(REFUSED);
    expect(await remove(anon, 'a-answer')).toEqual([]);
    expect(await stored('a-answer')).toBe(true);
  });

  it("I16: a vendor cannot overwrite another vendor's file", async () => {
    const body = new Blob(['written by A'], { type: 'text/plain' });
    for (const upsert of [false, true]) {
      const { error } = await vendorA.client.storage
        .from(BUCKET)
        .upload(objectPath('b-answer'), body, { contentType: 'text/plain', upsert });
      expect(error).not.toBeNull();
    }
    expect(await download(vendorB.client, 'b-answer')).toEqual(served('b-answer'));
  });

  // ---------------------------------------------------------------------------
  // Claims and direct writes (FR-002, FR-030)
  // ---------------------------------------------------------------------------

  it("I17: a submission naming another vendor's file is refused", async () => {
    let created: string | undefined;
    try {
      const { data, error } = await submit(
        vendorA.client,
        payload(eventFId, vendorA.email, [fileAnswer(eventFFileQuestionId, 'b-answer')])
      );
      created = data?.application_id;
      expect(error?.code).toBe(FILE_CLAIMED);

      const { data: onF } = await service
        .from('applications')
        .select('id')
        .eq('event_id', eventFId)
        .eq('vendor_id', aVendorId);
      expect(onF ?? []).toEqual([]);
      const { data: references } = await service
        .from('application_answers')
        .select('application_id')
        .eq('value->>path', objectPath('b-answer'));
      expect(references?.map((r) => r.application_id)).toEqual([bAppId]);
    } finally {
      await deleteApplications([created]);
    }
  });

  it("I18: after the refused claim the file is still only B's", async () => {
    expect(await download(vendorA.client, 'b-answer')).toEqual(REFUSED);
    expect(await download(vendorB.client, 'b-answer')).toEqual(served('b-answer'));
  });

  it('I19: every caller is refused a claim on a file another application refers to', async () => {
    const fresh = freshEmail('i19');
    const created: Array<string | undefined> = [];
    try {
      const byAnon = await submit(
        anon,
        payload(eventFId, fresh, [fileAnswer(eventFFileQuestionId, 'b-answer')])
      );
      created.push(byAnon.data?.application_id);
      expect(byAnon.error?.code).toBe(FILE_CLAIMED);

      const byOrg = await submit(
        org.client,
        payload(eventFId, org.email, [fileAnswer(eventFFileQuestionId, 'b-answer')])
      );
      created.push(byOrg.data?.application_id);
      expect(byOrg.error?.code).toBe(FILE_CLAIMED);

      const legacy = await submit(
        anon,
        payload(eventFId, fresh, [fileAnswer(eventFFileQuestionId, 'b-legacy')])
      );
      created.push(legacy.data?.application_id);
      expect(legacy.error?.code).toBe(FILE_CLAIMED);

      const { data: vendors } = await service.from('vendors').select('id').eq('email', fresh);
      expect(vendors ?? []).toEqual([]);
    } finally {
      await deleteApplications(created);
    }
  });

  it('I20: a refused submission leaves an unclaimed file free to use', async () => {
    const { error: uploadError } = await upload(vendorA.client, 'a-new');
    expect(uploadError).toBeNull();

    const toDraft = await submit(
      vendorA.client,
      payload(fx.draftEventId, vendorA.email, [fileAnswer(eventFFileQuestionId, 'a-new')])
    );
    expect(toDraft.error?.code).toBe(NOT_ACCEPTING.code);

    const toF = await submit(
      vendorA.client,
      payload(eventFId, vendorA.email, [fileAnswer(eventFFileQuestionId, 'a-new')])
    );
    expect(toF.error).toBeNull();
    expect(await download(vendorA.client, 'a-new')).toEqual(served('a-new'));
  });

  it('I21: a vendor cannot add applications, answers or file records directly', async () => {
    // Plain inserts, no `.select()`: INSERT … RETURNING would also apply the
    // SELECT policies and could refuse a row for a reason other than the rule.
    try {
      const attachment = await vendorA.client.from('attachments').insert({
        application_id: aAppId,
        file_name: 'b-answer',
        file_path: objectPath('b-answer'),
        file_type: 'text/plain',
        file_size: 'b-answer'.length,
      });
      expect(attachment.error?.code).toBe(PERMISSION_DENIED);

      const answer = await vendorA.client.from('application_answers').insert({
        application_id: bAppId,
        event_question_id: longTextQuestionId,
        value: { kind: 'text', value: 'written by A' },
      });
      expect(answer.error?.code).toBe(PERMISSION_DENIED);

      const application = await vendorA.client.from('applications').insert({
        event_id: pastDeadlineEventId,
        vendor_id: aVendorId,
        status: 'pending',
      });
      expect(application.error?.code).toBe(PERMISSION_DENIED);

      const [attachments, answers, applications] = await Promise.all([
        service
          .from('attachments')
          .select('id')
          .eq('application_id', aAppId)
          .eq('file_path', objectPath('b-answer')),
        service
          .from('application_answers')
          .select('id')
          .eq('application_id', bAppId)
          .eq('event_question_id', longTextQuestionId),
        service.from('applications').select('id').eq('event_id', pastDeadlineEventId),
      ]);
      expect(attachments.data ?? []).toEqual([]);
      expect(answers.data ?? []).toEqual([]);
      expect(applications.data ?? []).toEqual([]);
      expect(await download(vendorA.client, 'b-answer')).toEqual(REFUSED);
    } finally {
      await Promise.all([
        service
          .from('attachments')
          .delete()
          .eq('application_id', aAppId)
          .eq('file_path', objectPath('b-answer')),
        service
          .from('application_answers')
          .delete()
          .eq('application_id', bAppId)
          .eq('event_question_id', longTextQuestionId),
        service
          .from('applications')
          .delete()
          .eq('event_id', pastDeadlineEventId)
          .eq('vendor_id', aVendorId),
      ]);
    }
  });

  it('I22: an organizer still adds a file record directly', async () => {
    const path = objectPath('org-record');
    try {
      const { error } = await org.client.from('attachments').insert({
        application_id: bAppId,
        file_name: 'org-record',
        file_path: path,
        file_type: 'text/plain',
        file_size: 'org-record'.length,
      });
      expect(error).toBeNull();
      const { data } = await service.from('attachments').select('id').eq('file_path', path);
      expect(data ?? []).toHaveLength(1);
    } finally {
      await service.from('attachments').delete().eq('file_path', path);
    }
  });

  // ---------------------------------------------------------------------------
  // Organizer notes (FR-012, FR-013, FR-015)
  // ---------------------------------------------------------------------------

  it('I23: a vendor never reads the organizer note on their own application', async () => {
    const named = await vendorA.client
      .from('applications')
      .select('id, organizer_notes')
      .eq('id', aAppId)
      .single();
    expect(named.error).toBeNull();
    expect(named.data?.organizer_notes).toBeNull();

    const everything = await vendorA.client
      .from('applications')
      .select('*')
      .eq('id', aAppId)
      .single();
    expect(everything.error).toBeNull();
    expect(Object.values(everything.data ?? {})).not.toContain(NOTE_A);
  });

  it('I24: a vendor reads no notes, and anon is refused the notes table', async () => {
    const all = await vendorA.client.from('application_notes').select('*');
    expect(all.error).toBeNull();
    expect(all.data).toEqual([]);

    const own = await vendorA.client
      .from('application_notes')
      .select('*')
      .eq('application_id', aAppId);
    expect(own.error).toBeNull();
    expect(own.data).toEqual([]);

    const byAnon = await anon.from('application_notes').select('*');
    expect(byAnon.error?.code).toBe(PERMISSION_DENIED);
  });

  it('I25: organizers and admins read each note as one embedded object', async () => {
    for (const caller of [org, adm]) {
      const { data, error } = await caller.client
        .from('applications')
        .select('id, application_notes ( notes )')
        .in('id', [aAppId, bAppId]);
      expect(error).toBeNull();
      const byId = new Map((data ?? []).map((row) => [row.id, row.application_notes]));
      expect(Array.isArray(byId.get(aAppId))).toBe(false);
      expect(byId.get(aAppId)).toEqual({ notes: NOTE_A });
      expect(byId.get(bAppId)).toEqual({ notes: NOTE_B });
    }
  });

  it('I26: organizers and admins write notes', async () => {
    // Ends where it started (NOTE-A, NOTE-B), so I27 compares against constants.
    const edited = 'NOTE-A edited by ORG';
    const upserted = await org.client
      .from('application_notes')
      .upsert({ application_id: aAppId, notes: edited }, { onConflict: 'application_id' });
    expect(upserted.error).toBeNull();
    expect(await noteOf(aAppId)).toBe(edited);

    const deleted = await org.client
      .from('application_notes')
      .delete()
      .eq('application_id', bAppId);
    expect(deleted.error).toBeNull();
    expect(await noteOf(bAppId)).toBeNull();

    const inserted = await org.client
      .from('application_notes')
      .insert({ application_id: bAppId, notes: NOTE_B });
    expect(inserted.error).toBeNull();
    expect(await noteOf(bAppId)).toBe(NOTE_B);

    const updated = await adm.client
      .from('application_notes')
      .update({ notes: NOTE_A })
      .eq('application_id', aAppId);
    expect(updated.error).toBeNull();
    expect(await noteOf(aAppId)).toBe(NOTE_A);
  });

  it('I27: a vendor cannot write notes, and the old column takes nothing', async () => {
    for (const applicationId of [aAppId, bAppId]) {
      const row = { application_id: applicationId, notes: 'written by A' };

      const inserted = await vendorA.client.from('application_notes').insert(row);
      expect(inserted.error?.code).toBe(PERMISSION_DENIED);

      const upserted = await vendorA.client
        .from('application_notes')
        .upsert(row, { onConflict: 'application_id' });
      expect(upserted.error?.code).toBe(PERMISSION_DENIED);

      const updated = await vendorA.client
        .from('application_notes')
        .update({ notes: 'written by A' })
        .eq('application_id', applicationId)
        .select('application_id');
      expect(updated.error).toBeNull();
      expect(updated.data).toEqual([]);

      const deleted = await vendorA.client
        .from('application_notes')
        .delete()
        .eq('application_id', applicationId)
        .select('application_id');
      expect(deleted.error).toBeNull();
      expect(deleted.data).toEqual([]);
    }

    const byAnon = await anon
      .from('application_notes')
      .insert({ application_id: aAppId, notes: 'written by anon' });
    expect(byAnon.error?.code).toBe(PERMISSION_DENIED);

    const column = await vendorA.client
      .from('applications')
      .update({ organizer_notes: 'written by A' })
      .eq('id', aAppId)
      .select('id');
    expect(column.data ?? []).toEqual([]);

    expect(await noteOf(aAppId)).toBe(NOTE_A);
    expect(await noteOf(bAppId)).toBe(NOTE_B);
    const { data: application } = await service
      .from('applications')
      .select('organizer_notes')
      .eq('id', aAppId)
      .single();
    expect(application?.organizer_notes).toBeNull();
  });

  it('I28: the application record can never hold a note again', async () => {
    let written = false;
    try {
      const { error } = await service
        .from('applications')
        .update({ organizer_notes: 'written by service' })
        .eq('id', aAppId);
      written = error === null;
      expect(error?.code).toBe(CHECK_VIOLATION);
    } finally {
      if (written) {
        await service.from('applications').update({ organizer_notes: NOTE_A }).eq('id', aAppId);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // The account list and template creators (FR-008 to FR-011)
  // ---------------------------------------------------------------------------

  it('I29: a vendor cannot list accounts, not even their own', async () => {
    const all = await vendorA.client.from('users_with_roles').select('id');
    expect(all.error).toBeNull();
    expect(all.data).toEqual([]);

    const own = await vendorA.client.from('users_with_roles').select('id').eq('id', vendorA.userId);
    expect(own.error).toBeNull();
    expect(own.data).toEqual([]);
  });

  it('I30: an organizer cannot list accounts', async () => {
    const all = await org.client.from('users_with_roles').select('id');
    expect(all.error).toBeNull();
    expect(all.data).toEqual([]);
  });

  it('I31: an admin lists every account, the same rows the service role sees', async () => {
    const runIds = [vendorA, vendorB, vendorC, org, adm].map((u) => u.userId);
    const columns = 'id, email, role, invite_pending';
    const byAdmin = await adm.client
      .from('users_with_roles')
      .select(columns)
      .in('id', runIds)
      .order('id');
    const byService = await service
      .from('users_with_roles')
      .select(columns)
      .in('id', runIds)
      .order('id');

    expect(byAdmin.error).toBeNull();
    expect(byAdmin.data).toHaveLength(5);
    for (const row of byAdmin.data ?? []) {
      expect(row.email).toBeTruthy();
      expect(row.role).toBeTruthy();
      expect(typeof row.invite_pending).toBe('boolean');
    }
    expect(byAdmin.data).toEqual(byService.data);
  });

  it('I32: anon is refused the account list', async () => {
    const { error } = await anon.from('users_with_roles').select('id');
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it('I33: the account list follows a role change on the next request', async () => {
    try {
      const promote = await service
        .from('user_profiles')
        .update({ role: 'admin' })
        .eq('id', vendorC.userId);
      expect(promote.error).toBeNull();
      const asAdmin = await vendorC.client
        .from('users_with_roles')
        .select('id')
        .eq('id', vendorC.userId);
      expect(asAdmin.error).toBeNull();
      expect(asAdmin.data).toEqual([{ id: vendorC.userId }]);

      const demote = await service
        .from('user_profiles')
        .update({ role: 'vendor' })
        .eq('id', vendorC.userId);
      expect(demote.error).toBeNull();
      const asVendor = await vendorC.client
        .from('users_with_roles')
        .select('id')
        .eq('id', vendorC.userId);
      expect(asVendor.error).toBeNull();
      expect(asVendor.data).toEqual([]);
    } finally {
      await service.from('user_profiles').update({ role: 'vendor' }).eq('id', vendorC.userId);
    }
  });

  it('I34: organizers and admins read template creators by id and address only', async () => {
    const nonCreators = [vendorA, vendorB, vendorC, adm].map((u) => u.userId);
    for (const caller of [org, adm]) {
      const { data, error } = await caller.client.rpc('template_creator_emails');
      expect(error).toBeNull();
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      for (const row of rows) expect(Object.keys(row).sort()).toEqual(['creator_id', 'email']);
      expect(rows.filter((r) => r['creator_id'] === org.userId)).toEqual([
        { creator_id: org.userId, email: org.email },
      ]);
      expect(rows.filter((r) => nonCreators.includes(r['creator_id'] as string))).toEqual([]);
    }

    const byVendor = await vendorA.client.rpc('template_creator_emails');
    expect(byVendor.error?.code).toBe(PERMISSION_DENIED);
    const byAnon = await anon.rpc('template_creator_emails');
    expect(byAnon.error?.code).toBe(PERMISSION_DENIED);
  });

  // ---------------------------------------------------------------------------
  // The deadline (FR-018 to FR-020)
  // ---------------------------------------------------------------------------

  it('I35: a submission after the deadline day is refused for every caller', async () => {
    const created: Array<string | undefined> = [];
    try {
      for (const [client, email] of [
        [anon, freshEmail('i35')],
        [vendorA.client, vendorA.email],
        [org.client, org.email],
      ] as const) {
        const { data, error } = await submit(client, payload(pastDeadlineEventId, email, []));
        created.push(data?.application_id);
        expect({ code: error?.code, message: error?.message }).toEqual(NOT_ACCEPTING);
      }

      const { count } = await service
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', pastDeadlineEventId);
      expect(count).toBe(0);
    } finally {
      await deleteApplications(created);
    }
  });

  it('I36: a submission on the deadline day, or with no deadline, is accepted', async () => {
    const fresh = freshEmail('i36');
    for (const [client, email, eventId] of [
      [anon, fresh, todayDeadlineEventId],
      [anon, fresh, noDeadlineEventId],
      [vendorA.client, vendorA.email, todayDeadlineEventId],
      [org.client, org.email, noDeadlineEventId],
    ] as const) {
      const { error } = await submit(client, payload(eventId, email, []));
      expect(error).toBeNull();
    }

    // The organizer now holds a vendor record of its own and still reads B's
    // file (edge case "An organizer who also has a vendor record").
    const { data: orgVendor } = await service
      .from('vendors')
      .select('id')
      .eq('user_id', org.userId);
    expect(orgVendor ?? []).toHaveLength(1);
    expect(await download(org.client, 'b-answer')).toEqual(served('b-answer'));
  });

  it('I37: a submission to an event that is not active is refused the same way', async () => {
    const { error } = await submit(anon, payload(fx.draftEventId, freshEmail('i37'), []));
    expect({ code: error?.code, message: error?.message }).toEqual(NOT_ACCEPTING);
  });
});
