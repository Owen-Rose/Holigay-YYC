# Research: Vendor Account Linking and Contact Fields

**Feature**: 011-vendor-linking-and-contact-fields | **Date**: 2026-10-31

No `NEEDS CLARIFICATION` markers existed in the Technical Context: the what and why are Owen's
decisions in `docs/handoffs/2026-10-31-vendor-uat-findings.md` (UAT2-1, UAT2-2, UAT2-5, "Also
decided", "Spec 011 outline") and the three answers in the spec's Clarifications block. This file
records the mechanics the plan chose (R1–R12), why, and what was rejected, plus the facts checked
against the working tree (`dev` at `61c5822`) on 2026-10-31 that the design rests on. Each R-item
names the judgment call it settles; Owen can flip any of them in review of this docs PR.

## Verified facts (2026-10-31)

- **The submission RPC is identity-blind.** `submit_public_application(jsonb)`
  (`supabase/migrations/011_close_public_data_exposure.sql:30-205`) never reads `auth.uid()` and
  deliberately never writes `vendors.user_id` (its §3 comment: "user_id must survive for
  handle_new_user()'s email linking"). It upserts `vendors` by `email` (plain `TEXT UNIQUE`,
  case-sensitive), writes `phone` and `website`, inserts the three fixed-form columns on
  `applications` from the `legacy` branch, and inserts `attachments` rows from the `attachments`
  branch. `GRANT EXECUTE … TO anon, authenticated`. Returns
  `(application_id, vendor_id, vendor_created, event_name, event_date)`. Migrations 012–014 do
  not touch it.
- **Only the sign-up trigger links.** `handle_new_user` (`003_user_profiles.sql:47-79`) runs
  `AFTER INSERT ON auth.users`, matches `vendors.email = NEW.email` exactly, and sets both
  `user_profiles.vendor_id` and `vendors.user_id`. Nothing in `src/` writes either column; the
  invite path fires the same trigger.
- **Two columns, two consumers.** The four vendor-dashboard loaders
  (`src/lib/actions/vendor-dashboard.ts`) and `updateVendorProfile` (`src/lib/actions/vendors.ts`)
  resolve the vendor through `user_profiles.vendor_id`; RLS on `vendors`, `applications` and
  `attachments` (`005_rbac_rls_policies.sql:93-218`) keys on `vendors.user_id = auth.uid()`. A
  vendor can UPDATE their own `vendors` row only once `user_id` already equals `auth.uid()`
  (`vendor_update_own` USING + WITH CHECK), and `user_profiles` has an admin-only UPDATE policy.
  So neither column can be set by the vendor's own session: linking has to be `SECURITY DEFINER`.
- **The apply page does not know the session.** `src/app/(public)/apply/page.tsx` is a Server
  Component that reads `searchParams.event_id`, calls `getActiveEvents()` and
  `getEventQuestionnaire()`, and renders `DynamicApplicationForm`
  (`src/app/(public)/apply/_components/dynamic-application-form.tsx`, props `eventId`,
  `eventName`, `questions`, `useForm({ resolver: zodResolver(vendorInfoSchema) })` with no
  `defaultValues`) when a questionnaire exists, else `ApplicationPageClient`
  (`src/app/(public)/apply/client.tsx` → `src/components/forms/vendor-application-form.tsx` →
  `uploadFile` → `submitApplication`). The middleware protects only `/dashboard` and
  `/vendor-dashboard`.
- **`submitDynamicApplication`** (`src/lib/actions/answers.ts:78-262`) validates
  `{ eventId, vendor: vendorInfoSchema, answers }`, loads the questionnaire and questions, rejects
  foreign question ids, re-evaluates show-if, builds the payload (`vendor` with `phone`/`website`,
  `legacy: null`, `attachments: null`), calls the RPC with the cookie client, sends the
  confirmation mail to `vendor.email`, revalidates two paths. It runs as `authenticated` when a
  session exists but never reads the user.
- **`uploadFile` stays; `FileUpload` goes.** `src/lib/actions/upload.ts` is imported by the
  dynamic form (file answers) as well as the legacy wrapper. `src/components/ui/file-upload.tsx` is
  imported only by `vendor-application-form.tsx`.
- **`default-questions.ts` depends on the legacy schema file** for `PRODUCT_CATEGORIES` and
  `CATEGORY_LABELS` (questionnaire seed keys, not database columns). `upload.ts` and
  `src/test/next-config.test.ts` depend on `ALLOWED_FILE_TYPES`/`MAX_FILE_SIZE`/`MAX_FILES`.
- **Export** (`src/lib/actions/export.ts:86-262`): `requireRole('organizer')`, one select with the
  legacy columns and `vendor:vendors(… phone, website …)`, the 13-column header list written twice
  (empty-result branch at 163–177, main branch at 209–223). No test exists; the `ExportButton`
  has none either.
- **Review surfaces.** Organizer page `src/app/dashboard/applications/[id]/page.tsx`: `VendorInfo`
  renders a Phone row and `href={vendor.website}` raw (a value saved without a protocol becomes a
  relative link); `ApplicationDetails` (the fixed-form block) renders when
  `application.dynamicAnswers === null`. The vendor detail page
  `src/app/vendor-dashboard/applications/[id]/page.tsx` duplicates both blocks. The profile form
  (`src/components/forms/vendor-profile-form.tsx`) has Phone and Website inputs, a disabled Email,
  and no test. The "No vendor profile linked" state is an inline `NoVendorProfile()` in four pages.
- **Security harness** (`src/test/security/harness.ts`): `createAuthedUser` uses
  `auth.admin.createUser({ email_confirm: true })` then password sign-in (GoTrue rate limit 30 per
  5 minutes, keep users per file to a handful); the seeded vendor carries `phone`. Suites touching
  the contact fields: `submission-rpc.test.ts` (S1–S10, legacy payloads, phone assertions),
  `invite-flow.test.ts` (builds a vendor through `vendorInfoSchema`), `anon-writes.test.ts`,
  `dashboard-reads.test.ts`.
- **Email templates** do not use phone, website or the fixed-form fields. `scripts/smoke-check.mjs`
  sends only `business_name`, `contact_name`, `email` and counts legacy-form events rather than
  failing them.
- **Docs drift found while mapping** (fixed by the FR-026 docs task): `specs/README.md:45` still
  says spec 011 takes migration `014`; the backlog's UAT2-3 + UAT2-4 box (line 179) is unticked
  although PR #68 merged; "F-001" lives in the backlog, not `docs/ROADMAP.md`.

## Decisions

### R1 — Links are one `text[]` column, not three columns

**Decision**: `vendors.product_links text[] NOT NULL DEFAULT '{}'` with a CHECK that the array has
at most three elements and no NULL or empty element. `website` and `phone` stay as nullable
columns that nothing reads or writes after this change; both get a `COMMENT` saying so.

**Rationale**: FR-012 wants ordered, gap-free links where "Link 2 always means the second stored
link". One array holds that by construction; three columns would need compaction logic in every
writer and a cross-column CHECK to forbid `link1 NULL, link2 set`. The export reads
`product_links[1..3]`; the forms expand the array into three inputs and compact on save. Keeping
`website`/`phone` is the spec's own assumption (no destructive change) and, more usefully, keeps
the old code working during the minutes between applying `015` to a hosted project and deploying
the code that reads the new shape (spec Edge Cases "Rollout order").

**Alternatives considered**: three `link_1..3` columns (rejected: compaction and a cross-column
CHECK duplicated at every writer); a `jsonb` array (rejected: no element typing, no
`cardinality()`); dropping `website` in `015` (rejected: `getVendorProfile`, `export.ts` and the
old RPC payload would break in the deploy window).

### R2 — One link rule, in TypeScript, with a defensive re-check in SQL

**Decision**: a new module `src/lib/validations/product-links.ts` owns the rule:
`normalizeProductLink` (trim; prepend `https://` when the value does not start with
`http://`/`https://`, case-insensitively), `isWebAddress` (parses with `new URL()`, protocol
`http:`/`https:`, hostname contains a dot, no whitespace, at most 500 characters),
`productLinkFieldsSchema` (`link1` required, `link2`/`link3` optional, each trimmed →
normalized → checked), `compactProductLinks()` (drops blanks, keeps order) and
`toProductLinkFields()` (array → the three form slots). `vendorInfoSchema` and
`vendorProfileSchema` both extend the trio, so the apply form and the profile form validate
identically (spec Clarifications Q2). The actions compact to `product_links: string[]` before
writing. The RPC re-checks only shape — at most three, each `^https?://\S+$` and ≤ 500 — and
raises SQLSTATE `22023` otherwise, which `mapSubmissionError` collapses to the generic message
(Zod has already refused the value with the field message by then).

**Rationale**: the field-level messages (FR-011, story 2 scenarios 2 and 5) belong to Zod +
react-hook-form; the RPC is anonymously callable and must not trust its input (spec 006 R11), but
duplicating the normalization there would be a second rule to keep in step. Examples the rule
settles: `instagram.com/myshop` → `https://instagram.com/myshop`; `https://x.com/a` unchanged;
`not a link` → refused (space); `mailto:a@b.c` → `https://mailto:a@b.c` → refused (`new URL`
treats `a@b.c` as an invalid port); `example` → refused (no dot).

**Alternatives considered**: keep the existing `websiteRegex` (rejected: it accepts values without
a protocol, which is exactly the broken-link bug); normalize in the RPC too (rejected: two rules);
a `CHECK` with the URL regex on each element (rejected: CHECK cannot subquery `unnest`; a helper
function for the CHECK is more surface than the RPC re-check buys).

### R3 — `submit_public_application` is replaced in place, keeps its return shape, and tolerates the old payload

**Decision**: `015` does `CREATE OR REPLACE FUNCTION public.submit_public_application(p_submission
jsonb)` with the same signature and `RETURNS TABLE` (so no `DROP`, no regenerated return type, no
grant churn). Changes inside: (a) `v_uid := auth.uid()`; when set, the account's address
(`lower(email)` from `auth.users`) replaces `vendor.email` (FR-002); (b) the upsert writes
`product_links` and no longer writes `phone`/`website`; when the payload carries no
`product_links` array but a non-empty `website`, that one value is normalized into a one-element
array; when it carries neither, an existing vendor keeps its stored links (`ON CONFLICT … SET
product_links = CASE WHEN cardinality(EXCLUDED.product_links) = 0 THEN vendors.product_links ELSE
EXCLUDED.product_links END`); (c) the `legacy` and `attachments` keys are ignored and the
`applications` insert carries only `event_id, vendor_id, status` (FR-019); (d) after the upsert,
`PERFORM link_vendor_account_rows(v_vendor_id, v_uid)` when signed in (FR-002, link at submit).
Event gate, answer-ownership gate, duplicate gate, answer insert, `P0001`–`P0004` and the grants
are unchanged.

**Rationale**: the deploy window. `015` is applied to a hosted project before the code that reads
`product_links` is deployed there (FR-016, FR-025); in between, the old `submitDynamicApplication`
still sends `phone`/`website` and no `product_links`. The fallback keeps those minutes safe on both
projects, and the keep-existing-links rule stops a returning vendor's submission in that window
from wiping the links `015` just migrated. Dropping the `attachments` branch with the `legacy`
branch is the dead-code rule: only `submitApplication` ever populated it. The `attachments` table,
its policies and `AttachmentsList` are untouched (no row on either hosted project; cleaning the
read side is outside this spec).

**Alternatives considered**: a new function name with the old left in place (rejected: two
anon-callable write paths, the thing spec 006 removed); `DROP` + `CREATE` to add a `vendor_email`
return column (rejected: the action can read the account address itself — R7 — and the return
type then stays stable for `database.ts`); requiring at least one link inside the RPC (rejected:
breaks the deploy window; Zod enforces "first always present" at the only two entry points).

### R4 — The tie is written by one private helper that never re-points

**Decision**: `public.link_vendor_account_rows(p_vendor_id uuid, p_user_id uuid) RETURNS boolean`,
`SECURITY DEFINER`, with EXECUTE revoked from `PUBLIC`, `anon` and `authenticated`, so only the
owner's other definer functions (the submit RPC and the self-heal RPC) can call it. Steps: refuse
(`false`) if the profile is already tied to a *different* vendor; `UPDATE vendors SET user_id =
p_user_id WHERE id = p_vendor_id AND user_id IS NULL`; if no row changed and the row is not already
tied to `p_user_id`, refuse (`false`: tied to someone else, FR-004); then `UPDATE user_profiles SET
vendor_id = p_vendor_id WHERE id = p_user_id AND vendor_id IS NULL`; return `true`. A fully tied
pair produces no write at all (story 1 scenario 7).

**Rationale**: both callers need identical semantics (both directions, one transaction, never
re-point) and FR-004 is easy to get subtly wrong twice. Revoking EXECUTE from every API role means
PostgREST never exposes it; a definer body runs as the owner, for which the revoke does not apply.

**Alternatives considered**: inline the two UPDATEs in each RPC (rejected: the FR-004 guard
duplicated); a trigger on `vendors` (rejected: the self-heal has nothing to trigger on).

### R5 — Self-heal is a no-argument RPC scoped by `auth.uid()`

**Decision**: `public.link_vendor_account() RETURNS uuid`, `SECURITY DEFINER`, EXECUTE granted to
`authenticated` only (revoked from `PUBLIC` and `anon`). `auth.uid()` NULL → `42501`. Profile
already tied → run the helper (a no-op when fully tied; heals a half-tied pair) and return the
`vendor_id`. Otherwise read `lower(email)` from `auth.users` for the caller, pick
`vendors WHERE lower(email) = that AND (user_id IS NULL OR user_id = caller) ORDER BY (email =
that) DESC, created_at LIMIT 1`, call the helper, return the vendor id on success or NULL.

**Rationale**: FR-003 — the function takes nothing from the caller but the JWT, so it can only ever
tie the caller's own account to the row matching the caller's own verified address. Case-
insensitive matching is the spec's rule for new linking; the exact-match preference only matters
if two rows differ by case (possible: `vendors.email` is case-sensitively unique), and prefers the
one the sign-up trigger would have chosen. Reading `auth.users` from a `postgres`-owned definer
function is the established pattern (the `handle_new_user` trigger lives on that table; the
hosted `postgres` role holds SELECT on `auth.users`).

**Alternatives considered**: `auth.jwt() ->> 'email'` (rejected as primary: the claim can lag a
changed address — out of scope, but the users table is the source of truth; recorded as the
fallback if the hosted grant ever bites); a parameter for the vendor id (rejected: that is "claim
an application by identifier", explicitly not doing); running the self-heal in the middleware
(rejected: a write on every request, and the middleware never needs the result).

### R6 — Self-heal runs from one resolver used by every vendor loader

**Decision**: a plain module (no `'use server'`, so it is not a public action endpoint)
`src/lib/vendor/resolve-vendor-id.ts` exporting `resolveVendorId(supabase, userId): Promise<string
| null>`: read `user_profiles.vendor_id`; when NULL, `rpc('link_vendor_account')` and return its
result. The four loaders in `vendor-dashboard.ts` and `updateVendorProfile` replace their copied
lookup block with it.

**Rationale**: FR-001 says "any vendor dashboard page", and every page goes through one of those
five functions; one call site per function is the smallest change that also retires the 5× copy
the architecture review flagged. The RPC is idempotent and self-scoped, so calling it from a read
path is safe; the plan's Complexity Tracking records it.

**Alternatives considered**: call the RPC in the vendor-dashboard `layout.tsx` (rejected: it is a
client component today and the loaders would still need the id); a `requireVendor()` helper that
also reads the user (rejected as scope creep; this resolver is a step toward it).

### R7 — The locked address is `readOnly`, and the action overrides the email too

**Decision**: `apply/page.tsx` calls `supabase.auth.getUser()` and passes `accountEmail: string |
null` to `DynamicApplicationForm`. When set, the form's `defaultValues.email` is the address and
the email `Input` renders `readOnly`, `aria-readonly="true"` and a one-line hint through the
primitive's existing `hint` prop. `submitDynamicApplication` calls `getUser()` after validation
and, when a session exists, replaces `vendor.email` with the account address before building the
payload and before sending the confirmation mail. The RPC overrides independently (R3).

**Rationale**: react-hook-form drops `disabled` fields from the submitted values (they come back
`undefined`), which would fail `vendorInfoSchema`; `readOnly` keeps the value, stays focusable
for screen readers and is what the primitive already styles. The action-level override is what
makes the confirmation mail go to the real address without changing the RPC's return shape; the
RPC-level override is the guarantee (SC-003) — a tampered request cannot get past either.

**Alternatives considered**: `disabled` + a hidden input (rejected: two inputs for one value);
trusting the client because the field is locked (rejected: FR-002, server actions are public
POST endpoints).

### R8 — One `NoVendorProfile` server component

**Decision**: `src/components/vendor/no-vendor-profile.tsx`, an async Server Component that reads
`getUser()` itself and renders the heading, the FR-007 sentence with the address, and the
`/apply` link; the four inline copies are replaced by it. The `vendors.ts` error string is unchanged.

**Rationale**: the copy is now a spec requirement with a dynamic value; four copies would drift.
Reading the user inside the component keeps the loaders' return types unchanged (one extra
`getUser()` only on the empty-state branch).

### R9 — Shared contact-block fragments

**Decision**: `src/components/forms/product-links-fields.tsx` (client; the heading as an `<h3>`
plus three `Input`s wired through `register`/`errors` props) used by the dynamic form and the
profile form; `src/components/vendor/product-links-list.tsx` (server-safe; an ordered list of
`<a href target="_blank" rel="noopener noreferrer">`) used by both detail pages in place of the
Website row. The Phone input/row disappears from all four surfaces; `getVendorProfile`,
`getApplicationById`, `getApplications`, the vendor detail loader and the export select
`product_links` instead of `phone, website`.

**Rationale**: FR-010/FR-015 require the same heading and slots on both forms; FR-013 the same
link list on the review page, and the vendor detail page mirrors it. The fragment is `'use
client'` only because it renders inside client forms; the list has no interactivity.

### R10 — Legacy removal, and what stays behind

**Decision**: delete `apply/client.tsx`, `components/forms/vendor-application-form.tsx`,
`components/ui/file-upload.tsx`, `submitApplication` (and its unused `requireRole` import) in
`applications.ts`, and `applicationDetailsSchema`, `applicationFormSchema`,
`applicationSubmitSchema`, `BOOTH_PREFERENCES` and the two regexes in `validations/application.ts`;
move `PRODUCT_CATEGORIES` and `CATEGORY_LABELS` into `src/lib/questionnaire/default-questions.ts`
(they are seed data); keep `ALLOWED_FILE_TYPES`, `FILE_TYPE_LABELS`, `MAX_FILE_SIZE`, `MAX_FILES`,
`fileSchema`, `filesSchema` and `vendorInfoSchema` in `validations/application.ts`. The apply
page's no-questionnaire branch renders a "not accepting applications" card. Both detail pages
drop `ApplicationDetails` and always render `DynamicAnswers`. Tests removed:
`application-form.test.tsx`, `application-detail-legacy.test.tsx`, the `submitApplication` half
of `applications-email-warning.test.ts`, the `applicationFormSchema` cases of
`application-validation.test.ts`; `apply-legacy-event.test.tsx` is rewritten as the
no-questionnaire case. `smoke-check.mjs`'s legacy-event count becomes a plain informational count
with its comment corrected.

**Rationale**: FR-017/FR-020 list exactly these; the kept constants have live importers (R-facts).

### R11 — Export header list defined once

**Decision**: `EXPORT_HEADERS` as a module constant in `export.ts`, used by both branches; rows
read `product_links[0]`, `[1]`, `[2]` (blank when absent). A unit test with a mocked client
asserts the header row and one data row.

### R12 — Types and local loop

**Decision**: `supabase db reset` (applies `015` locally) → `npm run db:types:local` regenerates
`src/types/database.ts` (`vendors.product_links: string[]`, `Functions.link_vendor_account`,
`Functions.link_vendor_account_rows`) → `npm run test:security`. The generated file is committed
in the migration PR, as spec 009/013 did.

## Facts to confirm during implementation (not blockers)

- `postgres` can `SELECT` from `auth.users` inside a definer function on both hosted projects
  (expected yes; the local stack proves the SQL, the dev walkthrough proves hosted). Fallback: R5.
- `new URL('https://mailto:a@b.c')` throws in Node 20+ (invalid port) — the unit test for
  `isWebAddress` pins the spec's `mailto:` example either way.
- GoTrue sign-in rate limit allows the linking suite's user count (planned: six users in one
  file, well under 30 per 5 minutes).
