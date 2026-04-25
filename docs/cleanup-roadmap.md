# Pre-feature Cleanup Roadmap

**Created:** 2026-04-21, after `001-consolidate-role-helpers` landed. Captures cleanup work to complete before resuming feature development.

## How to use this document

Each workstream below is self-contained. To execute one:

- **If marked "spec-kit":** open this doc in a fresh session and ask Claude to scaffold `specs/NNN-<slug>/` (spec.md, plan.md, tasks.md) from the relevant section. Follow the project's spec-kit workflow per `CLAUDE.md` → "Task Workflow".
- **If marked "single PR":** branch off `main`, implement, run `npm run lint && npm test && npm run build`, open PR. No spec-kit ceremony.

Workstreams are listed in the recommended sequence.

---

## Workstream 1 — Vendor portal consolidation

- **Status:** ✅ Completed 2026-04-21 (see `specs/002-consolidate-vendor-portal/`)
- **Scope:** medium (multi-file refactor, user-visible)
- **Recommended execution:** spec-kit (spec 002)
- **Constitutional relevance:** Principle I (dead code), Principle III (consistency)

### Problem

The app has **two parallel vendor portals** that diverged:

| | `/vendor-dashboard/*` (canonical per CLAUDE.md) | `/vendor/*` (route group `(vendor)`) |
|---|---|---|
| Route dir | `src/app/vendor-dashboard/` | `src/app/(vendor)/vendor/` |
| Layout | `src/app/vendor-dashboard/layout.tsx` | `src/app/(vendor)/layout.tsx` |
| Data loader | `getVendorDashboardData()` in `src/lib/actions/vendor-dashboard.ts:40` — returns `VendorDashboardData \| null`, snake_case | `getVendorDashboardData()` in `src/lib/actions/vendor-portal.ts:88` — returns `VendorDashboardResponse`, camelCase |
| Nav hrefs | `/vendor-dashboard`, `/vendor-dashboard/applications`, `/vendor-dashboard/profile` | `/vendor`, `/vendor/applications`, `/vendor/profile` |

A vendor's actual URL depends on how they arrive:
- `src/middleware.ts:81,92` — redirects vendors to `/vendor-dashboard`
- `src/lib/actions/auth.ts:57` — post-login default is `/vendor`
- `src/app/(auth)/login/page.tsx:29` — falls back to `/vendor`
- `src/app/unauthorized/page.tsx:54` — links to `/vendor`

**Why it matters:** two `getVendorDashboardData` functions with different return types means TypeScript can't catch a cross-wired import; any new vendor-facing feature has to be built in two places; the "wrong" surface drifts stale.

### Canonical decision

Keep **`/vendor-dashboard/*`**. Rationale: middleware already treats it as canonical, CLAUDE.md documents it, and it has the richer set of pages.

### Fix steps

1. Delete `src/app/(vendor)/` entirely (the layout and every page under it).
2. Delete `src/lib/actions/vendor-portal.ts`.
3. Update post-login redirect in `src/lib/actions/auth.ts:57` → `/vendor-dashboard`.
4. Update fallback in `src/app/(auth)/login/page.tsx:29` → `/vendor-dashboard`.
5. Update `src/app/unauthorized/page.tsx:54` link → `/vendor-dashboard`.
6. Grep for remaining `/vendor'` hrefs and `vendor-portal` imports; remove.
7. **Fold in the following opportunistic cleanups while you're in the files:**
   - Delete dead export `getVendorApplications(email)` at `src/lib/actions/applications.ts:375` (grep confirms zero callers).
   - Normalize any server-action return shapes that don't match `{ success, error, data }` in files you touch (Principle I requirement).
   - Consider whether `RoleProvider`/`useRole` is still worth keeping — deleting `(vendor)/layout.tsx` removes one of its two call sites. The remaining use is `dashboard/layout.tsx:20,30` plus `RoleBadge`. If the remaining value feels thin, replace with a server-layout prop; otherwise leave it.

### Acceptance criteria

- Only one vendor portal exists in the codebase.
- `grep -r "vendor-portal" src/` → zero matches.
- `grep -r "/vendor'" src/` → only the URL-path string comparisons that remain legitimate (all nav hrefs point to `/vendor-dashboard`).
- Signing in as a vendor lands on `/vendor-dashboard`, regardless of entry point (fresh login, unauthorized link, direct URL).
- All existing vendor-side functionality (dashboard home, applications list, application detail, profile edit) still works.
- `npm run lint && npm test && npm run build` all green.
- Spec 001's smoke-test scenarios still pass (vendor can't reach `/dashboard`; organizer can; non-admin can't reach admin pages).

### Verification

- Unit / integration tests for any action signatures that changed.
- Manual smoke test across all three role paths.
- Live visual check of each vendor-dashboard subpage.

### Risks to watch

- Server-action signatures may differ between the two modules; callers you're preserving must receive the right shape after the merge.
- Type aliases (`VendorDashboardData`, `VendorDashboardResponse`, `VendorApplication`) may be imported from both files. Keep the `vendor-dashboard.ts` versions; update imports.

---

## Workstream 2 — Hardening: silent-failure fixes (middleware + email)

- **Status:** ✅ Completed 2026-04-24 (PR #3)
- **Scope:** small (three fixes, ~30 LOC + tests)
- **Recommended execution:** single PR, no spec
- **Constitutional relevance:** Principle III — "Silent successes are not permitted"

Three closely related defects — all are silent failures in high-stakes paths. Bundle them in one hardening PR.

### 2a — Middleware silently demotes role on DB errors

**File:** `src/middleware.ts:65-73`

```ts
const { data: profile } = await supabase
  .from('user_profiles')
  .select('role')
  .eq('id', user.id)
  .single();
role = profile?.role ?? 'vendor';
```

If `.single()` errors (timeout, transient 5xx, RLS denial), `profile` is null and `role` defaults to `'vendor'`. An organizer or admin with a transient DB issue gets bounced from `/dashboard` to `/vendor-dashboard` with no signal.

**Fix:** inspect the `error` return from the query. On error, either (a) render an error page, or (b) fail closed to `/login`. Either is acceptable; (a) is more honest, (b) is simpler.

**Tests:** mock the Supabase client to return an error; assert middleware redirects to the error/login path, not `/vendor-dashboard`.

### 2b — Email client returns `success: true` when `RESEND_API_KEY` is missing in production

**File:** `src/lib/email/client.ts:26-38, 125-141`

`getResendClient()` has no `NODE_ENV` guard. If the env var is missing or misconfigured in prod, every `sendEmail` call logs-and-pretends-to-succeed, returning `{ success: true, messageId: 'dev-...' }`.

**Fix:** in `getResendClient()`, throw (or return null + have `sendEmail` return `{ success: false }`) when `NODE_ENV === 'production'` and the key is missing. Keep the dev-log fallback otherwise.

**Tests:** two unit tests — one with `NODE_ENV=production` + no key asserting failure; one in dev mode asserting the dev log path still works.

### 2c — Application actions swallow email failures

**File:** `src/lib/actions/applications.ts` — `submitApplication`, `updateApplicationStatus`

Both call `sendEmail`, log on failure, and return overall `success: true` anyway. Combined with 2b, a prod misconfig means vendors get success toasts for applications whose confirmations never arrive.

**Fix:** when `sendEmail` returns failure, include a `warning` field in the action response (e.g., `{ success: true, warning: 'Application saved but email delivery failed.' }`) and surface it via Sonner toast in the client callers. The DB write succeeded, so `success: true` is still correct — but the warning is mandatory.

If you want retry rigor, add an `email_failures` table with retry marker — that's a bigger scope and should be its own spec.

**Tests:** mock `sendEmail` to return failure; assert the action's response includes `warning` and the DB insert/update still succeeded.

### Acceptance criteria for Workstream 2

- Middleware surfaces or fails-closed on DB error; no silent vendor-demotion path remains.
- Email client refuses to fake-succeed in production.
- Application submit / status-update responses include a warning field when email fails; the client surfaces it via toast.
- Unit tests for each of the three fixes.
- Constitution Principle III PR checklist item passes.

---

## Workstream 3 — Migration cleanup + RLS audit

- **Status:** ✅ Completed 2026-04-25 — delivered as spec 004 (PR #4)
- **Scope:** large (schema semantics, append-only migration, prod audit needed)
- **Recommended execution:** spec-kit (delivered as `specs/004-consolidate-role-migrations/`)
- **Constitutional relevance:** Principle I (migrations MUST be append-only; RLS MUST be enabled)

### Problem

`supabase/migrations/` has four pairs of duplicate-numbered files. Some are legitimate ("I didn't want to edit an applied migration, so I shipped a successor"); several are the remains of an abandoned alternate role-design that was never deleted.

```
003_user_profiles.sql     ← ACTIVE. user_profiles + user_role enum + no-arg get_user_role() → user_role
003_user_roles.sql        ← header says "DO NOT RUN YET"; alternate user_roles table + user_has_role()
004_user_roles_rls.sql    ← RLS for the alternate user_roles table
004_vendors_user_link.sql ← ACTIVE. adds vendors.user_id + links
005_rbac_rls_policies.sql ← ACTIVE. uses no-arg get_user_role()
005_users_with_roles_view.sql ← JOINs user_roles (the alternate table)
006_rbac_rls_updates.sql  ← Drops/recreates policies using user_has_role() — only defined in the "DO NOT RUN" 003 file
006_users_with_roles_view.sql ← ACTIVE. JOINs user_profiles (the right table)
```

**The subtle bug in 006:** every policy in `006_rbac_rls_updates.sql:19-107` calls `user_has_role(auth.uid(), 'organizer')`, which is defined only in `003_user_roles.sql`. Files run alphabetically, so the "DO NOT RUN" comment is ignored and 003_user_roles.sql runs before 006 and provides the function. But `user_has_role` reads from `user_roles`, which the app never writes to (the app writes to `user_profiles`). So 006's organizer-gated RLS policies effectively deny writes to everyone; the app only keeps working because application-layer `requireRole()` guards bypass the need for DB-layer enforcement, and/or older 005 policies still allow the writes.

**Why it matters:** schema state in prod vs. the repo's apparent intent are desynced. A fresh `supabase db reset` in dev or CI produces a schema where 006 silently denies writes. Any future migration that assumes "RLS enforces role at the DB" starts from a false premise.

### Phase A — Investigation (read-only, ~30 min interactive)

Before writing any migration, run this against prod and dev Supabase SQL editor:

```sql
-- Which role tables exist?
SELECT tablename FROM pg_tables WHERE schemaname='public';

-- Which role helper functions exist, and what are their signatures?
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE proname IN ('get_user_role', 'user_has_role');

-- Which RLS policies are actually in force?
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public'
ORDER BY tablename, policyname;

-- Is user_roles actually populated?
SELECT COUNT(*) FROM user_roles;
```

Document the answers in `specs/004-consolidate-role-migrations/research.md`. The consolidation plan depends on this.

### Phase B — Consolidation migration

Create `007_role_system_cleanup.sql` that:

1. `DROP POLICY` every policy in `pg_policies` that uses `user_has_role` or reads from `user_roles`.
2. Recreate those policies using the canonical `get_user_role()` from `003_user_profiles.sql` — the pattern used in `005_rbac_rls_policies.sql`, e.g. `get_user_role() IN ('organizer', 'admin')`.
3. `DROP FUNCTION user_has_role(UUID, TEXT)` and `DROP FUNCTION get_user_role(UUID)` (the `user_roles`-reading version).
4. `DROP TABLE IF EXISTS user_roles CASCADE` (only if Phase A confirms it's empty).
5. Regenerate `src/types/database.ts` via `npm run db:types` / `db:types:dev`.

### Repo cleanup (cosmetic)

After the migration runs, the three dead files in `supabase/migrations/` can be deleted: `003_user_roles.sql`, `004_user_roles_rls.sql`, `005_users_with_roles_view.sql`.

**Caveat:** constitution says migrations are append-only. If you want to be strict, leave the files and add a `README.md` in `supabase/migrations/` marking them as superseded by 007. The database side is the same either way.

### Acceptance criteria

- `supabase db reset` on a fresh local DB applies all migrations cleanly.
- `pg_policies` shows every write policy using `get_user_role()` with the enum; no references to `user_has_role`.
- Organizer can create/edit/delete events via the app; vendor cannot.
- `npm run db:types:dev && git diff` on `src/types/database.ts` shows only legitimate changes.

### Risks to watch

- Prod RLS changes are irreversible once applied. Run the audit queries first; back up by exporting the `pg_policies` result before the migration.
- If prod has diverged from the repo (policies you don't have a migration for), the cleanup migration must account for them — don't `DROP POLICY` blindly; enumerate first.

---

## Workstream 4 — Local `supabase db reset` fix (queued)

- **Status:** Queued. Surfaced during spec 004 Phase A; deferred from that spec to keep its scope narrow.
- **Scope:** small (filesystem reorganization only; no schema or app changes)
- **Recommended execution:** single PR, no spec
- **Constitutional relevance:** Principle I intent (preserve files, just relocate so they don't run on fresh `db reset`)

### Problem

`supabase start` and `supabase db reset` against the current migration set fail because the Supabase CLI extracts the leading numeric prefix as the `schema_migrations.version` primary key, and the repo has four duplicate-prefix pairs (`003_*`, `004_*`, `005_*`, `006_*`). The CLI errors on the first duplicate.

```
Applying migration 003_user_profiles.sql...
Applying migration 003_user_roles.sql...
ERROR: duplicate key value violates unique constraint "schema_migrations_pkey"
Key (version)=(003) already exists.
```

The remote envs are unaffected — they apply migrations via the dashboard SQL editor, which doesn't enforce the same uniqueness at apply time. The constraint only bites local fresh bootstrap.

### Fix

Move the four superseded files into `supabase/migrations/_superseded/` so the CLI ignores them on reset. Files preserved per FR-011 (intent of Constitution Principle I); local `db reset` succeeds; remote envs unchanged.

Files to move:
- `supabase/migrations/003_user_roles.sql`
- `supabase/migrations/004_user_roles_rls.sql`
- `supabase/migrations/005_users_with_roles_view.sql`
- `supabase/migrations/006_rbac_rls_updates.sql` (its 8 policies are dropped by 007 anyway, so it's functionally dead post-007)

Update `supabase/migrations/README.md` to point to the new location.

### Acceptance criteria

- `supabase start` followed by `supabase db reset` against a fresh local Supabase exits 0 with zero SQL errors.
- The post-reset `pg_policies` matches dev's post-007 state (24 canonical policies on main tables).
- Remote envs are not touched.

### Reference

`specs/004-consolidate-role-migrations/research.md` §R2-C documents the original discovery.

---

## Workstream 5 — Drop `user_roles` table (queued)

- **Status:** Queued. Spec 004 deferred the table drop because prod has 1 row (verified safe to discard).
- **Scope:** small (one new migration file + types regen)
- **Recommended execution:** single PR or lightweight spec 005 if paper trail feels important
- **Constitutional relevance:** Principle I (append-only)

### Problem

After spec 004, prod still has the `user_roles` table with one stale admin row (the user's own bootstrap account, also present in `user_profiles` with the same `admin` role). The 2 surviving policies on the table (`Users can view own role`, `Users can insert own role`) are dead code — no app code reads from `user_roles`.

The repo's `src/types/database.ts` is currently generated from dev (which has no `user_roles`), so it doesn't reflect prod's residual schema. After this workstream, prod and dev schemas converge and types can be safely regenerated from prod.

### Fix

1. Ship `supabase/migrations/008_drop_user_roles.sql`:
   ```sql
   DROP TABLE IF EXISTS public.user_roles CASCADE;
   ```
   The `CASCADE` drops the 2 surviving policies on the table along with it.
2. Apply to prod via dashboard SQL editor (dev is already a no-op).
3. Run `npm run db:types:dev && npm run db:types`. Both should now produce identical output. Commit `src/types/database.ts`.
4. Update `supabase/migrations/README.md` to reflect that `user_roles` is now gone everywhere.

### Acceptance criteria

- Prod and dev `pg_tables` for `schemaname = 'public'` return identical 5-row lists (no `user_roles`).
- `git diff src/types/database.ts` after running both type-regen scripts shows zero output (both envs produce the same types).
- Smoke test: organizer/vendor flows continue to work post-drop (dropping the table can't break what wasn't reading from it, but the constitution wants the manual check anyway).

### Reference

`specs/004-consolidate-role-migrations/research.md` §R2-B documents the deferral, the cross-check confirming the row is safe to discard, and the timeline.

---

## Opportunistic cleanups (fold into other PRs, no spec needed)

These are too small to stand alone but are constitutional violations or light debt. Fix them in any PR that touches the relevant file.

- **Response-shape drift.** `auth.ts` returns `{ error, success, redirectTo }`; `vendors.ts` returns `{ success, error }` without `data`. Constitution Principle I says all server actions return `{ success, error, data }`. Normalize opportunistically.
- **Dead export.** `getVendorApplications(email)` at `src/lib/actions/applications.ts:375` has zero callers. Delete when next in the file (Workstream 1 is a natural moment).
- **`RoleProvider` indirection.** After Workstream 1, only `dashboard/layout.tsx` uses it. Consider replacing with a server-layout prop; low priority.

---

## Skipped (below the bar, revisit if symptoms appear)

- **Attachment orphaning:** `submitApplication` uploads files before DB insert; on failed insert, files are orphaned in Storage. Slow quota drain, low frequency.
- **Unchecked `as Role` cast:** `src/lib/actions/admin.ts:103` casts without Zod validation. Defensive nicety; no current caller hits a corrupt value.
- **Test coverage gaps:** `updateEventStatus`, `updateUserRole` self-demotion guard, middleware role fallback are all untested. Pair new tests with the workstream that touches each file — Workstream 2's middleware test handles one; new application-action tests in Workstream 1/2 handle others.

---

## Sequencing

Workstreams 1–3 shipped in order over 2026-04-21 → 2026-04-25 (PRs #2/#3/#4). Workstreams 4 and 5 are queued and independent — pick either when you next have a Supabase session free, or fold them into adjacent feature PRs that touch `supabase/migrations/` or `src/types/database.ts` anyway.

---

## References

- **Constitution:** `.specify/memory/constitution.md` (Principles I, III are the ones these findings touch)
- **Spec-kit templates:** `.specify/templates/` (spec-template.md, plan-template.md, tasks-template.md)
- **Prior spec as reference:** `specs/001-consolidate-role-helpers/` — closest structural analog to Workstream 1
- **Project guide:** `CLAUDE.md` — especially the "Task Workflow" section
