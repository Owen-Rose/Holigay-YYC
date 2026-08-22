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
const FOREIGN_Q_UUID = '0a1b2c3d-e5f6-7890-abcd-ef1234567890';

// =============================================================================
// Fixtures
// =============================================================================

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

const VENDOR_INPUT = {
  businessName: 'Artisan Crafts',
  contactName: 'Jane Smith',
  email: 'jane@artisan.com',
  phone: '',
  website: '',
  description: '',
};

/** The row shape `submit_public_application` returns (one row, via .single()). */
const RPC_ROW = {
  application_id: 'app-new',
  vendor_id: 'vendor-1',
  vendor_created: false,
  event_name: 'Holiday Market 2024',
  event_date: '2024-12-15',
};

// =============================================================================
// Supabase mock
//
// The action now makes two reads (event_questionnaires, event_questions) and
// one rpc call — the old positional queue modelled ~8 sequential writes that
// migration 011 moved into the database (spec 006, research.md R18).
// =============================================================================

type Response = { data?: unknown; error?: unknown };

const selectQueues: Record<string, Response[]> = {};
const rpcQueue: Response[] = [];
const rpcCalls: Array<{ fn: string; args: unknown }> = [];

function queueSelect(table: string, response: Response) {
  (selectQueues[table] ??= []).push(response);
}

function queueRpc(response: Response) {
  rpcQueue.push(response);
}

function nextSelect(table: string): Response {
  const queued = selectQueues[table]?.shift();
  if (!queued) {
    throw new Error(`No mock queued for ${table}.select`);
  }
  return queued;
}

// Chainable builder: filters are ignored, and the next queued response is
// handed back either via .single() or by awaiting the chain directly (the
// questions read has no .single()).
function makeFrom(table: string) {
  const chain: Record<string, unknown> = {
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve(nextSelect(table)),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(nextSelect(table)).then(resolve, reject),
  };

  return { select: () => chain };
}

const rpcMock = vi.fn((fn: string, args: unknown) => {
  rpcCalls.push({ fn, args });
  const queued = rpcQueue.shift();
  if (!queued) {
    throw new Error(`No mock queued for rpc(${fn})`);
  }
  return { single: () => Promise.resolve(queued) };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: (table: string) => makeFrom(table),
    rpc: (fn: string, args: unknown) => rpcMock(fn, args),
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
// Helpers
// =============================================================================

/** Queues the two reads every submission performs before reaching the RPC. */
function queueQuestionnaire(questions: EventQuestion[]) {
  queueSelect('event_questionnaires', { data: QUESTIONNAIRE, error: null });
  queueSelect('event_questions', { data: questions, error: null });
}

function lastRpcPayload() {
  const call = rpcCalls.at(-1);
  return (call?.args as { p_submission: Record<string, unknown> }).p_submission;
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(selectQueues)) {
    delete selectQueues[key];
  }
  rpcQueue.length = 0;
  rpcCalls.length = 0;
});

describe('submitDynamicApplication', () => {
  // ---------------------------------------------------------------------------
  // Happy path — one required text answer, submitted through the RPC
  // ---------------------------------------------------------------------------

  it('submits the whole application through submit_public_application', async () => {
    queueQuestionnaire([TEXT_QUESTION]);
    queueRpc({ data: RPC_ROW, error: null });

    const result = await submitDynamicApplication({
      eventId: EVENT_UUID,
      vendor: VENDOR_INPUT,
      answers: [{ questionId: TEXT_Q_UUID, value: { kind: 'text', value: 'Handmade pottery' } }],
    });

    expect(result.success).toBe(true);
    expect(result.data?.applicationId).toBe('app-new');
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]!.fn).toBe('submit_public_application');

    const payload = lastRpcPayload();
    expect(payload['event_id']).toBe(EVENT_UUID);
    expect(payload['legacy']).toBeNull();
    expect(payload['attachments']).toBeNull();
    expect(payload['vendor']).toMatchObject({
      business_name: 'Artisan Crafts',
      contact_name: 'Jane Smith',
      email: 'jane@artisan.com',
      phone: null,
    });
    expect(payload['answers']).toEqual([
      { event_question_id: TEXT_Q_UUID, value: { kind: 'text', value: 'Handmade pottery' } },
    ]);
  });

  // ---------------------------------------------------------------------------
  // No questionnaire (legacy event) — short-circuits before the RPC
  // ---------------------------------------------------------------------------

  it('rejects legacy events that have no questionnaire row', async () => {
    queueSelect('event_questionnaires', {
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    });

    const result = await submitDynamicApplication({
      eventId: EVENT_UUID,
      vendor: VENDOR_INPUT,
      answers: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/legacy form/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Missing required answer — short-circuits before the RPC
  // ---------------------------------------------------------------------------

  it('rejects when a visible required question has no answer', async () => {
    queueQuestionnaire([TEXT_QUESTION]);

    const result = await submitDynamicApplication({
      eventId: EVENT_UUID,
      vendor: VENDOR_INPUT,
      answers: [], // missing answer for TEXT_QUESTION
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/required/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Unknown question IDs are rejected outright (research.md R11)
  // ---------------------------------------------------------------------------

  it('rejects an answer for a question outside this questionnaire', async () => {
    queueQuestionnaire([TEXT_QUESTION]);

    const result = await submitDynamicApplication({
      eventId: EVENT_UUID,
      vendor: VENDOR_INPUT,
      answers: [
        { questionId: TEXT_Q_UUID, value: { kind: 'text', value: 'Handmade pottery' } },
        { questionId: FOREIGN_Q_UUID, value: { kind: 'text', value: 'Injected' } },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid answers/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Hidden show-if question is not required
  // ---------------------------------------------------------------------------

  it('succeeds when a hidden required question has no answer', async () => {
    queueQuestionnaire([YESNO_QUESTION, CONDITIONAL_QUESTION]);
    queueRpc({ data: { ...RPC_ROW, application_id: 'app-2' }, error: null });

    // Q1 answered false → Q2 is hidden → Q2 required check skipped
    const result = await submitDynamicApplication({
      eventId: EVENT_UUID,
      vendor: VENDOR_INPUT,
      answers: [{ questionId: YESNO_Q_UUID, value: { kind: 'boolean', value: false } }],
    });

    expect(result.success).toBe(true);
    expect(result.data?.applicationId).toBe('app-2');
    expect(lastRpcPayload()['answers']).toEqual([
      { event_question_id: YESNO_Q_UUID, value: { kind: 'boolean', value: false } },
    ]);
  });

  // ---------------------------------------------------------------------------
  // File answers reach the RPC payload in their coerced JSONB shape
  // ---------------------------------------------------------------------------

  it('includes file answers in the RPC payload', async () => {
    queueQuestionnaire([FILE_QUESTION]);
    queueRpc({ data: { ...RPC_ROW, application_id: 'app-file' }, error: null });

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
    expect(lastRpcPayload()['answers']).toEqual([
      { event_question_id: FILE_Q_UUID, value: fileAnswer },
    ]);
  });

  // ---------------------------------------------------------------------------
  // ERRCODE mapping — the RPC is what rejects these now (research.md R2)
  // ---------------------------------------------------------------------------

  it.each([
    ['P0001', /not currently accepting/i],
    ['P0002', /event not found/i],
    ['P0003', /already submitted an application/i],
    ['P0004', /invalid answers/i],
    ['23505', /failed to create application/i],
  ])('maps RPC error %s to its canned message', async (code, expected) => {
    queueQuestionnaire([TEXT_QUESTION]);
    queueRpc({ data: null, error: { code, message: 'raw postgres detail' } });

    const result = await submitDynamicApplication({
      eventId: EVENT_UUID,
      vendor: VENDOR_INPUT,
      answers: [{ questionId: TEXT_Q_UUID, value: { kind: 'text', value: 'Handmade pottery' } }],
    });

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toMatch(expected);
    expect(result.error).not.toMatch(/raw postgres detail/);
  });
});
