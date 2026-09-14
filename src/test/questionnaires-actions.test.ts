import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEventQuestionnaire, saveEventQuestionnaire } from '@/lib/actions/questionnaires';
import { requireRole } from '@/lib/auth/roles';
import { requireDraftEvent } from '@/lib/actions/_internal/event-status';
import { revalidatePath } from 'next/cache';
import type { Database } from '@/types/database';

type EventQuestion = Database['public']['Tables']['event_questions']['Row'];
type EventQuestionnaire = Database['public']['Tables']['event_questionnaires']['Row'];

// =============================================================================
// Mock fixtures — ids are valid v4 UUIDs (Zod checks version + variant nibbles)
// =============================================================================

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const QUESTIONNAIRE: EventQuestionnaire = {
  id: 'q-1',
  event_id: EVENT_ID,
  locked_at: null,
  seeded_from_template_id: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const ROW_A: EventQuestion = {
  id: ID_A,
  event_questionnaire_id: 'q-1',
  type: 'yes_no',
  label: 'Need power?',
  help_text: null,
  required: false,
  options: null,
  show_if: null,
  position: 0,
};

const ROW_B: EventQuestion = {
  id: ID_B,
  event_questionnaire_id: 'q-1',
  type: 'short_text',
  label: 'Which appliances?',
  help_text: null,
  required: true,
  options: null,
  show_if: { questionId: ID_A, operator: 'equals', value: 'true' } as unknown as null,
  position: 1,
};

/** What the builder sends: no positions, ids present for persisted questions. */
const INPUT = [
  {
    id: ID_A,
    type: 'yes_no',
    label: 'Need power?',
    help_text: '',
    required: false,
    options: [],
    show_if: null,
  },
  {
    id: ID_B,
    type: 'short_text',
    label: 'Which appliances?',
    help_text: '',
    required: true,
    options: [],
    show_if: { questionId: ID_A, operator: 'equals', value: 'true' },
  },
];

// =============================================================================
// Queue-based Supabase mock; `rpc` is a spy so its arguments can be asserted.
// =============================================================================

const responseQueue: Array<{ data: unknown; error: unknown }> = [];

function enqueue(data: unknown, error: unknown = null) {
  responseQueue.push({ data, error });
}

function ok(data: unknown = null) {
  return enqueue(data);
}

function makeChain(): Record<string, unknown> {
  function dequeue() {
    return Promise.resolve(responseQueue.shift() ?? { data: null, error: null });
  }

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => dequeue(),
    single: () => dequeue(),
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    then: (resolve: (v: unknown) => unknown) => dequeue().then(resolve),
  };
  return chain;
}

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: () => makeChain(),
    rpc: mockRpc,
  })),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireRole: vi.fn(),
}));

vi.mock('@/lib/actions/_internal/event-status', () => ({
  requireDraftEvent: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  responseQueue.length = 0;

  mockRpc.mockImplementation(() =>
    Promise.resolve(responseQueue.shift() ?? { data: null, error: null })
  );
  vi.mocked(requireRole).mockResolvedValue({
    success: true,
    error: null,
    data: { role: 'organizer', userId: 'user-1' },
  });
  vi.mocked(requireDraftEvent).mockResolvedValue({
    success: true,
    error: null,
    data: { eventId: EVENT_ID },
  });
});

function rpcPayload() {
  const [name, args] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
  return { name, args, questions: args.p_questions as Array<Record<string, unknown>> };
}

// ---------------------------------------------------------------------------
// getEventQuestionnaire
// ---------------------------------------------------------------------------

describe('getEventQuestionnaire', () => {
  it('returns questionnaire and questions ordered by position', async () => {
    ok(QUESTIONNAIRE); // event_questionnaires single
    ok([ROW_A, ROW_B]); // event_questions order

    const result = await getEventQuestionnaire(EVENT_ID);

    expect(result.success).toBe(true);
    expect(result.data?.questionnaire.id).toBe('q-1');
    expect(result.data?.questions.map((q) => q.id)).toEqual([ID_A, ID_B]);
  });

  it('returns success with data null when no questionnaire row exists', async () => {
    enqueue(null, { code: 'PGRST116', message: 'No rows' });

    const result = await getEventQuestionnaire(EVENT_ID);

    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// saveEventQuestionnaire
// ---------------------------------------------------------------------------

describe('saveEventQuestionnaire', () => {
  it('calls the RPC once with the full ordered payload and returns the saved rows', async () => {
    ok([ROW_A, ROW_B]); // save_event_questionnaire → SETOF event_questions

    const result = await saveEventQuestionnaire(EVENT_ID, INPUT);

    expect(result.success).toBe(true);
    expect(result.data?.map((q) => q.id)).toEqual([ID_A, ID_B]);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    const { name, args, questions } = rpcPayload();
    expect(name).toBe('save_event_questionnaire');
    expect(args.p_event_id).toBe(EVENT_ID);
    expect(args.p_seeded_from_template_id).toBeUndefined();
    expect(questions.map((q) => q.id)).toEqual([ID_A, ID_B]);
    expect(questions[1].show_if).toEqual({ questionId: ID_A, operator: 'equals', value: 'true' });
    expect(questions[0].options).toBeNull(); // empty option list normalised away

    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(`/dashboard/events/${EVENT_ID}`, 'page');
  });

  it('assigns a UUID to a question that arrives without an id', async () => {
    ok([ROW_A]);

    await saveEventQuestionnaire(EVENT_ID, [{ type: 'short_text', label: 'New', required: false }]);

    const { questions } = rpcPayload();
    expect(questions[0].id).toMatch(UUID_RE);
  });

  it('rejects when the caller lacks the organizer role, without calling the RPC', async () => {
    vi.mocked(requireRole).mockResolvedValue({
      success: false,
      error: 'Requires organizer role or higher',
      data: null,
    });

    const result = await saveEventQuestionnaire(EVENT_ID, INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/organizer/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects when the event is not draft, without calling the RPC', async () => {
    vi.mocked(requireDraftEvent).mockResolvedValue({
      success: false,
      error: 'Event is not in draft status (current: active)',
      data: null,
    });

    const result = await saveEventQuestionnaire(EVENT_ID, INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/draft/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects invalid input (empty label) without calling the RPC', async () => {
    const result = await saveEventQuestionnaire(EVENT_ID, [
      { type: 'short_text', label: '', required: false },
    ]);

    expect(result.success).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
  });

  it('rejects a non-array input', async () => {
    const result = await saveEventQuestionnaire(EVENT_ID, { nope: true });

    expect(result.success).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([
    ['P0001', /published|locked/i],
    ['P0002', /not found/i],
    ['P0004', /invalid/i],
    ['23503', /already has answers/i],
    ['42501', /permission/i],
    ['23514', /failed to save/i],
  ])('maps RPC error %s to a canned message and skips revalidation', async (code, expected) => {
    enqueue(null, { code, message: 'raw db text' });

    const result = await saveEventQuestionnaire(EVENT_ID, INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(expected);
    expect(result.error).not.toMatch(/raw db text/);
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
  });
});
