# Implementation Plan: Invite-Only UAT Environment

**Branch**: `010-invite-only-uat` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-invite-only-uat/spec.md` (Clarifications
Session 2026-09-27, decisions D1–D7 plus the two settled during planning); design record
`docs/superpowers/specs/2026-09-27-invite-only-uat-design.md` (§4 components, §4.5 manual
configuration, §5 error handling, §6 tests); reasoning in `research.md` (R1–R14).

## Summary

The four stories reduce to one flag, three defensive guards, one new argument and four
console settings:

1. **`NEXT_PUBLIC_INVITE_ONLY`** (US1) — parsed by `src/lib/env-public.ts` into `inviteOnly`,
   on only for the exact string `true`, never derived from `VERCEL_ENV` (D3, R1). Set on Vercel
   Preview, unset on Production and locally.
2. **Three guards behind it** (US1): `src/middleware.ts` rewrites `/signup` to the standard
   not-found page before the session lookup; the Login page drops its sign-up link; `signUp`
   refuses with "Sign-up is by invitation on this site." after Zod and before any Supabase call
   (D4, R2–R4). Nothing else changes: `/`, `/apply`, sign-in, forgot/set-password, `/auth/confirm`,
   `/api/keepalive` are untouched (FR-005).
3. **A role on the invitation** (US2): `inviteSchema` gains `role ∈ {organizer, vendor}`
   defaulting to organizer; `inviteOrganizer(email, role?)` and `inviteOrganizerCore(admin,
   email, role)` write it in step e; re-sends ignore it; the invite form gains a `Select` (D5,
   R5, R7). By decision the Team page still lists organizers and admins only — an invited vendor
   is confirmed by the toast and listed on the Admin page (R6). FR-012 (the trigger links a
   pre-existing vendor row) is asserted against the real stack with a lower-case address; the
   mixed-case gap is documented, not fixed (R8).
4. **Console settings as `[manual]` tasks** (US1, US3, US4): dev sign-up off (the enforcement,
   proven by a direct `422 signup_disabled`), dev Site URL → the `uat-` host with both origins
   allow-listed, the Preview flag, and production's two settings read back — each an evidence row
   in `quickstart.md` (D1, D6, D7; R9–R11).

No new packages, no migration, no RLS or storage change. Production behaviour changes only if
someone sets the flag there, which the contract forbids.

## Technical Context

**Language/Version**: TypeScript 5.9, `strict: true` (unchanged); no SQL
**Primary Dependencies**: Next.js 16.0.7 App Router (edge middleware `NextResponse.rewrite`, client page, server action), React 19, `zod` ^4 (`z.enum().default()`, `z.string().trim().optional()`), `@supabase/supabase-js` ^2.86 (`auth.admin.inviteUserByEmail`, unchanged), `sonner`. **No new packages**
**Storage**: none changed — `auth.users`, `user_profiles`, `vendors`, `users_with_roles` read and written exactly as spec 009 left them; `handle_new_user` (migration `003`) does the vendor link
**Testing**: Vitest `unit` project (jsdom; `// @vitest-environment node` for `src/test/env.test.ts`) + `security` project (real local stack, `src/test/security/invite-flow.test.ts` extended) + manual walkthroughs on the training deployment with a real mailbox and one throwaway sign-up on production
**Target Platform**: Vercel — Preview (= training deployment `uat-holigay-yyc.vercel.app` and every PR preview, dev Supabase project) and Production (`vendors.holigayeventsyyc.ca`, prod project); local CLI stack for tests
**Project Type**: single Next.js web application
**Performance Goals**: none new; the `/signup` 404 costs no auth round-trip; the client bundle gains one boolean and one `<select>`
**Constraints**: the flag is not a secret and is inlined at build (set before merge, redeploy after); mode never inferred from `VERCEL_ENV` (SC-006); enforcement is the auth project's toggle, not code (FR-006); spec 009's messages, `InviteResponse` and the admin-client containment (one importer) are unchanged; no Claude co-authoring trailers on commits or PRs
**Scale/Scope**: 8 source files edited, 0 created; 7 test files edited, 1 created; 0 migrations; 11 `[manual]` evidence rows (D1–D8, P1–P3); ~10 docs touched across the two code PRs and the close

## Constitution Check

*GATE: evaluated before Phase 0 and re-checked after Phase 1 design — PASS, with two
pre-existing deviations recorded in Complexity Tracking.*

| Principle | Check | Status |
|---|---|---|
| I — Zod `safeParse` before any DB call | `inviteSchema` (now `{ email, role }`) is parsed before `createAdminClient()`; `signupSchema` stays first in `signUp`, and the invite-only refusal sits after it and before `createClient()` | PASS |
| I — `requireRole()` at the top of mutations | `inviteOrganizer`: `requireRole('admin')` remains the first statement; `signUp` remains the pre-session class recorded in spec 009's Complexity Tracking | PASS |
| I — `{ success, error, data }` responses | `InviteResponse` unchanged; `AuthResponse` (`{ error, success }`) unchanged | PASS |
| I — RLS / append-only migrations | no schema change | PASS |
| I — new env vars documented in the same PR | `NEXT_PUBLIC_INVITE_ONLY` lands with `.env.example`, `CLAUDE.md` (Environment Variables), `specs/007-production-readiness/contracts/env-contract.md` (both tables) and `docs/DEV-ENVIRONMENT-SETUP.md` Part 8 | PASS |
| I — no dead code | `signup/page.tsx` stays because production renders it; nothing else is orphaned | PASS |
| II — tests with every new/changed action and form | `env` (exact-`true` rule), middleware (rewrite before `getUser`, pass-through, open mode), Login page (link in both modes), `signUp` (refusal with no client, order after Zod, open mode), `inviteOrganizer` (vendor role written, default organizer, `admin` rejected, pending re-send ignores role), invite form (select default, role submitted), Team page (vendor still filtered), security suite (FR-012 link, role kept on re-send, mixed-case documented) — matrices in `contracts/` | PASS |
| III — UX consistency | `Select` primitive reused (44 px, `useId`, tokens); toasts unchanged; standard `not-found.tsx` reused; no inline colours | PASS |
| IV — RSC first; `revalidatePath`; matcher | no new `'use client'` file; `revalidatePath` calls unchanged; middleware matcher unchanged; the rewrite adds no lookup | PASS |
| Stack lock-in | no dependency added; GoTrue still sends the mails through the Resend SMTP relay | PASS |

## Project Structure

### Documentation (this feature)

```text
specs/010-invite-only-uat/
├── spec.md                          # US1–US4, FR-001–FR-018, SC-001–SC-006 (US2 amended 2026-09-27)
├── checklists/requirements.md       # passed 2026-09-27
├── plan.md                          # this file
├── research.md                      # verified facts + R1–R14
├── data-model.md                    # no migration; deployment mode, invitation role, state machine
├── quickstart.md                    # local loop, setting names, probe, evidence rows D1–D8 / P1–P3
├── contracts/
│   ├── invite-only-mode.md          # the variable, middleware 404, Login link, signUp refusal, test matrix
│   └── invite-with-role.md          # inviteSchema + role, action, core steps a–f, form, test matrix
└── tasks.md                         # /speckit-tasks output (not created here)
```

### Source code (repository root)

```text
src/lib/env-public.ts                   + NEXT_PUBLIC_INVITE_ONLY (trim, optional); export inviteOnly
src/middleware.ts                       + inviteOnly && /signup → NextResponse.rewrite('/404') before getUser()
src/app/(auth)/login/page.tsx           sign-up block rendered only when !inviteOnly
src/lib/actions/auth.ts                 signUp: refusal after Zod, before createClient()
src/lib/validations/team.ts             INVITE_ROLES, InviteRole, inviteSchema.role (default organizer)
src/lib/team/invite-organizer-core.ts   role parameter; step e writes { role }
src/lib/actions/team.ts                 inviteOrganizer(email, role?) parses { email, role }
src/components/team/invite-form.tsx     Role <Select>, heading/copy, submits role

.env.example                            NEXT_PUBLIC_INVITE_ONLY block
CLAUDE.md                               Environment Variables section
specs/007-production-readiness/contracts/env-contract.md   one row in each table
docs/DEV-ENVIRONMENT-SETUP.md           Part 8 Vercel table row

src/test/env.test.ts                    + inviteOnly cases; NEXT_PUBLIC_INVITE_ONLY in ENV_VARS
src/test/middleware.test.ts             + rewrite / pass-through / open-mode cases (mutable env-public mock)
src/test/login-page.test.tsx            + link present / absent
src/test/auth-signup-action.test.ts     NEW: refusal before client; Zod order; open mode
src/test/team-actions.test.ts           + role cases
src/test/invite-form.test.tsx           + select default; role submitted; reset after success
src/test/team-page.test.tsx             + pending vendor fixture not rendered
src/test/security/invite-flow.test.ts   + vendor invite, trigger link (FR-012), role kept, mixed-case documented
```

**Structure Decision**: every change lands in a file that already exists; the only new file is
one unit test. The layout follows the repo exactly — env in `src/lib/`, guards in the
middleware, the action and the Next-free core where spec 009 put them, the form in
`src/components/team/`. No new directory, route, component or module.

## Phases (mirror `tasks.md`)

| Phase | Story | Content | Ends when |
|---|---|---|---|
| 1 | setup | this plan's artifacts, the spec amendment, the (currently untracked) `docs/handoffs/2026-09-27-uat-findings.md` and the 010 row in `specs/README.md` merged to `dev` as a docs-only PR | PR merged |
| 2 | `[manual]` pre-code | D1 dev sign-up off + probe; D2 dev Site URL and allow-list; D3 Vercel Preview flag (checked on this branch's PR preview) — FR-017 order | rows D1–D3 filled |
| 3 | US1 | `env-public` + middleware + Login page + `signUp` + their tests + the four env docs, one PR to `dev`; D4 on the `uat-` host after redeploy | row D4 filled |
| 4 | US2 | schema + core + action + form + their tests + the security suite, one PR to `dev` | `npm test` and `npm run test:security` green |
| 5 | US2, US3 | D5 vendor walkthrough (apply first, invite, accept, application present, re-send keeps Vendor); D6 organizer walkthrough on the `uat-` host; D7 reset-link host and old-origin link; D8 cleanup | rows D5–D8 filled |
| 6 | US4 + docs | P1 prod read-backs now; P2, P3 after the next `dev → main` (gated by spec 009 T017); docs per FR-018: `ROADMAP.md` M3 item, `specs/README.md`, the UAT findings handoff (items 2/3/9 → quickstart P1–P3, item 11 email casing), 009 quickstart V3 note, 008 tasks note, `ARCHITECTURE.md` wording | every evidence row ☑ |

Each repo task is one branch off `dev` and one PR, commits tagged `[010-Txxx]`, gated by
`npm run lint && npm test && npm run build` with the local stack up. Implementation starts
only on the maintainer's explicit go.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| `src/components/team/invite-form.tsx` stays a hand-rolled `useState` form (constitution III asks for react-hook-form on forms) | pre-existing from spec 009; this spec adds one two-option `<select>` to it | converting the form to RHF is unrelated cleanup that would dwarf the feature diff; recorded for a later PR |
| `signUp` has no role guard | the caller has no session by definition (spec 009 Complexity Tracking, the `signIn`/`requestPasswordReset` class) | none — the invite-only refusal is added inside the same function without changing its class |
| `inviteOrganizer` / `inviteOrganizerCore` keep their names although they now invite vendors too | spec 009's contracts, tests and the admin-client containment allow-list cite them | a rename is churn across ~12 files for no behaviour change; JSDoc states the widened meaning (research R5) |
