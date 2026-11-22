# Quickstart: Vendor Data Isolation

**Feature**: 012-vendor-data-isolation

This file is the **ops and evidence record** for spec 012 (the 009/010/011 pattern). Every
`[manual]` task in `tasks.md` is ticked only when its row below is filled in with what was
actually observed. Reasoning lives in `research.md`; exact SQL in `contracts/`.

## Local development loop

```bash
# Full local stack; applies 001 → 016 from scratch
npx supabase db reset
# If auth health returns 502 after a reset:
docker restart supabase_kong_Holigay

# Regenerate the types (commit the result in the migration PR, never edit by hand)
npm run db:types:local

# The constitution's gate before every PR
npm run format:check && npm run lint && npm test && npm run build
npm run test:security          # vendor-isolation.test.ts + the five edited cases
```

Sign-ins: with `vendor-isolation.test.ts` a full `npm run test:security` run makes 20 (15
before this spec) and the local GoTrue allows 30 per 5 minutes. Leave about five minutes
between full runs, or run the one file in between. A run that hits the limit fails with
"sign-in failed", not with an assertion.

### Seeing the suite red, then green (FR-022, SC-007)

```bash
# Red: on a stack at 015 (the suite PR's branch has no 016 file)
npx supabase db reset
npx vitest run --project security src/test/security/vendor-isolation.test.ts
#   every `it.fails` case passes (its body fails on 015); every plain case passes.
#   To see the failures themselves, for row L1: temporarily change `it.fails` to `it`
#   in the working tree, run, copy the failing assertion per case, and discard the edit.

# Green: on the migration PR's branch
npx supabase db reset                      # now applies 016
npm run test:security                      # all cases plain `it`, all passing
```

### In the browser against the local stack

`npm run dev`, then:

1. As an organizer, save a note on an application; reload: it is there. Export the CSV: the
   Organizer Notes column carries it. Change the status: the mail in Mailpit
   (`http://127.0.0.1:54324`) has the "Note from the Organizer" block.
2. `/dashboard/templates` as an organizer: the creator's address shows.
3. `/dashboard/admin` and `/dashboard/team` as the admin: every account listed.
4. As a vendor, open an application with a file answer: the file opens.

## Applying `016` to a hosted project

Through the Management API from a terminal, as `docs/runbooks/reset-hosted-project.md` §7
describes (one `POST https://api.supabase.com/v1/projects/<ref>/database/query` with the whole
file as the body, plus the `016` row for `supabase_migrations.schema_migrations`, in one
transaction), or as one SQL Editor block pasted by Owen. Dev writes are fine in either
permission mode; **prod needs the session in default mode** and the inventory → confirm →
write → verify sequence.

**Order on each project (research R11): `016` first, then the code.** On dev: apply `016`
immediately before merging the migration PR, from that PR's head commit (record the SHA; if
the SQL changes after it was applied, stop and tell Owen). On prod: apply `016` immediately
before the promotion. In between, the old code shows blank notes, cannot save a note, and shows
`—` for template creators; nothing is lost and nothing is exposed.

Inventory before (both projects):

```sql
SELECT count(*) AS applications,
       count(*) FILTER (WHERE organizer_notes IS NOT NULL AND organizer_notes <> '') AS with_notes
FROM public.applications;

-- files that two applications already refer to (016 does not fail on these; decide with Owen)
SELECT path, count(*) FROM (
  SELECT value->>'path' AS path FROM public.application_answers WHERE value->>'kind' = 'file'
  UNION ALL SELECT file_path FROM public.attachments
) refs GROUP BY path HAVING count(*) > 1;

SELECT count(*) FROM storage.objects WHERE bucket_id = 'attachments';
SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'storage' ORDER BY 1;
SELECT count(*) FROM public.questionnaire_templates WHERE created_by IS NOT NULL;
SELECT max(version) FROM supabase_migrations.schema_migrations;                   -- 015
```

Verify after: the "Read-back checks" block in `contracts/migration-016.md`. The first line
(`count(*) FROM application_notes`) must equal `with_notes` from the inventory.

Rollback, if a rollout goes wrong: the block at the end of `contracts/migration-016.md`, code
reverted first, on Owen's go.

## Probing a deployment as a vendor

The four gaps are not reachable from the app's pages, so the probe asks the API directly. Use
a throwaway script kept **outside the repository** (session scratch directory): it creates a
`@supabase/supabase-js` client with the project's URL and anon key, signs in as a throwaway
vendor with the password set at `/set-password`, runs the calls, and prints the error code or
row count of each. No key, password or real address is written into this file.

## Evidence record

The rows run in FR-028's order: local, then dev, then the training probe, then prod, then the
promotion. "Evidence" is what was observed: the read-back value, the error code, the row count,
the text on screen. Dates ISO. Throwaways are `<maintainer>+012-a@…` and `<maintainer>+012-b@…`, invited
as Vendor from the Team page and deleted afterwards (row D8). Each row ends with the task in
`tasks.md` that owns it (T002–T012).

### Local

| Row | Item | Where | Date | Evidence | Done |
|---|---|---|---|---|---|
| L0 | Plan-time dry run: the contract SQL applied and probed per caller in one rolled-back transaction | local stack | 2026-11-22 | `research.md` "Dry run": applied cleanly over 015; every probe in its table as designed; database unchanged afterwards (no `application_notes`, the three 011 storage policies, no fixture rows) | ☑ |
| L1 | **Red.** The isolation suite on a stack at 015: the 21 red cases fail, each for the rule it states; the 16 others pass — **T002** | local stack | 2026-11-22 | After `npx supabase db reset` (migrations max `015`), `vendor-isolation.test.ts` as committed: 37 passed. With every `it.fails(` changed to `it(` in the working tree: **21 failed, 16 passed**. The failing ids were exactly I8–I11, I13, I14, I17–I19, I21, I23–I30, I33–I35, each on the assertion that states its rule (per case below). The passing ids were exactly I1–I7, I12, I15, I16, I20, I22, I31, I32, I36, I37. Edit discarded. Afterwards the local database held 0 vendors, applications, events, auth users and bucket objects | ☑ |
| L2 | **Green.** After `016`: all 37 cases pass as plain `it`; every earlier suite passes; the five edited cases are the only edits to existing cases (`git diff --stat` on `src/test/security/`) — **T003** | local stack + CI | 2026-11-22 | `npx supabase db reset` applied 001 → 016 cleanly; every value of the contract's read-back block as specified (0 notes on a fresh stack, the CHECK, `anon` no SELECT, 4 note policies, exactly `attachments_anon_insert` + `attachments_select_own_or_organizer`, the three `organizer_insert_*` policies, `{security_barrier=true}`, `template_creator_emails` EXECUTE `anon` false / `authenticated` true, the RPC comment naming spec 012 and `P0005`, max `016`). Types regenerated: only `application_notes` (one-to-one to `applications`) and `template_creator_emails` added. `vendor-isolation.test.ts` with all 21 flips: **37 passed** (38 with I38 after the review fixes, below) (I25's embed is one object — no R7 fallback). `npm run test:security`: **11 files, 132 passed**. Gate on a fresh reset: format:check, lint, build clean; `npm test` (unit + security projects in one run, which is also the `test:security` run — a second back-to-back run would exceed GoTrue's 30 sign-ins / 5 min): **68 files, 709 passed**. `git diff --stat dev -- src/test/security/`: `vendor-isolation.test.ts` (flip, helper removed, note seed), `harness.ts` (`seedFixtures` note seed), `storage.test.ts` (ST4), `anon-reads.test.ts` (R1), `anon-writes.test.ts` (W2), `dashboard-reads.test.ts` (D1) — nothing else. Browser checks below | ☑ |

**L1, per red case.** Each entry gives the first assertion that failed on 015 and what it received. `download`/`sign` return `{ body, refused }`; "restored" or "deleted" means the case's `finally` put back what it had changed.

- **I8**: A downloads `b-answer`. Received `{ body: 'b-answer', refused: false }`, so B's body came back.
- **I9**: A removes `b-answer`. Expected `[]`, received one removed object. Restored.
- **I10**: A removes `a-answer`. Expected `[]`, received one removed object. Restored.
- **I11**: ORG removes its own `org-remove`. Expected `[]`, received one removed object.
- **I13**: A downloads `orphan`. Received `{ body: 'orphan', refused: false }`.
- **I14**: C downloads `a-answer`. Received `{ body: 'a-answer', refused: false }`.
- **I17**: A submits to event F naming `b-answer`. Expected code `P0005`, received no error: the submission was stored. Deleted.
- **I18**: A downloads `b-answer` after I17. Received `{ body: 'b-answer', refused: false }`.
- **I19**: anon submits to F naming `b-answer`. Expected `P0005`, received no error: the submission was stored. Deleted.
- **I21**: A inserts an `attachments` row naming `b-answer` on A's own application. Expected `42501`, received no error: the row was inserted. Deleted.
- **I23**: A selects `id, organizer_notes` from their own application. Expected null, received `'NOTE-A'`.
- **I24**: A selects from `application_notes`. Expected no error, received `PGRST205` (no such table).
- **I25**: ORG runs the embedded select `application_notes ( notes )`. Expected no error, received `PGRST200` (no such relationship).
- **I26**: ORG upserts into `application_notes`. Expected no error, received `PGRST205`.
- **I27**: A inserts into `application_notes`. Expected `42501`, received `PGRST205`.
- **I28**: the service role sets `applications.organizer_notes`. Expected `23514`, received no error: the note was written. Set back to `NOTE-A`.
- **I29**: A selects `users_with_roles`. Expected `[]`, received 5 rows (every account on the stack).
- **I30**: ORG selects `users_with_roles`. Expected `[]`, received 5 rows.
- **I33**: C is demoted back to vendor and selects its own row. Expected `[]`, received one row. The read as admin before it passed. Role reset to vendor.
- **I34**: ORG calls `template_creator_emails`. Expected no error, received `PGRST202` (no such function).
- **I35**: anon submits to the event whose deadline was yesterday. Expected `{ code: 'P0001', message: 'Event is not accepting applications' }`, received no error: the submission was stored. Deleted.

**L2, the browser checks** ("In the browser against the local stack", 2026-11-22). Throwaway admin, organizer and vendor accounts on the local stack, an active event with a file question, and a signed-in vendor submission with a PNG answer. Dev server with `RESEND_API_KEY` unset.

1. Organizer saves a note on the review page: "Notes saved"; the box keeps its text; "Last Updated" moves from 12:27 to 12:28 without a reload. After a reload the note is still there. The CSV export's Organizer Notes column carries it. Approve → Confirm: "Application approved", and the dev server logs the status mail (`[Email] Would send email`, subject "Congratulations! Your Application Has Been Approved - …").
   **Deviation from the recipe:** Mailpit only catches GoTrue's auth mail. The app sends through Resend, and with the key unset it logs only to, from and subject. The mail body ("Note from the Organizer" with the note) is therefore proven by the unit case in `applications-email-warning.test.ts`, which runs the real template.
2. `/dashboard/templates` as the organizer: the template's Creator column shows the organizer's address.
3. As the admin, `/dashboard/admin` lists all 3 accounts with their roles, and `/dashboard/team` lists the organizer and the admin, its team members.
4. As the vendor, `/vendor-dashboard/applications/[id]` shows no note, and the file answer's button opens a signed URL: 200, `image/png`, 70 bytes.

**L2, after the review of #89** (2026-11-22; `research.md` "Review of the migration PR"). The fixes are one claim lock per call, the file-answer cap (`P0004`), §1's copy-and-lock as one `DO` block, and the `listTemplates` error log.

- **I38 red.** On the first draft of `016`, anon submitting 300 file answers on F's one file question received `23505` (expected `P0004`), after taking 300 path locks. The other 37 cases passed.
- **A first try at §1 failed.** A top-level `LOCK TABLE` failed under `db reset` with `25P01` ("can only be used in transaction blocks"), because the Supabase CLI sends a migration statement by statement. Moved into the `DO` block.
- **A first try at the cap broke S8.** Refusing any repeated question broke the existing `submission-rpc.test.ts` S8 (expects the late `23505`), so Owen chose the file-answer cap. S8 is untouched and passes.
- **Green.** After `db reset` the read-backs match again, and the function comment reads "P0004 foreign answer or too many files". `vendor-isolation.test.ts` + `submission-rpc.test.ts`: **52 passed** (38 + 14). Gate on a fresh reset: format:check, lint and build clean; one `npm test` run: **68 files, 710 passed** (577 unit + 133 security). The edits to existing security cases are still exactly the five FR-023 names.

### Dev project and the training deployment

Prerequisite on dev: two active events, each with a questionnaire that has a file question
(the vendors apply to the first; D3's claim attempt goes to the second, and its file answer
must use that event's own file question, or the answer gate replies `P0004` before the claim
gate is reached); one template created by the organizer account; and, **before D1**, at least
one application with a saved organizer note (D5 checks that it survives the migration).

| Row | Item | Where | Date | Evidence | Done |
|---|---|---|---|---|---|
| D1 | `016` applied to dev (ref `kcokcufmzyckbodelqpb`) from the migration PR's head, before that PR merges: inventory, apply, read-back; `with_notes` before = `application_notes` rows after; `schema_migrations` max `016` — **T004** | Management API | | | ☐ |
| D2 | **Files.** `+012-a` and `+012-b` each apply with a file. As A, by direct API: download B's file, sign it, remove it → all refused, B's file still opens for B and for an organizer. A opens their own file from `/vendor-dashboard/applications/[id]`. A removes their own file → refused — **T005** | training site + probe script | | | ☐ |
| D3 | **Claim.** As A, submit to the second event, answering its file question with B's stored file path → refused (`P0005`), no application created; A still cannot open the file. A direct insert of an `attachments` row naming it → refused — **T005** | probe script + Management API read | | | ☐ |
| D4 | **Accounts.** As A: `users_with_roles` → no rows. As the organizer by direct API: no rows; `template_creator_emails` → the creator's address only — **T006** | probe script | | | ☐ |
| D5 | **Notes.** An organizer saves a note on A's application. As A by direct API: the application with every field, and `application_notes` → no note. A note that existed before D1 is still on the review page and in the CSV — **T007** | probe script + training site | | | ☐ |
| D6 | **Deadline.** An active event with yesterday's deadline: a direct submission is refused with the not-accepting code; with today's deadline it succeeds. From a form opened on an event whose deadline is then moved to yesterday: the inline not-accepting message, the entries kept, and no confirmation mail — **T008** | probe script + training site | | | ☐ |
| D7 | **The eight consumers** (SC-005), each once on the training site: (1) signed-out upload on `/apply`; (2) organizer opens a file from the review page; (3) vendor opens their own file; (4) admin Team page lists accounts with the Pending badge; (5) template list shows the creator; (6) invite a new address and re-send a pending one; (7) review page shows and saves a note, the CSV carries it, the status mail carries it; (8) the reset runbook's object removal (done as D8's cleanup) — **T009** | training site + mailbox | | | ☐ |
| D8 | Throwaways removed: the two accounts and the address invited for D7 (6), their vendor rows, applications, answers and notes; their bucket objects through the dashboard; the probe events; read-back counts — **T010** | Management API + dashboard | | | ☐ |

### Production

| Row | Item | Where | Date | Evidence | Done |
|---|---|---|---|---|---|
| P1 | `016` applied to prod (ref `hgmfjvjlxrhdojwlkgap`) in default mode: inventory → Owen's confirm → write → read-back; `with_notes` before = `application_notes` rows after — **T011** | Management API, Owen present | | | ☐ |
| P2 | `dev` → `main` promotion straight after P1; `npm run smoke` against prod 5/5 before and after (the script is unchanged); the event-week click-through, including a note saved and shown, and a file opened by its vendor; test data removed; entry added to `docs/runbooks/event-week-smoke.md` — **T012** | Vercel + prod | | | ☐ |

## Docs to update at close (FR-029)

| File | Change |
|---|---|
| `CLAUDE.md` | migration list gains `016` (that one line ships in the migration PR, T003; the rest at close); Database Schema gains `application_notes`, the retired column, `template_creator_emails()`, the narrowed view, the two storage policies, `P0005`; server-action notes for `applications.ts` and `templates.ts`; Database state; Recent Changes; Current Development Phase |
| `docs/ARCHITECTURE.md` | §3 (the vendor layer now proven; inserts only through the RPC), §5 (`application_notes`), §9 (the isolation suite), §10 (strike "cross-vendor isolation, still hand-verified") |
| `docs/ROADMAP.md` | Tier 3: strike the `users_with_roles` item and "Cross-vendor isolation is the natural next suite"; the Tier 1 table's storage row names the new policy pair; add the two items from `research.md` "Found on the way" |
| `specs/README.md` | 012 row |
| `docs/backlog/2026-10-06-uat-and-go-live.md` | tick Spec 012; close UAT-10 |
| `docs/superpowers/plans/2026-11-21-post-launch-hardening.md` | tick B1–B10 |
| `supabase/migrations/README.md` | `016` row (in the migration PR); "next prefix" line |
| `docs/runbooks/reset-hosted-project.md` | inventory query counts `application_notes`; the FK table in §0 gains `application_notes.application_id → applications` (CASCADE) and the Verify table in §5 lists it; one line under §3: since `016` no signed-in session can delete an object, and options A–C are unaffected |
| `docs/runbooks/event-week-smoke.md` | the promotion entry (P2) |
| `docs/runbooks/backup-restore.md` | **Done in T003** (review of #89): §3.1 resets to the dump's migration level (a dump without `application_notes` restores onto `015`), §3.3a runs `migration up --local`, §3.5 notes the extra `application_notes` rows, Verified-behaviour row 13, and a 2026-11-22 rehearsal of both paths. T013 confirms it is still right |
| `.specify/memory/constitution.md` | no change expected (version stays 1.1.3) |
