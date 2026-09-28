import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// InviteForm toasts — contracts/server-actions.md §inviteOrganizer (Client).

const mockInviteOrganizer = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/lib/actions/team', () => ({
  inviteOrganizer: (...args: unknown[]) => mockInviteOrganizer(...args),
}));
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import { InviteForm } from '@/components/team/invite-form';

beforeEach(() => {
  vi.clearAllMocks();
});

async function submit(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText('name@example.com'), email);
  await user.click(screen.getByRole('button', { name: 'Send Invite' }));
}

describe('InviteForm', () => {
  it.each([
    [false, 'Invitation sent to new@example.com'],
    [true, 'Invitation re-sent to new@example.com'],
  ])('resent=%s toasts "%s" and calls onInvited', async (resent, message) => {
    mockInviteOrganizer.mockResolvedValue({ success: true, error: null, data: { resent } });
    const onInvited = vi.fn();
    render(<InviteForm onInvited={onInvited} />);

    await submit('new@example.com');

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith(message));
    expect(mockInviteOrganizer).toHaveBeenCalledWith('new@example.com', 'organizer');
    expect(onInvited).toHaveBeenCalled();
  });

  it('toasts the action error verbatim', async () => {
    const error = 'That email already has an account. Change their role on the Admin page instead.';
    mockInviteOrganizer.mockResolvedValue({ success: false, error, data: null });
    render(<InviteForm />);

    await submit('taken@example.com');

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(error));
  });
});

describe('InviteForm role picker (spec 010)', () => {
  it('offers exactly Organizer and Vendor, Organizer selected', () => {
    render(<InviteForm />);

    const select = screen.getByLabelText('Role') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => [o.value, o.text])).toEqual([
      ['organizer', 'Organizer'],
      ['vendor', 'Vendor'],
    ]);
    expect(select.value).toBe('organizer');
  });

  it('invites as a vendor and resets to Organizer after success', async () => {
    mockInviteOrganizer.mockResolvedValue({ success: true, error: null, data: { resent: false } });
    const user = userEvent.setup();
    render(<InviteForm />);

    await user.selectOptions(screen.getByLabelText('Role'), 'vendor');
    await submit('new@example.com');

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Invitation sent to new@example.com')
    );
    expect(mockInviteOrganizer).toHaveBeenCalledWith('new@example.com', 'vendor');
    expect((screen.getByLabelText('Role') as HTMLSelectElement).value).toBe('organizer');
    expect((screen.getByPlaceholderText('name@example.com') as HTMLInputElement).value).toBe('');
  });

  it('invites as an organizer when the select is untouched', async () => {
    mockInviteOrganizer.mockResolvedValue({ success: true, error: null, data: { resent: false } });
    render(<InviteForm />);

    await submit('new@example.com');

    await waitFor(() =>
      expect(mockInviteOrganizer).toHaveBeenCalledWith('new@example.com', 'organizer')
    );
  });

  it('uses the team-member heading and copy', () => {
    render(<InviteForm />);

    expect(screen.getByRole('heading', { name: 'Invite team member' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Send an invitation email. Organizers review applications; vendors get a vendor dashboard.'
      )
    ).toBeInTheDocument();
  });
});
