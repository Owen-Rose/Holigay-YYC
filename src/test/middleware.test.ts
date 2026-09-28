import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// @/lib/env-public validates at module load, and the import below evaluates the
// whole graph before any beforeEach could stub process.env. Mocking the module
// is the same seam as the @supabase/ssr mock above and cannot leak across files.
let mockInviteOnly = false;
vi.mock('@/lib/env-public', () => ({
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'test-anon-key',
  get inviteOnly() {
    return mockInviteOnly;
  },
}));

// Import AFTER the mock so middleware picks up the stubbed createServerClient.
import { middleware } from '@/middleware';

beforeEach(() => {
  vi.clearAllMocks();
  mockInviteOnly = false;
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

// =============================================================================
// Spec 009 link-consumption pages pass through (research R13, FR-013, FR-019):
// none of them is protected, and none is an auth route that bounces a signed-in user.
// =============================================================================

describe('middleware — /auth/confirm, /set-password, /forgot-password pass through', () => {
  const PATHS = ['/auth/confirm?token_hash=x&type=invite', '/set-password', '/forgot-password'];

  it.each(PATHS)('signed out: %s passes through', async (path) => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await middleware(makeRequest(path));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  const SIGNED_IN = PATHS.flatMap((path) =>
    (['vendor', 'organizer', 'admin'] as const).map((role) => [role, path] as const)
  );

  it.each(SIGNED_IN)('signed in as %s: %s passes through', async (role, path) => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSingle.mockResolvedValue({ data: { role }, error: null });

    const res = await middleware(makeRequest(path));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});

// =============================================================================
// Invite-only mode — contracts/invite-only-mode.md §2 (spec 010)
// =============================================================================

describe('middleware — invite-only mode', () => {
  it('flag on: /signup signed out is rewritten to the not-found page without a session lookup', async () => {
    mockInviteOnly = true;

    const res = await middleware(makeRequest('/signup'));

    expect(res.headers.get('x-middleware-rewrite')).toMatch(/\/404$/);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('flag on: /signup/extra signed in is rewritten the same way', async () => {
    mockInviteOnly = true;
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSingle.mockResolvedValue({ data: { role: 'vendor' }, error: null });

    const res = await middleware(makeRequest('/signup/extra'));

    expect(res.headers.get('x-middleware-rewrite')).toMatch(/\/404$/);
    expect(res.headers.get('location')).toBeNull();
  });

  it.each(['/login', '/apply'])('flag on: %s passes through', async (path) => {
    mockInviteOnly = true;
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await middleware(makeRequest(path));

    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.headers.get('location')).toBeNull();
  });

  it('flag off: /signup for a signed-in vendor still redirects to /vendor-dashboard', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSingle.mockResolvedValue({ data: { role: 'vendor' }, error: null });

    const res = await middleware(makeRequest('/signup'));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/vendor-dashboard');
  });
});
