# Quickstart: Verifying the Role-Helper Consolidation

**Branch**: `001-consolidate-role-helpers`

This document is the verification runbook for the refactor. Use it during review and before declaring the PR ready to merge.

---

## 1. Automated verification

Run the full CI gate chain locally:

```bash
npm run format:check
npm run lint
npm test
npm run build
```

All four MUST pass with zero new warnings or errors compared to `main`.

**Expected test output** (key lines from `src/test/auth-roles.test.ts`):

- `getCurrentUserRole` — at least three cases: unauthenticated, authenticated-with-role, missing-profile-defaults-to-vendor.
- `requireRole` hierarchy — at least three cases:
  - `admin` satisfies `requireRole('organizer')` → `success: true`.
  - `organizer` satisfies `requireRole('organizer')` → `success: true`.
  - `vendor` fails `requireRole('organizer')` → `success: false`.
  - `organizer` fails `requireRole('admin')` → `success: false`.
- `requireRole` auth failure — unauthenticated returns `{ success: false, error: 'Not authenticated', data: null }` (no throw).

---

## 2. Grep verification (acceptance criteria SC-001)

Each command MUST return **zero** matches after the refactor:

```bash
# Old import path (to-be-deleted module)
grep -r "from '@/lib/actions/roles'" src/

# Old helper that should be fully removed
grep -rn "isOrganizerOrAdmin" src/

# Old file path should not exist
test ! -f src/lib/actions/roles.ts && echo "PASS: old file deleted"
```

Each command MUST return **at least one** match (the canonical import path is in use):

```bash
grep -r "from '@/lib/auth/roles'" src/
```

Expected matches (minimum 7 files): `events.ts`, `applications.ts`, `team.ts`, `export.ts`, `admin.ts`, `role-context.tsx`, `auth-roles.test.ts`.

---

## 3. Manual smoke test (acceptance criteria SC-005)

Run the dev server and test each role path. Use three seeded accounts (vendor, organizer, admin) or the admin-bootstrap flow in `CLAUDE.md`.

```bash
npm run dev
```

### Path A — Vendor

1. Sign in as a vendor account.
2. Navigate to `/dashboard`.
   - **Expected**: redirect to `/vendor-dashboard` (middleware behavior, unchanged).
3. Attempt to submit any application-status update via the vendor dashboard UI (if exposed).
   - **Expected**: unauthorized response. No 500. No client-side crash. Toast/error surface matches pre-refactor behavior.

### Path B — Organizer

1. Sign in as an organizer account.
2. Navigate to `/dashboard` — loads successfully.
3. Navigate to `/dashboard/events/new` — create a test event.
   - **Expected**: event creates. Server action returns `{ success: true }`.
4. Navigate to `/dashboard/applications/[id]` — update an application status.
   - **Expected**: status updates. Email fires (or logs). Toast confirms.
5. Navigate to `/dashboard/team`.
   - **Expected**: redirect away (admin-only). Middleware behavior unchanged.

### Path C — Admin

1. Sign in as an admin account.
2. All organizer paths succeed (inherits via hierarchy).
3. Navigate to `/dashboard/team` — loads successfully.
4. Trigger an admin-only action (e.g., role change, admin page mutation).
   - **Expected**: success.
5. Sign in as an organizer (not admin) and attempt the same admin-only action via the API.
   - **Expected**: `{ success: false, error: 'Requires admin role or higher' }` or pre-refactor equivalent. No crash.

### Path D — Unauthenticated

1. Sign out.
2. Navigate to `/dashboard`, `/vendor-dashboard`, any protected route.
   - **Expected**: redirect to `/login?redirectTo=...`. Middleware behavior unchanged.
3. (Optional) Invoke a protected server action via the browser console against the RPC endpoint.
   - **Expected**: `{ success: false, error: 'Not authenticated' }`. No crash.

---

## 4. Documentation propagation check

Confirm the following edits were made as part of the PR:

- `.specify/memory/constitution.md`
  - Version footer: `1.0.0` → `1.0.1`.
  - `Last Amended`: `2026-04-18` → date the PR is merged (ISO YYYY-MM-DD).
  - `Ratified`: unchanged.
  - Sync Impact Report (top of file) updated with the amendment entry.
  - Line 66 (Principle I): `requireRole() / isOrganizerOrAdmin()` → `requireRole()`.
  - Line 198 (PR checklist): same edit.
- `CLAUDE.md`
  - Line 99: "validate role with `requireRole()` or `isOrganizerOrAdmin()`" → "validate role with `requireRole()`".
  - Line 200: auth helpers line lists only `getCurrentUserRole()` and `requireRole()`.
- `TASKS.md`
  - **No edits.** Historical task records are append-only. A new Story/Task for this refactor is added only if the user requests it; otherwise the PR title + commit trailer is the record.

---

## 5. Rollback procedure

If any verification fails in production post-merge:

```bash
git revert <merge-commit-sha>
```

No data, migration, or feature-flag cleanup required. The revert fully restores the two-module state.

---

## 6. Definition of done

- [ ] All four CI gates pass locally (§1).
- [ ] All grep checks pass (§2).
- [ ] Smoke test executed for Paths A–D (§3).
- [ ] Documentation propagated (§4).
- [ ] Spec's acceptance criteria SC-001 through SC-006 all verifiable from this checklist.
- [ ] `npm run build` output shows zero new warnings vs. `main`.
- [ ] Code review completed with explicit sign-off on the constitutional amendment classification (PATCH, not MINOR).
