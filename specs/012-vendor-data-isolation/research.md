# Research: Vendor Data Isolation

**Feature**: 012-vendor-data-isolation | **Date**: 2026-11-22

The Technical Context had no `NEEDS CLARIFICATION` markers: the what and why are the spec and
Owen's four answers in its Clarifications block. The spec left four mechanics to this plan (the
shape of the notes store and the fate of the old field; migration/code order; the form of the
template-creator read; how a file reference is matched to a stored file). This file settles
them (R1–R12), records what was rejected, and lists the facts the design rests on, each checked
against the working tree (`012-vendor-data-isolation` at `ba17fdc`, equal to `dev`) and, where
marked *(catalog)*, against the local stack with read-only queries on 2026-11-22.

Owen can flip any R-item in review of the docs PR.

## The five Track B facts, re-verified

Quoted from `docs/superpowers/plans/2026-11-21-post-launch-hardening.md`, Track B. All five
hold.

| Gap | Where | Fact | Still true |
|---|---|---|---|
| Read any file | `011_close_public_data_exposure.sql:301` | `attachments_authenticated_select` is `USING (bucket_id = 'attachments')` for every `authenticated` user | yes *(catalog)* |
| Delete any file | `011_close_public_data_exposure.sql:305` | `attachments_authenticated_delete` has the same condition; no app code deletes objects | yes *(catalog)*; `grep` finds no `.remove(` outside `src/test/security/` |
| List all accounts | `013_users_with_roles_invite_pending.sql:28-30` | only `anon` was revoked; `authenticated` keeps `SELECT`, and the view runs as its owner | yes *(catalog)*: grants are `authenticated: SELECT`, `service_role: all`; owner `postgres`; no `reloptions` |
| Late submission | `015_vendor_links_and_account_linking.sql:237` | `submit_public_application` refuses an event that is not `active` but never reads `application_deadline` | yes |
| Organizer notes | `005_rbac_rls_policies.sql:142` | `authenticated_select_applications` lets a vendor read their own row, and `organizer_notes` is a column on that row | yes |

## Further verified facts

- **A file answer's shape.** `coerceAnswerToJsonb` stores a `file_upload` answer as
  `{ "kind": "file", "path", "name", "mimeType", "size" }` in `application_answers.value`
  (`src/lib/questionnaire/answer-coercion.ts:15-21`, `src/lib/validations/questionnaire.ts:76-82`).
  `path` is exactly what `uploadFile` returned: `uploads/<timestamp>-<random>-<sanitized name>`
  (`src/lib/actions/upload.ts:43-52`), which is the object's `name` in `storage.objects`.
- **The second reference kind.** `attachments.file_path` (migration 001) holds the same kind of
  value. Nothing writes that table since spec 011 (the RPC ignores the `attachments` key), but
  rows from the fixed form may exist on dev, and both detail pages still read them.
- **Who opens files.** Both `src/components/questionnaire/file-answer-link.tsx:29-31` and
  `src/app/dashboard/applications/[id]/attachments-list.tsx:110-112` call
  `createSignedUrl(path, 60)` from the browser with the signed-in session. Storage authorizes
  that call against the caller's SELECT policy; redeeming the URL is not re-checked.
- **Upload needs INSERT only.** `uploadFile` never passes `upsert: true`; the anonymous upload
  succeeds today with no SELECT policy for `anon` (suite case ST1).
- **`get_user_role()`** is `SECURITY DEFINER`, `STABLE`, `SET search_path = public`, reads
  `public.user_profiles` by `auth.uid()` and is executable by `anon` and `authenticated`
  *(catalog)*. It is safe to call from a policy on `storage.objects`: policies store function
  references by identity, and the function pins its own search path.
- **Three INSERT policies are reachable by a vendor** *(catalog; new finding, see R4)*:

  | Policy | Migration | What a signed-in vendor can do through the API |
  |---|---|---|
  | `authenticated_insert_attachments` | 005 | insert an `attachments` row on their own application with any `file_path` |
  | `authenticated_insert_application_answers` | 009 | insert an answer on **any** application of an active event; the check never looks at who owns the application |
  | `authenticated_insert_applications` | 005 | insert an `applications` row for their own vendor record on any event, whatever its status or deadline |

  `authenticated` holds full table privileges on all three tables. No application code inserts
  into them: every submission goes through `submit_public_application`
  (`grep -rnE "\.(insert|upsert)\(" src` outside tests finds only templates and events).
- **Saved notes are emailed to the vendor, by design.** `updateApplicationStatus`
  (`src/lib/actions/applications.ts:590-678`) reads the stored notes and passes them to
  `statusUpdateEmail`, which renders a "Note from the Organizer" block. The organizers tested
  and accepted this in the 2026-10-06 session (spec 007 F-002) and PR #57 added *Save notes and
  confirm*. So the notes field is both a working note and the message that goes out with a
  status change. This spec does not change that (FR-027). What it closes is a vendor reading
  notes through the database: notes saved after the last email, or on an application whose
  status has not changed yet.
- **Notes consumers.** Read: `getApplications`, `getApplicationById`, `updateApplicationStatus`
  (`applications.ts:140, 354, 596`), `exportApplicationsCSV` (`export.ts:125, 231`). Write:
  `updateApplicationNotes` (`applications.ts:729-735`). Rendered only by
  `src/app/dashboard/applications/[id]/page.tsx:168`. `vendor-dashboard.ts` never selects the
  column.
- **Account-list consumers.** `getUsers` (`admin.ts:82-86`, session client, behind
  `requireRole('admin')`); `listTemplates` (`templates.ts:91-95`, session client, organizer);
  `inviteOrganizerCore` (`src/lib/team/invite-organizer-core.ts:44-48`, service-role client).
  The template list renders `createdByEmail ?? '—'`
  (`src/app/dashboard/templates/templates-list-client.tsx:75, 111`).
- **The listing's deadline rule** (BL-20): `getActiveEvents` keeps an event when
  `application_deadline` is null or `>= todayDateOnly()`, the Edmonton calendar day
  (`applications.ts:84-93`, `src/lib/format-date.ts`). The database resolves
  `(now() AT TIME ZONE 'America/Edmonton')::date` *(catalog: returned `2026-11-22`)*.
- **`applications` has an `updated_at` trigger** (`update_applications_updated_at`, 001:102), so
  a bulk `UPDATE` in a migration would move every touched row's "Last Updated".
- **Test files are type-checked.** `tsconfig.json` includes `**/*.ts`, so `npm run build` fails
  on a suite that names a relation missing from `src/types/database.ts` (see R10).
- **No existing security case reuses a file path across applications** (`grep "kind: 'file'"`
  in `src/test/security/` finds none), so the claim gate in R3 breaks none of them. The
  `invite-flow` suite reads the account view only with the service client and the anon client.
- **Local stack versions**: Postgres 17.6, PostgREST v14.5, storage-api v1.77.5; migrations
  001–015 applied.

## Decisions

### R1 — A file is matched to a vendor by a storage policy that looks for a reference

**Decision.** Replace `attachments_authenticated_select` with one policy on `storage.objects`
for `authenticated`:

- the object is in the `attachments` bucket, **and**
- the caller's role is organizer or admin (`public.get_user_role()`), **or** a row of
  `application_answers` with `value->>'kind' = 'file'` and `value->>'path' = objects.name`, or a
  row of `attachments` with `file_path = objects.name`, belongs (through `applications`) to a
  `vendors` row whose `user_id = auth.uid()`.

The subqueries are written inline and schema-qualified. They run as the caller, under the
caller's own RLS on the three tables, so the policy can never see more than the caller could
already read from those tables.

**Rationale.** It answers FR-001, FR-004 and FR-007 in one place, needs no schema change, and
covers files uploaded before this change because the references already exist. An unreferenced
file matches no vendor (story 1 scenario 10); an account with no vendor record matches nothing
(scenario 13); an organizer who also has a vendor record passes on the role branch.

**Alternatives considered.** A `SECURITY DEFINER` helper `caller_owns_file(text)`: works, but
adds a definer function callable over the API for no gain, and a mistake in it could leak past
RLS where the inline form cannot. An owner column or a per-vendor path prefix: out of scope
(how uploads are named). An expression index on `value->>'path'`: not needed at dozens of rows;
it is a table change and would come back to Owen if volume ever asks for it.

**How far it is proven.** The policy's SQL was run on the local stack (see "Dry run" below):
vendor A sees exactly the two objects their application refers to, an account with no vendor
record sees none, organizer and admin see all. What the dry run cannot show is the same
evaluation reached through storage-api (signed URL, download, remove); cases I7–I16 prove that
in the migration PR. Fallback if storage-api behaves differently: the `SECURITY DEFINER` helper
above.

### R2 — Nobody deletes from a signed-in session

**Decision.** Drop `attachments_authenticated_delete` and create nothing in its place.

**Rationale.** FR-003. With no DELETE policy, RLS refuses every `anon` and `authenticated`
delete. The reset runbook's three ways (dashboard, CLI, service-role key) and the harness's
`cleanupFixtures` use the service role, which bypasses RLS. There is no UPDATE policy either,
so a file cannot be overwritten or moved (guard case I16).

### R3 — First claim wins, inside the RPC, after the duplicate gate

**Decision.** `submit_public_application` gains a file-claim gate between the application
insert and the answers insert:

1. collect the distinct, non-empty `path` values of the payload's file answers, sorted;
2. take `pg_advisory_xact_lock(hashtextextended(path, 0))` for each;
3. if any `application_answers` file answer or any `attachments` row already names one of
   them, raise `'A file in this submission is already attached to another application'` with
   SQLSTATE **`P0005`**.

**Rationale.** FR-002. Placing it after the duplicate gate keeps today's answer for a genuine
resubmission (`P0003`, "You have already submitted…") instead of replacing it with a generic
failure (FR-020). At that point the new application has no answers yet, so any existing
reference belongs to another application. The advisory lock closes the race in which two
submissions naming the same file both pass the check; sorting the paths prevents a deadlock
between two multi-file submissions. The raise rolls back the vendor upsert and the application
insert, so a refused submission stores nothing and blocks no retry. `P0005` is not in
`mapSubmissionError`, so the form shows its existing generic message ("Failed to create
application") with no application change, as the spec's Assumptions ask.

**Alternatives considered.** A unique index on the path: cannot span two tables, is a table
change, and would fail on any duplicate already in the dev data. A trigger on both tables:
enforces the rule on every write path, but FR-002 asks for the check inside the submission
write, and R4 removes the other vendor write paths.

### R4 — Vendors write only through the RPC (Owen, 2026-11-22)

**Decision.** Replace the three INSERT policies in "Further verified facts" with
organizer/admin-only versions. The answers policy keeps its two existing guards (event active,
question belongs to the event) and adds the role check.

**Rationale.** With ownership decided by reference, the first two policies are a one-request
way for vendor A to claim vendor B's file, and the third bypasses the status, deadline and
claim gates (FR-019: "no caller can bypass it"). The spec's Assumptions said a vendor-writable
gap is reported, not folded in silently; it was reported in the plan session and Owen chose to
close it in `016`. Organizers and admins keep direct insert, so FR-017's list of removals does
not grow. It is a tightening on touched objects (FR-025) and adds no table change.

**Alternatives considered.** Dropping the three policies outright: smaller, but a third
removal for organizers. Leaving them: FR-001, FR-002 and FR-019 would hold only for callers
who use the app.

### R5 — The account list filters itself

**Decision.** `CREATE OR REPLACE VIEW public.users_with_roles WITH (security_barrier = true)`
with the same six columns and one added condition:

```sql
WHERE public.get_user_role() = 'admin'
   OR current_user IN ('service_role', 'postgres', 'supabase_admin')
```

**Rationale.** FR-008, FR-009, FR-011. `getUsers` (admin session) and the invite core (service
role) keep working unchanged; a vendor or an organizer gets zero rows, their own included.
`current_user` in a view is the calling role, not the view's owner; only permission checks on
the underlying tables run as the owner. The list of database roles is positive, so a role
nobody thought of sees nothing. `get_user_role()` reads the profile on every call, so a role
change takes effect on the next request (story 2 scenario 8). `security_barrier` stops a
caller's own filter conditions from being evaluated before the view's. Grants are untouched:
`anon` stays revoked (013).

**Alternatives considered.** `security_invoker` plus RLS (ROADMAP's first suggestion):
`authenticated` cannot read `auth.users`, so the view would return nothing to anyone. Revoking
`authenticated` and adding an admin RPC (ROADMAP's second): works, but changes `getUsers` and
its tests for no gain over a filter.

### R6 — Template creators through a no-argument function

**Decision.** `public.template_creator_emails()` returns `(creator_id uuid, email text)` for
accounts that appear in `questionnaire_templates.created_by`. `SECURITY DEFINER`, `STABLE`,
`SET search_path = public`, role gate at the top (`get_user_role()` not organizer or admin
raises `42501`, the migration 012 pattern), `EXECUTE` revoked from `PUBLIC` and `anon`, granted
to `authenticated`. `listTemplates` calls it in place of the view read.

**Rationale.** FR-010. No argument means the caller cannot name anyone: who is asking comes
from the session alone. `creator_id` is needed to match a template to its creator and is
already visible to organizers as `questionnaire_templates.created_by`. No role, no
pending-invite flag, no account without a template.

**Alternatives considered.** A second filtered view: the same exposure, but it needs the
`'users_with_roles' as 'user_profiles'` type cast the current code uses; a typed RPC is
cleaner. Returning `(template_id, email)`: also fine, but `listTemplates` already maps by
`created_by`.

### R7 — Notes store: one row per application

**Decision.**

```
public.application_notes
  application_id uuid        PRIMARY KEY  REFERENCES applications(id) ON DELETE CASCADE
  notes          text        NOT NULL     CHECK (notes <> '')
  updated_at     timestamptz NOT NULL     DEFAULT now()   -- update_updated_at_column() trigger
```

RLS enabled; four policies (select, insert, update, delete), each
`get_user_role() IN ('organizer', 'admin')`; every privilege revoked from `anon`. No row means
no note: saving an empty note deletes the row.

**Rationale.** FR-012. The primary key on the foreign key makes the relation one-to-one, so
PostgREST embeds it in an `applications` select as an object (or null) and the actions map it
back to the `organizer_notes` field their callers already use; no page changes (FR-015). An
author column or note history was not asked for.

**How far it is proven.** The table, its policies and the organizer upsert and delete passed
the dry run. The one-to-one embed shape is PostgREST's documented behaviour (v11 and later;
local is v14.5) and needs a committed schema to observe, so case I25 and the updated D1 prove
it in the migration PR. If it came back as an array, the mapping would take the first element;
nothing else changes.

### R8 — The old column is emptied and locked, not dropped

**Decision.** In `016`: copy every non-empty note into `application_notes` (keeping the
application's `updated_at` as the note's), verify the count in a `DO` block that aborts the
migration on a mismatch, set `applications.organizer_notes` to NULL with
`update_applications_updated_at` disabled for that statement, then add
`CHECK (organizer_notes IS NULL)` and a "retired by spec 012" comment.

**Rationale.** FR-013: after the migration the application record holds no notes and can never
hold one again. Emptying instead of dropping follows 015's handling of `phone` and `website`,
and it is what makes the rollout window mild (R11): code that still selects the column keeps
rendering. It also keeps `organizer_notes` in the generated types, so the red-first suite
compiles on both sides of the migration.

**Alternatives considered.** `DROP COLUMN`: the cleanest end state, but every organizer page,
the export and the status change would error between the migration and the deploy on each
hosted project. A redirect trigger that moves writes into the new table: keeps old-code saves
working in the window, at the price of a hidden data move that would stay forever. The column
can be dropped in a later migration together with `phone` and `website`.

### R9 — The deadline gate

**Decision.** The event gate also reads `application_deadline` and raises the same
`'Event is not accepting applications'` / `P0001` when the deadline is before
`(now() AT TIME ZONE 'America/Edmonton')::date`. A null deadline is open.

**Rationale.** FR-018 to FR-020. `<` on the Edmonton date is the exact complement of the
listing's `deadline >= today` rule. Reusing the message and code means the form shows its
existing "not currently accepting applications" message and a caller cannot tell a late
submission from a closed event.

### R10 — Red first, with CI green on both sides

**Decision.** The suite lands in its own PR before the migration. Each case that states a rule
`016` adds is written with `it.fails(...)`: Vitest passes such a case only while its body
fails. The migration PR turns each into a plain `it(...)`. Cases that already hold (a vendor's
table reads are limited to their own) are plain `it(...)` from the start. Cases that touch a
relation `016` creates go through a small untyped-client helper in the suite PR, removed when
the types are regenerated.

**Rationale.** Track B step B4 and FR-022 ask for red before green, and the constitution
forbids merging on a red check. `it.fails` gives both: CI proves the cases fail on the 015
schema, and again proves they pass on 016.

**Limit.** `it.fails` cannot tell *why* a case failed. The proof that each fails for the right
reason is the recorded red run (quickstart row L1, which lists the failing assertion per case)
and the unchanged body passing after the flip.

### R11 — Migration before code on each hosted project

**Decision.** `016` is applied to a hosted project before the code that reads it is deployed
there: on dev immediately before the migration PR is merged, on prod immediately before the
promotion. The migration and the application changes ship in one PR so `dev` never holds a
schema the app cannot use.

**What every consumer does in the window (old code, new schema).**

| Consumer | In the window |
|---|---|
| Anonymous upload | unchanged |
| Organizer opening files | unchanged (role branch of the new policy) |
| Vendor opening own files | unchanged (reference branch) |
| Admin Team page | unchanged |
| Invite flow | unchanged |
| Template list | renders, creator shows `—` (old code reads the view as an organizer and gets no rows) |
| Review page, list, export | render, notes blank; saving a note fails closed with "Failed to update notes" (the CHECK) |
| Status email | sent without the note block |
| Reset runbook | unchanged |
| Public submission | unchanged payload; late and double-claimed submissions are already refused |

No note is lost (they are in the new table) and none is readable by a vendor. The window is
minutes and Owen is present. The opposite order would make every organizer page error until
the migration ran.

### R12 — Rollback

**Decision.** `contracts/migration-016.md` carries one SQL block that restores the 015 state:
notes copied back and the CHECK dropped, `application_notes` dropped, the 013 view, the 011
storage policies, the 005/009 INSERT policies and the 015 function body restored,
`template_creator_emails()` dropped. On a hosted project it is run by hand, with the code
reverted first, and only on Owen's go. In the repository `016` is never edited: if the rollback
were to become permanent, the same block ships as migration `017`.

## Dry run (2026-11-22, local stack, one rolled-back transaction)

The six sections of `contracts/migration-016.md`, with the full function body of
`contracts/submit-public-application-v3.md`, were applied inside `BEGIN … ROLLBACK` on the
local database (Postgres 17.6, migrations 001–015), over fixtures created in the same
transaction: two vendors with an application each (a file answer, an attachment record and a
note), a vendor account with no vendor record, an organizer who created a template, an admin,
and events with a deadline of yesterday, today and none. Each caller was simulated with
`SET LOCAL ROLE` and `request.jwt.claims`. Afterwards the database was checked: no
`application_notes` table, the three 011 storage policies back, no fixture rows.

| Probe | Observed |
|---|---|
| The file applies without error on top of 015 | yes |
| Carry-over | 2 notes in, 2 rows in `application_notes`; 0 non-null `organizer_notes`; 0 applications whose `updated_at` moved |
| Writing a note to the old column | check violation `applications_organizer_notes_retired` |
| Vendor A reads `storage.objects` | exactly `a-answer` and `a-legacy`; not B's two, not the orphan |
| Vendor A updates object names | 0 rows |
| Vendor A reads the account list | 0 rows |
| Vendor A calls `template_creator_emails()` | "Organizer role required" |
| Vendor A reads own application / `application_notes` | `organizer_notes` NULL / 0 rows |
| Vendor A writes `application_notes` | insert refused by RLS; update 0 rows |
| Vendor A inserts directly into `attachments`, `application_answers` (B's application), `applications` | all three refused by RLS |
| Vendor A submits naming B's file answer, then B's attachment-record file | `P0005` both times; A still cannot read B's object |
| Vendor A resubmits to the same event with their own file | `P0003`, not `P0005` |
| Vendor A submits to the event whose deadline was yesterday / is today | `P0001` / accepted |
| Vendor A submits naming the orphan, then reads objects | accepted; the orphan is now among A's |
| Vendor A, and anon, insert a new object row (upload) | accepted |
| Account with no vendor record reads objects / the account list | 0 / 0 |
| Organizer reads objects / account list / creators / notes | all 6 / 0 rows / one row (own id and email) / both notes |
| Organizer upserts and deletes a note; inserts an `attachments` row directly | all accepted |
| Admin reads the account list / creators / objects | all five fixture accounts / 1 / all 6 |
| Role change: the no-vendor account promoted to admin, then demoted | rows, then 0 rows, on the next read |
| Anon reads objects / `application_notes` / the account list / creators | 0 rows / permission denied ×3 |
| Anon submits naming B's file | `P0005`; no vendor row left behind |
| Service role reads the account list | rows |

Not covered by the dry run, and therefore owned by the suite: anything reached through
storage-api (signed URLs, downloads, the Storage API's delete) or PostgREST (the embed shape,
error codes as the client sees them). A storage trigger refuses a direct SQL `DELETE` on
`storage.objects` for every role, so the delete rule can only be observed through the API.

## Rejected or deferred

- **Stopping the status email from carrying notes**: an interface change this spec does not
  force. Recorded as an edge case in the spec; a follow-up if the organizers want a separate
  "message to the vendor" field.
- **Checking that a named file exists in the bucket at submit time**: not asked for; the claim
  gate and the read policy do not depend on it.
- **Cleaning up orphaned uploads, upload naming, role in JWT claims, atomic template update**:
  out of scope as given.
- **Adding `application_notes` to the smoke check's private-table probe**
  (`scripts/smoke-check.mjs`, `PRIVATE_TABLES`): anon holds no privilege on the new table, so
  the read answers `42501`, which that check reports as a change of posture; covering it means
  changing the check, not adding a name. Cases I24 and R1 prove the refusal on every pull
  request. A follow-up if the hosted probe should cover it too.

## Found on the way, left alone

- `authenticated_select_events` is `USING (true)`: a signed-in vendor can read draft and closed
  events through the API. Event rows are not vendor data; noted for ROADMAP Tier 3.
- `vendor_update_own` lets a vendor change any column of their own `vendors` row, including
  `email`. Uniqueness stops a collision with another vendor; the account tie is unaffected.
  Outside this spec's read rules.
- `docs/runbooks/reset-hosted-project.md` never states who can delete bucket objects; FR-029's
  "where it describes who can delete" becomes a one-line addition, plus `application_notes` in
  its inventory query.
- `updateApplicationStatus` changes data the review page and the list render and calls no
  `revalidatePath` (constitution IV). `/speckit-analyze` raised the same gap on
  `updateApplicationNotes`, which this spec rewrites and now fixes; the status action's write
  is not touched here, so it is recorded for ROADMAP rather than changed.
