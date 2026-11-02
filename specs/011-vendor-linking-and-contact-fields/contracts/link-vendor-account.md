# Contract: `public.link_vendor_account()` and `resolveVendorId()`

**Feature**: 011-vendor-linking-and-contact-fields | **Date**: 2026-10-31
**Kind**: PostgreSQL function (PL/pgSQL, `SECURITY DEFINER`) invoked via PostgREST
`POST /rest/v1/rpc/link_vendor_account` / supabase-js `.rpc('link_vendor_account')`, plus the one
TypeScript resolver that calls it.
**Body**: [`migration-015.md`](./migration-015.md) §4 (and the §3 helper it uses).
**Security**: `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`.

## RPC

**Inputs**: none. The only input is the caller's JWT (`auth.uid()`), from which the function reads
the account's verified address in `auth.users` (FR-003).

**Returns**: `uuid` — the vendor id the account is tied to after the call — or `NULL`.

| Caller state | Returns | Side effect |
|---|---|---|
| no session | SQLSTATE `42501` | none |
| `user_profiles.vendor_id` already set | that id | none (heals a half-tied pair: the `vendors.user_id` side — unreachable from the app, since `resolveVendorId` returns at step 2; a half-tied pair arises only by hand edit and is the admin's to fix) |
| untied; a `vendors` row has `lower(email)` = account address and `user_id IS NULL` (or already the caller) | that row's id | `vendors.user_id` and `user_profiles.vendor_id` set in one transaction |
| untied; the only matching row is tied to another account | `NULL` | none (FR-004) |
| untied; no row matches | `NULL` | none |

Idempotent: a second call returns the same id and writes nothing. Matching is case-insensitive;
if two rows differ only by case, the exact-case match is preferred, then the oldest.

## `resolveVendorId(supabase, userId)` — `src/lib/vendor/resolve-vendor-id.ts`

Plain module (no `'use server'`): it must not become a public action endpoint.

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * The vendor row the signed-in account is tied to, tying it first when an
 * untied row carries the account's address (spec 011 FR-001). Null when the
 * account has no vendor record.
 */
export async function resolveVendorId(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string | null>
```

| # | Step | On failure |
|---|---|---|
| 1 | `from('user_profiles').select('vendor_id').eq('id', userId).single()` | error → `null` (logged with code only) |
| 2 | `vendor_id` set → return it | — |
| 3 | `rpc('link_vendor_account')` | error → `console.error('[vendor] link_vendor_account failed:', error.code)` → `null` |
| 4 | return `data ?? null` | — |

**Callers** (each replaces its inline `user_profiles.vendor_id` lookup): `getVendorDashboardData`,
`getVendorApplicationsList`, `getVendorProfile`, `getVendorApplicationDetail`
(`src/lib/actions/vendor-dashboard.ts`) and `updateVendorProfile` (`src/lib/actions/vendors.ts`).
Each caller has already done `auth.getUser()` and returned its "not authenticated" result before
calling the resolver; a `null` resolver result is each caller's existing "no vendor profile" result
(`null` / `'no_vendor_profile'` / `'No vendor profile linked to your account'`), unchanged.

**Why on a read path**: the write is idempotent, scoped to the caller by the database, and runs at
most once per account (after the first success step 2 short-circuits). Recorded in the plan's
Complexity Tracking.

## Unit test (`src/test/resolve-vendor-id.test.ts`)

Mock client as in `src/test/auth-roles.test.ts`: (a) `vendor_id` set → returns it, `rpc` not
called; (b) `vendor_id` null, rpc returns an id → that id; (c) rpc returns `null` → `null`;
(d) rpc errors → `null`, `console.error` called with the code only.
