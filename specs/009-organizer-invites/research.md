# Research: Organizer Invites, Link Consumption and Password Reset

**Feature**: 009-organizer-invites | **Date**: 2026-09-26

No `NEEDS CLARIFICATION` markers existed in the Technical Context: decisions D1–D6 were made
in the 2026-09-26 brainstorm and are recorded in the spec's Clarifications block. This file
records how each is realised, the facts checked against the working tree and the upstream
sources on 2026-09-26, and the four carried-forward assumptions with their resolution.

## Verified facts (2026-09-26)

- `src/lib/actions/team.ts` — the Epic 4 stub: `requireRole('admin')`, regex email check,
  then a fixed error. `src/components/team/invite-form.tsx` is a hand-rolled form (not
  react-hook-form) that toasts `Invitation sent to <email>` on success.
- `src/app/dashboard/team/page.tsx` — client component; `getUsers()` from
  `src/lib/actions/admin.ts`; `UserWithRole = { id, email, role, createdAt, roleUpdatedAt }`;
  filters to organizer/admin; three summary tiles computed from that filtered list.
- `users_with_roles` (migration 006) — owner-executed view over `auth.users ⟕ user_profiles`,
  `GRANT SELECT … TO authenticated`; no `security_invoker`.
- `src/middleware.ts` — `protectedRoutes = ['/dashboard', '/vendor-dashboard']`,
  `authRoutes = ['/login', '/signup']`. Anything else (so `/auth/confirm`, `/set-password`,
  `/forgot-password`) passes through after the session refresh; no redirect can fire on them.
- `src/lib/supabase/server.ts` — `createServerClient` from `@supabase/ssr` with
  `cookies()` `getAll`/`setAll`, the helper Supabase's own `/auth/confirm` example uses.
- `src/lib/env.ts` — Zod schema parsed at import; production strictness keys on
  `VERCEL_ENV === 'production'`; `SUPABASE_SERVICE_ROLE_KEY` is **not** parsed today
  (`specs/007-production-readiness/contracts/env-contract.md` row: "nothing yet").
- `@supabase/auth-js` 2.86.2 (`node_modules/@supabase/auth-js/dist/module/lib/types.d.ts`):
  `verifyOtp({ token_hash: string; type: EmailOtpType })`,
  `EmailOtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email'`;
  `auth.admin.inviteUserByEmail(email, { data?, redirectTo? })`;
  `auth.admin.generateLink({ type: 'invite' | 'recovery', email })` →
  `data.properties.hashed_token` and `data.user`.
- GoTrue `internal/api/invite.go` on `supabase/auth` master, fetched 2026-09-26: when the
  email already exists, `if isConfirmed { return NewUnprocessableEntityError(ErrorCodeEmailExists,
  DuplicateEmailMsg) }`; otherwise it falls through to `sendInvite` (a re-send).
- `handle_new_user` (migration 003) fires `AFTER INSERT ON auth.users` for every insert,
  admin invites included, and writes `user_profiles(id, role='vendor', vendor_id)` in the same
  transaction, so a plain `UPDATE user_profiles SET role='organizer'` right after the invite
  call always finds the row.
- Local `supabase/config.toml`: `minimum_password_length = 6`, `enable_confirmations = false`,
  `site_url = "http://127.0.0.1:3000"`, `[auth.rate_limit] email_sent = 2` per hour.
- `.github/workflows/ci.yml` starts the security stack with `-x studio,mailpit,…`, so in CI
  **no mail can be sent**: `inviteUserByEmail` and `resetPasswordForEmail` would fail there.
- `src/test/security/harness.ts` exposes `anonClient()`, `serviceClient()`,
  `createAuthedUser()` (admin `createUser` + promote + `signInWithPassword`), self-skips when
  the stack is down, refuses non-local URLs.
- Test precedents: `src/test/keepalive-route.test.ts` (Route Handler under
  `@vitest-environment node`, `vi.stubEnv`, import after stubbing);
  `src/test/middleware.test.ts` (mocks `@supabase/ssr` and `@/lib/env-public`);
  `src/test/auth-roles.test.ts` (mocked server client, AAA).
- UI primitives: `Badge` (`variant: 'warning' | …`), `Button` (44 px minimum, `isLoading`),
  `Input`, `Spinner`. The existing login/signup forms use hard-coded ids and pre-date the
  `useId()` rule; new forms follow the constitution.
- 007 quickstart T013b row (2026-09-23): the dev project's Site URL was corrected to the
  `dev`-branch preview origin alone; custom SMTP via Resend is live on dev and prod with
  sender `noreply@holigayeventsyyc.ca` / "Holigay Events YYC".

---

## R1. Link consumption: server-side `verifyOtp` in a Route Handler

**Decision**: `src/app/auth/confirm/route.ts` exports `GET`. It parses `token_hash`, `type`
and `next` from the query string with Zod, calls
`(await createClient()).auth.verifyOtp({ token_hash, type })`, and returns
`NextResponse.redirect(new URL(destination, request.url))`. On any failure it redirects to
`/login?reason=link-invalid` without touching GoTrue when the input is malformed.

**Rationale**: this is the pattern Supabase documents for SSR apps; it works identically for
console-sent and app-sent links because the email template, not the caller, decides where
the link lands. PKCE code exchange is unusable for invites (the verifier cookie would be in
the admin's browser) and client-side hash pickup puts sign-in logic on the public landing
page (D4). The server client's `setAll` is the same code path `signInWithPassword` already
uses from server actions, and Next.js applies `cookies().set()` calls made in a Route Handler
to the returned response, redirects included.

**Carried-forward item 4** ("the session helper writes cookies on token verification inside
a request handler"): settled by the above and **proven by US1 scenario 2 on the dev preview**
(the invitee lands on `/set-password` signed in). Fallback if the cookies are ever missing on
the redirect: return via `redirect()` from `next/navigation` — the exact form of the official
example — at the cost of the handler test asserting a thrown `NEXT_REDIRECT` instead of a
`Location` header.

**Alternatives considered**: a page under `(auth)` with a Server Component doing the
verification (rejected: renders the card layout around a redirect and makes the URL a page
that could be prefetched); an `/auth/callback` PKCE route in addition (rejected: nothing in
scope uses PKCE — the templates emit token hashes).

## R2. Accepted link kinds

**Decision**: `type` must be one of `invite | recovery | signup | email | email_change`
(a Zod enum, a strict subset of `EmailOtpType`). Anything else — including `magiclink` and
an absent value — is an unknown kind → `/login?reason=link-invalid`. Kind defaults for the
destination: `invite`, `recovery` → `/set-password`; `signup`, `email`, `email_change` →
`/vendor-dashboard`.

**Rationale**: FR-009 names four kinds; GoTrue spells "signup confirmation" as either
`signup` (what our template uses) or the generic `email` (what Supabase's newer docs put in
the Confirm-signup template), so both are accepted. Magic-link sign-in is out of scope and
its template stays at the default, so it never reaches this route.

## R3. Destination allow-list

**Decision**: `next` is accepted only if it is **string-equal** to one of `/set-password`,
`/dashboard`, `/vendor-dashboard`. Otherwise the kind's default applies. No prefix matching,
no URL parsing.

**Rationale**: exact equality closes every open-redirect shape at once — `//evil.example`,
`https://…`, `/dashboard/../x`, `/dashboard%2F…` all fall back. The three values are the only
destinations any template needs (FR-012).

**Alternatives considered**: `new URL(next, origin).origin === origin` (rejected: weaker,
and still lets a link deep-link anywhere in the app); allowing `/dashboard/*` prefixes
(rejected: no template needs it).

## R4. Re-inviting an unconfirmed user re-sends

**Decision**: the action's branch order is: refuse when the view says the account is not
pending (FR-002); otherwise call `inviteUserByEmail`, which GoTrue treats as a re-send for
an existing unconfirmed user; `resent` is true when the address already existed. A stray
`email_exists` error from GoTrue (a confirmed user the pre-check somehow missed) maps to the
FR-002 message as a fallback.

**Rationale / evidence**: `internal/api/invite.go` (verified fact above). **Carried-forward
item 1 holds.** The security suite still asserts it against the real local GoTrue
(`invite-flow.test.ts`: second `generateLink({ type: 'invite' })` for an unconfirmed address
succeeds; for a confirmed address it fails with `email_exists`).

## R5. "Pending" is *unconfirmed and never signed in* — a deliberate refinement of design §4.8, carried back into spec FR-023/FR-029 on 2026-09-26

**Decision**: migration `013` adds `invite_pending boolean` to `users_with_roles`, defined as
`(u.email_confirmed_at IS NULL AND u.last_sign_in_at IS NULL)`. `UserWithRole` gains
`invitePending: boolean`. The Team page shows Pending + Resend exactly when it is true; the
invite action refuses exactly when it is false.

**Rationale**: the design doc proposed `has_signed_in = last_sign_in_at IS NOT NULL`. But
GoTrue's re-send rule keys on **confirmation**, not sign-in (R4). An account created in the
console with "Auto Confirm User" that has never signed in — the prod placeholder organizer
recorded in 007 quickstart T015 is exactly one — would show Pending under the design's column
while GoTrue refused every Resend with `email_exists`. Keying on the same condition GoTrue
uses makes Pending ⇔ "Resend will work". Every pending row has by definition never signed in,
and FR-023 / FR-029 now use the same definition; the abandoned-set-password case (spec edge
case, design S7) still clears the badge because `verifyOtp` sets `email_confirmed_at` and
`last_sign_in_at`.

**Alternatives considered**: keep `has_signed_in` and rely on the error mapping (rejected:
a Pending row whose button always fails is a UI lie); expose both columns (rejected: two
booleans for one decision).

## R6. The service-role key

**Decision**: `SUPABASE_SERVICE_ROLE_KEY` joins the `src/lib/env.ts` schema as an
`optionalEnv` field, exported as `supabaseServiceRoleKey: string | undefined`, and added to
the `superRefine` block as **required when `VERCEL_ENV === 'production'`** — the same rule as
`RESEND_API_KEY`. Never `NEXT_PUBLIC_`. On Vercel it is set for **Preview** (the dev project's
key — previews are the acceptance-testing app and already hold the dev anon key) and
**Production** (the prod project's key). Either the legacy `service_role` JWT or a newer
`sb_secret_…` key from the project's API settings works with `auth.admin.*`.

**Rationale**: FR-007 wants a clear "not configured" answer outside production and FR-026
wants production to refuse to run without it; the env module already implements exactly that
split for the email keys. Spec 008's T008 later re-keys the same rule on `APP_ENV` (R22).

## R7. Containment test

**Decision**: `src/test/admin-client-containment.test.ts` walks `src/` synchronously with
`fs.readdirSync(..., { recursive: true })`, reads every `.ts`/`.tsx`, and asserts that the set
of files whose text contains `lib/supabase/admin` is exactly
`{ src/lib/supabase/admin.ts, src/lib/actions/team.ts, src/test/admin-client-containment.test.ts }`
(the test names the string itself, so it is listed). It runs in the `unit` project on every
PR (FR-026, SC-005).

**Rationale**: a grep in CI is the cheapest honest proof and matches the design's
"asserted by a test that greps imports". An ESLint `no-restricted-imports` rule was
considered and rejected: it needs per-file overrides and a config change the reviewers would
have to remember to keep.

## R8. A sender seam so the real-stack suite can run without a mail service

**Decision**: `team.ts` exports `inviteOrganizerCore(admin, email, deps)` alongside the
server action. `deps.sendInvite(email)` defaults to
`admin.auth.admin.inviteUserByEmail(email)`; the security suite injects a sender built on
`admin.auth.admin.generateLink({ type: 'invite', email })`, which creates or re-invites the
user and returns `hashed_token` **without sending mail**. The suite then proves the rest of
the path for real: an **anon** client calls `verifyOtp({ token_hash, type: 'invite' })` and
receives a session; `user_profiles.role` is `organizer`; `invite_pending` flips to false; a
second `verifyOtp` with the same hash fails.

**Rationale**: CI starts the local stack without `mailpit` (verified fact), so
`inviteUserByEmail` would answer "Error sending invite email" there. Adding mailpit back
lengthens the boot and the local `email_sent = 2` per-hour limit makes a mail-sending suite
flaky. The seam is one optional parameter and keeps the Next-free core callable from Node,
the same way the RPC suites call the database directly. **Honest limit**: the real
`inviteUserByEmail` call is exercised only by the dev walkthrough (US1 scenario 1) and by a
developer running the full local stack (mail visible at `http://127.0.0.1:54324`).

## R9. Route Handler unit tests

**Decision**: `src/test/auth-confirm-route.test.ts` under `@vitest-environment node`; mock
`@/lib/supabase/server` (`createClient` → `{ auth: { verifyOtp } }`) and `@/lib/env-public`;
build `new NextRequest('http://localhost:3000/auth/confirm?…')`, call `GET`, assert `status`
307 and `headers.get('location')` for every row of `contracts/auth-confirm-route.md`, and
assert `verifyOtp` was **not** called for malformed input.

## R10. Guards for the password actions

`setPassword` opens with `requireRole('vendor')`: the minimum-role check admits every signed-in
user (the `handle_new_user` trigger guarantees a profile row) and returns the role, so no second
lookup is needed for the redirect (Constitution I.2). `requestPasswordReset` has no guard — see
`plan.md` Complexity Tracking.

## R11. Neutral reset response, including under rate limiting

**Decision**: `requestPasswordReset` → `safeParse(forgotPasswordSchema)` →
`supabase.auth.resetPasswordForEmail(email)` with **no** `redirectTo` (the template owns the
link) → `{ success: true, error: null, data: null }` regardless of the GoTrue result. A GoTrue
error is logged as `console.error('[requestPasswordReset] provider error', error.code ?? error.name)`
— never the address. Only a Zod failure returns `success: false` (FR-021).

## R12. Login page notices

**Decision**: `login/page.tsx` (already a client component reading `useSearchParams`) maps
`reason` → notice: `link-invalid` → "That link has expired or was already used. Ask an admin
to send a new invitation, or use Forgot password."; `session-required` → "Please sign in
first." Unknown values render nothing. A "Forgot password?" link sits under the form next to
the existing "Sign up" link.

## R13. Gating `/set-password`

**Decision**: the RSC page calls `(await createClient()).auth.getUser()`; no user →
`redirect('/login?reason=session-required')`. Middleware is untouched: the two new pages are
deliberately **not** added to `authRoutes` (FR-019), and `src/test/middleware.test.ts` gains
cases proving `/auth/confirm`, `/set-password` and `/forgot-password` pass through for both a
signed-in and a signed-out visitor.

## R14. Forms

**Decision**: `set-password-form.tsx` and `forgot-password-form.tsx` live in
`src/components/auth/` beside the login/signup forms and follow the constitution strictly
(`useId()`-generated ids, `aria-invalid`, `aria-describedby`, `role="alert"`, the `Button`
primitive). `InviteForm` keeps its structure; the only change is the toast branching on
`result.data.resent`. Rewriting it on react-hook-form is out of scope (no behaviour change
was asked for; the server-side Zod schema is what FR-008 requires).

## R15. Signup copy

**Decision**: the success message becomes "Account created! Check your email for a
confirmation link — clicking it will sign you in." with no "sign in" link. Nothing else on
the page changes, so on dev (confirmations off) only the copy changes (US4 scenario 3).

## R16. Email templates

**Decision**: each hosted project's Invite, Reset-password and Confirm-signup templates get
the subject, body and link in `contracts/email-templates.md`. Links use
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<kind>&next=<default>`, never
`{{ .RedirectTo }}`, so the Redirect URLs allow-list needs no change. The sender stays the
007 branded SMTP identity. Magic Link and Change Email templates stay at the default.

## R17. Minimum password length (carried-forward item 2)

**Decision**: a `[manual]` verification row per project: Authentication → Sign In /
Providers → Email → "Minimum password length". Local is 6. If either project is stricter,
raise `min(6)` in `loginSchema`, `signupSchema` and `setPasswordSchema` together in the
set-password task. Nothing else depends on the answer, so it is not a blocker.

## R18. Dev Site URL (carried-forward item 3)

**Decision**: re-read as the first step of the dev template task and recorded in its
evidence row. It was fixed on 2026-09-23 (007 T013b) and nothing has changed it since.

## R19. Cache invalidation

**Decision**: `inviteOrganizer` ends with `revalidatePath('/dashboard/team')` and
`revalidatePath('/dashboard/admin')`. The Team page also re-fetches client-side after a
successful invite (existing `onInvited` callback), which is what makes the new row appear
"at once" (US1 scenario 1).

## R20. A pre-existing exposure, noted and left alone

`users_with_roles` is readable by **any** `authenticated` JWT, so a signed-in vendor can list
every account's email through PostgREST with the anon key. This predates 009 (migration
006), the admin check lives in the server action only, and this spec does not widen it — the
new column is a boolean. Out of scope here; the docs task adds it to `docs/ROADMAP.md` Tier 3
as a candidate (`security_invoker` + an admin-only policy, or an admin-only RPC).

## R21. Migration mechanics

`CREATE OR REPLACE VIEW` may only **append** columns, so `013` re-states the 006 select with
`invite_pending` last. Apply locally with `supabase db reset`, regenerate with
`npm run db:types:local` (the generated `Row` gains `invite_pending: boolean | null`), then
`supabase db push` to dev and prod in the rollout tasks — the same procedure as `012`.

## R22. Interaction with spec 008

009 ships on Vercel + hosted Supabase before 008's execution starts. Two hand-offs are
recorded rather than solved here: (a) 008 T008 must carry `SUPABASE_SERVICE_ROLE_KEY` into
the `APP_ENV` strictness rule and 008's `deploy/.env` must mint a service-role JWT from the
stack's JWT secret; (b) 008 T013 must point `GOTRUE_MAILER_URLPATHS_{INVITE,CONFIRMATION,
RECOVERY,EMAIL_CHANGE}` at the app origin's `/auth/confirm` (not `/auth/v1/verify`) and
carry the three templates via `GOTRUE_MAILER_TEMPLATES_*`. The docs task adds this note to
`specs/008-self-hosted-infrastructure/tasks.md` under T013.
