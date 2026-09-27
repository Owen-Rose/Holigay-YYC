import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUsers } from '@/lib/actions/admin';
import type { Database } from '@/types/database';

type UsersWithRolesRow = Database['public']['Views']['users_with_roles']['Row'];

// =============================================================================
// Supabase mock — records the select string, resolves with the queued rows
// =============================================================================

const { mockSelect, mockRows } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockRows: { value: [] as unknown[] },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => {
    const chain = {
      select: (columns: string) => {
        mockSelect(columns);
        return chain;
      },
      order: () => chain,
      returns: () => Promise.resolve({ data: mockRows.value, error: null }),
    };
    return { from: () => chain };
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
});
