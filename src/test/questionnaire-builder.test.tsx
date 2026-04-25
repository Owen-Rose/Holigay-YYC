import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionnaireBuilder } from '@/app/dashboard/events/[id]/questionnaire-builder';
import type { Database } from '@/types/database';

type EventQuestion = Database['public']['Tables']['event_questions']['Row'];

// =============================================================================
// Mocks
// =============================================================================

const mockAddEventQuestion = vi.fn();
const mockUpdateEventQuestion = vi.fn();
const mockDeleteEventQuestion = vi.fn();
const mockReorderEventQuestions = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/lib/actions/questionnaires', () => ({
  addEventQuestion: (...args: unknown[]) => mockAddEventQuestion(...args),
  updateEventQuestion: (...args: unknown[]) => mockUpdateEventQuestion(...args),
  deleteEventQuestion: (...args: unknown[]) => mockDeleteEventQuestion(...args),
  reorderEventQuestions: (...args: unknown[]) => mockReorderEventQuestions(...args),
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
  position: 1,
  ...override,
});

const THREE_DEFAULTS: EventQuestion[] = [
  makeQuestion({ id: 'q-1', label: 'Booth Preference', type: 'single_select', position: 1, options: [{ key: 'indoor', label: 'Indoor' }] as unknown as null }),
  makeQuestion({ id: 'q-2', label: 'Product Categories', type: 'multi_select', position: 2, options: [{ key: 'crafts', label: 'Crafts' }] as unknown as null }),
  makeQuestion({ id: 'q-3', label: 'Special Requirements', type: 'long_text', position: 3 }),
];

// =============================================================================
// Helpers
// =============================================================================

function renderBuilder(
  questions: EventQuestion[] = THREE_DEFAULTS,
  isLocked = false,
) {
  return render(
    <QuestionnaireBuilder eventId="event-1" initialQuestions={questions} isLocked={isLocked} />,
  );
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();

  mockAddEventQuestion.mockResolvedValue({
    success: true,
    error: null,
    data: makeQuestion({ id: 'q-new', label: 'New question' }),
  });
  mockUpdateEventQuestion.mockResolvedValue({ success: true, error: null, data: makeQuestion() });
  mockDeleteEventQuestion.mockResolvedValue({ success: true, error: null, data: null });
  mockReorderEventQuestions.mockResolvedValue({ success: true, error: null, data: null });
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

      expect(screen.getByText(/locked because the event has been published/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add question/i })).not.toBeInTheDocument();
    });
  });

  describe('adding a question', () => {
    it('appends a new empty editor when "Add question" is clicked', async () => {
      const user = userEvent.setup();
      renderBuilder();

      await user.click(screen.getByRole('button', { name: /add question/i }));

      // Now four label inputs should exist
      expect(screen.getAllByPlaceholderText(/question label/i)).toHaveLength(4);
    });
  });

  describe('validation', () => {
    it('shows an inline error and does not call any action when a label is empty', async () => {
      const user = userEvent.setup();
      renderBuilder();

      await user.click(screen.getByRole('button', { name: /add question/i }));
      // New question has empty label — do not fill it
      await user.click(screen.getByRole('button', { name: /save questionnaire/i }));

      await waitFor(() => {
        expect(screen.getByText(/label is required/i)).toBeInTheDocument();
      });

      expect(mockAddEventQuestion).not.toHaveBeenCalled();
      expect(mockUpdateEventQuestion).not.toHaveBeenCalled();
    });
  });

  describe('save success', () => {
    it('calls addEventQuestion for new questions and shows success toast', async () => {
      const user = userEvent.setup();
      renderBuilder();

      await user.click(screen.getByRole('button', { name: /add question/i }));

      // Fill in the new question's label
      const newLabelInputs = screen.getAllByPlaceholderText(/question label/i);
      await user.clear(newLabelInputs[3]);
      await user.type(newLabelInputs[3], 'New question');

      await user.click(screen.getByRole('button', { name: /save questionnaire/i }));

      await waitFor(() => {
        expect(mockAddEventQuestion).toHaveBeenCalledWith(
          'event-1',
          expect.objectContaining({ label: 'New question' }),
        );
      });

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('Questionnaire saved');
      });
    });

    it('shows error toast when an action fails', async () => {
      mockUpdateEventQuestion.mockResolvedValue({
        success: false,
        error: 'Event is not in draft status',
        data: null,
      });

      const user = userEvent.setup();
      renderBuilder();

      await user.click(screen.getByRole('button', { name: /save questionnaire/i }));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Event is not in draft status');
      });
    });
  });
});
