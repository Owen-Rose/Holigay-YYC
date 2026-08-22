# Architecture

**Last reviewed:** 2026-07-08 (full-codebase review on branch `005-dynamic-questionnaires`).
This document describes how the app is actually built — the layers, the data flow, where
authority lives, and which decisions are load-bearing. For what to do about the weak spots,
see [ROADMAP.md](./ROADMAP.md).

## 1. System overview

Holigay Vendor Market is a **single-tenant** web app for the Holigay Events YYC team:
vendors apply to events through a public form; two or three organizers review
applications and manage events. It is not multi-tenant, not a SaaS, and has no scale
requirements beyond "a few humans."

- **Runtime:** Next.js 16 (App Router, RSC) + React 19, TypeScript strict, deployed on Vercel
- **Data:** Supabase (hosted PostgreSQL 15) — separate dev and prod projects
- **Auth:** Supabase Auth (email/password), cookie sessions via `@supabase/ssr`
- **Email:** Resend (transactional only)
- **Files:** Supabase Storage, single private `attachments` bucket
- **Testing:** Vitest + Testing Library (unit tests, mocked Supabase)

Scale: ~21k lines of TS/TSX, 12 runtime dependencies, 10 active migrations, 9 tables.
The dynamic-questionnaire subsystem (spec 005) alone is ~3.8k lines of non-test source —
roughly a fifth of the app.

## 2. Request flow

```
Browser
  │
  ▼
src/middleware.ts            – refreshes the Supabase session cookie on every request,
  │                            fetches the user's role from user_profiles (one DB query
  │                            per request), and enforces route-level redirects:
  │                            unauthenticated → /login, vendor → /vendor-dashboard,
  │                            non-admin off /dashboard/team
  ▼
App Router pages             – mostly RSC; pages fetch data by calling server actions
  │                            (one exception: dashboard/events/[id]/page.tsx queries
  │                            supabase directly in the RSC)
  ▼
src/lib/actions/*            – 'use server' actions; ALL mutations follow the same
  │                            pattern: requireRole() → Zod safeParse → query →
  │                            revalidatePath(). Reads are less consistent (see §7).
  ▼
supabase-js (anon key)       – created per-request by src/lib/supabase/server.ts;
  │                            no service-role key is used anywhere in the app
  ▼
PostgreSQL + RLS             – Row Level Security is the final authority on every read
                               and write. Policies key off auth.uid() and get_user_role().
```

One path deliberately departs from this: **public application submission**. Since spec 006
the `anon` role has no table-level write access to `vendors` / `applications` /
`attachments` / `application_answers` at all — the actions call a single
`SECURITY DEFINER` RPC, `submit_public_application(jsonb)`, which performs the whole
multi-table write in one transaction under definer privileges. RLS still guards every other
anon-reachable read; the RPC is the one audited hole punched through it, and it is
`anon`-executable by explicit `GRANT` (migration 011).

There is **no REST API surface** — the only two `/api` routes are dev-only email tools,
gated off in production. All reads and writes go through server actions, which Next.js
exposes as POST endpoints (relevant to security: server actions are publicly invocable).

## 3. The authorization model — three layers

Authorization is enforced three times, at decreasing distance from the data:

| Layer | Mechanism | What it guards |
|---|---|---|
| 1. Middleware | role fetched per-request, redirects | Route access (UX-level, not security) |
| 2. Server actions | `requireRole('organizer' \| 'admin')` from `src/lib/auth/roles.ts` | Every mutation; some reads |
| 3. RLS | policies on all 9 tables, using `get_user_role()` + `auth.uid()` | Everything — the real boundary |

Two facts make layer 3 the one that matters:

1. **The app only ever uses the anon key.** There is no service-role client, so nothing
   can bypass RLS. Whatever RLS allows the `anon` role is what an attacker with the
   (public, shipped-to-every-browser) anon key can do against PostgREST directly.
2. **The public `/apply` flow is anonymous**, so the `vendors`, `applications`,
   `attachments`, and `application_answers` tables carry `anon` policies to make the
   unauthenticated submission work. Several of these are `USING (true)` — see
   ROADMAP.md Tier 1; this is the most important known issue in the app.

Roles are `vendor | organizer | admin` (enum `user_role`), stored in `user_profiles`,
which is auto-created by the `handle_new_user` trigger on signup (default `vendor`,
with email-based back-linking to an existing `vendors` row).

## 4. The "smart database" stance

A deliberate share of business logic lives in Postgres rather than app code. This is a
real architectural position, not an accident, and it works — but you should know what
lives where:

**In SQL (`supabase/migrations/`):**
- The entire authorization model (RLS policies + `get_user_role()`)
- Signup provisioning (`handle_new_user` trigger on `auth.users`)
- **Lock-on-publish** for questionnaires: `lock_event_questionnaire()` trigger stamps
  `locked_at` when an event goes `draft → active`; RLS write-policies on
  `event_questions`/`event_questionnaires` are gated on `events.status = 'draft'`; and
  there is deliberately *no* UPDATE/DELETE policy on `event_questionnaires`. The app
  never writes `locked_at`. Three independent enforcement layers — the strongest-built
  invariant in the system.
- Atomic multi-table writes via `SECURITY DEFINER` RPCs:
  `submit_public_application(jsonb)` (public submissions — event gate, vendor upsert,
  application insert, answers and attachments, all-or-nothing; failures surface as
  ERRCODEs `P0001`–`P0004`), `create_event_with_default_questionnaire(jsonb)` and
  `ensure_event_questionnaire(uuid)` (organizer-only — `anon` EXECUTE revoked)
- `updated_at` maintenance triggers; the `users_with_roles` admin view

**In TypeScript:**
- Input validation (Zod schemas in `src/lib/validations/`, re-validated server-side
  even for typed callers — defense in depth)
- Workflow rules that aren't invariants (status-transition table in `events.ts`,
  duplicate-application checks, show-if evaluation in `src/lib/questionnaire/show-if.ts`)
- Everything user-facing

**Consequence:** the schema is portable (plain Postgres — triggers, functions, and RLS
all survive a move to self-hosted), but the *auth identity feeding RLS* (`auth.uid()`)
is Supabase's. See §8.

## 5. Data model

Core (migrations 001–008):

```
events ──< applications >── vendors ──── auth.users (via user_id, nullable)
              │
              └──< attachments
user_profiles ─── auth.users (1:1, role source of truth)
```

Questionnaire subsystem (migration 009, spec 005):

```
questionnaire_templates ──< template_questions          (reusable library)
events 1──1 event_questionnaires ──< event_questions    (per-event, locked on publish)
applications ──< application_answers >── event_questions
```

Design choices that matter:

- **Questions are relational rows, not JSON blobs.** JSONB is used narrowly: `options`
  (choice lists), `show_if` (single branching rule), and `application_answers.value`
  (a type-tagged discriminated union like `{kind:'choices', value:[...]}`, validated by
  Zod at the boundary). This keeps answers queryable per-question while avoiding an
  11-way column explosion.
- **Templates are copy-on-attach.** Seeding an event from a template copies question
  rows with fresh UUIDs (show-if references remapped). No live linkage; editing a
  template never mutates past events.
- **Answers are immutable** (`ON DELETE RESTRICT` from questions, no UPDATE/DELETE
  policies) — review integrity by construction.
- **Legacy events** are detected by the absence of an `event_questionnaires` row and fall
  back to the original static form; `ensure_event_questionnaire()` upgrades them lazily.

Migration history note: `003`–`006` had duplicate-prefix files from an abandoned
parallel role system; `007`/`008` tore it down and the dead files live in
`supabase/migrations/_superseded/`. Current applied state is clean and consistent
across dev/prod; `supabase/migrations/README.md` is the authoritative map. Fresh
`supabase db reset` works.

## 6. External service seams

How coupled are we, really? Coupling is concentrated in exactly one place.

| Service surface | Where | Size | Swap cost |
|---|---|---|---|
| Email (Resend) | `src/lib/email/client.ts` behind `sendEmail()` | 1 file + 3 call sites | **Trivial** — cleanest seam in the app. Templates are plain TS; provider-agnostic. |
| Storage | `src/lib/actions/upload.ts`, `attachments-list.tsx` | 5 calls, 2 files | **Small** — standard upload/signed-URL. Gotcha: bucket policies exist only in the Supabase dashboard, not in migrations. |
| DB queries (supabase-js) | 13 files in `src/lib/`, ~90 `.from()` + 3 `.rpc()` calls | Wide but shallow | **Tedious, not hard** — no DAL exists; you'd edit every action file, but there's no hidden logic in the client. |
| Auth + session + RLS | `src/lib/supabase/{server,client,middleware}.ts`, `src/middleware.ts`, ~11 `auth.*` call sites, 3 FKs into `auth.users`, every RLS policy via `auth.uid()` | The whole security architecture | **Expensive** — this is the real lock-in. See §8. |

Email behavior worth knowing: sends are awaited inline in the request, best-effort —
failure sets a `warning` field on the action response (surfaced as a toast) while the
DB write stays committed. No queue, no retry. In dev without `RESEND_API_KEY`, emails
log to console and pretend to succeed; in prod a missing key fails loudly.

## 7. Conventions (and where they drift)

**The server-action pattern** (the codebase's backbone):

```ts
'use server'
export async function doThing(input: unknown): Promise<Response> {
  const auth = await requireRole('organizer')      // 1. authorize
  if (!auth.success) return ...
  const parsed = schema.safeParse(input)            // 2. validate
  if (!parsed.success) return ...
  const supabase = await createClient()             // 3. query
  ...
  revalidatePath('/dashboard/...')                  // 4. revalidate
  return { success: true, error: null, data }
}
```

Every mutation follows this. Known drift, in order of importance:

- **Reads are inconsistent:** `templates.ts` reads call `requireRole`;
  `applications.ts`/`events.ts` reads rely on RLS alone.
- **Three response shapes coexist:** `{success, error, data}`, discriminated unions,
  and bare `T | null`. Each action file redeclares its own response type; there is no
  shared `ActionResponse<T>`.
- **No `requireVendor()` helper:** the vendor ownership-scoping block (getUser →
  look up `vendor_id` → guard) is copy-pasted 5× across `vendor-dashboard.ts`/`vendors.ts`.
- **`applications.ts` is a 1,037-line god-file** mixing public submission, organizer
  queries, and status mutations, with hand-written row types that can drift from
  `src/types/database.ts`.

**Types:** `src/types/database.ts` is generated (`npm run db:types:dev`) — never edit.
Zod-inferred types cover inputs; query-result shapes are mostly hand-written. One known
hack: the `users_with_roles` view is queried as `.from('users_with_roles' as 'user_profiles')`
because generated types don't include views cleanly.

**Env vars:** read ad-hoc with `process.env.X!` — no startup validation. A missing var
is a runtime crash at first use, except `RESEND_API_KEY` which is checked properly.

**Code hygiene** (verified at review time): zero `as any`, zero `@ts-ignore`, zero
`eslint-disable`, one TODO (`team.ts` invite stub). Error reporting is `console.error`
only — no structured logging or error tracker.

## 8. Leaving Supabase — the honest tradeoff map

Recorded here because it was the motivating question of the 2026-07 review.

**Cheap:** Resend (one seam), Storage (five calls), and the query builder itself
(mechanical port to pg/Kysely/Drizzle — wide but shallow, since no logic hides in the
client).

**Portable as-is:** the entire schema — tables, triggers, `SECURITY DEFINER` functions,
and RLS policies are plain Postgres and would run unchanged on a self-hosted instance.

**Expensive:** auth. RLS keys off `auth.uid()`, which is populated by Supabase's
GoTrue JWT machinery; three FKs point into `auth.users`; `handle_new_user` triggers on
it; the whole cookie/session layer is `@supabase/ssr`. Replacing Supabase Auth means
rebuilding session management (4 files), ~11 auth call sites, the signup trigger, and
the mechanism that injects the current user into Postgres for RLS — or relocating all
authorization into app code, which currently has no DAL to put it in.

**Conclusion of the review:** for a free, single-tenant tool for a handful of users,
migrating off Supabase is weeks of negative-value work. The correct hedge is keeping
the seams clean (they already are, except the missing DAL) — not migrating. If Supabase
ever becomes untenable, self-hosting Postgres + keeping the schema is the realistic
path; the auth layer is the part you'd rewrite regardless of destination.

One operational caveat for this app specifically: Supabase **free-tier projects pause
after ~1 week of inactivity**. A seasonal events app can easily go quiet for months —
check project status before events go live, or set a keep-alive.

## 9. Testing

Vitest runs **two projects** (`vitest.config.ts`):

- **`unit`** (jsdom) — Testing Library, real behavioral assertions (no snapshots), Supabase
  mocked throughout. Best-covered: the show-if engine (evaluation + validation incl. cycle
  detection), questionnaire/template/answer actions, both application forms, the
  submission-error mapper, per-kind answer emptiness, middleware, email client.
- **`security`** (node, serial, `src/test/security/`) — added by spec 006. Runs against a
  **real local Supabase stack** with all migrations applied, so it tests the policies that
  actually ship rather than a mock of them. `harness.ts` builds anon / service-role /
  authenticated-organizer clients and seeds + tears down its own fixtures per run. Five
  suites: anon reads, anon writes, storage, the submission RPC's success and failure modes,
  and organizer dashboard reads. It **self-skips** when no stack is reachable (so
  `npm test` stays green offline) and is forced to run in CI by
  `CI_REQUIRE_SECURITY_TESTS=1` in the parallel `security-tests` job.

**Still not covered:** `admin.ts` (role mutation), `auth.ts`, `export.ts`, `vendors.ts`.
On the RLS side the security suite covers the anon surface, storage, and the submission
path; **cross-vendor isolation** (vendor A reading vendor B's applications) and
**lock-on-publish** are still verified only by hand — the obvious next suites.

## 10. Where the weak points are

Kept deliberately short — the full analysis and fix plan is in [ROADMAP.md](./ROADMAP.md):

1. **The questionnaire builder saves non-atomically** — N sequential server actions
   per save; a mid-batch failure strands half-saved state. (The atomic input schema
   `questionnaireInputSchema` exists but was never wired up.) Now the top item.
2. Consistency drift per §7; remaining test gaps per §9 — notably cross-vendor isolation
   and lock-on-publish, both still hand-verified.
3. `seeded_from_template_id` on `event_questionnaires` is written by code that always
   no-ops, so the column is never populated. Decide: set it inside the seed transaction,
   or drop it.

**Resolved by spec 006** (kept here for traceability — the original review ranked the first
of these as the single most serious problem in the system):

- ~~Anon-readable PII via RLS `USING (true)`~~ on `vendors`, `applications` (including
  `organizer_notes`), and `attachments` — the seven broad anon policies are dropped, and
  the two privileged RPCs that were also anon-invocable had EXECUTE revoked.
- ~~Silent no-op writes in the public flow~~ — the anon vendor-update and the
  application-rollback delete are gone; `submit_public_application` does the whole write
  transactionally as definer, so contact updates apply and failures roll back completely.
- ~~`deleteFile` takes any path with no ownership check~~ — the action was deleted
  outright, along with `src/app/test-upload/`. Storage bucket rules now live in migration
  011 rather than dashboard-only config.
