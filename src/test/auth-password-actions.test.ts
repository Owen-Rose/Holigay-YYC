import { describe, it, expect, vi, beforeEach } from 'vitest';

// setPassword and requestPasswordReset — contracts/server-actions.md.

const mockUpdateUser = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockRequireRole = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
    },
  }),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

import { requestPasswordReset, setPassword } from '@/lib/actions/auth';

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

describe('requestPasswordReset', () => {
  const NEUTRAL = { success: true, error: null, data: null };

  beforeEach(() => {
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  });

  it('rejects a malformed address without calling the provider', async () => {
    const result = await requestPasswordReset({ email: 'not-an-email' });

    expect(result).toEqual({
      success: false,
      error: 'Please enter a valid email address',
      data: null,
    });
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('sends to the trimmed, lower-cased address with no redirectTo', async () => {
    const result = await requestPasswordReset({ email: ' Foo@Example.com ' });

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('foo@example.com');
    expect(result).toEqual(NEUTRAL);
  });

  it('returns the same neutral result on a provider error and logs the code only', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockResetPasswordForEmail.mockResolvedValue({
      data: null,
      error: {
        code: 'over_email_send_rate_limit',
        name: 'AuthApiError',
        message: 'email rate limit exceeded',
      },
    });

    const result = await requestPasswordReset({ email: 'someone@example.com' });

    expect(result).toEqual(NEUTRAL);
    expect(consoleError).toHaveBeenCalledWith(
      '[requestPasswordReset] provider error',
      'over_email_send_rate_limit'
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('someone@example.com');
    consoleError.mockRestore();
  });
});
