# Contract: Admin Client and Environment

**Feature**: 009-organizer-invites | **Date**: 2026-09-26
**Files**: `src/lib/supabase/admin.ts` (new), `src/lib/env.ts` (one field), `.env.example`, `specs/007-production-readiness/contracts/env-contract.md` (one row)
**Tested by**: `src/test/admin-client-containment.test.ts`, `src/test/env.test.ts`, `src/test/team-actions.test.ts` (unconfigured case)
**Requirements**: FR-007, FR-026; SC-005

## `src/lib/supabase/admin.ts`

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl } from '@/lib/env-public';
import { supabaseServiceRoleKey } from '@/lib/env';
import type { Database } from '@/types/database';

// Same guard as src/lib/env.ts: this module must never reach a client bundle.
if (typeof window !== 'undefined') { throw new Error('@/lib/supabase/admin is server-only …'); }

/**
 * A service-role client that bypasses RLS. Returns null when the key is not
 * configured so callers fail closed with a plain message instead of a stack trace.
 * Callers MUST have passed requireRole('admin') before calling this.
 */
export function createAdminClient(): SupabaseClient<Database> | null {
  if (!supabaseServiceRoleKey) return null;
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

Rules:

- **Exactly one importer**: `src/lib/actions/team.ts`. The containment test walks `src/` and
  fails if any other file mentions `lib/supabase/admin` (research R7).
- **Three calls in the whole app**, all inside `inviteOrganizerCore` and all behind
  `requireRole('admin')`: the `users_with_roles` lookup, `auth.admin.inviteUserByEmail`, the
  `user_profiles` role update.
- Never `NEXT_PUBLIC_`, never imported by middleware, RSCs, pages or components.
- The spec 006 public-submission posture is untouched: `/apply` still goes through
  `submit_public_application` with the anon key (FR-028).

## `SUPABASE_SERVICE_ROLE_KEY`

Added to `src/lib/env.ts` as an `optionalEnv` field, exported as
`supabaseServiceRoleKey: string | undefined`, and required inside the existing
`superRefine` when `VERCEL_ENV === 'production'` (message: `required when VERCEL_ENV=production`).

Row to add to `specs/007-production-readiness/contracts/env-contract.md` (replacing the
"nothing yet (Epic 4 placeholder)" row):

| Variable | Read by | Local | Preview | Production | Validation |
|---|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `env` → `src/lib/supabase/admin.ts` → `src/lib/actions/team.ts` only | optional — invites answer "not configured" | optional; **set to the dev project's key** so the preview can send invites | **required** | non-empty |

Failure behaviour:

| Situation | Result |
|---|---|
| unset outside production | app builds and runs; `inviteOrganizer` returns `Invites are not configured on this deployment`; everything else unaffected |
| unset in production | the aggregated env error at first import names `SUPABASE_SERVICE_ROLE_KEY (required when VERCEL_ENV=production)` — the same behaviour as a missing `RESEND_API_KEY` |
| wrong project's key | GoTrue answers 401 on the first admin call → `Failed to send invitation`; the evidence row for the Vercel variable checks against this by sending one invite |

Where the value comes from: Supabase → Project Settings → API → the `service_role` secret
(legacy JWT) or a `sb_secret_…` key; both work with `auth.admin.*`. Store it in Vercel
(Preview and Production scopes) and the password manager only; never in `.env.local` unless
running the invite flow against the local stack (`supabase status` prints the local one).

Spec 008 hand-off (research R22): on the self-hosted stack the value is the service-role JWT
that `deploy/bin/mint-keys.sh` mints; 008 T008 re-keys the requirement on `APP_ENV`.
