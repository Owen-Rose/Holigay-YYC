# Contract: `public.submit_public_application(p_submission jsonb)` — v2 (spec 011)

**Feature**: 011-vendor-linking-and-contact-fields | **Date**: 2026-10-31
**Supersedes**: `specs/006-close-public-data-exposure/contracts/submit-public-application.md`
for the payload and behaviour; the invocation, security posture and return shape are unchanged.
**Body**: [`migration-015.md`](./migration-015.md) §5.
**Invoked by**: `submitDynamicApplication` (`src/lib/actions/answers.ts`) with the cookie-backed
server client, so the call runs as `anon` for a visitor and as `authenticated` for a signed-in
person; `scripts/smoke-check.mjs` (anon).

## Input

```jsonc
{
  "event_id": "uuid",                        // required
  "vendor": {
    "business_name": "text",                 // required, 2–100 (Zod)
    "contact_name": "text",                  // required, 2–100 (Zod)
    "email": "text",                         // required for an anonymous caller; IGNORED for a signed-in caller
    "description": "text | null",            // '' → NULL
    "product_links": ["https://…", "…"]      // 0–3 absolute http(s) URLs, already normalized and compacted by the app
  },
  "answers": [                               // may be absent / null / []
    { "event_question_id": "uuid", "value": { "kind": "text", "value": "…" } }
  ]
}
```

Keys the function ignores on purpose (FR-019): `legacy` (and its `booth_preference`,
`product_categories`, `special_requirements`), `attachments`, `vendor.phone`. `vendor.website` is
read only when `vendor.product_links` is absent, as a one-element fallback for a deploy that still
sends it (research R3); the app never sends it after spec 011.

## Behaviour (one transaction, in order)

| # | Step | Failure |
|---|---|---|
| 1 | Event exists and is `active` | `P0002`, `P0001` |
| 2 | Every `answers[].event_question_id` belongs to this event's questionnaire | `P0004` |
| 3 | **Identity**: `auth.uid()` set → the account's `lower(email)` from `auth.users` replaces `vendor.email`; else `lower(trim(vendor.email))` | `22023` when empty |
| 4 | **Links**: trim, drop blanks; ≤ 3; each matches `^https?://\S+$` and ≤ 500 chars | `22023` |
| 5 | Vendor upsert by `email`: insert, or update `business_name`, `contact_name`, `description`, `product_links` (an empty array keeps the stored links), `updated_at` | — |
| 6 | Application insert `(event_id, vendor_id, 'pending')`; conflict → no row | `P0003` (rolls back step 5) |
| 7 | **Link at submit**: `auth.uid()` set → `link_vendor_account_rows(vendor_id, uid)`; a `false` result (already tied elsewhere) is silent | — |
| 8 | Answers bulk insert | `23505` on a duplicated question id → generic |

Anonymous callers (FR-005): steps 3 and 7 are no-ops; behaviour is 006's minus the dropped
branches.

## Output

Unchanged: one row `(application_id uuid, vendor_id uuid, vendor_created boolean, event_name
text, event_date date)`; call with `.single()`.

## What the caller must do

- Validate with `vendorInfoSchema` + the answers schema first; compact the three link fields with
  `compactProductLinks` into `product_links` (never send `link1..3` to the RPC).
- When a session exists, read `getUser()` and use the account address for the confirmation mail
  (the RPC does not return the address it used; research R7).
- Map errors with `mapSubmissionError` only; never surface `message`/`details`/`hint`.

## Security properties (asserted by `security-test-matrix.md`)

- A signed-in caller cannot submit under another address (S-row "tampered email").
- A signed-in submission ties exactly the caller's account; an existing tie on either side is
  left alone.
- An anonymous submission creates no tie and leaves `vendors.user_id` NULL for the sign-up trigger.
- `legacy`/`attachments` payloads are accepted and ignored: no row in `attachments`, fixed-form
  columns NULL.
