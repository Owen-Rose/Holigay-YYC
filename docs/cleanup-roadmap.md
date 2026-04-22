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

- **Scope:** small (three fixes, ~30 LOC + tests)
- **Recommended execution:** single PR, no spec (or a tiny spec 004 if paper trail feels important)
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

- **Scope:** large (schema semantics, append-only migration, prod audit needed)
- **Recommended execution:** spec-kit (spec 003)
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

Document the answers in `specs/003-<slug>/research.md`. The consolidation plan depends on this.

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

## Recommended sequencing

1. **Workstream 1 — vendor portal consolidation** first. Biggest leverage; all subsequent feature work benefits. Fold in opportunistic cleanups above.
2. **Workstream 2 — hardening pass** next. Small diff, high safety return. Pairs naturally with tests the constitution already requires.
3. **Workstream 3 — migration cleanup** last. Requires a Supabase session for the audit; don't block other work on it.

---

## References

- **Constitution:** `.specify/memory/constitution.md` (Principles I, III are the ones these findings touch)
- **Spec-kit templates:** `.specify/templates/` (spec-template.md, plan-template.md, tasks-template.md)
- **Prior spec as reference:** `specs/001-consolidate-role-helpers/` — closest structural analog to Workstream 1
- **Project guide:** `CLAUDE.md` — especially the "Task Workflow" section
