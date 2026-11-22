# Tasks: Vendor Data Isolation

**Input**: Design documents from `/specs/012-vendor-data-isolation/`
**Prerequisites**: plan.md, spec.md (with `checklists/requirements.md` passed 2026-11-22; Clarifications Session 2026-11-22, five answers), research.md (the five Track B facts re-verified, R1–R12, the dry run), data-model.md (`application_notes`, who may do what before and after), contracts/migration-016.md (the SQL by section, SQLSTATEs, read-back checks, rollback), contracts/submit-public-application-v3.md (the two gates and the full body), contracts/server-actions.md (the three action edits and the unit-test table), contracts/security-test-matrix.md (I1–I37, red/holds, the five edited cases), quickstart.md (the evidence record: rows L0–L2, D1–D8, P1–P2; the hosted-apply recipe; the docs list for close).

**Tests**: Included. Story 5 is the test suite itself (FR-021 to FR-023), FR-022 demands that every new rule is seen failing before the migration and passing after, and plan.md's Constitution Check (Principle II) requires a test with every changed action. The exact cases live in `contracts/security-test-matrix.md` and `contracts/server-actions.md` §5; the steps below name them and point there instead of copying them.

**Organization**: Task IDs T001–T013 are fixed from here: `quickstart.md`'s evidence rows cite them. The six phases mirror plan.md's "Phases" table and follow **execution order**, not the template's story-by-story order, because the five stories reduce to one migration that cannot be split (plan.md, "Phase 3 is one PR on purpose"). Story labels follow from that: T002 is wholly story 5's (the suite), so it carries `[US5]`; T003 is the one pull request that delivers stories 1 to 4 and turns story 5 green, so it carries no single label and each of its steps names the story and requirements it serves; T005–T008 are the per-story checks on the training deployment, each labelled with its story. `[manual]` tasks are Management-API, Vercel, training-site or mailbox work done by the maintainer; each is ticked only when its evidence rows are filled (spec 009/010/011 precedent). Every task is one `- [ ] Txxx [Story?] …` line, the Speckit checklist format that `/speckit-implement` ticks, and the repo tasks carry **Files**, **Interfaces** and step checkboxes beneath that line (the steps are sub-items, not tasks). Each repo task is one branch off `dev` and one PR, commits tagged `[012-Txxx]`, gated by `npm run format:check && npm run lint && npm test && npm run build` plus `npm run test:security` with the local stack up (`npx supabase db reset`; `docker restart supabase_kong_Holigay` if auth health returns 502 after a reset). **No Claude co-authoring trailers on commits or PRs.**

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement the repo tasks task-by-task, one task per session and only on the maintainer's explicit go. `[manual]` tasks are for the maintainer; an agent stops at them and reports what is needed. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in vendor reads only what is theirs: their own vendor record, applications, answers and uploaded files. They cannot open, link to, delete or claim another vendor's file, cannot list accounts, and never receive organizer notes. Nobody deletes a file from a signed-in session. A submission after the deadline day in Edmonton is refused. Organizers and admins keep their work, minus file delete and (for organizers) the account list. A real-database suite proves each statement for two vendors, a vendor account with no record, an organizer, an admin and an anonymous caller, and was seen failing first.

**Architecture:** One migration, `016_vendor_data_isolation.sql`, in six sections (plan.md Summary; research R1–R9): §1 `application_notes` (organizer/admin only), existing notes carried over, `applications.organizer_notes` emptied and locked by a CHECK; §2 the two broad storage policies dropped and one read policy created (organizer/admin, or a reference owned by the caller), no delete policy; §3 the three vendor-reachable INSERT policies replaced by organizer/admin-only ones; §4 `users_with_roles` returns rows only to an admin session and the service and owner roles; §5 `template_creator_emails()`; §6 `submit_public_application` replaced in place with a deadline gate and a file-claim gate (`P0005`). In the app, three action files change only because the notes moved and the organizer's view read closed (`contracts/server-actions.md`); no page, component, string or response type changes. The suite lands first with its 21 new-rule cases as `it.fails`, and the migration PR flips them (research R10).

**Tech Stack:** TypeScript 5.9 strict; PL/pgSQL and SQL (migration `016`); Next.js 16.0.7 App Router (server actions only); `@supabase/ssr` ^0.8; `@supabase/supabase-js` ^2.86 (`.rpc()`, embedded one-to-one select, Storage API in the suite); `zod` ^4.1 (one small schema); Vitest 4 (`unit` jsdom + `security` node against the local stack; `it.fails`); Supabase CLI (`db reset`, `gen types --local`). **No new packages.**

## Global Constraints

- Exactly one new migration, `016`, append-only; no earlier migration is edited (FR-024). If any task finds it needs a second migration or another table change, stop and bring it to Owen (spec Assumptions).
- Row Level Security is the authority. No rule on a touched object is loosened to keep a consumer working, and application code never stands in for a rule the database does not enforce (FR-025). The service-role client stays in `src/lib/supabase/admin.ts` (FR-026); `src/test/admin-client-containment.test.ts` must keep passing untouched.
- No interface change: no file under `src/app/` or `src/components/` is touched, no string changes, no response type changes (FR-027). `P0005` is deliberately not added to `src/lib/submission/errors.ts`.
- **Rollout order** (research R11): `016` reaches a hosted project **before** the code that reads it. On dev: T004 after T003's PR is approved and before it merges. On prod: T011 immediately before T012. In the window the old code shows blank notes, cannot save a note and shows `—` for template creators; nothing is lost and nothing is exposed.
- **Red before green, CI green on both sides** (research R10): T002 merges with every new-rule case written `it.fails(...)`; T003 turns each into `it(...)` with its body unchanged.
- **Sign-in budget**: with the new suite a full `npm run test:security` run makes 20 sign-ins (15 before) and the local GoTrue allows 30 per 5 minutes. Leave about five minutes between full local runs, or run the one file in between. A run that hits the limit fails with "sign-in failed", not with an assertion. CI makes one run on a fresh stack and is unaffected.
- `src/types/database.ts` is regenerated with `npm run db:types:local`, never edited by hand.
- Existing security cases: only the five FR-023 names change (ST4, the harness seed, R1, W2, D1), all in T003, each named in that PR's description.
- The SQL in `contracts/migration-016.md` and `contracts/submit-public-application-v3.md` passed the 2026-11-22 dry run; copy it verbatim. A difference found while implementing is reported, not improvised.
- Each repo PR is reviewed in a fresh session before merge (`/security-review` and `/code-review high <PR>`, Track B step B8); the reviewer runs the suite and does not rely on the PR body.
- Commits: `<type>(<scope>): <summary> [012-Txxx]`, no co-authoring trailers, no AI-attribution footer on PRs. Nothing starts without Owen naming the task. A task is ticked only when its PR is merged (repo) or its evidence rows are filled (manual).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel. No task here carries it: plan.md's phases are sequential.
- **[Story]**: US1–US5 from spec.md
- **[manual]**: Management API / Vercel / training-site / mailbox work; evidence recorded in quickstart.md before ticking

---

## Phase 1: Setup

**Purpose**: Make the spec and this task list the source of truth on `dev` (Track B step B6).

- [X] T001 Land the spec as a docs-only PR after `/speckit-analyze` has run and its findings are fixed in the spec documents (Track B step B5): on `012-vendor-data-isolation`, add the 012 row to specs/README.md after the 011 row (`| 012 | Vendor data isolation | 🚧 In progress — spec, plan, contracts and tasks T001–T013 written 2026-11-22 | <PR link> | — |`); in `docs/superpowers/plans/2026-11-21-post-launch-hardening.md` tick Track B steps B1–B5; `git add` `specs/012-vendor-data-isolation/` (spec.md, checklists/, plan.md, research.md, data-model.md, quickstart.md, contracts/, tasks.md), the two `CLAUDE.md` Active Technologies lines `/speckit-plan` appended (already in the working tree), specs/README.md and the hardening plan; `git commit -m "docs(specs): spec 012 vendor data isolation — plan, contracts, evidence record, tasks [012-T001]"`; `git push -u origin 012-vendor-data-isolation && gh pr create --base dev --title "docs(specs): spec 012 vendor data isolation (plan, contracts, tasks)" --body "Spec, plan, research, data model, four contracts, evidence record and task list for spec 012 (Track B of the 2026-11-21 hardening plan; backlog UAT-10). No code."`; put the PR number in the README row and amend. Tick after merge; B6 is ticked by the next docs change that touches the hardening plan (T013 at the latest). **No implementation starts before this merge and Owen's go.**

---

## Phase 2: User Story 5, first half — the isolation suite, red (Priority: P2)

**Goal**: Every statement of the FR-021 table exists as an automated case against a real database. The 16 cases that already hold pass; the 21 that state a rule `016` adds are written `it.fails`, so CI proves they fail on the 015 schema.

**Independent Test**: on a stack at 015 (`npx supabase db reset` on this task's branch), `npx vitest run --project security src/test/security/vendor-isolation.test.ts` passes. With `it.fails` temporarily changed to `it` in the working tree, exactly the 21 red cases fail, each on the assertion that states its rule; the edit is discarded.

- [X] T002 [US5] The isolation suite I1–I37, red-first, and the admin harness helper — in `src/test/security/vendor-isolation.test.ts` and `src/test/security/harness.ts` (files, interfaces and steps below)

**Files:**
- Create: `src/test/security/vendor-isolation.test.ts`
- Modify: `src/test/security/harness.ts` (add `createAuthedAdmin`; nothing else in this task)
- Modify: `specs/012-vendor-data-isolation/quickstart.md` (row L1)

**Interfaces:**
- Produces: `createAuthedAdmin(suffix: string): Promise<AuthedUser>` from `./harness`: `createAuthedUser`'s role parameter becomes `'organizer' | 'vendor' | 'admin'`, an admin gets the address `sec-admin-${suffix}@example.com`, and the existing "promote with the service client" branch already handles any non-vendor role. `createAuthedOrganizer` and `createAuthedVendor` are unchanged.
- Produces: the suite `describe.runIf(stackUp)('vendor isolation (spec 012)', …)` with one case per matrix row, titled `I<n>: …`. Consumed by T003, which flips the red cases.
- Leaves untouched: every other file under `src/test/security/`. `seedFixtures` is not edited here (its note seed moves in T003).

- [X] **Step 1: Harness** — in `src/test/security/harness.ts` widen `createAuthedUser(suffix, role)` to accept `'admin'` and pick the address per role (`sec-organizer-…`, `sec-admin-…`, `sec-vendor-user-…`); export `createAuthedAdmin`. Update the doc comment ("organizers and admins are promoted with the service client afterwards").
- [X] **Step 2: Callers and fixtures** — create the suite file with the header comment style of `src/test/security/vendor-linking.test.ts` (what it proves, the callers, the matrix path). In `beforeAll`, sequentially (each sign-in is one GoTrue call; five in this file, the limit is 30 per 5 minutes): `fx = await seedFixtures()`; **A** and **B** = `createAuthedVendor('iso-a-…' / 'iso-b-…')`; **C** = `createAuthedVendor('iso-c-…')` and nothing else; **ORG** = `createAuthedOrganizer`; **ADM** = `createAuthedAdmin`; push every user id to `fx.authUserIds`. Then, per `contracts/security-test-matrix.md` "Fixtures":
  - **event F**: service inserts a draft event, an `event_questionnaires` row, one optional `file_upload` question at position 0, then sets the event `active` (the draft-then-publish order `seedFixtures` uses); push the id to `fx.extraEventIds`.
  - **three deadline events**: service inserts three `active` events with `application_deadline` = yesterday, today and null; push to `fx.extraEventIds`. "Today" is `todayDateOnly()` from `src/lib/format-date.ts` (Edmonton); "yesterday" is that date minus one day computed on the date string in UTC, never from the machine's local clock. They carry no questionnaire, so every submission to them sends `answers: []` (the RPC's answer gate runs only when answers are present).
  - **uploads**, with the anon client, under `fx.storagePrefix`: `a-answer`, `b-answer`, `a-legacy`, `b-legacy`, `orphan`, each a text body that names itself so a download can be checked.
  - **A and B submit** to `fx.activeEventId`, signed in, with the three required answers (`fx.requiredTextQuestionId` → `{ kind: 'text', … }`, `fx.requiredMultiSelectQuestionId` → `{ kind: 'choices', value: ['art'] }`, `fx.requiredFileQuestionId` → `{ kind: 'file', path: <their *-answer object>, name, mimeType, size }`), the payload shape of `submission-rpc.test.ts`. The signed-in call ties each account to its vendor row; read the vendor and application ids back with the service client.
  - **service inserts** one `attachments` row per application pointing at the `*-legacy` object, and one note per application, `NOTE-A` and `NOTE-B`. On the 015 schema the note goes into `applications.organizer_notes`; T003 moves this seed to `application_notes`.
  - **ORG creates** one questionnaire template with its own session; push to `fx.extraTemplateIds`.
  `afterAll`: `cleanupFixtures(fx)`.
- [X] **Step 3: The cases** — write I1–I37 exactly as the matrix states them ("Caller does" → "Sees"), grouped under the matrix's five headings. The 16 **holds** cases (I1–I7, I12, I15, I16, I20, I22, I31, I32, I36, I37) are plain `it(...)`. The 21 **red** cases (I8–I11, I13, I14, I17–I19, I21, I23–I30, I33–I35) are `it.fails(...)`. I36 has four submissions (anon to the today and the no-deadline events, A to the today event, ORG to the no-deadline event) and ends with ORG, now holding a vendor record, downloading `b-answer`. Follow the matrix's "Notes for the implementer": assert ground truth with the service client after every storage call (`remove` returns an empty list, not an error, when RLS filters the row); for I24–I27 and I34, which name `application_notes` and `template_creator_emails` before the types know them, go through one local helper that returns the client typed as a plain `SupabaseClient`, and assert `expect(error).toBeNull()` first so "relation does not exist" is a failure.
- [X] **Step 4: Keep the 015 side clean** — on the 015 schema several red cases really do what they attempt, and a plain case that runs later must not inherit the damage. Each of these puts back **only what it actually changed** (check the call's own result or the service-client ground truth first), in a `finally`, with the service client:
  - I9, I10: if the object is gone, upload the same body again (otherwise I12, I15 and I16 fail on 015).
  - I11: remove dedicated objects uploaded inside the case (`org-remove`, `adm-remove`), never a fixture object.
  - I17, I19: delete any application the case created on event F (otherwise I20's own submission to F answers `P0003` on 015).
  - I21: delete the three rows if they were inserted. For the answer on B's application use an optional question B did not answer (the `long_text` one).
  - I28: if the write went through, set the column back to `NOTE-A`.
  - I33: set C's role back to `vendor` unconditionally.
  - I35: delete any application created on the past-deadline event.
  After `016` none of these blocks fires. They stay in the file when T003 flips the cases: the bodies are not edited (R10), and they stop one regression from cascading into unrelated cases.
- [X] **Step 5: Run at 015** — `npx supabase db reset`; `npx vitest run --project security src/test/security/vendor-isolation.test.ts` → 37 passing (21 of them because their bodies fail). `npm run test:security` → every earlier suite still passes. A **holds** case that fails on 015 is a finding about today's rules: stop and bring it to Owen; do not adjust the case.
- [X] **Step 6: Record the red run (row L1)** — temporarily change every `it.fails(` to `it(` in the working tree, run the file, and copy the failing assertion of each of the 21 cases into `quickstart.md` row L1 (case id → the assertion that failed and what it received). Each must fail **because of the rule** (the other vendor's body came back; the object was removed; `NOTE-A` was returned; the relation or function does not exist; the submission succeeded), never because of a typo or a fixture error. Confirm the 16 others pass in that run. Discard the edit (`git checkout -- src/test/security/vendor-isolation.test.ts`).
- [X] **Step 7: Gate and commit** — `npm run format:check && npm run lint && npm test && npm run build && npm run test:security`; `git commit -m "test(security): cross-vendor isolation suite I1–I37, red-first with it.fails [012-T002]"`. PR to `dev`. The PR body lists the 21 red and 16 holds case ids and says that T003 flips the red ones with their bodies unchanged.

**Checkpoint**: the FR-021 table is executable and CI shows the new rules failing on today's schema. L1 filled.

---

## Phase 3: User Stories 1–4, and User Story 5 turned green — migration `016` and the code that reads it

**Goal**: One pull request closes all four gaps and the late-submission hole, keeps every listed consumer working, and turns the 21 red cases green. `016` goes onto the dev project from that PR's approved head, before the merge.

**Independent Test**: on the PR's branch, `npx supabase db reset` applies 001 → 016; `npm run test:security` passes with all 37 isolation cases as plain `it` and every earlier suite green; `npm test` passes; the four browser checks in quickstart.md "In the browser against the local stack" behave as written.

**⚠️ CRITICAL**: T003 must not merge before T004 is filled, or the training deployment runs code that reads a table and a function the dev project does not have.

- [X] T003 Migration `016`, the regenerated types, the suite flipped green, the five edited security cases, and the three action edits with their unit tests — in `supabase/migrations/016_vendor_data_isolation.sql`, `src/types/database.ts`, `src/test/security/vendor-isolation.test.ts`, `src/lib/actions/applications.ts`, `src/lib/actions/export.ts`, `src/lib/actions/templates.ts`, `src/lib/validations/application.ts` (files, interfaces and steps below)

**Files:**
- Create: `supabase/migrations/016_vendor_data_isolation.sql`, `src/test/application-notes-action.test.ts`
- Modify: `src/types/database.ts` (regenerated), `src/lib/validations/application.ts` (`applicationNotesSchema`), `src/lib/actions/applications.ts`, `src/lib/actions/export.ts`, `src/lib/actions/templates.ts`
- Modify (security suites): `src/test/security/vendor-isolation.test.ts` (flip, helper removed, note seed), `src/test/security/harness.ts` (`seedFixtures` note seed), `src/test/security/storage.test.ts` (ST4), `src/test/security/anon-reads.test.ts` (R1), `src/test/security/anon-writes.test.ts` (W2), `src/test/security/dashboard-reads.test.ts` (D1)
- Modify (unit tests): `src/test/applications-readers.test.ts`, `src/test/organizer-read-auth.test.ts`, `src/test/applications-email-warning.test.ts`, `src/test/export.test.ts`, `src/test/templates-actions.test.ts`
- Modify (docs in this PR): `supabase/migrations/README.md` (the `016` row; the "next prefix" line becomes `017_*`), `CLAUDE.md` (Database Migrations list: item 16, one line), `specs/012-vendor-data-isolation/quickstart.md` (row L2)

**Interfaces:**
- Produces (database, `contracts/migration-016.md`): table `public.application_notes (application_id PK/FK, notes, updated_at)` with RLS and four organizer/admin policies; CHECK `applications_organizer_notes_retired`; storage policy `attachments_select_own_or_organizer` and no delete policy; INSERT policies `organizer_insert_applications`, `organizer_insert_attachments`, `organizer_insert_application_answers`; the filtered security-barrier view `users_with_roles` (same six columns, same grants); `public.template_creator_emails() → TABLE (creator_id uuid, email text)` (`authenticated` only, `42501` below organizer); `public.submit_public_application(jsonb)` v3, same signature, return type and grants, with `P0001` widened to a past deadline and the new `P0005`.
- Produces (app, `contracts/server-actions.md`): `applicationNotesSchema` from `@/lib/validations/application` (`id` a UUID, `notes` a string); `updateApplicationNotes(id, notes)` with the same signature and `UpdateApplicationResponse`, now validating, then upserting or deleting the `application_notes` row, then bumping `applications.updated_at`, then calling `revalidatePath` for the applications list and the application's review page (constitution IV; the action had none). `ApplicationWithVendor.organizer_notes`, `ApplicationDetail.organizer_notes` and the export's "Organizer Notes" column keep their names and types; `listTemplates` keeps `createdByEmail: string | null`.
- Removes: the `UsersWithRolesRow` alias in `templates.ts`; the untyped-client helper in the isolation suite.
- Consumes: T002's suite and `createAuthedAdmin`.

- [X] **Step 1: The migration (all stories)** — create `supabase/migrations/016_vendor_data_isolation.sql` with a header comment (spec 012, date, the six sections, "append-only; replaces `submit_public_application` from 015 in place") followed by `contracts/migration-016.md` §1–§5 **verbatim** and, as §6, the "Full body" of `contracts/submit-public-application-v3.md` with its `COMMENT ON FUNCTION`. §1 serves US3 (FR-012, FR-013), §2 US1 (FR-001, FR-003, FR-004), §3 US1 and US4 (FR-030, FR-019), §4 US2 (FR-008, FR-009), §5 US2 (FR-010), §6 US1 and US4 (FR-002, FR-018 to FR-020). `npx supabase db reset` → applies 001 → 016 cleanly; run the contract's "Read-back checks" block against the local database and confirm every expected value (on a fresh stack the first line is 0).
- [X] **Step 2: Types** — `npm run db:types:local`. Expected differences per `contracts/server-actions.md` §4: a new `application_notes` table with a one-to-one relationship to `applications`; a new `template_creator_emails` function; `applications.organizer_notes` still present; `users_with_roles` unchanged. Commit the regenerated file as it is.
- [X] **Step 3: Flip the suite green (US5; FR-022)** — in `src/test/security/vendor-isolation.test.ts` change each of the 21 `it.fails(` to `it(` and leave every case body as T002 wrote it. Delete the untyped-client helper and call the typed client directly. In `beforeAll`, seed `NOTE-A` and `NOTE-B` into `application_notes` instead of the column; this is a fixture edit, the companion of the harness change in Step 4, and is named in the PR body. `npx vitest run --project security src/test/security/vendor-isolation.test.ts` → 37 passing. If I25's embed arrives as an array instead of an object, stop: research R7 names the fallback mapping, and the choice goes in the PR body.
- [X] **Step 4: The five edited cases (FR-023)** — exactly the rows of `contracts/security-test-matrix.md` "Existing cases that change", nothing more: (1) `storage.test.ts` ST4: the organizer half asserts nothing is removed and the object survives; title "nobody can delete a file from a session". (2) `harness.ts` `seedFixtures`: the application insert drops `organizer_notes`, and the same text is inserted into `application_notes` for that application. (3) `anon-reads.test.ts` R1: the ground-truth read of the note uses `application_notes`; one added line asserts that anon selecting `application_notes` gets `42501`. (4) `anon-writes.test.ts` W2: the ground-truth read of the note uses `application_notes`; the anon update under test is untouched. (5) `dashboard-reads.test.ts` D1: the mirrored select reads `application_notes ( notes )` and the assertion reads the note from the embed. `npm run test:security` → every suite passes. Keep `git diff --stat dev -- src/test/security/` for row L2.
- [X] **Step 5: Failing unit tests (US3, US2)** — per `contracts/server-actions.md` §5, in the Arrange-Act-Assert style and Supabase mock of `src/test/auth-roles.test.ts`: create `src/test/application-notes-action.test.ts` (non-empty note → one upsert on `application_notes` with `onConflict: 'application_id'`, then the timestamp bump; empty note → delete, not upsert; a caller below organizer → refused with no database call; a non-UUID id → `'Invalid notes'` with no database call; upsert error → `'Failed to update notes'`; bump error only → success; with `next/cache` mocked, a successful save calls `revalidatePath` with `/dashboard/applications` and `/dashboard/applications/<id>`, and a refusal, a validation failure or an upsert error does not call it). Update `applications-readers.test.ts` (fixture row carries `application_notes: { notes }`; the detail maps it to `organizer_notes`, and to `null` when the embed is `null`; the select string names `application_notes` and not `organizer_notes`), `organizer-read-auth.test.ts` (fixture shape only), `applications-email-warning.test.ts` (fixture shape; new case: a saved note reaches `statusUpdateEmail` as `organizerNotes`), `export.test.ts` (fixture shape; the "Organizer Notes" column assertion keeps passing; the select string names `application_notes`), `templates-actions.test.ts` (the creator-email case mocks `rpc('template_creator_emails')` returning `[{ creator_id, email }]`; new case: the RPC erroring leaves `createdByEmail` null and the action still succeeds). Run → FAIL.
- [X] **Step 6: Schema and actions (US3, US2; FR-015, FR-010)** — `src/lib/validations/application.ts`: add `applicationNotesSchema`. `src/lib/actions/applications.ts`: in the three selects (`getApplications`, `getApplicationById`, `updateApplicationStatus`) the line `organizer_notes,` becomes `application_notes ( notes ),` and each maps `organizer_notes: app.application_notes?.notes ?? null`; `updateApplicationStatus` passes the same value to `statusUpdateEmail`; `updateApplicationNotes` gets the six-step body of `contracts/server-actions.md` §1, ending with the two `revalidatePath` calls. `src/lib/actions/export.ts`: the same select change; the row builder reads the embed; the eleven columns are untouched. `src/lib/actions/templates.ts`: `listTemplates` calls `supabase.rpc('template_creator_emails')` per §3 and the `UsersWithRolesRow` alias is deleted. `npx tsc --noEmit` → clean. Re-run the unit tests → PASS; `src/test/admin-client-containment.test.ts` passes unchanged.
- [X] **Step 7: Docs in the same PR** — `supabase/migrations/README.md`: the `016` row in the active set (what each of the six sections does, in the style of the `015` row) and the "next prefix" line; `CLAUDE.md`: Database Migrations item 16, one line. The rest of the agent guidance waits for T013.
- [X] **Step 8: Local check in the browser** — `npm run dev` and the four checks of quickstart.md "In the browser against the local stack": an organizer saves a note (the box keeps its text and "Last Updated" moves without a reload), reloads, exports the CSV and changes the status (the Mailpit mail carries "Note from the Organizer"); `/dashboard/templates` shows the creator's address; `/dashboard/admin` and `/dashboard/team` list every account for the admin; a vendor opens their own file answer.
- [X] **Step 9: Gate, evidence and commit** — `npm run format:check && npm run lint && npm test && npm run build && npm run test:security`; fill quickstart.md row L2 (37 plain cases passing, every earlier suite passing, the `git diff --stat` showing only the five named edits to existing cases); `git commit -m "feat(db): migration 016 — vendor data isolation: notes store, scoped file reads, admin-only account list, deadline and file-claim gates [012-T003]"`. PR to `dev`. The PR body names the five edited existing cases and the suite's note-seed move (FR-023), states the rollout window from research R11, notes that this PR's Vercel preview reads the dev project and so errors on organizer pages until T004 is done, and carries the line **"Do not merge before 012-T004 is filled; `016` is applied to dev from this PR's head."**

- [X] T004 [manual] Apply `016` to the dev project (ref `kcokcufmzyckbodelqpb`) once T003's PR is approved and its checks are green, and **before it merges** — the SQL file is `supabase/migrations/016_vendor_data_isolation.sql` at that PR's head commit (record the SHA; if the SQL changes after it was applied, stop and tell Owen). Run quickstart.md "Inventory before" and record the counts (`applications`, `with_notes`, files referred to by two applications, bucket objects, storage policies, templates with a creator, `schema_migrations` max `015`). If the two-reference query returns rows, stop and decide with Owen. **If `with_notes` is 0, have an organizer save a note on an existing dev application on the training site first and run the inventory again**: T007's "a note that existed before D1" needs one. Then `POST` the whole file plus the `016` row for `supabase_migrations.schema_migrations` as one Management API query in one transaction (`docs/runbooks/reset-hosted-project.md` §7; dev writes are fine in either permission mode), or paste it as one SQL Editor block. Run the "Read-back checks" block of `contracts/migration-016.md`: its first line must equal `with_notes` from the inventory; `schema_migrations` max is `016`. Then merge T003. evidence: quickstart.md row **D1** — FR-013, FR-024, FR-028 (dev half), SC-004 (carry-over on dev)

**Checkpoint**: `016` proven locally, live on dev, and its code on `dev`. All 37 cases pass on every pull request from here. L2 and D1 filled.

---

## Phase 4: The stories on the training deployment

**Purpose**: FR-028's probe with two throwaway vendor accounts, the eight consumers, and the cleanup. One sitting, in task order, T003 on `dev` and T004 filled.

**Set-up for the sitting** (part of T005, used by T005–T009): on dev there are two active events, each with a questionnaire that has a file question, and one template created by the organizer account (quickstart.md "Prerequisite on dev"); create what is missing as the admin. Invite `<maintainer>+012-a@…` and `<maintainer>+012-b@…` as Vendor from the Team page and set a password for each at `/set-password`. The four gaps are not reachable from the app's pages, so the direct calls use a throwaway script kept **outside the repository** (quickstart.md "Probing a deployment as a vendor"): it signs in with the project's URL and anon key and prints the error code or row count of each call. No key, password or real address is written into any file in the repository.

### User Story 1 — A vendor's uploaded files are theirs alone (Priority: P1)

**Independent Test**: as A, by direct API, B's file cannot be downloaded, signed or removed and cannot be claimed in a submission or by a direct insert; B's file still opens for B and for an organizer; A's own file opens from A's application page.

- [X] T005 [manual] [US1] Files and claims on `training.holigayeventsyyc.ca`. (D2) `+012-a` and `+012-b` each apply with a file. As A, with the probe script: download B's file, ask for a signed URL to it, remove it → all refused; B's file still opens for B from `/vendor-dashboard/applications/[id]` and for an organizer from the review page. A opens their own file from `/vendor-dashboard/applications/[id]`. A removes their own file → refused, and it still opens. (D3) As A, submit to the second event, answering **that event's** file question with B's stored file path (read the path back through the Management API; an answer that names the first event's question is refused with `P0004` before the claim gate is reached) → refused with `P0005`, no application created (Management API read), and A still cannot open the file. A direct insert of an `attachments` row naming it → refused. Record the error codes, row counts and what each page showed. evidence: quickstart.md rows **D2**, **D3** — US1 scenarios 1–10 and 12, FR-001 to FR-004, FR-030, SC-001, SC-002

### User Story 2 — The account list is not a vendor's to read (Priority: P2)

**Independent Test**: a vendor and an organizer asking the API directly for the account list each get no rows; the organizer gets the template creator's address from the narrow read and nothing else.

- [X] T006 [manual] [US2] The account list on the training deployment, with the probe script. (D4) As A: `users_with_roles` → no rows, with and without a filter on A's own id. As the organizer by direct API: `users_with_roles` → no rows; `template_creator_emails` → one row per creator, each with exactly `creator_id` and `email`. Record the row counts and the keys returned (no address is written down). evidence: quickstart.md row **D4** — US2 scenarios 1, 6, 7, FR-008, FR-010, SC-003

### User Story 3 — Organizer notes stay with the organizers (Priority: P3)

**Independent Test**: an organizer saves a note on A's application; A, asking the API directly for that application with every field and for `application_notes`, receives no note; a note that existed before `016` is still on the review page and in the CSV.

- [X] T007 [manual] [US3] Notes on the training deployment. (D5) An organizer saves a note on A's application from the review page. As A with the probe script: the application selected with `*` and with `organizer_notes` named → no note; `application_notes` → no rows. The note that existed before T004 (its application is recorded in D1) is still shown on its review page and in the Organizer Notes column of the CSV export. A's application list and detail pages render as before. Record what each read returned and what the pages showed. evidence: quickstart.md row **D5** — US3 scenarios 1–5 and 7, FR-012 to FR-015, SC-004

### User Story 4 — A submission after the deadline day is refused (Priority: P4)

**Independent Test**: a direct submission to an active event whose deadline was yesterday is refused with the not-accepting code; one whose deadline is today succeeds; a form opened before the deadline moved shows the inline not-accepting message and keeps the entries.

- [X] T008 [manual] [US4] The deadline on the training deployment. (D6) As the admin, create two probe events: active, one with yesterday's deadline, one with today's (Edmonton). With the probe script: a direct submission to the first → `P0001`, no application stored; to the second → success. Then open `/apply` for an event that is still open, fill the form, have the admin move that event's deadline to yesterday, and submit: the inline "not currently accepting applications" alert appears and the entries are kept (BL-23's behaviour), and no confirmation mail arrives. Record the codes, the stored-row counts, the alert text and the empty mailbox. evidence: quickstart.md row **D6** — US4 scenarios 1, 2, 4, FR-018 to FR-020, SC-006

### The consumers and the cleanup

- [X] T009 [manual] The eight consumers of spec.md "What relies on today's behaviour", each once on the training site (D7): (1) signed-out upload on `/apply`; (2) an organizer opens a file from the review page; (3) a vendor opens their own file; (4) the admin Team page lists accounts with the Pending badge; (5) the template list shows the creator; (6) invite a new address and re-send a pending one; (7) the review page shows and saves a note, the CSV carries it, and the status mail carries it; (8) the reset runbook's object removal, done as T010's cleanup. Record one line per consumer: what was done and what was seen. evidence: quickstart.md row **D7** — FR-004, FR-005, FR-009, FR-010, FR-014, FR-015, FR-017, SC-005

- [X] T010 [manual] Dev cleanup after T005–T009 (D8): delete the `+012-a` and `+012-b` auth users (profiles cascade), their vendor rows, applications, answers and notes; any account invited for T009 consumer 6; the probe events; and their bucket objects **through the dashboard or the Storage API with the service role** (`docs/runbooks/reset-hosted-project.md` §3), which is consumer 8 and shows that removing session delete left the runbook's ways working. Read back the counts (`auth.users` with `+012-`, `vendors`, `applications`, `application_answers`, `application_notes`, bucket objects). evidence: quickstart.md row **D8** — FR-003 (the runbook half)

**Checkpoint**: stories 1 to 4 observed on the training deployment and all eight consumers working. D2–D8 filled.

---

## Phase 5: Rollout to production

**Purpose**: `016` on the production project in the right order, then the promotion (FR-028, SC-009).

- [ ] T011 [manual] Apply `016` to the production project (ref `hgmfjvjlxrhdojwlkgap`) after T003 is on `dev` and D1–D8 are filled: session in **default** permission mode, Owen present. Run quickstart.md "Inventory before" and record the counts (`with_notes` may be 0; record what is found) → Owen's explicit confirm → `POST` `supabase/migrations/016_vendor_data_isolation.sql` from `dev`'s tip plus the `016` `schema_migrations` row as one Management API query in one transaction → the "Read-back checks" block of `contracts/migration-016.md`: `application_notes` rows = `with_notes`, 0 non-null `organizer_notes`, the CHECK present, exactly two storage policies, the three organizer INSERT policies, `{security_barrier=true}`, the two `template_creator_emails` privileges, the RPC comment naming spec 012 and `P0005`. Rollback, if needed: the block at the end of `contracts/migration-016.md`, code reverted first, on Owen's go. evidence: quickstart.md row **P1** — FR-013, FR-024, FR-028 (prod half), SC-004 (carry-over on prod), SC-009

- [ ] T012 [manual] Promote straight after P1: `npm run smoke` against prod → 5/5 (the script is unchanged; its one RPC call expects `P0002`, raised before either new gate); `dev` → `main` (one PR, `main` fast-forwards to `dev`'s tip); `npm run smoke` again → 5/5; the click-through of `docs/runbooks/event-week-smoke.md`, including a note saved and shown on the review page and a file opened by the vendor who uploaded it; remove the test data with the runbook's cleanup SQL. A backup taken from here on matches the `016` schema; one taken earlier restores onto `015` and is then migrated (`docs/runbooks/backup-restore.md` §3.1 and §3.3a, updated in T003). Record the promotion SHA range, both smoke results and the read-backs; the entry for `docs/runbooks/event-week-smoke.md` goes in with T013 (or a direct docs commit to `dev`, as BL-24's did). evidence: quickstart.md row **P2** — FR-028, SC-009

---

## Phase 6: Documentation

**Purpose**: Every document FR-029 names is current.

- [ ] T013 Documentation per FR-029, one docs-only PR to `dev` after T012 (or earlier with P1/P2 marked owed and amended later) — in `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `specs/README.md`, `docs/backlog/2026-10-06-uat-and-go-live.md`, `docs/superpowers/plans/2026-11-21-post-launch-hardening.md`, `supabase/migrations/README.md`, `docs/runbooks/reset-hosted-project.md`, `docs/runbooks/event-week-smoke.md`, `docs/runbooks/backup-restore.md`, following the "Docs to update at close" table in `quickstart.md` line by line: (1) `CLAUDE.md` — Database Schema gains `application_notes`, the retired `organizer_notes` column, `template_creator_emails()`, the admin-only view, the storage policy pair and `P0005`; the server-action notes for `applications.ts` and `templates.ts`; Database state (`016` on dev and prod with dates); a Recent Changes entry; Current Development Phase. (2) `docs/ARCHITECTURE.md` — §3 (the vendor layer is now proven; vendors insert only through the RPC), §5 (`application_notes`), §9 (the isolation suite), §10 (strike "cross-vendor isolation, still hand-verified"). (3) `docs/ROADMAP.md` — Tier 3: strike the `users_with_roles` item and "Cross-vendor isolation is the natural next suite"; the Tier 1 table's storage row names the new policy pair; add the two items from research.md "Found on the way, left alone" (`authenticated_select_events` is `USING (true)`; `vendor_update_own` covers every column) and the `updateApplicationStatus` revalidation gap recorded there. (4) `specs/README.md` — the 012 row → ✅ with PR numbers and dates. (5) the backlog — tick Spec 012; close UAT-10. (6) the hardening plan — tick whatever of B1–B10 is still open. (7) `supabase/migrations/README.md` — confirm the `016` row and "next prefix" line from T003 are right. (8) `docs/runbooks/reset-hosted-project.md` — the inventory query counts `application_notes`; the FK table in §0 gains `application_notes.application_id → applications` (CASCADE) and the Verify table in §5 lists it; one line under §3: since `016` no signed-in session can delete an object, and options A–C are unaffected. (9) `docs/runbooks/event-week-smoke.md` — the promotion entry (P2). (10) `docs/runbooks/backup-restore.md` — done in T003 after the review of #89 (§3.1 resets to the dump's migration level, §3.3a migrates a pre-`016` restore); confirm it is still right. (11) `.specify/memory/constitution.md` — no change expected; confirm the version is still 1.1.3. Also tick this file's rows as they stand. `git commit -m "docs: close spec 012 — agent guidance, architecture, roadmap, backlog, runbooks [012-T013]"`. Tick after merge.

---

## Dependencies and execution order

- **T001** first: the task list is the source of truth on `dev`, and no implementation starts before it merges.
- **T002** needs T001 merged. It touches only the new suite file, one harness helper and row L1.
- **T003** needs T002 merged (it flips T002's cases). It is opened, reviewed and approved, then waits.
- **T004** needs T003 approved with green checks, and is filled **before T003 merges**. T003 merges straight after.
- **T005–T009** need T003 on `dev` (the training deployment has redeployed) and T004 filled. One sitting, in order; T005 sets up the accounts and events the others use.
- **T010** after T005–T009.
- **T011** after T010, on Owen's go, in default mode. **T012** immediately after T011.
- **T013** after T012, or earlier with the P rows owed.
- A task is ticked only when its PR is merged (repo) or its evidence rows are filled (manual).

## Parallel execution examples

None between tasks. plan.md states that the phases are sequential, and each repo task builds on the merge before it: T002's suite is what T003 flips, and T003's schema is what T004 applies.

What does group together:

- **One sitting**: T005 → T006 → T007 → T008 → T009 with the same two throwaway accounts and one probe script, then T010 straight after.
- **One window**: T011 and T012 back to back, so production holds the new schema with the old code for minutes only.
- **Inside T003**, Steps 5–6 (unit tests and actions) can be written while `npm run test:security` from Step 4 runs; they are still one branch and one PR.

## Implementation strategy

- **There is no smaller MVP than the migration.** One migration closes all four gaps and the late-submission hole together, so the first shippable point is T001 → T002 → T003 + T004: all five stories live on the dev project and proven on every pull request. Story 1 (P1) cannot land ahead of the others without splitting `016`, which FR-024 forbids.
- **Increment 1 (the proof, red)**: T002. Nothing a user can see; it makes the gaps visible in CI.
- **Increment 2 (the fix)**: T003 + T004. From here the suite guards every later change (story 5 scenario 4).
- **Increment 3 (observed)**: T005–T010 on the training deployment, per story, plus the eight consumers.
- **Close**: T011 → T012 → T013. Production sees `016` before the code, never the reverse.
- **Stop points**: after T002 (no behaviour change yet), and after T010 (dev done, prod untouched). Stopping between T004 and T003's merge leaves the training deployment in the R11 window (blank notes, `—` for creators) and should not happen.

## Task-to-requirement map

Case ids refer to `contracts/security-test-matrix.md`; `§n` to the sections of migration `016`.

| FR | Tasks | FR | Tasks |
|---|---|---|---|
| FR-001 | T002 (I7, I8, I13, I14), T003 (§2), T005 | FR-016 | T002 (I1–I4, I6) |
| FR-002 | T002 (I17–I19), T003 (§6), T005 | FR-017 | T002 (I5, I22), T009 |
| FR-003 | T002 (I9–I11, I16), T003 (§2, ST4), T005, T010 | FR-018 | T002 (I35, I36), T003 (§6), T008 |
| FR-004 | T002 (I12), T003 (§2), T009 | FR-019 | T002 (I21, I35), T003 (§3, §6) |
| FR-005 | T002 (I15, I20), T009 | FR-020 | T002 (I37), T008 |
| FR-006 | T002 (I15) | FR-021 | T002 |
| FR-007 | T002 (I8, I19), T003 (§2, §6) | FR-022 | T002 (L1), T003 (L2) |
| FR-008 | T002 (I29, I30, I33), T003 (§4), T006 | FR-023 | T003 (Step 4) |
| FR-009 | T002 (I31), T009 | FR-024 | T003, T004, T011 |
| FR-010 | T002 (I34), T003 (§5, `listTemplates`), T006, T009 | FR-025 | T003 |
| FR-011 | T002 (I32) | FR-026 | T003 (containment test unchanged) |
| FR-012 | T002 (I23, I24, I27), T003 (§1), T007 | FR-027 | T003 |
| FR-013 | T002 (I28), T003 (§1), T004, T007, T011 | FR-028 | T003 (local), T004, T005–T010, T011, T012 |
| FR-014 | T002 (I2–I4), T007, T009 | FR-029 | T001, T003 (migrations README), T013 |
| FR-015 | T002 (I25, I26), T003 (Steps 5–6), T007, T009 | FR-030 | T002 (I21, I22), T003 (§3), T005 |

| SC | Tasks | SC | Tasks |
|---|---|---|---|
| SC-001 | T005 | SC-006 | T002 (I35, I36), T008 |
| SC-002 | T002 (I17, I18), T005 | SC-007 | T002 (L1), T003 (L2) |
| SC-003 | T006, T009 | SC-008 | T003 |
| SC-004 | T004, T007, T011 | SC-009 | T011, T012 |
| SC-005 | T009 | | |
