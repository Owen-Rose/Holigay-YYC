import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUsers, updateUserRole } from '@/lib/actions/admin';
import { requireRole } from '@/lib/auth/roles';
import type { Role } from '@/lib/constants/roles';
import type { Database } from '@/types/database';

type UsersWithRolesRow = Database['public']['Views']['users_with_roles']['Row'];

// =============================================================================
// Supabase mock — records the select string, resolves with the queued rows
// =============================================================================

const { mockSelect, mockRows, mockFrom, mockUpdate, mockUpdateEq, mockUpdateError } = vi.hoisted(
  () => ({
    mockSelect: vi.fn(),
    mockRows: { value: [] as unknown[] },
    mockFrom: vi.fn(),
    mockUpdate: vi.fn(),
    mockUpdateEq: vi.fn(),
    mockUpdateError: { value: null as { message: string } | null },
  })
);

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => {
    const chain = {
      select: (columns: string) => {
        mockSelect(columns);
        return chain;
      },
      order: () => chain,
      returns: () => Promise.resolve({ data: mockRows.value, error: null }),
      update: (values: unknown) => {
        mockUpdate(values);
        return {
          eq: (column: string, value: string) => {
            mockUpdateEq(column, value);
            return Promise.resolve({ error: mockUpdateError.value });
          },
        };
      },
    };
    return {
      from: (table: string) => {
        mockFrom(table);
        return chain;
      },
    };
  }),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireRole: vi.fn().mockResolvedValue({
    success: true,
    error: null,
    data: { role: 'admin', userId: '99999999-9999-4999-8999-999999999999' },
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

function row(id: string, invitePending: boolean | null): UsersWithRolesRow {
  return {
    id,
    email: `${id}@example.com`,
    role: 'organizer',
    created_at: '2026-09-27T00:00:00Z',
    role_updated_at: null,
    invite_pending: invitePending,
  };
}

// =============================================================================
// getUsers — invitePending (spec 009, T003)
// =============================================================================

describe('getUsers', () => {
  beforeEach(() => {
    mockSelect.mockClear();
    mockRows.value = [];
  });

  it('selects invite_pending from users_with_roles', async () => {
    // Act
    await getUsers();

    // Assert
    expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining('invite_pending'));
  });

  it('maps invite_pending to invitePending, treating null as false', async () => {
    // Arrange
    mockRows.value = [row('pending', true), row('accepted', false), row('unknown', null)];

    // Act
    const result = await getUsers();

    // Assert
    expect(result.success).toBe(true);
    expect(result.data?.map((u) => [u.id, u.invitePending])).toEqual([
      ['pending', true],
      ['accepted', false],
      ['unknown', false],
    ]);
  });

  it('treats a null role from the view as vendor', async () => {
    // Arrange
    mockRows.value = [{ ...row('no-profile', false), role: null }];

    // Act
    const result = await getUsers();

    // Assert
    expect(result.data?.[0]?.role).toBe('vendor');
  });
});

// =============================================================================
// updateUserRole (BL-22)
// =============================================================================

const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const OTHER_ID = '11111111-1111-4111-8111-111111111111';

describe('updateUserRole', () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockUpdate.mockClear();
    mockUpdateEq.mockClear();
    mockUpdateError.value = null;
    vi.mocked(requireRole).mockResolvedValue({
      success: true,
      error: null,
      data: { role: 'admin', userId: ADMIN_ID },
    });
  });

  it('writes the new role to user_profiles for the given user', async () => {
    // Act
    const result = await updateUserRole(OTHER_ID, 'organizer');

    // Assert
    expect(result).toEqual({ success: true, error: null });
    expect(requireRole).toHaveBeenCalledWith('admin');
    expect(mockFrom).toHaveBeenCalledWith('user_profiles');
    expect(mockUpdate).toHaveBeenCalledWith({ role: 'organizer' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', OTHER_ID);
  });

  it('refuses a caller who is not an admin and writes nothing', async () => {
    // Arrange
    vi.mocked(requireRole).mockResolvedValue({
      success: false,
      error: 'Requires admin role or higher',
      data: null,
    });

    // Act
    const result = await updateUserRole(OTHER_ID, 'organizer');

    // Assert
    expect(result).toEqual({ success: false, error: 'Requires admin role or higher' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses a role that does not exist and writes nothing', async () => {
    // Act
    const result = await updateUserRole(OTHER_ID, 'superuser' as unknown as Role);

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid role/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses an admin demoting themselves and writes nothing', async () => {
    // Act
    const result = await updateUserRole(ADMIN_ID, 'organizer');

    // Assert
    expect(result).toEqual({
      success: false,
      error: 'Cannot demote yourself. Ask another admin to change your role.',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('lets an admin keep their own admin role', async () => {
    // Act
    const result = await updateUserRole(ADMIN_ID, 'admin');

    // Assert
    expect(result).toEqual({ success: true, error: null });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', ADMIN_ID);
  });

  it('answers a generic failure when the write errors', async () => {
    // Arrange
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUpdateError.value = { message: 'boom' };

    // Act
    const result = await updateUserRole(OTHER_ID, 'organizer');

    // Assert
    expect(result).toEqual({ success: false, error: 'Failed to update user role' });
    consoleError.mockRestore();
  });
});
