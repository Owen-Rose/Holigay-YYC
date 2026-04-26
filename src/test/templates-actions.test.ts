import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  seedEventQuestionnaireFromTemplate,
} from '@/lib/actions/templates';
import { requireRole } from '@/lib/auth/roles';
import { requireDraftEvent } from '@/lib/actions/_internal/event-status';
import type { Database } from '@/types/database';

type TemplateRow = Database['public']['Tables']['questionnaire_templates']['Row'];
type TemplateQuestionRow = Database['public']['Tables']['template_questions']['Row'];

// =============================================================================
// Fixtures
// =============================================================================

const TMPL_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const EQ_ID = '44444444-4444-4444-8444-444444444444';
const TQ1_ID = '55555555-5555-4555-8555-555555555555';
const TQ2_ID = '66666666-6666-4666-8666-666666666666';

const TEMPLATE: TemplateRow = {
  id: TMPL_ID,
  name: 'Holiday Market Standard',
  description: 'Standard questions',
  created_by: USER_ID,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const TQ1: TemplateQuestionRow = {
  id: TQ1_ID,
  template_id: TMPL_ID,
  type: 'short_text',
  label: 'Business name',
  help_text: null,
  required: true,
  options: null,
  show_if: null,
  position: 0,
};

const TQ2: TemplateQuestionRow = {
  id: TQ2_ID,
  template_id: TMPL_ID,
  type: 'long_text',
  label: 'Description',
  help_text: null,
  required: false,
  options: null,
  show_if: null,
  position: 1,
};

const VALID_CREATE_INPUT = {
  name: 'My Template',
  description: null,
  questions: [{ type: 'short_text', label: 'Q1', required: false, position: 0 }],
};

// =============================================================================
// Queue-based Supabase mock with insert capture
// =============================================================================

const responseQueue: Array<{ data: unknown; error: unknown }> = [];
let insertCapture: unknown[] = [];

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
    in: () => chain,
    returns: () => chain,
    limit: () => dequeue(),
    single: () => dequeue(),
    insert: (rows: unknown) => {
      insertCapture = Array.isArray(rows) ? (rows as unknown[]) : [rows];
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

// =============================================================================
// Guard mocks
// =============================================================================

const ADMIN_ID = '99999999-9999-4999-8999-999999999999';

vi.mock('@/lib/auth/roles', () => ({
  requireRole: vi.fn().mockResolvedValue({
    success: true,
    error: null,
    data: { role: 'organizer', userId: '22222222-2222-4222-8222-222222222222' },
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
// Setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  responseQueue.length = 0;
  insertCapture = [];

  vi.mocked(requireRole).mockResolvedValue({
    success: true,
    error: null,
    data: { role: 'organizer', userId: USER_ID },
  });
  vi.mocked(requireDraftEvent).mockResolvedValue({
    success: true,
    error: null,
    data: { eventId: EVENT_ID },
  });
});

// =============================================================================
// listTemplates
// =============================================================================

describe('listTemplates', () => {
  it('returns templates with creator email joined from users_with_roles', async () => {
    ok([{ ...TEMPLATE, template_questions: [{ id: TQ1_ID }] }]);
    ok([{ id: USER_ID, email: 'organizer@example.com' }]);

    const result = await listTemplates();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].createdByEmail).toBe('organizer@example.com');
    expect(result.data![0].questionCount).toBe(1);
  });

  it('returns null createdByEmail and skips user query for orphaned templates', async () => {
    ok([{ ...TEMPLATE, created_by: null, template_questions: [] }]);

    const result = await listTemplates();

    expect(result.success).toBe(true);
    expect(result.data![0].createdBy).toBeNull();
    expect(result.data![0].createdByEmail).toBeNull();
  });

  it('rejects when caller lacks organizer role', async () => {
    vi.mocked(requireRole).mockResolvedValue({
      success: false,
      error: 'Requires organizer role or higher',
      data: null,
    });

    const result = await listTemplates();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/organizer/i);
  });
});

// =============================================================================
// getTemplate
// =============================================================================

describe('getTemplate', () => {
  it('returns template and ordered questions', async () => {
    ok(TEMPLATE);
    ok([TQ1, TQ2]);

    const result = await getTemplate(TMPL_ID);

    expect(result.success).toBe(true);
    expect(result.data?.template.id).toBe(TMPL_ID);
    expect(result.data?.questions).toHaveLength(2);
    expect(result.data?.questions[0].id).toBe(TQ1_ID);
  });

  it('returns success with data null when template does not exist', async () => {
    enqueue(null, { code: 'PGRST116', message: 'No rows found' });

    const result = await getTemplate('77777777-7777-4777-8777-777777777777');

    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });
});

// =============================================================================
// createTemplate
// =============================================================================

describe('createTemplate', () => {
  it('inserts template and questions, returns template id', async () => {
    ok({ id: 'tmpl-new' }); // questionnaire_templates insert → single
    ok(null);               // template_questions insert

    const result = await createTemplate(VALID_CREATE_INPUT);

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe('tmpl-new');
  });

  it('rejects when caller lacks organizer role', async () => {
    vi.mocked(requireRole).mockResolvedValue({
      success: false,
      error: 'Requires organizer role or higher',
      data: null,
    });

    const result = await createTemplate(VALID_CREATE_INPUT);

    expect(result.success).toBe(false);
  });

  it('rejects invalid input (empty name)', async () => {
    const result = await createTemplate({ name: '', description: null, questions: [] });

    expect(result.success).toBe(false);
  });
});

// =============================================================================
// updateTemplate
// =============================================================================

describe('updateTemplate', () => {
  const VALID_UPDATE_INPUT = {
    id: TMPL_ID,
    name: 'Updated Name',
    description: null,
    questions: [{ type: 'short_text', label: 'Updated Q', required: false, position: 0 }],
  };

  it('updates metadata, replaces questions, returns template id', async () => {
    ok([{ id: TMPL_ID }]); // template update → direct await (array)
    ok(null);               // template_questions delete
    ok(null);               // template_questions insert

    const result = await updateTemplate(VALID_UPDATE_INPUT);

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe(TMPL_ID);
  });

  it('returns access denied when RLS rejects the update (empty row array)', async () => {
    ok([]); // RLS prevents update → returns 0 rows

    const result = await updateTemplate(VALID_UPDATE_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found or access denied/i);
  });

  it('admin override succeeds when RLS allows the update', async () => {
    vi.mocked(requireRole).mockResolvedValue({
      success: true,
      error: null,
      data: { role: 'admin', userId: ADMIN_ID },
    });

    ok([{ id: TMPL_ID }]);
    ok(null);
    ok(null);

    const result = await updateTemplate(VALID_UPDATE_INPUT);

    expect(result.success).toBe(true);
  });
});

// =============================================================================
// deleteTemplate
// =============================================================================

describe('deleteTemplate', () => {
  it('deletes the template and returns success', async () => {
    ok(null);

    const result = await deleteTemplate(TMPL_ID);

    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it('rejects when caller lacks organizer role', async () => {
    vi.mocked(requireRole).mockResolvedValue({
      success: false,
      error: 'Requires organizer role or higher',
      data: null,
    });

    const result = await deleteTemplate(TMPL_ID);

    expect(result.success).toBe(false);
  });
});

// =============================================================================
// seedEventQuestionnaireFromTemplate
// =============================================================================

describe('seedEventQuestionnaireFromTemplate', () => {
  const SEED_INPUT = {
    eventId: EVENT_ID,
    templateId: TMPL_ID,
    replaceExisting: false,
  };

  it('copies template questions and returns questionsCount', async () => {
    ok({ id: EQ_ID });     // event_questionnaires single
    ok([TQ1, TQ2]);        // template_questions
    ok([{ position: 2 }]); // max existing position (limit)
    ok(null);              // event_questions insert
    ok(null);              // event_questionnaires update (best-effort)

    const result = await seedEventQuestionnaireFromTemplate(SEED_INPUT);

    expect(result.success).toBe(true);
    expect(result.data?.questionsCount).toBe(2);
    expect(result.data?.eventQuestionnaireId).toBe(EQ_ID);
  });

  it('clears existing questions first when replaceExisting is true', async () => {
    ok({ id: EQ_ID }); // event_questionnaires single
    ok([TQ1]);           // template_questions
    ok(null);            // event_questions delete
    ok(null);            // event_questions insert
    ok(null);            // event_questionnaires update

    const result = await seedEventQuestionnaireFromTemplate({
      ...SEED_INPUT,
      replaceExisting: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.questionsCount).toBe(1);
  });

  it('remaps show_if.questionId to the new event question id', async () => {
    const TQ2_WITH_SHOWIF: TemplateQuestionRow = {
      ...TQ2,
      show_if: { questionId: TQ1_ID, operator: 'equals', value: 'yes' } as unknown as null,
    };

    ok({ id: EQ_ID });
    ok([TQ1, TQ2_WITH_SHOWIF]);
    ok([]); // no existing questions → startPosition = 0
    ok(null);
    ok(null);

    await seedEventQuestionnaireFromTemplate(SEED_INPUT);

    const rows = insertCapture as Array<{ id: string; show_if: { questionId: string } | null }>;
    expect(rows).toHaveLength(2);
    // TQ2's show_if must reference the newly-generated id for TQ1, not the old template id
    expect(rows[1].show_if?.questionId).toBe(rows[0].id);
    expect(rows[1].show_if?.questionId).not.toBe(TQ1_ID);
  });

  it('rejects when the event is not in draft status', async () => {
    vi.mocked(requireDraftEvent).mockResolvedValue({
      success: false,
      error: 'Event is not in draft status (current: active)',
      data: null,
    });

    const result = await seedEventQuestionnaireFromTemplate(SEED_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/draft/i);
  });
});
