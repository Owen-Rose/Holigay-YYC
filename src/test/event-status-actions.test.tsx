import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventStatusActions } from '@/app/dashboard/events/event-status-actions';

// =============================================================================
// Mocks
// =============================================================================

const mockUpdateEventStatus = vi.fn();
const mockDeleteEvent = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockRouterRefresh = vi.fn();

vi.mock('@/lib/actions/events', () => ({
  updateEventStatus: (...args: unknown[]) => mockUpdateEventStatus(...args),
  deleteEvent: (...args: unknown[]) => mockDeleteEvent(...args),
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

// =============================================================================
// Helpers
// =============================================================================

function renderActions(override: Partial<React.ComponentProps<typeof EventStatusActions>> = {}) {
  return render(
    <EventStatusActions eventId="event-1" status="draft" applicationCount={0} {...override} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateEventStatus.mockResolvedValue({ success: true, error: null });
  mockDeleteEvent.mockResolvedValue({ success: true, error: null });
});

// =============================================================================
// Status transitions (existing behaviour)
// =============================================================================

describe('EventStatusActions — status transitions', () => {
  it('offers Publish for a draft event', async () => {
    const user = userEvent.setup();
    renderActions({ status: 'draft' });

    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(mockUpdateEventStatus).toHaveBeenCalledWith('event-1', 'active'));
    expect(mockToastSuccess).toHaveBeenCalledWith('Event published');
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('publishes exactly once on a double-click while the first call is in flight', async () => {
    let resolvePublish: (value: { success: boolean; error: null }) => void = () => {};
    mockUpdateEventStatus.mockReturnValue(
      new Promise((resolve) => {
        resolvePublish = resolve;
      })
    );
    const user = userEvent.setup();
    renderActions({ status: 'draft' });

    await user.dblClick(screen.getByRole('button', { name: 'Publish' }));

    expect(mockUpdateEventStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateEventStatus).toHaveBeenCalledWith('event-1', 'active');

    resolvePublish({ success: true, error: null });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Event published'));
  });

  it('asks for confirmation instead of closing on the first click', async () => {
    const user = userEvent.setup();
    renderActions({ status: 'active' });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(mockUpdateEventStatus).not.toHaveBeenCalled();
    expect(screen.getByText('Close event?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, close' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('returns to idle on Cancel without closing', async () => {
    const user = userEvent.setup();
    renderActions({ status: 'active' });

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockUpdateEventStatus).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByText('Close event?')).not.toBeInTheDocument();
  });

  it('closes the event once confirmed', async () => {
    const user = userEvent.setup();
    renderActions({ status: 'active' });

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Yes, close' }));

    await waitFor(() => expect(mockUpdateEventStatus).toHaveBeenCalledWith('event-1', 'closed'));
    expect(mockUpdateEventStatus).toHaveBeenCalledTimes(1);
    expect(mockToastSuccess).toHaveBeenCalledWith('Event closed');
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('surfaces the action error and stays on the row when the close fails', async () => {
    mockUpdateEventStatus.mockResolvedValue({
      success: false,
      error: 'Cannot change status from "active" to "closed"',
    });
    const user = userEvent.setup();
    renderActions({ status: 'active' });

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Yes, close' }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Cannot change status from "active" to "closed"')
    );
    expect(mockRouterRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('offers no transition for a closed event', () => {
    renderActions({ status: 'closed' });

    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });
});

// =============================================================================
// Delete visibility
// =============================================================================

describe('EventStatusActions — delete visibility', () => {
  it('offers Delete when the event has no applications', () => {
    renderActions({ applicationCount: 0 });

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('hides Delete when the event has applications', () => {
    renderActions({ applicationCount: 3 });

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('still offers Delete for a closed event with no applications', () => {
    renderActions({ status: 'closed', applicationCount: 0 });

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('renders nothing for a closed event that has applications', () => {
    const { container } = renderActions({ status: 'closed', applicationCount: 2 });

    expect(container).toBeEmptyDOMElement();
  });
});

// =============================================================================
// Two-step confirmation
// =============================================================================

describe('EventStatusActions — delete confirmation', () => {
  it('asks for confirmation instead of deleting on the first click', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mockDeleteEvent).not.toHaveBeenCalled();
    expect(screen.getByText('Delete?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('hides the status transition while confirming', async () => {
    const user = userEvent.setup();
    renderActions({ status: 'draft' });

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('returns to the idle state on Cancel without deleting', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockDeleteEvent).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByText('Delete?')).not.toBeInTheDocument();
  });

  it('deletes the event once confirmed', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));

    await waitFor(() => expect(mockDeleteEvent).toHaveBeenCalledWith('event-1'));
    expect(mockDeleteEvent).toHaveBeenCalledTimes(1);
    expect(mockToastSuccess).toHaveBeenCalledWith('Event deleted');
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it('surfaces the action error and stays on the row when the delete fails', async () => {
    mockDeleteEvent.mockResolvedValue({
      success: false,
      error:
        'Cannot delete this event because it has 2 applications. Set the status to "Closed" instead.',
    });
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'Cannot delete this event because it has 2 applications. Set the status to "Closed" instead.'
      )
    );
    expect(mockRouterRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});

// =============================================================================
// Row link containment
// =============================================================================

describe('EventStatusActions — row link containment', () => {
  it('does not let any control bubble a click to the surrounding row link', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();

    render(
      <div onClick={onRowClick}>
        <EventStatusActions eventId="event-1" status="draft" applicationCount={0} />
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onRowClick).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onRowClick).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('does not let the close confirmation bubble a click to the row link', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();

    render(
      <div onClick={onRowClick}>
        <EventStatusActions eventId="event-1" status="active" applicationCount={2} />
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Yes, close' }));

    expect(onRowClick).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Narrow cells (UAT-8)
// =============================================================================

describe('EventStatusActions — narrow cells', () => {
  it('lets the delete confirmation wrap so it stays inside its grid cell', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const row = screen.getByText('Delete?').parentElement;
    expect(row).toHaveClass('flex-wrap');
    expect(row).toHaveClass('justify-end');
  });

  it('lets the close confirmation and the idle pair wrap too', async () => {
    const user = userEvent.setup();
    renderActions({ status: 'active' });

    expect(screen.getByRole('button', { name: 'Close' }).parentElement).toHaveClass('flex-wrap');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText('Close event?').parentElement).toHaveClass('flex-wrap');
  });
});
