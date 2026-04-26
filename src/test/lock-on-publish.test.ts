import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateEventStatus } from '@/lib/actions/events';
import {
  addEventQuestion,
  updateEventQuestion,
  deleteEventQuestion,
  reorderEventQuestions,
} from '@/lib/actions/questionnaires';
import { requireRole } from '@/lib/auth/roles';
import { requireDraftEvent } from '@/lib/actions/_internal/event-status';
import { revalidatePath } from 'next/cache';

// =============================================================================
// Queue-based Supabase mock (same pattern as questionnaires-actions.test.ts)
// =============================================================================

const responseQueue: Array<{ data: unknown; error: unknown }> = [];

function enqueue(data: unknown, error: unknown = null) {
  responseQueue.push({ data, error });
}

function ok(data: unknown = null) {
  enqueue(data);
}

function makeChain(): Record<string, unknown> {
  function dequeue() {
    return Promise.resolve(responseQueue.shift() ?? { data: null, error: null });
  }

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    update: () => chain,
    insert: () => chain,
    delete: () => chain,
    limit: () => dequeue(),
    single: () => dequeue(),
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
// Fixtures
// =============================================================================

const VALID_QUESTION_INPUT = { type: 'short_text', label: 'Test question', required: false };

// =============================================================================
// Setup
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
// updateEventStatus — publish + transition guard
// =============================================================================

describe('updateEventStatus', () => {
  it('returns success on draft → active and calls revalidatePath for both paths', async () => {
    // The DB trigger lock_event_questionnaire_on_publish fires AFTER this update
    // and sets event_questionnaires.locked_at atomically. That behavior is not
    // asserted here (unit test scope); it is covered by the quickstart end-to-end.
    ok({ status: 'draft' }); // current status fetch
    ok(null);                // update succeeds

    const result = await updateEventStatus('event-1', 'active');

    expect(result.success).toBe(true);
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/dashboard/events');
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/dashboard/events/[id]', 'page');
  });

  it('rejects re-publish when event is already active (action-layer idempotency)', async () => {
    // Data-layer idempotency: the trigger uses WHERE locked_at IS NULL so a
    // second draft→active transition (if it were somehow possible) would not
    // overwrite the original lock timestamp. Here we verify the action layer
    // blocks the attempt first.
    ok({ status: 'active' }); // current status fetch — already published

    const result = await updateEventStatus('event-1', 'active');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Cannot change status from "active" to "active"/);
  });

  it('rejects transitions from closed (VALID_TRANSITIONS guard intact)', async () => {
    ok({ status: 'closed' }); // current status fetch

    const result = await updateEventStatus('event-1', 'active');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Cannot change status from "closed"/);
  });
});

// =============================================================================
// Post-publish mutation rejection (requireDraftEvent draft-status guard)
// =============================================================================

describe('questionnaire mutations rejected after publish', () => {
  beforeEach(() => {
    vi.mocked(requireDraftEvent).mockResolvedValue({
      success: false,
      error: 'Event is not in draft status (current: active)',
      data: null,
    });
  });

  it('addEventQuestion returns failure with draft error', async () => {
    const result = await addEventQuestion('event-1', VALID_QUESTION_INPUT);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/draft/i);
  });

  it('updateEventQuestion returns failure with draft error', async () => {
    const result = await updateEventQuestion('event-1', 'q-1', VALID_QUESTION_INPUT);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/draft/i);
  });

  it('deleteEventQuestion returns failure with draft error', async () => {
    const result = await deleteEventQuestion('event-1', 'q-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/draft/i);
  });

  it('reorderEventQuestions returns failure with draft error', async () => {
    const result = await reorderEventQuestions('event-1', ['q-1', 'q-2']);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/draft/i);
  });
});

// =============================================================================
// RLS backstop — data-layer rejection shape handled gracefully
// =============================================================================

describe('RLS backstop', () => {
  it('addEventQuestion surfaces a clean failure when the DB returns an RLS error', async () => {
    // Simulates a TOCTOU window where the action-layer guard passes (requireDraftEvent
    // returns success) but the database's RLS policy on event_questions rejects the
    // INSERT because locked_at is set. The action must return { success: false } with
    // a non-empty error and must not throw.
    ok({ id: 'questionnaire-1' });  // getQuestionnaire
    ok([]);                          // max position query (empty → nextPosition = 1)
    enqueue(null, {                  // INSERT rejected by RLS
      code: '42501',
      message: 'new row violates row-level security policy for table "event_questions"',
    });

    const result = await addEventQuestion('event-1', VALID_QUESTION_INPUT);

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });
});
