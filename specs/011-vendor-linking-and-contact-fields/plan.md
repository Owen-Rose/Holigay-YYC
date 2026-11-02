# Implementation Plan: Vendor Account Linking and Contact Fields

**Branch**: `011-vendor-linking-and-contact-fields` | **Date**: 2026-10-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-vendor-linking-and-contact-fields/spec.md`
(Clarifications Sessions 2026-10-31 and 2026-11-02, six answers; decisions carried in from
`docs/handoffs/2026-10-31-vendor-uat-findings.md` UAT2-1, UAT2-2, UAT2-5, "Also decided", "Spec
011 outline"); reasoning in `research.md` (R1–R12).

## Summary

The three stories reduce to one migration and three application changes:

1. **Migration `015`** (`research.md` R1, R3–R5; `contracts/migration-015.md`) — a
   `vendors.product_links text[]` column with a shape CHECK, the website → Link 1 data move, a
   private `link_vendor_account_rows()` helper that ties an account to a vendor row in both
   directions and never re-points, a signed-in-only `link_vendor_account()` self-heal RPC keyed on
   `auth.uid()`, and an in-place replacement of `submit_public_application(jsonb)` that uses the
   caller's account address when signed in, writes `product_links` instead of phone/website,
   ignores the fixed-form and attachments keys, and ties the account inside the same transaction.
   Same signature, same return type, same grants; no RLS change.
2. **Linking in the app** (US1; R6–R8) — the apply page reads the session and passes the account
   address to the questionnaire form, which prefills and locks the email field; the submit action
   overrides the email too; one `resolveVendorId()` resolver calls the self-heal RPC from every
   vendor loader; one `NoVendorProfile` server component carries the "matched by address" copy.
3. **The contact block on four surfaces** (US2; R2, R9, R11) — one `product-links.ts` rule
   (normalize, validate, compact) shared by `vendorInfoSchema` and `vendorProfileSchema`; a shared
   `ProductLinksFields` fragment on both forms; a `ProductLinksList` on both detail pages; eleven
   export columns from one header constant; phone gone everywhere.
4. **One apply form** (US3; R10) — the fixed form, its page branch, action, schemas, the
   `FileUpload` primitive and their tests removed; the no-questionnaire branch shows a
   not-accepting message.

Every per-project step (`015` on dev, the training walkthrough of the three orderings, `015` on
prod, the BL-17 promotion) is a `[manual]` task with an evidence row in `quickstart.md`. No new
packages. No RLS or storage changes.

## Technical Context

**Language/Version**: TypeScript 5.9, `strict: true` (unchanged); PL/pgSQL for migration `015`
**Primary Dependencies**: Next.js 16.0.7 App Router (RSC page + client forms), React 19.2, `@supabase/ssr` ^0.8 (cookie-backed server client — `auth.getUser()` on the apply page and in the actions), `@supabase/supabase-js` ^2.86 (`.rpc()`), `react-hook-form` ^7.68 + `zod` ^4.1 + `@hookform/resolvers`, `sonner`. **No new packages**
**Storage**: Supabase PostgreSQL — migration `015_vendor_links_and_account_linking.sql` (one column + CHECK on `vendors`, one data `UPDATE`, two new functions, one replaced function). No new table, no policy, view, trigger or storage change; `attachments` bucket untouched. `src/types/database.ts` regenerated with `npm run db:types:local`
**Testing**: Vitest `unit` project (jsdom; RTL for the three forms/components) + `security` project (real local stack: new `vendor-linking.test.ts` L1–L11, updated `submission-rpc`, `invite-flow`, `anon-writes`, `dashboard-reads`, harness) + the training-site walkthrough with real mailboxes (quickstart D2–D7)
**Target Platform**: Vercel (training = `dev` on the dev project, Production = `main` on the prod project); local CLI stack for tests
**Project Type**: single Next.js web application
**Performance Goals**: one extra `getUser()` on the apply page and in the submit action; one extra RPC round-trip per vendor-dashboard read **only while** the account is untied (zero once tied; an account that never matches a row pays it on every read); no new client bundle beyond the small fields fragment
**Constraints**: public submission stays one anon-callable transactional RPC (FR-022); the self-heal RPC is `authenticated`-only and takes no input (FR-003); every tie is written by one helper that never re-points (FR-004); `015` lands on a hosted project before the code that reads it, and the replacement RPC tolerates the old payload in between (R3); no co-authoring trailers on commits or PRs; each task starts only on Owen's go
**Scale/Scope**: ~7 new source files, ~16 edited, 5 deleted, 1 migration, ~9 new/updated unit test files, 1 new + 5 updated security suites, 11 `[manual]` evidence rows, ~10 docs at close incl. the constitution

## Constitution Check

*GATE: evaluated before Phase 0 and re-checked after Phase 1 design — PASS, with the two
deviations recorded in Complexity Tracking.*

| Principle | Check | Status |
|---|---|---|
| I — Zod `safeParse` before any DB call | `vendorInfoSchema` and `vendorProfileSchema` are rebuilt on the new `productLinkFieldsSchema`; `submitDynamicApplication` and `updateVendorProfile` parse first, exactly as today. The RPC re-checks link shape (`22023`) as defence in depth, not as the validator | PASS |
| I — `requireRole()` at the top of mutations | `updateVendorProfile` unchanged (vendor scoping via the resolver + RLS). `submitDynamicApplication` stays the spec 006 public class (anon-callable by design, already recorded). The new self-heal write runs inside loaders that have already done `getUser()`; the database, not the caller, scopes it (`auth.uid()`) — see Complexity Tracking | PASS |
| I — `{ success, error, data }` responses | every touched action keeps its existing response type; nothing throws across the boundary | PASS |
| I — RLS on user-data tables; append-only migrations | no new table; `015` is append-only; no policy is edited (unchanged ⇒ "unchanged or tightened"); the helper is executable by no API role and the self-heal RPC by `authenticated` only | PASS |
| I — generated types not hand-edited | `database.ts` regenerated by `db:types:local` in the migration PR | PASS |
| I — CI gates; no dead code | the fixed form, its page branch, action, schemas, the `FileUpload` primitive and their tests are deleted; the RPC's dead `attachments` branch goes with the `legacy` branch; `format → lint → test → build` unchanged | PASS |
| II — tests with every new/changed action and form | `submitDynamicApplication` (payload, override), `updateVendorProfile` (happy, validation, unlinked), `resolveVendorId`, `exportApplicationsCSV` (first test), `DynamicApplicationForm` (locked email, links), `VendorProfileForm` (first test), `ProductLinksList`, `NoVendorProfile`, `product-links` rule; security rows L1–L11 and S1–S14 (`contracts/security-test-matrix.md`) | PASS |
| III — UX consistency | both forms stay RHF + Zod; the fragment uses the `Input` primitive (`useId()`, `aria-invalid`, `aria-describedby`, `role="alert"` built in); the locked field is `readOnly` + `aria-readonly` with the primitive's `hint`; tokens only (`text-primary`, `text-foreground`, `text-muted`); profile save keeps its Sonner toasts; no new route segment, so no new `loading.tsx` | PASS |
| IV — RSC first; `revalidatePath`; matcher | `apply/page.tsx`, `NoVendorProfile` and `ProductLinksList` are Server Components; `ProductLinksFields` is `'use client'` only because it renders inside the two client forms; `submitDynamicApplication` keeps its two `revalidatePath` calls and `updateVendorProfile` its behaviour; the middleware matcher is untouched; no `next/image` concern (no images) | PASS |
| Stack lock-in | no dependency added; email still leaves through Resend | PASS |

## Project Structure

### Documentation (this feature)

```text
specs/011-vendor-linking-and-contact-fields/
├── spec.md                                   # US1–US3, FR-001–FR-026, SC-001–SC-008
├── checklists/requirements.md                # passed 2026-10-31
├── plan.md                                   # this file
├── research.md                               # R1–R12 + verified facts + docs drift found
├── data-model.md                             # vendors after 015, the Tie, the link value object, payload v2
├── quickstart.md                             # local loop, hosted apply recipe, evidence rows D1–D9 / P1–P2, docs list
├── contracts/
│   ├── migration-015.md                      # the SQL, outcomes tables, SQLSTATE contract, read-back checks
│   ├── submit-public-application-v2.md       # payload, behaviour, ignored keys, caller duties
│   ├── link-vendor-account.md                # the self-heal RPC + resolveVendorId()
│   ├── server-actions-and-ui.md              # schemas, actions, page/form/component shapes, exact strings, unit tests
│   └── security-test-matrix.md               # L1–L11 new, S1–S14 updated, other suite edits
└── tasks.md                                  # /speckit-tasks output (not created here)
```

### Source code (repository root)

```text
supabase/migrations/015_vendor_links_and_account_linking.sql   # NEW (contracts/migration-015.md)
supabase/migrations/README.md                                   # + 015 row
src/types/database.ts                                           # regenerated

src/lib/validations/product-links.ts        # NEW: normalize, isWebAddress, productLinkFieldsSchema, compact, toFields
src/lib/validations/application.ts          # vendorInfoSchema on the trio; legacy schemas/regexes/BOOTH_PREFERENCES removed; file constants kept
src/lib/validations/vendor.ts               # vendorProfileSchema on the trio; phone/website removed
src/lib/questionnaire/default-questions.ts  # PRODUCT_CATEGORIES + CATEGORY_LABELS move here
src/lib/vendor/resolve-vendor-id.ts         # NEW: resolveVendorId() → user_profiles.vendor_id or rpc('link_vendor_account')
src/lib/actions/answers.ts                  # getUser() override; payload v2 (product_links, no legacy/attachments)
src/lib/actions/vendors.ts                  # resolver; writes product_links, not phone/website
src/lib/actions/vendor-dashboard.ts         # resolver in all four loaders; selects product_links; fixed-form fields dropped
src/lib/actions/applications.ts             # submitApplication removed; selects drop fixed-form + phone/website, add product_links
src/lib/actions/export.ts                   # EXPORT_HEADERS (11 columns); Link 1–3 from product_links

src/app/(public)/apply/page.tsx             # getUser() → accountEmail; no-questionnaire card; legacy branch gone
src/app/(public)/apply/client.tsx           # DELETED
src/app/(public)/apply/_components/dynamic-application-form.tsx   # accountEmail prop, readOnly email + hint, ProductLinksFields, no phone/website
src/components/forms/product-links-fields.tsx     # NEW (client): heading + Link 1 */2/3 Inputs
src/components/forms/vendor-application-form.tsx  # DELETED
src/components/forms/vendor-profile-form.tsx      # ProductLinksFields; no phone/website
src/components/ui/file-upload.tsx                 # DELETED (legacy-only importer)
src/components/vendor/product-links-list.tsx      # NEW: ordered external links
src/components/vendor/no-vendor-profile.tsx       # NEW (async RSC): FR-007 copy with the account address
src/app/dashboard/applications/[id]/page.tsx      # Product links row via ProductLinksList; Phone + ApplicationDetails removed
src/app/vendor-dashboard/applications/[id]/page.tsx   # same
src/app/vendor-dashboard/page.tsx                 # <NoVendorProfile variant="card" />
src/app/vendor-dashboard/applications/page.tsx    # <NoVendorProfile variant="card" />
src/app/vendor-dashboard/profile/page.tsx         # <NoVendorProfile />; defaults via toProductLinkFields
scripts/smoke-check.mjs                           # legacy-event count comment corrected

src/test/product-links.test.ts                    # NEW
src/test/dynamic-application-form.test.tsx        # updated (locked email, links, no phone)
src/test/vendor-profile-form.test.tsx             # NEW
src/test/vendor-profile-action.test.ts            # NEW (US1: resolver path; US2: links write)
src/test/vendor-dashboard-actions.test.ts         # NEW (getVendorProfile)
src/test/applications-readers.test.ts             # NEW (getApplicationById)
src/test/answers-actions.test.ts                  # updated (payload v2, override)
src/test/resolve-vendor-id.test.ts                # NEW
src/test/product-links-list.test.tsx              # NEW
src/test/no-vendor-profile.test.tsx               # NEW
src/test/export.test.ts                           # NEW
src/test/apply-no-questionnaire.test.tsx          # rewrite of apply-legacy-event.test.tsx
src/test/application-form.test.tsx                # DELETED
src/test/application-detail-legacy.test.tsx       # DELETED
src/test/applications-email-warning.test.ts       # submitApplication half removed
src/test/application-validation.test.ts           # applicationFormSchema cases removed
src/test/security/vendor-linking.test.ts          # NEW (L1–L11)
src/test/security/submission-rpc.test.ts          # S1–S14 per the matrix
src/test/security/invite-flow.test.ts             # vendor builder on the new schema
src/test/security/anon-writes.test.ts             # no phone in payloads
src/test/security/dashboard-reads.test.ts         # mirrored select updated
src/test/security/harness.ts                      # seeded vendor: product_links, no phone
```

**Structure Decision**: the feature follows the existing layout — schemas in
`src/lib/validations/`, actions in `src/lib/actions/`, shared UI under `src/components/`. Two
small new directories: `src/lib/vendor/` for the resolver (a plain module that must not live in a
`'use server'` file) and `src/components/vendor/` for the two vendor-facing pieces shared by
organizer and vendor pages. The questionnaire form stays where spec 005 put it
(`apply/_components/`).

## Phases (mirror `tasks.md`)

| Phase | Story | Content | Ends when |
|---|---|---|---|
| 1 | setup | this plan's artifacts merged to `dev` as a docs-only PR (BL-16); `quickstart.md` evidence rows in place; `specs/README.md` lists 011 | PR merged |
| 2 | foundation | two parallel PRs: (T002) migration `015` + `npm run db:types:local` + `vendor-linking.test.ts` (L1–L11) + the S1–S14 / anon-writes / harness updates — one PR because the replaced RPC and its suite must move together; (T003) `product-links.ts` with its unit test; then `[manual]` D1 (`015` on dev). The `invite-flow` and `dashboard-reads` edits follow the app code they mirror (Phase 5) | `npm test` + `npm run test:security` green with `015` on the local stack; D1 filled |
| 3 | US1 | `resolveVendorId` + the five callers; `apply/page.tsx` session read + `accountEmail`; locked email in the form; action override; `NoVendorProfile`; unit tests (resolver, empty state, profile action, profile loader); `[manual]` D2–D5 on the training site | rows D2–D5 filled |
| 4 | US3 | legacy deletions (R10), the no-questionnaire card, `smoke-check.mjs` comment, test removals/rewrites; `[manual]` D8; T017 constitution PATCH amendment (stale form-test exemplar and primitive list, vendor-scoped authorization clarification). **Runs before US2**: `applicationFormSchema` is assembled from `vendorInfoSchema.shape.phone`/`.website`, so the trio cannot land while the fixed form exists; the deletion is invisible to vendors | `grep` for the removed names returns nothing; D8 filled |
| 5 | US2 | `vendorInfoSchema`/`vendorProfileSchema` on the trio; `ProductLinksFields` on both forms; `ProductLinksList` on both detail pages; phone removed from all four surfaces; `EXPORT_HEADERS`; selects/types updated; unit tests (forms, list, export, organizer reader); `invite-flow` and `dashboard-reads` suite edits; `[manual]` D6–D7 (with D2's contact-block half) | rows D6–D7 filled |
| 6 | rollout + docs | `[manual]` D9 cleanup; P1 (`015` on prod, Owen present, default mode); BL-17 promotion + smoke (P2); docs per FR-026 (`quickstart.md` list), including the drift fixed in passing (specs README `014` note, backlog UAT2-3+4 tick) | every evidence row ☑ |

Phases 3, 4 and 5 touch the same forms, loaders and detail pages; they are sequenced, not parallel
(spec priority P1 → P2 → P3 is unchanged as a label; execution order is US1 → US3 → US2 for the
reason in the table).
Each repo task is one branch off `dev` and one PR, commits tagged `[011-Txxx]`, gated by
`npm run lint && npm test && npm run build` with the local stack up, and starts only on Owen's go.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| A write (`link_vendor_account`) is invoked from read loaders rather than from a `requireRole()`-guarded mutation | FR-001 wants the tie to appear on the first dashboard read with no manual step; the RPC takes no caller input, is scoped by `auth.uid()` in the database, is idempotent, and runs at most once per tied account. **Classification: not a Principle I exception.** The vendor-side actions already authorize through `auth.getUser()` plus RLS rather than `requireRole()` (`vendors.ts` `updateVendorProfile` today); the self-heal keeps that model. The T005 PR body repeats this; T017 writes it into Principle I as a PATCH clarification | a "Link my account" button (rejected: a manual step, the thing UAT2-5 complained about); linking in the middleware (rejected: a write on every request for every role) |
| A `SECURITY DEFINER` function in `public` reads `auth.users` (the submit RPC and the self-heal RPC) | FR-002/FR-003 require the *verified* account address, not a client-supplied one; `auth.users.email` is the source of truth and `postgres`-owned definer functions already have that access (the `handle_new_user` trigger lives on the table) | `auth.jwt() ->> 'email'` (kept as the documented fallback, R5: the claim can lag an address change); passing the email from the action (rejected: the RPC is anon-callable and must not trust its input) |
