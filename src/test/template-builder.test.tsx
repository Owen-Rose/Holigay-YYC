import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateBuilder } from '@/app/dashboard/templates/[id]/template-builder';
import type { Database } from '@/types/database';

type TemplateQuestionRow = Database['public']['Tables']['template_questions']['Row'];

// =============================================================================
// Mocks
// =============================================================================

const mockCreateTemplate = vi.fn();
const mockUpdateTemplate = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('@/lib/actions/templates', () => ({
  createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
  updateTemplate: (...args: unknown[]) => mockUpdateTemplate(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
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

const makeTemplateQuestion = (override: Partial<TemplateQuestionRow> = {}): TemplateQuestionRow => ({
  id: `tq-${Math.random().toString(36).slice(2)}`,
  template_id: 'tmpl-1',
  type: 'short_text',
  label: 'Sample question',
  help_text: null,
  required: false,
  options: null,
  show_if: null,
  position: 0,
  ...override,
});

// =============================================================================
// Helpers
// =============================================================================

function renderNew() {
  return render(<TemplateBuilder initialQuestions={[]} />);
}

function renderEdit(questions: TemplateQuestionRow[] = []) {
  return render(
    <TemplateBuilder
      templateId="tmpl-1"
      initialName="Existing Template"
      initialDescription="Some description"
      initialQuestions={questions}
    />,
  );
}

// =============================================================================
// Setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();

  mockCreateTemplate.mockResolvedValue({ success: true, error: null, data: { id: 'tmpl-new' } });
  mockUpdateTemplate.mockResolvedValue({ success: true, error: null, data: { id: 'tmpl-1' } });
});

// =============================================================================
// Tests
// =============================================================================

describe('TemplateBuilder', () => {
  describe('initial render — new mode', () => {
    it('shows empty name input and Create template button', () => {
      renderNew();

      expect(screen.getByPlaceholderText(/e\.g\. holiday market standard/i)).toHaveValue('');
      expect(screen.getByRole('button', { name: /create template/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save template/i })).not.toBeInTheDocument();
    });
  });

  describe('initial render — edit mode', () => {
    it('shows pre-populated name and Save template button', () => {
      renderEdit();

      expect(screen.getByDisplayValue('Existing Template')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save template/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /create template/i })).not.toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('shows name error and blocks save when name is empty', async () => {
      const user = userEvent.setup();
      renderNew();

      await user.click(screen.getByRole('button', { name: /create template/i }));

      await waitFor(() => {
        expect(screen.getByText(/template name is required/i)).toBeInTheDocument();
      });

      expect(mockCreateTemplate).not.toHaveBeenCalled();
    });

    it('shows label error and blocks save when a question has an empty label', async () => {
      const user = userEvent.setup();
      renderNew();

      await user.click(screen.getByRole('button', { name: /add question/i }));
      await user.type(screen.getByPlaceholderText(/e\.g\. holiday market standard/i), 'My Template');
      await user.click(screen.getByRole('button', { name: /create template/i }));

      await waitFor(() => {
        expect(screen.getByText(/label is required/i)).toBeInTheDocument();
      });

      expect(mockCreateTemplate).not.toHaveBeenCalled();
    });
  });

  describe('save — new mode', () => {
    it('calls createTemplate and redirects to the new template page on success', async () => {
      const user = userEvent.setup();
      renderNew();

      await user.type(screen.getByPlaceholderText(/e\.g\. holiday market standard/i), 'New Template');
      await user.click(screen.getByRole('button', { name: /create template/i }));

      await waitFor(() => {
        expect(mockCreateTemplate).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'New Template', questions: [] }),
        );
      });

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/dashboard/templates/tmpl-new');
      });
    });
  });

  describe('save — edit mode', () => {
    it('calls updateTemplate with templateId and shows success toast', async () => {
      const user = userEvent.setup();
      const q = makeTemplateQuestion({ id: 'tq-1', label: 'Existing Q' });
      renderEdit([q]);

      await user.click(screen.getByRole('button', { name: /save template/i }));

      await waitFor(() => {
        expect(mockUpdateTemplate).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'tmpl-1', name: 'Existing Template' }),
        );
      });

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('Template saved');
      });

      expect(mockRouterPush).not.toHaveBeenCalled();
    });
  });

  describe('save failure', () => {
    it('renders an error alert when createTemplate returns a failure', async () => {
      mockCreateTemplate.mockResolvedValue({
        success: false,
        error: 'Failed to create template',
        data: null,
      });

      const user = userEvent.setup();
      renderNew();

      await user.type(screen.getByPlaceholderText(/e\.g\. holiday market standard/i), 'My Template');
      await user.click(screen.getByRole('button', { name: /create template/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/failed to create template/i);
      });
    });
  });
});
