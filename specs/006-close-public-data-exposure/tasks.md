# Tasks: Close the Public Data Exposure

**Input**: Design documents from `/specs/006-close-public-data-exposure/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R18), data-model.md, contracts/submit-public-application.md, contracts/security-test-matrix.md, quickstart.md

**Tests**: Included — the spec explicitly mandates them (FR-012 security suite; R18 unit-test rework; US3 client/server tests).

**Organization**: US1 and US2 are both P1 and ship together (the policy drops and the RPC are one atomic posture change — R7); the migration that serves both is therefore Foundational. Each story phase remains independently *testable*.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 from spec.md

## Phase 1: Setup

**Purpose**: Config, scripts, and test-project scaffolding everything else assumes.

- [X] T001 [P] Set `[analytics] enabled = false` in supabase/config.toml and create empty supabase/seed.sql (config declares a dangling `sql_paths = ["./seed.sql"]`) — research.md R15
- [X] T002 [P] Add scripts to package.json: `"test:security": "vitest run --project security"` and `"db:types:local": "supabase gen types typescript --local > src/types/database.ts"` — R12/R16
- [X] T003 [P] Split vitest.config.ts into `projects`: `unit` (jsdom, existing include, exclude `src/test/security/**`) and `security` (node env, `src/test/security/**/*.test.ts`, `fileParallelism: false`, `testTimeout: 20_000`, `hookTimeout: 60_000`), preserving shared alias/coverage — R12
- [X] T004 Boot the local stack (`npx supabase start`) and run the implementation-time empirical checks: (a) probe `rpc/create_event_with_default_questionnaire` and `rpc/ensure_event_questionnaire` as anon to confirm the R6 exposure before asserting it; (b) confirm `supabase status` still prints the legacy demo anon/service_role JWTs and copy them for the harness (R13); (c) confirm exact `supabase start -x` service names on CLI 2.65.6 for the CI job (R15)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Migration 011 (RPC + revokes + policy drops + storage), regenerated types, and the security-test harness. Nothing story-specific can be verified before these exist.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Author §1 of supabase/migrations/011_close_public_data_exposure.sql: `public.submit_public_application(p_submission jsonb)` per contracts/submit-public-application.md — `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, `RETURNS TABLE (application_id uuid, vendor_id uuid, vendor_created boolean, event_name text, event_date date)` (table-qualify every column reference — output names shadow plpgsql variables); body in order: event gate (`P0002` missing / `P0001` not active), answer-ownership gate (`P0004`), vendor upsert `ON CONFLICT (email) DO UPDATE` (never touches email/user_id; `xmax = 0` → vendor_created; NULLIF empty strings), application insert `status='pending'` with `ON CONFLICT (event_id, vendor_id) DO NOTHING` → NULL id → `P0003`, answers bulk insert, attachments insert; then `REVOKE ALL ON FUNCTION ... FROM PUBLIC; GRANT EXECUTE ... TO anon, authenticated;`
- [X] T006 Append §2–§3 to supabase/migrations/011_close_public_data_exposure.sql: `REVOKE EXECUTE ... FROM PUBLIC, anon` on `create_event_with_default_questionnaire(jsonb)` and `ensure_event_questionnaire(uuid)` (R6); drop the seven anon policies — `anon_insert_vendors`, `anon_select_vendors`, `anon_insert_applications`, `anon_select_applications`, `anon_insert_attachments`, `anon_select_attachments`, `anon_insert_application_answers` — keeping `anon_select_active_events`, `anon_select_event_questionnaires`, `anon_select_event_questions` (R7)
- [X] T007 Append §4 to supabase/migrations/011_close_public_data_exposure.sql: idempotent `storage.buckets` insert for `attachments` (`public = false`); DO block dropping every existing policy on `storage.objects` via pg_policies; create `attachments_anon_insert` (INSERT, anon+authenticated, `bucket_id = 'attachments'`), `attachments_authenticated_select` (SELECT, authenticated), `attachments_authenticated_delete` (DELETE, authenticated). Plain SQL — `postgres` may manage storage policies via `supautils.policy_grants` despite not owning the table (R19). Do **not** emit `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY` — already on, outside the carve-out, and the usual cause of `must be owner of table objects` — R8/R19
- [X] T008 Run `npx supabase db reset`; verify 011 applies cleanly end-to-end (watch the storage section — R8's risk, resolved by R19); verify via psql: exactly one `storage.buckets` row for `attachments`, exactly three policies on `storage.objects`, the seven anon policies gone and the three kept ones present, and `has_function_privilege('anon', …)` false for both privileged RPCs; run the quickstart.md manual probe block against the local stack as a smoke check
- [X] T009 Regenerate src/types/database.ts via `npm run db:types:local`; verify the diff is exactly `Database['public']['Functions']` gaining `submit_public_application` (R16)
- [X] T010 Create src/test/security/harness.ts: reads `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` with the CLI demo-JWT fallbacks from T004; 2s `fetch(${URL}/auth/v1/health)` probe → exported `stackUp`; throw if `CI_REQUIRE_SECURITY_TESTS=1` and stack down; anon/service/authed (`auth.admin.createUser` + `user_profiles.role='organizer'` + `signInWithPassword`) supabase-js clients; fixture seeding (active event A with questionnaire + one question per answer kind incl. required text/multi-select/file, draft event D, active event B, per-run unique suffix) and afterAll cleanup (events cascade, vendors by suffix, storage objects, auth users) — R13/R14

**Checkpoint**: Local stack has the new posture applied; harness compiles; user stories can start.

---

## Phase 3: User Story 1 — Vendor data is private again (Priority: P1) 🎯 MVP (with US2)

**Goal**: Anon key can no longer read/write the four private tables, download/delete storage, or invoke privileged RPCs; the intentionally public reads still work; no file-deletion capability exists.

**Independent Test**: Direct data-API requests with only the anon key (security suites below + quickstart.md probe block) — zero rows from private tables, writes fail, public reads return rows, anon download denied.

- [X] T011 [P] [US1] Remove the `deleteFile` server action from src/lib/actions/upload.ts and delete the src/app/test-upload/ directory; grep the codebase for any remaining references to either (FR-010, US1-AC4)
- [X] T012 [P] [US1] Write src/test/security/anon-reads.test.ts (`describe.runIf(stackUp)`): R1 — anon selects on vendors/applications/attachments/application_answers return zero rows while seeded rows exist; R2 — anon sees active event A + its questionnaires/questions; R3 — draft event D not visible (FR-001, FR-003, US1-AC1/AC3)
- [X] T013 [P] [US1] Write src/test/security/anon-writes.test.ts: W1 — anon inserts into the 4 private tables error and create nothing (service-client verified); W2 — anon update/delete affect 0 rows; W3 — anon `rpc('create_event_with_default_questionnaire')` and `rpc('ensure_event_questionnaire')` are permission-denied (FR-002, R6, US1-AC2)
- [X] T014 [P] [US1] Write src/test/security/storage.test.ts: ST1 — anon upload to `attachments` succeeds; ST2 — anon `.download()` and `.createSignedUrl()` denied; ST3 — authed `.createSignedUrl()` + URL fetch and `.download()` succeed; ST4 — anon `.remove()` denied (file persists per service check), authed `.remove()` succeeds (FR-010/011, US1-AC5, US4-AC2, R9)
- [X] T015 [P] [US1] Write src/test/security/dashboard-reads.test.ts: D1 — authed organizer's applications-with-vendor join, application_answers, and attachments selects mirroring the dashboard queries return seeded data (SC-005 edge case)

**Checkpoint**: `npm run test:security` — the four US1 suites pass (submission suite lands in US2).

---

## Phase 4: User Story 2 — Applying still works, all-or-nothing (Priority: P1) 🎯 MVP (with US1)

**Goal**: Both form variants submit through the single transactional RPC; contact updates persist; duplicates rejected; failures leave no partial records.

**Independent Test**: End-to-end submissions on both variants (new vendor, returning vendor with changed contact, with/without files), duplicate rejection, forced mid-submission failures leaving zero orphans (matrix S1–S10).

- [X] T016 [P] [US2] Create src/lib/submission/errors.ts with `mapSubmissionError(error)` mapping `error.code` only — `P0002` → "Event not found", `P0001` → "This event is not currently accepting applications", `P0003` → existing duplicate message verbatim, `P0004` → "Your submission contained invalid answers. Please reload the page and try again.", default → "Failed to create application"; raw message/details to console.error only; plus pure unit table test src/test/submission-errors.test.ts (R2, R18)
- [X] T017 [US2] Refactor `submitApplication` in src/lib/actions/applications.ts: keep Zod `safeParse` first; replace the multi-step anon writes + post-insert event fetch with one `.rpc('submit_public_application', { p_submission }).single()` (`legacy` + `attachments` populated, `answers: null`); use returned `event_name`/`event_date` for the confirmation email; map errors via `mapSubmissionError`; preserve the `{success, error, data: {applicationId, vendorId}, warning}` response shape (FR-004/005/006/007)
- [X] T018 [US2] Refactor `submitDynamicApplication` in src/lib/actions/answers.ts: keep Zod + show-if re-evaluation; add rejection of answers whose questionId isn't in the event's question set (R11); build payload from visible ∩ known answers; single RPC call (`answers` populated, `legacy`/`attachments` null); delete the orphan-cleanup `applications.delete` code; map errors via `mapSubmissionError`; email stays fire-and-forget; preserve response shape
- [X] T019 [US2] Rework src/test/answers-actions.test.ts per R18: per-table response queues + `rpc` mock; convert event-status and duplicate tests to ERRCODE-mapping tests; delete the orphan-cleanup test; add the unknown-question rejection case
- [X] T020 [US2] Rework src/test/applications-email-warning.test.ts per R18: mock `rpc().single()` returning the new row shape; drop the event-fetch-failure warning case (path removed)
- [X] T021 [US2] Write src/test/security/submission-rpc.test.ts covering matrix S1–S10: legacy+attachments new vendor; dynamic+answers; returning vendor changed phone on event B (`vendor_created = false`, phone updated, 1 vendor row); returning vendor unchanged; duplicate → `P0003` with counts unchanged; draft event → `P0001`, bogus event → `P0002`; bogus question id → `P0004` zero orphans; duplicate question id → error zero orphans; attachment missing file_name → error zero orphans; minimal payload succeeds (FR-004–FR-008, SC-002/003)

**Checkpoint**: Full security suite green; manual click-through of both forms on the local stack behaves as before.

---

## Phase 5: User Story 3 — Required questions require answers (Priority: P2)

**Goal**: Present-but-empty answers to required questions are rejected client- and server-side; optional questions may stay empty; empty optional answers aren't stored.

**Independent Test**: Dynamic submissions with present-but-empty answers per kind are rejected with per-question messages; genuinely answered and empty-optional submissions pass.

- [X] T022 [US3] Add `isAnswerEmpty(answer: AnswerValue): boolean` to src/lib/questionnaire/answer-coercion.ts — text → trimmed length 0; choice/date → `''`; choices → `[]`; file → `path === ''`; number/boolean → never empty; leaf Zod schemas unchanged (R10); plus a pure per-kind table test in src/test/answer-coercion.test.ts (create or extend)
- [X] T023 [US3] Server side in src/lib/actions/answers.ts: required check becomes `!answerMap.has(id) || isAnswerEmpty(...)` with per-question error messages; skip empty *optional* answers when building the RPC payload (no empty-value rows stored) — FR-009, R10 (depends on T018)
- [X] T024 [US3] Client side in src/app/(public)/apply/_components/dynamic-application-form.tsx: replace the object-truthiness required check with `isAnswerEmpty`; file questions key off `pendingFiles` presence; reuse the existing per-question error rendering (FR-009)
- [X] T025 [US3] Tests: add FR-009 per-kind required-empty server cases to src/test/answers-actions.test.ts; extend src/test/dynamic-application-form.test.tsx with client cases (empty text, unchecked multi-select, missing file → no submit call; optional-empty → submits)

**Checkpoint**: `npm test` — unit + form tests green; US3 acceptance scenarios pass.

---

## Phase 6: User Story 4 — Security rules version-controlled and continuously proven (Priority: P2)

**Goal**: The suite runs in CI on every PR against a disposable stack and cannot silently skip; local runs skip gracefully when the stack is down. (Storage rules already live in migration 011 — proven by T014.)

**Independent Test**: Fresh `db reset` + suite pass locally; `supabase stop` + `npm test` skips with exit 0; PR shows the security job passing under 5 minutes.

- [X] T026 [US4] Add a parallel `security-tests` job to .github/workflows/ci.yml: checkout → node 20 + npm cache → `npm ci` → `supabase/setup-cli@v1` pinned `2.65.6` → `supabase start -x <heavy services from T004>` → `npm run test:security` with `CI_REQUIRE_SECURITY_TESTS=1`; existing lint-test-build job untouched (R15, SC-004)
- [X] T027 [US4] Verify local skip behavior (US4-AC4): `npx supabase stop` → `npm test` → unit project runs, security project reports skipped, exit code 0; then restart the stack and verify `CI_REQUIRE_SECURITY_TESTS=1 npm run test:security` passes
- [X] T028 [US4] Push the branch / open the PR and verify the `security-tests` job passes in under 5 minutes of CI time (SC-004, US4-AC3) — PR #7: `security-tests` green in **3m32s** (40 tests, 5 suites, no skips); re-confirmed on the `dev` push in 2m19s

**Checkpoint**: All four stories independently verified; CI gate proven.

---

## Phase 7: Polish & Cross-Cutting

- [X] T029 [P] Update docs: CLAUDE.md (migrations list gains 011; Recent Changes entry for 006), specs/README.md spec-status table
- [X] T030 [P] Re-run the full quickstart.md manual probe block against the local stack as a final posture check (private tables `[]`, public reads populated, anon RPCs denied, anon download denied)
- [X] T031 Run the full gates `npm run lint && npm test && npm run build`; confirm zero hand-edits to src/types/database.ts (FR-013)

> Rollout (dev `db push` → probe → prod) is deploy-time work tracked by quickstart.md's checklist, not a code task.

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)**: T005–T007 are sequential (same migration file); T008 needs T005–T007 (+T001); T009 needs T008; T010 needs T002–T004.
- **Foundational blocks all stories.**
- **US1 (Phase 3)**: independent of US2/US3/US4 code; T011–T015 all [P].
- **US2 (Phase 4)**: T016 [P] anytime after Foundational; T017/T018 need T016; T019 needs T018; T020 needs T017; T021 needs only Foundational (tests the RPC directly) but is listed here as it proves US2.
- **US3 (Phase 5)**: T023 depends on T018 (same file); T024 [P] with T023; T025 after T022–T024. Do US3 after US2 to avoid editing answers.ts concurrently.
- **US4 (Phase 6)**: T026 needs T003+T010 (suite exists); T027 needs the full suite (T012–T015, T021); T028 last.
- **Polish**: after all stories.

## Parallel Opportunities

- Phase 1: T001, T002, T003 together.
- Phase 3: T011, T012, T013, T014, T015 — five different files, all parallel.
- T016 (errors.ts) can be built in parallel with any US1 task.
- Phase 7: T029, T030 parallel.

## Implementation Strategy

**MVP = US1 + US2 together** — the spec ships them as one atomic posture change (policies dropped only once the RPC exists; the migration enforces this ordering internally). Sequence: Setup → Foundational → US1 + US2 (validate: full security suite + manual form click-through) → US3 → US4 → Polish. Each later story is an independently verifiable increment.
