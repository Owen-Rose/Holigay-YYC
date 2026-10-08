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
    expect(res).toEqual({
      success: true,
      error: null,
      message:
        'Account created! Check your email for a confirmation link — clicking it will sign you in.',
    });
  });
});

// UAT-findings item 3: the message must say what actually happened. With "Confirm email"
// on, Supabase returns no session and the vendor has to click the mail; with it off, a
// session comes back and there is no mail to wait for.
describe('signUp — message follows the session', () => {
  it('no session: tells the vendor to check their email', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null });

    const res = await signUp(VALID);

    expect(res.success).toBe(true);
    expect(res.message).toMatch(/check your email/i);
    expect(res.message).not.toMatch(/signed in/i);
  });

  it('session returned: says the vendor is signed in, no email to wait for', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'u1' }, session: { access_token: 't' } },
      error: null,
    });

    const res = await signUp(VALID);

    expect(res.success).toBe(true);
    expect(res.message).toMatch(/signed in/i);
    expect(res.message).not.toMatch(/check your email/i);
  });
});
