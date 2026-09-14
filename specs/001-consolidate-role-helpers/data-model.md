# Phase 1 Data Model: Consolidate Duplicate Role-Check Helpers

**Date**: 2026-04-19
**Branch**: `001-consolidate-role-helpers`

This refactor does not change the database schema. There are no new entities, no schema migrations, and no persisted fields. "Data model" here is limited to the in-memory TypeScript types the canonical auth module exposes.

---

## Types

### `Role` (unchanged, re-imported from existing location)

- **Source**: `src/lib/constants/roles.ts` (unchanged)
- **Definition**: `'vendor' | 'organizer' | 'admin'` (derived from `ROLES` tuple)
- **Hierarchy**: Total order. `admin (2) > organizer (1) > vendor (0)`. Enforced by `hasMinimumRole(userRole, requiredRole)` which returns `ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]`.

### `RoleResponse` (surviving, now the single contract)

- **Source**: `src/lib/auth/roles.ts` (after refactor — promoted from `src/lib/actions/roles.ts`)
- **Definition**:
  ```ts
  type RoleResponse = {
    success: boolean
    error: string | null
    data: {
      role: Role
      userId: string
    } | null
  }
  ```
- **Invariants**:
  - `success === true` ⇔ `data !== null && error === null`
  - `success === false` ⇔ `data === null && error !== null`
  - When `success === true`, `data.role` satisfies the requested minimum role under `hasMinimumRole`.
  - `getCurrentUserRole` returns `success: true` even for a user with no `user_profiles` row — the role defaults to `'vendor'` (preserving current response-based behavior).

### Types removed by this refactor

| Removed | Source | Replacement |
|---------|--------|-------------|
| `Role` re-export | `src/lib/auth/roles.ts` (old) | Import directly from `src/lib/constants/roles.ts` |
| Boolean return of `isOrganizerOrAdmin` | `src/lib/auth/roles.ts` (old) | `RoleResponse` from `requireRole('organizer')` |
| `Promise<Role | null>` from old `getCurrentUserRole` | `src/lib/auth/roles.ts` (old) | `Promise<RoleResponse>` from new `getCurrentUserRole` |
| `Promise<Role>` from old `requireRole` (throws on failure) | `src/lib/auth/roles.ts` (old) | `Promise<RoleResponse>` from new `requireRole` (no throw) |

---

## State transitions

N/A — functions are stateless. Each call independently reads `auth.getUser()` and `user_profiles` via Supabase.

## Validation rules

N/A at this layer — input is just a `Role` literal on `requireRole`. TypeScript guarantees the argument belongs to the union at compile time. Runtime validation happens in `hasMinimumRole` against the hierarchy table.

## Relationships

- **`RoleResponse.data.role`** ← read from `user_profiles.role` for the authenticated user (`auth.uid()`).
- **`RoleResponse.data.userId`** ← `auth.getUser().id`.
- No new joins, no new queries compared to the existing surviving helper.
