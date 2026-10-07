import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicationsFilter } from '@/components/dashboard/applications-filter';

// =============================================================================
// Mocks
// =============================================================================

const { mockPush, searchParamsState } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  searchParamsState: { current: '' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard/applications',
  useSearchParams: () => new URLSearchParams(searchParamsState.current),
}));

// =============================================================================
// Fixtures
// =============================================================================

const EVENTS = [
  { id: 'evt-winter', name: 'Holigay Winter Market 2026' },
  { id: 'evt-dry-run', name: 'UAT Dry Run — 2026-10-06' },
];

function renderFilter(query = '') {
  searchParamsState.current = query;
  return render(<ApplicationsFilter events={EVENTS} />);
}

/** The query string the component pushed, parsed. */
function pushedParams(): URLSearchParams {
  const url = mockPush.mock.calls.at(-1)?.[0] as string;
  return new URLSearchParams(url.split('?')[1] ?? '');
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Event filter (F-006)
// =============================================================================

describe('ApplicationsFilter — event filter', () => {
  it('offers every event plus an all-events option', () => {
    renderFilter();

    const select = screen.getByLabelText('Event');
    const labels = Array.from((select as HTMLSelectElement).options).map((o) => o.textContent);
    expect(labels).toEqual([
      'All Events',
      'Holigay Winter Market 2026',
      'UAT Dry Run — 2026-10-06',
    ]);
  });

  it('pushes ?event=<id> when an event is chosen, dropping any page number', async () => {
    const user = userEvent.setup();
    renderFilter('page=3&status=pending');

    await user.selectOptions(screen.getByLabelText('Event'), 'evt-dry-run');

    const params = pushedParams();
    expect(params.get('event')).toBe('evt-dry-run');
    expect(params.get('status')).toBe('pending');
    expect(params.has('page')).toBe(false);
  });

  it('reflects the event from the URL and names it in the active filters', () => {
    renderFilter('event=evt-winter');

    expect(screen.getByLabelText('Event')).toHaveValue('evt-winter');
    expect(screen.getByText('Event: Holigay Winter Market 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('removes only the event param from its chip, and everything on Clear filters', async () => {
    const user = userEvent.setup();
    renderFilter('event=evt-winter&status=approved');

    await user.click(screen.getByRole('button', { name: 'Remove event filter' }));
    expect(pushedParams().has('event')).toBe(false);
    expect(pushedParams().get('status')).toBe('approved');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(pushedParams().toString()).toBe('');
  });

  it('still renders without an events list', () => {
    searchParamsState.current = '';
    render(<ApplicationsFilter />);

    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.queryByLabelText('Event')).not.toBeInTheDocument();
  });
});
