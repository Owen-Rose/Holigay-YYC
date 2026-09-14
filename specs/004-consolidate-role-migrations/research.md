# Research: Consolidate Role-System Migrations

**Feature**: `004-consolidate-role-migrations`
**Phase**: 0 — Research (completed before any DDL is authored)
**Status**: Partially complete — R1–R7 are pre-implementation analysis; R2 result sections are **blank templates** to be filled in during Phase A of the implementation (FR-001, SC-001)

---

## R1 — Source of the mess

The repo has **four pairs of duplicate-numbered migrations** in `supabase/migrations/`. This happened because a parallel role-system design was prototyped alongside the one that shipped, and the prototyped files were never deleted. Supabase CLI applies migrations in filename-alphabetical order, so the "DO NOT RUN YET" header in `003_user_roles.sql` was silently ignored.

The applied order (after alphabetical sort) is:

```
001_initial_schema.sql         ← ACTIVE
002_rls_policies.sql           ← ACTIVE (most policies superseded by 005)
003_user_profiles.sql          ← ACTIVE — canonical role table + no-arg get_user_role()
003_user_roles.sql             ← RUNS IN PROD despite "DO NOT RUN YET" header
                                  Creates user_roles table + get_user_role(UUID) + user_has_role(UUID,TEXT)
004_user_roles_rls.sql         ← RUNS IN PROD — adds RLS to user_roles; uses user_has_role()
004_vendors_user_link.sql      ← ACTIVE — adds vendors.user_id
005_rbac_rls_policies.sql      ← ACTIVE — canonical 24 policies; all use get_user_role() no-arg
005_users_with_roles_view.sql  ← RUNS IN PROD — view joins user_roles (superseded table)
006_rbac_rls_updates.sql       ← RUNS IN PROD — adds 8 policies; all use user_has_role(auth.uid(),...)
006_users_with_roles_view.sql  ← ACTIVE — CREATE OR REPLACE overwrites 005's view; joins user_profiles
```

**The critical defect in `006_rbac_rls_updates.sql`**:

Every policy it creates gates writes on `events`, `applications`, `vendors`, and `attachments` via `user_has_role(auth.uid(), 'organizer')`. The `user_has_role` function reads from `user_roles`, which the application **never writes to** — `handle_new_user()` writes to `user_profiles`, not `user_roles`. `user_roles` is always empty.

With `user_roles` empty, `get_user_role(p_user_id UUID)` always returns `'vendor'` (its COALESCE default). `user_has_role(auth.uid(), 'organizer')` then evaluates to `0 >= 1 = FALSE`. **Every policy from 006 denies every user.**

**Why the app still works today**:

`006_rbac_rls_updates.sql` drops the _old policy names_ from `002_rls_policies.sql` — but `005_rbac_rls_policies.sql` had already replaced those names. So 006's DROP statements are no-ops, and 005's correct policies remain in force _alongside_ 006's always-false policies. PostgreSQL evaluates permissive policies with OR logic: any permissive policy that allows the row is sufficient. 005's `get_user_role()`-based policies allow organizers; 006's `user_has_role()`-based policies deny everyone. The OR means organizers are still allowed.

The current database has **32 policies** on the five public-schema tables: 24 correct ones from 005 and 8 always-false ones from 006. Any future migration that drops 005's policies or assumes "RLS enforces role correctly without application-layer guards" will break the app, because 006's policies are what `pg_policies` implies is enforcing the rule.

---

## R2 — Phase A query procedure

Run these four queries against **both** prod and dev Supabase SQL editors before authoring migration 007. Paste results into the blank sections below. The presence of the results is what satisfies FR-001 / SC-001 — this file must be populated before any DROP statement is written.

### Query 1 — Public schema tables

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Prod result** _(captured 2026-04-23, env `hgmfjvjlxrhdojwlkgap`)_:

| tablename     |
| ------------- |
| applications  |
| attachments   |
| events        |
| user_profiles |
| user_roles    |
| vendors       |

**Dev result** _(captured 2026-04-24, env `kcokcufmzyckbodelqpb`)_:

| tablename     |
| ------------- |
| applications  |
| attachments   |
| events        |
| user_profiles |
| vendors       |

> **Divergence**: dev does not have a `user_roles` table. See §R2-A.

---

### Query 2 — Role-related functions

```sql
SELECT proname, pg_get_function_identity_arguments(oid), prorettype::regtype
FROM pg_proc
WHERE proname IN ('get_user_role', 'user_has_role')
ORDER BY proname, pg_get_function_identity_arguments(oid);
```

**Prod result** _(captured 2026-04-23)_:

| proname       | pg_get_function_identity_arguments   | prorettype |
| ------------- | ------------------------------------ | ---------- |
| get_user_role |                                      | user_role  |
| get_user_role | p_user_id uuid                       | text       |
| user_has_role | p_user_id uuid, p_required_role text | boolean    |

**Dev result** _(captured 2026-04-24)_:

| proname       | pg_get_function_identity_arguments | prorettype |
| ------------- | ---------------------------------- | ---------- |
| get_user_role |                                    | user_role  |

> **Divergence**: dev has only the canonical no-arg `get_user_role()`. The two-arg `get_user_role(uuid)` and `user_has_role(uuid, text)` from `003_user_roles.sql` are absent. See §R2-A.

---

### Query 3 — RLS policies on public schema tables

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Prod result** _(captured 2026-04-23, 30 rows)_:

| tablename     | policyname                        | cmd    | roles           | qual                                                                                                              | with_check                                                                                                        |
| ------------- | --------------------------------- | ------ | --------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| applications  | anon_insert_applications          | INSERT | {anon}          | null                                                                                                              | true                                                                                                              |
| applications  | anon_select_applications          | SELECT | {anon}          | true                                                                                                              | null                                                                                                              |
| applications  | authenticated_insert_applications | INSERT | {authenticated} | null                                                                                                              | `(EXISTS (SELECT 1 FROM vendors WHERE vendors.id = applications.vendor_id AND vendors.user_id = auth.uid())) OR (get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role]))` |
| applications  | authenticated_select_applications | SELECT | {authenticated} | `(EXISTS (SELECT 1 FROM vendors WHERE vendors.id = applications.vendor_id AND vendors.user_id = auth.uid())) OR (get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role]))` | null                                                                                                              |
| applications  | organizer_delete_applications     | DELETE | {authenticated} | `get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role])`                                       | null                                                                                                              |
| applications  | organizer_update_applications     | UPDATE | {authenticated} | `get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role])`                                       | `get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role])`                                       |
| attachments   | anon_insert_attachments           | INSERT | {anon}          | null                                                                                                              | true                                                                                                              |
| attachments   | anon_select_attachments           | SELECT | {anon}          | true                                                                                                              | null                                                                                                              |
| attachments   | authenticated_insert_attachments  | INSERT | {authenticated} | null                                                                                                              | `(EXISTS (SELECT 1 FROM applications JOIN vendors ON vendors.id = applications.vendor_id WHERE applications.id = attachments.application_id AND vendors.user_id = auth.uid())) OR (get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role]))` |
| attachments   | authenticated_select_attachments  | SELECT | {authenticated} | `(EXISTS (SELECT 1 FROM applications JOIN vendors ON vendors.id = applications.vendor_id WHERE applications.id = attachments.application_id AND vendors.user_id = auth.uid())) OR (get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role]))` | null                                                                                                              |
| attachments   | organizer_delete_attachments      | DELETE | {authenticated} | `get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role])`                                       | null                                                                                                              |
| events        | anon_select_active_events         | SELECT | {anon}          | `status = 'active'::text`                                                                                         | null                                                                                                              |
| events        | authenticated_select_events       | SELECT | {authenticated} | true                                                                                                              | null                                                                                                              |
| events        | organizer_delete_events           | DELETE | {authenticated} | `get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role])`                                       | null                                                                                                              |
| events        | organizer_insert_events           | INSERT | {authenticated} | null                                                                                                              | `get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role])`                                       |
| events        | organizer_update_events           | UPDATE | {authenticated} | `get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role])`                                       | `get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role])`                                       |
| user_profiles | admin_update_profiles             | UPDATE | {authenticated} | `get_user_role() = 'admin'::user_role`                                                                            | `get_user_role() = 'admin'::user_role`                                                                            |
| user_profiles | select_own_profile                | SELECT | {authenticated} | `(id = auth.uid()) OR (get_user_role() = 'admin'::user_role)`                                                     | null                                                                                                              |
| user_roles    | Admins can delete any role        | DELETE | {authenticated} | `user_has_role(auth.uid(), 'admin'::text)`                                                                        | null                                                                                                              |
| user_roles    | Admins can insert any role        | INSERT | {authenticated} | null                                                                                                              | `user_has_role(auth.uid(), 'admin'::text)`                                                                        |
| user_roles    | Admins can update any role        | UPDATE | {authenticated} | `user_has_role(auth.uid(), 'admin'::text)`                                                                        | `user_has_role(auth.uid(), 'admin'::text)`                                                                        |
| user_roles    | Admins can view all roles         | SELECT | {authenticated} | `user_has_role(auth.uid(), 'admin'::text)`                                                                        | null                                                                                                              |
| user_roles    | Users can insert own role         | INSERT | {authenticated} | null                                                                                                              | `(auth.uid() = user_id) AND (role = 'vendor'::text)`                                                              |
| user_roles    | Users can view own role           | SELECT | {authenticated} | `auth.uid() = user_id`                                                                                            | null                                                                                                              |
| vendors       | anon_insert_vendors               | INSERT | {anon}          | null                                                                                                              | true                                                                                                              |
| vendors       | anon_select_vendors               | SELECT | {anon}          | true                                                                                                              | null                                                                                                              |
| vendors       | organizer_delete_vendors          | DELETE | {authenticated} | `get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role])`                                       | null                                                                                                              |
| vendors       | organizer_insert_vendors          | INSERT | {authenticated} | null                                                                                                              | `get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role])`                                       |
| vendors       | vendor_select_own                 | SELECT | {authenticated} | `(user_id = auth.uid()) OR (get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role]))`           | null                                                                                                              |
| vendors       | vendor_update_own                 | UPDATE | {authenticated} | `(user_id = auth.uid()) OR (get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role]))`           | `(user_id = auth.uid()) OR (get_user_role() = ANY (ARRAY['organizer'::user_role, 'admin'::user_role]))`           |

**Dev result** _(captured 2026-04-24, 24 rows — identical to prod's policies on main tables; no `user_roles` policies)_:

Row-by-row breakdown matches prod's 24 main-table policies exactly. The 6 prod policies on `user_roles` (Admins can {delete,insert,update,view} + Users can {insert,view} own role) have no dev equivalent — table absent.

> **Divergence vs spec expectation**: spec assumed 32 rows on main tables (24 from 005 + 8 from 006). Reality: 24 rows on main tables in both envs. The 8 always-FALSE policies from `006_rbac_rls_updates.sql` ("Organizers can {create,update,delete} events", "Organizers can {update,delete} applications", "Organizers can {update,delete} vendors", "Organizers can delete attachments") are absent in both envs. See §R2-A.

---

### Query 4 — user_roles row count

```sql
SELECT COUNT(*) FROM user_roles;
```

**Prod result** _(captured 2026-04-23)_:

| count |
| ----- |
| 1     |

**Dev result** _(captured 2026-04-24)_:

```
ERROR: 42P01: relation "user_roles" does not exist
LINE 2:   SELECT COUNT(*) FROM user_roles;
```

> **Decision (FR-005, T017)**: prod has 1 row; dev's table doesn't exist. The `DROP TABLE user_roles CASCADE` step in migration 007 is **deferred**. See §R2-B.

#### Query 4 supplement — `user_roles` row contents (prod)

`SELECT * FROM user_roles;` against prod _(captured 2026-04-24)_:

| id                                     | user_id                                | role  | created_at                    | updated_at                    |
| -------------------------------------- | -------------------------------------- | ----- | ----------------------------- | ----------------------------- |
| `5e5941a4-d100-4907-9f11-7ef87e5614e8` | `22d56e26-3534-4bb9-9678-111d60a00c78` | admin | 2026-01-11 05:04:18.962211+00 | 2026-01-11 05:04:18.962211+00 |

A single admin row created 2026-01-11 (~5 weeks after prod was provisioned). `created_at == updated_at` so the row has never been touched since insert. Most likely interpretation: the row is a stale artifact of an early admin bootstrap that used `user_roles` before the canonical design switched to `user_profiles`. See §R2-B for the cross-check actions and the resulting decision.

---

## R2-A — Divergences from spec expectation

Phase A revealed two divergences between the captured baselines and the state the spec's R1 analysis predicted. Neither blocks 007; both reframe what 007 actually accomplishes.

### Divergence 1 — `006_rbac_rls_updates.sql`'s 8 policies are absent in both envs

The spec's R1 section predicted 32 policies on the main tables (24 from `005_rbac_rls_policies.sql` + 8 from `006_rbac_rls_updates.sql`). Phase A captured **24** in both prod and dev. The 8 "Organizers can XXX" policies that 006 creates do not exist in either live environment:

- `Organizers can create events` / `update events` / `delete events`
- `Organizers can update applications` / `delete applications`
- `Organizers can update vendors` / `delete vendors`
- `Organizers can delete attachments`

The repo file `supabase/migrations/006_rbac_rls_updates.sql` does still create these policies on a fresh `db reset`, so the file remains relevant for new envs. But in the live envs, the policies have either never been applied or were manually dropped at some point. Implication: 007's 8 `DROP POLICY IF EXISTS` statements are no-ops against prod and dev, but still drop the policies on a fresh local reset.

### Divergence 2 — Dev never had the `003_user_roles.sql` chain applied

The spec's R1 section assumed prod and dev would share the same messy state. They don't. Dev:
- has no `user_roles` table
- has no `get_user_role(uuid)` two-arg function
- has no `user_has_role(uuid, text)` function
- has no policies on `user_roles` (no table → no policies)

Likely cause: dev was provisioned 2026-02-06 (~2 months after prod, 2025-12-07), at a point when the abandoned alternate role-system files were already known to be dead. Whoever set up dev applied only the canonical migrations (`001`, `002`, `003_user_profiles`, `004_vendors_user_link`, `005_rbac_rls_policies`, `006_users_with_roles_view`) and skipped the duplicate-numbered alternates.

Implication: 007 applied to dev is a complete no-op. All `IF EXISTS` clauses fall through. No harm; no benefit either.

### What 007 actually does, per env

| Step | Prod | Dev | Local fresh `db reset` |
|------|------|-----|------------------------|
| Drop 8 policies from 006 | no-op (absent) | no-op (absent) | drops them |
| Drop `get_user_role(UUID)` | drops it | no-op (absent) | drops it |
| Drop `user_has_role(UUID, TEXT)` | **drops it; 6 user_roles policies become unevaluable (acceptable per R4)** | no-op (absent) | drops it |
| Drop `user_roles` table | **DEFERRED — see §R2-B** | already absent | drops it (no rows) |

The migration text is identical across all three. `IF EXISTS` makes it env-agnostic.

---

## R2-B — DROP TABLE decision (T017)

**Decision: (b) DEFERRED.**

Per FR-005: "If either environment has rows, the `DROP TABLE` step is deferred." Prod has 1 row in `user_roles` (see Query 4 supplement); dev's table does not exist. Migration 007 ships Steps 1–3 (policy drops, function drops); **Step 4 (DROP TABLE user_roles CASCADE) is omitted from 007**.

The deferral is recorded with a SQL comment in 007 itself, pointing to this section.

### Cross-check (resolved 2026-04-24)

Two read-only queries against prod confirmed the `user_roles` row's provenance.

**Query (a) — `user_profiles` lookup:**

| id                                     | role  | created_at                    |
| -------------------------------------- | ----- | ----------------------------- |
| `22d56e26-3534-4bb9-9678-111d60a00c78` | admin | 2026-02-07 05:37:49.530708+00 |

**Query (b) — `auth.users` lookup:**

| id                                     | email                    | created_at                    |
| -------------------------------------- | ------------------------ | ----------------------------- |
| `22d56e26-3534-4bb9-9678-111d60a00c78` | owenconnorrose@gmail.com | 2025-12-26 01:00:11.485551+00 |

**Resolution: Branch 1 — stale duplicate, no pre-007 action required.**

The user_profiles row is the canonical admin record (created 2026-02-07, role=admin). The user_roles row (created 2026-01-11, role=admin) predates it and is a stale duplicate left over from the abandoned `user_roles`-based role system. Both records agree on the role, so dropping `user_roles` in the follow-up spec discards the duplicate without data loss.

Timeline reconstruction:
- 2025-12-26 — user signs up (`auth.users` row created)
- 2026-01-11 — admin row inserted into `user_roles` (the `003_user_roles.sql` design was still considered canonical at this point)
- 2026-02-07 — `user_profiles` row created with `role=admin` (after the design switched to `user_profiles`; the bootstrap procedure was rerun against the canonical table)

**007 ships unchanged**; the follow-up spec drops `user_roles` and the duplicate row.

### Follow-up spec

A separate spec (numbered 005 or higher) will:
1. Reconcile the `user_roles` row (per the cross-check outcome above) — confirmed safe to discard.
2. Ship `008_drop_user_roles.sql`: `DROP TABLE user_roles CASCADE` (drops the table and the 6 now-broken policies)
3. Regenerate `src/types/database.ts`
4. Mark the follow-up complete in `docs/cleanup-roadmap.md`

---

## R2-C — Local `supabase db reset` gap (SC-004 deferred)

`supabase start` against this repo's migration set fails:

```
Applying migration 003_user_profiles.sql...
Applying migration 003_user_roles.sql...
ERROR: duplicate key value violates unique constraint "schema_migrations_pkey"
Key (version)=(003) already exists.
```

The Supabase CLI extracts the leading numeric prefix as the `schema_migrations.version` primary key. The repo has four duplicate-prefix pairs (`003_*`, `004_*`, `005_*`, `006_*`); the CLI errors on the first one. The remote envs are unaffected — they apply migrations via the dashboard SQL editor, which doesn't enforce the same unique constraint at apply time.

**Effect on this spec**: SC-004 ("`supabase db reset` on a clean local instance applies every file 001..007 cleanly") is **not achievable without changes to the file set**. The spec's FR-011 explicitly chose preservation over deletion or renaming, so resolving SC-004 inside this spec would require an additional decision the spec didn't anticipate.

**Decision (2026-04-24)**: Defer SC-004 to a follow-up spec.

- Migration 007 ships to dev and prod via the dashboard SQL editor (T022 / T023).
- Postcondition verification (T020-equivalent) runs against dev and prod after apply, not against a local fresh reset.
- A follow-up spec will reorganize `supabase/migrations/` (e.g., move the four duplicate-causing files into `supabase/migrations/_superseded/` so the CLI ignores them on reset, while preserving them in the repo for traceability per FR-011) and ship the local-bootstrap fix.
- The local-reset gap is captured in the PR description and added to `docs/cleanup-roadmap.md` as a new workstream.

This decision keeps spec 004's scope narrow (the production schema fix) and isolates the developer-ergonomics fix into its own spec.

---

## R3 — Design decisions

### R3-A: `IF EXISTS` guards on every DROP

**Decision**: Every `DROP POLICY`, `DROP FUNCTION`, and `DROP TABLE` in 007 uses `IF EXISTS`.

**Rationale**: Prod and dev may have drifted from the repo-implied state in ways Phase A hasn't fully captured. `IF EXISTS` lets 007 apply cleanly against either environment and survive re-runs after partial application. The trade-off is that `IF EXISTS` silences "object not found" errors — Phase A is the explicit check that every dropped object was present before the migration ran. Without Phase A, `IF EXISTS` would be dangerous; with Phase A, it is the right default.

**Alternative rejected**: Bare `DROP` without `IF EXISTS` (fails loudly on missing objects, which is less tolerant of drift but means partial-apply is not re-runnable).

### R3-B: README preservation instead of deleting superseded files

**Decision**: `003_user_roles.sql`, `004_user_roles_rls.sql`, `005_users_with_roles_view.sql` are kept in the repository. A new `supabase/migrations/README.md` marks them as superseded.

**Rationale**: Constitution Principle I's append-only rule extends to the file set — files that ran in prod (which these did, despite the "DO NOT RUN YET" header) are part of the applied history. Deleting them breaks the traceability between the committed file set and what ran on prod. A README costs nothing and helps the next reader understand the numerically-duplicated prefix (see FR-011).

**Alternative rejected**: Delete the three files (cleaner directory listing but erases prod migration history).

### R3-C: Single consolidation migration

**Decision**: One file — `007_role_system_cleanup.sql` — performs all drops in a single transaction.

**Rationale**: Atomicity. If the migration fails mid-way, rolling back to pre-007 state is cleaner than having several smaller migrations in a partially-applied state. The entire cleanup is logically one operation: collapse to canonical helper.

**Alternative rejected**: Multiple small migrations (e.g., 007 drops functions, 008 drops policies, 009 drops table) — added complexity, worse rollback story.

### R3-D: Conditional `DROP TABLE user_roles`

**Decision**: The `DROP TABLE user_roles CASCADE` clause is written only if Phase A's Query 4 returns 0 in both environments. This decision is made by the developer during Phase A, not at SQL runtime.

**Rationale**: Data safety. If any row exists, those rows represent a divergence from expectations and must be understood before the table is dropped. Automating the conditional at runtime (`DO $$ IF NOT EXISTS SELECT... $$`) would obscure the decision; the developer must see the count and consciously decide. The rest of 007 (function drops, policy drops) has no data dependency and ships regardless.

**Alternative rejected**: Always include `DROP TABLE IF EXISTS user_roles CASCADE` unconditionally (risks data loss if rows exist unexpectedly).

### R3-E: Policy recreation style

**Decision**: Any policy recreated in 007 (i.e., any policy that 007 replaces rather than simply drops) uses the `005_rbac_rls_policies.sql` idiom: `get_user_role() IN ('organizer', 'admin')` for multi-role checks, `get_user_role() = 'admin'` for admin-only checks.

**Rationale**: Consistency with the 24 surviving 005 policies. A single style prevents future confusion about which helper a policy uses.

Note: Based on the repo analysis, 007 does **not need to recreate any policies** — it only drops the 8 always-false policies from 006, leaving 005's 24 correct policies in place. If Phase A reveals additional policies that need recreation (e.g., policies present in prod but not in the repo), this style applies.

---

## R4 — Scope guards

- **If `user_roles` has rows**: Defer `DROP TABLE user_roles CASCADE` and the DROP of the 6 policies on `user_roles` table (from `004_user_roles_rls.sql`). The function drops and the 8 main-table policy drops still ship. The 6 user_roles policies will reference a dropped function (`user_has_role`), making them internally broken — this is acceptable since `user_roles` is app-dead anyway, and they cascade away when the table is eventually dropped in a follow-up migration.
- **Storage-bucket policies**: Out of scope. If Phase A reveals RLS or policies on storage objects, they are left for a dedicated spec.
- **Non-role tables** (events, vendors, applications, attachments schema changes): Out of scope. 007 only drops/modifies role-related policies — no column or table structure changes on these tables.
- **Application-layer callers** (`src/` code): FR-010 is an explicit scope boundary. If a live caller of `user_has_role` or `user_roles` surfaces under `src/`, this spec's scope is exceeded and a new spec must be opened before modifying the caller.
- **No new automated tests**: Per spec Assumption. If DB-level RLS test coverage becomes a hard requirement it is a separate spec.

---

## R5 — Downstream doc propagation

Two documents will need updates after 007 ships. These are flagged here for the tasks phase:

1. **`CLAUDE.md` "Database Schema" section**: Lists `user_roles` as a supporting object and mentions `get_user_role()` alongside the SQL function. After 007, `user_roles` and the two superseded functions no longer exist; the paragraph should be updated to remove them. (The `update-agent-context.sh` script handles "Active Technologies" and "Recent Changes" only; this free-prose update is manual.)
2. **`docs/cleanup-roadmap.md` Workstream 3**: Should be marked `✅ Completed` once 007 ships to prod, matching the style of Workstream 1 (line 18). The commit message following that PR is a natural moment for this update.

---

## R6 — Risks and mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Prod RLS policies diverge from repo-inferred state (unknown policy present or known policy absent) | Medium | Phase A (R2 Query 3) enumerates the actual `pg_policies` before 007 is written; 007 is adjusted to match |
| `user_roles` has non-zero rows in prod or dev | Low (app never writes there) | Phase A (R2 Query 4) confirms; FR-005 conditional defers `DROP TABLE` if non-zero |
| Post-007 write fails for an organizer (missed policy recreation) | Low (005's policies remain; 007 only drops redundant 006 policies) | SC-006 smoke test (organizer CRUDs event) + FR-012 verification note in PR |
| Type regen diff (`git diff src/types/database.ts`) is larger than expected | Low | SC-007 review gate — human reviews the diff before merge |
| Someone edits files 001–006 accidentally when preparing 007 | Very low | Constitution Principle I reviewed in PR checklist |
| 007 drops a function that a live `src/` caller uses | Very low (grepped at spec time: zero callers) | FR-010 scope guard; if a caller surfaces, a new spec is opened |
| `DROP FUNCTION IF EXISTS get_user_role(UUID)` accidentally drops the no-arg variant | Very low | PostgreSQL overload resolution: the argument signature `(UUID)` targets only the two-arg variant; the no-arg `get_user_role()` is a distinct function object |

---

## R7 — Alternatives considered

| Alternative | Rejected because |
|-------------|-----------------|
| Edit `006_rbac_rls_updates.sql` in place to use `get_user_role()` | Violates Constitution Principle I — previously-applied migrations MUST NOT be edited |
| Delete the three superseded repo files | Violates the spirit of append-only (they ran in prod); erases migration history (R3-B) |
| Split into multiple small cleanup migrations (007, 008, 009 …) | Worse atomicity and rollback story (R3-C) |
| Rewrite app-layer `requireRole()` to work around DB state | Fixes the wrong end; DB RLS is the source of truth |
| Skip Phase A and write 007 from repo analysis alone | Phase A is cheap; the risk of DROP-IF-EXISTS failing silently on objects that don't exist — or missing objects that do — is non-trivial in a prod schema that diverged from the repo |
| Use `user_has_role()` hierarchy logic (`user_level >= required_level`) in the recreated policies | Incompatible with the `user_role` enum type; `get_user_role()` returns `user_role`, not `TEXT`; enum comparisons use `IN` or `=`, not numeric hierarchy |
