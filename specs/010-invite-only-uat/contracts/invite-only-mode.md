# Contract: Invite-Only Mode

**Feature**: 010-invite-only-uat | **Date**: 2026-09-27
**Files**: `src/lib/env-public.ts`, `src/middleware.ts`, `src/app/(auth)/login/page.tsx`, `src/lib/actions/auth.ts`
**Tested by**: `src/test/env.test.ts`, `src/test/middleware.test.ts`, `src/test/login-page.test.tsx`, `src/test/auth-signup-action.test.ts` (new)
**Spec**: US1, FR-001–FR-006, FR-015; research R1–R4, R10, R12

Everything below is defensive (FR-006). Enforcement is the dev project's sign-up setting,
proven by `quickstart.md` row D1.

## 1. The variable — `NEXT_PUBLIC_INVITE_ONLY`

| | |
|---|---|
| Read by | `src/lib/env-public.ts` → `src/middleware.ts`, `src/app/(auth)/login/page.tsx`, `src/lib/actions/auth.ts` |
| Local `.env.local` | unset (open mode). Set `true` only to see the invite-only screens against the local stack, whose sign-up toggle stays on |
| Vercel Preview | **`true`**, all branches — the training deployment and every PR preview share the dev project |
| Vercel Production | **unset** |
| Validation | optional string, trimmed. The mode is on iff the value is exactly `true` (case-sensitive). `TRUE`, `1`, `yes`, `false`, `""` and unset are open mode. Never an import-time error |
| Secret? | No — it is inlined into the browser bundle by design |

```ts
// src/lib/env-public.ts (additions)
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: …,          // unchanged
  NEXT_PUBLIC_SUPABASE_ANON_KEY: …,     // unchanged
  NEXT_PUBLIC_INVITE_ONLY: z.string().trim().optional(),
});
const parsed = publicEnvSchema.safeParse({
  …,
  NEXT_PUBLIC_INVITE_ONLY: process.env.NEXT_PUBLIC_INVITE_ONLY, // literal access — inlining rule
});
/** True only when NEXT_PUBLIC_INVITE_ONLY is exactly 'true'. Never derived from VERCEL_ENV. */
export const inviteOnly: boolean = parsed.data.NEXT_PUBLIC_INVITE_ONLY === 'true';
```

The value is baked into the bundle at build (research R10): change it on Vercel, then
redeploy. Documented in the same PR in `.env.example`, `CLAUDE.md` (Environment Variables),
`specs/007-production-readiness/contracts/env-contract.md` (one row in each table) and
`docs/DEV-ENVIRONMENT-SETUP.md` Part 8.

## 2. Middleware — `/signup` is not found

Placed at the top of `middleware(request)`, **before** the Supabase client is created and
before `getUser()`:

```ts
const { pathname } = request.nextUrl;
if (inviteOnly && (pathname === '/signup' || pathname.startsWith('/signup/'))) {
  // No route exists at /404, so the App Router renders src/app/not-found.tsx.
  return NextResponse.rewrite(new URL('/404', request.url), { status: 404 });
}
```

The explicit `status` is required (found 2026-09-27 on the T005 PR preview): `next start`
answers the bare rewrite with 404, but Vercel served the rewritten not-found page with
**200**. With `{ status: 404 }` the preview answers 404 for `/signup` and `/signup/x`.

| Mode | Request | Outcome |
|---|---|---|
| invite-only | `GET /signup`, signed out | rewrite → standard not-found page, HTTP 404; no session lookup |
| invite-only | `GET /signup`, signed in | same 404 (the auth-route redirect never runs) |
| invite-only | `GET /signup/anything` | same 404 |
| invite-only | `/`, `/apply`, `/login`, `/forgot-password`, `/set-password`, `/auth/confirm`, `/api/keepalive`, `/dashboard/**`, `/vendor-dashboard/**` | exactly as today (FR-005) |
| open | `GET /signup` | exactly as today: renders; signed-in users are redirected to their dashboard |

`authRoutes`, `protectedRoutes` and the matcher are unchanged.

## 3. Login page

```tsx
{!inviteOnly && (
  <div>
    <span className="text-muted">Don&apos;t have an account? </span>
    <Link href="/signup" …>Sign up</Link>
  </div>
)}
```

"Forgot password?", the `reason` notices, the form and the `redirectTo` handling are
unchanged. `src/app/(auth)/signup/page.tsx` is **not** changed: production renders it.

## 4. `signUp(data: SignupInput): Promise<AuthResponse>`

Ordered steps — each early return contacts nothing:

| # | Step | On failure returns `error` |
|---|---|---|
| 1 | `signupSchema.safeParse(data)` | the first issue's message (unchanged) |
| 2 | **`if (inviteOnly)`** | `Sign-up is by invitation on this site.` — FR-004; `createClient()` is never called |
| 3 | `createClient()` → `supabase.auth.signUp(...)` | `error.message` (unchanged; with the service toggle off and the flag unset this is GoTrue's `Signups not allowed for this instance`, the spec's "ugly, harmless" edge case) |
| 4 | | `{ error: null, success: true }` (unchanged) |

`AuthResponse` keeps its `{ error, success }` shape. The signup page shows `error` in its
existing red box, so a stale page in invite-only mode shows the sentence above.

## 5. Test matrix

| File | Case | Asserts |
|---|---|---|
| `src/test/env.test.ts` (`@vitest-environment node`; add `NEXT_PUBLIC_INVITE_ONLY` to `ENV_VARS`) | `'true'` | `inviteOnly === true` |
| | `' true '` | `true` (trimmed) |
| | unset, `''`, `'false'`, `'TRUE'`, `'1'` | `false`, and the module still exports the Supabase pair |
| `src/test/middleware.test.ts` (mock `@/lib/env-public` with a mutable `inviteOnly`) | flag on, `/signup`, signed out | `x-middleware-rewrite` header ends with `/404`; `getUser` mock not called |
| | flag on, `/signup/extra`, signed in | same rewrite |
| | flag on, `/login` and `/apply` | pass through as today |
| | flag off, `/signup`, signed-in vendor | 307 to `/vendor-dashboard` (existing behaviour) |
| `src/test/login-page.test.tsx` (mock `@/lib/env-public`, mutable) | flag off | link "Sign up" → `/signup` present; "Forgot password?" present |
| | flag on | no link named "Sign up"; "Forgot password?" still present |
| `src/test/auth-signup-action.test.ts` (new; mock `@/lib/supabase/server` and `@/lib/env-public`) | flag on, valid input | `{ success: false, error: 'Sign-up is by invitation on this site.' }`; `createClient` not called |
| | flag on, invalid input | the Zod message, not the invitation message (order) |
| | flag off, valid input | `auth.signUp` called with the email and password; `{ success: true }` |
