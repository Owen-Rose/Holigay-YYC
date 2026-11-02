# Quickstart: Vendor Account Linking and Contact Fields

**Feature**: 011-vendor-linking-and-contact-fields

This file is the **ops and evidence record** for spec 011 (the 009/010 pattern). Every `[manual]`
task in `tasks.md` is ticked only when its row below is filled in with what was actually
observed. Reasoning lives in `research.md`; exact SQL and strings in `contracts/`.

## Local development loop

```bash
# Full local stack; applies 001 → 015 from scratch
npx supabase db reset
# If auth health returns 502 after a reset:
docker restart supabase_kong_Holigay

# Regenerate the types (commit the result in the migration PR)
npm run db:types:local

# The constitution's gate before every PR (security suite self-skips if the stack is down)
npm run format:check && npm run lint && npm test && npm run build
npm run test:security          # vendor-linking.test.ts + the updated submission/invite suites

# Try it in the browser against the local stack
npm run dev
# 1. /apply signed out → the questionnaire form shows editable Email, no Phone, the
#    "Where can we view your products?" heading with Link 1 */Link 2/Link 3.
# 2. Sign in (scripts/seed-role.sql makes an admin; any local account works) → /apply → the
#    Email field holds the account address, is read-only and shows the hint.
# 3. Submit → /vendor-dashboard lists the application (link at submit).
# 4. Fresh account A (mailpit http://127.0.0.1:54324 for the confirmation) → /apply signed out in
#    a private window as A → sign in as A → /vendor-dashboard lists it (self-heal).
```

## Applying `015` to a hosted project

Both hosted projects take the migration through the Management API from a terminal, exactly as
`docs/runbooks/reset-hosted-project.md` §7 describes (one `POST
https://api.supabase.com/v1/projects/<ref>/database/query` with the whole file as the body; it
runs as one transaction), or as one SQL Editor block pasted by Owen. Dev writes are fine in either
permission mode; **prod needs the session in default mode** and the inventory → confirm → write →
verify sequence (backlog "Prod rule"). Nothing in `015` touches storage objects.

Inventory before (both projects):

```sql
SELECT count(*) AS vendors, count(*) FILTER (WHERE NULLIF(btrim(website), '') IS NOT NULL) AS with_website,
       count(*) FILTER (WHERE user_id IS NULL) AS untied FROM public.vendors;
SELECT count(*) FROM public.user_profiles WHERE vendor_id IS NULL AND role = 'vendor';
```

Verify after:

```sql
SELECT email, website, product_links, user_id FROM public.vendors ORDER BY created_at;  -- former websites now Link 1 (SC-008)
SELECT has_function_privilege('anon', 'public.link_vendor_account()', 'EXECUTE');          -- false
SELECT has_function_privilege('authenticated', 'public.link_vendor_account()', 'EXECUTE'); -- true
SELECT has_function_privilege('authenticated', 'public.link_vendor_account_rows(uuid, uuid)', 'EXECUTE'); -- false
SELECT obj_description('public.submit_public_application(jsonb)'::regprocedure);           -- mentions spec 011
```

Order (spec Edge Cases "Rollout order", FR-025): `015` on the dev project **before** the US1 code
reaches `dev`; `015` on prod **before** BL-17 promotes `dev` to `main`. The replacement RPC
tolerates the old payload in between (research R3).

## Evidence record

"Evidence" is what was observed: the read-back value, the toast text, the mail's recipient.
Dates ISO. No keys, no passwords, no real vendor addresses: use `<maintainer>+011-…` throwaways and
delete them afterwards (row D9). Each row names the task in `tasks.md` that owns it.

Training-site prerequisite: **two** active events with questionnaires on the dev project (create
the second as admin from `/dashboard/events/new`), so D2's second-event step (story 1 scenario 11)
can run with the same throwaway.

### Dev project and the training deployment

| Row | Item | Where | Date | Evidence | Done |
|---|---|---|---|---|---|
| D1 | `015` applied to dev (ref `kcokcufmzyckbodelqpb`); inventory before and read-back after; the one UAT2-5 reproduction vendor row keeps its data; any former `website` appears as `product_links[1]` — **T004** | Management API | 2026-11-02 | **Inventory before:** vendors 2, with_website 1, untied 2; vendor-role profiles without a vendor 2; no `product_links` column, no link functions; `schema_migrations` max `014`. **Applied** (after T002 merged as #72, `3c4c2a5`): the whole `015` file in one `database/query` request, plus an `INSERT` of version `015` (`vendor_links_and_account_linking`) into `supabase_migrations.schema_migrations` in the same transaction so the history matches 011–014's rows → `[]`. **Verify after:** both vendor rows keep business name and contact; the one former website (a real vendor's domain, not recorded here) now reads `product_links = ['https://<its website>']`, `website` column unchanged; the 2026-10-31 row (the UAT2-5 reproduction) is unchanged with `product_links = []`, still untied (the self-heal ties it on that account's first dashboard read once T005 ships); `has_function_privilege`: anon → `link_vendor_account()` **false**, authenticated → `link_vendor_account()` **true**, authenticated → `link_vendor_account_rows` **false** (anon also false); anon → `submit_public_application` still true; CHECK `vendors_product_links_shape` present; all three functions `prosecdef = true`; RPC comment begins "Transactional public application submission for the questionnaire form (spec 011 replaced the 006 body…"; `schema_migrations` max `015` | ☑ |
| D2 | **Ordering a — apply signed in.** Invite `<maintainer>+011-a@…` as Vendor from the Team page → accept → `/apply` on the training site: Email shows the address, is read-only, hint text visible → submit with Link 1 `etsy.com/shop/x`, Link 3 `https://instagram.com/x`, Link 2 blank → confirmation mail arrives at `+011-a` → `/vendor-dashboard` lists the application on the first load; `/vendor-dashboard/profile` shows Link 1 `https://etsy.com/shop/x`, Link 2 `https://instagram.com/x`, Link 3 empty, no Phone; still signed in, `/apply` for a second active event → Email locked, business fields empty; a changed Business Name shows on the profile after submit (scenario 11) — **T007 + T012** | training site + mailbox | | | ☐ |
| D3 | **Ordering b — apply signed out, then account.** Signed out, `/apply` as `<maintainer>+011-b@…` → invite `+011-b` as Vendor → accept → `/vendor-dashboard` lists it (existing trigger path still works) — **T007** | training site + mailbox | | | ☐ |
| D4 | **Ordering c — account, then apply signed out.** Invite `<maintainer>+011-c@…` as Vendor → accept → in a private window, signed out, `/apply` as `+011-c` (type the address in a different letter case) → back in the signed-in window, `/vendor-dashboard` → the application is listed on the first load with no manual step; DB read-back: `vendors.user_id` and `user_profiles.vendor_id` set — **T007** | training site + mailbox + Management API read | | | ☐ |
| D5 | **Mismatch copy.** Signed in as `+011-a`, note an application submitted under `<maintainer>+011-d@…` (signed out) is not listed; the empty state on a fresh invited account `+011-e` reads "No vendor profile linked … Applications are matched to the email address they were submitted with. You are signed in as `+011-e@…`." with the Submit an application link — **T007** | training site | | | ☐ |
| D6 | **Organizer surfaces.** As an organizer: the review page for D2's application shows the two links as clickable links in order, each opening in a new tab, no Phone row, no Booth/Categories/Requirements block; CSV export columns are exactly Business Name, Contact Name, Email, Link 1, Link 2, Link 3, Status, Submitted Date, Event, Organizer Notes, Business Description — **T012** | training site | | | ☐ |
| D7 | **Validation.** `/apply` with Link 1 blank → message on Link 1, nothing sent; Link 1 `not a link` → message; a `mailto:` value → message — **T012** | training site | | | ☐ |
| D8 | **No questionnaire.** No event on dev lacks a questionnaire (every one since spec 005 has one) — confirm by `SELECT e.id FROM events e LEFT JOIN event_questionnaires q ON q.event_id = e.id WHERE q.id IS NULL;` → 0 rows; the not-accepting card is covered by the unit test — **T009** | Management API read | | | ☐ |
| D9 | Throwaways deleted: `+011-a` … `+011-e` auth users (profiles cascade), their vendor rows, applications and answers; any file answers' bucket objects removed in the dashboard; read-back counts — **T013** | Management API + dashboard | | | ☐ |

### Production

| Row | Item | Where | Date | Evidence | Done |
|---|---|---|---|---|---|
| P1 | `015` applied to prod (ref `hgmfjvjlxrhdojwlkgap`) in default mode: inventory → Owen's confirm → write → verify (the SQL above); SC-008 read-back: every vendor that had a website now has it as `product_links[1]` (prod held 0 vendors on 2026-10-08; record the count found) — **T014** | Management API, Owen present | | | ☐ |
| P2 | BL-17: `dev` → `main` promotion after P1; `npm run smoke` against prod 5/5 (the smoke script's vendor payload carries no links — the RPC accepts that); one real signed-in submission by the maintainer lists on the vendor dashboard; test data removed — **T015** | Vercel + prod | | | ☐ |

## Docs to update at close (FR-026)

| File | Change |
|---|---|
| `CLAUDE.md` | migration list gains `015`; Database Schema bullet for the RPCs (`submit_public_application` v2, `link_vendor_account`); Server-action bullets (`applications.ts` loses submission; `answers.ts` named; `vendors.ts`); Form Validation bullet for `application.ts`/`product-links.ts`; `forms/` directory comment; Route Structure note for `/apply` (prefill when signed in); Recent Changes entry; Current Development Phase (BL-17 state) |
| `docs/ARCHITECTURE.md` | §3 point 2 (stale since 006 — rewrite to the RPC posture and the two linking RPCs); §3 `handle_new_user` sentence gains the two new link paths; §4 RPC list; §5 "Legacy events" paragraph replaced by the no-questionnaire message; §6 storage row (`upload.ts` only); §7 "5× copy" drift note → `resolveVendorId` |
| `docs/ROADMAP.md` | Tier 4 "Retire the legacy form" struck as shipped by spec 011; Tier 3 leftover "attachment orphaning on failed legacy submits" struck; "Current state" row for spec 011 |
| `specs/README.md` | 011 row (status, PRs, merged date); the "Queued work" paragraph's stale `014` note was already fixed by T001 |
| `docs/backlog/2026-10-06-uat-and-go-live.md` | Phase 5: tick UAT2-3 + UAT2-4 (merged #68, 2026-10-31 — currently unticked), BL-16, the 011 task rows and BL-17 as they land; Deferred: strike the Tier 4 legacy item and the "legacy submits" leftover |
| `docs/handoffs/2026-10-31-vendor-uat-findings.md` | UAT2-1, UAT2-2, UAT2-5 entries gain an "Outcome" line (PR numbers, dates); "Training data left on dev" updated after D9 |
| `supabase/migrations/README.md` | `015` row in the active set (T002) |
| `.specify/memory/constitution.md` | PATCH 1.1.3 (T017): form-test exemplar → `dynamic-application-form.test.tsx`; `file-upload` out of the primitive list; vendor-scoped authorization sentence in Principle I |
| `specs/006-close-public-data-exposure/contracts/submit-public-application.md` | one line at the top: superseded by `specs/011-…/contracts/submit-public-application-v2.md` |
| `docs/runbooks/event-week-smoke.md` | the click-through's contact block (links, no phone) and the signed-in apply check |
