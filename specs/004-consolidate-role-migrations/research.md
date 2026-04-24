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

**Prod result** _(paste here — include capture timestamp)_:

```
[FILL IN DURING PHASE A]
```

**Dev result** _(paste here — include capture timestamp)_:

```
[FILL IN DURING PHASE A]
```

---

### Query 2 — Role-related functions

```sql
SELECT proname, pg_get_function_identity_arguments(oid), prorettype::regtype
FROM pg_proc
WHERE proname IN ('get_user_role', 'user_has_role')
ORDER BY proname, pg_get_function_identity_arguments(oid);
```

**Prod result** _(paste here — include capture timestamp)_:

```
[FILL IN DURING PHASE A]
```

**Dev result** _(paste here — include capture timestamp)_:

```
[FILL IN DURING PHASE A]
```

Expected (if both environments match the repo): three rows:
- `get_user_role` | `` (empty) | `user_role`
- `get_user_role` | `p_user_id uuid` | `text`
- `user_has_role` | `p_user_id uuid, p_required_role text` | `boolean`

---

### Query 3 — RLS policies on public schema tables

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Prod result** _(paste full table here — include capture timestamp)_:

```
[FILL IN DURING PHASE A]
```

**Dev result** _(paste full table here — include capture timestamp)_:

```
[FILL IN DURING PHASE A]
```

Expected count: 32 rows (24 from `005_rbac_rls_policies.sql` + 8 from `006_rbac_rls_updates.sql`; see `contracts/rls-policies.md` for the full enumeration). If Phase A shows a different count, expand 007 to account for the delta before writing any DROP statements.

---

### Query 4 — user_roles row count

```sql
SELECT COUNT(*) FROM user_roles;
```

**Prod result** _(paste here — include capture timestamp)_:

```
[FILL IN DURING PHASE A]
```

**Dev result** _(paste here — include capture timestamp)_:

```
[FILL IN DURING PHASE A]
```

Expected: 0 in both environments (app never writes to `user_roles`). **If non-zero in either environment**, the `DROP TABLE user_roles CASCADE` step in 007 is deferred per FR-005 — stop and escalate before authoring that clause.

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
