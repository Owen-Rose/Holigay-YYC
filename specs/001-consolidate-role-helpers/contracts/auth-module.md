# Contract: Canonical Auth Module

**Module**: `src/lib/auth/roles.ts` (post-refactor)
**Directive**: `'use server'` at file top (preserved from the promoted source)
**Exported surface**: `getCurrentUserRole`, `requireRole`, `RoleResponse` (type)

This is the **only** module in the codebase that provides server-side role-check helpers. Any new server action MUST import from this path and MUST NOT introduce a parallel helper.

---

## Public API

### `getCurrentUserRole()`

```ts
export async function getCurrentUserRole(): Promise<RoleResponse>
```

**Purpose**: Returns the authenticated user's current role along with their user id.

**Behavior**:
- Calls `supabase.auth.getUser()`.
- If no authenticated user: returns `{ success: false, error: 'Not authenticated', data: null }`.
- Reads `user_profiles.role` for the authenticated user id.
- If the query fails with anything other than `PGRST116` (no rows): returns `{ success: false, error: 'Failed to fetch user role', data: null }`.
- If `PGRST116` (no profile row) or the row has no role: defaults `role` to `'vendor'`.
- On success: returns `{ success: true, error: null, data: { role, userId } }`.

**Callers (post-refactor)**:
- `src/lib/context/role-context.tsx` (client, via server-action RPC)
- Internal use by `requireRole`

**Does NOT throw.** All failure modes surface as `{ success: false, error, data: null }`.

---

### `requireRole(minimumRole)`

```ts
export async function requireRole(minimumRole: Role): Promise<RoleResponse>
```

**Purpose**: Gate a server action on a minimum role (hierarchical).

**Parameters**:
- `minimumRole: Role` — one of `'vendor' | 'organizer' | 'admin'`. Under the hierarchy, the caller's role must satisfy `hasMinimumRole(callerRole, minimumRole)`.

**Behavior**:
1. Invokes `getCurrentUserRole()` internally.
2. On auth failure: returns the `getCurrentUserRole` failure response verbatim (same `error` string, `data: null`).
3. If the caller's role does not meet the minimum: returns `{ success: false, error: \`Requires ${minimumRole} role or higher\`, data: null }`.
4. On success: returns `{ success: true, error: null, data: { role, userId } }`.

**Callers (post-refactor)**:
- `src/lib/actions/events.ts` (4 sites) — `requireRole('organizer')`
- `src/lib/actions/applications.ts` (2 sites) — `requireRole('organizer')`
- `src/lib/actions/team.ts` — `requireRole('admin')`
- `src/lib/actions/admin.ts` (2 sites) — `requireRole('admin')`
- `src/lib/actions/export.ts` — `requireRole('organizer')`

**Does NOT throw.** All failure modes surface as `{ success: false, error, data: null }`.

**Canonical caller pattern** (to be used in every new server action):

```ts
export async function someProtectedAction(input: Input): Promise<ActionResponse> {
  const auth = await requireRole('organizer')
  if (!auth.success) {
    return { success: false, error: auth.error, data: null }
  }
  // `auth.data.role` and `auth.data.userId` are now safely non-null.
  // … Zod validation, DB call, response …
}
```

---

### `RoleResponse` (type)

```ts
export type RoleResponse = {
  success: boolean
  error: string | null
  data: {
    role: Role
    userId: string
  } | null
}
```

See `data-model.md` for invariants.

---

## Removed from the public surface

| Removed symbol | Old signature | Replacement |
|----------------|---------------|-------------|
| `isOrganizerOrAdmin()` | `Promise<boolean>` | `requireRole('organizer')` returning `RoleResponse` |
| `requireRole(allowedRoles: Role[])` (throws) | `Promise<Role>` | `requireRole(minimumRole: Role)` returning `RoleResponse` |
| `getCurrentUserRole()` → `Role \| null` | — | `getCurrentUserRole()` → `RoleResponse` |
| `Role` re-export from `src/lib/auth/roles.ts` | — | Import from `src/lib/constants/roles.ts` |

---

## Invariants the refactor MUST preserve

1. Every previously-guarded action still rejects the same roles it used to reject.
2. No protected action begins to throw where it previously returned a response, or vice versa.
3. `role-context.tsx` continues to consume `getCurrentUserRole()` as an async function returning `RoleResponse`. The directive `'use server'` remains at the top of the canonical file so client components can invoke it via RPC.
4. No import of `@/lib/actions/roles` remains anywhere in the repository after the migration.
5. The file `src/lib/actions/roles.ts` does not exist after the migration.
6. Middleware (`src/middleware.ts`) is not touched.

## What callers must NOT do

- Import `requireRole` or `getCurrentUserRole` from any path other than `@/lib/auth/roles`.
- Wrap `requireRole` in `try/catch` — it never throws, so the catch is dead code.
- Ignore the `auth.success` check. TypeScript makes `auth.data` nullable; ignoring it is a type error.
- Re-introduce a boolean helper (`isOrganizerOrAdmin` or similar). If a new two-role set is genuinely needed (e.g., "vendor OR admin but NOT organizer"), add an `allowedRoles` variant to this module with explicit design review — do not fork a parallel helper.
