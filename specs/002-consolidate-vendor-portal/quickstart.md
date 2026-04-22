# Quickstart: Verifying the Vendor Portal Consolidation

**Branch**: `002-consolidate-vendor-portal`

This document is the verification runbook for the refactor. Use it during review and before declaring the PR ready to merge. Maps acceptance-criteria sections in `spec.md` (SC-001 … SC-007) to executable checks here.

---

## 1. Automated verification (SC-006)

Run the full CI gate chain locally, in the exact order CI enforces:

```bash
npm run format:check
npm run lint
npm test
npm run build
```

All four MUST pass with zero new warnings or errors compared to `main`. Test output is expected to be numerically identical to pre-refactor (no tests added, no tests removed — only source files that had zero test coverage were deleted).

---

## 2. Grep and filesystem verification (SC-001, SC-002, SC-003)

Each of the following MUST return **zero** matches after the refactor:

```bash
# FR-002 / SC-001: the deleted module has no remaining references
grep -rn "vendor-portal" src/

# FR-003 / SC-002: no remaining '/vendor' destination references
grep -rn "'/vendor'" src/
grep -rn "\"/vendor\"" src/

# FR-007: the dead export is gone
grep -rn "getVendorApplications(" src/ | grep -v "getVendorApplicationsList\|getVendorApplicationDetail"
```

Each of the following filesystem assertions MUST hold (SC-003):

```bash
# (vendor) directory tree must not exist
test ! -d "src/app/(vendor)" && echo "PASS: (vendor) route tree deleted"

# vendor-portal action module must not exist
test ! -f "src/lib/actions/vendor-portal.ts" && echo "PASS: vendor-portal module deleted"
```

Each of the following MUST return at least one match (canonical paths remain in use):

```bash
grep -rn "from '@/lib/actions/vendor-dashboard'" src/
# Expect hits in: vendor-dashboard/page.tsx, vendor-dashboard/applications/page.tsx,
# vendor-dashboard/applications/[id]/page.tsx, vendor-dashboard/profile/page.tsx,
# components/forms/vendor-profile-form.tsx

grep -rn "/vendor-dashboard" src/
# Expect hits in middleware.ts, auth.ts (post-refactor), login/page.tsx (post-refactor),
# unauthorized/page.tsx (post-refactor), and the vendor-dashboard route tree itself
```

---

## 3. Manual smoke test (SC-004, SC-005, SC-007)

Run the dev server and exercise each role path. Use three seeded accounts (vendor, organizer, admin) or the admin-bootstrap flow documented in `CLAUDE.md`.

```bash
npm run dev
```

### Path A — Vendor, all entry points converge on `/vendor-dashboard` (SC-004)

1. **Fresh login**: sign out; visit `/login`; authenticate as a vendor.
   - **Expected**: land on `/vendor-dashboard` (not `/vendor`).
2. **Active session on `/login`**: while signed in as a vendor, visit `/login` directly.
   - **Expected**: middleware redirects to `/vendor-dashboard`.
3. **Deep-link redirect**: sign out; visit `/login?redirectTo=/vendor-dashboard/applications`; authenticate as a vendor.
   - **Expected**: land on `/vendor-dashboard/applications`.
4. **Unauthorized-page link**: (tricky to exercise — `/unauthorized` is shown when the role-mismatch path is hit; easiest: simulate by visiting `/unauthorized` directly while signed in as any role and click the "Go to vendor portal" button).
   - **Expected**: land on `/vendor-dashboard`.
5. **Direct URL to deleted `/vendor`**: visit `/vendor`, `/vendor/applications`, `/vendor/profile`.
   - **Expected**: 404. No server error, no crash.

### Path B — Vendor-dashboard functionality preserved (SC-005)

Sign in as a vendor account with at least one submitted application in each of pending/approved/rejected states.

1. **Dashboard home** (`/vendor-dashboard`):
   - **Expected**: pending/approved/rejected counts render correctly; recent applications list (up to 5) renders with event info; totals match `SELECT COUNT(*) FROM applications WHERE vendor_id = <this vendor>` for the corresponding statuses.
2. **Applications list** (`/vendor-dashboard/applications`):
   - **Expected**: full list renders; status filter tabs (All, Pending, Approved, Rejected, Waitlisted) correctly filter the list; each row links to the detail page.
3. **Application detail** (`/vendor-dashboard/applications/[id]` — click into any application):
   - **Expected**: event info, business info, application details, attachments all render; the "Back to Applications" link returns to `/vendor-dashboard/applications`.
4. **Profile edit** (`/vendor-dashboard/profile`):
   - **Expected**: current profile values pre-fill the form; saving a change persists and the new values display on reload.

### Path C — Spec 001 regression gate (SC-007)

Re-run the three-role smoke from spec 001's `quickstart.md §3`:

1. **Vendor**: cannot reach `/dashboard` (redirects to `/vendor-dashboard`). **Expected**: unchanged behavior.
2. **Organizer**: can reach `/dashboard`; can create/edit events; can update application statuses. **Expected**: unchanged behavior; all actions return `{ success: true }` on authorized calls.
3. **Non-admin (organizer)**: attempting admin-only actions (team invite, admin-page mutations) returns `{ success: false, error: 'Requires admin role or higher' }` (or the pre-refactor equivalent).

---

## 4. Documentation propagation check (Decision 3)

Confirm the following edit was made as part of the PR:

- **`CLAUDE.md`**, the server-action files list (currently line 121; use content match rather than line pin, since `.specify/scripts/bash/update-agent-context.sh` can shift line numbers):
  - Before: ``vendor-dashboard.ts` / `vendor-portal.ts` - vendor-specific data fetching``
  - After: ``vendor-dashboard.ts` - vendor-specific data fetching``

No other markdown files require edits. Specifically:

- `.specify/memory/constitution.md` — no references to vendor portal anywhere; no edit, no amendment.
- `.specify/templates/*.md` — no references; no edit.
- `README.md` — no references; no edit.
- `docs/cleanup-roadmap.md` — Workstream 1 description may optionally be marked "Completed" in a housekeeping edit; not required for PR merge.

---

## 5. Rollback procedure

If any verification fails post-merge:

```bash
git revert <merge-commit-sha>
```

No data migration, no schema migration, no feature flag, no data backfill to unwind. The revert fully restores the two-portal state.

---

## 6. Definition of done

- [ ] All four CI gates pass locally (§1).
- [ ] All grep and filesystem assertions pass (§2).
- [ ] Manual smoke test executed for Paths A, B, C (§3).
- [ ] `CLAUDE.md` line 107 patched (§4).
- [ ] Spec's acceptance criteria SC-001 through SC-007 all verifiable from this checklist.
- [ ] `npm run build` output shows zero new warnings vs. `main`.
- [ ] PR description includes (a) link to `spec.md`, (b) link to `docs/cleanup-roadmap.md` Workstream 1, (c) explicit note that no tests were added because the deleted code had zero pre-refactor coverage.
- [ ] Commit messages reference the spec: `[002-consolidate-vendor-portal]` trailer per constitution §Development Workflow.
