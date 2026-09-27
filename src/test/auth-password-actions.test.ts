import { describe, it, expect, vi, beforeEach } from 'vitest';

// setPassword — contracts/server-actions.md §setPassword.

const mockUpdateUser = vi.fn();
const mockRequireRole = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
  }),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

import { setPassword } from '@/lib/actions/auth';

const VALID = { password: 'secret123', confirmPassword: 'secret123' };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRole.mockResolvedValue({
    success: true,
    error: null,
    data: { role: 'vendor', userId: 'user-1' },
  });
  mockUpdateUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('setPassword', () => {
  it('returns the length message for a short password without checking the session', async () => {
    // Arrange
    const input = { password: 'abc', confirmPassword: 'abc' };

    // Act
    const result = await setPassword(input);

    // Assert
    expect(result).toEqual({
      success: false,
      error: 'Password must be at least 6 characters',
      data: null,
    });
    expect(mockRequireRole).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('returns the mismatch message when the passwords differ', async () => {
    const result = await setPassword({ password: 'secret123', confirmPassword: 'secret124' });

    expect(result).toEqual({ success: false, error: 'Passwords do not match', data: null });
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it('opens with requireRole("vendor") and returns its message when signed out', async () => {
    mockRequireRole.mockResolvedValue({ success: false, error: 'Not authenticated', data: null });

    const result = await setPassword(VALID);

    expect(mockRequireRole).toHaveBeenCalledWith('vendor');
    expect(result).toEqual({ success: false, error: 'Not authenticated', data: null });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('returns the provider message when updateUser fails', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'New password should be different from the old password.' },
    });

    const result = await setPassword(VALID);

    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'secret123' });
    expect(result).toEqual({
      success: false,
      error: 'New password should be different from the old password.',
      data: null,
    });
  });

  it.each([
    ['organizer', '/dashboard'],
    ['admin', '/dashboard'],
    ['vendor', '/vendor-dashboard'],
  ])('redirects a %s to %s', async (role, redirectTo) => {
    mockRequireRole.mockResolvedValue({
      success: true,
      error: null,
      data: { role, userId: 'user-1' },
    });

    const result = await setPassword(VALID);

    expect(result).toEqual({ success: true, error: null, data: { redirectTo } });
  });
});
