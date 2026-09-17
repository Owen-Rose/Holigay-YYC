// @vitest-environment node
//
// Runs under Node, not the unit project's jsdom default: the route imports
// src/lib/env.ts, whose server-only guard (`typeof window !== 'undefined'`)
// would always fire under jsdom.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENV_VARS = [
  'VERCEL_ENV',
  'RESEND_API_KEY',
  'EMAIL_FROM_ADDRESS',
  'CRON_SECRET',
  'KEEPALIVE_SUPABASE_TARGETS',
] as const;

/**
 * Stubs every variable @/lib/env reads. Anything absent from `overrides` is
 * explicitly unset, so a case can never inherit a value from the developer's
 * shell or from another test file sharing the Vitest worker's process.env.
 */
function stubEnv(overrides: Partial<Record<(typeof ENV_VARS)[number], string>> = {}) {
  for (const name of ENV_VARS) {
    vi.stubEnv(name, overrides[name]);
  }
}

const SECRET = 'cron-secret-at-least-16';
const DEV_URL = 'https://dev.supabase.co';
const PROD_URL = 'https://prod.supabase.co';
const DEV_KEY = 'dev-anon-key-must-not-leak';
const PROD_KEY = 'prod-anon-key-must-not-leak';
const TWO_TARGETS = `${DEV_URL}|${DEV_KEY},${PROD_URL}|${PROD_KEY}`;

type TargetResult = { url: string; ok: boolean; status: number; ms: number; error?: string };
type Body = { ok: boolean; error?: string; checkedAt?: string; targets?: TargetResult[] };

/** `@/lib/env` reads process.env at import, so every case imports after stubbing. */
async function callRoute(headers: Record<string, string> = {}) {
  const { GET } = await import('@/app/api/keepalive/route');
  const response = await GET(new Request('http://localhost/api/keepalive', { headers }));
  const text = await response.text();

  return { response, text, body: JSON.parse(text) as Body };
}

function authorized(secret = SECRET) {
  return { Authorization: `Bearer ${secret}` };
}

/** A Response stand-in: the route only reads `.ok` and `.status`. */
function reply(status: number) {
  return { ok: status >= 200 && status < 300, status } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Authorization — checked before anything else, so no target is ever touched
// ---------------------------------------------------------------------------

describe('GET /api/keepalive authorization', () => {
  it.each([
    ['no Authorization header', {} as Record<string, string>],
    ['a wrong secret', { Authorization: 'Bearer not-the-secret' }],
    ['a bare secret without the Bearer scheme', { Authorization: SECRET }],
  ])('answers 401 and calls no target with %s', async (_label, headers) => {
    stubEnv({ CRON_SECRET: SECRET, KEEPALIVE_SUPABASE_TARGETS: TWO_TARGETS });

    const { response, body } = await callRoute(headers);

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, error: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The Inputs table in contracts/keepalive-route.md: an unconfigured secret
  // answers every request 401. Only the targets map to `misconfigured`.
  it('answers 401 when CRON_SECRET is unset, even with targets configured', async () => {
    stubEnv({ KEEPALIVE_SUPABASE_TARGETS: TWO_TARGETS });

    const { response, body } = await callRoute(authorized());

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, error: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // env.ts refuses a secret under 16 characters, so it is as good as unset.
  it('answers 401 when CRON_SECRET is too short to be accepted', async () => {
    stubEnv({ CRON_SECRET: 'short', KEEPALIVE_SUPABASE_TARGETS: TWO_TARGETS });

    const { response } = await callRoute({ Authorization: 'Bearer short' });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe('GET /api/keepalive configuration', () => {
  it.each([
    ['unset', undefined],
    ['unparseable', 'garbage-without-a-separator'],
  ])('answers 500 misconfigured when the target list is %s', async (_label, raw) => {
    stubEnv(
      raw ? { CRON_SECRET: SECRET, KEEPALIVE_SUPABASE_TARGETS: raw } : { CRON_SECRET: SECRET }
    );

    const { response, body } = await callRoute(authorized());

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: 'misconfigured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Per-target checks
// ---------------------------------------------------------------------------

describe('GET /api/keepalive target checks', () => {
  it('reads one row from every target with the anon key in both headers', async () => {
    stubEnv({ CRON_SECRET: SECRET, KEEPALIVE_SUPABASE_TARGETS: TWO_TARGETS });
    fetchMock.mockResolvedValue(reply(200));

    await callRoute(authorized());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      `${DEV_URL}/rest/v1/events?select=id&limit=1`,
      expect.objectContaining({
        headers: { apikey: DEV_KEY, Authorization: `Bearer ${DEV_KEY}` },
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${PROD_URL}/rest/v1/events?select=id&limit=1`,
      expect.objectContaining({
        headers: { apikey: PROD_KEY, Authorization: `Bearer ${PROD_KEY}` },
      })
    );
  });

  it('answers 200 with one ok entry per target when every read succeeds', async () => {
    stubEnv({ CRON_SECRET: SECRET, KEEPALIVE_SUPABASE_TARGETS: TWO_TARGETS });
    fetchMock.mockResolvedValue(reply(200));

    const { response, body } = await callRoute(authorized());

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.targets).toEqual([
      { url: DEV_URL, ok: true, status: 200, ms: expect.any(Number) },
      { url: PROD_URL, ok: true, status: 200, ms: expect.any(Number) },
    ]);
  });

  // 500 on any failure is deliberate: Vercel's cron log marks a run red only on
  // a non-2xx response, and the red entry is the signal the maintainer watches.
  it('answers 500 and names the status when one target returns 503', async () => {
    stubEnv({ CRON_SECRET: SECRET, KEEPALIVE_SUPABASE_TARGETS: TWO_TARGETS });
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith(PROD_URL) ? reply(503) : reply(200)
    );

    const { response, body } = await callRoute(authorized());

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.targets?.[0]).toMatchObject({ url: DEV_URL, ok: true, status: 200 });
    expect(body.targets?.[1]).toMatchObject({ url: PROD_URL, ok: false, status: 503 });
    expect(body.targets?.[1].error).toBeTruthy();
  });

  it('answers 500 with status 0 and the error text when one target throws', async () => {
    stubEnv({ CRON_SECRET: SECRET, KEEPALIVE_SUPABASE_TARGETS: TWO_TARGETS });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(PROD_URL)) throw new Error('The operation was aborted due to timeout');
      return reply(200);
    });

    const { response, body } = await callRoute(authorized());

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.targets?.[1]).toMatchObject({
      url: PROD_URL,
      ok: false,
      status: 0,
      error: 'The operation was aborted due to timeout',
    });
  });
});

// ---------------------------------------------------------------------------
// The response carries URLs, never keys
// ---------------------------------------------------------------------------

describe('GET /api/keepalive response body', () => {
  it.each([
    ['every target succeeds', async () => reply(200)],
    ['a target fails', async () => reply(500)],
    [
      'a target throws with the key in the error message',
      async () => {
        throw new Error(`connect ECONNREFUSED for apikey ${PROD_KEY}`);
      },
    ],
  ])('never includes an anon key when %s', async (_label, impl) => {
    stubEnv({ CRON_SECRET: SECRET, KEEPALIVE_SUPABASE_TARGETS: TWO_TARGETS });
    fetchMock.mockImplementation(impl);

    const { text } = await callRoute(authorized());

    expect(text).toContain(DEV_URL);
    expect(text).not.toContain(DEV_KEY);
    expect(text).not.toContain(PROD_KEY);
  });
});
