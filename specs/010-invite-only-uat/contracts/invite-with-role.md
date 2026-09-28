# Contract: Invitation With a Role

**Feature**: 010-invite-only-uat | **Date**: 2026-09-27
**Files**: `src/lib/validations/team.ts`, `src/lib/team/invite-organizer-core.ts`, `src/lib/actions/team.ts`, `src/components/team/invite-form.tsx`
**Tested by**: `src/test/team-actions.test.ts`, `src/test/invite-form.test.tsx`, `src/test/team-page.test.tsx`, `src/test/security/invite-flow.test.ts`
**Spec**: US2, FR-007–FR-012; research R5–R8
**Supersedes**: the `inviteOrganizer` / `inviteOrganizerCore` signatures in
`specs/009-organizer-invites/contracts/server-actions.md`. Steps a–f, every message and the
`InviteResponse` shape are unchanged; only the role is new.

## 1. Schema — `src/lib/validations/team.ts`

```ts
export const INVITE_ROLES = ['organizer', 'vendor'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Please enter a valid email address')),
  role: z.enum(INVITE_ROLES, { error: 'Please choose Organizer or Vendor' }).default('organizer'),
});
export type InviteInput = z.infer<typeof inviteSchema>;
```

| `role` input | Parse result |
|---|---|
| `undefined` (Resend button, old callers) | `'organizer'` |
| `'organizer'`, `'vendor'` | itself |
| `'admin'`, `'Vendor'`, `''`, any other value | issue `Please choose Organizer or Vendor` — FR-008; Admin is never invitable |

## 2. `inviteOrganizer(email: string, role?: string): Promise<InviteResponse>`

```ts
export type InviteResponse = {           // unchanged
  success: boolean;
  error: string | null;
  data: { resent: boolean } | null;
};
```

| # | Step | On failure returns `error` |
|---|---|---|
| 1 | `requireRole('admin')` | the `requireRole` message — FR-011 |
| 2 | `inviteSchema.safeParse({ email, role })` | the **first issue's message**: `Please enter a valid email address` or `Please choose Organizer or Vendor` |
| 3 | `createAdminClient()`; `null` → | `Invites are not configured on this deployment` |
| 4 | `inviteOrganizerCore(admin, parsed.data.email, parsed.data.role)` | as returned |
| 5 | `revalidatePath('/dashboard/team')`, `revalidatePath('/dashboard/admin')` | — |

The action name is kept for spec 009's callers, tests and the containment test (research R5);
its JSDoc says it invites a team member with the chosen role.

## 3. `inviteOrganizerCore(admin, email, role, deps?)` — the Next-free core

```ts
export async function inviteOrganizerCore(
  admin: SupabaseClient<Database>,
  email: string,
  role: InviteRole,
  deps: InviteDeps = {}
): Promise<InviteResponse>
```

| # | Step | Outcome |
|---|---|---|
| a | lookup in `users_with_roles` | error → `Failed to send invitation` (unchanged) |
| b | row exists and `invite_pending !== true` | `That email already has an account. Change their role on the Admin page instead.` (unchanged, FR-011) |
| c | `sendInvite(email)` | `email_exists` → the same message; other error → `Failed to send invitation` (unchanged) |
| d | row existed (pending) | `{ success: true, error: null, data: { resent: true } }` — **the `role` argument is ignored**; the stored role stays — FR-010 |
| e | new user: `admin.from('user_profiles').update({ role }).eq('id', user.id)` | error → `Invitation sent, but the role could not be set. Set it on the Admin page.` (unchanged, FR-011). Because `handle_new_user` created the profile as `vendor`, a failed **vendor** invite is still correct (spec edge case) |
| f | | `{ success: true, error: null, data: { resent: false } }` — FR-009 |

The trigger's email link (FR-012) happens inside GoTrue's insert at step c, before step e, and
needs nothing from this function: `handle_new_user` sets `user_profiles.vendor_id` and
`vendors.user_id` when a `vendors` row has the **same** (lower-case) email. Research R8 records
that a mixed-case vendor row is not linked.

## 4. Client

### Invite form (`src/components/team/invite-form.tsx`)

| Element | Value |
|---|---|
| Heading | `Invite team member` |
| Copy | `Send an invitation email. Organizers review applications; vendors get a vendor dashboard.` |
| Email input | placeholder `name@example.com`; validation unchanged |
| Role control | `Select` primitive from `src/components/ui/select.tsx`, `label="Role"`, options `Organizer` (`organizer`, **selected by default**) and `Vendor` (`vendor`) — nothing else (FR-007) |
| Button | `Send Invite` (unchanged) |
| Submit | `inviteOrganizer(trimmedEmail, role)` |
| After success | email cleared, role reset to Organizer, `onInvited()` |

| Result | Toast (unchanged) |
|---|---|
| `success && !data.resent` | `Invitation sent to <email>` |
| `success && data.resent` | `Invitation re-sent to <email>` |
| `!success` | `error` verbatim |

### Team page (`src/app/dashboard/team/page.tsx`) — unchanged by decision (research R6)

The list still shows organizers and admins only; an invited vendor is confirmed by the toast
and listed on the Admin page with the Vendor role. Resend calls `inviteOrganizer(email)` with
no role (→ default, ignored for a pending row). A pending vendor is re-sent by submitting the
address again in the form.

## 5. Test matrix

| File | Case | Asserts |
|---|---|---|
| `src/test/team-actions.test.ts` | `inviteOrganizer(email, 'vendor')` for a new address | `update` called with `{ role: 'vendor' }`; `{ resent: false }` |
| | `inviteOrganizer(email)` (no role) | `update` called with `{ role: 'organizer' }` |
| | `inviteOrganizer(email, 'admin')` | `{ success: false, error: 'Please choose Organizer or Vendor', data: null }`; admin client not created |
| | `inviteOrganizer(email, 'vendor')` for a pending row | `{ resent: true }`; `update` not called |
| | existing 009 cases | unchanged and green |
| `src/test/invite-form.test.tsx` | render | select labelled "Role" has options Organizer, Vendor only; Organizer selected |
| | choose Vendor, submit | `inviteOrganizer` called with `('new@example.com', 'vendor')`; after success the select is back on Organizer |
| | submit without touching the select | called with `('new@example.com', 'organizer')` |
| `src/test/team-page.test.tsx` | fixture gains a vendor with `invitePending: true` | not rendered as a row; Resend still calls `inviteOrganizer(email)` with one argument |
| `src/test/security/invite-flow.test.ts` (real stack) | vendor row (lower-case) exists → invite as `vendor` | role `vendor`, `invite_pending` true, `user_profiles.vendor_id` = row id, `vendors.user_id` = new user id — FR-012 |
| | re-send the same address as `vendor`, then as `organizer` | both `{ resent: true }`; role still `vendor` — FR-010 |
| | vendor row with **mixed-case** email → invite the lower-cased address | documented: `vendor_id` null (research R8) |
| | existing 009 cases | pass with `'organizer'` supplied |
