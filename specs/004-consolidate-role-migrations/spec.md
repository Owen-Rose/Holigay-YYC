# Feature Specification: Consolidate Role-System Migrations and Audit RLS

**Feature Branch**: `004-consolidate-role-migrations`
**Created**: 2026-04-23
**Status**: Draft
**Input**: User description: "Consolidate the tangled role-system migrations in supabase/migrations/. Background and scope are documented in docs/cleanup-roadmap.md under 'Workstream 3 — Migration cleanup + RLS audit' — read that section before drafting the spec. Key constraints: append-only migrations (new 007_role_system_cleanup.sql, not edits); two-phase (Phase A read-only investigation against prod and dev, Phase B consolidation migration informed by Phase A's findings); no app-code changes except regenerating src/types/database.ts; acceptance = fresh supabase db reset applies cleanly, every role check routes through no-arg get_user_role() → user_role, organizer can create/edit/delete events and vendor cannot."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Verified baseline of actual role-system schema exists before any destructive SQL is written (Priority: P1)

A developer preparing the consolidation migration has a single document — `specs/004-consolidate-role-migrations/research.md` — that records, for **both** prod and dev Supabase, the current state of: public-schema tables, role-related functions with full signatures, every RLS policy on public tables, and the row count of `user_roles`. The document is dated, attributable, and precedes any DDL being written.

**Why this priority**: `DROP POLICY`, `DROP FUNCTION`, and `DROP TABLE` statements in 007 depend on what actually exists in each environment. The repo's apparent intent and prod's live state have diverged — the abandoned `003_user_roles.sql` alternate design ran in prod alphabetically despite its "DO NOT RUN YET" header. Writing 007 from the repo alone would either (a) fail to drop objects that exist, or (b) attempt to drop objects that don't. Both are preventable by documenting first. This is the gate for every subsequent requirement.

**Independent Test**: Open `specs/004-consolidate-role-migrations/research.md`. Confirm it contains — separately for prod and dev — the output of the four baseline queries (`pg_tables`, `pg_proc` filtered to role helpers, `pg_policies` for schema `public`, `SELECT COUNT(*) FROM user_roles`) with timestamps and environment labels. The document alone is the deliverable; no migration runs yet.

**Acceptance Scenarios**:

1. **Given** the consolidation work has not yet started, **When** a developer opens `research.md`, **Then** they find a prod baseline and a dev baseline, each listing every public-schema table, every role-related function with its argument signature, every RLS policy with `qual` and `with_check` text, and the `user_roles` row count.
2. **Given** the Phase A research document exists, **When** a developer begins drafting migration 007, **Then** every `DROP` statement they write corresponds to an object attested in the baseline.
3. **Given** prod and dev diverge on some policy, **When** the research document is reviewed, **Then** the divergence is called out explicitly so Phase B accounts for both states.

---

### User Story 2 - Every database-layer role check routes through the canonical `get_user_role()` helper (Priority: P1)

After migration 007 applies, every RLS policy on a public-schema table uses the no-arg `get_user_role() → user_role` function from `003_user_profiles.sql`. The two-arg `get_user_role(UUID) → TEXT` and the `user_has_role(UUID, TEXT) → BOOLEAN` helpers from `003_user_roles.sql` no longer exist. The parallel `user_roles` table no longer exists (conditional on Phase A confirming it is empty).

**Why this priority**: This is the actual fix. Today, `006_rbac_rls_updates.sql` gates writes on `events`, `applications`, `vendors`, and `attachments` via `user_has_role(auth.uid(), 'organizer')`, which reads from the app-never-written `user_roles` table and therefore effectively denies every write at the DB layer. The app works only because application-layer `requireRole()` guards perform the real enforcement and because an earlier policy in `005_rbac_rls_policies.sql` may still allow the write to fall through. This is a latent defect: any future change that assumes "RLS enforces role at the DB" starts from a false premise. Collapsing every role check onto one helper eliminates the ambiguity.

**Independent Test**: Run two SQL audits after migration 007 applies. First: `SELECT COUNT(*) FROM pg_policies WHERE schemaname='public' AND (qual ILIKE '%user_has_role%' OR with_check ILIKE '%user_has_role%')` — expect zero. Second: `SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname IN ('get_user_role', 'user_has_role')` — expect exactly one row: `get_user_role()` with empty arguments.

**Acceptance Scenarios**:

1. **Given** migration 007 has been applied to an environment, **When** `pg_policies` is queried for any reference to `user_has_role`, **Then** zero rows are returned.
2. **Given** migration 007 has been applied, **When** `pg_proc` is queried for role helpers, **Then** only the no-arg `get_user_role()` returning `user_role` exists.
3. **Given** Phase A confirmed `user_roles` is empty in both environments, **When** migration 007 runs, **Then** `user_roles` is dropped and `SELECT * FROM information_schema.tables WHERE table_schema='public' AND table_name='user_roles'` returns zero rows.
4. **Given** Phase A reveals `user_roles` has non-zero rows in either environment, **When** 007 is written, **Then** the `DROP TABLE` step is deferred and the row data is escalated for reconciliation before the table can be dropped.

---

### User Story 3 - Role-gated app behavior keeps working after the migration (Priority: P1)

After migration 007 is deployed, an organizer signed into the live app can still create, edit, and delete events via `/dashboard/events`. A vendor signed in cannot reach `/dashboard/events/new`, and if they bypass the UI and call the event-mutation server actions directly, the calls fail with the normal `requireRole`-sourced error. Applications, vendors, and attachments behave per the existing `005_rbac_rls_policies.sql` semantics.

**Why this priority**: If the cleanup migration breaks a role-gated action, the whole workstream has done harm. This is the regression guard on the user-visible surface. The Constitution (§II) requires RLS changes to include a manual verification note in the PR until a DB-integration harness exists — this story is the source of the checks that note has to record.

**Independent Test**: After 007 ships, sign in as an organizer (use the admin-bootstrap user from `CLAUDE.md`). Create a new event at `/dashboard/events/new`; edit its title; delete it. Sign in as a vendor. Try to navigate to `/dashboard/events/new` and confirm redirect to `/unauthorized`. Observe the network panel: any event-mutation server action returns the expected `requireRole` error.

**Acceptance Scenarios**:

1. **Given** an organizer is signed in, **When** they submit the "new event" form, **Then** the event inserts successfully and appears on `/dashboard/events`.
2. **Given** an organizer is signed in, **When** they click "edit" on an existing event and save changes, **Then** the update succeeds and the new values render.
3. **Given** an organizer is signed in, **When** they delete an event, **Then** the delete succeeds and the event disappears from the list.
4. **Given** a vendor is signed in, **When** they visit `/dashboard/events/new`, **Then** middleware or the server action blocks the action with an unauthorized response.
5. **Given** a vendor is signed in, **When** any server action calling `requireRole('organizer')` is invoked, **Then** it returns `{ success: false, error: <role error>, data: null }` as before.

---

### User Story 4 - A fresh local database bootstraps cleanly from scratch (Priority: P2)

A developer running `supabase db reset` on a clean local database gets a successful apply of every migration 001 through 007, with the final schema's RLS policy list matching (to a human diff) the post-007 prod state. A CI or new-contributor environment bootstraps in one command with no intervention.

**Why this priority**: Local and CI reproducibility is a developer-ergonomics multiplier but not itself user-facing. It becomes critical only when someone actually bootstraps a clean environment. The current state — where 006 depends on a function from `003_user_roles.sql` and silently denies writes — works today because `supabase db reset` is rarely run. This story ensures the happy path remains the happy path.

**Independent Test**: In a clean local checkout with an empty Supabase instance, run `supabase db reset`. Confirm exit code 0 and zero SQL errors. Run `SELECT policyname, tablename, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname` and diff the output against the Phase A prod baseline captured after 007 applies to prod. Differences, if any, are documented in the PR as intentional.

**Acceptance Scenarios**:

1. **Given** a clean Supabase local instance, **When** `supabase db reset` runs, **Then** the command exits 0 and every file in `supabase/migrations/` applies without SQL error.
2. **Given** the reset completed, **When** the resulting `pg_policies` are diffed against the post-007 prod baseline, **Then** either zero semantic differences exist, or each difference is captured in the PR as intentional.

---

### User Story 5 - Developers can see at a glance which migration files are superseded (Priority: P3)

A developer reading `supabase/migrations/` finds a `README.md` that marks the three superseded files by name and names their canonical replacement, with no ambiguity about which files are authoritative.

**Why this priority**: This is cosmetic. The database is already correct after 007; this is purely about filesystem-level readability for the next person to open the directory. It is explicitly called out in the roadmap as a "cosmetic secondary step."

**Independent Test**: Open `supabase/migrations/README.md`. Confirm it exists and names `003_user_roles.sql`, `004_user_roles_rls.sql`, and `005_users_with_roles_view.sql` as superseded by `007_role_system_cleanup.sql` with a one-line rationale for each.

**Acceptance Scenarios**:

1. **Given** the refactor is complete, **When** a developer opens `supabase/migrations/`, **Then** a `README.md` exists naming each superseded file and its canonical replacement.
2. **Given** a reader skims the filenames, **When** they see numerically-duplicated prefixes (two 003s, two 004s, two 005s, two 006s), **Then** the README tells them which is load-bearing and which is superseded.

---

### Edge Cases

- **Phase A reveals prod policies that aren't in any repo migration.** Expand 007 to account for them explicitly. Do not blindly `DROP POLICY IF EXISTS` without enumerating — an unknown policy might be load-bearing. The research document is the source of truth; any policy present in prod but not in the repo must be either recreated by 007 (using `get_user_role()`) or explicitly flagged as out-of-scope in the PR description.
- **`user_roles` has non-zero rows in either prod or dev.** Phase B's `DROP TABLE user_roles CASCADE` is deferred. The workstream pauses; the user decides whether rows should be migrated into `user_profiles.role` or discarded. The rest of 007 — dropping policies and dropping the helper functions — still ships, since those have no data dependency. A follow-up migration handles the table drop once data is reconciled.
- **Prod and dev Supabase diverge.** Migration 007's `IF EXISTS` guards mean the same file applies cleanly to both states and produces the same end state. Phase A is still required to confirm the end state is what's expected.
- **Migration 007 is re-run.** Idempotent via `IF EXISTS` guards and policy-name-first drops before creates. Re-runs after a partial application complete cleanly.
- **The `users_with_roles` view is already authoritative in prod.** `006_users_with_roles_view.sql` uses `CREATE OR REPLACE VIEW`, so even though `005_users_with_roles_view.sql` (the `user_roles`-based variant) ran first, 006 overwrites it. Phase A confirms. If Phase A shows the view is still the 005 variant in some environment, 007 reasserts the 006 definition.
- **The auto-generated `src/types/database.ts` contains `user_roles` types today.** After 007 + `npm run db:types:dev && npm run db:types`, the generated file is regenerated; the removed types appear as a diff. Constitution forbids hand-edits.
- **A caller of `user_has_role` or `user_roles` exists in `src/` that exploration missed.** FR-010 makes this an explicit scope boundary: if one surfaces, this spec's scope is exceeded and a new spec is opened.
- **Rollback of 007 after it ships to prod.** Append-only means rollback is `008_restore_x.sql`, not a git revert of 007. The PR description calls this out.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A Phase A audit MUST be completed against BOTH prod and dev Supabase before any DDL for migration 007 is written. The audit MUST capture the output of four queries — `pg_tables` (public schema), `pg_proc` filtered to `get_user_role` and `user_has_role`, `pg_policies` for public schema ordered by table and policy name, and `SELECT COUNT(*) FROM user_roles`. Findings MUST be persisted in `specs/004-consolidate-role-migrations/research.md`, dated, with environments labelled.
- **FR-002**: The consolidation ships as a single new append-only migration file, `supabase/migrations/007_role_system_cleanup.sql`. Files 001-006 MUST NOT be edited.
- **FR-003**: After 007 applies to an environment, every RLS policy on every public-schema table MUST route its role check through the no-arg `get_user_role() → user_role` helper defined in `003_user_profiles.sql`. Zero policies MAY reference `user_has_role`.
- **FR-004**: The two-arg `get_user_role(UUID) → TEXT` function and the `user_has_role(UUID, TEXT) → BOOLEAN` function MUST be dropped from the database by migration 007. Only the no-arg `get_user_role()` survives.
- **FR-005**: If Phase A confirms the `user_roles` table is empty in BOTH prod and dev, migration 007 MUST `DROP TABLE user_roles CASCADE`. If either environment has rows, the `DROP TABLE` step is deferred, the rest of 007 still ships, and a follow-up spec tracks row reconciliation. This conditional is resolved during Phase A, not at SQL runtime.
- **FR-006**: Migration 007 MUST use `IF EXISTS` guards on every `DROP POLICY`, `DROP FUNCTION`, and `DROP TABLE` statement, so it applies cleanly against environments whose state drifts from the repo-inferred state and is safe to re-run after partial application.
- **FR-007**: After 007 applies, `npm run db:types:dev` and `npm run db:types` MUST be executed and the regenerated `src/types/database.ts` committed in the same PR. The file MUST NOT be hand-edited.
- **FR-008**: A `supabase db reset` on a clean local database MUST apply every migration 001..007 with exit code 0 and zero SQL errors. The resulting `pg_policies` output MUST match — on a semantic diff basis, with intentional differences called out in the PR — the post-007 prod baseline.
- **FR-009**: After 007 is deployed to prod: organizers MUST be able to create, edit, and delete events via `/dashboard/events`; vendors MUST be denied those actions at both the DB layer (direct-query attempts fail RLS) and the app layer (`requireRole` returns its usual error). Applications, vendors, and attachments MUST behave per the existing `005_rbac_rls_policies.sql` semantics.
- **FR-010**: No application source file under `src/` is modified by this refactor except the auto-generated `src/types/database.ts`. If exploration during implementation reveals a live caller of `user_has_role` or the `user_roles` table under `src/`, this spec's scope is exceeded; a new spec MUST be opened before that caller is modified.
- **FR-011**: The three superseded files — `003_user_roles.sql`, `004_user_roles_rls.sql`, `005_users_with_roles_view.sql` — MUST NOT be deleted. A new `supabase/migrations/README.md` MUST be added that names each file as superseded by `007_role_system_cleanup.sql` with a one-line rationale per file. Rationale for preservation-over-deletion: Constitution Principle I's append-only rule, plus the roadmap's analysis that these files ran in prod regardless of their "DO NOT RUN YET" headers.
- **FR-012**: The PR introducing 007 MUST include a manual verification note in its description containing (a) the SQL outputs Phase A captured, (b) the SQL 007 executed, (c) the post-007 `pg_policies` output, and (d) evidence that the organizer-can-CRUD-events / vendor-cannot smoke test passed in the app after prod deployment. This satisfies Constitution §II's "RLS changes SHOULD include a manual verification note in the PR until a DB-integration harness exists" — treated as MUST for this feature given the schema-semantics scope.

### Key Entities

- **Canonical role helper**: `public.get_user_role() → user_role`. No arguments. `STABLE` `SECURITY DEFINER`. Defined in `003_user_profiles.sql:86-94`. Reads `public.user_profiles.role WHERE id = auth.uid()`. The sole role-lookup surface in RLS after 007.
- **Superseded role helpers** (both dropped by 007): `public.get_user_role(UUID) → TEXT` and `public.user_has_role(UUID, TEXT) → BOOLEAN`, both defined in `003_user_roles.sql`. Read from `user_roles`, which the app never writes to.
- **Canonical role table**: `public.user_profiles`. Populated by the `handle_new_user` trigger on auth signup. The sole source of truth for a user's role.
- **Superseded role table**: `public.user_roles`. Dropped by 007 if Phase A confirms it is empty in both environments.
- **Canonical admin view**: `public.users_with_roles` as defined in `006_users_with_roles_view.sql` (joins `auth.users` with `user_profiles`). The earlier `005_users_with_roles_view.sql` (joins `user_roles`) is overwritten at apply time by 006's `CREATE OR REPLACE VIEW` and is superseded at the filesystem level by FR-011's README.
- **Consolidation migration**: `supabase/migrations/007_role_system_cleanup.sql`. The new append-only migration that executes the drops and policy recreations.
- **Phase A research artefact**: `specs/004-consolidate-role-migrations/research.md`. The baseline document produced in Phase A that Phase B's SQL references.
- **Migrations README**: `supabase/migrations/README.md`. Added in this feature; names the superseded files and their canonical replacement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `specs/004-consolidate-role-migrations/research.md` exists and contains, separately for prod and dev, the verbatim (or faithfully transcribed) output of the four Phase A baseline queries. Each section is labelled with environment name and capture timestamp. The document exists before migration 007 is written.
- **SC-002**: In every environment where 007 has applied, `SELECT COUNT(*) FROM pg_policies WHERE schemaname='public' AND (qual ILIKE '%user_has_role%' OR with_check ILIKE '%user_has_role%')` returns 0.
- **SC-003**: In every environment where 007 has applied, `SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname IN ('get_user_role','user_has_role')` returns exactly one row: `get_user_role` with empty arguments.
- **SC-004**: On a clean local Supabase instance, `supabase db reset` completes with exit code 0 and zero SQL errors, applying every file 001..007.
- **SC-005**: After 007 applies to prod, diffing post-007 prod `pg_policies` against the post-reset local `pg_policies` yields zero semantic differences, or every remaining difference is called out in the PR description as intentional.
- **SC-006**: With migration 007 live, an organizer can create, edit, and delete events via `/dashboard/events` end-to-end (manual walkthrough). A vendor cannot reach `/dashboard/events/new` (middleware or `requireRole` blocks), and any event-mutation server action invoked as a vendor returns `{ success: false, error, data: null }`.
- **SC-007**: After `npm run db:types:dev && npm run db:types`, `git diff src/types/database.ts` shows only the removal of types associated with the dropped `user_roles` table and legacy helper types — no unexpected schema deltas.
- **SC-008**: `supabase/migrations/README.md` exists and names each of `003_user_roles.sql`, `004_user_roles_rls.sql`, and `005_users_with_roles_view.sql` as superseded by `007_role_system_cleanup.sql`, with a one-line rationale for each.
- **SC-009**: `npm run lint && npm test && npm run build` all complete green on the PR branch before merge.
- **SC-010**: The PR description contains the Constitution §II manual verification note: Phase A SQL outputs, 007's SQL, post-007 `pg_policies` output, and app-layer smoke-test evidence for SC-006.

## Assumptions

- **Scope is narrowly the role-system cleanup.** Non-role migrations (events, vendors, applications, attachments, storage-bucket policies if any) are out of scope. If Phase A reveals unrelated cruft, it is left for a future sweep.
- **Phase A's baseline is sufficient evidence for Phase B's DROP list.** No separate dry-run on a staging environment is required beyond `supabase db reset` locally and PR review of the post-007 prod `pg_policies` output.
- **`006_users_with_roles_view.sql` is already the authoritative view definition in applied environments.** Migrations run alphabetically, so `005_users_with_roles_view.sql` runs first and 006 then overwrites it via `CREATE OR REPLACE VIEW`. Phase A confirms this; no corrective DDL for the view is expected in 007 unless Phase A shows otherwise.
- **The three superseded repo files are preserved with a README note, not deleted.** Rationale in FR-011: Constitution Principle I's append-only rule, plus the roadmap's observation that these files ran in prod regardless of the "DO NOT RUN YET" header.
- **The app keeps working today because application-layer `requireRole()` is the real gate**, not DB RLS, for the 006-gated paths. Phase A quantifies the exact situation; the fix direction is the same regardless.
- **`user_roles` is expected to be empty in both environments.** The app never writes to it. Phase A confirms by `SELECT COUNT(*)`. If non-zero rows exist, `DROP TABLE` is deferred and the rest of 007 still ships.
- **Regenerated `src/types/database.ts` is committed in the same PR as 007.** Matches the pattern established by spec 001.
- **Rollback from 007 is by follow-up migration, not file revert.** Append-only means a future `008_restore_*.sql` is the rollback path. The PR description states this so no one tries `git revert`.
- **Migration 007 uses `IF EXISTS` guards on every drop.** Safe against drift between environments and safe to re-run. Phase A is the check that everything 007 drops was actually present to begin with.
- **No feature flag, no staged rollout.** The migration applies to dev first (via `db:types:dev` workflow), then to prod.
- **The Constitution §II "manual verification note" requirement applies in full.** No DB-integration harness exists yet, so the PR description carries the evidence burden (SC-010).
- **The organizer/vendor event-CRUD acceptance criterion is verified manually.** No new automated test ships with this refactor. RLS test coverage is a separate future spec.
