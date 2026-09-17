import { z } from 'zod';

/**
 * Public environment contract — the `NEXT_PUBLIC_*` values, safe to import from
 * client components, server code and the edge middleware alike.
 *
 * Parsed once at first import so a misconfigured deploy fails with a single
 * readable message instead of a scattering of `undefined` errors at call sites.
 *
 * See specs/007-production-readiness/contracts/env-contract.md.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ error: 'missing or not a valid URL' }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ error: 'required' })
    .trim()
    .min(1, { error: 'required' }),
});

// These MUST stay literal `process.env.X` member expressions: Next.js replaces
// them textually when it builds the client bundle, so a dynamic lookup
// (`process.env[name]`, a loop, a spread of `process.env`) would be undefined in
// the browser. Do not refactor this object.
const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  throw new Error(
    `Invalid environment: ${parsed.error.issues
      .map((issue) => `${issue.path.join('.')} (${issue.message})`)
      .join('; ')}`
  );
}

export const supabaseUrl: string = parsed.data.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey: string = parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY;
