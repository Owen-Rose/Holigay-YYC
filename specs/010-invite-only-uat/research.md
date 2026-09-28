# Research: Invite-Only UAT Environment

**Feature**: 010-invite-only-uat | **Date**: 2026-09-27

No `NEEDS CLARIFICATION` markers existed in the Technical Context: decisions D1–D7 were made
in the 2026-09-27 brainstorm and are recorded in the spec's Clarifications block. This file
records how each is realised, the facts checked against the working tree on 2026-09-27, and
the two gaps the design record left open, which were settled with the maintainer during
planning (R6, R8).

## Verified facts (2026-09-27)

- `src/lib/env-public.ts` — Zod `publicEnvSchema` with exactly two fields, parsed once at import
  from literal `process.env.NEXT_PUBLIC_*` member expressions (the inlining comment forbids a
  dynamic lookup). Exports `supabaseUrl`, `supabaseAnonKey`. Imported by `src/middleware.ts`
  and both Supabase clients, so it already runs on the edge, on the server and in the browser.
- `src/middleware.ts` — `authRoutes = ['/login', '/signup']`; the session lookup
  (`supabase.auth.getUser()`) is the first thing that happens after the client is built; an
  authenticated user on an auth route is redirected to their dashboard. Nothing rewrites today.
  Matcher excludes `_next/static`, `_next/image`, `favicon.ico` and image extensions.
- `src/app/(auth)/login/page.tsx` — `'use client'`; renders "Forgot password?" and a
  "Don't have an account? / Sign up" block linking to `/signup`. `src/app/(auth)/signup/page.tsx`
  — `'use client'`; calls `signUp` and shows the 009 success copy.
- `src/lib/actions/auth.ts` `signUp(data)` — `signupSchema.safeParse` → `createClient()` →
  `supabase.auth.signUp` → `{ error: error.message }` on failure. Returns `AuthResponse`
  (`{ error, success }`, no `data`). No role guard: the pre-session class recorded in spec 009's
  Complexity Tracking.
- `src/lib/validations/team.ts` — `inviteSchema = z.object({ email: trim → lower → z.email })`.
- `src/lib/team/invite-organizer-core.ts` — `inviteOrganizerCore(admin, email, deps)`: (a) lookup
  in `users_with_roles`, (b) refuse when `invite_pending !== true`, (c) `sendInvite`, (d) pending →
  `{ resent: true }` with the role untouched, (e) new user → `user_profiles.update({ role:
  'organizer' })`, (f) `{ resent: false }`. `InviteDeps.sendInvite` lets the security suite inject
  a `generateLink`-based sender.
- `src/lib/actions/team.ts` `inviteOrganizer(email)` — `requireRole('admin')` → `inviteSchema` →
  `createAdminClient()` → core → `revalidatePath('/dashboard/team')` + `'/dashboard/admin'`.
- `src/components/team/invite-form.tsx` — hand-rolled form (`useState`, native `<input>`, not
  react-hook-form; it pre-dates the RHF rule and spec 009 kept it so). Heading "Invite Organizer",
  placeholder `organizer@example.com`, button "Send Invite", toasts `Invitation sent to <email>` /
  `Invitation re-sent to <email>` / the error verbatim.
- `src/app/dashboard/team/page.tsx` — `teamMembers = users.filter(role === 'organizer' || role
  === 'admin')`. **Vendors never appear on the Team page**, pending or not. Resend calls
  `inviteOrganizer(member.email)` with no other argument. The summary tiles count the filtered
  list. `src/app/dashboard/admin/page.tsx` lists **every** user with a role badge and a role
  select; it renders no Pending badge (`invitePending` is on `UserWithRole` but unused there).
- `src/components/ui/select.tsx` — `Select` primitive: `label`, `options: { value, label }[]`,
  `useId()`, 44 px minimum height, token classes. Unused by the invite form today.
- `handle_new_user` (migration `003_user_profiles.sql`) — `SELECT id FROM vendors WHERE email =
  NEW.email` (exact, case-sensitive), inserts `user_profiles(id, 'vendor', matched_vendor_id)`,
  then `UPDATE vendors SET user_id = NEW.id`. Fires `AFTER INSERT ON auth.users` for every
  insert, admin invites included (spec 009 research).
- `src/lib/validations/application.ts:120` — the public form's `email` is `z.string().email()`
  with **no** `toLowerCase()`; migration 011's `submit_public_application` upserts `vendors` by
  that exact string (`ON CONFLICT (email)`), so `Jane@Example.com` and `jane@example.com` are two
  vendor rows. GoTrue lower-cases the address it stores, so a mixed-case application is never
  linked by the trigger — on a self sign-up today or on an invite tomorrow.
- `supabase/config.toml` — `[auth] enable_signup = true` (line 163), `[auth.email] enable_signup
  = true`, `enable_confirmations = false`, `site_url = "http://127.0.0.1:3000"`.
- Test precedents: `src/test/middleware.test.ts` mocks `@supabase/ssr` and `@/lib/env-public`
  (a module mock, because the env module validates at import); `src/test/login-page.test.tsx`
  mocks `next/navigation` and `@/lib/actions/auth`; `src/test/env.test.ts` runs under
  `// @vitest-environment node` with `vi.stubEnv` over a fixed `ENV_VARS` list and a dynamic
  import after `vi.resetModules()`; `src/test/team-actions.test.ts` builds a fake admin client
  and asserts `update({ role: 'organizer' })`; `src/test/invite-form.test.tsx` submits by
  placeholder and button name; `src/test/team-page.test.tsx` has a vendor fixture and asserts
  Pending/Resend only on the pending organizer; `src/test/security/invite-flow.test.ts` drives
  `inviteOrganizerCore` against the real stack with a `generateLink` sender and `serviceClient()`.
- `scripts/smoke-check.mjs` and `docs/runbooks/event-week-smoke.md` contain no sign-up step
  (grep for `signup`/`sign-up`/`sign up`: nothing), so invite-only mode does not affect the
  smoke check.
- `specs/007-production-readiness/contracts/env-contract.md` is the single variable table;
  `docs/DEV-ENVIRONMENT-SETUP.md` Part 8 mirrors the Vercel rows; `.env.example` documents the
  local shape; `CLAUDE.md` "Environment Variables" says `env-public.ts` owns "the
  `NEXT_PUBLIC_*` pair" (as does `docs/ARCHITECTURE.md:218`).
- `docs/handoffs/2026-09-27-uat-findings.md` is **untracked** in git although `spec.md` cites it.
- Spec 009 quickstart row V3 (2026-09-27) recorded the dev project's `site_url` as the git-`dev`
  preview origin alone, Redirect URLs = that origin + `uat-holigay-yyc`; rows D3–D5 set the
  three templates through the Management API (`GET`/`PATCH /v1/projects/kcokcufmzyckbodelqpb/
  config/auth` with the CLI login token). That is the method for every dev-project setting here.
- Spec 008 (`tasks.md` T008, research R10) replaces `VERCEL_ENV` with `APP_ENV` and keeps the
  `NEXT_PUBLIC_*` values as they are; a self-hosted staging host would set the new flag itself.

## Decisions

### R1. The flag: `NEXT_PUBLIC_INVITE_ONLY`, parsed by `env-public`, exact `'true'`

**Decision**: add `NEXT_PUBLIC_INVITE_ONLY: z.string().trim().optional()` to `publicEnvSchema`
and export `inviteOnly: boolean = parsed.data.NEXT_PUBLIC_INVITE_ONLY === 'true'`. Read as a
literal `process.env.NEXT_PUBLIC_INVITE_ONLY` member expression in the same object as the two
Supabase values. On only for the trimmed, case-sensitive string `true`; `TRUE`, `1`, `yes`,
`false`, empty and unset are all open mode (FR-001).

**Rationale**: D3. The module already runs everywhere the flag is needed (edge middleware,
server action, client login page) and already carries the inlining rule. Trimming forgives a
stray space pasted into the Vercel field, which would otherwise silently leave a deployment
open; anything else is refused so nobody can "almost" turn it on. Not a secret, so `NEXT_PUBLIC_`
is correct and lets the client-rendered Login page read it without a round-trip.

**Alternatives**: a server-only flag in `src/lib/env.ts` — would force the Login page to become
a server component or fetch the mode; deriving from `VERCEL_ENV === 'preview'` — rejected by D3
and SC-006 (flips every PR preview, the 007 `NODE_ENV` trap); a boolean coercion of `1`/`yes` —
more ways to be on means more ways to be misread.

### R2. `/signup` answers 404 from the middleware, before the session lookup

**Decision**: at the top of `middleware(request)`, before the Supabase client is built, when
`inviteOnly` and `pathname === '/signup' || pathname.startsWith('/signup/')`, return
`NextResponse.rewrite(new URL('/404', request.url))`. `/404` has no route, so the App Router
renders `src/app/not-found.tsx` with status 404 and never evaluates the signup page. `authRoutes`
keeps `/signup` so open mode is unchanged. Test asserts the `x-middleware-rewrite` header ends in
`/404` and that `getUser` was not called; a second case with the flag off asserts the existing
redirect for a signed-in user still fires.

**Rationale**: D4 and FR-003 ("before any sign-up content renders"). Doing it before `getUser()`
means a 404 costs no auth round-trip and cannot be reordered by the role logic. A rewrite keeps
the URL and reuses the standard not-found page (spec scenario 3).

**Alternatives**: `notFound()` inside the signup page — the page is `'use client'`, so it needs an
RSC wrapper and renders the client bundle first; a redirect to `/` — not "not found", and it
advertises that the page exists; deleting the page — production needs it.

### R3. `signUp` refuses before touching Supabase

**Decision**: in `signUp`, after `signupSchema.safeParse` succeeds and before `createClient()`,
`if (inviteOnly) return { success: false, error: 'Sign-up is by invitation on this site.' }`.
The unit test mocks `@/lib/supabase/server` and asserts `createClient` was never called.

**Rationale**: D4, FR-004. Validation first keeps the constitution's order (Zod before anything);
the refusal before the client keeps the promise that the authentication service is never
contacted. `AuthResponse` keeps its shape.

**Alternatives**: letting GoTrue answer — leaks its raw "Signups not allowed for this instance"
(the edge case the spec calls ugly); refusing before validation — a garbage payload would then
get the invitation message instead of the field error.

### R4. The Login page hides the sign-up block

**Decision**: `login/page.tsx` imports `inviteOnly` and renders the "Don't have an account? /
Sign up" `<div>` only when `!inviteOnly`. "Forgot password?" and the `reason` notices are
untouched. `signup/page.tsx` is not changed. Tests: a mutable mock of `@/lib/env-public` so one
file covers both modes (link present in open mode, absent in invite-only).

**Rationale**: D4, FR-002; the page is already a client component that can read the public
module. **Alternatives**: none worth the diff.

### R5. The invitation carries a role; names stay

**Decision**: `inviteSchema` becomes `z.object({ email: …, role: z.enum(['organizer',
'vendor']).default('organizer') })`; export `type InviteRole = 'organizer' | 'vendor'`. The action
signature becomes `inviteOrganizer(email: string, role?: string)` and parses `{ email, role }`:
`undefined` → `organizer` (the Team page's Resend button and any old caller), `'admin'` or any
other string → `Please choose Organizer or Vendor` before `createAdminClient()` (FR-008). The core
becomes `inviteOrganizerCore(admin, email, role: InviteRole, deps = {})`; step e writes `{ role }`;
step d still returns `{ resent: true }` without touching the stored role (FR-010). The function
names `inviteOrganizer` and `inviteOrganizerCore` are kept.

**Rationale**: D5, FR-007–FR-011. The default keeps every existing caller and test valid and makes
"organizer" the safe fallback. The enum, not `user_role`, is what makes Admin un-invitable at the
type level as well as at parse time. Keeping the names avoids touching spec 009's contracts, the
containment test's allow-list and eleven test files for no behaviour change; the JSDoc says the
action invites a team member with a chosen role.

**Alternatives**: rename to `inviteTeamMember` — pure churn now, fine as a later cleanup; a
separate `inviteVendor` action — duplicates the whole guard/lookup/send/role sequence; reading the
role from invite metadata in the trigger — the privilege-escalation hole 009 D5 rejected.

### R6. Invited vendors are not listed on the Team page (planning decision, 2026-09-27)

**Decision**: the Team page filter stays as it is. A vendor invited from the Team page is
confirmed by the toast and appears on the Admin page with the Vendor role (no Pending badge
there; documented). Re-sending to a pending vendor is done by submitting the address again in the
invite form, which returns `{ resent: true }` and leaves the role alone. `spec.md` US2 is amended
to say so (narrative, Independent Test, scenarios 2 and 5) and the decision is recorded in its
Clarifications block.

**Rationale**: the design record's "the Team list already shows a role badge per row, so vendors
invited here are visible" was wrong — the list is filtered. The maintainer chose to keep the Team
page a team page: on production every real vendor would otherwise appear there, or a
"pending-only" rule would make rows vanish on acceptance. The Admin page already answers "did the
account get created, with which role".

**Alternatives** (offered and declined): show vendors only while `invitePending`; show all
vendors.

### R7. The invite form gains a `Select`, stays hand-rolled

**Decision**: add the `Select` primitive (`label="Role"`, options Organizer / Vendor, value state
defaulting to `'organizer'`) beside the email input; heading "Invite team member"; copy "Send an
invitation email. Organizers review applications; vendors get a vendor dashboard."; placeholder
`name@example.com`; button "Send Invite" unchanged; submit `inviteOrganizer(trimmed, role)`; reset
the role to Organizer after success. The form stays the `useState` form spec 009 shipped.

**Rationale**: FR-007; constitution III (reuse `src/components/ui/`, 44 px, `useId`, tokens). The
RHF conversion is a pre-existing deviation the constitution lists for `src/components/forms/`;
this form lives in `src/components/team/` and 009 kept it hand-rolled — changing that here is
scope creep for a two-option select.

**Alternatives**: radio buttons — two options, but a select matches the Admin page's role control;
converting to RHF — separate cleanup.

### R8. FR-012 is proven with a lower-case address; the casing gap is recorded, not fixed

**Decision**: extend `src/test/security/invite-flow.test.ts`: (1) insert a `vendors` row with a
lower-case throwaway email through the service client, call `inviteOrganizerCore(service, email,
'vendor', { sendInvite })`, assert `users_with_roles.role = 'vendor'`, `invite_pending = true`,
`user_profiles.vendor_id` = the row's id and `vendors.user_id` = the new user's id; (2) re-send and
assert the role is still `vendor`; (3) invite the same address as `'organizer'` while pending and
assert `vendor` wins; (4) insert a **mixed-case** vendor row, invite the lower-cased address as a
vendor, and assert what actually happens (the row is **not** linked; `vendor_id` null) so the
behaviour is on record. The gap becomes item 11 of the UAT findings handoff, its own follow-up
(candidates: `.trim().toLowerCase()` on the public form's email, or a case-insensitive match in
`handle_new_user` via migration `014`).

**Rationale**: the maintainer's decision during planning: no production-affecting change rides
in a spec whose promise is "production unchanged", and the gap exists today for self sign-up. The
spec's edge case ("addresses are trimmed and lower-cased before use") describes the invite
address, not the vendor row; the test makes the real boundary explicit.

**Alternatives** (offered and declined for this spec): lower-case the public form email; migration
`014` making the trigger match `lower(email)`.

### R9. Enforcement evidence and the setting names

**Decision**: FR-013's evidence is one anonymous request to the dev project:

```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"probe+010@example.com","password":"probe-pass-010"}'
# expected with sign-up off: HTTP 422, {"code":422,"error_code":"signup_disabled","msg":"Signups not allowed for this instance"}
# expected with sign-up on : HTTP 200 and a user object — which is the failure case
```

Settings, dashboard name → Management API field (`GET`/`PATCH /v1/projects/<ref>/config/auth`,
the 009 D3 method, CLI login token, default-mode session): "Allow new users to sign up" →
`disable_signup` (**`true` means off**); Site URL → `site_url`; Redirect URLs → `uri_allow_list`
(comma-separated); "Confirm email" → `mailer_autoconfirm` (**`true` means confirmations off**).
Dev ref `kcokcufmzyckbodelqpb`. The local stack's `config.toml` equivalents are `[auth]
enable_signup` and `[auth.email] enable_confirmations`.

**Rationale**: FR-006, FR-013, FR-016. A direct request is the only thing that proves the
service, not the app, refuses. The inverted field names are the kind of detail that gets a
setting flipped the wrong way, so they are spelled out here and in `quickstart.md`.

### R10. The flag is baked at build time; set it before the code merges

**Decision**: `NEXT_PUBLIC_INVITE_ONLY=true` is added on Vercel with **Preview** scope and no
branch filter **before** the US1 PR merges to `dev`; the `dev` preview is then redeployed. This
branch's own PR preview picks the value up on its next build, which is how the flag is checked
before merge (quickstart row D3/D4).

**Rationale**: `NEXT_PUBLIC_*` values are inlined into the bundle at build; changing the variable
without a redeploy changes nothing. Setting it first means the first `dev` build after merge is
already invite-only (spec Assumptions, rollout order). Every PR preview shares the dev project,
so every preview being invite-only is consistent (spec edge case "Other pull-request previews").

### R11. Site URL moves to the `uat-` hostname; the allow-list keeps both

**Decision**: dev `site_url` → `https://uat-holigay-yyc.vercel.app`; `uri_allow_list` keeps
`https://holigay-yyc-git-dev-owen-roses-projects.vercel.app` and the `uat-` origin. Done before
the first invitation (FR-014). Spec 009 quickstart row V3's recorded value is superseded; a
one-line note is added there at close.

**Rationale**: D6; the three templates link through `{{ .SiteURL }}/auth/confirm…`, so every
emailed link (invite, recovery, confirmation) lands on the Site URL host (US3 scenarios 1–2).
Keeping the old origin in the allow-list keeps links opened there working (scenario 3).

### R12. Tests never flip the local sign-up toggle

**Decision**: `supabase/config.toml` stays `enable_signup = true`. Unit tests cover the app's
behaviour under the flag by mocking `@/lib/env-public` (middleware, login page, `signUp`) or by
`vi.stubEnv` + dynamic import in `src/test/env.test.ts` (which gains `NEXT_PUBLIC_INVITE_ONLY` in
its `ENV_VARS` list so no case inherits a shell value). The security suite proves the role and
trigger behaviour (R8), not the toggle.

**Rationale**: design S6; the toggle is project configuration with no code path, and flipping it
locally would break `createAuthedVendor` and every suite that creates users. FR-006 is proven
against the dev project by hand (R9).

### R13. Smoke check and runbook are unaffected

**Decision**: no change to `scripts/smoke-check.mjs` or `docs/runbooks/event-week-smoke.md`.
**Rationale**: neither exercises sign-up (verified facts). The event-week click-through runs on
production, where the flag is unset anyway.

### R14. Spec 008 carry-over

**Decision**: one line in 008's env task at close: `NEXT_PUBLIC_INVITE_ONLY` is platform-neutral;
the self-hosted staging host sets it to `true`, production leaves it unset; nothing in `APP_ENV`
implies it. **Rationale**: SC-006 must survive the platform move.
