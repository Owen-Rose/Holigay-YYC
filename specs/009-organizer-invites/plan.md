# Implementation Plan: Organizer Invites, Link Consumption and Password Reset

**Branch**: `009-organizer-invites` | **Date**: 2026-09-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-organizer-invites/spec.md` (Clarifications
Session 2026-09-26, decisions D1–D6); design record
`docs/superpowers/specs/2026-09-26-organizer-invites-design.md` (§4 components, §5 manual
configuration, §6 security, §7 tests); reasoning in `research.md` (R1–R22).

## Summary

The four stories reduce to two new pages plus a thin invite layer over them:

1. **`GET /auth/confirm`** (US1, US2, US4) — a Route Handler that verifies the emailed
   one-time token on the server with the cookie-backed Supabase client
   (`verifyOtp({ token_hash, type })`), validates the requested destination against a
   three-entry allow-list, and redirects. One page consumes invitation, password-reset,
   signup-confirmation and email-change links whether the app or the Supabase console sent
   them (D4, R1–R3).
2. **`/set-password`** (US1, US2) — an RSC page that requires a session, a client form
   (`react-hook-form` + Zod), and a `setPassword` action guarded by `requireRole('vendor')` that returns the role-based
   destination.
3. **`inviteOrganizer` rewritten** (US1, US3) over a contained service-role client
   (`src/lib/supabase/admin.ts`, D6): `requireRole('admin')` → Zod → look the address up in
   `users_with_roles` → `auth.admin.inviteUserByEmail` → `user_profiles.role = 'organizer'`
   (D5) → `{ resent }`. Migration `013` adds an `invite_pending` column to the view so the
   Team page can show the Pending badge and Resend button (D3, D2, R5).
4. **Forgot password** (US2) — `/forgot-password` page + `requestPasswordReset` action with a
   neutral response, a "Forgot password?" link and `reason` notices on the Login page; the
   Confirm-signup template re-pointed and the signup copy corrected (US4).

Every per-project console change (service-role key on Vercel, three email templates, Site
URL, minimum password length) is a `[manual]` task with an evidence row in `quickstart.md`,
dev first, then production (FR-030). No new packages. No RLS or storage changes.

Two of the spec's carried-forward assumptions are settled by this plan (R4: GoTrue re-sends
to an unconfirmed user — verified in `invite.go`; R1: the SSR helper writes cookies from a
Route Handler — the official Supabase pattern, proven on the dev walkthrough). The other two
(R17 minimum password length, R18 dev Site URL) are `[manual]` verification rows.

## Technical Context

**Language/Version**: TypeScript 5.9, `strict: true` (unchanged); PL/pgSQL for one view migration
**Primary Dependencies**: Next.js 16.0.7 App Router (Route Handler + RSC page), React 19, `@supabase/ssr` ^0.8 (cookie-backed server client), `@supabase/supabase-js` ^2.86 (`auth.verifyOtp`, `auth.admin.inviteUserByEmail`, `auth.admin.generateLink` in tests), `react-hook-form` + `zod` ^4 + `@hookform/resolvers`, `sonner`. **No new packages**
**Storage**: Supabase PostgreSQL — migration `013_users_with_roles_invite_pending.sql` (additive column on the `users_with_roles` view). No new tables, no RLS changes, `attachments` bucket untouched
**Testing**: Vitest `unit` project (jsdom; `// @vitest-environment node` for the route, env and containment tests) + `security` project (real local stack, self-skipping; `src/test/security/invite-flow.test.ts`) + a manual walkthrough on the dev preview with a real mailbox
**Target Platform**: Vercel (Preview = dev Supabase project, Production = prod project); local CLI stack for tests
**Project Type**: single Next.js web application
**Performance Goals**: no new dashboard reads (one extra boolean on an existing select); `/auth/confirm` is one GoTrue round-trip then a redirect; client bundle grows by two small forms only
**Constraints**: service-role key server-only, held in one module with one importer, asserted by a test on every PR (FR-026); no token, hash or email body in logs (FR-014); the spec 006 public `/apply` posture unchanged (FR-028); production strictness stays keyed on `VERCEL_ENV` per spec 007 (spec 008 renames it later, R22); no Claude co-authoring trailers on commits or PRs
**Scale/Scope**: ~9 new source files, ~10 edited, 1 migration, ~8 unit test files, 1 security suite, ~12 `[manual]` console/walkthrough rows, ~11 docs touched at close

## Constitution Check

*GATE: evaluated before Phase 0 and re-checked after Phase 1 design — PASS, with the two
guard deviations justified in Complexity Tracking.*

| Principle | Check | Status |
|---|---|---|
| I — Zod `safeParse` before any DB call | `inviteSchema` (new `src/lib/validations/team.ts`), `setPasswordSchema` and `forgotPasswordSchema` (added to `src/lib/validations/auth.ts`), `confirmQuerySchema` for the route's query string — each parsed first | PASS |
| I — `requireRole()` at the top of mutations | `inviteOrganizer`: `requireRole('admin')` is the first statement. `setPassword` opens with `requireRole('vendor')` — the minimum role admits every signed-in user and its `data.role` decides the redirect; `requestPasswordReset` is unauthenticated by nature — the same class as `signIn`/`signUp` in the same file (recorded below) | PASS |
| I — `{ success, error, data }` responses | `InviteResponse` gains `data: { resent: boolean } \| null`; `SetPasswordResponse` carries `data: { redirectTo }`; `RequestPasswordResetResponse` carries `data: null`. `/auth/confirm` is a Route Handler that only redirects | PASS |
| I — RLS on user-data tables; append-only migrations | No new table. `013` is `CREATE OR REPLACE VIEW` appending one trailing column; the 006 grant to `authenticated` is unchanged; nothing earlier is edited | PASS |
| I — CI gates; no dead code | The Epic 4 stub, its `TODO (Task 4.2.2)` comment and its placeholder error are removed; the containment test runs inside `npm test` | PASS |
| I — new env vars documented in the same PR | `SUPABASE_SERVICE_ROLE_KEY` becomes a parsed field of `src/lib/env.ts` (required iff `isProduction`) and is documented in `.env.example`, `CLAUDE.md` and `specs/007-production-readiness/contracts/env-contract.md` in the PR that introduces the admin client | PASS |
| II — tests with every new/changed action and form | `inviteOrganizer` (happy, resend, refused-existing, non-admin, invalid email, unconfigured), `setPassword` (happy, unauthenticated, mismatch), `requestPasswordReset` (happy, invalid, GoTrue error → still neutral), `/auth/confirm` (each row of its contract), RTL tests for both new forms, middleware pass-through, env schema, containment; security suite for the real GoTrue paths | PASS |
| III — UX consistency | New forms: RHF + Zod, `useId()`, `aria-invalid`, `aria-describedby`, `role="alert"`; `Button`, `Badge` (`variant="warning"`), `Input` primitives; tokens only; Sonner toasts on every mutation result; `/set-password` ships a `loading.tsx` because its page fetches `getUser()` | PASS |
| IV — RSC first; `revalidatePath` | `set-password/page.tsx` and `forgot-password/page.tsx` are Server Components; only the two forms are `'use client'`. `inviteOrganizer` calls `revalidatePath('/dashboard/team')` and `revalidatePath('/dashboard/admin')` (both list users). Middleware matcher unchanged | PASS |
| Stack lock-in | No dependency added; email still leaves through the Resend SMTP relay configured under spec 007 (GoTrue sends the auth mails) | PASS |

## Project Structure

### Documentation (this feature)

```text
specs/009-organizer-invites/
├── spec.md                          # US1–US4, FR-001–FR-031, SC-001–SC-007
├── checklists/requirements.md       # passed 2026-09-26
├── plan.md                          # this file
├── research.md                      # R1–R22 decisions + verified facts
├── data-model.md                    # migration 013, UserWithRole, invitation state machine
├── quickstart.md                    # local loop + the evidence record for every [manual] task
├── contracts/
│   ├── auth-confirm-route.md        # GET /auth/confirm — inputs, allow-list, every outcome
│   ├── server-actions.md            # inviteOrganizer, getUsers, setPassword, requestPasswordReset
│   ├── admin-client-and-env.md      # createAdminClient(), SUPABASE_SERVICE_ROLE_KEY, containment rule
│   └── email-templates.md           # the three templates: subject, body, link, per project
└── tasks.md                         # /speckit-tasks output (not created here)
```

### Source code (repository root)

```text
supabase/migrations/013_users_with_roles_invite_pending.sql   # view + invite_pending
src/types/database.ts                                          # regenerated (db:types:local)

src/lib/env.ts                          # + supabaseServiceRoleKey (required iff isProduction)
src/lib/supabase/admin.ts               # NEW createAdminClient(): SupabaseClient<Database> | null
src/lib/validations/team.ts             # NEW inviteSchema
src/lib/validations/auth.ts             # + setPasswordSchema, forgotPasswordSchema
src/lib/actions/team.ts                 # rewrite: inviteOrganizer + inviteOrganizerCore
src/lib/actions/auth.ts                 # + setPassword, requestPasswordReset
src/lib/actions/admin.ts                # UserWithRole.invitePending; select adds invite_pending

src/app/auth/confirm/route.ts           # NEW Route Handler (outside the (auth) card layout)
src/app/(auth)/set-password/page.tsx    # NEW RSC: getUser() or redirect /login?reason=session-required
src/app/(auth)/set-password/loading.tsx # NEW
src/app/(auth)/forgot-password/page.tsx # NEW RSC shell around the form
src/app/(auth)/login/page.tsx           # + "Forgot password?" link, reason notices
src/app/(auth)/signup/page.tsx          # success copy
src/components/auth/set-password-form.tsx      # NEW client form
src/components/auth/forgot-password-form.tsx   # NEW client form
src/components/team/invite-form.tsx     # toast: sent vs re-sent
src/app/dashboard/team/page.tsx         # Pending badge + Resend button per pending row

src/test/admin-client-containment.test.ts
src/test/auth-confirm-route.test.ts
src/test/team-actions.test.ts
src/test/auth-password-actions.test.ts
src/test/set-password-form.test.tsx
src/test/forgot-password-form.test.tsx
src/test/middleware.test.ts             # + pass-through cases for the three new paths
src/test/env.test.ts                    # + SUPABASE_SERVICE_ROLE_KEY cases
src/test/security/invite-flow.test.ts   # NEW real-stack suite
```

**Structure Decision**: the feature follows the existing layout exactly — server actions in
`src/lib/actions/`, schemas in `src/lib/validations/`, auth pages in the `(auth)` route
group with their forms in `src/components/auth/`. The only new directory is
`src/app/auth/confirm/`: the handler must be a Route Handler, not a page, and must sit
outside the `(auth)` group so the card layout never renders around a redirect.

## Phases (mirror `tasks.md`)

| Phase | Story | Content | Ends when |
|---|---|---|---|
| 1 | setup | this plan's artifacts merged to `dev` as a docs-only PR; `quickstart.md` evidence table in place | PR merged |
| 2 | foundation | `env.ts` + `admin.ts` + containment test; migration `013` + `npm run db:types:local` + `admin.ts` `invitePending`; `[manual]` minimum-password-length check on dev and prod (R17) | `npm test` green with `013` on the local stack |
| 3 | US1 | `/auth/confirm` + tests; `/set-password` page, form, action + tests; `inviteOrganizer` + `inviteSchema` + unit tests + `invite-flow` security suite; invite-form toast; `[manual]` Vercel Preview `SUPABASE_SERVICE_ROLE_KEY`, dev Invite template, `013` on dev; dev walkthrough of story 1 | story 1 evidence row filled |
| 4 | US2 | `/forgot-password` page, form, action + tests; Login link + `reason` notices; `[manual]` dev Reset-password template; walkthrough of story 2 plus the expired-link and abandoned-set-password cases | rows filled |
| 5 | US3 | Team page Pending badge + Resend button; walkthrough of story 3 | rows filled |
| 6 | US4 | signup success copy; `[manual]` dev Confirm-signup template (no visible effect on dev — confirmations are off) | row filled |
| 7 | rollout + docs | `[manual]` prod: `013`, Production env var, three templates, Site URL re-verified, `dev → main`, story 1 run once with a real organizer's address; docs per FR-031 (`CLAUDE.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `specs/README.md`, 007 env-contract + quickstart backlog note, 008 tasks follow-up note, migrations README); constitution PATCH removing the acknowledged invite-stub note | every evidence row ☑ |

Each repo task is one branch off `dev` and one PR, commits tagged `[009-Txxx]`, gated by
`npm run lint && npm test && npm run build` with the local stack up.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| `requestPasswordReset` has no role guard | the caller has no session by definition; the T019 constitution PATCH records the pre-session class explicitly | identical to the existing `signIn`/`signUp` precedent in `src/lib/actions/auth.ts` |
| A service-role client now exists in the app (`docs/ARCHITECTURE.md` currently states the opposite as an invariant) | the GoTrue admin API is the only way to send an invitation and to set the role without trusting a client-supplied value | reading the role from signup metadata in the trigger is a privilege-escalation hole (D5); console-sent invites leave the vendor role and disappear under spec 008. Containment: one module, one importer, `requireRole('admin')` before every use, three calls total, asserted by a test on every PR |
