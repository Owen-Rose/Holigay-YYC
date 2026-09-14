import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionnaireBuilder } from '@/app/dashboard/events/[id]/questionnaire-builder';
import type { Database } from '@/types/database';

type EventQuestion = Database['public']['Tables']['event_questions']['Row'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// =============================================================================
// Mocks
// =============================================================================

const { mockSave, mockRefresh, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockSave: vi.fn(),
  mockRefresh: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/actions/questionnaires', () => ({
  saveEventQuestionnaire: (...args: unknown[]) => mockSave(...args),
}));

vi.mock('@/lib/actions/templates', () => ({
  seedEventQuestionnaireFromTemplate: vi
    .fn()
    .mockResolvedValue({ success: true, error: null, data: null }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// =============================================================================
// Fixtures
// =============================================================================

const makeQuestion = (override: Partial<EventQuestion> = {}): EventQuestion => ({
  id: `q-${Math.random().toString(36).slice(2)}`,
  event_questionnaire_id: 'eq-1',
  type: 'short_text',
  label: 'Sample question',
  help_text: null,
  required: false,
  options: null,
  show_if: null,
  position: 0,
  ...override,
});

const THREE_DEFAULTS: EventQuestion[] = [
  makeQuestion({
    id: 'q-1',
    label: 'Booth Preference',
    type: 'single_select',
    position: 0,
    options: [{ key: 'indoor', label: 'Indoor' }] as unknown as null,
  }),
  makeQuestion({
    id: 'q-2',
    label: 'Product Categories',
    type: 'multi_select',
    position: 1,
    options: [{ key: 'crafts', label: 'Crafts' }] as unknown as null,
  }),
  makeQuestion({ id: 'q-3', label: 'Special Requirements', type: 'long_text', position: 2 }),
];

type SentQuestion = {
  id?: string;
  type: EventQuestion['type'];
  label: string;
  help_text: string | null;
  required: boolean;
  options: unknown[] | null;
  show_if: unknown;
};

/** Echo the payload back as saved rows, the way the RPC does. */
function echoSave() {
  mockSave.mockImplementation(async (_eventId: string, questions: SentQuestion[]) => ({
    success: true,
    error: null,
    data: questions.map((q, position) =>
      makeQuestion({
        ...q,
        id: q.id ?? 'server-assigned',
        position,
        options: q.options as unknown as null,
        show_if: q.show_if as unknown as null,
      })
    ),
  }));
}

function sentQuestions(): SentQuestion[] {
  return mockSave.mock.calls[0][1] as SentQuestion[];
}

function renderBuilder(questions: EventQuestion[] = THREE_DEFAULTS, isLocked = false) {
  return render(
    <QuestionnaireBuilder eventId="event-1" initialQuestions={questions} isLocked={isLocked} />
  );
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  echoSave();
});

describe('QuestionnaireBuilder', () => {
  describe('initial render', () => {
    it('shows all three initial questions', () => {
      renderBuilder();

      expect(screen.getByDisplayValue('Booth Preference')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Product Categories')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Special Requirements')).toBeInTheDocument();
    });

    it('shows Add question and Save questionnaire buttons', () => {
      renderBuilder();

      expect(screen.getByRole('button', { name: /add question/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save questionnaire/i })).toBeInTheDocument();
    });

    it('renders a locked view when isLocked is true', () => {
      renderBuilder(THREE_DEFAULTS, true);

      expect(screen.getByText(/questionnaire locked/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add question/i })).not.toBeInTheDocument();
    });
  });

  describe('adding a question', () => {
    it('appends a new empty editor when "Add question" is clicked', async () => {
      const user = userEvent.setup();
      renderBuilder();

      await user.click(screen.getByRole('button', { name: /add question/i }));

      expect(screen.getAllByPlaceholderText(/question label/i)).toHaveLength(4);
    });

    it('lets a later question use a not-yet-saved yes_no question as its show-if trigger', async () => {
      const user = userEvent.setup();
      renderBuilder([]);

      await user.click(screen.getByRole('button', { name: /add question/i }));
      await user.selectOptions(screen.getAllByLabelText('Type')[0], 'yes_no');
      await user.click(screen.getByRole('button', { name: /add question/i }));

      expect(screen.getByLabelText(/show only if/i)).toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('shows an inline error and does not call the action when a label is empty', async () => {
      const user = userEvent.setup();
      renderBuilder();

      await user.click(screen.getByRole('button', { name: /add question/i }));
      await user.click(screen.getByRole('button', { name: /save questionnaire/i }));

      await waitFor(() => {
        expect(screen.getByText(/label is required/i)).toBeInTheDocument();
      });
      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  describe('saving', () => {
    it('sends the whole questionnaire in one call, new questions carrying a client UUID', async () => {
      const user = userEvent.setup();
      renderBuilder();

      await user.click(screen.getByRole('button', { name: /add question/i }));
      const labelInputs = screen.getAllByPlaceholderText(/question label/i);
      await user.type(labelInputs[3], 'New question');

      await user.click(screen.getByRole('button', { name: /save questionnaire/i }));

      await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
      expect(mockSave.mock.calls[0][0]).toBe('event-1');

      const sent = sentQuestions();
      expect(sent.map((q) => q.label)).toEqual([
        'Booth Preference',
        'Product Categories',
        'Special Requirements',
        'New question',
      ]);
      expect(sent.slice(0, 3).map((q) => q.id)).toEqual(['q-1', 'q-2', 'q-3']);
      expect(sent[3].id).toMatch(UUID_RE);
      expect(sent[0].options).toEqual([{ key: 'indoor', label: 'Indoor' }]);
      expect(sent[3].options).toBeNull();
      expect(sent[3].help_text).toBeNull();

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Questionnaire saved'));
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it('omits a removed question from the payload', async () => {
      const user = userEvent.setup();
      renderBuilder();

      await user.click(screen.getAllByRole('button', { name: /remove question/i })[0]);
      await user.click(screen.getByRole('button', { name: /save questionnaire/i }));

      await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
      expect(sentQuestions().map((q) => q.id)).toEqual(['q-2', 'q-3']);
    });

    it('sends questions in their reordered display order', async () => {
      const user = userEvent.setup();
      renderBuilder();

      await user.click(screen.getAllByRole('button', { name: /move question down/i })[0]);
      await user.click(screen.getByRole('button', { name: /save questionnaire/i }));

      await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
      expect(sentQuestions().map((q) => q.id)).toEqual(['q-2', 'q-1', 'q-3']);
    });

    it('shows the action error as a toast and leaves the editor in place', async () => {
      mockSave.mockResolvedValue({
        success: false,
        error: 'This event has been published; its questionnaire is locked',
        data: null,
      });
      const user = userEvent.setup();
      renderBuilder();

      await user.click(screen.getByRole('button', { name: /save questionnaire/i }));

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith(
          'This event has been published; its questionnaire is locked'
        )
      );
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(mockRefresh).not.toHaveBeenCalled();
      expect(screen.getByDisplayValue('Booth Preference')).toBeInTheDocument();
    });
  });
});
