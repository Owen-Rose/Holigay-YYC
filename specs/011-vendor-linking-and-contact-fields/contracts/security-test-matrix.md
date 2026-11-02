# Contract: Security Test Matrix (spec 011 additions)

**Feature**: 011-vendor-linking-and-contact-fields | **Date**: 2026-10-31
**Suite location**: `src/test/security/` (Vitest project `security`, node env, real local
Supabase stack; `describe.runIf(stackUp)`, mandatory in CI via `CI_REQUIRE_SECURITY_TESTS=1`).
Extends `specs/006-close-public-data-exposure/contracts/security-test-matrix.md`; the 006, 005
Phase 11 and 009/010 rows keep running.

Clients as in 006: **anon**, **service** (fixtures, ground truth, cleanup only), **authed**
(`createAuthedVendor(suffix)` — `auth.admin.createUser` + password sign-in; the harness gives
vendor users `sec-vendor-user-<suffix>@…` so the trigger does not link them to the seeded row).
The linking suite needs a user whose address *equals* a vendor row's: it creates the vendor row
itself with the service client after or before the user, per row. Budget: ≤ 6 users in the file (U1–U6)
(GoTrue sign-in limit 30 per 5 minutes).

## New suite — `src/test/security/vendor-linking.test.ts` (FR-023; rows L1–L11)

`links(userId, vendorId)` reads `user_profiles.vendor_id` and `vendors.user_id` with the service
client, as `invite-flow.test.ts` does.

| # | Test | Client | Asserts | Covers |
|---|---|---|---|---|
| L1 | **Apply signed in.** Authed vendor U1 (no vendor row) submits the RPC with `vendor.email = U1.email` and one required answer | authed U1 | one row returned; `vendors.user_id = U1`, `user_profiles.vendor_id = vendor`; U1's own `from('applications').select()` returns the application (RLS passes) | FR-002, story 1 sc. 1–2, SC-001 |
| L2 | **Apply signed out, then account.** Anon submits as address A2; then `auth.admin.createUser(A2)` | anon, service | after creation both columns tied (the trigger; existing behaviour) | FR-005, story 1 sc. 3 |
| L3 | **Account, then apply signed out, then dashboard read.** Authed U3 exists; anon submits with `vendor.email = U3.email`; `links()` both NULL; U3 calls `rpc('link_vendor_account')` | authed U3 | rpc returns the vendor id; both columns tied; U3's `applications` select returns the row; a second call returns the same id and `updated_at` is unchanged | FR-001, story 1 sc. 4, 7 |
| L4 | **Mixed case.** Service inserts a vendor row with email `Mixed.<suffix>@example.com` (no user); U4's address is the lower-case form | authed U4 | self-heal returns that row; both columns tied | story 1 sc. 5 |
| L5 | **No match.** U5 (fresh address) calls self-heal | authed U5 | `NULL`; U5's profile `vendor_id` still NULL; no vendor row gained a `user_id` | FR-001 "nothing changes", story 1 sc. 6 |
| L6 | **Tied elsewhere is left alone.** Service inserts vendor row V6 with email = U5's address and `user_id = U4`; U5 calls self-heal | authed U5 | `NULL`; V6 still `user_id = U4`; U5's profile NULL | FR-004, story 1 sc. 9 |
| L7 | **Anon refused.** `anon.rpc('link_vendor_account')` | anon | `error.code === '42501'` | FR-022 |
| L8 | **Only your own account.** U5 (untied) calls self-heal while U1 and U3 are tied | authed U5 | U1's and U3's rows unchanged (`links()` before = after); `authed.rpc('link_vendor_account_rows', { p_vendor_id: V_U1, p_user_id: U5 })` → `42501` | FR-003, FR-022 |
| L9 | **Tampered address ignored.** U1 (tied in L1 to a lower-case row) submits on event B with `vendor.email = emailFor('stranger')` | authed U1 | returned `vendor_id` = U1's row; no vendor row exists for the stranger address; the application belongs to U1's vendor | FR-002, story 1 sc. 8, SC-003 |
| L10 | **Fixed-form keys ignored.** Anon submits with `legacy: { booth_preference: 'indoor', product_categories: ['art'], special_requirements: 'x' }`, `attachments: [{ file_name: 'a.png', file_path: 'uploads/x', file_type: 'image/png', file_size: 1 }]`, `vendor.phone: '403-555-0000'` | anon | success; `applications` row has the three columns NULL; zero `attachments` rows for it; vendor `phone` NULL | FR-019, story 3 sc. 4 |
| L11 | **Any role links.** U6 is created as a vendor user then promoted to `organizer` with the service client (`user_profiles.role`); a vendor row with U6's address exists untied; U6 calls self-heal | authed U6 | returns the row id; both columns tied; role still `organizer` | Clarifications Q3, spec edge case "Signed-in organizer or admin on the apply page" |

L9 must use an account tied to a **lower-case** row: the submit RPC upserts by the exact lower-cased account address (spec Clarifications 2026-11-02 Q2), so U4's mixed-case row from L4 would not be found — a second row would be created and the helper would refuse to re-point it.

Cleanup: every user id is pushed to `fx.authUserIds`; vendor emails end in the run suffix so
`purgeRun` sweeps them.

## Updated rows — `src/test/security/submission-rpc.test.ts`

| # | Was (006) | Now |
|---|---|---|
| S1 | legacy variant with an attachment | **new vendor with three product links**: `product_links: ['https://a.example', 'https://b.example', 'https://c.example']` stored in order; `vendor_created = true` |
| S2 | dynamic variant with answers | unchanged assertions; payload drops `legacy: null` |
| S3 | returning vendor's phone updated on event B | returning vendor's **links replaced** (`['https://new.example']`), exactly one vendor row, `vendor_created = false` |
| S4 | unchanged details, event B | unchanged |
| S5 | duplicate → `P0003`, phone unchanged | duplicate → `P0003`, **links unchanged** |
| S6–S8 | unchanged | unchanged (payloads lose `legacy`) |
| S9 | attachment missing `file_name` → rollback | **replaced**: `product_links` with four entries → `22023`; zero new vendor/application rows (rollback) |
| S10 | minimal payload | minimal payload (no `product_links`) → success, `product_links = []` |
| S11 | — | **new**: a link without a scheme (`instagram.com/x`) → `22023` (the RPC does not normalize; the app does) |
| S12 | — | **new**: `website: 'shop.example'` and no `product_links` (old payload) → `product_links = ['https://shop.example']` (deploy-window fallback, research R3) |
| S13 | — | **new**: returning vendor from S1 submits on event B with `product_links: []` → stored links unchanged (keep-existing rule) |
| S14 | — | **new**: anon submission → `vendors.user_id` NULL and no profile touched (FR-005) |

`vendorFor()` returns `{ business_name, contact_name, email, description: '', product_links:
[...] }`; `vendorRows()` selects `id, product_links, business_name`.

## Updated rows elsewhere

| File | Change |
|---|---|
| `invite-flow.test.ts` | `insertVendor` drops phone/website (adds nothing — the column defaults); the UAT-11 case builds its vendor through the new `vendorInfoSchema` with `link1: 'shop.example'` and asserts the parse output |
| `anon-writes.test.ts` | W1 insert payload and W2 update payload use `business_name` only (no `phone`); the "seeded value survives" assertion reads `business_name` |
| `dashboard-reads.test.ts` | the copied organizer select drops the three fixed-form columns and `phone, website`, adds `product_links` (it mirrors `getApplicationById`) |
| `harness.ts` | `seedFixtures` inserts the seeded vendor with `product_links: ['https://seeded.example']` and no `phone` |
| `storage.test.ts`, `anon-reads.test.ts`, `questionnaire-save.test.ts`, `template-writes.test.ts`, `default-questionnaire-seed.test.ts` | unchanged |

## Not covered here (and why)

- The locked email input and the action-level override are app behaviour: unit tests
  (`server-actions-and-ui.md` §14). The RPC-level override (L9) is the security property.
- `handle_new_user`'s exact-case match is unchanged (spec Assumptions); `invite-flow` keeps its
  mixed-case-via-form-normalization case.
