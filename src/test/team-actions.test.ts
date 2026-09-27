import { describe, it, expect, vi, beforeEach } from 'vitest';

// inviteOrganizer — contracts/server-actions.md §inviteOrganizer (steps 1–5, a–f).

const mockRequireRole = vi.fn();
const mockCreateAdminClient = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock('@/lib/auth/roles', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

import { inviteOrganizer } from '@/lib/actions/team';

const FR002 = 'That email already has an account. Change their role on the Admin page instead.';

// A hand-built fake of the admin client: only the calls inviteOrganizerCore makes.
function fakeAdmin(opts: {
  row?: { id: string; invite_pending: boolean | null } | null;
  lookupError?: { code: string; message: string } | null;
  inviteError?: { code?: string; message: string } | null;
  updateError?: { code: string; message: string } | null;
}) {
  const lookupEq = vi.fn();
  const updateEq = vi.fn();
  const update = vi.fn();
  const inviteUserByEmail = vi.fn().mockResolvedValue({
    data: { user: opts.inviteError ? null : { id: 'new-user-id' } },
    error: opts.inviteError ?? null,
  });
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'users_with_roles') {
        return {
          select: () => ({
            eq: (...args: unknown[]) => {
              lookupEq(...args);
              return {
                maybeSingle: () =>
                  Promise.resolve({ data: opts.row ?? null, error: opts.lookupError ?? null }),
              };
            },
          }),
        };
      }
      return {
        update: (values: unknown) => {
          update(values);
          return {
            eq: (...args: unknown[]) => {
              updateEq(...args);
              return Promise.resolve({ error: opts.updateError ?? null });
            },
          };
        },
      };
    }),
    auth: { admin: { inviteUserByEmail } },
  };
  return { client, lookupEq, update, updateEq, inviteUserByEmail };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockRequireRole.mockResolvedValue({
    success: true,
    error: null,
    data: { role: 'admin', userId: 'admin-1' },
  });
});

describe('inviteOrganizer', () => {
  it('returns the requireRole message for a non-admin and touches nothing', async () => {
    mockRequireRole.mockResolvedValue({
      success: false,
      error: 'Requires admin role or higher',
      data: null,
    });

    const result = await inviteOrganizer('new@example.com');

    expect(mockRequireRole).toHaveBeenCalledWith('admin');
    expect(result).toEqual({ success: false, error: 'Requires admin role or higher', data: null });
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('rejects an invalid address before creating the admin client', async () => {
    const result = await inviteOrganizer('not-an-email');

    expect(result).toEqual({
      success: false,
      error: 'Please enter a valid email address',
      data: null,
    });
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('fails closed when the service-role key is not configured', async () => {
    mockCreateAdminClient.mockReturnValue(null);

    const result = await inviteOrganizer('new@example.com');

    expect(result).toEqual({
      success: false,
      error: 'Invites are not configured on this deployment',
      data: null,
    });
  });

  it('looks the address up trimmed and lower-cased', async () => {
    const fake = fakeAdmin({ row: null });
    mockCreateAdminClient.mockReturnValue(fake.client);

    await inviteOrganizer(' Foo@Example.com ');

    expect(fake.lookupEq).toHaveBeenCalledWith('email', 'foo@example.com');
    expect(fake.inviteUserByEmail).toHaveBeenCalledWith('foo@example.com');
  });

  it('refuses an existing account that is not pending and sends nothing', async () => {
    const fake = fakeAdmin({ row: { id: 'u1', invite_pending: false } });
    mockCreateAdminClient.mockReturnValue(fake.client);

    const result = await inviteOrganizer('taken@example.com');

    expect(result).toEqual({ success: false, error: FR002, data: null });
    expect(fake.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('treats a null invite_pending as an existing account', async () => {
    const fake = fakeAdmin({ row: { id: 'u1', invite_pending: null } });
    mockCreateAdminClient.mockReturnValue(fake.client);

    const result = await inviteOrganizer('taken@example.com');

    expect(result.error).toBe(FR002);
    expect(fake.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('re-sends to a pending invitee without touching the role', async () => {
    const fake = fakeAdmin({ row: { id: 'u1', invite_pending: true } });
    mockCreateAdminClient.mockReturnValue(fake.client);

    const result = await inviteOrganizer('pending@example.com');

    expect(result).toEqual({ success: true, error: null, data: { resent: true } });
    expect(fake.inviteUserByEmail).toHaveBeenCalledWith('pending@example.com');
    expect(fake.update).not.toHaveBeenCalled();
  });

  it('invites a new address and sets the organizer role', async () => {
    const fake = fakeAdmin({ row: null });
    mockCreateAdminClient.mockReturnValue(fake.client);

    const result = await inviteOrganizer('new@example.com');

    expect(fake.update).toHaveBeenCalledWith({ role: 'organizer' });
    expect(fake.updateEq).toHaveBeenCalledWith('id', 'new-user-id');
    expect(result).toEqual({ success: true, error: null, data: { resent: false } });
  });

  it('reports a role-update failure after the invite was sent', async () => {
    const fake = fakeAdmin({ row: null, updateError: { code: '42501', message: 'denied' } });
    mockCreateAdminClient.mockReturnValue(fake.client);

    const result = await inviteOrganizer('new@example.com');

    expect(result).toEqual({
      success: false,
      error: 'Invitation sent, but the role could not be set. Set it on the Admin page.',
      data: null,
    });
  });

  it('maps GoTrue email_exists to the existing-account message', async () => {
    const fake = fakeAdmin({
      row: null,
      inviteError: { code: 'email_exists', message: 'A user with this email already exists' },
    });
    mockCreateAdminClient.mockReturnValue(fake.client);

    const result = await inviteOrganizer('race@example.com');

    expect(result).toEqual({ success: false, error: FR002, data: null });
    expect(fake.update).not.toHaveBeenCalled();
  });

  it('maps any other GoTrue error to a generic message', async () => {
    const fake = fakeAdmin({
      row: null,
      inviteError: { code: 'unexpected_failure', message: 'Error sending invite email' },
    });
    mockCreateAdminClient.mockReturnValue(fake.client);

    const result = await inviteOrganizer('new@example.com');

    expect(result).toEqual({ success: false, error: 'Failed to send invitation', data: null });
  });

  it('maps a lookup error to a generic message and sends nothing', async () => {
    const fake = fakeAdmin({ lookupError: { code: 'PGRST000', message: 'boom' } });
    mockCreateAdminClient.mockReturnValue(fake.client);

    const result = await inviteOrganizer('new@example.com');

    expect(result).toEqual({ success: false, error: 'Failed to send invitation', data: null });
    expect(fake.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('revalidates the team and admin pages after a success', async () => {
    mockCreateAdminClient.mockReturnValue(fakeAdmin({ row: null }).client);

    await inviteOrganizer('new@example.com');

    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/team');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/admin');
  });

  it('does not revalidate after a failure', async () => {
    mockCreateAdminClient.mockReturnValue(
      fakeAdmin({ row: { id: 'u1', invite_pending: false } }).client
    );

    await inviteOrganizer('taken@example.com');

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
