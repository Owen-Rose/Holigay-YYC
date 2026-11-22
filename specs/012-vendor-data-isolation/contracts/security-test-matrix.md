# Contract: Security Test Matrix (spec 012 additions)

**Feature**: 012-vendor-data-isolation | **Date**: 2026-11-22
**Suite location**: `src/test/security/` (Vitest project `security`, node env, real local
Supabase stack; `describe.runIf(stackUp)`; mandatory in CI via `CI_REQUIRE_SECURITY_TESTS=1`).
Extends the 006, 005 Phase 11, 009/010 and 011 matrices; all their rows keep running.

## Callers

| Name | What it is | How it is made |
|---|---|---|
| **anon** | the public key, no session | `anonClient()` |
| **A**, **B** | vendor accounts, each tied to its own vendor record with one submitted application | `createAuthedVendor`, then a signed-in call to `submit_public_application` on the fixture event (which ties the account, as 011's L1 does) |
| **C** | a vendor account with no vendor record | `createAuthedVendor`, nothing else |
| **ORG** | organizer | `createAuthedOrganizer` |
| **ADM** | admin | `createAuthedAdmin` (new harness helper: `createAuthedUser` gains the `'admin'` role and a `sec-admin-<suffix>@…` address) |
| service | fixtures, ground truth and cleanup only; never the caller under test | `serviceClient()` |

Five sign-ins in the file (GoTrue allows 30 per 5 minutes). With this file a full
`npm run test:security` run makes 20 sign-ins (15 before), so leave about five minutes between
full local runs; CI makes one run on a fresh stack and is unaffected.

## Fixtures (built once in `beforeAll`)

- `seedFixtures()` as today, plus **event F**: an active event with a questionnaire holding one
  optional `file_upload` question, built draft-then-published by the service client, pushed to
  `fx.extraEventIds`. Claim cases submit to F because A and B already applied to the main
  fixture event (the duplicate gate would answer first).
- Uploaded with the anon client under `fx.storagePrefix`: `a-answer`, `b-answer`, `a-legacy`,
  `b-legacy`, `orphan` (text bodies that name themselves, so a download can be checked).
- A and B each submit to `fx.activeEventId`, signed in, with the three required answers; the
  file answer points at their `*-answer` object.
- Service inserts one `attachments` row per application pointing at the `*-legacy` object (the
  second reference kind, FR-007), and one note per application (`NOTE-A`, `NOTE-B`). The notes
  are seeded where the schema holds them: in `applications.organizer_notes` in the suite PR
  (015), in `application_notes` from the migration PR on. That is a fixture edit made by the
  migration PR, not a change to any case body.
- ORG creates one questionnaire template with its own session (pushed to
  `fx.extraTemplateIds`).
- Three active events made by the service client with `application_deadline` = yesterday,
  today and null, where "today" is `todayDateOnly()` from `src/lib/format-date.ts` (Edmonton).
  They carry no questionnaire, so every submission to them sends `answers: []` (the function's
  answer gate runs only when answers are present).

## New suite: `src/test/security/vendor-isolation.test.ts`

**Before 016** says what the case does on the 015 schema: **red** = it states a rule 016 adds
and is written `it.fails(...)` in the suite PR, then flipped to `it(...)` in the migration PR
with its body unchanged (research R10); **holds** = it already passes and is a plain `it(...)`
throughout, there to prove existing isolation and to catch a later loosening.

### Table reads (FR-014, FR-016, FR-017)

| # | Caller does | Sees | Before 016 | Covers |
|---|---|---|---|---|
| I1 | **A** selects every `vendors` row; then B's by id | exactly A's own row; `[]` | holds | FR-016 |
| I2 | **A** selects every `applications` row; then B's by id | only A's application; `[]` | holds | FR-016 |
| I3 | **A** selects every `application_answers` row; then by B's application id | only the answers of A's application; `[]` | holds | FR-016 |
| I4 | **A** selects every `attachments` row; then by B's application id | only A's attachment record; `[]` | holds | FR-016 |
| I5 | **ORG**, then **ADM**, select the run's rows from all four tables | both vendors' rows in each | holds | FR-017 |
| I6 | **anon**, then **C**, select from all four tables | `[]` from each | holds | FR-016, FR-021 "Anonymous" column |

### Files (FR-001, FR-003 to FR-007)

| # | Caller does | Sees | Before 016 | Covers |
|---|---|---|---|---|
| I7 | **A** downloads `a-answer` and `a-legacy`; mints a signed URL for `a-answer` and fetches it | the bodies; HTTP 200 | holds | FR-001, story 1 sc. 6 |
| I8 | **A** downloads `b-answer`, then `b-legacy`; asks for a signed URL to each | an error and no data each time; no URL | red | FR-001, FR-007, story 1 sc. 1–2 |
| I9 | **A** removes `b-answer` | nothing removed; service still lists the object; **B** and **ORG** still download it | red | FR-003, story 1 sc. 3 |
| I10 | **A** removes `a-answer` (their own) | nothing removed; A still downloads it | red | FR-003, story 1 sc. 4 |
| I11 | **ORG**, then **ADM**, remove an uploaded object | nothing removed; service still lists it | red | FR-003, story 1 sc. 5 |
| I12 | **ORG**, then **ADM**, download and sign `a-answer`, `b-legacy` and `orphan` | the bodies; working URLs | holds | FR-004, story 1 sc. 7, sc. 10 (organizer half) |
| I13 | **A** downloads and signs `orphan`; **A** lists the run's prefix | refused; the listing holds only `a-answer` and `a-legacy` | red | FR-001, story 1 sc. 10 |
| I14 | **C** downloads and signs `a-answer` and `orphan` | refused | red | story 1 sc. 13 |
| I15 | **anon**, **A** and **ORG** each upload a new object; **anon** then downloads, signs and removes `a-answer` | three uploads stored (service lists them); anon refused all three, the object still there | holds | FR-005, FR-006, story 1 sc. 11 |
| I16 | **A** uploads to `b-answer`'s name, without and with `upsert` | an error both times; B's download still returns B's body | holds | FR-003 (no overwrite) |

### Claims and direct writes (FR-002, FR-030)

| # | Caller does | Sees | Before 016 | Covers |
|---|---|---|---|---|
| I17 | **A** submits to event F with a file answer naming `b-answer` | `error.code === 'P0005'`; service finds no application for A on F and no new answer naming the file | red | FR-002, story 1 sc. 8 |
| I18 | after I17, **A** downloads `b-answer`; **B** downloads it | A refused; B gets the body | red | story 1 sc. 9, SC-002 |
| I19 | **anon** (a fresh address), then **ORG**, submit to F naming `b-answer`; **anon** submits naming `b-legacy` | `P0005` each time; no vendor row exists for the fresh address | red | FR-002 "every caller", FR-007 |
| I20 | **A** uploads `a-new`, submits to the draft event naming it, then submits to F naming it; downloads it | `P0001`; then success; the body | holds | Edge case "A refused or failed submission", story 1 sc. 12 |
| I21 | **A** inserts directly: an `attachments` row on A's own application with `file_path` = `b-answer`; an `application_answers` row on **B's** application; an `applications` row for A's vendor on the past-deadline event | `error.code === '42501'` each time; service finds none of the three rows; A still cannot download `b-answer` | red | FR-030, FR-019 |
| I22 | **ORG** inserts an `attachments` row on B's application | success (service removes it afterwards) | holds | FR-017, FR-030 |

### Organizer notes (FR-012, FR-013, FR-015)

| # | Caller does | Sees | Before 016 | Covers |
|---|---|---|---|---|
| I23 | **A** selects `id, organizer_notes` from their own application; then `*` | `organizer_notes` is null; no value in the row equals `NOTE-A` | red | story 3 sc. 1–2, SC-004 |
| I24 | **A** selects every `application_notes` row; then by their own application id; **anon** selects | `[]` with no error both times; anon gets `42501` | red | FR-012 |
| I25 | **ORG**, then **ADM**, run the app's embedded select `applications ( id, application_notes ( notes ) )` for both applications | `NOTE-A` and `NOTE-B`, each as an object, not an array | red | FR-015, story 3 sc. 4, research R7 |
| I26 | **ORG** upserts a changed note on A's application, deletes B's note, inserts it again; **ADM** updates one | every write succeeds; service reads back the expected text | red | FR-015 |
| I27 | **A** inserts, upserts, updates and deletes in `application_notes` for their own application and for B's; **anon** inserts; **A** updates `applications.organizer_notes` on their own application | insert and upsert `42501`; update and delete touch no rows; anon `42501`; service reads both notes unchanged and the column still null | red | FR-012, FR-015 last sentence, story 3 sc. 6 |
| I28 | service sets `applications.organizer_notes` on A's application | `error.code === '23514'` | red | FR-013 (the record can never hold a note again) |

### The account list and template creators (FR-008 to FR-011)

| # | Caller does | Sees | Before 016 | Covers |
|---|---|---|---|---|
| I29 | **A** selects every `users_with_roles` row; then their own by id | `[]` with no error both times | red | FR-008, story 2 sc. 1 |
| I30 | **ORG** selects every `users_with_roles` row | `[]` with no error | red | FR-008, story 2 sc. 6 |
| I31 | **ADM** selects the run's accounts; service does the same | all five, each with `email`, `role` and `invite_pending`; the same five | holds | FR-009, story 2 sc. 3–4 |
| I32 | **anon** selects `users_with_roles` | `42501` | holds | FR-011, story 2 sc. 2 |
| I33 | service promotes **C** to admin and **C** selects with the same session; service demotes C and C selects again | rows; then `[]` | red | story 2 sc. 8 |
| I34 | **ORG**, then **ADM**, call `rpc('template_creator_emails')`; **A** calls it; **anon** calls it | one row for ORG's id and address; every row has exactly the keys `creator_id` and `email`; no row for A, B, C or ADM. A: `42501`. anon: `42501` | red | FR-010, story 2 sc. 5, 7 |

### The deadline (FR-018 to FR-020)

| # | Caller does | Sees | Before 016 | Covers |
|---|---|---|---|---|
| I35 | **anon**, **A** and **ORG** each submit to the event whose deadline was yesterday | `P0001` each time; service counts zero applications on it | red | FR-018, FR-019, story 4 sc. 1 |
| I36 | **anon** submits to the event whose deadline is today, then to the one with none; **A** submits to the one whose deadline is today; **ORG** submits to the one with none, then downloads `b-answer` | success all four times; ORG, now holding a vendor record of its own, still gets B's body | holds | FR-018, FR-021, story 4 sc. 2–3, Edge case "An organizer who also has a vendor record" |
| I37 | **anon** submits to the draft event | `P0001`, the same code and message as I35 | holds | FR-020, story 4 sc. 5 |

### FR-021 table → cases

| FR-021 statement | Cases |
|---|---|
| Read the vendor record | I1, I5, I6 |
| Read applications | I2, I5, I6, I23 |
| Read answers | I3, I5, I6 |
| Read file references | I4, I5, I6 |
| Download a file | I7, I8, I12, I13, I14, I15 |
| Obtain a link to a file | I7, I8, I12, I13, I14, I15 |
| Delete a file | I9, I10, I11, I15 |
| Upload a file | I15, I16, I20 |
| Submit naming a file another application refers to | I17, I18, I19 |
| Add an application, answer or attachment record directly (FR-030) | I21, I22; the Anonymous column by `anon-writes.test.ts` W1 (existing, unchanged) |
| Read organizer notes | I23, I24, I25 |
| Write organizer notes | I26, I27, I28 |
| Read the account list | I29, I30, I31, I32, I33 |
| Read template creators' email addresses | I34 |
| Submit after the deadline day | I35 |
| Submit on the deadline day or with no deadline | I20, I36, I37 |

Red cases, for FR-022 and the L1 evidence row: I8–I11, I13, I14, I17–I19, I21, I23–I30, I33–I35
(21 cases). Holds: I1–I7, I12, I15, I16, I20, I22, I31, I32, I36, I37 (16 cases).

### Notes for the implementer

- A red case must fail on 015 **because of the rule**, not because of a typo. Record, per red
  case, the assertion that failed (quickstart row L1) before opening the suite PR.
- I24–I27 and I34 name `application_notes` and `template_creator_emails`, which are not in
  `src/types/database.ts` until the migration PR regenerates it. In the suite PR they go
  through one helper that returns the client typed as a plain `SupabaseClient`; the migration
  PR deletes the helper. On 015 these cases fail with "relation/function does not exist", which
  is the red state; write the assertions so that is a failure (`expect(error).toBeNull()`
  first).
- I25 on 015 would be red for a missing relation; that is expected and recorded.
- Storage refusals arrive in different shapes: `download` and `createSignedUrl` return an
  error; `remove` returns an empty list with no error (as ST4 notes). Assert the ground truth
  with the service client each time.
- On the 015 schema several red cases really do what they attempt: I9 and I10 remove the
  object, I17, I19, I21 and I35 write rows, I28 sets the column, I33 changes a role. Each puts
  back only what it actually changed, in a `finally`, with the service client (upload the same
  body again; delete the rows; restore the note or the role), so the plain cases that follow
  (I12, I15, I16, I20) hold on 015 and the suite PR's CI is green (research R10). I11 removes
  objects it uploaded itself, never a fixture object. After 016 these blocks never fire; they
  stay in the file when the cases are flipped, because the bodies are not edited.
- Cleanup: every user id into `fx.authUserIds`; events into `fx.extraEventIds`; the template
  into `fx.extraTemplateIds`; all objects sit under `fx.storagePrefix`.

## Existing cases that change (FR-023)

Changed in the migration PR, each named in its description. No other existing case is edited.

| Suite | Case | Change | Why |
|---|---|---|---|
| `storage.test.ts` | ST4 | the organizer half asserts that nothing is removed and the object survives; title becomes "nobody can delete a file from a session" | asserted the old broad behaviour (the one the spec names) |
| `harness.ts` | `seedFixtures` | the seeded note is inserted into `application_notes`, not into `applications.organizer_notes` | the column is locked by 016; intent unchanged |
| `anon-reads.test.ts` | R1 | the ground-truth read of the note uses `application_notes`; one line added: anon selecting `application_notes` gets `42501` | the note moved; intent ("exists, and anon cannot read it") unchanged |
| `anon-writes.test.ts` | W2 | the ground-truth read of the note uses `application_notes` | the note moved; the anon update under test is untouched |
| `dashboard-reads.test.ts` | D1 | the mirrored select reads `application_notes ( notes )` as the application now does | it mirrors `getApplications` |

Added to the harness, not changed: `createAuthedAdmin` (suite PR).

## Unit suites touched by the application changes

Listed in `server-actions.md`. They mock Supabase and prove nothing about access; the cases
above do.
