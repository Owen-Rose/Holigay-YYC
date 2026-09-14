// =============================================================================
// Security-suite harness — spec 006, T010
//
// These suites talk to the REAL local Supabase stack, not mocks: RLS policies
// and SECURITY DEFINER grants are exactly the things a mock cannot prove.
//
// Behaviour by environment:
//   * stack down, local          -> `stackUp` is false, suites self-skip via
//                                   `describe.runIf(stackUp)` (US4-AC4)
//   * stack down, CI             -> CI_REQUIRE_SECURITY_TESTS=1 makes this
//                                   module throw, so the gate can never
//                                   silently pass (FR-012)
//   * non-local SUPABASE_URL     -> throws immediately; see the guard below
//
// See specs/006-close-public-data-exposure/contracts/security-test-matrix.md
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type Client = SupabaseClient<Database>;

// -----------------------------------------------------------------------------
// Environment
// -----------------------------------------------------------------------------

// The Supabase CLI's local demo JWTs. These are published, deterministic
// constants baked into every local stack — not secrets — which is why the
// security job needs no CI secrets at all. Source: `supabase status -o env`.
const DEMO_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const DEMO_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// Deliberately NOT NEXT_PUBLIC_SUPABASE_URL: .env.local points that at the
// hosted dev project, and this harness seeds and deletes rows.
export const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env['SUPABASE_ANON_KEY'] ?? DEMO_ANON_KEY;
const SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? DEMO_SERVICE_ROLE_KEY;

const REQUIRE_SECURITY_TESTS = process.env['CI_REQUIRE_SECURITY_TESTS'] === '1';

// Hard guard: this harness truncates fixture data in afterAll. Pointing it at a
// hosted project would delete real rows, so refuse anything but a local stack.
if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(SUPABASE_URL)) {
  throw new Error(
    `[security harness] refusing to run against non-local SUPABASE_URL "${SUPABASE_URL}". ` +
      'These suites seed and delete data and must only ever target the local stack.'
  );
}

// -----------------------------------------------------------------------------
// Stack probe
// -----------------------------------------------------------------------------

const PROBE_TIMEOUT_MS = 2_000;

async function probeStack(): Promise<boolean> {
  try {
    const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      signal,
      headers: { apikey: ANON_KEY },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** True when the local Supabase stack answered its health check. */
export const stackUp = await probeStack();

if (REQUIRE_SECURITY_TESTS && !stackUp) {
  throw new Error(
    `[security harness] CI_REQUIRE_SECURITY_TESTS=1 but no Supabase stack answered at ${SUPABASE_URL}. ` +
      'The security suite must not be skipped in CI (FR-012).'
  );
}

// -----------------------------------------------------------------------------
// Clients
// -----------------------------------------------------------------------------

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** The public key a browser holds. The subject under test in every suite. */
export function anonClient(): Client {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, clientOptions);
}

/**
 * Bypasses RLS. Fixtures, ground-truth assertions, and cleanup ONLY —
 * never the client under test.
 */
export function serviceClient(): Client {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, clientOptions);
}

export type AuthedOrganizer = {
  client: Client;
  userId: string;
  email: string;
};

/**
 * Creates a confirmed auth user, promotes it to `organizer` in user_profiles
 * (handle_new_user has already inserted the row as `vendor`), and returns a
 * client carrying its session.
 *
 * Note: [auth.rate_limit] sign_in_sign_ups is 30 per 5 minutes — call this once
 * per suite file, never per test.
 */
export async function createAuthedOrganizer(suffix: string): Promise<AuthedOrganizer> {
  const service = serviceClient();
  const email = `sec-organizer-${suffix}@example.com`;
  const password = 'sec-harness-password';

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`[security harness] could not create organizer: ${createError?.message}`);
  }

  const { error: roleError } = await service
    .from('user_profiles')
    .update({ role: 'organizer' })
    .eq('id', created.user.id);
  if (roleError) {
    throw new Error(`[security harness] could not promote organizer: ${roleError.message}`);
  }

  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, clientOptions);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`[security harness] organizer sign-in failed: ${signInError.message}`);
  }

  return { client, userId: created.user.id, email };
}

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

export type SeededQuestion = {
  id: string;
  position: number;
  type: Database['public']['Enums']['question_type'];
  required: boolean;
  label: string;
};

export type SecurityFixtures = {
  /** Unique per run; embedded in every seeded name/email so cleanup is precise. */
  suffix: string;
  /** Active event carrying the questionnaire — the main submission target. */
  activeEventId: string;
  activeEventName: string;
  /** Draft event — submissions against it must be rejected (P0001). */
  draftEventId: string;
  /** Second active event — the returning-vendor case (S3/S4). */
  activeEventBId: string;
  questionnaireId: string;
  /** One question per AnswerValue kind, ordered by position. */
  questions: SeededQuestion[];
  requiredTextQuestionId: string;
  requiredMultiSelectQuestionId: string;
  requiredFileQuestionId: string;
  /**
   * A pre-existing submission on the active event. R1/D1 need real rows in the
   * four private tables to prove anon reads return zero rows while data exists.
   */
  seededVendorId: string;
  seededVendorEmail: string;
  seededApplicationId: string;
  /** Storage prefix owned by this run; cleanup removes everything beneath it. */
  storagePrefix: string;
  /** Extra auth users to delete in cleanup (push organizer ids here). */
  authUserIds: string[];
};

/** One question per AnswerValue kind; required text / multi-select / file per R14. */
const QUESTION_SPECS: Array<{
  type: Database['public']['Enums']['question_type'];
  label: string;
  required: boolean;
  options: Array<{ key: string; label: string }> | null;
}> = [
  { type: 'short_text', label: 'Booth name', required: true, options: null },
  { type: 'long_text', label: 'Tell us about your products', required: false, options: null },
  { type: 'number', label: 'Years trading', required: false, options: null },
  { type: 'date', label: 'Preferred setup date', required: false, options: null },
  {
    type: 'single_select',
    label: 'Booth size',
    required: false,
    options: [
      { key: 'small', label: 'Small' },
      { key: 'large', label: 'Large' },
    ],
  },
  {
    type: 'multi_select',
    label: 'Product categories',
    required: true,
    options: [
      { key: 'art', label: 'Art' },
      { key: 'food', label: 'Food' },
      { key: 'apparel', label: 'Apparel' },
    ],
  },
  { type: 'yes_no', label: 'Need power?', required: false, options: null },
  { type: 'file_upload', label: 'Product photo', required: true, options: null },
];

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Best-effort removal of everything a run owns. Warns rather than throws. */
async function purgeRun(suffix: string, eventIds: string[]): Promise<void> {
  const service = serviceClient();

  const { error: eventsError } = await service.from('events').delete().in('id', eventIds);
  if (eventsError) {
    console.warn(`[security harness] could not delete seeded events: ${eventsError.message}`);
  }

  const { error: vendorsError } = await service
    .from('vendors')
    .delete()
    .like('email', `%${suffix}@example.com`);
  if (vendorsError) {
    console.warn(`[security harness] could not delete seeded vendors: ${vendorsError.message}`);
  }
}

/**
 * Seeds the full fixture set with the service client. Call from `beforeAll`;
 * pass the result to `cleanupFixtures` in `afterAll`.
 */
export async function seedFixtures(): Promise<SecurityFixtures> {
  const service = serviceClient();
  const suffix = uniqueSuffix();

  const fail = (what: string, message?: string): never => {
    throw new Error(`[security harness] seeding ${what} failed: ${message ?? 'unknown error'}`);
  };

  // Events. A starts as draft so the questionnaire can be built the way an
  // organizer really builds it, then is published — which fires
  // lock_event_questionnaire_on_publish, exactly as in production.
  const { data: events, error: eventsError } = await service
    .from('events')
    .insert([
      {
        name: `SEC Active A ${suffix}`,
        event_date: '2030-01-15',
        location: 'Calgary',
        status: 'draft',
      },
      {
        name: `SEC Draft D ${suffix}`,
        event_date: '2030-02-15',
        location: 'Calgary',
        status: 'draft',
      },
      {
        name: `SEC Active B ${suffix}`,
        event_date: '2030-03-15',
        location: 'Calgary',
        status: 'active',
      },
    ])
    .select('id, name');
  if (eventsError || !events) fail('events', eventsError?.message);

  const idByName = new Map(events!.map((e) => [e.name, e.id]));
  const activeEventName = `SEC Active A ${suffix}`;
  const activeEventId = idByName.get(activeEventName)!;
  const draftEventId = idByName.get(`SEC Draft D ${suffix}`)!;
  const activeEventBId = idByName.get(`SEC Active B ${suffix}`)!;

  // From here on the run owns real rows. If any later step throws, afterAll
  // never receives a fixture object and could not clean up, so unwind here.
  try {
    // Questionnaire + questions for event A (still draft at this point).
    const { data: questionnaire, error: qError } = await service
      .from('event_questionnaires')
      .insert({ event_id: activeEventId })
      .select('id')
      .single();
    if (qError || !questionnaire) fail('questionnaire', qError?.message);

    const { data: questions, error: questionsError } = await service
      .from('event_questions')
      .insert(
        QUESTION_SPECS.map((spec, position) => ({
          event_questionnaire_id: questionnaire!.id,
          position,
          type: spec.type,
          label: spec.label,
          required: spec.required,
          options: spec.options,
          show_if: null,
        }))
      )
      .select('id, position, type, required, label')
      .order('position', { ascending: true });
    if (questionsError || !questions) fail('questions', questionsError?.message);

    // Publish event A.
    const { error: publishError } = await service
      .from('events')
      .update({ status: 'active' })
      .eq('id', activeEventId);
    if (publishError) fail('event publish', publishError.message);

    const byType = (type: string) => questions!.find((q) => q.type === type)!.id;

    // A real prior submission so anon-read tests prove "zero rows returned while
    // rows exist", and the dashboard-read test has something to find.
    const seededVendorEmail = `sec-vendor-${suffix}@example.com`;
    const { data: vendor, error: vendorError } = await service
      .from('vendors')
      .insert({
        business_name: `SEC Vendor ${suffix}`,
        contact_name: 'Seeded Contact',
        email: seededVendorEmail,
        phone: '403-555-0000',
      })
      .select('id')
      .single();
    if (vendorError || !vendor) fail('vendor', vendorError?.message);

    const { data: application, error: applicationError } = await service
      .from('applications')
      .insert({
        event_id: activeEventId,
        vendor_id: vendor!.id,
        status: 'pending',
        organizer_notes: 'SEEDED INTERNAL NOTE — must never be readable by anon',
      })
      .select('id')
      .single();
    if (applicationError || !application) fail('application', applicationError?.message);

    const storagePrefix = `security-${suffix}`;

    const { error: answerError } = await service.from('application_answers').insert({
      application_id: application!.id,
      event_question_id: byType('short_text'),
      value: { kind: 'text', value: 'Seeded answer' },
    });
    if (answerError) fail('application answer', answerError.message);

    const { error: attachmentError } = await service.from('attachments').insert({
      application_id: application!.id,
      file_name: 'seeded.pdf',
      file_path: `${storagePrefix}/seeded.pdf`,
      file_type: 'application/pdf',
      file_size: 1024,
    });
    if (attachmentError) fail('attachment', attachmentError.message);

    return {
      suffix,
      activeEventId,
      activeEventName,
      draftEventId,
      activeEventBId,
      questionnaireId: questionnaire!.id,
      questions: questions! as SeededQuestion[],
      requiredTextQuestionId: byType('short_text'),
      requiredMultiSelectQuestionId: byType('multi_select'),
      requiredFileQuestionId: byType('file_upload'),
      seededVendorId: vendor!.id,
      seededVendorEmail,
      seededApplicationId: application!.id,
      storagePrefix,
      authUserIds: [],
    };
  } catch (error) {
    await purgeRun(suffix, [activeEventId, draftEventId, activeEventBId]);
    throw error;
  }
}

/**
 * Removes everything `seedFixtures` created, plus anything the suite added
 * under the run's vendor-email suffix, storage prefix, or auth-user list.
 * Best-effort: never throws, so a failing assertion is what surfaces.
 */
export async function cleanupFixtures(fixtures: SecurityFixtures): Promise<void> {
  const service = serviceClient();

  // Events cascade to applications -> answers + attachments; vendors are not
  // cascaded by events, so they are matched by the run's email suffix.
  await purgeRun(fixtures.suffix, [
    fixtures.activeEventId,
    fixtures.draftEventId,
    fixtures.activeEventBId,
  ]);

  const { data: objects } = await service.storage
    .from('attachments')
    .list(fixtures.storagePrefix, { limit: 1000 });
  if (objects && objects.length > 0) {
    const { error } = await service.storage
      .from('attachments')
      .remove(objects.map((o) => `${fixtures.storagePrefix}/${o.name}`));
    if (error) {
      console.warn(`[security harness] could not remove storage objects: ${error.message}`);
    }
  }

  for (const userId of fixtures.authUserIds) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) {
      console.warn(`[security harness] could not delete auth user ${userId}: ${error.message}`);
    }
  }
}
