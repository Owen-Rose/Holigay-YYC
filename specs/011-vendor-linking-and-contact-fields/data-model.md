# Data Model: Vendor Account Linking and Contact Fields

**Feature**: 011-vendor-linking-and-contact-fields | **Date**: 2026-10-31

**One migration, `015_vendor_links_and_account_linking.sql`.** It adds one column and one CHECK to
`vendors`, moves `website` into it, adds two functions and replaces one. No table is created, no
RLS policy or storage rule changes, no grant on an existing object changes. Full SQL:
[`contracts/migration-015.md`](./contracts/migration-015.md). `src/types/database.ts` is
regenerated (`npm run db:types:local`).

## Entities

### Vendor record (`public.vendors`) after `015`

| Column | Type | Change | Rule |
|---|---|---|---|
| `id` | uuid PK | — | |
| `business_name`, `contact_name` | text NOT NULL | — | 2–100 characters (Zod) |
| `email` | text NOT NULL UNIQUE | — | upsert key of the submission RPC; lower-cased by the apply form; for a signed-in submission replaced by the account's address (FR-002) |
| `description` | text NULL | — | ≤ 1000 characters |
| **`product_links`** | **text[] NOT NULL DEFAULT '{}'** | **new** | CHECK `vendors_product_links_shape`: `cardinality ≤ 3`, no NULL element, no `''` element. Each element is an absolute `http(s)` URL ≤ 500 characters (enforced by Zod on both forms and re-checked by the RPC, SQLSTATE `22023`). Ordered and gap-free by construction: "Link 2" is always `product_links[2]` |
| `website` | text NULL | retired | copied into `product_links[1]` by `015` (normalized: `https://` prepended when no scheme); never read or written afterwards; `COMMENT` says so |
| `phone` | text NULL | retired | never collected, shown or written afterwards; `COMMENT` says so |
| `user_id` | uuid NULL → `auth.users` | — | one half of the Tie; written by `handle_new_user`, `submit_public_application` (new) and `link_vendor_account` (new); never re-pointed once set |
| `created_at`, `updated_at` | timestamptz | — | `updated_at` maintained by the existing trigger |

**Why no `≥ 1` CHECK**: rows that pre-date the change and had no website legitimately hold `{}`;
the "first link always present" rule (FR-012) is enforced at the two entry points (apply form,
profile form) and the profile form refuses to save until Link 1 is filled (Clarifications Q2).

### Account (`auth.users` + `public.user_profiles`)

| Column | Change | Rule |
|---|---|---|
| `auth.users.email` | — | the verified address; lower-case (GoTrue); read by both new linking steps |
| `user_profiles.vendor_id` | — | the other half of the Tie; writers as for `vendors.user_id`; `NULL` until tied; never changed once set |
| `user_profiles.role` | — | linking is role-agnostic (Clarifications Q3) |

### Application (`public.applications`)

Unchanged schema. After `015` the submission RPC inserts only `event_id, vendor_id, status`; the
`booth_preference`, `product_categories` and `special_requirements` columns stay, are never
written again and are no longer selected by any reader (organizer detail, vendor detail, list,
export). The `attachments` table is likewise never written again (the RPC's attachments branch is
dropped with the fixed form); its RLS and the storage policies are untouched.

### The Tie

The two-way association `vendors.user_id = auth.users.id` **and** `user_profiles.vendor_id =
vendors.id`, always written together in one transaction by `link_vendor_account_rows()`:

```
                 ┌──────────────────────────────────────────────────────────────┐
                 │ untied: profile.vendor_id IS NULL, no vendors row has user_id │
                 └───────────────┬──────────────┬───────────────┬───────────────┘
   account created, a vendors    │   signed-in  │  signed-in    │  vendor dashboard read,
   row has email = NEW.email     │   submission │  submission   │  profile.vendor_id NULL,
   (exact; trigger, unchanged)   │   (row exists│  (row created)│  a row has lower(email)
                                 ▼              ▼               ▼  = account email
                 ┌──────────────────────────────────────────────────────────────┐
                 │ tied: both columns set, same pair                            │
                 └──────────────────────────────────────────────────────────────┘
   Guard (FR-004, helper): if the profile already points at another vendor, or the vendors row
   already carries another user_id → no write, caller told "not tied". A fully tied pair → no write.
```

| Writer | When | Match rule | Who it can tie |
|---|---|---|---|
| `handle_new_user` (003, unchanged) | `AFTER INSERT ON auth.users` | `vendors.email = NEW.email` (exact) | the new account only |
| `submit_public_application` (015) | after the vendor upsert, when `auth.uid()` is set | the upserted row — its email *is* the account address | the caller only |
| `link_vendor_account` (015) | called by the vendor loaders when `profile.vendor_id` is NULL | `lower(vendors.email) = lower(account email)`, untied or already the caller's | the caller only |

### Product link (value object)

| Step | Rule | Where |
|---|---|---|
| trim | leading/trailing whitespace removed | Zod, RPC |
| normalize | no `http://`/`https://` prefix (case-insensitive) → `https://` prepended | Zod (`normalizeProductLink`); RPC only for the `website` fallback |
| validate | parses as a URL; protocol `http:`/`https:`; hostname contains `.`; no whitespace; ≤ 500 characters | Zod (`isWebAddress`, field message) ; RPC re-check (`^https?://\S+$`, length) → `22023` |
| compact | blank slots dropped, order kept, at most three | `compactProductLinks` (actions); RPC drops blanks |
| required | slot 1 non-empty before normalization | Zod only (both forms) |

## `submit_public_application` payload, v2

```jsonc
{
  "event_id": "uuid",
  "vendor": {
    "business_name": "text",
    "contact_name": "text",
    "email": "text",                 // ignored when the caller is signed in (account address wins)
    "description": "text | null",
    "product_links": ["https://…"]   // 0–3 after compaction; absent → see fallback
  },
  "answers": [{ "event_question_id": "uuid", "value": { /* AnswerValue */ } }]
  // "legacy", "attachments", "vendor.phone", "vendor.website": ignored (website: one-element
  // fallback only when product_links is absent — deploy window, research R3)
}
```

Return shape unchanged: `(application_id, vendor_id, vendor_created, event_name, event_date)`.

## Migration `015` outline

| § | Content | Reversible? |
|---|---|---|
| 1 | `ALTER TABLE vendors ADD COLUMN product_links …`; CHECK `vendors_product_links_shape`; three `COMMENT ON COLUMN` | additive |
| 2 | `UPDATE vendors SET product_links = ARRAY[normalized(website)] WHERE btrim(website) <> '' AND cardinality(product_links) = 0` | data copy; `website` untouched |
| 3 | `CREATE OR REPLACE FUNCTION link_vendor_account_rows(uuid, uuid)`; `REVOKE ALL … FROM PUBLIC, anon, authenticated` | new object |
| 4 | `CREATE OR REPLACE FUNCTION link_vendor_account()`; `REVOKE … FROM PUBLIC, anon`; `GRANT EXECUTE … TO authenticated` | new object |
| 5 | `CREATE OR REPLACE FUNCTION submit_public_application(jsonb)` (same signature and return type); `COMMENT` updated; grants left as 011 set them | in-place replacement |

Nothing else: no policy, no view, no trigger, no storage rule. `supabase/migrations/README.md`
gains the `015` row.

## Generated types after `015`

- `Database['public']['Tables']['vendors']['Row'].product_links: string[]` (plus `Insert`/`Update`).
- `Database['public']['Functions']['link_vendor_account']: { Args: Record<string, never>; Returns: string }` (nullable at runtime; supabase-js types the RPC result as `string | null` through `.rpc()`'s data).
- `Database['public']['Functions']['link_vendor_account_rows']: { Args: { p_vendor_id: string; p_user_id: string }; Returns: boolean }` — present in the types because the generator lists every function in `public`; not callable by any API role.
- `submit_public_application` entry unchanged.

## Validation types (TypeScript)

```ts
// src/lib/validations/product-links.ts
export type ProductLinkFields = { link1: string; link2: string; link3: string }; // z.infer
// src/lib/validations/application.ts
export type VendorInfo = { businessName; contactName; email; description; link1; link2; link3 };
// src/lib/validations/vendor.ts
export type VendorProfileInput = { businessName; contactName; description; link1; link2; link3 };
// src/lib/actions/vendor-dashboard.ts
export type VendorProfile = { id; business_name; contact_name; email; product_links: string[]; description };
```
