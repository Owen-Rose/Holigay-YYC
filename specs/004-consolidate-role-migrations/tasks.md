---

description: "Task list for consolidating role-system migrations and auditing RLS"
---

# Tasks: Consolidate Role-System Migrations and Audit RLS

**Input**: Design documents from `/specs/004-consolidate-role-migrations/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅ (R2 templates filled during Phase A), data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: No new automated tests. Per spec Assumption, DB-integration RLS test coverage is a separate future spec. Verification is SQL postcondition queries (SC-002, SC-003, SC-004, SC-005, SC-007) + manual smoke test (SC-006) + the FR-012 PR verification note.

**Organization**: Sequential flow dictated by the spec's two-phase structure. US1 (Phase A audit) gates US2 (authoring and applying 007); US2 gates US3 (app regression smoke) and US4 (clean bootstrap verification). US5 (README) is cosmetic and independent. **MVP = US1 + US2 + US3.**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different environments/files, no mutual dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)

## Path Conventions

Supabase migrations at `supabase/migrations/`. Generated types at `src/types/database.ts`. Spec artifacts at `specs/004-consolidate-role-migrations/`. Project instructions at `CLAUDE.md` (repo root). Roadmap at `docs/cleanup-roadmap.md`.

---

## Phase 1: Setup (Environment Prerequisites)

**Purpose**: Confirm the tooling and environment access needed to execute Phase A and Phase B are in place.

- [ ] T001 Confirm the Supabase CLI is installed and linked to **both** the dev and prod Supabase projects (`supabase projects list` shows both; `supabase link --project-ref <ref>` has been run for each). Record the two project refs in a scratchpad for reuse in later tasks.
- [ ] T002 Confirm `npm run db:types:dev` and `npm run db:types` both execute successfully against the current (pre-007) schema. This is a sanity check that baseline type generation works, so that any diff appearing in T021 is attributable to 007 alone.
- [ ] T003 Confirm the working branch is `004-consolidate-role-migrations` (`git rev-parse --abbrev-ref HEAD`). Confirm `supabase/migrations/` currently contains files 001–006 with **no local modifications** (`git status supabase/migrations/` shows clean). Constitution Principle I forbids editing any existing migration file.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Load the exact pre/post-state contracts into working memory before any DDL is authored. No code is written in this phase — it is the "read before writing" gate.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 Re-read `specs/004-consolidate-role-migrations/research.md` §R1 (source of the mess — four pairs of duplicate-numbered migrations, why 006's policies are always-FALSE) and §R3 (design decisions — IF EXISTS guards, README preservation, single migration, conditional DROP TABLE). These establish *why* 007 does what it does.
- [ ] T005 Re-read `specs/004-consolidate-role-migrations/contracts/rls-policies.md` end-to-end — this is the authoritative enumeration of which policies survive 007 (24 total from 005) and which are dropped (8 from 006 + 6 on `user_roles` that cascade away). Phase A's Query 3 output is diffed against this document in T016.
- [ ] T006 Re-read `specs/004-consolidate-role-migrations/contracts/migration-007.md` Preconditions (section 1–5), Actions (Steps 1–4), and Postconditions tables. Note the four postcondition queries — they are the executable definition of "007 applied successfully."
- [ ] T007 Re-read `.specify/memory/constitution.md` §I (append-only migrations) and §II (RLS-change verification note). FR-012 elevates the §II verification note from SHOULD to MUST for this feature.

**Checkpoint**: Pre/post-state and constitution gates loaded. Phase A can begin.

---

## Phase 3: User Story 1 — Verified baseline of actual role-system schema exists (Priority: P1) 🎯 MVP Phase A

**Goal**: `specs/004-consolidate-role-migrations/research.md` §R2 sections are populated with the prod and dev outputs of the four Phase A baseline queries, each labelled with environment name and capture timestamp. The document alone is the deliverable for US1; no migration runs yet.

**Independent Test**: Open `research.md`. Confirm each of Query 1, Query 2, Query 3, Query 4 has both a **Prod result** block and a **Dev result** block, each with a capture timestamp. The document exists before `007_role_system_cleanup.sql` is created.

### Implementation for User Story 1

- [ ] T008 [US1] In the Supabase **prod** SQL editor, run Query 1 from `research.md` §R2 verbatim (`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`). Paste the full result (one column, multiple rows) into the R2 Query 1 "**Prod result**" code block along with a capture timestamp line (e.g., `-- captured 2026-04-23T14:05Z`).
- [ ] T009 [US1] In the Supabase **prod** SQL editor, run Query 2 verbatim (`SELECT proname, pg_get_function_identity_arguments(oid), prorettype::regtype FROM pg_proc WHERE proname IN ('get_user_role','user_has_role') ORDER BY proname, pg_get_function_identity_arguments(oid);`). Paste full result + timestamp into the R2 Query 2 "**Prod result**" block. The expected three-row shape is in R2 (get_user_role empty-args → user_role; get_user_role(uuid) → text; user_has_role(uuid,text) → boolean).
- [ ] T010 [US1] In the Supabase **prod** SQL editor, run Query 3 verbatim (`SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;`). Paste the full result (32 rows expected on public tables excluding `user_roles`, plus 6 on `user_roles` — see `contracts/rls-policies.md` summary) + timestamp into the R2 Query 3 "**Prod result**" block.
- [ ] T011 [US1] In the Supabase **prod** SQL editor, run Query 4 verbatim (`SELECT COUNT(*) FROM user_roles;`). Paste result + timestamp into the R2 Query 4 "**Prod result**" block. Expected: 0. **If non-zero**, flag in the commit message and proceed — T017 records the decision.
- [ ] T012 [P] [US1] In the Supabase **dev** SQL editor, run Query 1 verbatim. Paste result + timestamp into the R2 Query 1 "**Dev result**" block. Parallelizable with T008–T011 because prod and dev are independent environments.
- [ ] T013 [P] [US1] In the Supabase **dev** SQL editor, run Query 2 verbatim. Paste result + timestamp into the R2 Query 2 "**Dev result**" block.
- [ ] T014 [P] [US1] In the Supabase **dev** SQL editor, run Query 3 verbatim. Paste result + timestamp into the R2 Query 3 "**Dev result**" block.
- [ ] T015 [P] [US1] In the Supabase **dev** SQL editor, run Query 4 verbatim. Paste result + timestamp into the R2 Query 4 "**Dev result**" block.
- [ ] T016 [US1] Diff the captured prod and dev Query 3 outputs against `specs/004-consolidate-role-migrations/contracts/rls-policies.md`. For each of the 5 public tables (`events`, `vendors`, `applications`, `attachments`, `user_profiles`) confirm every SURVIVING policy is present and every DROPPED BY 007 policy is present. If any policy appears in prod/dev but is not in the contract (or vice-versa), add a new "**R2-A Divergences**" subsection to `research.md` naming the divergence per environment and its plan of record (recreate? leave alone? defer?) before any DROP is authored. Per the spec Edge Cases, unknown policies may be load-bearing and MUST NOT be dropped via `IF EXISTS` without enumeration.
- [ ] T017 [US1] Based on T011 and T015 results, record the `DROP TABLE` decision per FR-005. Add a new "**R2-B DROP TABLE decision**" subsection to `research.md` stating either (a) "Both prod and dev Query 4 returned 0 rows — `DROP TABLE IF EXISTS public.user_roles CASCADE` **WILL** be included in 007" or (b) "Query 4 returned <N> rows in [env] — `DROP TABLE` **DEFERRED**. A follow-up spec will handle row reconciliation; 007 still ships the function and policy drops per FR-005."

**Checkpoint**: Phase A complete. `research.md` §R2 is fully populated. Every DROP statement 007 will contain is now backed by attested observed state. US2 can begin.

---

## Phase 4: User Story 2 — Every database-layer role check routes through canonical `get_user_role()` (Priority: P1)

**Goal**: `supabase/migrations/007_role_system_cleanup.sql` ships to local, dev, and prod. After it applies: zero policies on public tables (excluding `user_roles`) reference `user_has_role`; exactly one role-helper function survives (no-arg `get_user_role()` returning `user_role`); `user_roles` is dropped if T017 approved it.

**Independent Test**: Against any environment where 007 has applied, the three postcondition queries from `quickstart.md` Step 8 return: (a) 0 policies referencing `user_has_role` (excluding the cascaded `user_roles` policies), (b) exactly 1 row — `get_user_role` with empty arguments — in `pg_proc`, (c) 24 policies total on public tables excluding `user_roles`.

### Implementation for User Story 2

- [ ] T018 [US2] Create `supabase/migrations/007_role_system_cleanup.sql`. Structure per `contracts/migration-007.md` Actions:
  - **Step 1**: Eight `DROP POLICY IF EXISTS "<name>" ON <table>;` statements, exact policy names and tables per `contracts/rls-policies.md` (three on `events`, two on `applications`, two on `vendors`, one on `attachments`).
  - **Step 2**: `DROP FUNCTION IF EXISTS public.get_user_role(UUID);` (targets only the two-arg variant — PostgreSQL resolves by argument signature).
  - **Step 3**: `DROP FUNCTION IF EXISTS public.user_has_role(UUID, TEXT);`.
  - **Step 4**: `DROP TABLE IF EXISTS public.user_roles CASCADE;` **only if T017 recorded decision (a)**. If T017 recorded decision (b), omit this clause entirely and add a one-line SQL comment explaining why (e.g., `-- user_roles DROP deferred: T017 recorded N rows present in <env>`).
  - Add a file header comment identifying the spec (`-- 004-consolidate-role-migrations`) and pointing readers to `contracts/migration-007.md` for the behavioral contract.
  - No `CREATE` statements, no edits to existing migrations, no changes to the canonical `003_user_profiles.sql`'s `get_user_role()` function.
- [ ] T019 [US2] From the repo root run `supabase db reset`. Confirm exit code 0 and zero SQL errors across all files 001–007 (SC-004). Any error means 007 references a name that doesn't match 005/006 output — fix 007 and re-run.
- [ ] T020 [US2] Against the local instance, run the three postcondition queries from `quickstart.md` Step 8: (a) `SELECT COUNT(*) FROM pg_policies WHERE schemaname='public' AND tablename != 'user_roles' AND (qual ILIKE '%user_has_role%' OR with_check ILIKE '%user_has_role%')` — expect 0; (b) `SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname IN ('get_user_role','user_has_role')` — expect one row: `get_user_role` with empty args; (c) `SELECT COUNT(*) FROM pg_policies WHERE schemaname='public' AND tablename != 'user_roles'` — expect 24. Capture all three outputs for the PR scratchpad (FR-012 evidence).
- [ ] T021 [US2] From the repo root run `npm run db:types:dev && npm run db:types`. Inspect `git diff src/types/database.ts`. Expected (SC-007): only removals of types associated with `user_roles` (table row type, insert/update types, any helper types pointing at the two-arg `get_user_role(uuid)` or `user_has_role(uuid,text)` RPC signatures). **No hand-edits** per FR-007. Stage the regenerated file for the PR commit.
- [ ] T022 [US2] Apply 007 to **dev** Supabase by pasting the file contents into the dev SQL editor and running (or via `supabase db push` if linked to dev). Re-run the three postcondition queries from T020 against dev; confirm identical expected results. Capture outputs for the PR scratchpad.
- [ ] T023 [US2] Apply 007 to **prod** Supabase by pasting the file contents into the prod SQL editor. Re-run the three postcondition queries from T020 against prod; confirm identical expected results. Capture the full post-007 `pg_policies` dump for prod (the verbose Query 3 form, not just the COUNT) for the PR scratchpad — this is the SC-005 baseline used in T029.

**Checkpoint**: Migration 007 is live in local, dev, and prod. DB-layer role checks are uniformly via `get_user_role()` in every environment. US3 verification and US4 bootstrap verification can now proceed.

---

## Phase 5: User Story 3 — Role-gated app behavior keeps working (Priority: P1)

**Goal**: An organizer signed into the prod app can still create, edit, and delete events via `/dashboard/events`; a vendor is still blocked at both the middleware redirect and the server action. The CI gate chain (`lint && test && build`) passes.

**Independent Test**: The steps in `quickstart.md` Step 10 executed against prod all yield the expected outcomes — organizer CRUDs a test event end-to-end; vendor gets redirected or receives the `requireRole` error shape from any event-mutation server action.

### Implementation for User Story 3

- [ ] T024 [US3] From the repo root run `npm run lint && npm test && npm run build`. All three MUST pass (SC-009). A failure here typically means the regenerated `src/types/database.ts` introduced a name change that a caller depends on — diagnose before proceeding; do not bypass with `-- --skip-type-check`.
- [ ] T025 [US3] **Local smoke (organizer path)**: Start `npm run dev`. Sign in as the admin-bootstrap organizer per `CLAUDE.md` "Admin Bootstrap". Navigate to `/dashboard/events/new`; create a test event; confirm it appears on `/dashboard/events`. Click "edit" on the test event; change its title; confirm the update persists. Delete the test event; confirm it disappears. Capture a brief note (or screenshots) of each outcome for the FR-012 verification evidence.
- [ ] T026 [US3] **Local smoke (vendor path)**: Sign out and sign in as a vendor account. Navigate to `/dashboard/events/new`; confirm redirect to `/unauthorized`. Open the browser DevTools Network panel and attempt any event-mutation server action (e.g., via a crafted POST or by temporarily editing a `/dashboard/events/new` form; acceptable to skip if the UI is already blocked). Confirm the response matches the `requireRole`-sourced shape `{ success: false, error: <role error>, data: null }`. Capture evidence for the FR-012 verification note.
- [ ] T027 [US3] **Prod smoke (both paths)**: Against the deployed prod app (after T023), repeat the organizer CRUD sequence from T025 and the vendor-blocked check from T026 using real accounts. Capture evidence. SC-006 requires this to be verified on prod specifically — local verification is necessary but not sufficient.

**Checkpoint**: Role-gated app behavior is confirmed intact end-to-end in production. The refactor has not regressed any user-visible surface.

---

## Phase 6: User Story 4 — Fresh local database bootstraps cleanly (Priority: P2)

**Goal**: `supabase db reset` on a clean local database applies every migration 001..007 without error, and the resulting `pg_policies` matches the post-007 prod baseline on a semantic diff.

**Independent Test**: `supabase db reset` exits 0; diff of local `pg_policies` (Query 3 form) vs prod post-007 `pg_policies` from T023 shows zero semantic differences (or each difference is documented in the PR as intentional per SC-005).

### Implementation for User Story 4

- [ ] T028 [US4] From the repo root run `supabase db reset` on a clean local instance. Confirm exit code 0 and zero SQL errors across all 001..007 files (SC-004). This re-verifies T019 from a clean-slate perspective now that 007 has been finalized. If any error appears that was not present in T019, it means an edit to 007 between T019 and T028 broke idempotency — diagnose and fix.
- [ ] T029 [US4] Against the freshly-reset local instance, run `SELECT policyname, tablename, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname`. Diff the output against the post-007 prod `pg_policies` dump captured in T023. Semantic differences (policy name, table, cmd, qual/with_check text) MUST be zero OR documented in the PR description as intentional (SC-005). Capture the local output for the PR scratchpad.

**Checkpoint**: Clean-bootstrap happy path verified. A new contributor or CI environment can reach the post-007 state in one command.

---

## Phase 7: User Story 5 — README marks superseded migration files (Priority: P3)

**Goal**: A developer opening `supabase/migrations/` finds a `README.md` that names `003_user_roles.sql`, `004_user_roles_rls.sql`, and `005_users_with_roles_view.sql` as superseded by `007_role_system_cleanup.sql`, with a one-line rationale for each.

**Independent Test**: Open `supabase/migrations/README.md`. Confirm the three superseded files each appear with their rationale text and a pointer to their canonical replacement (FR-011 / SC-008).

### Implementation for User Story 5

- [ ] T030 [US5] Create `supabase/migrations/README.md`. Contents per `quickstart.md` Step 6: a one-sentence intro explaining alphabetical apply order and why duplicate-numbered prefixes exist; a table or bullet list naming each of `003_user_roles.sql`, `004_user_roles_rls.sql`, `005_users_with_roles_view.sql` with the rationale text from Step 6 (003: alternate role-system design that ran in prod despite "DO NOT RUN YET" header; 004: RLS for the superseded `user_roles` table; 005: view overwritten by `006_users_with_roles_view.sql`'s `CREATE OR REPLACE VIEW`); each entry points to `007_role_system_cleanup.sql` (or for the 005 view: `006_users_with_roles_view.sql`) as canonical replacement. Parallelizable with all US1–US4 tasks after Phase 1 — the README depends on no migration output.

**Checkpoint**: Filesystem-level readability of `supabase/migrations/` restored. The next reader of the directory can tell at a glance which duplicate-numbered file is load-bearing.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Compose the FR-012 verification note in the PR, and land the two downstream doc propagations once the PR merges.

- [ ] T031 Compose the PR description per `contracts/migration-007.md` "PR verification checklist" (FR-012 / SC-010). Include in the body: (a) Phase A SQL outputs for prod AND dev (Queries 1–4) from T008–T015; (b) the full text of `supabase/migrations/007_role_system_cleanup.sql`; (c) post-007 `pg_policies` dumps for prod AND dev from T022/T023; (d) smoke-test evidence from T025/T026/T027; (e) `git diff src/types/database.ts` summary from T021. Also include the rollback-model note from `contracts/migration-007.md` "Rollback model" so no one tries `git revert` on 007. Use the commit-message trailer `[004-consolidate-role-migrations]` per project convention.
- [ ] T032 [P] **Post-merge** — update `CLAUDE.md` "Database Schema" section per `research.md` §R5 item 1: remove the `user_roles` mention from "Supporting objects"; clarify that `get_user_role()` is the single role-lookup helper (the two-arg variant is gone); note 007 as the last applied migration; add a pointer to `supabase/migrations/README.md`. This is a free-prose edit — `update-agent-context.sh` only handles the "Active Technologies" / "Recent Changes" sections.
- [ ] T033 [P] **Post-merge** — mark Workstream 3 as `✅ Completed` in `docs/cleanup-roadmap.md`, matching the style of Workstream 1 (line 18). Include the PR number and completion date.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001–T003)**: No dependencies — can start immediately.
- **Foundational (T004–T007)**: Depends on Setup. Pure reading; no code. MUST complete before any DROP is authored.
- **US1 (T008–T017 — Phase A audit)**: Depends on Foundational. **BLOCKS US2** — 007 cannot be written without the baseline.
- **US2 (T018–T023 — migration authored and applied)**: Depends on US1. Atomic sequence T018 → T019 → T020 → T021 → T022 → T023. Local apply (T019/T020/T021) gates dev apply (T022) gates prod apply (T023).
- **US3 (T024–T027 — app regression smoke)**: T024 (CI gates) depends on T021 (type regen). T025/T026 (local smoke) depend on T019 (local apply). T027 (prod smoke) depends on T023 (prod apply).
- **US4 (T028–T029 — clean bootstrap verification)**: Depends on T018 (007 file exists) and T023 (prod post-007 baseline captured). Independent of US3.
- **US5 (T030 — README)**: Independent of US1–US4. Can start any time after Setup; most natural to bundle into the same commit as 007.
- **Polish (T031–T033)**: T031 depends on US2 + US3 + US4 (evidence collection). T032/T033 depend on the PR merging.

### User Story Dependencies

- **US1 blocks US2 blocks {US3, US4}** — the spec is explicit: Phase A gates Phase B, and Phase B gates both verification stories.
- **US5 is independent** — filesystem doc only; could ship in a separate PR if 007 were delayed, though bundling is simpler.
- **MVP = US1 + US2 + US3**. Without US1, 007 is unsafe. Without US2, the defect persists. Without US3, regressions are not caught. US4 and US5 are incremental additions to the same PR.

### Parallel Opportunities

- **T012–T015** [P] (dev Supabase queries) against **T008–T011** (prod queries) — different environments, same file (`research.md`), but different subsection targets, so the writes don't collide. In a single-operator session, use two browser tabs (one prod, one dev) and batch each query pair (Q1 prod + Q1 dev, Q2 prod + Q2 dev, …).
- **T030** (US5 README) is independent of every other user story and can be done at any point after Setup.
- **T032–T033** [P] touch different files (`CLAUDE.md`, `docs/cleanup-roadmap.md`) and can run in parallel post-merge.

---

## Parallel Example: Phase A queries (T008–T015)

```bash
# Prod tab and dev tab in the Supabase dashboard — run simultaneously:
Task T008: Query 1 in prod SQL editor → paste into research.md R2 Q1 Prod result block
Task T012: Query 1 in dev SQL editor  → paste into research.md R2 Q1 Dev result block

# Then Q2 pair, Q3 pair, Q4 pair — each pair is parallelizable across environments.
```

---

## Implementation Strategy

### MVP (US1 + US2 + US3)

The minimum shippable increment. Without any of the three, the feature is unsafe or unverified.

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US1 — Phase A baseline).
3. Complete Phase 4 (US2 — author 007; apply to local, dev, prod).
4. Complete Phase 5 (US3 — CI gates, local smoke, prod smoke).
5. **STOP and VALIDATE**: P1 acceptance criteria (SC-001, SC-002, SC-003, SC-006, SC-007, SC-009, SC-010) are achievable at this point.
6. Proceed to Phase 6 (US4 clean bootstrap) and Phase 7 (US5 README) before opening the PR.

### Incremental Delivery (Commit Cadence)

Suggested commit split:

- **Commit 1** — `docs(migrations): capture Phase A baseline for 007 [004-consolidate-role-migrations]` (T008–T017 fills in `research.md` §R2).
- **Commit 2** — `feat(migrations): add 007 role system cleanup [004-consolidate-role-migrations]` (T018 + T030 + regenerated `src/types/database.ts` from T021).
- **Commit 3 (post-merge, optional)** — `docs: mark cleanup-roadmap Workstream 3 complete [004-consolidate-role-migrations]` (T032 + T033).

Alternatively, squash all into one commit per project convention. The PR's merge commit gets the `[004-consolidate-role-migrations]` trailer per `.specify/memory/constitution.md` §Governance.

### Single-Committer Strategy

One developer executes Phase 1 → Phase 8 sequentially, with the Supabase SQL editor and the repo open side-by-side. The Phase A queries (Q1–Q4) are the only parallel opportunity within a single-operator session — two browser tabs, one prod, one dev. The remainder is strictly sequential: author 007 → local apply → dev apply → prod apply → smoke test → PR.

---

## Notes

- **[P] tasks** = different environments or different files, no mutual dependencies. Batchable where a single operator has the bandwidth (e.g., two Supabase tabs).
- **[Story] labels** map each task to its user story for traceability.
- **No new automated tests** — per spec Assumption. SQL postconditions + manual smoke test + the FR-012 PR verification note are the acceptance evidence.
- **No `src/` application code is modified** except the auto-generated `src/types/database.ts` per FR-010. If implementation reveals a live caller of `user_has_role` or `user_roles` under `src/`, stop and open a new spec — this spec's scope is exceeded.
- **Rollback is by forward migration (`008_restore_*.sql`), not `git revert`** — append-only per Constitution Principle I. T031 records this in the PR description.
- **Commit trailer**: `[004-consolidate-role-migrations]` per project convention.
