import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveEventQuestionnaire } from '@/lib/actions/questionnaires';
import { requireRole } from '@/lib/auth/roles';
import { requireDraftEvent } from '@/lib/actions/_internal/event-status';

// =============================================================================
// Show-if rules are enforced in questionnaireInputSchema before the RPC is
// reached: every case below must fail in Zod and never call the database.
// IDs are valid v4 UUIDs (version [1-8], variant [89abAB]).
// =============================================================================

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ID_Q_YES_NO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_Q_MULTI = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ID_Q_DEP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ID_Q_MISSING = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const Q_YES_NO = {
  id: ID_Q_YES_NO,
  type: 'yes_no',
  label: 'Are you selling food?',
  required: false,
};
const Q_MULTI_SELECT = {
  id: ID_Q_MULTI,
  type: 'multi_select',
  label: 'Categories',
  required: false,
  options: [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B' },
  ],
};
const Q_DEPENDENT = {
  id: ID_Q_DEP,
  type: 'short_text',
  label: 'List your certifications',
  required: false,
  show_if: { questionId: ID_Q_YES_NO, operator: 'equals', value: 'true' },
};

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: () => {
      throw new Error('no table access expected');
    },
    rpc: mockRpc,
  })),
}));

vi.mock('@/lib/auth/roles', () => ({ requireRole: vi.fn() }));
vi.mock('@/lib/actions/_internal/event-status', () => ({ requireDraftEvent: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mockRpc.mockResolvedValue({ data: [], error: null });
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

describe('show-if validation on saveEventQuestionnaire', () => {
  it('rejects a show_if that references a question not in the payload', async () => {
    const result = await saveEventQuestionnaire(EVENT_ID, [
      Q_YES_NO,
      { ...Q_DEPENDENT, show_if: { questionId: ID_Q_MISSING, operator: 'equals', value: 'true' } },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist or comes after/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects rules that would form a cycle', async () => {
    const result = await saveEventQuestionnaire(EVENT_ID, [
      { ...Q_YES_NO, show_if: { questionId: ID_Q_DEP, operator: 'equals', value: 'true' } },
      Q_DEPENDENT,
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/forward reference|does not exist or comes after|cycle/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a show_if whose trigger is multi_select', async () => {
    const result = await saveEventQuestionnaire(EVENT_ID, [
      Q_MULTI_SELECT,
      { ...Q_DEPENDENT, show_if: { questionId: ID_Q_MULTI, operator: 'equals', value: 'a' } },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/only yes_no and single_select are supported/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects an order that puts the dependent question before its trigger', async () => {
    const result = await saveEventQuestionnaire(EVENT_ID, [Q_DEPENDENT, Q_YES_NO]);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist or comes after/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('accepts the same rules in a valid order', async () => {
    const result = await saveEventQuestionnaire(EVENT_ID, [Q_YES_NO, Q_DEPENDENT]);

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
