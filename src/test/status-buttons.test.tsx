import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusUpdateButtons } from '@/app/dashboard/applications/[id]/status-buttons';

// =============================================================================
// Mocks
// =============================================================================

const mockUpdateApplicationStatus = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockToastWarning = vi.fn();
const mockRouterRefresh = vi.fn();

vi.mock('@/lib/actions/applications', () => ({
  updateApplicationStatus: (...args: unknown[]) => mockUpdateApplicationStatus(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    warning: (...args: unknown[]) => mockToastWarning(...args),
  },
}));

// =============================================================================
// Helpers
// =============================================================================

const ALL_LABELS = ['Pending', 'Approve', 'Reject', 'Waitlist'];

function renderButtons(currentStatus = 'pending') {
  return render(<StatusUpdateButtons applicationId="app-1" currentStatus={currentStatus} />);
}

function statusButtons() {
  return ALL_LABELS.map((name) => screen.getByRole('button', { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateApplicationStatus.mockResolvedValue({ success: true, error: null });
});

// =============================================================================
// Stable layout (UAT-6)
// =============================================================================

describe('StatusUpdateButtons — stable layout', () => {
  it('renders every status in a fixed order with the current one disabled', () => {
    renderButtons('approved');

    const buttons = statusButtons();
    expect(buttons.map((b) => b.textContent)).toEqual(ALL_LABELS);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Pending' })).toBeEnabled();
  });

  it('keeps the same button order after the current status changes', () => {
    const { rerender } = renderButtons('pending');
    const before = statusButtons().map((b) => b.textContent);

    rerender(<StatusUpdateButtons applicationId="app-1" currentStatus="approved" />);

    expect(statusButtons().map((b) => b.textContent)).toEqual(before);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });
});

// =============================================================================
// Confirmation step (UAT-6)
// =============================================================================

describe('StatusUpdateButtons — confirmation', () => {
  it('asks for confirmation instead of updating on the first click', async () => {
    const user = userEvent.setup();
    renderButtons('pending');

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(mockUpdateApplicationStatus).not.toHaveBeenCalled();
    expect(screen.getByText(/change status to approved\?/i)).toBeInTheDocument();
    expect(screen.getByText(/the vendor will be emailed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('does not mention an email when moving back to pending', async () => {
    const user = userEvent.setup();
    renderButtons('approved');

    await user.click(screen.getByRole('button', { name: 'Pending' }));

    expect(screen.getByText(/change status to pending\?/i)).toBeInTheDocument();
    expect(screen.queryByText(/emailed/i)).not.toBeInTheDocument();
  });

  it('does nothing on a double-click of a status button', async () => {
    const user = userEvent.setup();
    renderButtons('pending');

    await user.dblClick(screen.getByRole('button', { name: 'Approve' }));

    expect(mockUpdateApplicationStatus).not.toHaveBeenCalled();
    expect(screen.getByText(/change status to approved\?/i)).toBeInTheDocument();
  });

  it('returns to idle on Cancel without updating', async () => {
    const user = userEvent.setup();
    renderButtons('pending');

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockUpdateApplicationStatus).not.toHaveBeenCalled();
    expect(screen.queryByText(/change status to/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it('updates exactly once when confirmed', async () => {
    const user = userEvent.setup();
    renderButtons('pending');

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockUpdateApplicationStatus).toHaveBeenCalledWith('app-1', 'approved')
    );
    expect(mockUpdateApplicationStatus).toHaveBeenCalledTimes(1);
    expect(mockToastSuccess).toHaveBeenCalledWith('Application approved');
    expect(mockRouterRefresh).toHaveBeenCalled();
    expect(screen.queryByText(/change status to/i)).not.toBeInTheDocument();
  });

  it('surfaces the email warning instead of a success toast', async () => {
    mockUpdateApplicationStatus.mockResolvedValue({
      success: true,
      error: null,
      warning: 'Status updated, but the notification email could not be sent to the vendor.',
    });
    const user = userEvent.setup();
    renderButtons('pending');

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockToastWarning).toHaveBeenCalledWith(
        'Status updated, but the notification email could not be sent to the vendor.'
      )
    );
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('surfaces the action error and does not refresh', async () => {
    mockUpdateApplicationStatus.mockResolvedValue({
      success: false,
      error: 'Application not found',
    });
    const user = userEvent.setup();
    renderButtons('pending');

    await user.click(screen.getByRole('button', { name: 'Waitlist' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Application not found'));
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });
});
