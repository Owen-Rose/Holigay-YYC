# Contract: Server Actions

**Feature**: 009-organizer-invites | **Date**: 2026-09-26
**Files**: `src/lib/actions/team.ts` (rewrite), `src/lib/actions/auth.ts` (two additions), `src/lib/actions/admin.ts` (one field)
**Tested by**: `src/test/team-actions.test.ts`, `src/test/auth-password-actions.test.ts`, `src/test/security/invite-flow.test.ts`

Every action returns `{ success, error, data }` and never throws across the boundary. Every
user-visible string below is part of the acceptance criteria (spec US1/US2/US3 scenarios).

## `inviteOrganizer(email: string): Promise<InviteResponse>`

```ts
export type InviteResponse = {
  success: boolean;
  error: string | null;
  data: { resent: boolean } | null;
};
```

Ordered steps — each early return sends nothing and changes nothing:

| # | Step | On failure returns `error` |
|---|---|---|
| 1 | `requireRole('admin')` | the `requireRole` message (`Requires admin role or higher` / `Not authenticated`) — FR-001 |
| 2 | `inviteSchema.safeParse({ email })` → trimmed, lower-cased address | `Please enter a valid email address` — FR-008 |
| 3 | `createAdminClient()`; `null` → | `Invites are not configured on this deployment` — FR-007 |
| 4 | `inviteOrganizerCore(admin, address)` — see below | as returned |
| 5 | `revalidatePath('/dashboard/team')`, `revalidatePath('/dashboard/admin')` | — |

### `inviteOrganizerCore(admin, email, deps?)` — the Next-free core

```ts
type InviteDeps = {
  /** Defaults to admin.auth.admin.inviteUserByEmail(email). The security suite injects a generateLink-based sender. */
  sendInvite?: (email: string) => Promise<{ data: { user: User | null }; error: AuthError | null }>;
};
export async function inviteOrganizerCore(
  admin: SupabaseClient<Database>, email: string, deps: InviteDeps = {}
): Promise<InviteResponse>
```

| # | Step | Outcome |
|---|---|---|
| a | `admin.from('users_with_roles').select('id, invite_pending').eq('email', email).maybeSingle()` | lookup error → `Failed to send invitation` (logged with code only) |
| b | row exists and `invite_pending !== true` | `That email already has an account. Change their role on the Admin page instead.` — FR-002 (covers vendors, organizers and admins alike) |
| c | `sendInvite(email)` | GoTrue `email_exists` → the FR-002 message (fallback, research R4); any other error → `Failed to send invitation` |
| d | row existed (pending) | `{ success: true, error: null, data: { resent: true } }` — role **not** touched — FR-003, FR-005 |
| e | new user: `admin.from('user_profiles').update({ role: 'organizer' }).eq('id', user.id)` | error → `{ success: false, error: 'Invitation sent, but the role could not be set. Set it on the Admin page.', data: null }` — FR-006 |
| f | | `{ success: true, error: null, data: { resent: false } }` — FR-004 |

The action passes **no** `redirectTo`: the Invite email template owns the link (D4).
Logging: `console.error('[inviteOrganizer] <step>', error.code ?? error.message)` — never the
address in the same line as a token, never an email body.

### Client (`src/components/team/invite-form.tsx`, Team page Resend button)

| Result | Toast |
|---|---|
| `success && !data.resent` | `Invitation sent to <email>` |
| `success && data.resent` | `Invitation re-sent to <email>` |
| `!success` | `error` verbatim |

Resend on a Team-page row calls the same action with that row's email (FR-024).

## `getUsers(): Promise<GetUsersResponse>` (existing, one field added)

Select becomes `id, email, role, created_at, role_updated_at, invite_pending`; each
`UserWithRole` gains `invitePending: boolean` (`row.invite_pending === true`). Admin gate,
ordering and the camelCase mapping are unchanged.

## `setPassword(data: SetPasswordInput): Promise<SetPasswordResponse>`

```ts
export type SetPasswordResponse = {
  success: boolean;
  error: string | null;
  data: { redirectTo: '/dashboard' | '/vendor-dashboard' } | null;
};
```

| # | Step | On failure |
|---|---|---|
| 1 | `setPasswordSchema.safeParse(data)` | first issue message (`Password must be at least 6 characters` / `Passwords do not match`) |
| 2 | `requireRole('vendor')` — the minimum role admits every signed-in user; its `data.role` is reused in step 4 | its message (`Not authenticated`) — FR-015/FR-017 |
| 3 | `supabase.auth.updateUser({ password })` | GoTrue message (e.g. the same-password or weak-password error) |
| 4 | `hasMinimumRole(role, 'organizer')` on the role from step 2 → `/dashboard`, else `/vendor-dashboard` | — |
| 5 | | `{ success: true, error: null, data: { redirectTo } }` — FR-018 |

Client (`set-password-form.tsx` page wrapper): toast `Password set` then
`router.push(redirectTo); router.refresh()`.

## `requestPasswordReset(data: ForgotPasswordInput): Promise<RequestPasswordResetResponse>`

```ts
export type RequestPasswordResetResponse = { success: boolean; error: string | null; data: null };
```

| # | Step | Outcome |
|---|---|---|
| 1 | `forgotPasswordSchema.safeParse(data)` | failure → `{ success: false, error: 'Please enter a valid email address', data: null }` — US2-S4 |
| 2 | `supabase.auth.resetPasswordForEmail(email)` — no `redirectTo` | **any** error (unknown address is not one; rate limit `over_email_send_rate_limit` is) → `console.error('[requestPasswordReset] provider error', error.code ?? error.name)` |
| 3 | | always `{ success: true, error: null, data: null }` — FR-021 |

Client (`/forgot-password` page): on success replace the form with
`If that address has an account, a reset link is on its way.`; on failure show the validation
error inline. There is no toast difference between the two account states.

## Unchanged

`signIn`, `signUp`, `signOut`, `updateUserRole` are untouched.
