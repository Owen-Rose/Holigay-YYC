import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserWithRole } from '@/lib/actions/admin';

// Team page Pending badge and Resend — spec 009 FR-023, FR-024, FR-025.

const mockGetUsers = vi.fn();
const mockInviteOrganizer = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/lib/actions/admin', () => ({
  getUsers: (...args: unknown[]) => mockGetUsers(...args),
}));
vi.mock('@/lib/actions/team', () => ({
  inviteOrganizer: (...args: unknown[]) => mockInviteOrganizer(...args),
}));
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import TeamPage from '@/app/dashboard/team/page';

const USERS: UserWithRole[] = [
  {
    id: 'u-pending',
    email: 'pending@example.com',
    role: 'organizer',
    createdAt: '2026-09-27T00:00:00Z',
    roleUpdatedAt: null,
    invitePending: true,
  },
  {
    id: 'u-admin',
    email: 'admin@example.com',
    role: 'admin',
    createdAt: '2026-01-01T00:00:00Z',
    roleUpdatedAt: null,
    invitePending: false,
  },
  {
    id: 'u-org',
    email: 'organizer@example.com',
    role: 'organizer',
    createdAt: '2026-02-01T00:00:00Z',
    roleUpdatedAt: null,
    invitePending: false,
  },
  {
    id: 'u-vendor',
    email: 'vendor@example.com',
    role: 'vendor',
    createdAt: '2026-03-01T00:00:00Z',
    roleUpdatedAt: null,
    invitePending: false,
  },
];

function rowFor(email: string) {
  return screen.getByText(email).closest('[data-testid="team-member-row"]') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUsers.mockResolvedValue({ success: true, error: null, data: USERS });
});

describe('TeamPage pending invitations', () => {
  it('shows Pending and Resend only on the pending member', async () => {
    render(<TeamPage />);
    await screen.findByText('pending@example.com');

    const pending = rowFor('pending@example.com');
    expect(within(pending).getByText('Pending')).toBeInTheDocument();
    expect(
      within(pending).getByRole('button', { name: 'Resend invitation to pending@example.com' })
    ).toBeInTheDocument();

    for (const email of ['admin@example.com', 'organizer@example.com']) {
      const row = rowFor(email);
      expect(within(row).queryByText('Pending')).not.toBeInTheDocument();
      expect(within(row).queryByRole('button', { name: /Resend/ })).not.toBeInTheDocument();
    }
  });

  it('re-sends to that row, toasts and re-fetches the team', async () => {
    mockInviteOrganizer.mockResolvedValue({ success: true, error: null, data: { resent: true } });
    const user = userEvent.setup();
    render(<TeamPage />);
    await screen.findByText('pending@example.com');

    await user.click(
      screen.getByRole('button', { name: 'Resend invitation to pending@example.com' })
    );

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Invitation re-sent to pending@example.com')
    );
    expect(mockInviteOrganizer).toHaveBeenCalledWith('pending@example.com');
    await waitFor(() => expect(mockGetUsers).toHaveBeenCalledTimes(2));
  });

  it('toasts the action error verbatim', async () => {
    mockInviteOrganizer.mockResolvedValue({
      success: false,
      error: 'Failed to send invitation',
      data: null,
    });
    const user = userEvent.setup();
    render(<TeamPage />);
    await screen.findByText('pending@example.com');

    await user.click(
      screen.getByRole('button', { name: 'Resend invitation to pending@example.com' })
    );

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to send invitation'));
  });

  it('keeps the summary tiles as before (pending members still count)', async () => {
    render(<TeamPage />);
    await screen.findByText('pending@example.com');

    const tile = (label: string) =>
      screen.getByText(label, { selector: 'p' }).nextElementSibling?.textContent;
    expect(tile('Team Members')).toBe('3');
    expect(tile('Organizers')).toBe('2');
    expect(tile('Admins')).toBe('1');
  });
});
