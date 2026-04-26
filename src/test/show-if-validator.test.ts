import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addEventQuestion,
  updateEventQuestion,
  reorderEventQuestions,
} from '@/lib/actions/questionnaires';
import { requireRole } from '@/lib/auth/roles';
import { requireDraftEvent } from '@/lib/actions/_internal/event-status';
import type { Database } from '@/types/database';

type EventQuestion = Database['public']['Tables']['event_questions']['Row'];

// =============================================================================
// IDs — must be valid UUIDs (version [1-8], variant [89abAB]) per Zod v4 rules
// =============================================================================

const ID_QUESTIONNAIRE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_Q_YES_NO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_Q_MULTI = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ID_Q_DEP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ID_Q_MISSING = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

// =============================================================================
// Fixtures
// =============================================================================

const Q_YES_NO: EventQuestion = {
  id: ID_Q_YES_NO,
  event_questionnaire_id: ID_QUESTIONNAIRE,
  type: 'yes_no',
  label: 'Are you selling food?',
  help_text: null,
  required: false,
  options: null,
  show_if: null,
  position: 1,
};

const Q_MULTI_SELECT: EventQuestion = {
  id: ID_Q_MULTI,
  event_questionnaire_id: ID_QUESTIONNAIRE,
  type: 'multi_select',
  label: 'Categories',
  help_text: null,
  required: false,
  options: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] as unknown as null,
  show_if: null,
  position: 1,
};

const Q_DEPENDENT: EventQuestion = {
  id: ID_Q_DEP,
  event_questionnaire_id: ID_QUESTIONNAIRE,
  type: 'short_text',
  label: 'List your certifications',
  help_text: null,
  required: false,
  options: null,
  show_if: { questionId: ID_Q_YES_NO, operator: 'equals', value: 'true' } as unknown as null,
  position: 2,
};

// =============================================================================
// Queue-based Supabase mock (same pattern as questionnaires-actions.test.ts)
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

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: () => makeChain(),
  })),
}));

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

// =============================================================================
// Tests
// =============================================================================

describe('show-if action-layer validation', () => {
  it('addEventQuestion rejects a forward reference', async () => {
    // Input: new question with show_if pointing to an id that does not exist in the set
    const input = {
      type: 'short_text',
      label: 'Hidden detail',
      required: false,
      show_if: { questionId: ID_Q_MISSING, operator: 'equals', value: 'true' },
    };

    const newQ: EventQuestion = {
      ...Q_DEPENDENT,
      id: 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1',
      show_if: input.show_if as unknown as null,
      position: 2,
    };

    ok({ id: ID_QUESTIONNAIRE });     // questionnaire fetch
    ok([{ position: 1 }]);            // max position
    ok(newQ);                         // insert result
    ok([Q_YES_NO, newQ]);             // all questions for validateShowIfRules
    ok(null);                         // rollback delete

    const result = await addEventQuestion('event-1', input);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist or comes after/i);
  });

  it('updateEventQuestion rejects a change that would create a cycle', async () => {
    // Q_YES_NO at pos 1, Q_DEPENDENT at pos 2 (show_if → Q_YES_NO).
    // Updating Q_YES_NO to point to Q_DEPENDENT creates a forward-ref (pos 1 → pos 2),
    // which is the same edge that closes the cycle (Q1→Q2→Q1).
    const updatedQ1: EventQuestion = {
      ...Q_YES_NO,
      show_if: { questionId: ID_Q_DEP, operator: 'equals', value: 'true' } as unknown as null,
    };

    ok({ id: ID_QUESTIONNAIRE });         // questionnaire fetch
    ok(Q_YES_NO);                         // existing question fetch
    ok(updatedQ1);                        // update result
    ok([updatedQ1, Q_DEPENDENT]);         // all questions for validateShowIfRules
    ok(null);                             // rollback update

    const result = await updateEventQuestion('event-1', ID_Q_YES_NO, {
      type: Q_YES_NO.type,
      label: Q_YES_NO.label,
      required: Q_YES_NO.required,
      show_if: { questionId: ID_Q_DEP, operator: 'equals', value: 'true' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/forward reference|does not exist or comes after|cycle/i);
  });

  it('addEventQuestion rejects a show-if rule whose trigger is multi_select', async () => {
    const input = {
      type: 'short_text',
      label: 'Detail',
      required: false,
      show_if: { questionId: ID_Q_MULTI, operator: 'equals', value: 'a' },
    };

    const newQ: EventQuestion = {
      ...Q_DEPENDENT,
      id: 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2',
      show_if: input.show_if as unknown as null,
      position: 2,
    };

    ok({ id: ID_QUESTIONNAIRE });          // questionnaire fetch
    ok([{ position: 1 }]);                 // max position
    ok(newQ);                              // insert result
    ok([Q_MULTI_SELECT, newQ]);            // all questions for validateShowIfRules
    ok(null);                              // rollback delete

    const result = await addEventQuestion('event-1', input);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/only yes_no and single_select are supported/i);
  });

  it('reorderEventQuestions rejects a reorder that creates a forward reference', async () => {
    // Before: Q_YES_NO pos 1, Q_DEPENDENT pos 2 (show_if → Q_YES_NO) — valid
    // After reorder [Q_DEPENDENT, Q_YES_NO]: Q_DEPENDENT pos 1, Q_YES_NO pos 2
    //   → Q_DEPENDENT.show_if references Q_YES_NO which is now after it → forward ref

    const qDepAtPos1: EventQuestion = { ...Q_DEPENDENT, position: 1 };
    const qYnAtPos2: EventQuestion = { ...Q_YES_NO, position: 2 };

    ok({ id: ID_QUESTIONNAIRE });              // questionnaire fetch
    ok([Q_YES_NO, Q_DEPENDENT]);               // current questions
    // two-step update step A: set negatives (2 rows)
    ok(null); ok(null);
    // two-step update step B: set finals (2 rows)
    ok(null); ok(null);
    ok([qDepAtPos1, qYnAtPos2]);               // post-reorder fetch for validateShowIfRules
    // rollback step A (2 rows)
    ok(null); ok(null);
    // rollback step B (2 rows)
    ok(null); ok(null);

    const result = await reorderEventQuestions('event-1', [ID_Q_DEP, ID_Q_YES_NO]);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist or comes after/i);
  });
});
