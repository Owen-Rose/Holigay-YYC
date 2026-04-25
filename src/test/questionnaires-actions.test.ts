import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getEventQuestionnaire,
  addEventQuestion,
  updateEventQuestion,
  deleteEventQuestion,
  reorderEventQuestions,
} from '@/lib/actions/questionnaires';
import { requireRole } from '@/lib/auth/roles';
import { requireDraftEvent } from '@/lib/actions/_internal/event-status';
import type { Database } from '@/types/database';

type EventQuestion = Database['public']['Tables']['event_questions']['Row'];
type EventQuestionnaire = Database['public']['Tables']['event_questionnaires']['Row'];

// =============================================================================
// Mock fixtures
// =============================================================================

const QUESTIONNAIRE: EventQuestionnaire = {
  id: 'q-1',
  event_id: 'event-1',
  locked_at: null,
  seeded_from_template_id: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const Q1: EventQuestion = {
  id: 'qstn-1',
  event_questionnaire_id: 'q-1',
  type: 'short_text',
  label: 'Q1',
  help_text: null,
  required: false,
  options: null,
  show_if: null,
  position: 1,
};

const Q2: EventQuestion = {
  id: 'qstn-2',
  event_questionnaire_id: 'q-1',
  type: 'long_text',
  label: 'Q2',
  help_text: null,
  required: true,
  options: null,
  show_if: null,
  position: 2,
};

const NEW_Q: EventQuestion = {
  id: 'qstn-new',
  event_questionnaire_id: 'q-1',
  type: 'short_text',
  label: 'New question',
  help_text: null,
  required: false,
  options: null,
  show_if: null,
  position: 3,
};

const VALID_INPUT = { type: 'short_text', label: 'New question', required: false };

// =============================================================================
// Queue-based Supabase mock
// Each terminal DB call (single / limit / direct await) consumes one item.
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
    // Makes `await chain` work (without .single() or .limit())
    then: (resolve: (v: unknown) => unknown) => dequeue().then(resolve),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: () => makeChain(),
  })),
}));

// =============================================================================
// Guard mocks
// =============================================================================

vi.mock('@/lib/auth/roles', () => ({
  requireRole: vi.fn().mockResolvedValue({
    success: true,
    error: null,
    data: { role: 'organizer', userId: 'user-1' },
  }),
}));

vi.mock('@/lib/actions/_internal/event-status', () => ({
  requireDraftEvent: vi.fn().mockResolvedValue({
    success: true,
    error: null,
    data: { eventId: 'event-1' },
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  responseQueue.length = 0;

  vi.mocked(requireRole).mockResolvedValue({
    success: true,
    error: null,
    data: { role: 'organizer', userId: 'user-1' },
  });
  vi.mocked(requireDraftEvent).mockResolvedValue({
    success: true,
    error: null,
    data: { eventId: 'event-1' },
  });
});

// ---------------------------------------------------------------------------
// getEventQuestionnaire
// ---------------------------------------------------------------------------

describe('getEventQuestionnaire', () => {
  it('returns questionnaire and questions ordered by position', async () => {
    ok(QUESTIONNAIRE);    // event_questionnaires single
    ok([Q1, Q2]);         // event_questions order

    const result = await getEventQuestionnaire('event-1');

    expect(result.success).toBe(true);
    expect(result.data?.questionnaire.id).toBe('q-1');
    expect(result.data?.questions).toHaveLength(2);
    expect(result.data?.questions[0].id).toBe('qstn-1');
  });

  it('returns success with data null when no questionnaire row exists', async () => {
    enqueue(null, { code: 'PGRST116', message: 'No rows' });

    const result = await getEventQuestionnaire('event-1');

    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addEventQuestion
// ---------------------------------------------------------------------------

describe('addEventQuestion', () => {
  it('inserts and returns the new question', async () => {
    ok({ id: 'q-1' });             // questionnaire fetch
    ok([{ position: 2 }]);         // max position
    ok(NEW_Q);                     // insert result
    ok([Q1, Q2, NEW_Q]);           // all questions for validation

    const result = await addEventQuestion('event-1', VALID_INPUT);

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe('qstn-new');
  });

  it('rejects when caller has vendor role', async () => {
    vi.mocked(requireRole).mockResolvedValue({
      success: false,
      error: 'Requires organizer role or higher',
      data: null,
    });

    const result = await addEventQuestion('event-1', VALID_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/organizer/i);
  });

  it('rejects when event is not draft', async () => {
    vi.mocked(requireDraftEvent).mockResolvedValue({
      success: false,
      error: 'Event is not in draft status (current: active)',
      data: null,
    });

    const result = await addEventQuestion('event-1', VALID_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/draft/i);
  });

  it('rejects invalid input', async () => {
    const result = await addEventQuestion('event-1', { type: 'short_text', label: '' });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateEventQuestion
// ---------------------------------------------------------------------------

describe('updateEventQuestion', () => {
  it('updates and returns the question', async () => {
    ok({ id: 'q-1' });              // questionnaire fetch
    ok(Q1);                         // existing question fetch
    ok({ ...Q1, label: 'Updated' }); // update result
    ok([Q1, Q2]);                   // all questions for validation

    const result = await updateEventQuestion('event-1', 'qstn-1', {
      ...VALID_INPUT,
      label: 'Updated',
    });

    expect(result.success).toBe(true);
    expect(result.data?.label).toBe('Updated');
  });

  it('rejects when event is active (draft-status guard)', async () => {
    vi.mocked(requireDraftEvent).mockResolvedValue({
      success: false,
      error: 'Event is not in draft status (current: active)',
      data: null,
    });

    const result = await updateEventQuestion('event-1', 'qstn-1', VALID_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/draft/i);
  });
});

// ---------------------------------------------------------------------------
// deleteEventQuestion
// ---------------------------------------------------------------------------

describe('deleteEventQuestion', () => {
  it('deletes the question successfully', async () => {
    ok({ id: 'q-1' });                 // questionnaire fetch
    ok([Q1, Q2]);                      // all questions (no references to Q1)
    ok(null);                          // delete result

    const result = await deleteEventQuestion('event-1', 'qstn-1');

    expect(result.success).toBe(true);
  });

  it('rejects when another question has a show-if referencing the target', async () => {
    const Q2_WITH_REF: EventQuestion = {
      ...Q2,
      show_if: { questionId: 'qstn-1', operator: 'equals', value: 'true' } as unknown as null,
    };

    ok({ id: 'q-1' });           // questionnaire fetch
    ok([Q1, Q2_WITH_REF]);       // questions — Q2 references Q1

    const result = await deleteEventQuestion('event-1', 'qstn-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/show-if/i);
  });
});

// ---------------------------------------------------------------------------
// reorderEventQuestions
// ---------------------------------------------------------------------------

describe('reorderEventQuestions', () => {
  it('reorders questions to the specified order', async () => {
    ok({ id: 'q-1' });      // questionnaire fetch
    ok([Q1, Q2]);           // current questions
    // Step A: two position updates (negatives)
    ok(null); ok(null);
    // Step B: two position updates (finals)
    ok(null); ok(null);
    ok([Q2, Q1]);           // reordered questions for validation

    const result = await reorderEventQuestions('event-1', ['qstn-2', 'qstn-1']);

    expect(result.success).toBe(true);
  });

  it('rejects when question IDs do not match the questionnaire', async () => {
    ok({ id: 'q-1' });                                  // questionnaire fetch
    ok([Q1, Q2]);                                        // current questions

    const result = await reorderEventQuestions('event-1', ['qstn-1', 'qstn-UNKNOWN']);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/do not match/i);
  });
});
