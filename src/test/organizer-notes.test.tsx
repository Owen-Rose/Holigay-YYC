import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrganizerNotes } from '@/app/dashboard/applications/[id]/organizer-notes';
import { NotesDraftProvider } from '@/app/dashboard/applications/[id]/notes-draft-context';

const mockUpdateApplicationNotes = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockRouterRefresh = vi.fn();

vi.mock('@/lib/actions/applications', () => ({
  updateApplicationNotes: (...args: unknown[]) => mockUpdateApplicationNotes(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

function renderNotes(initialNotes = '') {
  return render(
    <NotesDraftProvider applicationId="app-1" initialNotes={initialNotes}>
      <OrganizerNotes />
    </NotesDraftProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateApplicationNotes.mockResolvedValue({ success: true, error: null });
});

describe('OrganizerNotes', () => {
  it('shows the stored notes with Save disabled until something changes', () => {
    renderNotes('Existing note');

    expect(screen.getByDisplayValue('Existing note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Notes' })).toBeDisabled();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('marks edits as unsaved and saves them through the action', async () => {
    const user = userEvent.setup();
    renderNotes();

    await user.type(screen.getByPlaceholderText(/add notes/i), 'Needs power');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save Notes' }));

    await waitFor(() =>
      expect(mockUpdateApplicationNotes).toHaveBeenCalledWith('app-1', 'Needs power')
    );
    expect(mockToastSuccess).toHaveBeenCalledWith('Notes saved');
    expect(mockRouterRefresh).toHaveBeenCalled();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('keeps the draft and shows the error when the save fails', async () => {
    mockUpdateApplicationNotes.mockResolvedValue({
      success: false,
      error: 'Failed to update notes',
    });
    const user = userEvent.setup();
    renderNotes();

    await user.type(screen.getByPlaceholderText(/add notes/i), 'Needs power');
    await user.click(screen.getByRole('button', { name: 'Save Notes' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to update notes'));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Needs power')).toBeInTheDocument();
  });
});
