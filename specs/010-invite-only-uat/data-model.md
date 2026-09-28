# Data Model: Invite-Only UAT Environment

**Feature**: 010-invite-only-uat | **Date**: 2026-09-27

**No migration.** No table, view, RLS policy, storage rule or trigger changes. Every entity
below is either deployment configuration or state that already lives in `auth.users`,
`user_profiles` and `vendors`. `src/types/database.ts` is not regenerated.

## Entities

### Deployment mode

| Field | Type | Source | Values |
|---|---|---|---|
| `inviteOnly` | `boolean` | `src/lib/env-public.ts`, from `NEXT_PUBLIC_INVITE_ONLY` at build time | `true` iff the trimmed value is exactly `true`; otherwise `false` (open) |

| Deployment | Mode | Sign-up toggle on the auth project |
|---|---|---|
| Production (`vendors.holigayeventsyyc.ca`, prod project) | open | **on** (FR-016) |
| Training and every PR preview (dev project) | invite-only | **off** (FR-013) |
| Local (`supabase start`) | open unless set in the shell | on (`config.toml`, unchanged) |

Mode and toggle are independent. Their four combinations (spec Edge Cases): both set →
intended; toggle off, mode open → GoTrue's raw refusal surfaces through `signUp`; toggle on,
mode invite-only → app refuses, a direct request succeeds (caught only by row D1's evidence);
both open → today's production.

### Invitation role

| Field | Type | Rule |
|---|---|---|
| `role` | `'organizer' \| 'vendor'` (`InviteRole`, `src/lib/validations/team.ts`) | chosen by the admin in the invite form; default `organizer`; `admin` is not a member of the type and fails validation |

Written once, to `user_profiles.role`, right after the invitation creates the account (core
step e). Never written on a re-send (step d). The `user_role` enum in the database is
unchanged; `InviteRole` is a strict subset of it.

### Team member (spec 009, unchanged)

`UserWithRole = { id, email, role, createdAt, roleUpdatedAt, invitePending }` from
`users_with_roles` (migration `013`). The Team page shows the organizer/admin subset; the Admin
page shows all. A vendor created by an invitation is a `UserWithRole` with `role = 'vendor'`
and `invitePending = true` until the link is used.

## Invitation state (spec 009's machine, with the role chosen up front)

```
        inviteOrganizer(email, role)                 verifyOtp (link)             setPassword
 none ───────────────────────────────▶ pending(role) ───────────────▶ accepted(role) ─────────▶ active(role)
   ▲                                     │  ▲
   │  step b/c refusal (existing acct)   │  │ inviteOrganizer(email, anyRole) → resent, role unchanged
   └────────────────── from any state ───┘  └───────────────────────────────────────────────────────
```

- `pending(vendor)` is reached from `none` only; a self sign-up cannot create it on the training
  deployment because the toggle is off.
- On the transition `none → pending`, `handle_new_user` also links a `vendors` row whose `email`
  equals the new account's (lower-case) email: `user_profiles.vendor_id ← vendors.id`,
  `vendors.user_id ← auth.users.id` (FR-012). A mixed-case vendor row is not matched (research
  R8; follow-up item 11 in the UAT findings handoff).

## Validation rules (from the requirements)

| Rule | Where |
|---|---|
| Mode is on only for exactly `true` (FR-001) | `env-public` |
| Role ∈ {organizer, vendor}, default organizer (FR-007, FR-008) | `inviteSchema` |
| Email trimmed and lower-cased before lookup, send and link (spec 009 FR-008) | `inviteSchema` (unchanged) |
| Re-send never changes the stored role (FR-010) | core step d |
| Invite-only refusal after Zod, before any client (FR-004) | `signUp` |
