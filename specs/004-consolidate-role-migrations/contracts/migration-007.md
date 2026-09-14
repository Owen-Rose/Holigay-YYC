# Contract: Migration 007 — `007_role_system_cleanup.sql`

**Feature**: `004-consolidate-role-migrations`
**Purpose**: Specifies the behavioral contract for `supabase/migrations/007_role_system_cleanup.sql` — its preconditions, actions, postconditions, idempotency characteristics, and rollback model. The exact DROP/CREATE statement text depends on Phase A findings; this document specifies what those statements must accomplish.

---

## Preconditions

All of the following must hold before 007 is applied to any environment:

1. Migrations 001 through 006 are already applied (in alphabetical order).
2. `public.user_profiles` is populated — all current users have a profile row with a `role` value.
3. `public.user_roles` row count is **0** in the target environment (required for the `DROP TABLE` clause; confirmed by Phase A Query 4). If non-zero, the `DROP TABLE` clause is omitted from 007 for that environment.
4. `specs/004-consolidate-role-migrations/research.md` R2 sections are filled in with Phase A results for the target environment.
5. The developer has reviewed the actual `pg_policies` output against `contracts/rls-policies.md` and confirmed the 8 policies to be dropped exist under the expected names.

---

## Inputs

None. Migration 007 is pure DDL — no runtime parameters, no data migration, no seed data.

---

## Actions (behavioral, in execution order)

The following describes what 007 must do. The exact SQL text is authored during Phase B, after Phase A's findings are in place.

### Step 1 — Drop the 8 superseded policies from `006_rbac_rls_updates.sql`

Drop (with `IF EXISTS`) the eight policies that use `user_has_role(auth.uid(), ...)`:

- `"Organizers can create events"` on `events`
- `"Organizers can update events"` on `events`
- `"Organizers can delete events"` on `events`
- `"Organizers can update applications"` on `applications`
- `"Organizers can delete applications"` on `applications`
- `"Organizers can update vendors"` on `vendors`
- `"Organizers can delete vendors"` on `vendors`
- `"Organizers can delete attachments"` on `attachments`

Note: The 6 policies on `user_roles` (from `004_user_roles_rls.sql`) are **not** explicitly dropped here — they cascade away in Step 4. If Phase A reveals additional policies that reference `user_has_role`, expand Step 1 to include them.

### Step 2 — Drop the superseded two-arg `get_user_role` function

```sql
DROP FUNCTION IF EXISTS public.get_user_role(UUID);
```

PostgreSQL function overloads are distinct objects. This targets only the two-arg variant (`get_user_role(p_user_id UUID) → TEXT`). The no-arg `get_user_role() → user_role` is unaffected.

### Step 3 — Drop the `user_has_role` function

```sql
DROP FUNCTION IF EXISTS public.user_has_role(UUID, TEXT);
```

Note: After Step 3, the 6 policies on `user_roles` (which call `user_has_role`) will reference a missing function. This is acceptable — `user_roles` is app-dead and the policies cascade in Step 4.

### Step 4 — Drop the `user_roles` table (conditional)

```sql
DROP TABLE IF EXISTS public.user_roles CASCADE;
```

**Include this clause only if Phase A (Query 4) confirmed row count = 0 in the target environment.** The `CASCADE` drops the 6 dependent policies (`004_user_roles_rls.sql`) and the two indexes created in `003_user_roles.sql` along with the table.

If Phase A showed non-zero rows, omit this clause. The rest of 007 (Steps 1–3) still ships. A follow-up spec handles row reconciliation and the eventual table drop.

---

## Postconditions

After 007 applies successfully:

| Query | Expected result |
|-------|----------------|
| `SELECT COUNT(*) FROM pg_policies WHERE schemaname='public' AND tablename != 'user_roles' AND (qual ILIKE '%user_has_role%' OR with_check ILIKE '%user_has_role%')` | **0** |
| `SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname IN ('get_user_role','user_has_role')` | **1 row**: `get_user_role` with empty arguments |
| `SELECT * FROM information_schema.tables WHERE table_schema='public' AND table_name='user_roles'` | **0 rows** (when DROP TABLE was included) |
| `SELECT COUNT(*) FROM pg_policies WHERE schemaname='public' AND tablename != 'user_roles'` | **24** (down from 32) |
| Organizer creates/edits/deletes an event via the app | **Success** (005's `organizer_insert_events`, `organizer_update_events`, `organizer_delete_events` still in force) |
| Vendor attempts event mutation server action | **Blocked** by `requireRole()` at application layer; DB-layer `organizer_insert_events` / `organizer_update_events` / `organizer_delete_events` also deny (since vendor's `get_user_role()` returns `'vendor'`) |

---

## Idempotency

007 is safe to re-apply after a partial application:

- All `DROP` statements use `IF EXISTS` — no error if the object was already dropped.
- There are no `CREATE` statements in 007 (no new policies, functions, or tables are created). The surviving 005 policies are left in place without touching them.
- A full re-run of 007 after a partial apply completes cleanly.

---

## Things 007 deliberately does NOT do

- **Does not edit files 001–006.** Constitution Principle I: previously-applied migrations MUST NOT be edited.
- **Does not recreate the dropped policies using `get_user_role()`** — they are already covered by 005's equivalent policies, which remain in place.
- **Does not modify `users_with_roles` view** — `006_users_with_roles_view.sql`'s `CREATE OR REPLACE VIEW` already overwrote 005's `user_roles`-based version; Phase A confirms this.
- **Does not touch any `src/` application code** — FR-010 scope boundary.
- **Does not regenerate `src/types/database.ts`** — that is a post-apply step run by the developer after 007 lands.

---

## Rollback model

Migration 007 is append-only. Rollback is **not** `git revert 007` — that would make the repo history inconsistent with the DB. Rollback is a forward migration:

```sql
-- 008_restore_role_system.sql (hypothetical — only write if actually needed)
-- Recreate user_roles table
-- Recreate get_user_role(UUID) function
-- Recreate user_has_role(UUID, TEXT) function
-- Recreate the 8 dropped policies
-- Recreate user_roles RLS policies
```

In practice, rollback should not be needed — the 005 policies that remain in place after 007 are the correct and sufficient set. A rollback scenario means 007 broke something that Phase A and the smoke test should have caught first.

---

## PR verification checklist (FR-012 / SC-010)

The PR introducing 007 must include in its description:

- [ ] Phase A SQL output for prod (all four queries)
- [ ] Phase A SQL output for dev (all four queries)
- [ ] Full text of `007_role_system_cleanup.sql`
- [ ] Post-007 `pg_policies` dump for prod (verifying 24 rows, zero `user_has_role` references)
- [ ] Post-007 `pg_policies` dump for dev
- [ ] Smoke-test evidence: organizer CRUD on `/dashboard/events/new` succeeded
- [ ] Smoke-test evidence: vendor blocked from `/dashboard/events/new` (middleware redirect or `requireRole` error)
- [ ] `git diff src/types/database.ts` — only `user_roles`-related type removals
