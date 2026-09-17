// @vitest-environment node
//
// Runs under Node, not the unit project's jsdom default: this suite imports the
// real email client, which pulls in @/lib/env and its browser guard.
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

const ENV_VARS = ['VERCEL_ENV', 'RESEND_API_KEY', 'EMAIL_FROM_ADDRESS'] as const;

/**
 * Stubs every variable the email client reads through @/lib/env; anything absent
 * from `overrides` is explicitly unset. Note that a production-shaped case must
 * set all three — @/lib/env refuses to parse in production without a
 * verified-domain sender, and the dynamic import below would throw.
 */
function stubEnv(overrides: Partial<Record<(typeof ENV_VARS)[number], string>> = {}) {
  for (const name of ENV_VARS) {
    vi.stubEnv(name, overrides[name]);
  }
}

// getResendClient caches its client in a module-level `let`, and both the client
// and @/lib/env read their config at module load. Calling vi.resetModules() +
// dynamically re-importing for every test keeps env-var changes visible.
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sendEmail', () => {
  it('uses the dev-log fallback when no key is set outside production', async () => {
    stubEnv();

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

  // Strictness moved to @/lib/env and keys on VERCEL_ENV. NODE_ENV is
  // 'production' for Vercel preview builds too, so it must no longer change what
  // sendEmail does: a preview with no key logs rather than failing.
  it('still uses the dev-log fallback when NODE_ENV=production but VERCEL_ENV is not', async () => {
    stubEnv();
    vi.stubEnv('NODE_ENV', 'production');

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
    stubEnv({ RESEND_API_KEY: 're_test_key' });
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

  it('falls back to the resend.dev test sender when EMAIL_FROM_ADDRESS is unset', async () => {
    stubEnv({ RESEND_API_KEY: 're_test_key' });
    mockSend.mockResolvedValue({ data: { id: 'msg-123' }, error: null });

    const { sendEmail } = await import('@/lib/email/client');

    await sendEmail({ to: 'vendor@example.com', subject: 'Test', html: '<p>Test</p>' });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Holigay Vendor Market <onboarding@resend.dev>' })
    );
  });

  it('sends from the configured address on a production deploy', async () => {
    stubEnv({
      VERCEL_ENV: 'production',
      RESEND_API_KEY: 're_live_key',
      EMAIL_FROM_ADDRESS: 'Holigay Vendor Market <noreply@holigay.co>',
    });
    mockSend.mockResolvedValue({ data: { id: 'msg-123' }, error: null });

    const { sendEmail } = await import('@/lib/email/client');

    await sendEmail({ to: 'vendor@example.com', subject: 'Test', html: '<p>Test</p>' });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Holigay Vendor Market <noreply@holigay.co>' })
    );
  });
});

describe('isEmailConfigured', () => {
  it('is false when no key is set', async () => {
    stubEnv();

    const { isEmailConfigured } = await import('@/lib/email/client');

    expect(isEmailConfigured()).toBe(false);
  });

  it('is true when a key is set', async () => {
    stubEnv({ RESEND_API_KEY: 're_test_key' });

    const { isEmailConfigured } = await import('@/lib/email/client');

    expect(isEmailConfigured()).toBe(true);
  });
});
