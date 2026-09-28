import { describe, it, expect, vi, beforeEach } from 'vitest';

// signUp in invite-only mode — contracts/invite-only-mode.md §4 (spec 010).

const mockSignUp = vi.fn();
const mockCreateClient = vi.fn(async () => ({ auth: { signUp: mockSignUp } }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockCreateClient(),
}));

let mockInviteOnly = false;
vi.mock('@/lib/env-public', () => ({
  get inviteOnly() {
    return mockInviteOnly;
  },
}));

import { signUp } from '@/lib/actions/auth';

const VALID = {
  email: 'new@example.com',
  password: 'password123',
  confirmPassword: 'password123',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockInviteOnly = false;
  mockSignUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null });
});

describe('signUp — invite-only mode', () => {
  it('flag on, valid input: refuses without contacting Supabase', async () => {
    mockInviteOnly = true;

    const res = await signUp(VALID);

    expect(res).toEqual({ success: false, error: 'Sign-up is by invitation on this site.' });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('flag on, invalid input: returns the validation message first', async () => {
    mockInviteOnly = true;

    const res = await signUp({ ...VALID, password: 'x', confirmPassword: 'x' });

    expect(res.success).toBe(false);
    expect(res.error).not.toBe('Sign-up is by invitation on this site.');
    expect(res.error).toBeTruthy();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('flag off, valid input: signs up as today', async () => {
    const res = await signUp(VALID);

    expect(mockSignUp).toHaveBeenCalledWith({ email: 'new@example.com', password: 'password123' });
    expect(res).toEqual({ success: true, error: null });
  });
});
