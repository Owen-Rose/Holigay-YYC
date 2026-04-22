# Phase 1 Data Model: Consolidate Duplicate Vendor Portals

**Date**: 2026-04-21
**Branch**: `002-consolidate-vendor-portal`

This refactor does not change the database schema. There are no new entities, no migrations, no RLS policies, and no persisted fields. "Data model" here is limited to the in-memory TypeScript types the surviving module (`src/lib/actions/vendor-dashboard.ts`) exposes — which is unchanged — and the types removed with the deleted module (`src/lib/actions/vendor-portal.ts`).

---

## Types preserved (canonical: `src/lib/actions/vendor-dashboard.ts`)

All four types below are already exported from the canonical module today. This refactor does not modify them.

### `VendorApplication` (snake_case)

```ts
export type VendorApplication = {
  id: string
  status: string
  submitted_at: string
  event: {
    id: string
    name: string
    event_date: string
    location: string
  }
}
```

**Source**: `src/lib/actions/vendor-dashboard.ts:9`.
**Returned by**: `getVendorDashboardData()` (`recentApplications` field) and `getVendorApplicationsList()` (`data` field).
**Consumers**: `src/app/vendor-dashboard/page.tsx` (dashboard home recent list), `src/app/vendor-dashboard/applications/page.tsx` (full applications list).

### `VendorDashboardData`

```ts
export type VendorDashboardData = {
  counts: {
    pending: number
    approved: number
    rejected: number
    total: number
  }
  recentApplications: VendorApplication[]
}
```

**Source**: `src/lib/actions/vendor-dashboard.ts:21`.
**Returned by**: `getVendorDashboardData()` (as `VendorDashboardData | null`).
**Consumers**: `src/app/vendor-dashboard/page.tsx`.
**Note**: No `waitlisted` count (unlike the deleted `vendor-portal.ApplicationCounts`). The canonical dashboard UI does not surface a waitlisted count today; the applications-list page filters by status via `getVendorApplicationsList(status?)`.

### `VendorProfile` (snake_case)

```ts
export type VendorProfile = {
  id: string
  business_name: string
  contact_name: string
  email: string
  phone: string | null
  website: string | null
  description: string | null
}
```

**Source**: `src/lib/actions/vendor-dashboard.ts:198`.
**Returned by**: `getVendorProfile()` (as `{ success: true; data: VendorProfile } | { success: false; error: 'not_authenticated' | 'no_vendor_profile' | 'fetch_failed'; data: null }`).
**Consumers**: `src/app/vendor-dashboard/profile/page.tsx` via `src/components/forms/vendor-profile-form.tsx`.

### `VendorApplicationDetail`

```ts
export type VendorApplicationDetail = {
  id: string
  status: string
  submitted_at: string
  updated_at: string
  booth_preference: string | null
  product_categories: string[] | null
  special_requirements: string | null
  vendor: {
    business_name: string
    contact_name: string
    email: string
    phone: string | null
    website: string | null
    description: string | null
  }
  event: {
    id: string
    name: string
    event_date: string
    location: string
    description: string | null
    application_deadline: string | null
    max_vendors: number | null
    status: string
  }
  attachments: {
    id: string
    file_name: string
    file_path: string
    file_type: string
    file_size: number | null
    uploaded_at: string
  }[]
}
```

**Source**: `src/lib/actions/vendor-dashboard.ts:263`.
**Returned by**: `getVendorApplicationDetail(applicationId: string)`.
**Consumers**: `src/app/vendor-dashboard/applications/[id]/page.tsx`.
**Note**: Excludes `organizer_notes` field present on the raw `applications` row — this is a vendor-facing view.

---

## Types removed (deleted with `vendor-portal.ts`)

| Removed type | Old source | Replacement |
|--------------|------------|-------------|
| `VendorProfile` (camelCase: `businessName`, `contactName`, etc.) | `src/lib/actions/vendor-portal.ts:19` | Canonical `VendorProfile` (snake_case) in `vendor-dashboard.ts:198`. Consumers already import from `vendor-dashboard.ts`; only the deleted `(vendor)/vendor/page.tsx` used the camelCase shape. |
| `VendorApplication` (camelCase: `submittedAt`, `boothPreference`, etc.) | `src/lib/actions/vendor-portal.ts:32` | Canonical `VendorApplication` (snake_case) in `vendor-dashboard.ts:9` for list/dashboard use, or `VendorApplicationDetail` for detail use. The camelCase version had no consumers outside the deleted page. |
| `ApplicationCounts` (includes `waitlisted`) | `src/lib/actions/vendor-portal.ts:49` | Inlined counts object in `VendorDashboardData.counts` (without `waitlisted`; see note above). The standalone type had no consumers outside the deleted page. |
| `VendorDashboardResponse` | `src/lib/actions/vendor-portal.ts:60` | Canonical `VendorDashboardData \| null` (via `getVendorDashboardData()`) plus, for full vendor-profile access, `getVendorProfile()` return. The `{ success, error, data }` wrapper is not present on `getVendorDashboardData()` — the canonical function returns `null` for "no vendor profile" instead of an error shape. This was already the shape the single deleted caller had to handle; no new callers will encounter the change. |

---

## State transitions

N/A — functions are stateless and read-only. Each call independently reads `auth.getUser()` and `user_profiles` / `vendors` / `applications` via Supabase.

## Validation rules

N/A at this layer. Inputs to the canonical functions are either (a) no argument, or (b) a string `applicationId` / `status` whose runtime validity is enforced by Supabase query filters (the ID either matches a scoped row or the function returns `'not_found'`; the status either matches `VALID_STATUSES` at `vendor-dashboard.ts:120` or the filter is silently dropped).

## Relationships

No schema change. Existing relationships (scoped via `user_profiles.vendor_id` FK to `vendors.id`) are unchanged. The deleted `vendor-portal.ts` used email-based vendor lookup (`vendors.email = user.email`); the canonical module uses the FK. Neither approach is modified by this refactor — the email-based path simply disappears with the file.
