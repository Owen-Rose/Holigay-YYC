# Organizer invites, invite-link consumption and password reset — design

**Date**: 2026-09-26
**Status**: Design approved in brainstorm; not yet a Speckit spec. Intended next spec number: 009.
**Supersedes**: the Epic 4 backend stub (`src/lib/actions/team.ts` `inviteOrganizer`, tasks 4.2.x in `docs/archive/TASKS.md`).
**Related**: `specs/007-production-readiness/quickstart.md` "Nothing exchanges the confirmation link's code" (the rehearsal finding this closes); `docs/ROADMAP.md` Tier 4 "Epic 4 backend"; `specs/008-self-hosted-infrastructure/spec.md` out-of-scope list (invites and password reset are both named there as separate specs).

## 1. Problem

Three things are broken or missing, and they share one root cause: the app has no route that turns an emailed auth link into a signed-in session.

1. **Invite links go nowhere.** The Team page has a finished "Invite Organizer" form, but its server action is a stub that returns an error. Sending an invite from the Supabase dashboard instead produces a link that lands the invitee on the public landing page, signed out, with the tokens sitting unread in the URL fragment and no way to set a password. Seen on dev 2026-09-23 during the 007 rehearsal.
2. **Signup confirmation links do the same.** On prod "Confirm email" is on; the link confirms the address but leaves the visitor signed out. The signup page papers over it by telling them to sign in.
3. **No password reset.** A user who forgets their password has no recourse in the app.

A fourth, quieter problem: even a working dashboard invite creates the user as a **vendor** (the `handle_new_user` trigger hard-codes it), so every organizer onboarding ends with the admin running SQL by hand. Under spec 008 the Supabase dashboard becomes an optional, localhost-only container, so "just use the dashboard" gets worse over time, not better.

## 2. Decisions made in the brainstorm

| # | Decision | Chosen | Why |
|---|---|---|---|
| D1 | Scope | Auth callback route + set-password page + in-app Send Invite + forgot-password | The callback and set-password page are unavoidable for any invite path. The in-app send is a thin layer over them. Forgot-password reuses both and costs one email trigger and one link. |
| D2 | Invited email already has an account | Refuse if the user has ever signed in ("change their role on the Admin page"); **resend** if they were invited and never signed in; refuse for existing organizers/admins with the same message | Resending a lost invite is the one case UAT will hit. Role changes already have a home on `/dashboard/admin`. |
| D3 | Pending invitees on the Team page | Shown in the list with a **Pending** badge and a **Resend** button | Invited users exist in `auth.users` immediately, so without this they look like full members. One view column, badge component already exists. |
| D4 | How a link becomes a session | **Server-side token verification**: email templates point at `/auth/confirm?token_hash=…&type=…&next=…`; the route calls `verifyOtp` with the server client, which writes session cookies, then redirects | Works identically for app-sent invites, dashboard-sent invites, password resets and signup confirmations. PKCE code exchange is ruled out for invites (the verifier cookie lives in the admin's browser, not the invitee's). Client-side hash pickup puts auth logic on the public landing page and is the flow Supabase steers SSR apps away from. |
| D5 | Role assignment for invitees | The invite action sets `user_profiles.role = 'organizer'` with the admin client immediately after the invite call returns the new user | The trigger has already created the profile row (same transaction as the `auth.users` insert), so a plain update is safe. Reading the role from signup metadata inside the trigger is rejected: `signUp` lets any client set metadata, so it would be a privilege-escalation hole. |
| D6 | Service-role client | New `src/lib/supabase/admin.ts`, server-only, imported by `team.ts` only | As ROADMAP Tier 4 prescribes. Containment is asserted by a test that greps imports. |

## 3. User scenarios

**S1 — Admin invites a new organizer.** Admin on `/dashboard/team` enters an email and clicks Send Invite. Toast confirms. The row appears in the team list at once with a Pending badge and role Organizer. The invitee receives a branded email (existing Resend SMTP) with a link. Clicking it lands them, already signed in, on a Set your password page. After setting it they are on `/dashboard` as an organizer. No SQL involved.

**S2 — Admin resends a lost invite.** The invitee never clicked. Admin clicks Resend on the Pending row (or types the address into the form again). A fresh email goes out; toast says "Invitation re-sent". Pending badge stays until they sign in.

**S3 — Admin invites an address that already belongs to someone who has signed in.** Action refuses: "That email already has an account. Change their role on the Admin page instead." Nothing is sent, nothing changes.

**S4 — Invitee clicks an expired or already-used link.** `/auth/confirm` fails verification and redirects to `/login?reason=link-invalid`. Login page shows: "That link has expired or was already used. Ask an admin to send a new invitation, or use Forgot password." No session is created.

**S5 — Any user forgets their password.** Login page has a Forgot password link → `/forgot-password` asks for an email → always shows "If that address has an account, a reset link is on its way" (no account enumeration). The email link goes through `/auth/confirm` with type `recovery` → Set your password page → redirected to the dashboard for their role.

**S6 — Vendor signs up on prod.** Confirm-email link now also goes through `/auth/confirm` (type `signup`) and lands them signed in on `/vendor-dashboard`. Closes the 007 backlog item. On dev, where confirmations are off, nothing changes.

**S7 — Invitee clicks the link but abandons the Set password page.** They are now confirmed and have signed in once, so the Pending badge clears and Resend is refused (S3). They recover via Forgot password (S5). Acceptable; documented so it is not mistaken for a bug.

## 4. Components

### 4.1 Admin (service-role) client — `src/lib/supabase/admin.ts`
- `createAdminClient()` returns `createClient<Database>(supabaseUrl, supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })`.
- Throws at import if `typeof window !== 'undefined'` (same guard as `src/lib/env.ts`).
- Throws a clear error at call time if the key is unset, so the invite action fails closed with "Invites are not configured on this deployment" rather than a stack trace.
- **Containment test**: a unit test walks `src/` and asserts the only importer is `src/lib/actions/team.ts`.

### 4.2 Env contract — `src/lib/env.ts`
- Add `SUPABASE_SERVICE_ROLE_KEY` → exported `supabaseServiceRoleKey: string | undefined`.
- Optional in local and preview; **required when `isProduction`** (same rule as `RESEND_API_KEY`). Update `specs/007-production-readiness/contracts/env-contract.md` and CLAUDE.md's env section.
- Never `NEXT_PUBLIC_`. Never in `.env.example` with a real value.

### 4.3 Auth confirm route — `src/app/auth/confirm/route.ts`
- `GET` with `token_hash`, `type`, `next`.
- `type` must be one of `invite | recovery | signup | email` (Zod enum); anything else → `/login?reason=link-invalid`.
- `next` is validated against an **allow-list** of internal paths (`/set-password`, `/dashboard`, `/vendor-dashboard`). Anything else, including `//evil`, protocol-relative or absolute URLs, falls back to a type-based default: `invite`/`recovery` → `/set-password`; `signup`/`email` → `/vendor-dashboard`.
- Calls `supabase.auth.verifyOtp({ token_hash, type })` with the cookie-backed server client from `src/lib/supabase/server.ts`. On success the SSR helper has written the session cookies; redirect to `next`. On error → `/login?reason=link-invalid`. Never echoes the token in logs.
- Not matched by middleware protection (it is neither `/dashboard*` nor `/vendor-dashboard*`), and it is not an auth route, so no redirect fires before the cookies exist.

### 4.4 Set-password page — `src/app/(auth)/set-password/page.tsx` + `src/components/auth/set-password-form.tsx`
- Requires a session: the page is an RSC that calls `getUser()`; no user → redirect `/login?reason=session-required`.
- Form: password + confirm, `react-hook-form` + Zod (`setPasswordSchema` in `src/lib/validations/auth.ts`, reusing the existing 6-char minimum and the match refinement). Constitution III: `useId`, `aria-invalid`, `aria-describedby`, `role="alert"`, 44 px targets, tokens only.
- Server action `setPassword(data)` in `src/lib/actions/auth.ts`: `safeParse` → `supabase.auth.updateUser({ password })` → returns `{ success, error, data: { redirectTo } }` where `redirectTo` is `/dashboard` for organizer/admin, `/vendor-dashboard` otherwise (same lookup `signIn` already does). `requireRole` is not the right guard here (any role may set its own password); the action instead requires an authenticated user and returns `Not authenticated` otherwise. Record this deviation in the plan's constitution check.
- Middleware: `/set-password` and `/forgot-password` are **not** added to `authRoutes`, so a signed-in user is not bounced away from them.

### 4.5 Forgot-password page — `src/app/(auth)/forgot-password/page.tsx` + form
- Email field only. Server action `requestPasswordReset(email)`: `safeParse` → `supabase.auth.resetPasswordForEmail(email)` (no `redirectTo`; the template controls the link) → **always** `{ success: true }` unless the input is malformed. Supabase's own rate limits apply; the action surfaces a rate-limit error as the same neutral success to avoid enumeration, but logs it server-side.
- Login page gains a "Forgot password?" link under the form and renders the `reason` messages from S4 and 4.4.

### 4.6 Invite action — `src/lib/actions/team.ts`
```
inviteOrganizer(email):
  requireRole('admin')                      → else { success:false, error }
  safeParse(inviteSchema)                   → else validation error
  admin = createAdminClient()               → else "Invites are not configured…"
  existing = admin.from('users_with_roles').select(...).ilike('email', email).maybeSingle()
  if existing && existing.has_signed_in     → refuse (S3 message)
  admin.auth.admin.inviteUserByEmail(email) → GoTrue: new user, or resend for an unconfirmed user;
                                              maps "already been registered" to the S3 message as a fallback
  if new user: admin.from('user_profiles').update({ role:'organizer' }).eq('id', user.id)
      on failure: { success:false, error:"Invitation sent, but the role could not be set. Set it on the Admin page." }
  return { success:true, error:null, data:{ resent: boolean } }
```
- `inviteSchema` lives in `src/lib/validations/team.ts` (email, trimmed, lowercased).
- `InviteResponse` gains `data: { resent: boolean } | null` so the client can toast "sent" vs "re-sent".
- The action does **not** pass `redirectTo`; the Invite email template owns the link (D4).

### 4.7 Team page — `src/app/dashboard/team/page.tsx`
- `UserWithRole` gains `hasSignedIn: boolean` from the view.
- Rows with `hasSignedIn === false` show a **Pending** badge (existing `Badge` primitive / `RoleBadge` styling) and a **Resend** button that calls `inviteOrganizer(email)` and toasts.
- Stats tiles unchanged.

### 4.8 Migration `013_users_with_roles_has_signed_in.sql`
```sql
CREATE OR REPLACE VIEW public.users_with_roles AS
SELECT u.id, u.email::text AS email,
       COALESCE(p.role, 'vendor'::user_role) AS role,
       u.created_at, p.updated_at AS role_updated_at,
       (u.last_sign_in_at IS NOT NULL) AS has_signed_in
FROM auth.users u LEFT JOIN public.user_profiles p ON p.id = u.id;
```
- Additive column; existing grant to `authenticated` stands (admin gating stays in the server action, as today). Regenerate `src/types/database.ts` for all three targets.

## 5. Manual configuration (per Supabase project: dev, then prod)

These are `[manual]` tasks with evidence rows in the spec's quickstart, as 007 did.

| Item | Where | Value |
|---|---|---|
| Service-role key | Vercel env, **Preview and Production** (the dev preview is the UAT app) | `SUPABASE_SERVICE_ROLE_KEY` from the matching project |
| Invite template | Auth → Email Templates | link = `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password` |
| Reset Password template | same | `…&type=recovery&next=/set-password` |
| Confirm signup template | same | `…&type=signup&next=/vendor-dashboard` |
| Site URL | Auth → URL Configuration | already fixed 2026-09-23 on dev; re-verify on prod |
| Redirect allow-list | same | no change needed: templates use `{{ .SiteURL }}`, not `{{ .RedirectTo }}` |

Template copy should keep the branded sender already configured (T013b) and say who the app is; wording is part of the spec, not left to the dashboard default.

**Spec 008 follow-up**: on the self-hosted stack the same three templates become GoTrue `GOTRUE_MAILER_TEMPLATES_*` / `GOTRUE_MAILER_URLPATHS_*` settings in Compose, and the service-role JWT is minted from the stack's JWT secret. Record this as a note in 008's task list; do not block 009 on it.

## 6. Security notes

- The service-role key bypasses RLS. It is used for exactly three calls (view lookup, invite, role update), all behind `requireRole('admin')`, in one file, with a containment test. Nothing about the public `/apply` posture from spec 006 changes.
- `/auth/confirm` is unauthenticated by nature. It performs no writes of its own; `verifyOtp` is the only side effect and it is one-time and expiring. The `next` allow-list closes the open-redirect vector.
- Forgot-password never reveals whether an address exists.
- Rate limiting: rely on Supabase's built-in email rate limits for invite and recovery; the admin action is already gated to admins.
- No token, hash or email body is logged.

## 7. Testing

Unit (jsdom, existing `unit` project):
- `inviteOrganizer`: admin happy path (new user → role set, `resent: false`); resend path (`resent: true`, no role update); refuse when `has_signed_in`; non-admin refused; invalid email refused; admin client unconfigured → clear error. Mocked admin client, AAA, as `src/test/auth-roles.test.ts`.
- `setPassword` and `requestPasswordReset`: happy path + validation/auth failure each.
- `/auth/confirm` handler: valid type + allow-listed `next` → redirect to `next`; bad `next` → type default; bad type → `link-invalid`; `verifyOtp` error → `link-invalid`.
- Set-password and forgot-password forms: render, validation error display, successful submit (RTL, user-event).
- Admin-client containment: only `team.ts` imports it.

Security (node, real local stack, existing `security` project, self-skipping):
- Invite end to end without email: `admin.auth.admin.generateLink({ type:'invite', email })` returns `hashed_token`; an **anon** client calls `verifyOtp({ token_hash, type:'invite' })` and gets a session; the profile row's role is `organizer` after the action's core runs; `users_with_roles.has_signed_in` flips from false to true. The action's Supabase-facing core is extracted into a plain function (`inviteOrganizerCore(admin, email)`) so it can run without Next request context, the same way the RPC suites call the database directly.
- Recovery: `generateLink({ type:'recovery' })` → `verifyOtp` → `updateUser({ password })` → sign in with the new password succeeds.
- Negative: a second `verifyOtp` with the same hash fails; an anon client cannot read `users_with_roles` (existing posture, re-asserted).

Manual gate (dev preview, in the quickstart): S1 through S6 clicked through once, with the invite email received in a real mailbox.

## 8. Out of scope (deliberately)

- Bulk invites, invite expiry management, revoking a pending invite (delete the user on the Admin page if needed — not built here).
- Inviting with a role other than organizer. Admins are promoted on the Admin page after they accept.
- Display names or profile fields at accept time. `user_profiles` has none.
- Change-password for an already-signed-in user from a settings page. `/set-password` technically works for that, but no UI links to it.
- Magic-link login. Its template is left at the Supabase default.
- Self-hosted (008) template wiring — see §5 follow-up.

Small in-scope adjustment: the signup page's "sign in afterwards" copy becomes wrong once S6 lands, so it is updated in the same task as the Confirm-signup template.

## 9. Assumptions to confirm during `/speckit.specify` or plan

- `inviteUserByEmail` on an existing **unconfirmed** user re-sends the invite rather than erroring (GoTrue behaviour; verify against the local stack in the first security test and adjust D2's branch if not).
- Supabase's minimum password length on both projects is 6, matching `signupSchema`. If a project is stricter, align the schema.
- The dev project's Site URL still points at the `dev` preview origin (fixed 2026-09-23).
- `@supabase/ssr` ^0.8 `createServerClient` writes cookies on `verifyOtp` inside a Route Handler the same way it does for `signInWithPassword` in a server action (it does; both go through the same `setAll`).

## 10. Rollout

1. Migration 013 + code on a `009-organizer-invites` branch off `dev`, one PR per task per the constitution.
2. Local: `supabase db reset`, `npm run db:types:local`, full test run including the security project.
3. Dev: apply 013, set the Vercel preview env var, edit the three templates, run S1–S6 on the preview with a throwaway `+invite` address. Record evidence in the quickstart.
4. Prod: apply 013, set the Production env var, edit templates, promote `dev` → `main`, run S1 once with a real organizer's address (this doubles as the first real onboarding). Delete the stub note from the constitution's "acknowledged pre-existing violations" and the Tier 4 bullet from ROADMAP; update `specs/README.md`, CLAUDE.md (Epic 4 status, env vars, route list, migrations list) and ARCHITECTURE.md ("no service-role key is used anywhere in the app" is no longer true and must say where it is used).
