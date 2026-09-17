// @vitest-environment node
//
// Runs under Node, not the unit project's jsdom default: src/lib/env.ts guards
// against being imported from client code with `typeof window !== 'undefined'`,
// which is always true under jsdom.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'VERCEL_ENV',
  'RESEND_API_KEY',
  'EMAIL_FROM_ADDRESS',
  'CRON_SECRET',
  'KEEPALIVE_SUPABASE_TARGETS',
] as const;

/**
 * Stubs every variable the env modules read. Anything absent from `overrides`
 * is explicitly unset, so a case can never inherit a value from the developer's
 * shell or from another test file sharing the Vitest worker's process.env.
 */
function stubEnv(overrides: Partial<Record<(typeof ENV_VARS)[number], string>> = {}) {
  for (const name of ENV_VARS) {
    vi.stubEnv(name, overrides[name]);
  }
}

const VALID_KEEPALIVE =
  'https://dev.supabase.co|dev-anon-key,https://prod.supabase.co|prod-anon-key';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// env-public
// ---------------------------------------------------------------------------

describe('@/lib/env-public', () => {
  it('throws one aggregated error naming both variables when both are missing', async () => {
    stubEnv();

    await expect(import('@/lib/env-public')).rejects.toThrow(
      /^Invalid environment: NEXT_PUBLIC_SUPABASE_URL \(.+\); NEXT_PUBLIC_SUPABASE_ANON_KEY \(.+\)$/
    );
  });

  it('exports the pair when both are set', async () => {
    stubEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });

    const env = await import('@/lib/env-public');

    expect(env.supabaseUrl).toBe('https://example.supabase.co');
    expect(env.supabaseAnonKey).toBe('anon-key');
  });

  it('rejects a URL that is not a URL', async () => {
    stubEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });

    await expect(import('@/lib/env-public')).rejects.toThrow('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('treats an empty string as unset', async () => {
    stubEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    });

    await expect(import('@/lib/env-public')).rejects.toThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });
});

// ---------------------------------------------------------------------------
// env — production strictness
// ---------------------------------------------------------------------------

describe('@/lib/env production strictness', () => {
  it('names every missing sender variable in one error', async () => {
    stubEnv({ VERCEL_ENV: 'production' });

    await expect(import('@/lib/env')).rejects.toThrow(
      'Invalid environment: RESEND_API_KEY (required when VERCEL_ENV=production); ' +
        'EMAIL_FROM_ADDRESS (required when VERCEL_ENV=production)'
    );
  });

  it('refuses the resend.dev test sender', async () => {
    stubEnv({
      VERCEL_ENV: 'production',
      RESEND_API_KEY: 're_live_key',
      EMAIL_FROM_ADDRESS: 'Holigay Vendor Market <onboarding@resend.dev>',
    });

    await expect(import('@/lib/env')).rejects.toThrow(
      'EMAIL_FROM_ADDRESS (must not use the resend.dev test sender in production)'
    );
  });

  it('treats a blank sender as missing', async () => {
    stubEnv({
      VERCEL_ENV: 'production',
      RESEND_API_KEY: 're_live_key',
      EMAIL_FROM_ADDRESS: '',
    });

    await expect(import('@/lib/env')).rejects.toThrow(
      'EMAIL_FROM_ADDRESS (required when VERCEL_ENV=production)'
    );
  });

  it.each([
    ['a display name and address', 'Holigay Vendor Market <noreply@holigay.co>'],
    ['a bare address', 'noreply@holigay.co'],
  ])('accepts %s', async (_label, address) => {
    stubEnv({
      VERCEL_ENV: 'production',
      RESEND_API_KEY: 're_live_key',
      EMAIL_FROM_ADDRESS: address,
    });

    const env = await import('@/lib/env');

    expect(env.emailFromAddress).toBe(address);
    expect(env.isProduction).toBe(true);
  });

  it('rejects a bare display name with no address', async () => {
    stubEnv({
      VERCEL_ENV: 'production',
      RESEND_API_KEY: 're_live_key',
      EMAIL_FROM_ADDRESS: 'Holigay Vendor Market',
    });

    await expect(import('@/lib/env')).rejects.toThrow('EMAIL_FROM_ADDRESS');
  });

  it('rejects an unknown VERCEL_ENV', async () => {
    stubEnv({ VERCEL_ENV: 'bogus' });

    await expect(import('@/lib/env')).rejects.toThrow('VERCEL_ENV');
  });
});

// ---------------------------------------------------------------------------
// env — lenient outside production
// ---------------------------------------------------------------------------

describe('@/lib/env outside production', () => {
  it.each([
    ['VERCEL_ENV unset', undefined],
    ['VERCEL_ENV=preview', 'preview'],
  ])('parses with nothing set when %s', async (_label, vercelEnv) => {
    stubEnv(vercelEnv ? { VERCEL_ENV: vercelEnv } : {});

    const env = await import('@/lib/env');

    expect(env.isProduction).toBe(false);
    expect(env.resendApiKey).toBeUndefined();
    expect(env.emailFromAddress).toBeUndefined();
  });

  // Only the *requirement* is production-gated. The values must still pass
  // through, or local `npm run dev` email delivery (spec 007 T006) breaks.
  it('passes the sender through when set, even on the resend.dev domain', async () => {
    stubEnv({
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM_ADDRESS: 'Holigay Vendor Market <onboarding@resend.dev>',
    });

    const env = await import('@/lib/env');

    expect(env.isProduction).toBe(false);
    expect(env.resendApiKey).toBe('re_test_key');
    expect(env.emailFromAddress).toBe('Holigay Vendor Market <onboarding@resend.dev>');
  });
});

// ---------------------------------------------------------------------------
// env — keep-alive values (never throw; the app must deploy unconfigured)
// ---------------------------------------------------------------------------

describe('@/lib/env cronSecret', () => {
  it('exposes a secret of at least 16 characters', async () => {
    stubEnv({ CRON_SECRET: 'x'.repeat(16) });

    const env = await import('@/lib/env');

    expect(env.cronSecret).toBe('x'.repeat(16));
  });

  it.each([
    ['shorter than 16 characters', 'x'.repeat(15)],
    ['unset', undefined],
  ])('is null when %s', async (_label, secret) => {
    stubEnv(secret ? { CRON_SECRET: secret } : {});

    const env = await import('@/lib/env');

    expect(env.cronSecret).toBeNull();
  });
});

describe('@/lib/env keepaliveTargets', () => {
  it('parses comma-separated url|key pairs', async () => {
    stubEnv({ KEEPALIVE_SUPABASE_TARGETS: VALID_KEEPALIVE });

    const env = await import('@/lib/env');

    expect(env.keepaliveTargets).toEqual([
      { url: 'https://dev.supabase.co', anonKey: 'dev-anon-key' },
      { url: 'https://prod.supabase.co', anonKey: 'prod-anon-key' },
    ]);
  });

  it.each([
    ['unset', undefined],
    ['missing the separator', 'https://dev.supabase.co'],
    ['missing the key', 'https://dev.supabase.co|'],
    ['not a URL', 'dev.supabase.co|dev-anon-key'],
    ['one bad pair among good ones', 'https://dev.supabase.co|dev-key,garbage'],
  ])('is null when %s, and never throws', async (_label, raw) => {
    stubEnv(raw ? { KEEPALIVE_SUPABASE_TARGETS: raw } : {});

    const env = await import('@/lib/env');

    expect(env.keepaliveTargets).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// env — server-only guard
// ---------------------------------------------------------------------------

describe('@/lib/env server-only guard', () => {
  it('throws when imported where a browser global exists', async () => {
    stubEnv();
    vi.stubGlobal('window', {});

    await expect(import('@/lib/env')).rejects.toThrow(/server-only/);
  });
});
