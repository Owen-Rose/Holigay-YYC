import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitDynamicApplication } from '@/lib/actions/answers';
import type { Database } from '@/types/database';

type EventQuestion = Database['public']['Tables']['event_questions']['Row'];
type EventQuestionnaire = Database['public']['Tables']['event_questionnaires']['Row'];

// =============================================================================
// UUID fixtures — all IDs must be valid v4 UUIDs for schema validation
// =============================================================================

const EVENT_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const Q_UUID = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEXT_Q_UUID = 'c1b2c3d4-e5f6-7890-abcd-ef1234567890';
const YESNO_Q_UUID = 'd1b2c3d4-e5f6-7890-abcd-ef1234567890';
const COND_Q_UUID = 'e1b2c3d4-e5f6-7890-abcd-ef1234567890';
const FILE_Q_UUID = 'f1b2c3d4-e5f6-7890-abcd-ef1234567890';

// =============================================================================
// Fixtures
// =============================================================================

const ACTIVE_EVENT = {
  id: EVENT_UUID,
  name: 'Holiday Market 2024',
  event_date: '2024-12-15',
  status: 'active',
};

const QUESTIONNAIRE: EventQuestionnaire = {
  id: Q_UUID,
  event_id: EVENT_UUID,
  locked_at: null,
  seeded_from_template_id: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const TEXT_QUESTION: EventQuestion = {
  id: TEXT_Q_UUID,
  event_questionnaire_id: Q_UUID,
  type: 'short_text',
  label: 'Describe your products',
  help_text: null,
  required: true,
  options: null,
  show_if: null,
  position: 1,
};

const YESNO_QUESTION: EventQuestion = {
  id: YESNO_Q_UUID,
  event_questionnaire_id: Q_UUID,
  type: 'yes_no',
  label: 'Are you selling food?',
  help_text: null,
  required: true,
  options: null,
  show_if: null,
  position: 1,
};

const CONDITIONAL_QUESTION: EventQuestion = {
  id: COND_Q_UUID,
  event_questionnaire_id: Q_UUID,
  type: 'short_text',
  label: 'List your certifications',
  help_text: null,
  required: true,
  options: null,
  show_if: { questionId: YESNO_Q_UUID, operator: 'equals', value: 'true' },
  position: 2,
};

const FILE_QUESTION: EventQuestion = {
  id: FILE_Q_UUID,
  event_questionnaire_id: Q_UUID,
  type: 'file_upload',
  label: 'Upload a product photo',
  help_text: null,
  required: true,
  options: null,
  show_if: null,
  position: 1,
};

const EXISTING_VENDOR = { id: 'vendor-existing' };

const VENDOR_INPUT = {
  businessName: 'Artisan Crafts',
  contactName: 'Jane Smith',
  email: 'jane@artisan.com',
  phone: '',
  website: '',
  description: '',
};

// =============================================================================
// Queue-based Supabase mock
// =============================================================================

const responseQueue: Array<{ data: unknown; error: unknown }> = [];
const insertCalls: unknown[] = [];

function enqueue(data: unknown, error: unknown = null) {
  responseQueue.push({ data, error });
}

function ok(data: unknown = null) {
  return enqueue(data);
}

function fail(error: unknown) {
  return enqueue(null, error);
}

function pgrst116() {
  return fail({ code: 'PGRST116', message: 'No rows found' });
}

function makeChain(): Record<string, unknown> {
  function dequeue() {
    return Promise.resolve(responseQueue.shift() ?? { data: null, error: null });
  }

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => dequeue(),
    single: () => dequeue(),
    insert: (rows: unknown) => {
      insertCalls.push(rows);
      return chain;
    },
    update: () => chain,
    delete: () => chain,
    then: (resolve: (v: unknown) => unknown) => dequeue().then(resolve),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: () => makeChain(),
  })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/email/client', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/email/templates', () => ({
  applicationReceivedEmail: vi.fn().mockReturnValue({
    subject: 'Application received',
    html: '<p>Thanks</p>',
    text: 'Thanks',
  }),
}));

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  responseQueue.length = 0;
  insertCalls.length = 0;
});

// ---------------------------------------------------------------------------
// Happy path — existing vendor, single required text answer
// ---------------------------------------------------------------------------

describe('submitDynamicApplication', () => {
  it('creates application and inserts answers for existing vendor', async () => {
    ok(ACTIVE_EVENT);              // events single
    ok(QUESTIONNAIRE);             // event_questionnaires single
    ok([TEXT_QUESTION]);           // event_questions order
    ok(EXISTING_VENDOR);           // vendors single (found)
    ok({ error: null });           // vendors update then
    pgrst116();                    // applications duplicate check single
    ok({ id: 'app-new' });         // applications insert single
    ok({ error: null });           // application_answers insert then

    const result = await submitDynamicApplication({
      eventId: EVENT_UUID,
      vendor: VENDOR_INPUT,
      answers: [{ questionId: TEXT_Q_UUID, value: { kind: 'text', value: 'Handmade pottery' } }],
    });

    expect(result.success).toBe(true);
    expect(result.data?.applicationId).toBe('app-new');
  });

  // ---------------------------------------------------------------------------
  // Event not active
  // ---------------------------------------------------------------------------

  it('rejects when event is not active', async () => {
    ok({ ...ACTIVE_EVENT, status: 'draft' });

    const result = await submitDynamicApplication({
      eventId: EVENT_UUID,
      vendor: VENDOR_INPUT,
      answers: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not currently accepting/i);
  });

  // ---------------------------------------------------------------------------
  // No questionnaire (legacy event)
  // ---------------------------------------------------------------------------

  it('rejects legacy events that have no questionnaire row', async () => {
    ok(ACTIVE_EVENT);
    pgrst116(); // event_questionnaires single → no row

    const result = await submitDynamicApplication({
      eventId: EVENT_UUID,
      vendor: VENDOR_INPUT,
      answers: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/legacy form/i);
  });

  // ---------------------------------------------------------------------------
  // Missing required answer
  // ---------------------------------------------------------------------------

  it('rejects when a visible required question has no answer', async () => {
    ok(ACTIVE_EVENT);
    ok(QUESTIONNAIRE);
    ok([TEXT_QUESTION]); // required: true

    const result = await submitDynamicApplication({
      eventId: EVENT_UUID,
      vendor: VENDOR_INPUT,
      answers: [], // missing answer for TEXT_QUESTION
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  // ---------------------------------------------------------------------------
  // Hidden show-if question not required
  // ---------------------------------------------------------------------------

  it('succeeds when a hidden required question has no answer', async () => {
    ok(ACTIVE_EVENT);
    ok(QUESTIONNAIRE);
    ok([YESNO_QUESTION, CONDITIONAL_QUESTION]); // Q1=yes_no, Q2=required+show_if(Q1=true)
    pgrst116();                        // vendors single (new)
    ok({ id: 'vendor-new' });          // vendors insert single
    pgrst116();                        // applications duplicate check
    ok({ id: 'app-2' });              // applications insert single
    ok({ error: null });               // application_answers insert then

    // Q1 answered false → Q2 is hidden → Q2 required check skipped
    const result = await submitDynamicApplication({
      eventId: EVENT_UUID,
      vendor: VENDOR_INPUT,
      answers: [{ questionId: YESNO_Q_UUID, value: { kind: 'boolean', value: false } }],
    });

    expect(result.success).toBe(true);
    expect(result.data?.applicationId).toBe('app-2');
  });

  // ---------------------------------------------------------------------------
  // File answer passes through to insert payload
  // ---------------------------------------------------------------------------

  it('includes file answer in the bulk insert payload', async () => {
    ok(ACTIVE_EVENT);
    ok(QUESTIONNAIRE);
    ok([FILE_QUESTION]);
    pgrst116();
    ok({ id: 'vendor-file' });
    pgrst116();
    ok({ id: 'app-file' });
    ok({ error: null }); // application_answers insert

    const fileAnswer = {
      kind: 'file' as const,
      path: '/uploads/x.jpg',
      name: 'x.jpg',
      mimeType: 'image/jpeg',
      size: 1024,
    };

    const result = await submitDynamicApplication({
      eventId: EVENT_UUID,
      vendor: VENDOR_INPUT,
      answers: [{ questionId: FILE_Q_UUID, value: fileAnswer }],
    });

    expect(result.success).toBe(true);

    // The answers insert was called with the file answer coerced to JSONB shape
    const answersInsertArg = insertCalls.find(
      (rows) =>
        Array.isArray(rows) &&
        (rows as Array<{ event_question_id: string }>)[0]?.event_question_id === FILE_Q_UUID,
    ) as Array<{ application_id: string; event_question_id: string; value: unknown }> | undefined;

    expect(answersInsertArg).toBeDefined();
    expect(answersInsertArg![0].value).toEqual(fileAnswer);
  });
});
