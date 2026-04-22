import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentUserRole, requireRole, type RoleResponse } from '@/lib/auth/roles';

// Mock the Supabase server client
const mockGetUser = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: () => mockGetUser(),
    },
    from: () => ({
      select: (...args: unknown[]) => {
        mockSelect(...args);
        return {
          eq: (...eqArgs: unknown[]) => {
            mockEq(...eqArgs);
            return { single: () => mockSingle() };
          },
        };
      },
    }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// getCurrentUserRole
// =============================================================================

describe('getCurrentUserRole', () => {
  it('returns error response when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result: RoleResponse = await getCurrentUserRole();
    expect(result).toMatchObject({
      success: false,
      error: 'Not authenticated',
      data: null,
    });
  });

  it('returns success response with role from user_profiles', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { role: 'organizer' },
      error: null,
    });

    const result: RoleResponse = await getCurrentUserRole();
    expect(result).toMatchObject({
      success: true,
      error: null,
      data: { role: 'organizer', userId: 'user-123' },
    });
    expect(mockSelect).toHaveBeenCalledWith('role');
    expect(mockEq).toHaveBeenCalledWith('id', 'user-123');
  });

  it('defaults to vendor role when profile does not exist (PGRST116)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    });

    await expect(getCurrentUserRole()).resolves.toMatchObject({
      success: true,
      error: null,
      data: { role: 'vendor', userId: 'user-123' },
    });
  });
});

// =============================================================================
// requireRole
// =============================================================================

describe('requireRole', () => {
  it('returns success when user role meets the minimum', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    });

    await expect(requireRole('organizer')).resolves.toMatchObject({
      success: true,
      data: { role: 'admin', userId: 'user-123' },
    });
  });

  it('returns error response when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(requireRole('admin')).resolves.toMatchObject({
      success: false,
      error: 'Not authenticated',
      data: null,
    });
  });

  it('returns error response when user role is below minimum', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { role: 'vendor' },
      error: null,
    });

    await expect(requireRole('organizer')).resolves.toMatchObject({
      success: false,
      error: 'Requires organizer role or higher',
      data: null,
    });
  });
});

// =============================================================================
// requireRole hierarchy (SC-003 / FR-009)
// =============================================================================

describe('requireRole hierarchy', () => {
  it('admin satisfies requireRole("organizer")', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    });

    await expect(requireRole('organizer')).resolves.toMatchObject({
      success: true,
      error: null,
      data: { role: 'admin', userId: 'user-123' },
    });
  });

  it('organizer satisfies requireRole("organizer")', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { role: 'organizer' },
      error: null,
    });

    await expect(requireRole('organizer')).resolves.toMatchObject({
      success: true,
      error: null,
      data: { role: 'organizer', userId: 'user-123' },
    });
  });

  it('vendor fails requireRole("organizer")', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { role: 'vendor' },
      error: null,
    });

    await expect(requireRole('organizer')).resolves.toMatchObject({
      success: false,
      error: 'Requires organizer role or higher',
      data: null,
    });
  });

  it('organizer fails requireRole("admin")', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { role: 'organizer' },
      error: null,
    });

    await expect(requireRole('admin')).resolves.toMatchObject({
      success: false,
      error: 'Requires admin role or higher',
      data: null,
    });
  });
});
