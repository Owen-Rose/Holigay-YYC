# Implementation Plan: Vendor Data Isolation

**Branch**: `012-vendor-data-isolation` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-vendor-data-isolation/spec.md`
(Clarifications Session 2026-11-22, five answers: four from `/speckit-clarify`, one from this
plan session); background in Track B of
`docs/superpowers/plans/2026-11-21-post-launch-hardening.md`; reasoning in `research.md`
(R1–R12).

## Summary

Five stories reduce to one migration, three small action edits and one new security suite.

1. **Migration `016_vendor_data_isolation.sql`** (`contracts/migration-016.md`), six sections:
   - §1 a new `application_notes` table that only organizers and admins can read or write;
     existing notes carried over; `applications.organizer_notes` emptied and locked by a CHECK
     (R7, R8).
   - §2 storage: the two broad policies dropped; one read policy that lets organizers read
     everything and a vendor read only a file their own application refers to; no delete
     policy at all (R1, R2).
   - §3 the three INSERT policies a vendor could use to write rows directly become
     organizer/admin-only, so the RPC is a vendor's only write path (R4; Owen, 2026-11-22).
   - §4 `users_with_roles` returns rows only to an admin session and to the service and owner
     roles (R5).
   - §5 `template_creator_emails()`, a no-argument function for the template list (R6).
   - §6 `submit_public_application` replaced in place with a deadline gate and a file-claim
     gate (R3, R9; `contracts/submit-public-application-v3.md`).
2. **Application code** (`contracts/server-actions.md`): `applications.ts` and `export.ts` read
   notes through the embedded `application_notes` and map them back to the field their callers
   already use; `updateApplicationNotes` writes the new table; `listTemplates` calls the new
   function. No page, component, string or response type changes.
3. **Proof** (`contracts/security-test-matrix.md`): `vendor-isolation.test.ts`, cases I1–I37
   for two vendors, a vendor account with no record, an organizer, an admin and an anonymous
   caller. The 21 cases that state a new rule land first as `it.fails` and are flipped by the
   migration PR (R10).

The contract SQL was applied and probed per caller on the local stack inside one rolled-back
transaction on 2026-11-22 (`research.md`, "Dry run"). What that cannot show (storage-api and
PostgREST behaviour) is owned by the suite.

Every hosted step, in FR-028's order (`016` on dev, the training probe, the eight-consumer
check, `016` on prod, the promotion), is a `[manual]` task with an evidence row in
`quickstart.md`. No new packages.

### The five facts and the consumers (Track B step B3a)

The five facts are quoted and re-verified in `research.md`. How each consumer keeps working:

| Consumer (Track B) | After 016 |
|---|---|
| Anonymous upload on `/apply`, before any vendor or application row exists | `attachments_anon_insert` is untouched; upload needs INSERT only (cases I15, ST1) |
| Organizers open files through `createSignedUrl` from the browser | the role branch of the new read policy (I12, ST3) |
| A vendor opens their own files from their application page | the reference branch of the same policy (I7) |
| Team page (`getUsers`, admin, session client) | the view returns every row to an admin session (I31) |
| `listTemplates` reads the view as an organizer | now calls `template_creator_emails()`; same `createdByEmail` (I34) |
| `invite-organizer-core.ts` reads the view with the service role | the view returns every row to `service_role` (I31, the `invite-flow` suite) |
| Review page and CSV export read notes; organizers write them | through `application_notes`, mapped to the same field (I25, I26, D1) |
| `reset-hosted-project.md` removes bucket objects | dashboard, CLI and service-role key bypass RLS; unchanged |
| `storage.test.ts` ST4 asserts an organizer can delete | becomes a refusal (FR-023) |

## Technical Context

**Language/Version**: TypeScript 5.9, `strict: true` (unchanged); PL/pgSQL and SQL for migration `016`
**Primary Dependencies**: Next.js 16.0.7 App Router (server actions only; no page or component change), `@supabase/ssr` ^0.8 (cookie-backed server client), `@supabase/supabase-js` ^2.86 (`.rpc()`, embedded one-to-one select, Storage API in the suite), `zod` ^4.1 (one small schema), Vitest ^4 (`it.fails`). **No new packages**
**Storage**: Supabase PostgreSQL — migration `016_vendor_data_isolation.sql`: one new table (`application_notes`) with RLS, one retired column locked by a CHECK, two storage policies dropped and one created, three INSERT policies replaced, one view replaced, one new function, one function replaced. `attachments` bucket contents untouched. `src/types/database.ts` regenerated with `npm run db:types:local`
**Testing**: Vitest `security` project against the real local stack (new `vendor-isolation.test.ts`, I1–I37; five named edits to existing cases; one harness helper) + `unit` project (one new action test, five updated) + the training-site probe with two throwaway vendors (quickstart D2–D7)
**Target Platform**: Vercel (training = `dev` on the dev project, Production = `main` on the prod project); local CLI stack (Postgres 17.6, PostgREST v14.5, storage-api v1.77.5) for tests
**Project Type**: single Next.js web application
**Performance Goals**: no added round-trip on any page. The file read policy runs two `EXISTS` lookups per object checked (dozens of rows today; an expression index is the follow-up if answers reach the thousands). `listTemplates` swaps one view read for one function call. Notes arrive embedded in the select that already ran
**Constraints**: exactly one migration, `016`, append-only (FR-024); RLS stays the authority and nothing is loosened (FR-025); the service-role client stays in `src/lib/supabase/admin.ts` (FR-026); no interface change (FR-027); `016` reaches a hosted project before the code that reads it (R11); red before green with CI green on both sides (R10); no co-authoring trailers; each task starts only on Owen's go
**Scale/Scope**: 1 migration (~330 lines), 3 action files and 1 validation file edited, 1 generated file, 1 new + 5 updated unit test files, 1 new security suite (37 cases) + 4 edited suites + the harness, 13 evidence rows, ~10 docs at close

## Constitution Check

*GATE: evaluated before Phase 0 and re-checked after Phase 1 design. PASS, with the deviations
recorded in Complexity Tracking.*

| Principle | Check | Status |
|---|---|---|
| I — Zod `safeParse` before any DB call | `updateApplicationNotes` is the one action whose body changes; it gains `applicationNotesSchema` (it had no validation). The readers take the same inputs as today | PASS |
| I — `requireRole()` at the top of mutations and privileged reads | every touched action keeps its `requireRole('organizer')`; `submitDynamicApplication` is untouched and stays the spec 006 public class | PASS |
| I — `{ success, error, data }` responses | no response type changes | PASS |
| I — RLS on user-data tables, in the migration that creates them | `application_notes` ships with RLS enabled and four policies in `016`; every other change tightens or leaves a policy as it was | PASS |
| I — append-only migrations | one new file, `016`; no earlier file edited | PASS |
| I — generated types not hand-edited | `database.ts` regenerated by `db:types:local` in the migration PR | PASS |
| I — no dead code | the `UsersWithRolesRow` alias leaves `templates.ts` with its last use; the untyped-client test helper is deleted by the migration PR. The retired column is recorded below | PASS (see Complexity Tracking) |
| II — tests with every changed action | `updateApplicationNotes` (happy, authorization, validation, failure), the three readers, the export and `listTemplates`; I1–I37 against a real database, replacing "manual verification note" for the RLS changes | PASS |
| III — UX consistency | no UI change; refusals reuse existing messages (`P0001` mapped; `P0005` generic) and BL-23's inline alert | PASS |
| IV — RSC first; `revalidatePath`; matcher | no component or route change; `updateApplicationNotes` gains `revalidatePath` for the applications list and the application's review page (it had none; found by `/speckit-analyze`); middleware untouched | PASS |
| Stack lock-in | no dependency added | PASS |
| Workflow | one task = one branch off `dev` = one PR, commits tagged `[012-Txxx]`, gate `lint && test && build` plus `test:security` with the stack up | PASS |

## Project Structure

### Documentation (this feature)

```text
specs/012-vendor-data-isolation/
├── spec.md                                  # US1–US5, FR-001–FR-030, SC-001–SC-009
├── checklists/requirements.md               # passed 2026-11-22
├── plan.md                                  # this file
├── research.md                              # the five facts re-verified, R1–R12, the dry run
├── data-model.md                            # application_notes, who-may-do-what before/after
├── quickstart.md                            # local loop, hosted apply, probe, evidence rows, docs list
├── contracts/
│   ├── migration-016.md                     # the SQL by section, SQLSTATEs, read-back checks, rollback
│   ├── submit-public-application-v3.md      # the two gates, order of checks, full body
│   ├── server-actions.md                    # the three action edits and their unit tests
│   └── security-test-matrix.md              # I1–I37 by caller, red/holds, the five edited cases
└── tasks.md                                 # /speckit-tasks output (not created here)
```

### Source code (repository root)

```text
supabase/migrations/016_vendor_data_isolation.sql      # NEW (contracts/migration-016.md)
supabase/migrations/README.md                           # + 016 row; "next prefix" line
CLAUDE.md                                               # migration list: the 016 line (the rest at close)
src/types/database.ts                                   # regenerated

src/lib/validations/application.ts          # + applicationNotesSchema
src/lib/actions/applications.ts             # three selects embed application_notes; updateApplicationNotes writes it
src/lib/actions/export.ts                   # same embed; eleven columns unchanged
src/lib/actions/templates.ts                # listTemplates → rpc('template_creator_emails')

src/test/application-notes-action.test.ts   # NEW
src/test/applications-readers.test.ts       # updated
src/test/organizer-read-auth.test.ts        # fixture shape
src/test/applications-email-warning.test.ts # updated (note reaches the email)
src/test/export.test.ts                     # updated
src/test/templates-actions.test.ts          # updated

src/test/security/vendor-isolation.test.ts  # NEW (I1–I37)
src/test/security/harness.ts                # + createAuthedAdmin (suite PR); note seeded into application_notes (migration PR)
src/test/security/storage.test.ts           # ST4
src/test/security/anon-reads.test.ts        # R1 ground truth
src/test/security/anon-writes.test.ts       # W2 ground truth
src/test/security/dashboard-reads.test.ts   # D1 mirrored select
```

**Structure Decision**: the existing layout, with no new directory. The migration owns every
rule; the actions change only where the notes moved or the organizer's view read closed. No
file under `src/app/` or `src/components/` is touched.

## Phases (mirror `tasks.md`)

| Phase | Story | Content | Ends when |
|---|---|---|---|
| 1 | setup | this plan's artifacts merged to `dev` as a docs-only PR (Track B step B6), after `/speckit-tasks` and `/speckit-analyze` | PR merged; Owen's go for phase 2 |
| 2 | US5 (red) | `vendor-isolation.test.ts` with I1–I37, the 21 new-rule cases as `it.fails`; `createAuthedAdmin` in the harness; event F and the upload fixtures; the red run recorded | `npm run test:security` green on 015 in CI; quickstart L1 filled |
| 3 | US1–US4, US5 (green) | one PR: migration `016`; `npm run db:types:local`; every `it.fails` flipped to `it`; the untyped helper removed; ST4, R1, W2, D1 and the harness seed edited; the three action files, the schema and the unit tests. **`016` goes onto dev (D1) after this PR is approved and before it merges** | all suites green on 016 in CI; quickstart L2 and D1 filled; PR merged |
| 4 | US1–US4 on the training deployment | `[manual]` the probe with two throwaway vendors (D2–D6), the eight consumers (D7), cleanup (D8) | rows D2–D8 filled |
| 5 | rollout | `[manual]` `016` on prod with Owen present (P1); promotion `dev` → `main` and the smoke runbook (P2) | rows P1–P2 filled |
| 6 | docs | the FR-029 list in `quickstart.md` | docs PR merged; Track B ticked |

Phase 3 is one PR on purpose. The migration, the regenerated types, the suite flip and the
action edits cannot be split without leaving `dev` (and so the training deployment) with notes
it cannot show or save. Phases are sequential; nothing here runs in parallel.

Each repository task is one branch off `dev` and one PR, and starts only on Owen's go.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| `applications.organizer_notes` is kept, emptied and locked by a CHECK instead of dropped | on each hosted project the migration lands minutes before the code; with the column present the old code keeps rendering (blank notes) instead of erroring on every organizer page, and a save fails closed. Same treatment 015 gave `phone` and `website` | `DROP COLUMN`: the cleanest end state, but a hard outage of the review page, list, export and status change in every rollout window. A later migration can drop all three retired columns together |
| A `SECURITY DEFINER` function reads `auth.users` (`template_creator_emails`) | organizers need a creator's address and may no longer read the account list (FR-008, FR-010); `auth.users` is the only source. It takes no input, gates on the caller's role inside, and returns two columns | a second view over `auth.users`: the same definer-style access with a weaker gate and an untyped client call |
| A view decides who is asking (`users_with_roles` filters on `get_user_role()` and `current_user`) rather than a table policy | the view must read `auth.users`, which `authenticated` cannot, so `security_invoker` plus RLS returns nothing to anyone. The filter keeps both existing consumers (admin session, service role) unchanged | an admin-only RPC: equivalent protection, but it rewrites `getUsers` and its tests for no gain |
| The spec grew by one requirement during planning (FR-030: vendors cannot insert applications, answers or attachment records directly) | without it a vendor claims another vendor's file with one `INSERT`, and bypasses the deadline; reported to Owen as the spec's Assumptions require, and he chose to close it in `016` | leaving it as a known gap: FR-001, FR-002 and FR-019 would hold only for callers who use the app |
| Four existing security cases are edited beyond the one the spec named (the harness seed, R1, W2, D1) | they read the note from the column `016` empties; the assertion each makes is unchanged. Listed in `contracts/security-test-matrix.md` and reflected in FR-023 | keeping them untouched is impossible once the notes move, which Owen approved in Clarifications |
