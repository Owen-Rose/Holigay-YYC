# Tasks: Organizer Invites, Link Consumption and Password Reset

**Input**: Design documents from `/specs/009-organizer-invites/`
**Prerequisites**: plan.md, spec.md (with `checklists/requirements.md` passed 2026-09-26), research.md (R1–R22, verified facts), data-model.md (migration `013`, `UserWithRole`, the invitation state machine), contracts/auth-confirm-route.md, contracts/server-actions.md, contracts/admin-client-and-env.md, contracts/email-templates.md, quickstart.md (the evidence record: rows V1–V4, D1–D12, P1–P9).

**Tests**: Included — plan.md's Constitution Check (Principle II) requires a test with every new or changed action, form and route: `inviteOrganizer`, `setPassword`, `requestPasswordReset`, `GET /auth/confirm`, the two new forms, the middleware pass-through, the env field and the containment rule, plus the real-stack `invite-flow` security suite. The exact code shapes live in `contracts/`; the steps below name the cases and assertions and point there rather than duplicating them.

**Organization**: Task IDs T001–T019 are fixed from here: `quickstart.md`'s evidence rows cite them via the map in each `[manual]` task. Phases follow spec priority (US1 → US4), then rollout and docs. `[manual]` tasks are Supabase-console, Vercel or mailbox work done by the maintainer; each ends with an **evidence:** clause naming its `quickstart.md` rows and is ticked only when those rows are filled (spec 005 T062 / 006 T004 / 007 / 008 precedent). Every task is one `- [ ] Txxx [P?] [USn] …` line — the Speckit checklist format that `/speckit-implement` ticks — and the nine repo tasks carry **Files**, **Interfaces** and step checkboxes beneath that line (the steps are sub-items, not tasks). Each repo task is one branch off `dev` and one PR, commits tagged `[009-Txxx]`, gated by `npm run lint && npm test && npm run build` with the local stack up (`docker restart supabase_kong_Holigay` if auth health returns 502 after a reset). **No Claude co-authoring trailers on commits or PRs.**

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement the repo tasks task-by-task, one task per session and only on the maintainer's explicit go. `[manual]` tasks are for the maintainer; an agent stops at them and reports what is needed. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin invites an organizer from the Team page and the invitee lands signed in on a set-password page with the organizer role already set; any user resets a forgotten password; a vendor's signup-confirmation link signs them in; every emailed link is consumed by one server-side page. No manual database step anywhere.

**Architecture:** `GET /auth/confirm` (Route Handler, `verifyOtp` with the cookie-backed server client) + `/set-password` (RSC gate + client form + `setPassword` action) are the two pieces everything reuses. `inviteOrganizer` is rewritten over a contained service-role client (`src/lib/supabase/admin.ts`, one importer, asserted by a test). Migration `013` adds `invite_pending` to `users_with_roles` for the Pending badge / Resend button. `/forgot-password` + `requestPasswordReset` reuse the two pieces. Every console change (key, three templates, Site URL) is a `[manual]` task with an evidence row, dev first, then prod.

**Tech Stack:** TypeScript 5.9 strict; Next.js 16.0.7 App Router; React 19; `@supabase/ssr` ^0.8; `@supabase/supabase-js` ^2.86 (`auth.verifyOtp`, `auth.admin.inviteUserByEmail`, `auth.admin.generateLink`); `react-hook-form` + `zod` ^4 + `@hookform/resolvers`; `sonner`; Vitest 4 (`unit` jsdom + `security` node); PL/pgSQL for one view. **No new packages.**

## Global Constraints

- The service-role key is server-only, never `NEXT_PUBLIC_`, held in `src/lib/supabase/admin.ts` and imported by `src/lib/actions/team.ts` only; `src/test/admin-client-containment.test.ts` fails the PR otherwise (FR-026, SC-005).
- `requireRole('admin')` is the first statement of `inviteOrganizer`; `setPassword` opens with `requireRole('vendor')`, the minimum role, so every signed-in user passes; `requestPasswordReset` is unauthenticated (plan Complexity Tracking).
- No token, token hash, `next` value or email body is ever logged — only GoTrue error codes (FR-014).
- `/auth/confirm` performs no write besides `verifyOtp`; destinations are string-equal to `/set-password`, `/dashboard` or `/vendor-dashboard` or fall back to the kind default (FR-010, FR-012, research R3).
- The spec 006 public `/apply` posture is untouched (FR-028); RLS and storage unchanged; migration `013` only appends a column to a view.
- Production strictness keys on `VERCEL_ENV === 'production'` (spec 007); spec 008 T008 re-keys it later (research R22).
- User-facing strings in `contracts/server-actions.md`, `contracts/auth-confirm-route.md` and `contracts/email-templates.md` are acceptance criteria — copy them exactly.
- Commits: `<type>(<scope>): <summary> [009-Txxx]`, no co-authoring trailers.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md
- **[manual]**: Supabase-console / Vercel / mailbox work; evidence recorded in quickstart.md before ticking

---

## Phase 1: Setup

**Purpose**: Make the task list the source of truth on `dev`.

- [X] T001 Finish the spec scaffold as a docs-only PR: on `009-organizer-invites`, add the 009 row to specs/README.md after the 008 row (`| 009 | Organizer invites, link consumption and password reset | 🚧 In progress — spec, plan and tasks T001–T019 written 2026-09-26 | <PR link> | — |`); commit `specs/009-organizer-invites/` (spec.md, checklists/, plan.md, research.md, data-model.md, quickstart.md, contracts/, tasks.md), the design record `docs/superpowers/specs/2026-09-26-organizer-invites-design.md`, the `CLAUDE.md` Active Technologies / Recent Changes lines `/speckit-plan` appended, and specs/README.md; `git commit -m "docs(specs): spec 009 organizer invites — spec, plan, contracts, tasks [009-T001]"`; `git push -u origin 009-organizer-invites && gh pr create --base dev --title "docs(specs): spec 009 organizer invites (design, plan, tasks)" --body "Spec, research, data model, contracts, evidence record and task list for organizer invites, /auth/confirm and password reset. No code."`; put the PR number in the README row and amend. Tick after merge (constitution Development Workflow §6).

---

## Phase 2: Foundational

**Purpose**: The two things every story needs — the contained admin client behind a parsed env field, and the `invite_pending` column — plus the one carried-forward check that could change a schema constant.

**⚠️ CRITICAL**: T005–T007 depend on T002 and/or T003.

- [X] T002 [P] Env field `SUPABASE_SERVICE_ROLE_KEY`, the contained admin client and the containment test — in `src/lib/env.ts`, `src/lib/supabase/admin.ts` (files, interfaces and steps below)

**Files:**
- Modify: `src/lib/env.ts` (one `optionalEnv` field + one `superRefine` rule + one export), `.env.example` (uncomment and re-describe lines 11–12), `specs/007-production-readiness/contracts/env-contract.md` (replace the row at line 29 with the row in `contracts/admin-client-and-env.md`), `CLAUDE.md` line 174 (comment: "Server-only; required on Production; Preview holds the dev project's key — spec 009")
- Create: `src/lib/supabase/admin.ts`, `src/test/admin-client-containment.test.ts`
- Test: `src/test/env.test.ts` (new cases in the existing `'@/lib/env production strictness'` and `'@/lib/env outside production'` describes)

**Interfaces:**
- Produces: `supabaseServiceRoleKey: string | undefined` from `@/lib/env`; `createAdminClient(): SupabaseClient<Database> | null` from `@/lib/supabase/admin` (contract: `contracts/admin-client-and-env.md`). Consumed by T007 only.

- [ ] **Step 1: Failing env tests** — in `src/test/env.test.ts`, following the file's existing `vi.stubEnv` + dynamic-import pattern: (a) under production strictness, unset `SUPABASE_SERVICE_ROLE_KEY` → the aggregated error message contains `SUPABASE_SERVICE_ROLE_KEY (required when VERCEL_ENV=production)`; (b) under production with it set → `supabaseServiceRoleKey` equals the value; (c) outside production, unset → import succeeds and `supabaseServiceRoleKey` is `undefined`. Run `npx vitest run src/test/env.test.ts` → the three new cases FAIL.
- [ ] **Step 2: Implement the field** — `src/lib/env.ts`: add `SUPABASE_SERVICE_ROLE_KEY: optionalEnv` to the schema object (lines 41–51), add the rule beside `RESEND_API_KEY`'s (lines 55–61) with the same `ctx.addIssue` shape and message `required when VERCEL_ENV=production`, export `supabaseServiceRoleKey`. Re-run → PASS.
- [ ] **Step 3: Admin client** — create `src/lib/supabase/admin.ts` exactly as `contracts/admin-client-and-env.md` shows (window guard, `createClient<Database>(supabaseUrl, supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })`, returns `null` when the key is absent, JSDoc stating callers must have passed `requireRole('admin')`).
- [ ] **Step 4: Containment test** — create `src/test/admin-client-containment.test.ts` (`// @vitest-environment node`): walk `src/` with `fs.readdirSync(dir, { recursive: true })`, read every `.ts`/`.tsx`, collect files whose text contains `lib/supabase/admin`, and assert the set is a subset of `{ src/lib/supabase/admin.ts, src/lib/actions/team.ts, src/test/admin-client-containment.test.ts }` (relative paths, sorted; the failure message lists offenders). A subset check rather than R7's "exactly" so the test is green before T007 wires `team.ts` and stays a pure "no unexpected importer" invariant; also assert `src/lib/supabase/admin.ts` exists. Run → PASS.
- [ ] **Step 5: Docs in the same PR** — `.env.example`, the 007 env-contract row, the `CLAUDE.md` line 174 comment (constitution: new env vars documented in the PR that introduces them).
- [ ] **Step 6: Gate and commit** — `npm run lint && npm test && npm run build`; `git commit -m "feat(env): parse SUPABASE_SERVICE_ROLE_KEY and add the contained admin client [009-T002]"`. PR to `dev`.

- [X] T003 [P] Migration `013_users_with_roles_invite_pending.sql`, regenerated types and `invitePending` on `getUsers` — in `supabase/migrations/013_users_with_roles_invite_pending.sql`, `src/lib/actions/admin.ts` (files, interfaces and steps below)

**Files:**
- Create: `supabase/migrations/013_users_with_roles_invite_pending.sql` (the SQL in `data-model.md`, verbatim), `src/test/security/invite-flow.test.ts` (view-level cases only; T007 extends it)
- Modify: `src/types/database.ts` (regenerated — never hand-edited), `src/lib/actions/admin.ts` (`UserWithRole.invitePending: boolean`; select adds `invite_pending`; mapping `row.invite_pending === true`), `supabase/migrations/README.md` (append the 013 row after line 20)

**Interfaces:**
- Produces: `users_with_roles.invite_pending boolean` = `(email_confirmed_at IS NULL AND last_sign_in_at IS NULL)` (research R5); `UserWithRole.invitePending`. Consumed by T007 (refusal rule) and T013 (badge / Resend).

- [ ] **Step 1: Failing security cases** — create `src/test/security/invite-flow.test.ts` on the `harness.ts` pattern (`stackUp` self-skip, `serviceClient()`, `anonClient()`, `createAuthedVendor`): (a) `serviceClient().from('users_with_roles').select('invite_pending').limit(1)` succeeds (column exists); (b) a freshly `createAuthedVendor`'d user (confirmed + signed in) has `invite_pending === false`; (c) `anonClient().from('users_with_roles').select('id').limit(1)` returns a permission error (no anon grant — data-model note). Run `npm run test:security -- invite-flow` → (a)/(b) FAIL on the missing column.
- [ ] **Step 2: Migration** — write the file from `data-model.md`; `npx supabase db reset`; `npm run db:types:local`; confirm `Database['public']['Views']['users_with_roles']['Row']` now has `invite_pending: boolean | null`. Re-run the suite → PASS.
- [ ] **Step 3: `getUsers`** — `src/lib/actions/admin.ts`: extend the type (lines 24–30) and the select (line 82) per `contracts/server-actions.md` §getUsers; add `src/test/admin-actions.test.ts` (mocked server client, AAA as in `src/test/auth-roles.test.ts`) asserting the select string includes `invite_pending` and that `invite_pending: null` maps to `invitePending: false`, `true` to `true`.
- [ ] **Step 4: Migrations README** — append `| \`013_users_with_roles_invite_pending.sql\` | Appends \`invite_pending\` to \`users_with_roles\` (research R5, spec 009) |` after line 20.
- [ ] **Step 5: Gate and commit** — `npm run lint && npm test && npm run build` (security suite included with the stack up); `git commit -m "feat(db): add invite_pending to users_with_roles and surface it on getUsers [009-T003]"`. PR to `dev`.

- [X] T004 [P] [manual] Minimum password length on both hosted projects (research R17): Supabase dev (`kcokcufmzyckbodelqpb`) and prod (`hgmfjvjlxrhdojwlkgap`) → Authentication → Sign In / Providers → Email → "Minimum password length". Expected 6 on both. If either is stricter, T006 raises `min(6)` in `loginSchema`, `signupSchema` and `setPasswordSchema` together and notes it in its PR. evidence: quickstart.md rows **V1** (dev) and **V2** (prod) — spec Clarifications item 2

**Checkpoint**: `npm test` green with `013` on the local stack; `createAdminClient()` exists with one permitted importer; the password-length assumption is recorded.

---

## Phase 3: User Story 1 — Admin invites a new organizer with no manual database step (Priority: P1) 🎯 MVP

**Goal**: Send Invite on the Team page creates an organizer account, emails a link that lands the invitee signed in on `/set-password`, and after setting a password they are on `/dashboard` as an organizer.

**Independent Test**: quickstart.md row D6 — on the dev preview, invite a throwaway address, open the mail, click the link, set a password, land on `/dashboard`; Team page shows Organizer with no Pending badge; no database step anywhere.

- [X] T005 [P] [US1] `GET /auth/confirm` Route Handler, its unit tests, the Login page `reason` notices and the middleware pass-through cases — in `src/app/auth/confirm/route.ts` (files, interfaces and steps below)

**Files:**
- Create: `src/app/auth/confirm/route.ts`, `src/test/auth-confirm-route.test.ts`
- Modify: `src/app/(auth)/login/page.tsx` (map `searchParams.get('reason')` → notice per `contracts/auth-confirm-route.md` §Login page notices; unknown → nothing; rendered above the form with `role="status"`), `src/test/middleware.test.ts` (new describe: `/auth/confirm`, `/set-password`, `/forgot-password` pass through for a signed-out and a signed-in visitor — research R13)

**Interfaces:**
- Produces: `GET /auth/confirm?token_hash&type&next` → 307 per the contract's Outcomes table; `/login?reason=link-invalid|session-required` notices. Consumed by the three email templates (T008, T011, T016) and by `/set-password` (T006).

- [ ] **Step 1: Failing route tests** — `src/test/auth-confirm-route.test.ts` (`// @vitest-environment node`; mock `@/lib/supabase/server` → `{ auth: { verifyOtp } }` and `@/lib/env-public`, as `src/test/keepalive-route.test.ts` and `middleware.test.ts` do; build `new NextRequest('http://localhost:3000/auth/confirm?…')`). One `it` per row of the contract's **Outcomes** table: allow-listed `next` honoured; each non-allow-listed shape (`//evil.example`, `https://evil.example`, `/dashboard/x`, absent) → kind default for `invite`, `recovery` (→ `/set-password`) and `signup`, `email`, `email_change` (→ `/vendor-dashboard`); `type=magiclink`, `type` absent, `token_hash` empty → `/login?reason=link-invalid` **and** `verifyOtp` not called; `verifyOtp` returns an error → `/login?reason=link-invalid`. Assert `status === 307` and `headers.get('location')`. Run → FAIL (module missing).
- [ ] **Step 2: Implement** — `route.ts` per `contracts/auth-confirm-route.md` §Behaviour: module-private `confirmQuerySchema` (`data-model.md` Validation schemas), `ALLOWED_NEXT` as a `Set` of the three exact strings, `KIND_DEFAULT` map, `createClient()` from `@/lib/supabase/server`, `verifyOtp({ token_hash, type })`, `console.error('[auth/confirm] verify failed', error.code ?? error.name)` on failure, `NextResponse.redirect(new URL(path, request.url))`, `export const dynamic = 'force-dynamic'`. Imports `@/lib/supabase/server`, `zod`, `next/server` only. Re-run → PASS.
- [ ] **Step 3: Login notices + middleware cases** — edit `login/page.tsx` (research R12 strings) and add the pass-through describe to `middleware.test.ts`; run `npx vitest run src/test/middleware.test.ts` → PASS with no change to `src/middleware.ts` (matcher and `authRoutes` untouched — FR-013, FR-019).
- [ ] **Step 4: Gate and commit** — `npm run lint && npm test && npm run build`; `git commit -m "feat(auth): consume emailed links server-side at /auth/confirm [009-T005]"`. PR to `dev`.

- [X] T006 [P] [US1] `/set-password` page, form and `setPassword` action — in `src/app/(auth)/set-password/page.tsx`, `src/lib/actions/auth.ts` (files, interfaces and steps below)

**Files:**
- Create: `src/app/(auth)/set-password/page.tsx` (RSC: `getUser()` or `redirect('/login?reason=session-required')`), `src/app/(auth)/set-password/loading.tsx` (`Spinner`), `src/components/auth/set-password-form.tsx` (`'use client'`), `src/test/auth-password-actions.test.ts`, `src/test/set-password-form.test.tsx`
- Modify: `src/lib/validations/auth.ts` (`setPasswordSchema`, `SetPasswordInput` — `data-model.md`), `src/lib/actions/auth.ts` (`setPassword`, `SetPasswordResponse`)

**Interfaces:**
- Produces: `setPassword(data): Promise<SetPasswordResponse>` (`contracts/server-actions.md` §setPassword); `/set-password` page. Consumed by the invite and recovery links (T008, T011) via `/auth/confirm`.

- [ ] **Step 1: Failing action tests** — `src/test/auth-password-actions.test.ts` (mocked `@/lib/supabase/server` and `@/lib/auth/roles`, AAA): schema failure returns the first issue message (`Password must be at least 6 characters`, `Passwords do not match`) without calling `requireRole`; `requireRole` failure → its message, `updateUser` not called; `updateUser` error → its message; `requireRole` data role `organizer`/`admin` → `data.redirectTo === '/dashboard'`; `vendor` → `/vendor-dashboard`. Run → FAIL.
- [ ] **Step 2: Implement** — schema and `setPassword` per the contract (steps 1–5; `requireRole('vendor')` first — Constitution I.2). If T004 recorded a stricter length, raise `min(6)` in the three schemas together here. Re-run → PASS.
- [ ] **Step 3: Failing form test** — `src/test/set-password-form.test.tsx` (RTL, as `application-form.test.tsx`): renders two labelled password fields (ids from `useId()`), shows `Passwords do not match` with `role="alert"` and `aria-invalid` on mismatch, calls the mocked `setPassword` with the values, toasts `Password set` and calls `router.push(redirectTo)` + `router.refresh()` on success, toasts the error verbatim on failure, `Button isLoading` while pending. Run → FAIL.
- [ ] **Step 4: Implement the form and pages** — `set-password-form.tsx` (RHF + `zodResolver(setPasswordSchema)`, `Input`, `Button`, tokens only, 44 px targets), `page.tsx` (heading "Set your password", copy "Choose a password for your Holigay Vendor Market account."), `loading.tsx`. Re-run → PASS.
- [ ] **Step 5: Local check** — `npm run dev`, sign in as any local user, open `/set-password` → renders; sign out, open it → `/login` with "Please sign in first." (T005's notice; if T005 is not merged yet, the redirect target is still asserted by Step 1).
- [ ] **Step 6: Gate and commit** — `npm run lint && npm test && npm run build`; `git commit -m "feat(auth): add the set-password page, form and action [009-T006]"`. PR to `dev`.

- [ ] T007 [US1] Rewrite `inviteOrganizer` over the admin client with `inviteSchema`, unit tests, the real-stack `invite-flow` suite and the sent/re-sent toast — in `src/lib/actions/team.ts` (files, interfaces and steps below). Needs T002, T003.

**Files:**
- Create: `src/lib/validations/team.ts` (`inviteSchema`, `InviteInput` — `data-model.md`), `src/test/team-actions.test.ts`
- Modify: `src/lib/actions/team.ts` (full rewrite: remove the stub, the regex and the `TODO (Task 4.2.2)` comment; `InviteResponse` gains `data`), `src/components/team/invite-form.tsx` (toast branches on `result.data?.resent` — contract §Client), `src/test/security/invite-flow.test.ts` (extend T003's file)

**Interfaces:**
- Produces: `inviteOrganizer(email): Promise<InviteResponse>` and the Next-free `inviteOrganizerCore(admin, email, deps?)` (`contracts/server-actions.md` §inviteOrganizer, steps 1–5 and a–f). Consumed by `InviteForm` and T013's Resend button.

- [ ] **Step 1: Failing unit tests** — `src/test/team-actions.test.ts` (mock `@/lib/auth/roles`, `@/lib/supabase/admin`, `next/cache`; a hand-built fake admin client with `from().select().eq().maybeSingle()`, `from().update().eq()`, `auth.admin.inviteUserByEmail`): non-admin → the `requireRole` message, nothing called; `' Foo@Example.com '` is passed to the lookup as `foo@example.com`; invalid email → `Please enter a valid email address`; `createAdminClient()` → `null` → `Invites are not configured on this deployment`; existing row with `invite_pending: false` → FR-002 message, `inviteUserByEmail` not called; pending row → `{ resent: true }`, `update` not called; new user → `update({ role: 'organizer' })` then `{ resent: false }`; `update` error → FR-006 message with `success: false`; GoTrue `email_exists` → FR-002 message; other GoTrue error → `Failed to send invitation`; success calls `revalidatePath` for `/dashboard/team` and `/dashboard/admin`. Run → FAIL.
- [ ] **Step 2: Implement** — `team.ts` per the contract; `sendInvite` default `admin.auth.admin.inviteUserByEmail(email)` with **no** `redirectTo`; logging `console.error('[inviteOrganizer] <step>', error.code ?? error.message)` only. Re-run → PASS.
- [ ] **Step 3: Real-stack suite** — extend `invite-flow.test.ts` (research R8): inject `sendInvite` built on `serviceClient().auth.admin.generateLink({ type: 'invite', email })`; assert for a fresh `+009-<random>@example.com` address: `resent === false`, `user_profiles.role === 'organizer'`, `invite_pending === true`; an **anon** client's `verifyOtp({ token_hash: hashed_token, type: 'invite' })` returns a session and afterwards `invite_pending === false`; a second `verifyOtp` with the same hash fails; a second `inviteOrganizerCore` for a **pending** address returns `resent === true` (carried-forward item 1, R4); for a confirmed address (`createAuthedVendor`) → the FR-002 message. Clean up created users with `auth.admin.deleteUser`. Run `npm run test:security -- invite-flow` → PASS.
- [ ] **Step 4: Toast** — `invite-form.tsx` line ~87: `Invitation sent to <email>` / `Invitation re-sent to <email>`; error verbatim.
- [ ] **Step 5: Local check** — `SUPABASE_SERVICE_ROLE_KEY=<from npx supabase status> npm run dev`; as a local admin, Send Invite to `anyone@example.com` → toast "Invitation sent…", mail visible in mailpit (`http://127.0.0.1:54324`); repeat → "Invitation re-sent…"; invite your own admin address → FR-002 message. (Local mail links go through GoTrue's `/auth/v1/verify`, not `/auth/confirm` — quickstart "Local development loop".)
- [ ] **Step 6: Gate and commit** — `npm run lint && npm test && npm run build`; `git commit -m "feat(team): send organizer invitations through the admin client and set the role [009-T007]"`. PR to `dev`.

- [ ] T008 [manual] [US1] Dev project and preview configuration. (1) Re-read the dev Site URL (Authentication → URL Configuration) and confirm it is the `dev`-branch preview origin alone (research R18). (2) `supabase link --project-ref kcokcufmzyckbodelqpb` (or `--db-url`) then `supabase db push`; confirm `013` in `supabase migration list` and `select invite_pending from users_with_roles limit 1` in the SQL editor. (3) Vercel → Settings → Environment Variables → add `SUPABASE_SERVICE_ROLE_KEY` = the dev project's `service_role` (or `sb_secret_…`) key, **Preview** scope, all branches; redeploy the `dev` preview. (4) Supabase dev → Authentication → Email Templates → **Invite user**: subject and body from `contracts/email-templates.md` §1, sender unchanged (Resend SMTP from 007 T013b). Needs T003 merged to `dev` (the preview must have the new `getUsers`). evidence: quickstart.md rows **V3**, **D1**, **D2**, **D3** — FR-027, FR-030

- [ ] T009 [manual] [US1] Story 1 walkthrough on the dev preview with a real mailbox. Needs T005–T008 **and T013** merged to `dev`. (1) Send Invite to `<maintainer>+009-a@…` → toast "Invitation sent to …" → the row appears at once with a Pending badge and the Organizer role → mail in the Inbox from `noreply@holigayeventsyyc.ca`, link host = the preview origin, path `/auth/confirm?…&type=invite&next=/set-password` → click → `/set-password` signed in, no landing page, no login form → set a password → `/dashboard` as organizer → Team page shows Organizer. (2) Refusals: invite your own admin address → "That email already has an account. Change their role on the Admin page instead.", no mail; invite `+009-a` again after acceptance → same. Record dates, toast texts, sender and link host. evidence: quickstart.md rows **D6**, **D7** — US1 scenarios 1–4, SC-001, SC-002, SC-006

**Checkpoint**: Story 1 works end to end on the dev preview with zero manual database steps (D6 filled).

---

## Phase 4: User Story 2 — Any user resets a forgotten password (Priority: P2)

**Goal**: "Forgot password?" on `/login` → `/forgot-password` → neutral response → emailed recovery link → `/set-password` → the role's dashboard.

**Independent Test**: quickstart.md row D9 — request a reset for an existing vendor, click the link, set a new password, land on `/vendor-dashboard`, sign out and back in with it; request for a nonexistent address shows the identical response.

- [ ] T010 [US2] `/forgot-password` page, form, `requestPasswordReset` action and the Login "Forgot password?" link — in `src/app/(auth)/forgot-password/page.tsx`, `src/lib/actions/auth.ts` (files, interfaces and steps below). Needs T005, T006.

**Files:**
- Create: `src/app/(auth)/forgot-password/page.tsx` (RSC shell: heading "Reset your password", the form), `src/components/auth/forgot-password-form.tsx` (`'use client'`), `src/test/forgot-password-form.test.tsx`
- Modify: `src/lib/validations/auth.ts` (`forgotPasswordSchema`, `ForgotPasswordInput`), `src/lib/actions/auth.ts` (`requestPasswordReset`, `RequestPasswordResetResponse`), `src/test/auth-password-actions.test.ts` (new describe), `src/app/(auth)/login/page.tsx` (a `Link` to `/forgot-password` labelled "Forgot password?" beside the Sign up link at lines 59–60)

**Interfaces:**
- Produces: `requestPasswordReset(data)` (`contracts/server-actions.md` §requestPasswordReset); `/forgot-password`. Consumed by the Reset-password template (T011) via `/auth/confirm` → `/set-password`.

- [ ] **Step 1: Failing action tests** — in `auth-password-actions.test.ts`: malformed email → `{ success: false, error: 'Please enter a valid email address', data: null }` and `resetPasswordForEmail` not called; `' Foo@Example.com '` → called with `foo@example.com` and **no** `redirectTo`; GoTrue success → `{ success: true, error: null, data: null }`; GoTrue error (`over_email_send_rate_limit`) → the **same** success result and `console.error` called with the code only (spy asserts the address is not in the call). Run → FAIL.
- [ ] **Step 2: Implement** — schema and action per the contract (research R11). Re-run → PASS.
- [ ] **Step 3: Failing form test** — `forgot-password-form.test.tsx`: labelled email field (`useId()`), inline validation error with `role="alert"` for a malformed address and the action not called, on success the form is replaced by `If that address has an account, a reset link is on its way.`, `isLoading` while pending. Run → FAIL.
- [ ] **Step 4: Implement the form, page and Login link** — RHF + `zodResolver(forgotPasswordSchema)`, `Input`, `Button`; page copy "Enter the email on your account and we'll send a link to choose a new password."; login link. Re-run → PASS. `/forgot-password` is **not** added to `authRoutes` (FR-019; T005's middleware cases already assert the pass-through).
- [ ] **Step 5: Local check** — `/forgot-password` with a local address → neutral message; mail in mailpit; with a nonexistent address → identical screen; signed in → page still renders.
- [ ] **Step 6: Gate and commit** — `npm run lint && npm test && npm run build`; `git commit -m "feat(auth): add the forgot-password flow with a neutral response [009-T010]"`. PR to `dev`.

- [ ] T011 [manual] [US2] Dev **Reset password** template: Supabase dev → Authentication → Email Templates → Reset password → subject and body from `contracts/email-templates.md` §2 (link `…&type=recovery&next=/set-password`). Verify per the contract's "Verifying a template": one real reset from `/forgot-password` on the preview to a throwaway, mail from the branded sender, link host = preview origin. evidence: quickstart.md row **D4** — FR-027, FR-030

- [ ] T012 [manual] [US2] Story 2 and the edge cases on the dev preview. Needs T010, T011 and T013. (1) **D9**: `/login` shows "Forgot password?" → request for the existing throwaway vendor (or `+009-a`) → neutral message → mail → link → `/set-password` signed in → new password → `/vendor-dashboard` (or `/dashboard` for the organizer throwaway) → sign out → sign in with the new password works; request for `+009-nobody@…` → identical on-screen response. (2) **D10**: reopen the already-used reset link → `/login` with "That link has expired or was already used…", signed out; open `<preview>/auth/confirm?type=magiclink&token_hash=x` → same notice; open `/set-password` signed out → `/login` with "Please sign in first."; open `/set-password` and `/forgot-password` while signed in → both render. (3) **D11**: invite `+009-c`, click the link, close the tab without setting a password → Team page shows no Pending, Resend absent, re-invite refused with the FR-002 message; recover via `/forgot-password` → `/set-password` → password set. evidence: quickstart.md rows **D9**, **D10**, **D11** — US2 scenarios 1–6, spec Edge Cases, SC-003, SC-004, SC-007

**Checkpoint**: Stories 1 and 2 both work on the dev preview; every link edge case creates no session and shows its notice.

---

## Phase 5: User Story 3 — Admin sees and resends pending invitations (Priority: P3)

**Goal**: Pending badge and Resend button on every never-signed-in member; Resend behaves exactly like the invite form and toasts "re-sent"; the badge clears on first sign-in; the summary tiles are unchanged.

**Independent Test**: quickstart.md row D8 — invite a second throwaway, do not click, see Pending + Resend, click Resend → second mail + "Invitation re-sent" toast, submit the same address in the form → same, click the link → badge gone.

- [ ] T013 [US3] Pending badge and Resend button on the Team page — in `src/app/dashboard/team/page.tsx` (files, interfaces and steps below). Needs T003, T007. Build it straight after T007 — T009 and T012 depend on it (US1 scenario 1 names the Pending badge).


**Files:**
- Modify: `src/app/dashboard/team/page.tsx` (import `Badge` from `@/components/ui/badge` and `Button` from `@/components/ui/button`; in the member row block (~lines 271–285) render `<Badge variant="warning">Pending</Badge>` beside the role and a `Button` "Resend" (`variant` secondary/ghost per the primitive, `size` small, `isLoading` per row, `aria-label="Resend invitation to <email>"`) when `member.invitePending`; Resend calls `inviteOrganizer(member.email)`, toasts per `contracts/server-actions.md` §Client and re-fetches via the existing `fetchUsers`/`onInvited` path; the tile counts (lines ~200–230) are **not** touched — FR-025)
- Create: `src/test/team-page.test.tsx` (RTL; mock `@/lib/actions/admin` `getUsers` and `@/lib/actions/team` `inviteOrganizer`, `sonner`)

**Interfaces:**
- Consumes: `UserWithRole.invitePending` (T003), `inviteOrganizer` (T007). Produces: the Pending / Resend UI (FR-023, FR-024).

- [ ] **Step 1: Failing test** — `team-page.test.tsx`: with one pending organizer and one confirmed admin from the mocked `getUsers`, the pending row shows "Pending" and a "Resend" button and the confirmed row shows neither; clicking Resend calls `inviteOrganizer` with that row's email and toasts `Invitation re-sent to <email>` when the mock returns `{ resent: true }`; the three tile numbers equal those computed from the same fixture before the change (snapshot the three values). Run → FAIL.
- [ ] **Step 2: Implement** — the page edits above. Re-run → PASS.
- [ ] **Step 3: Local check** — with the local admin and the T007 Step 5 invitee: row shows Pending + Resend; Resend → mailpit mail + "re-sent" toast; the tiles unchanged.
- [ ] **Step 4: Gate and commit** — `npm run lint && npm test && npm run build`; `git commit -m "feat(team): show pending invitations with a Resend button [009-T013]"`. PR to `dev`.

- [ ] T014 [manual] [US3] Story 3 walkthrough on the dev preview and the throwaway cleanup. Needs T013 merged. (1) **D8**: invite `+009-b@…`, do not click → row shows Pending badge + Resend → Resend → second mail arrives, toast "Invitation re-sent to …" → submit `+009-b` in the invite form → same mail + toast → role still Organizer → click the link → `/set-password` → Team page: badge and Resend gone; summary tiles unchanged throughout. (2) **D12**: Supabase dev → Authentication → Users → delete `+009-a`, `+009-b`, `+009-c` and any `+009-nobody` account. evidence: quickstart.md rows **D8**, **D12** — US3 scenarios 1–6

**Checkpoint**: Stories 1–3 clicked through once on the dev preview; the dev project holds no throwaways.

---

## Phase 6: User Story 4 — A vendor's signup confirmation lands them signed in (Priority: P4)

**Goal**: The Confirm-signup template points at `/auth/confirm` so a production signup link signs the vendor in; the signup page no longer tells them to sign in afterwards. Dev behaviour (confirmations off) unchanged.

**Independent Test**: quickstart.md row P8 — on production, sign up a throwaway vendor, click the link, land on `/vendor-dashboard` signed in.

- [X] T015 [P] [US4] Signup success copy — in `src/app/(auth)/signup/page.tsx` (files, interfaces and steps below)

**Files:**
- Modify: `src/app/(auth)/signup/page.tsx` lines 51–57 → "Account created! Check your email for a confirmation link — clicking it will sign you in." with no link (research R15)
- Create: `src/test/signup-page.test.tsx` (RTL; mock `@/lib/actions/auth` `signUp` → success; assert the new copy is shown and no link to `/login` is rendered inside the success message)

**Interfaces:** none new.

- [ ] **Step 1: Failing test** — `signup-page.test.tsx` as above. Run → FAIL on the old copy.
- [ ] **Step 2: Implement** — the copy change only; nothing else on the page (US4 scenario 3). Re-run → PASS.
- [ ] **Step 3: Gate and commit** — `npm run lint && npm test && npm run build`; `git commit -m "fix(auth): describe the confirmation link on the signup success message [009-T015]"`. PR to `dev`.

- [X] T016 [manual] [US4] Dev **Confirm signup** template: Supabase dev → Authentication → Email Templates → Confirm signup → subject and body from `contracts/email-templates.md` §3 (link `…&type=signup&next=/vendor-dashboard`). No mail is sent on dev (confirmations off), so the verification is that the saved template matches §3 character for character; the live test is P8. evidence: quickstart.md row **D5** — FR-027, FR-030

**Checkpoint**: All four stories are implemented; dev is fully configured; every dev evidence row (V1, V3, D1–D12) is filled.

---

## Phase 7: Production rollout and documentation

**Purpose**: Mirror the dev configuration on production, promote, run story 1 once for real, and make the repository say what changed (FR-031).

- [ ] T017 [manual] Production configuration. (1) Re-read the prod Site URL = `https://vendors.holigayeventsyyc.ca` (Authentication → URL Configuration). (2) `supabase db push` against prod (`hgmfjvjlxrhdojwlkgap`; the Management-API + keyring recipe from the 006/012 rollouts); confirm `013` in `migration list` and the column in the SQL editor. (3) Vercel → `SUPABASE_SERVICE_ROLE_KEY` = the prod project's key, **Production** scope only. (4) Supabase prod → Email Templates: Invite user (§1), Reset password (§2), Confirm signup (§3) from `contracts/email-templates.md`; sender unchanged. Needs every repo task (T002–T015) merged to `dev`. evidence: quickstart.md rows **V4**, **P1**, **P2**, **P3**, **P4**, **P5** — FR-027, FR-030

- [ ] T018 [manual] Promote and run the first real onboarding. Needs T017. (1) `git checkout main && git merge --ff-only dev && git push`; Vercel Production deploy green (the env guard now requires the key — a red build here means P2 is wrong). (2) **P7 — story 1 on production** with a real organizer's address: Send Invite → mail received → link → `/set-password` signed in → password set → `/dashboard`; Team page shows Organizer, no Pending. (3) **P8 — story 4**: sign up `<maintainer>+009-prod@…` as a vendor → confirmation mail → link → `/vendor-dashboard` signed in; the signup page copy no longer says "sign in"; delete the throwaway (Authentication → Users). (4) **P9**: replace or remove the placeholder organizer from 007 T015 (it can never receive mail) — delete it on the Admin page or in Authentication → Users once the real organizer from P7 is in. Record dates, sender and link hosts; no real addresses in the record. evidence: quickstart.md rows **P6**, **P7**, **P8**, **P9** — SC-001, SC-002, SC-006, US4 scenarios 1–2

- [ ] T019 Documentation and the constitution PATCH per FR-031 — in `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `.specify/memory/constitution.md` (files and steps below). Needs T018 (dates).

**Files:**
- Modify: `CLAUDE.md` (line 218 Epic 4 → "(Complete): Organizer invite system — delivered by spec 009"; Route Structure fence lines 244–264 gains `/auth/confirm`, `/set-password`, `/forgot-password`; Database Migrations item 13 after line 280 for `013_users_with_roles_invite_pending.sql`; a "Recent Changes" entry at line 336 and a sentence in "Current Development Phase" with the prod dates from T018; the Environment Variables section already says the key is server-only — confirm the T002 wording), `docs/ARCHITECTURE.md` (line 47 and line 77: the app uses the anon key everywhere except `src/lib/supabase/admin.ts`, imported only by `src/lib/actions/team.ts` behind `requireRole('admin')`, asserted by `src/test/admin-client-containment.test.ts`; add `/auth/confirm` to the request-flow section), `docs/ROADMAP.md` (line 30 status row → "Complete — spec 009"; Tier 4 bullet lines 180–182 → done, pointing at spec 009; line 319 M3 note → invites now in-app; a new Tier 3 candidate under line 142: "`users_with_roles` is readable by any authenticated JWT — consider `security_invoker` + an admin-only policy or an admin-only RPC (spec 009 research R20)"), `specs/README.md` (009 row → `✅ Complete`, PRs, merged date), `specs/007-production-readiness/quickstart.md` (line 95 backlog note → "closed by spec 009 (`/auth/confirm`, `/set-password`)"), `specs/008-self-hosted-infrastructure/tasks.md` (a note under T008 line 368: carry `SUPABASE_SERVICE_ROLE_KEY` into the `APP_ENV` strictness rule and mint it in `deploy/.env`; a note under T013 line 1552 beside lines 1734–1736: `GOTRUE_MAILER_URLPATHS_{INVITE,CONFIRMATION,RECOVERY,EMAIL_CHANGE}` must point at the **app** origin's `/auth/confirm`, plus `GOTRUE_MAILER_TEMPLATES_*` / `GOTRUE_MAILER_SUBJECTS_*` for the three bodies in `contracts/email-templates.md` — research R22), `docs/archive/TASKS.md` (one line above Task 4.2.1 ~line 361: "Superseded by spec 009"), `.specify/memory/constitution.md` (remove the acknowledged-violation lines 44–46 about `team.ts`; under Principle I bullet 2 add one sentence: "Actions that establish a session for a caller who has none yet (`signIn`, `signUp`, `requestPasswordReset`) cannot call `requireRole()`; they still validate with Zod first and return the same response shape."; Sync Impact Report "Version change: 1.1.1 → 1.1.2", "Bump rationale: PATCH — the Epic 4 invite stub is gone (spec 009); clarify that pre-session auth actions are outside the `requireRole()` rule"; footer line 240 `Version: 1.1.2`, `Last Amended: <merge date>`), `specs/009-organizer-invites/quickstart.md` (closing line: every row ☑, date)

- [ ] **Step 1: Edit** every file above; `grep -rn "service-role\|service role" docs/ CLAUDE.md` afterwards to catch any remaining "not used anywhere" wording.
- [ ] **Step 2: Gate and commit** — `npm run lint && npm test && npm run build` (docs-only, but the gate is the rule); `git commit -m "docs: close spec 009 — organizer invites, /auth/confirm, password reset; constitution 1.1.2 [009-T019]"`. PR to `dev`, then `dev → main` fast-forward so Production carries the docs.

---

## Dependencies and execution order

- **T001** first (the task list is the source of truth on `dev`).
- **Phase 2**: T002, T003, T004 are independent and parallel. T004 is manual and can run any time before T006 is written.
- **Phase 3**: T005 and T006 need only T001 (parallel with each other and with T002/T003); T007 needs T002 and T003; T008 needs T003 merged; T009 needs T005–T008 and T013.
- **Phase 4**: T010 needs T005 (notices) and T006 (`/set-password`); T011 after T010 is on the preview; T012 needs T010, T011 and T013.
- **Phase 5**: T013 needs T003, T007 and precedes T009 (US1 scenario 1 names the badge); T014 needs T013 and T009.
- **Phase 6**: T015 independent of every other repo task; T016 any time after T005 is on `dev`.
- **Phase 7**: T017 needs T002–T015 merged; T018 needs T017; T019 needs T018's dates.
- A task is ticked only when its PR is merged (repo) or its evidence rows are filled (manual) — constitution Development Workflow §6.

## Parallel execution examples

- **Foundation**: T002 (env + admin client) and T003 (migration + types + `getUsers`) touch disjoint files — two branches at once; T004 in the console meanwhile.
- **US1 code**: T005 (`/auth/confirm` + login notices) and T006 (`/set-password`) are disjoint and can be built alongside T002/T003; T007 waits for both foundation PRs.
- **Console work while code lands**: T008's template and Vercel steps can be done as soon as T003 is on `dev`; T011 and T016 (templates) any time after T005 is on `dev`.
- **US4**: T015 is a one-file change that can ride in parallel with any phase.
- **T013 early**: once T007 is merged, T013 is a one-file UI change that should land before the first walkthrough (T009).

## Implementation strategy

- **MVP is User Story 1 alone**: after T009 an admin onboards an organizer with no database step, and the two reusable pieces (`/auth/confirm`, `/set-password`) exist. Stop there if needed; US2–US4 are each one action/page/template on top.
- **Increment 2 (US2)** adds recovery — also the documented escape hatch for an invitee who abandoned `/set-password`.
- **Increment 3 (US3)** is UI over a column that already exists; **increment 4 (US4)** is a template plus a copy change.
- Production sees nothing until T017/T018, after every dev evidence row is filled (spec Assumptions: rollout order local → dev → prod).

## Task-to-requirement map

| FR | Tasks | FR | Tasks |
|---|---|---|---|
| FR-001 | T007 | FR-017 | T006 |
| FR-002 | T007, T009, T012 | FR-018 | T006 |
| FR-003 | T007, T014 | FR-019 | T005, T010, T012 |
| FR-004 | T007, T009 | FR-020 | T010 |
| FR-005 | T007, T013 | FR-021 | T010, T012 |
| FR-006 | T007 | FR-022 | T005, T011, T012 |
| FR-007 | T002, T007 | FR-023 | T003, T013, T014 |
| FR-008 | T007 | FR-024 | T013, T014 |
| FR-009 | T005, T008, T011, T016 | FR-025 | T013 |
| FR-010 | T005 | FR-026 | T002, T007 |
| FR-011 | T005, T012 | FR-027 | T008, T011, T016, T017 |
| FR-012 | T005 | FR-028 | T002 (unchanged; security suite `anon-*` stays green) |
| FR-013 | T005 | FR-029 | T003 |
| FR-014 | T005, T007, T010 | FR-030 | T004, T008, T009, T011, T012, T014, T016, T017, T018 |
| FR-015 | T006, T012 | FR-031 | T019 |
| FR-016 | T006 | SC-001–SC-007 | T009, T012, T014, T018, T002 (SC-005) |
