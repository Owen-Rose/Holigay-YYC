# Quickstart: Consolidate Role-System Migrations

**Feature**: `004-consolidate-role-migrations`
**Purpose**: Step-by-step implementation runbook for migration 007. Follow these steps in order. Do not skip Phase A.

---

## Prerequisites

- Supabase CLI installed and linked to both prod and dev projects (`supabase link`)
- Access to both prod and dev Supabase SQL editors (or CLI `supabase db execute`)
- Node.js + npm available (`npm run db:types:dev` and `npm run db:types`)
- You are on branch `003-migration-cleanup` (or a branch derived from it)

---

## Phase A — Audit actual schema state (read-only)

### Step 1 — Query prod Supabase

Open the Supabase prod project → SQL Editor. Run the four queries from `research.md` R2 **in order**. For each query, capture the full result table with a timestamp.

Queries to run:
1. `pg_tables` filtered to `schemaname = 'public'`
2. `pg_proc` filtered to `get_user_role` and `user_has_role`
3. `pg_policies` for `schemaname = 'public'` ordered by `tablename, policyname`
4. `SELECT COUNT(*) FROM user_roles`

Paste results into `research.md` R2 sections under **Prod result**, including the capture timestamp.

### Step 2 — Query dev Supabase

Repeat Step 1 against dev. Paste results under **Dev result** in `research.md` R2.

### Step 3 — Reconcile against contracts

Compare the prod and dev `pg_policies` outputs (Query 3) against `contracts/rls-policies.md`.

Expected:
- 24 policies in the SURVIVING rows ✓
- 8 policies in the DROPPED BY 007 rows ✓
- 6 policies on `user_roles` (cascade-dropped) ✓

If a policy is present in prod/dev but absent from `contracts/rls-policies.md`, or vice versa: **stop and reconcile before writing 007**. Unknown policies may be load-bearing.

### Step 4 — Check `user_roles` row count

Review Query 4 results:
- If **0 in both** environments: proceed with the `DROP TABLE user_roles CASCADE` clause in 007.
- If **non-zero in either** environment: omit the `DROP TABLE` clause from 007. Note the count, escalate for data reconciliation, and proceed with Steps 1–3 of 007 only (function drops + policy drops). Open a follow-up spec for the table drop.

---

## Phase B — Author migration 007

### Step 5 — Create `007_role_system_cleanup.sql`

Create `supabase/migrations/007_role_system_cleanup.sql`. Write:

1. `DROP POLICY IF EXISTS` for each of the 8 superseded policies from `006_rbac_rls_updates.sql` (see `contracts/rls-policies.md` for exact names and tables).
2. `DROP FUNCTION IF EXISTS public.get_user_role(UUID)` — drop only the two-arg variant.
3. `DROP FUNCTION IF EXISTS public.user_has_role(UUID, TEXT)`.
4. `DROP TABLE IF EXISTS public.user_roles CASCADE` — include only if Step 4 confirmed row count = 0.

No CREATE statements. No edits to existing policies. No changes to `003_user_profiles.sql`'s `get_user_role()`.

See `contracts/migration-007.md` for the full behavioral contract and postcondition queries.

### Step 6 — Create `supabase/migrations/README.md`

Create `supabase/migrations/README.md`. It must identify the three superseded files and their canonical replacement:

- `003_user_roles.sql` — superseded by `007_role_system_cleanup.sql`. Alternate role-system design; ran in prod despite "DO NOT RUN YET" header due to alphabetical apply order.
- `004_user_roles_rls.sql` — superseded by `007_role_system_cleanup.sql`. RLS for the superseded `user_roles` table.
- `005_users_with_roles_view.sql` — superseded by `006_users_with_roles_view.sql`. View joined `user_roles`; overwritten by 006's `CREATE OR REPLACE VIEW` which joins `user_profiles`.

This satisfies FR-011 / SC-008.

---

## Phase C — Local verification

### Step 7 — Apply locally with `supabase db reset`

```
supabase db reset
```

Expected: exit code 0, zero SQL errors, every file 001–007 applies. If any file errors, fix 007 before proceeding.

### Step 8 — Run the postcondition queries locally

In the local Supabase SQL editor (or `supabase db execute`), run:

```sql
-- Expect 0
SELECT COUNT(*) FROM pg_policies
WHERE schemaname='public' AND tablename != 'user_roles'
AND (qual ILIKE '%user_has_role%' OR with_check ILIKE '%user_has_role%');

-- Expect exactly 1 row: get_user_role with empty args
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc WHERE proname IN ('get_user_role','user_has_role');

-- Expect 24
SELECT COUNT(*) FROM pg_policies
WHERE schemaname='public' AND tablename != 'user_roles';
```

### Step 9 — Regenerate types

```
npm run db:types:dev && npm run db:types
```

Review the diff on `src/types/database.ts`:

```
git diff src/types/database.ts
```

Expected: only removals of `user_roles`-related types. No unexpected additions or schema changes. This satisfies SC-007.

If the diff is clean, stage the file for the PR commit.

### Step 10 — Local smoke test

Sign in as an organizer account (see CLAUDE.md "Admin Bootstrap" for how to promote a user):

1. Navigate to `/dashboard/events/new`.
2. Create a new test event. Confirm it appears on `/dashboard/events`.
3. Click "edit" on the test event. Change the title. Confirm the update saves.
4. Delete the test event. Confirm it disappears.

Sign out. Sign in as a vendor account:

5. Navigate to `/dashboard/events/new`. Confirm redirect to `/unauthorized`.
6. Check the network tab: any event-mutation server action invoked as a vendor should return the `requireRole` error shape.

Confirm `npm run lint && npm test && npm run build` all pass.

---

## Phase D — Deploy to dev and prod

### Step 11 — Apply to dev Supabase

Apply the migration to dev using the Supabase dashboard (run the SQL directly in the SQL editor or use `supabase db push` if configured).

Re-run the postcondition queries from Step 8 against dev. Confirm expected results.

### Step 12 — Apply to prod Supabase

Apply the migration to prod. Re-run the postcondition queries against prod. Confirm expected results.

Repeat the smoke test (Step 10) using real accounts against prod.

---

## Phase E — PR and post-merge

### Step 13 — Compose PR

The PR must include the manual verification note required by FR-012 / SC-010 in its description. Use the checklist in `contracts/migration-007.md` "PR verification checklist" as the template. Paste in:
- Phase A SQL output for prod and dev
- Full text of `007_role_system_cleanup.sql`
- Post-007 `pg_policies` dump for prod and dev
- Smoke-test evidence (screenshots or step-by-step confirmation)

### Step 14 — Post-merge docs cleanup

After the PR merges:

1. **`docs/cleanup-roadmap.md`**: Mark Workstream 3 as `✅ Completed`, matching the style of Workstream 1 (line 18). Add the completion date.
2. **`CLAUDE.md` "Database Schema" section**: Remove the `user_roles` mention from "Supporting objects". Update the `get_user_role()` line to clarify it's the only role-lookup helper (the two-arg variant is gone). Update the migrations list to note 007 is the new last migration and that three file-pairs are superseded (with a pointer to `supabase/migrations/README.md`).

These are doc-only commits and can be squashed into the PR or done as a follow-up.
