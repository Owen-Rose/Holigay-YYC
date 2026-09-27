# Data Model: Organizer Invites, Link Consumption and Password Reset

**Feature**: 009-organizer-invites | **Date**: 2026-09-26

No new tables, no RLS changes, no storage changes. One view gains one column; the rest of
the model is state that already lives in `auth.users` and `user_profiles`.

## Migration `013_users_with_roles_invite_pending.sql`

```sql
-- Holigay Vendor Market - users_with_roles: invite_pending
-- Migration: 013_users_with_roles_invite_pending.sql
-- Spec: specs/009-organizer-invites/ (FR-023, FR-029; research R5, R20)
--
-- Adds one trailing column so the Team page can mark accounts that were invited
-- and have not accepted. The condition is the same one GoTrue uses to decide
-- whether an invitation may be re-sent (email_confirmed_at IS NULL), narrowed
-- by last_sign_in_at IS NULL so "pending" always also means "never signed in".
-- CREATE OR REPLACE VIEW may only append columns, so the 006 select is restated.

CREATE OR REPLACE VIEW public.users_with_roles AS
SELECT
  u.id,
  u.email::text AS email,
  COALESCE(p.role, 'vendor'::user_role) AS role,
  u.created_at,
  p.updated_at AS role_updated_at,
  (u.email_confirmed_at IS NULL AND u.last_sign_in_at IS NULL) AS invite_pending
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.id = u.id;

-- Close the anon read (research R20). Supabase's default privileges granted
-- anon and authenticated ALL on this view when 006 created it, and the view
-- runs as its owner, so anyone holding the public anon key could list every
-- account's email. anon loses every privilege; authenticated keeps only the
-- SELECT that 006 granted explicitly (the admin gate stays in the server
-- action). Asserted by src/test/security/invite-flow.test.ts.
REVOKE ALL ON public.users_with_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.users_with_roles FROM authenticated;
```

After `supabase db reset`, `npm run db:types:local` regenerates `src/types/database.ts`;
`Database['public']['Views']['users_with_roles']['Row']` gains `invite_pending: boolean | null`
(views are nullable in the generated types; the action coerces with `=== true`).

## Entities

### Team member (`UserWithRole`, `src/lib/actions/admin.ts`)

| Field | Type | Source | Notes |
|---|---|---|---|
| `id` | `string` | `auth.users.id` | |
| `email` | `string` | `auth.users.email` | |
| `role` | `'vendor' \| 'organizer' \| 'admin'` | `user_profiles.role`, default `vendor` | |
| `createdAt` | `string` | `auth.users.created_at` | shown as "Joined" |
| `roleUpdatedAt` | `string \| null` | `user_profiles.updated_at` | |
| `invitePending` | `boolean` | **new** view column | drives the Pending badge and Resend button |

### Invitation (derived, not stored)

An invitation is the state of a team member with `invitePending = true`. It has no row of
its own (spec Key Entities). Transitions:

```
[none] --inviteOrganizer--> invited
        auth.users row (email_confirmed_at NULL, last_sign_in_at NULL)
        user_profiles.role = 'organizer'          ← set by the action right after the invite call
        invite_pending = true

invited --Resend / re-invite--> invited            (new token, role untouched — FR-003)

invited --link clicked (/auth/confirm, verifyOtp type=invite)--> accepted
        email_confirmed_at set, last_sign_in_at set, session cookies written
        invite_pending = false                     (badge and Resend gone — US3 scenario 5)

accepted --setPassword--> member with a password  (redirect /dashboard for organizer/admin)

accepted --abandons /set-password--> still accepted; recovers via /forgot-password
        (Resend is now refused with the FR-002 message — documented edge case, not a bug)
```

### Auth link (owned by GoTrue)

`{ token_hash, type, next }` carried in the email link. `type ∈ invite | recovery | signup |
email | email_change`; one-time (a second `verifyOtp` with the same hash fails); expiring
(hosted defaults: invitation 24 h, recovery 1 h, confirmation 24 h). The app stores nothing
about it and never logs it (FR-014).

### Password

`auth.users.encrypted_password`, written by `supabase.auth.updateUser({ password })` from
`setPassword`. Set once by an invitee, changeable through the reset flow.

## Validation schemas

| Schema | File | Shape |
|---|---|---|
| `inviteSchema` | `src/lib/validations/team.ts` (new) | `{ email: z.email('Please enter a valid email address').trim().toLowerCase() }` — Zod 4 `z.email()`; the transform gives the trimmed, lower-cased value FR-008 requires |
| `setPasswordSchema` | `src/lib/validations/auth.ts` | `{ password: min(6, 'Password must be at least 6 characters'), confirmPassword }` + `refine(password === confirmPassword, 'Passwords do not match', path confirmPassword)` — the same rules as `signupSchema` |
| `forgotPasswordSchema` | `src/lib/validations/auth.ts` | `{ email: z.email('Please enter a valid email address').trim().toLowerCase() }` |
| `confirmQuerySchema` | `src/app/auth/confirm/route.ts` (module-private) | `{ token_hash: z.string().min(1), type: z.enum(['invite','recovery','signup','email','email_change']), next: z.string().optional() }` |

If R17's manual check finds a hosted project with a minimum password length above 6, the
`min(6)` in `loginSchema`, `signupSchema` and `setPasswordSchema` is raised together.

## Response types

| Type | Shape |
|---|---|
| `InviteResponse` | `{ success: boolean; error: string \| null; data: { resent: boolean } \| null }` |
| `SetPasswordResponse` | `{ success: boolean; error: string \| null; data: { redirectTo: '/dashboard' \| '/vendor-dashboard' } \| null }` |
| `RequestPasswordResetResponse` | `{ success: boolean; error: string \| null; data: null }` |
| `GetUsersResponse` | unchanged shape; each `UserWithRole` carries `invitePending` |
