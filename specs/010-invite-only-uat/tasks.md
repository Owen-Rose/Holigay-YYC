# Tasks: Invite-Only UAT Environment

**Input**: Design documents from `/specs/010-invite-only-uat/`
**Prerequisites**: plan.md, spec.md (with `checklists/requirements.md` passed 2026-09-27; US2 amended 2026-09-27), research.md (verified facts, R1–R14), data-model.md (no migration; deployment mode, invitation role), contracts/invite-only-mode.md, contracts/invite-with-role.md, quickstart.md (the evidence record: rows D1–D8, P1–P3; the setting names and the enforcement probe).

**Tests**: Included — plan.md's Constitution Check (Principle II) requires a test with every changed action and form, and FR-012 demands a real-database assertion. The exact cases live in the two contracts' §5 test matrices; the steps below name them and point there rather than duplicating them.

**Organization**: Task IDs T001–T014 are fixed from here: `quickstart.md`'s evidence rows cite them via the **evidence:** clause in each `[manual]` task. Phases follow spec priority (US1 → US4), then close. `[manual]` tasks are Supabase-dashboard, Vercel or mailbox work done by the maintainer; each is ticked only when its evidence rows are filled (spec 009 precedent). Every task is one `- [ ] Txxx [P?] [USn] …` line — the Speckit checklist format that `/speckit-implement` ticks — and the four repo tasks carry **Files**, **Interfaces** and step checkboxes beneath that line (the steps are sub-items, not tasks). Each repo task is one branch off `dev` and one PR, commits tagged `[010-Txxx]`, gated by `npm run lint && npm test && npm run build` with the local stack up (`docker restart supabase_kong_Holigay` if auth health returns 502 after a reset). **No Claude co-authoring trailers on commits or PRs.**

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement the repo tasks task-by-task, one task per session and only on the maintainer's explicit go. `[manual]` tasks are for the maintainer; an agent stops at them and reports what is needed. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No account exists on the training deployment unless an admin invited it. The dev project refuses self sign-up; the app, behind one explicit flag, hides the sign-up link, answers 404 on `/signup` and refuses `signUp` before contacting the service; the Team page invite form can create vendor accounts as well as organizers; invitation links land on the `uat-` host. Production is unchanged and proven so.

**Architecture:** `NEXT_PUBLIC_INVITE_ONLY` → `inviteOnly` in `src/lib/env-public.ts` (research R1) drives three guards: a `NextResponse.rewrite` to the not-found page at the top of `src/middleware.ts` (R2), a conditional link on the Login page (R4) and an early return in `signUp` (R3). `inviteSchema` gains `role ∈ {organizer, vendor}` (default organizer) and `inviteOrganizerCore` writes it in step e (R5); the invite form gains a `Select` (R7). The Team page keeps listing organizers and admins only (R6). Enforcement is the dev project's sign-up toggle, proven by a direct `422 signup_disabled` (R9). Every console change is a `[manual]` task with an evidence row, dev first, production read-only.

**Tech Stack:** TypeScript 5.9 strict; Next.js 16.0.7 App Router (edge middleware, client page, server action); React 19; `zod` ^4; `@supabase/supabase-js` ^2.86 (unchanged calls); `sonner`; Vitest 4 (`unit` jsdom + `security` node). **No new packages. No migration.**

## Global Constraints

- The mode is on iff `NEXT_PUBLIC_INVITE_ONLY` trimmed is exactly `true`; it is **never** derived from `VERCEL_ENV` (FR-001, SC-006, research R1). It is inlined at build: set on Vercel first, then redeploy (R10).
- The in-app behaviour is defensive; enforcement is the dev project's sign-up toggle being off, proven by the probe in `quickstart.md` (FR-006, FR-013).
- Spec 009's messages, `InviteResponse`, `requireRole('admin')`-first ordering and the admin-client containment (one importer, `src/test/admin-client-containment.test.ts`) are unchanged. `inviteOrganizer` and `inviteOrganizerCore` keep their names (R5).
- `/`, `/apply` and the anonymous submission RPC stay public on every deployment (FR-005, spec D2); RLS, storage and the spec 006 posture are untouched.
- User-facing strings in `contracts/invite-only-mode.md` and `contracts/invite-with-role.md` are acceptance criteria — copy them exactly.
- Nothing rides in this spec that changes production behaviour (the email-casing gap is recorded, not fixed — research R8).
- Commits: `<type>(<scope>): <summary> [010-Txxx]`, no co-authoring trailers.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files or consoles, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md
- **[manual]**: Supabase-dashboard / Vercel / mailbox work; evidence recorded in quickstart.md before ticking

---

## Phase 1: Setup

**Purpose**: Make the task list the source of truth on `dev`.

- [X] T001 Finish the spec scaffold as a docs-only PR: on `010-invite-only-uat`, add the 010 row to specs/README.md after the 009 row (`| 010 | Invite-only UAT environment | 🚧 In progress — spec, plan and tasks T001–T014 written 2026-09-27 | <PR link> | — |`); `git add` `specs/010-invite-only-uat/` (spec.md, checklists/, plan.md, research.md, data-model.md, quickstart.md, contracts/, tasks.md), the design record `docs/superpowers/specs/2026-09-27-invite-only-uat-design.md` (already committed — verify), the **still-untracked** `docs/handoffs/2026-09-27-uat-findings.md` that spec.md cites, the `CLAUDE.md` Active Technologies / Recent Changes lines `/speckit-plan` appended, and specs/README.md; `git commit -m "docs(specs): spec 010 invite-only UAT — plan, contracts, evidence record, tasks [010-T001]"`; `git push -u origin 010-invite-only-uat && gh pr create --base dev --title "docs(specs): spec 010 invite-only UAT (plan, contracts, tasks)" --body "Plan, research, data model, contracts, evidence record and task list for the invite-only training deployment. Also commits the 2026-09-27 UAT findings handoff the spec cites. No code."`; put the PR number in the README row and amend. Tick after merge (constitution Development Workflow §6).

---

## Phase 2: Foundational — dev project and Vercel settings, before any code reaches the training deployment

**Purpose**: FR-017 orders the two dev-project settings and the Preview flag ahead of the code change. All three are reversible and need no code. Setting names, API fields and the probe are in `quickstart.md` "Setting names"; the Management API method (`GET`/`PATCH /v1/projects/kcokcufmzyckbodelqpb/config/auth`, CLI login token, default-mode session) is spec 009's D3 method.

**⚠️ CRITICAL**: T004 must be in place before T005 merges, or the first `dev` build after merge is open mode and D4 fails.

- [X] T002 [P] [manual] Dev project: turn **off** "Allow new users to sign up" (Supabase dev → Authentication → Sign In / Providers; API field `disable_signup: true` — note the inversion). Then run the probe from quickstart.md against the dev API with the anon key and record the HTTP status and `error_code` (expected `422` / `signup_disabled`). If the probe returns `200`, delete `probe+010@example.com` from Authentication → Users and re-check the setting. evidence: quickstart.md row **D1** — FR-006, FR-013, US1 scenario 5

- [X] T003 [P] [manual] Dev project: Site URL → `https://uat-holigay-yyc.vercel.app` (Authentication → URL Configuration; API `site_url`); Redirect URLs (`uri_allow_list`) must keep **both** `https://holigay-yyc-git-dev-owen-roses-projects.vercel.app` and `https://uat-holigay-yyc.vercel.app`. Read both values back and record them. This supersedes spec 009 quickstart row V3's value (research R11; T014 adds the note there). evidence: quickstart.md row **D2** — FR-014, US3

- [X] T004 [P] [manual] Vercel → Settings → Environment Variables → add `NEXT_PUBLIC_INVITE_ONLY` = `true`, **Preview** scope, no branch filter, **not** Production. Record that the variable is listed with Preview scope. The second half of the evidence comes with T005: once T005's PR preview has rebuilt, `/signup` on that preview is the standard 404 page and its `/login` has no "Sign up" link (research R10 — the flag is inlined at build). evidence: quickstart.md row **D3** — FR-015, spec edge case "other pull-request previews"

**Checkpoint**: D1–D3 filled. The dev project refuses sign-up at the service; the code can now land.

---

## Phase 3: User Story 1 — A stranger who finds the training address cannot get an account (Priority: P1) 🎯 MVP

**Goal**: With the flag on, the Login page has no sign-up link, `/signup` is not found, `signUp` refuses before contacting Supabase, and the landing page, `/apply`, sign-in and every other path behave as today. With the flag unset nothing changes (production provably unaffected).

**Independent Test**: on the `uat-` host, signed out: load `/`, submit `/apply` with a file, open `/login` (no "Sign up", "Forgot password?" present), request `/signup` (404 page), run the probe (`422`), check Authentication → Users (no new row). Locally: `npm test` covers both modes.

- [X] T005 [US1] Invite-only mode: the flag, the middleware 404, the Login link and the `signUp` refusal, with tests and env docs — in `src/lib/env-public.ts`, `src/middleware.ts`, `src/app/(auth)/login/page.tsx`, `src/lib/actions/auth.ts` (files, interfaces and steps below)

**Files:**
- Modify: `src/lib/env-public.ts`, `src/middleware.ts`, `src/app/(auth)/login/page.tsx`, `src/lib/actions/auth.ts`
- Modify (docs, same PR — constitution: new env vars documented in the PR that introduces them): `.env.example` (a `NEXT_PUBLIC_INVITE_ONLY` block after the Supabase pair: not a secret, `true` only on Vercel Preview, unset locally and on Production, exact-`true` rule), `CLAUDE.md` "Environment Variables" (`env-public.ts` owns the pair **and** `NEXT_PUBLIC_INVITE_ONLY`; one line under "Optional"), `specs/007-production-readiness/contracts/env-contract.md` (one row in "Variables": read by `env-public` → middleware, login page, `signUp`; Local unset; Preview `true`; Production unset; validation "optional; mode on iff exactly `true`"; and one row in "Where each deployment sets them"), `docs/DEV-ENVIRONMENT-SETUP.md` Part 8 table (one Preview row)
- Modify (tests): `src/test/env.test.ts`, `src/test/middleware.test.ts`, `src/test/login-page.test.tsx`
- Create (test): `src/test/auth-signup-action.test.ts`

**Interfaces:**
- Produces: `inviteOnly: boolean` from `@/lib/env-public` (contract: `contracts/invite-only-mode.md` §1). Consumed by the three guards in this task only.

- [ ] **Step 1: Failing tests** — following each file's existing pattern and the matrix in `contracts/invite-only-mode.md` §5: (a) `src/test/env.test.ts`: add `NEXT_PUBLIC_INVITE_ONLY` to `ENV_VARS`; new `describe('@/lib/env-public inviteOnly')` with `'true'` → true, `' true '` → true, unset / `''` / `'false'` / `'TRUE'` / `'1'` → false, and the Supabase pair still exported in every case. (b) `src/test/middleware.test.ts`: change the `@/lib/env-public` mock to expose a mutable `inviteOnly` (e.g. `let mockInviteOnly = false; vi.mock('@/lib/env-public', () => ({ supabaseUrl: …, supabaseAnonKey: …, get inviteOnly() { return mockInviteOnly; } }))`); cases: flag on + `/signup` signed out → `res.headers.get('x-middleware-rewrite')` ends with `/404` and `mockGetUser` not called; flag on + `/signup/extra` with a signed-in user → same rewrite; flag on + `/login` and `/apply` → pass through (status 200, no rewrite header); flag off + `/signup` + signed-in vendor → 307 to `/vendor-dashboard` (existing behaviour, keep green). (c) `src/test/login-page.test.tsx`: mock `@/lib/env-public` the same mutable way; flag off → `getByRole('link', { name: 'Sign up' })` has `href="/signup"` and "Forgot password?" is present; flag on → `queryByRole('link', { name: 'Sign up' })` is null and "Forgot password?" still present. (d) new `src/test/auth-signup-action.test.ts`: mock `@/lib/supabase/server` (`createClient` → `{ auth: { signUp } }`) and `@/lib/env-public` (mutable); flag on + valid input → `{ success: false, error: 'Sign-up is by invitation on this site.' }` and `createClient` not called; flag on + short password → the Zod message (order: validation first); flag off + valid input → `auth.signUp` called with `{ email, password }` and `{ success: true, error: null }`. Run `npx vitest run src/test/env.test.ts src/test/middleware.test.ts src/test/login-page.test.tsx src/test/auth-signup-action.test.ts` → new cases FAIL.
- [ ] **Step 2: `env-public`** — add `NEXT_PUBLIC_INVITE_ONLY: z.string().trim().optional()` to `publicEnvSchema`, the literal `process.env.NEXT_PUBLIC_INVITE_ONLY` entry in the `safeParse` object (keep the "do not refactor" comment true), and `export const inviteOnly: boolean = parsed.data.NEXT_PUBLIC_INVITE_ONLY === 'true';` with the JSDoc from the contract. Re-run the env test → PASS.
- [ ] **Step 3: middleware** — import `inviteOnly`; move `const { pathname } = request.nextUrl;` to the top of `middleware()` and, before `createServerClient`, add the guard from `contracts/invite-only-mode.md` §2 (`NextResponse.rewrite(new URL('/404', request.url))` for `/signup` and `/signup/*`). Leave `authRoutes`, `protectedRoutes` and `config.matcher` unchanged. Re-run → PASS.
- [ ] **Step 4: Login page** — import `inviteOnly`; wrap the "Don't have an account? / Sign up" `<div>` in `{!inviteOnly && (…)}` (§3). Nothing else in the file changes. Re-run → PASS.
- [ ] **Step 5: `signUp`** — import `inviteOnly`; after `signupSchema.safeParse` succeeds and before `await createClient()`, `if (inviteOnly) return { error: 'Sign-up is by invitation on this site.', success: false };` (§4). Update the JSDoc. Re-run → PASS.
- [ ] **Step 6: Docs in the same PR** — the four files listed under **Files**; keep the 007 contract's "single place that says which variables the app reads" true.
- [ ] **Step 7: Local check** — `NEXT_PUBLIC_INVITE_ONLY=true npm run dev`: `/signup` shows the 404 page, `/login` has no "Sign up", `/apply` and `/` render; restart without the variable: `/signup` renders again. (Quickstart "Local development loop".)
- [ ] **Step 8: Gate and commit** — `npm run lint && npm test && npm run build`; `git commit -m "feat(auth): invite-only mode behind NEXT_PUBLIC_INVITE_ONLY — hide, 404 and refuse sign-up [010-T005]"`. PR to `dev`. **Before merging**: T004's variable is set (the PR preview's `/signup` is the 404 page — that is T004's second evidence half).

- [X] T006 [manual] [US1] Story 1 on the training deployment after T005 is on `dev` and the `uat-` host has redeployed. Signed out on `https://uat-holigay-yyc.vercel.app`: (1) `/` loads; (2) `/apply` — submit the public form with a file for the current active event (use a throwaway address; T013 deletes it); (3) `/login` shows "Forgot password?" and **no** "Sign up"; (4) `/signup` and `/signup/x` show the standard 404 page ("Page not found"); (5) run the quickstart probe against the dev API → `422 signup_disabled`; (6) Supabase dev → Authentication → Users: no new account. Record what was seen. evidence: quickstart.md row **D4** — US1 scenarios 1–5, FR-002–FR-006, FR-015, SC-001, SC-002

**Checkpoint**: US1 complete — the training deployment creates no account for anyone who was not invited. This is the MVP.

---

## Phase 4: User Story 2 — Admin invites a tester as a vendor from the Team page (Priority: P2)

**Goal**: The invite form offers Organizer (default) or Vendor; the chosen role is set right after the account is created; re-sends keep the stored role; Admin is never invitable; a vendor who applied first sees their application after accepting. By decision (research R6) the Team page list is unchanged; the Admin page shows the new vendor.

**Independent Test**: on the `uat-` host, submit `/apply` with a throwaway, invite that address as Vendor, open the mail, set a password, see the application on `/vendor-dashboard`; the Admin page lists the address as Vendor. Locally: `npm test` (action + form) and `npm run test:security` (the trigger link).

- [X] T007 [US2] Invitation role, server side: `inviteSchema.role`, `inviteOrganizerCore(admin, email, role)`, `inviteOrganizer(email, role?)`, unit tests and the real-stack suite — in `src/lib/validations/team.ts`, `src/lib/team/invite-organizer-core.ts`, `src/lib/actions/team.ts` (files, interfaces and steps below)

**Files:**
- Modify: `src/lib/validations/team.ts`, `src/lib/team/invite-organizer-core.ts`, `src/lib/actions/team.ts`
- Modify (tests): `src/test/team-actions.test.ts`, `src/test/security/invite-flow.test.ts`

**Interfaces:**
- Produces: `INVITE_ROLES`, `type InviteRole = 'organizer' | 'vendor'`, `inviteSchema` with `role` (default `'organizer'`) from `@/lib/validations/team`; `inviteOrganizer(email: string, role?: string): Promise<InviteResponse>` from `@/lib/actions/team`; `inviteOrganizerCore(admin, email, role: InviteRole, deps?)` from `@/lib/team/invite-organizer-core` (contract: `contracts/invite-with-role.md` §1–§3). Consumed by T008 and by the Team page's Resend button (unchanged: one argument).

- [ ] **Step 1: Failing unit tests** — `src/test/team-actions.test.ts`, per `contracts/invite-with-role.md` §5: `inviteOrganizer('new@example.com', 'vendor')` for a new address → `update` called with `{ role: 'vendor' }` and `{ resent: false }`; `inviteOrganizer('new@example.com')` → `update` with `{ role: 'organizer' }`; `inviteOrganizer('new@example.com', 'admin')` → `{ success: false, error: 'Please choose Organizer or Vendor', data: null }` and `mockCreateAdminClient` not called; `inviteOrganizer('pending@example.com', 'vendor')` with a pending row → `{ resent: true }` and `update` not called. Run → FAIL (TypeScript will also reject the second argument until step 3).
- [ ] **Step 2: Schema** — replace `src/lib/validations/team.ts` with the §1 shape (`INVITE_ROLES`, `InviteRole`, `role: z.enum(INVITE_ROLES, { error: 'Please choose Organizer or Vendor' }).default('organizer')`); keep the email transform exactly.
- [ ] **Step 3: Core and action** — `inviteOrganizerCore(admin, email, role, deps = {})`: step e becomes `.update({ role })`; JSDoc notes the role is ignored on a pending re-send (step d). `inviteOrganizer(email: string, role?: string)`: `inviteSchema.safeParse({ email, role })`; on failure return `parsed.error.issues[0]?.message ?? 'Please enter a valid email address'`; pass `parsed.data.role` to the core; JSDoc: "Invite a team member as an organizer or a vendor…". Re-run the unit tests → PASS; run `npx vitest run src/test/admin-client-containment.test.ts` → still PASS (no new importer).
- [ ] **Step 4: Real-stack suite** — `src/test/security/invite-flow.test.ts`: add `'organizer'` to every existing `inviteOrganizerCore` call; add a `describe.runIf(stackUp)('vendor invitations against the real stack')` block that (a) inserts a `vendors` row via `serviceClient()` with a **lower-case** throwaway email (`business_name`, `contact_name`, `email` required by the schema — check `src/types/database.ts`), invites it with `'vendor'` and the `generateLink` sender, then asserts `users_with_roles.role === 'vendor'`, `invite_pending === true`, `user_profiles.vendor_id` equals the inserted row's id and `vendors.user_id` equals the new user's id (FR-012); (b) re-sends with `'vendor'` then with `'organizer'` → both `{ resent: true }`, role still `vendor` (FR-010); (c) inserts a vendor row with a **mixed-case** email (`Mixed.Case+010@Example.com`), invites the lower-cased address as `'vendor'` and asserts the documented outcome — `vendor_id` is null and `vendors.user_id` stays null (research R8; the assertion is the record, a comment points at UAT findings item 11); `afterAll` deletes the created auth users and vendor rows. Run `npm run test:security` with the stack up → PASS.
- [ ] **Step 5: Gate and commit** — `npm run lint && npm test && npm run build`; `git commit -m "feat(team): invitations carry an organizer or vendor role [010-T007]"`. PR to `dev`.

- [X] T008 [US2] Invitation role, client side: the Role select on the invite form, with form and Team page tests — in `src/components/team/invite-form.tsx` (files, interfaces and steps below)

**Files:**
- Modify: `src/components/team/invite-form.tsx`
- Modify (tests): `src/test/invite-form.test.tsx`, `src/test/team-page.test.tsx`

**Interfaces:**
- Consumes: `inviteOrganizer(email, role)` from T007; `Select` from `src/components/ui/select.tsx`; `INVITE_ROLES` / `InviteRole` from `@/lib/validations/team`. Contract: `contracts/invite-with-role.md` §4–§5.

- [ ] **Step 1: Failing tests** — `src/test/invite-form.test.tsx`: the select labelled "Role" (`getByLabelText('Role')`) has exactly two options, Organizer and Vendor, with Organizer selected; choosing Vendor and submitting calls `inviteOrganizer('new@example.com', 'vendor')`, and after the success toast the select is back on Organizer and the email is empty; submitting without touching the select calls `inviteOrganizer('new@example.com', 'organizer')`; update the existing `submit()` helper for the new placeholder `name@example.com` and the existing assertions for the two-argument call. `src/test/team-page.test.tsx`: add a fixture `{ id: 'u-pending-vendor', email: 'pending-vendor@example.com', role: 'vendor', invitePending: true, … }` and assert it is **not** rendered as a row (decision R6) while the existing Resend case still calls `inviteOrganizer` with exactly one argument. Run → FAIL.
- [ ] **Step 2: Form** — add `const [role, setRole] = useState<InviteRole>('organizer')`; render `<Select label="Role" value={role} onChange={(e) => setRole(e.target.value as InviteRole)} options={[{ value: 'organizer', label: 'Organizer' }, { value: 'vendor', label: 'Vendor' }]} disabled={isSubmitting} />` beside the email input (keep the row layout usable at phone width — stack on small screens, e.g. `flex-col sm:flex-row`); heading `Invite team member`; copy `Send an invitation email. Organizers review applications; vendors get a vendor dashboard.`; placeholder `name@example.com`; submit `inviteOrganizer(trimmed, role)`; on success `setEmail('')`, `setRole('organizer')`. Toasts unchanged. Re-run → PASS.
- [ ] **Step 3: Team page** — no code change (research R6). Only the test fixture from step 1. Confirm the page header copy "View your team and invite new organizers." is still accurate enough; if it is changed to "…invite new team members.", update `src/test/dashboard-layout.test.tsx` or any test asserting it.
- [ ] **Step 4: Local check** — with the local stack and a service-role key in the shell (quickstart loop): as a local admin, pick Vendor, send to `anyone@example.com` → toast; Admin page shows the address as Vendor; mailpit has the mail.
- [ ] **Step 5: Gate and commit** — `npm run lint && npm test && npm run build`; `git commit -m "feat(team): role picker on the invite form [010-T008]"`. PR to `dev`.

- [X] T009 [manual] [US2] Story 2 walkthrough on the training deployment with a real mailbox. Needs T002–T004 filled and T008 on `dev`. (1) Signed out on the `uat-` host, submit `/apply` for the active event with `<maintainer>+010-v@…` typed **lower-case** (research R8), with a file. (2) As admin, `/dashboard/team` → email `+010-v`, Role **Vendor** → Send Invite → toast "Invitation sent to …"; the Team page list is unchanged (organizers and admins only); `/dashboard/admin` lists `+010-v` as Vendor. (3) Mail in the Inbox from `noreply@holigayeventsyyc.ca`; link host `uat-holigay-yyc.vercel.app`, path `/auth/confirm?…&type=invite&next=/set-password`. **Before clicking**: back on the Team page submit `+010-v` again with **Organizer** selected → toast "Invitation re-sent to …"; Admin page still says Vendor (FR-010). (4) Click the newest link → `/set-password` signed in → password → `/vendor-dashboard` lists the `+010-v` application (FR-012, SC-004). (5) Invite the maintainer's own admin address as Vendor → "That email already has an account. Change their role on the Admin page instead." (FR-011). Record dates, toast texts, sender, link host. evidence: quickstart.md row **D5** — US2 scenarios 1–7, FR-007–FR-012, SC-003 (vendor half), SC-004

**Checkpoint**: US1 and US2 complete — the vendor side of the training app is reachable, by invitation only.

---

## Phase 5: User Story 3 — An organizer invitation lands on the training hostname (Priority: P3)

**Goal**: With the dev Site URL moved (T003), invitation and reset links open on the `uat-` host and stay there; a link opened on the git-`dev` origin still works.

**Independent Test**: invite a throwaway as Organizer; the mail's link host, `/set-password` and `/dashboard` are all `uat-holigay-yyc.vercel.app`.

- [ ] T010 [manual] [US3] Story 3 walkthrough on the training deployment with a real mailbox. Needs T003 filled and T008 on `dev`. (1) `/dashboard/team` → `<maintainer>+010-o@…`, Role Organizer (default) → Send Invite → mail; link host `uat-holigay-yyc.vercel.app` → `/set-password` on that host → password → `/dashboard` on that host; Team page shows `+010-o` as Organizer, no Pending. (2) `/forgot-password` for `+010-o` → reset mail; link host `uat-…` → `/set-password` → new password → `/dashboard`. (3) Take either link's URL, replace the host with `holigay-yyc-git-dev-owen-roses-projects.vercel.app` **before** it is used (request a fresh reset for this) and open it there → it still works (redirect allow-list keeps both origins). Record hosts and dates. evidence: quickstart.md rows **D6**, **D7** — US3 scenarios 1–3, FR-014, SC-003 (organizer half)

**Checkpoint**: US1–US3 complete on the training deployment.

---

## Phase 6: User Story 4 — Production keeps open vendor self sign-up (Priority: P4)

**Goal**: Production's two authentication settings are read back and recorded, the flag is absent from Production scope, and one throwaway sign-up proves the flow is unchanged. This is also the production-only checklist for UAT-findings items 2, 3 and 9 (spec D7).

**Independent Test**: prod settings read; `/login` shows "Sign up"; `/signup` renders; a throwaway sign-up confirms by email and lands on `/vendor-dashboard`.

- [ ] T011 [P] [manual] [US4] Prod project read-backs (read-only, can be done today): Supabase prod → Authentication → Sign In / Providers: "Allow new users to sign up" is **on** (API `disable_signup: false`); Email → "Confirm email" value read and recorded (API `mailer_autoconfirm`; `true` means confirmations **off**). Change nothing; if sign-up is off, stop and report. evidence: quickstart.md row **P1** — FR-016, US4 scenario 3

- [ ] T012 [manual] [US4] Production non-regression, after the next `dev → main` promotion (which spec 009 T017 still gates — its Production service-role key must be set first). (1) Vercel → Environment Variables: `NEXT_PUBLIC_INVITE_ONLY` has **no** Production-scope entry. (2) On `https://vendors.holigayeventsyyc.ca`: `/login` shows "Sign up"; `/signup` renders (FR-015, US4 scenario 1). (3) Sign up `<maintainer>+010-p@…` → the on-screen message; the confirmation mail arrives from `noreply@holigayeventsyyc.ca`; its link lands signed in on `/vendor-dashboard` (US4 scenario 2; UAT-findings item 2). Record whether the success copy matched what happened given P1's confirm setting (item 3) and whether the signup subtitle still says "Sign up to manage vendor applications" (item 9) — both are observations for their own PRs, not fixes here. (4) Delete `+010-p` from prod Authentication → Users (profile cascades) and any vendor row it created. evidence: quickstart.md rows **P2**, **P3** — US4 scenarios 1–2, FR-015, SC-005

**Checkpoint**: All four stories evidenced. Production provably unchanged.

---

## Phase 7: Close — cleanup and documentation

**Purpose**: Leave the dev project clean and every document that FR-018 names current.

- [ ] T013 [manual] Dev cleanup after T009 and T010: delete the `+010-v` and `+010-o` auth users (Supabase dev → Authentication → Users; profiles cascade), the `+010-v` `vendors` row with its application and any `attachments` bucket object it uploaded, and the T006 throwaway application; `probe+010@example.com` never had an account (confirm). Afterwards `/dashboard/admin` on the `uat-` host shows no `+010-` address. evidence: quickstart.md row **D8**

- [ ] T014 Documentation per FR-018, one docs-only PR to `dev` after T012's evidence exists: (1) `docs/ROADMAP.md` M3 checklist — tick "Preview-deployment access decided for UAT (Vercel preview URLs are public-by-link)" and append the decision in one sentence: public by link, invite-only accounts via spec 010 (dev sign-up off, `NEXT_PUBLIC_INVITE_ONLY` on Preview, Team page invites vendors), `/apply` stays open. (2) `specs/README.md` — 010 row status → `✅ Shipped` with the merge date, or `🚧` with what is left if P2/P3 are still owed. (3) `docs/handoffs/2026-09-27-uat-findings.md` — move items 2, 3 and 9 into a new "Production-only checklist (spec 010)" section that points at `specs/010-invite-only-uat/quickstart.md` rows P1–P3 and carries T012's observations; add **item 11**: "Application email casing — `src/lib/validations/application.ts:120` keeps the case, `handle_new_user` matches exactly, GoTrue lower-cases, so a mixed-case applicant is never linked to their account (self sign-up or invite); options: `.trim().toLowerCase()` on the public form email, or migration `014` matching `lower(email)`; proven by the documenting case in `src/test/security/invite-flow.test.ts`"; note item 1 (stale events) if still open. (4) `specs/009-organizer-invites/quickstart.md` row V3 — append "superseded 2026-…: Site URL is now the `uat-` host (spec 010 D2)". (5) `specs/008-self-hosted-infrastructure/tasks.md` — one line under T008: `NEXT_PUBLIC_INVITE_ONLY` is platform-neutral; staging sets `true`, production unset; nothing in `APP_ENV` implies it (010 research R14). (6) `docs/ARCHITECTURE.md` line ~218 — "owns the `NEXT_PUBLIC_*` pair" → "owns the `NEXT_PUBLIC_*` values (the Supabase pair and the invite-only flag)". (7) `CLAUDE.md` "Current Development Phase" — one sentence: the training deployment is invite-only since spec 010 (date); production open. `git commit -m "docs: close spec 010 — roadmap, handoff production-only checklist, env notes [010-T014]"`. Tick after merge.

---

## Dependencies and execution order

- **T001** first (the task list is the source of truth on `dev`; it also commits the handoff file the spec cites).
- **Phase 2**: T002, T003, T004 are independent and parallel; all three need no code. **T004 must be in place before T005 merges.** T002 and T003 before T006/T009/T010 respectively.
- **Phase 3**: T005 needs only T001 (its docs edits assume the 007 contract as it stands). T006 needs T004 and T005 deployed to the `uat-` host.
- **Phase 4**: T007 needs only T001 and touches files disjoint from T005 — it can be built in parallel with T005 (separate branch). T008 needs T007 merged. T009 needs T002–T004 filled and T008 on `dev`.
- **Phase 5**: T010 needs T003 filled and T008 on `dev` (any invite exercises the Site URL; T003 alone could be checked with an organizer invite after T005, but the spec's story uses the final form).
- **Phase 6**: T011 is independent of everything and read-only. T012 needs T005–T008 on `main`, which needs spec 009 T017 (Production service-role key) first — do not promote `dev → main` before that.
- **Phase 7**: T013 after T009 and T010. T014 after T012 (it records T012's observations); if T012 is far off, T014 may land early with P2/P3 marked owed and be amended later.
- A task is ticked only when its PR is merged (repo) or its evidence rows are filled (manual) — constitution Development Workflow §6.

## Parallel execution examples

- **Console work while the first PR is written**: T002, T003, T004 (dev project and Vercel) and T011 (prod read-back) can all be done while T005 is on a branch.
- **Two code branches at once**: T005 (`env-public`, middleware, login page, `auth.ts`, four docs) and T007 (`validations/team.ts`, the core, `actions/team.ts`, two tests) touch disjoint files. T008 waits for T007.
- **Walkthroughs**: T009 and T010 use the same mailbox and can be done in one sitting once T008 is on `dev`; T013 straight after.

## Implementation strategy

- **MVP is User Story 1 alone**: T002 + T004 + T005 + T006. After T006 the training deployment creates no account for anyone who was not invited (SC-001), and the public form still works (SC-002). Stop there if needed — organizers can already be invited with spec 009's flow.
- **Increment 2 (US2)**: T007 + T008 + T009 make the vendor side reachable by invitation and prove the apply-then-invite link (SC-003, SC-004).
- **Increment 3 (US3)**: T003 + T010 — one setting and a walkthrough; this is the gate before the first real organizer invitation.
- **Increment 4 (US4)**: T011 now, T012 with the next promotion. Production sees no code effect at any point (SC-005, SC-006).
- **Sequence to the first real invitation** (design §8, spec Assumptions): T002–T004 → T005 → T007/T008 → T006/T009/T010 → the remaining UAT-findings items (6, 4, 5) as their own PRs → first invite.

## Task-to-requirement map

| FR | Tasks | FR | Tasks |
|---|---|---|---|
| FR-001 | T005 | FR-010 | T007, T009 |
| FR-002 | T005, T006 | FR-011 | T007, T009 |
| FR-003 | T005, T006 | FR-012 | T007, T009 |
| FR-004 | T005 | FR-013 | T002 |
| FR-005 | T005, T006 | FR-014 | T003, T010 |
| FR-006 | T002, T006 | FR-015 | T004, T006, T012 |
| FR-007 | T008 | FR-016 | T011 |
| FR-008 | T007 | FR-017 | T002, T003, T004, T006, T009, T010, T011, T012, T013 |
| FR-009 | T007, T009 | FR-018 | T001, T005 (env docs), T014 |
| SC-001, SC-002 | T006 | SC-003 | T009, T010 |
| SC-004 | T007, T009 | SC-005 | T011, T012 |
| SC-006 | T005 (env test: mode independent of `VERCEL_ENV`), T012 | | |
