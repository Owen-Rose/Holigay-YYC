import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the 'resend' module so tests never hit the network. The outer mockSend
// reference is captured by the factory closure; vi.clearAllMocks resets its
// call history between tests while keeping the mock in place.
const mockSend = vi.fn();

vi.mock('resend', () => {
  // Use a real class so `new Resend(apiKey)` works. The instance's `emails.send`
  // is the shared mockSend so tests can assert on dispatch without grabbing a
  // reference to a per-instance mock.
  class MockResend {
    emails = { send: mockSend };
  }
  return { Resend: MockResend };
});

// getResendClient caches its client in a module-level `let`. Calling
// vi.resetModules() + dynamically re-importing the module for every test keeps
// that cache clean, so env-var changes are always picked up.
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sendEmail — production guard (Workstream 2b)', () => {
  it('returns { success: false } when NODE_ENV=production and RESEND_API_KEY is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');

    const { sendEmail } = await import('@/lib/email/client');

    const result = await sendEmail({
      to: 'vendor@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    expect(result.messageId).toBeNull();
    expect(result.error).toMatch(/production/i);
    // Crucially, the dev-log path did NOT run — no send attempt was made.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('uses the dev-log fallback when no key is set in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RESEND_API_KEY', '');

    const { sendEmail } = await import('@/lib/email/client');

    const result = await sendEmail({
      to: 'vendor@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toMatch(/^dev-/);
    expect(result.error).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('dispatches to the Resend API when a key is configured (happy path)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    mockSend.mockResolvedValue({ data: { id: 'msg-123' }, error: null });

    const { sendEmail } = await import('@/lib/email/client');

    const result = await sendEmail({
      to: 'vendor@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-123');
    expect(result.error).toBeNull();
    expect(mockSend).toHaveBeenCalledOnce();
  });
});
