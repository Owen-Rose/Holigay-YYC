import { z } from 'zod';

/**
 * Server environment contract.
 *
 * Strictness keys on `VERCEL_ENV === 'production'` — a Vercel Production deploy
 * of `main` — and never on `NODE_ENV`, which Vercel also sets to 'production'
 * for preview builds. Previews and local builds stay lenient so work continues
 * while the sending domain is pending.
 *
 * See specs/007-production-readiness/contracts/env-contract.md.
 */

if (typeof window !== 'undefined') {
  throw new Error(
    '@/lib/env is server-only and must never be imported from a client component. ' +
      'Use @/lib/env-public for NEXT_PUBLIC_* values.'
  );
}

export type KeepaliveTarget = { url: string; anonKey: string };

/** `Name <local@domain>` or a bare `local@domain`. Rejects a bare display name. */
const EMAIL_FROM_PATTERN =
  /^(?:[^<>]*<\s*[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+\s*>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/;

// Every field below VERCEL_ENV is an unconditionally-valid optional string.
// Zod skips an object-level superRefine when any inner field fails, so keeping
// the shape always-parseable is what makes the aggregated production message
// deterministic and what guarantees CRON_SECRET / KEEPALIVE_SUPABASE_TARGETS can
// never raise an issue — the app must still deploy with the keep-alive
// unconfigured. An empty string is treated as unset: Vercel and CI can both set
// a variable to "", and a blank EMAIL_FROM_ADDRESS must not slip past the guard
// into the resend.dev fallback.
const optionalEnv = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const serverEnvSchema = z
  .object({
    VERCEL_ENV: z
      .enum(['development', 'preview', 'production'], {
        error: 'must be one of development, preview, production (or unset)',
      })
      .optional(),
    RESEND_API_KEY: optionalEnv,
    EMAIL_FROM_ADDRESS: optionalEnv,
    CRON_SECRET: optionalEnv,
    KEEPALIVE_SUPABASE_TARGETS: optionalEnv,
  })
  .superRefine((env, ctx) => {
    if (env.VERCEL_ENV !== 'production') return;

    if (!env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'required when VERCEL_ENV=production',
      });
    }

    if (!env.EMAIL_FROM_ADDRESS) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM_ADDRESS'],
        message: 'required when VERCEL_ENV=production',
      });
    } else if (env.EMAIL_FROM_ADDRESS.includes('resend.dev')) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM_ADDRESS'],
        message: 'must not use the resend.dev test sender in production',
      });
    } else if (!EMAIL_FROM_PATTERN.test(env.EMAIL_FROM_ADDRESS)) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM_ADDRESS'],
        message: 'must be "Name <local@domain>" or a bare local@domain address',
      });
    }
  });

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment: ${parsed.error.issues
      .map((issue) => `${issue.path.join('.')} (${issue.message})`)
      .join('; ')}`
  );
}

const env = parsed.data;

/**
 * Parses `url|key,url|key`. Returns null on anything malformed rather than
 * throwing: /api/keepalive answers 500 `misconfigured` instead, so the app
 * deploys fine before the keep-alive is configured.
 */
function parseKeepaliveTargets(raw: string | undefined): KeepaliveTarget[] | null {
  if (!raw) return null;

  const pairs = raw
    .split(',')
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0);

  if (pairs.length === 0) return null;

  const targets: KeepaliveTarget[] = [];

  for (const pair of pairs) {
    const parts = pair.split('|');
    if (parts.length !== 2) return null;

    const url = parts[0].trim();
    const anonKey = parts[1].trim();
    if (!anonKey || !z.url().safeParse(url).success) return null;

    targets.push({ url, anonKey });
  }

  return targets;
}

/** True only on a Vercel Production deploy — NOT `NODE_ENV === 'production'`. */
export const isProduction: boolean = env.VERCEL_ENV === 'production';

/**
 * Undefined when unset. Required only on a Vercel Production deploy; anywhere
 * else sendEmail logs instead of sending when this is missing.
 */
export const resendApiKey: string | undefined = env.RESEND_API_KEY;

/**
 * Undefined when unset. Required (and refused on resend.dev) only on a Vercel
 * Production deploy; anywhere else the email client falls back to the resend.dev
 * test sender when this is missing.
 */
export const emailFromAddress: string | undefined = env.EMAIL_FROM_ADDRESS;

/** Null unless a secret of at least 16 characters is configured. */
export const cronSecret: string | null =
  env.CRON_SECRET && env.CRON_SECRET.length >= 16 ? env.CRON_SECRET : null;

/** Null when unset or malformed. */
export const keepaliveTargets: KeepaliveTarget[] | null = parseKeepaliveTargets(
  env.KEEPALIVE_SUPABASE_TARGETS
);
