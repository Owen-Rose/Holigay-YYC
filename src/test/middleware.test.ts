import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// =============================================================================
// Supabase mock (targets @supabase/ssr — the direct dependency middleware uses)
// =============================================================================

const mockGetUser = vi.fn();
const mockSingle = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: () => mockGetUser(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => mockSingle(),
        }),
      }),
    }),
  })),
}));

// Import AFTER the mock so middleware picks up the stubbed createServerClient.
import { middleware } from '@/middleware';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, 'http://localhost:3000'));
}

// =============================================================================
// Role-lookup error handling (Workstream 2a)
// =============================================================================

describe('middleware role-lookup error handling', () => {
  it('redirects to /unauthorized?reason=role-lookup-failed when user_profiles query errors on a protected route', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: '500', message: 'boom' },
    });

    const res = await middleware(makeRequest('/dashboard'));

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/unauthorized');
    expect(location).toContain('reason=role-lookup-failed');
    // Must NOT silently demote to vendor
    expect(location).not.toContain('/vendor-dashboard');
  });

  it('redirects to /unauthorized?reason=role-lookup-failed when the lookup errors on an auth route', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: '500', message: 'boom' },
    });

    const res = await middleware(makeRequest('/login'));

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/unauthorized');
    expect(location).toContain('reason=role-lookup-failed');
  });

  it('passes through public routes even when the role lookup errors (no loop back to /unauthorized)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: '500', message: 'boom' },
    });

    const res = await middleware(makeRequest('/'));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('preserves the default-to-vendor fallback on PGRST116 (signup trigger race)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    });

    const res = await middleware(makeRequest('/dashboard'));

    // Vendor hitting /dashboard → sent to /vendor-dashboard, not unauthorized
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/vendor-dashboard');
    expect(location).not.toContain('unauthorized');
  });

  it('happy path: organizer role on /dashboard passes through', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSingle.mockResolvedValue({ data: { role: 'organizer' }, error: null });

    const res = await middleware(makeRequest('/dashboard'));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});
