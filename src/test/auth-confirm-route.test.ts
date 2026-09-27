// @vitest-environment node
//
// Unit tests for GET /auth/confirm — contracts/auth-confirm-route.md, one case per
// row of its Outcomes table. The real-GoTrue success path is covered by
// src/test/security/invite-flow.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockVerifyOtp = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args) },
  }),
}));

// Same seam as middleware.test.ts: env-public validates at module load.
vi.mock('@/lib/env-public', () => ({
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'test-anon-key',
}));

import { GET } from '@/app/auth/confirm/route';

const HASH = 'pkce_abc123-token-hash';
const LINK_INVALID = '/login?reason=link-invalid';

async function callRoute(query: string) {
  const response = await GET(new NextRequest(`http://localhost:3000/auth/confirm?${query}`));
  const location = response.headers.get('location');
  const url = location ? new URL(location) : null;

  return {
    response,
    url,
    destination: url ? `${url.pathname}${url.search}` : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyOtp.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /auth/confirm — valid links', () => {
  it.each(['/set-password', '/dashboard', '/vendor-dashboard'])(
    'honours the allow-listed next=%s',
    async (next) => {
      const { response, destination } = await callRoute(
        `token_hash=${HASH}&type=invite&next=${encodeURIComponent(next)}`
      );

      expect(response.status).toBe(307);
      expect(destination).toBe(next);
    }
  );

  it('passes exactly { token_hash, type } to verifyOtp', async () => {
    await callRoute(`token_hash=${HASH}&type=recovery&next=/set-password`);

    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'recovery' });
  });

  const KIND_DEFAULTS = [
    ['invite', '/set-password'],
    ['recovery', '/set-password'],
    ['signup', '/vendor-dashboard'],
    ['email', '/vendor-dashboard'],
    ['email_change', '/vendor-dashboard'],
  ] as const;

  const IGNORED_NEXT = [
    ['absent', null],
    ['protocol-relative', '//evil.example'],
    ['absolute', 'https://evil.example'],
    ['sub-path', '/dashboard/x'],
  ] as const;

  describe.each(KIND_DEFAULTS)('type=%s', (type, kindDefault) => {
    it.each(IGNORED_NEXT)(`falls back to ${kindDefault} when next is %s`, async (_label, next) => {
      const nextParam = next === null ? '' : `&next=${encodeURIComponent(next)}`;
      const { response, url, destination } = await callRoute(
        `token_hash=${HASH}&type=${type}${nextParam}`
      );

      expect(response.status).toBe(307);
      expect(destination).toBe(kindDefault);
      expect(url?.host).toBe('localhost:3000');
      expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type });
    });
  });
});

describe('GET /auth/confirm — malformed links never reach GoTrue', () => {
  it.each([
    ['type=magiclink', `token_hash=${HASH}&type=magiclink&next=/set-password`],
    ['type absent', `token_hash=${HASH}&next=/set-password`],
    ['token_hash empty', `token_hash=&type=invite&next=/set-password`],
    ['token_hash absent', `type=invite&next=/set-password`],
  ])('%s → link-invalid notice', async (_label, query) => {
    const { response, destination } = await callRoute(query);

    expect(response.status).toBe(307);
    expect(destination).toBe(LINK_INVALID);
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });
});

describe('GET /auth/confirm — GoTrue rejects the hash', () => {
  it('redirects to the link-invalid notice and logs only the error code', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockVerifyOtp.mockResolvedValue({
      data: {},
      error: { code: 'otp_expired', name: 'AuthApiError', message: 'Token has expired' },
    });

    const { response, destination } = await callRoute(
      `token_hash=${HASH}&type=invite&next=/set-password`
    );

    expect(response.status).toBe(307);
    expect(destination).toBe(LINK_INVALID);
    expect(consoleError).toHaveBeenCalledWith('[auth/confirm] verify failed', 'otp_expired');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(HASH);
  });

  it('falls back to the error name when GoTrue gives no code', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockVerifyOtp.mockResolvedValue({
      data: {},
      error: { name: 'AuthRetryableFetchError', message: 'fetch failed' },
    });

    const { destination } = await callRoute(`token_hash=${HASH}&type=signup`);

    expect(destination).toBe(LINK_INVALID);
    expect(consoleError).toHaveBeenCalledWith(
      '[auth/confirm] verify failed',
      'AuthRetryableFetchError'
    );
  });
});
