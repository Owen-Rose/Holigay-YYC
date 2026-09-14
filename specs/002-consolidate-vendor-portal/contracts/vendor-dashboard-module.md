# Contract: Canonical Vendor Data-Fetching Module

**Module**: `src/lib/actions/vendor-dashboard.ts`
**Directive**: `'use server'` at file top (unchanged).
**Exported surface** (post-refactor, unchanged from pre-refactor):
- Functions: `getVendorDashboardData`, `getVendorApplicationsList`, `getVendorProfile`, `getVendorApplicationDetail`
- Types: `VendorApplication`, `VendorDashboardData`, `VendorProfile`, `VendorApplicationDetail`

After this refactor, **this is the only module in the codebase that provides vendor-facing data fetching**. Any new vendor-portal feature MUST import from this path and MUST NOT re-introduce a parallel helper. `src/lib/actions/vendor-portal.ts` is deleted and must not be re-created.

---

## Public API (preserved verbatim)

### `getVendorDashboardData()`

```ts
export async function getVendorDashboardData(): Promise<VendorDashboardData | null>
```

**Purpose**: Returns summary data for the vendor dashboard home page — application counts by status and the five most-recent applications.

**Behavior**:
1. Calls `supabase.auth.getUser()`. If no user → returns `null`.
2. Reads `user_profiles.vendor_id` for the authenticated user. If the row is missing or `vendor_id` is null → returns `null` (vendor has not yet been linked).
3. Reads all `applications.status` rows for `vendor_id` → aggregates into `counts` (`pending`, `approved`, `rejected`, `total`).
4. Reads the 5 most-recent `applications` rows for `vendor_id` with joined event fields → shapes as `recentApplications: VendorApplication[]`.
5. Filters out applications whose event row is null (defensive; should not occur under current schema).

**Returns**: `VendorDashboardData | null`. On `null`, the calling page renders the "no vendor profile" state.

**Callers**: `src/app/vendor-dashboard/page.tsx:2`.

---

### `getVendorApplicationsList(status?)`

```ts
export async function getVendorApplicationsList(
  status?: string | null
): Promise<VendorApplicationsListResult>

type VendorApplicationsListResult =
  | { success: true; data: VendorApplication[] }
  | { success: false; error: 'not_authenticated' | 'no_vendor_profile' | 'fetch_failed'; data: null }
```

**Purpose**: Returns all applications for the current vendor, optionally filtered by status.

**Behavior**:
1. Auth + `vendor_id` lookup as above; typed error discriminant returned on failure.
2. If `status` is provided and is a member of `VALID_STATUSES` (`'pending' | 'approved' | 'rejected' | 'waitlisted'` — see `vendor-dashboard.ts:120`), filters the query. Unknown status values are silently ignored (the query returns the full list).
3. Joins `events` for each application row; filters out applications whose event is null.

**Callers**: `src/app/vendor-dashboard/applications/page.tsx:2`.

---

### `getVendorProfile()`

```ts
export async function getVendorProfile(): Promise<GetVendorProfileResult>

type GetVendorProfileResult =
  | { success: true; data: VendorProfile }
  | { success: false; error: 'not_authenticated' | 'no_vendor_profile' | 'fetch_failed'; data: null }
```

**Purpose**: Returns the authenticated vendor's profile row.

**Behavior**:
1. Auth + `vendor_id` lookup as above; typed error discriminant on failure.
2. Fetches the `vendors` row for `vendor_id`. Returns `'fetch_failed'` on DB error, `'no_vendor_profile'` if the row is missing.

**Callers**: `src/app/vendor-dashboard/profile/page.tsx:2`.

---

### `getVendorApplicationDetail(applicationId)`

```ts
export async function getVendorApplicationDetail(
  applicationId: string
): Promise<VendorApplicationDetailResult>

type VendorApplicationDetailResult =
  | { success: true; data: VendorApplicationDetail }
  | { success: false; error: 'not_authenticated' | 'no_vendor_profile' | 'not_found' | 'fetch_failed'; data: null }
```

**Purpose**: Returns full detail for a single application, scoped to the authenticated vendor.

**Behavior**:
1. Auth + `vendor_id` lookup as above.
2. Fetches the `applications` row matching both `id = applicationId` AND `vendor_id = <this vendor>`. Mismatched IDs (or other-vendors' applications) return `'not_found'`.
3. Joins `vendors` and `events`.
4. Fetches `attachments` for the application separately.
5. Returns the shaped `VendorApplicationDetail` on success.

**Note**: `organizer_notes` is deliberately excluded from the return shape — this is a vendor-facing view.

**Callers**: `src/app/vendor-dashboard/applications/[id]/page.tsx:4–5`.

---

## Type surface

Defined in `src/lib/actions/vendor-dashboard.ts` and re-consumed by the four pages above:

- `VendorApplication` (line 9) — list/dashboard row shape.
- `VendorDashboardData` (line 21) — dashboard home aggregate.
- `VendorProfile` (line 198) — profile-edit row shape.
- `VendorApplicationDetail` (line 263) — application-detail view shape (includes nested `vendor`, `event`, `attachments`).

Full type bodies in [`../data-model.md`](../data-model.md).

---

## Removed from the public surface

| Removed symbol | Old source | Replacement |
|----------------|------------|-------------|
| `getVendorDashboardData()` returning `VendorDashboardResponse` | `src/lib/actions/vendor-portal.ts:88` | `getVendorDashboardData()` returning `VendorDashboardData \| null` (canonical), plus `getVendorProfile()` for the embedded-profile data |
| `VendorDashboardResponse` type | `src/lib/actions/vendor-portal.ts:60` | `VendorDashboardData \| null` |
| `VendorProfile` (camelCase) | `src/lib/actions/vendor-portal.ts:19` | `VendorProfile` (snake_case) from `vendor-dashboard.ts:198` |
| `VendorApplication` (camelCase) | `src/lib/actions/vendor-portal.ts:32` | `VendorApplication` (snake_case) from `vendor-dashboard.ts:9` |
| `ApplicationCounts` (includes `waitlisted`) | `src/lib/actions/vendor-portal.ts:49` | Inlined counts object in `VendorDashboardData.counts` (no `waitlisted` field — the canonical dashboard does not display a waitlisted count; applications list filters by status when needed) |
| `getVendorApplications(email: string)` | `src/lib/actions/applications.ts:375` | None — dead export, zero callers |

---

## Invariants the refactor MUST preserve

1. Every page currently reachable under `/vendor-dashboard/*` continues to render with the same data and the same interaction model.
2. No import of `@/lib/actions/vendor-portal` remains anywhere in the repository.
3. The file `src/lib/actions/vendor-portal.ts` does not exist.
4. The directory `src/app/(vendor)/` does not exist.
5. Middleware (`src/middleware.ts`) is not touched.
6. `vendor-dashboard.ts`'s function signatures, return types, and internal behavior are byte-identical to pre-refactor.
7. `auth.ts`'s `signIn` response shape is byte-identical to pre-refactor; only the `redirectTo` string's default value changes from `'/vendor'` to `'/vendor-dashboard'`.

## What callers must NOT do

- Re-introduce a parallel `vendor-portal.ts` or a `src/app/(vendor)/` directory.
- Add a bundled `getVendorDashboardData` variant that duplicates what the four canonical split functions already provide.
- Bypass `vendor_id` scoping by querying `vendors` via email (the deleted `vendor-portal.ts` did this; it was strictly weaker than `user_profiles.vendor_id` FK-based scoping).
- Import vendor types from any path other than `@/lib/actions/vendor-dashboard`.
