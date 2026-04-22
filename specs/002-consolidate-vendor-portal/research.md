# Phase 0 Research: Consolidate Duplicate Vendor Portals

**Date**: 2026-04-21
**Branch**: `002-consolidate-vendor-portal`

No external research required — this is an internal Next.js refactor. The "research" here is an exhaustive caller inventory and the resolution of the four planning-phase decisions enumerated in `plan.md`.

---

## R1 — Caller inventory (authoritative deletion surface)

### Callers of `src/lib/actions/vendor-portal.ts`

| File | Line | Symbol | Change |
|------|------|--------|--------|
| `src/app/(vendor)/vendor/page.tsx` | 2 | `import { getVendorDashboardData } from '@/lib/actions/vendor-portal'` | Resolved by deletion of the file itself |

**Total consumers**: 1 (and also being deleted). `grep -rn "vendor-portal" src/` returns exactly this one match.

### Destination references to `/vendor` as a path

| File | Line | Context | Change |
|------|------|---------|--------|
| `src/lib/actions/auth.ts` | 57 | `let redirectTo = '/vendor'; // Default to vendor portal` | `'/vendor'` → `'/vendor-dashboard'` |
| `src/app/(auth)/login/page.tsx` | 29 | `const redirectTo = explicitRedirect \|\| result.redirectTo \|\| '/vendor';` | `'/vendor'` → `'/vendor-dashboard'` |
| `src/app/unauthorized/page.tsx` | 54 | `<Link href="/vendor" ...>` (the "Go to vendor portal" button) | `"/vendor"` → `"/vendor-dashboard"` |
| `src/app/(vendor)/layout.tsx` | 30 | `{ name: 'Home', href: '/vendor', icon: HomeIcon }` in nav array | Resolved by layout deletion |
| `src/app/(vendor)/layout.tsx` | 137 | `item.href === '/vendor' ? pathname === '/vendor' : pathname.startsWith(item.href)` | Resolved by layout deletion |
| `src/app/(vendor)/vendor/page.tsx` | 64 | `href="/vendor/applications"` | Resolved by page deletion |
| `src/app/(vendor)/vendor/page.tsx` | 80 | `href="/vendor/applications"` | Resolved by page deletion |

**Must-edit destinations**: 3 (first three rows). **Resolved-by-deletion**: 4 (last four rows).

### Dead-export cleanup (roadmap step 7 fold-in)

| File | Line | Symbol | Change |
|------|------|--------|--------|
| `src/lib/actions/applications.ts` | 375–~410 | `export async function getVendorApplications(email: string)` | Deleted in full (function body ~40 lines). Verified zero callers via `grep -rn "getVendorApplications" src/` — only matches are the definition itself and the distinct `getVendorApplicationsList` in `vendor-dashboard.ts`. |

### Non-src references

| File | Line | Reference | Change |
|------|------|-----------|--------|
| `CLAUDE.md` | 121 | ``vendor-dashboard.ts` / `vendor-portal.ts` - vendor-specific data fetching`` | Patch to drop the `vendor-portal.ts` half. After: ``vendor-dashboard.ts` - vendor-specific data fetching``. Implementers should use content-match rather than line number; `.specify/scripts/bash/update-agent-context.sh` may shift line numbers by appending at the bottom of the file. |
| `docs/cleanup-roadmap.md` | 16–78 | Workstream 1 description | **Optional post-merge housekeeping.** Could be marked as completed in a follow-up commit or left untouched; the file is a roadmap, not a live tracker. Spec 001 did not backfill its analogous reference. |
| `.specify/memory/constitution.md` | — | No references to `/vendor`, `/vendor-dashboard`, `vendor-portal.ts`, or `vendor-dashboard.ts` | No edit required. |
| `.specify/templates/*` | — | No references | No edit required. |
| `README.md` | — | Does not reference either route | No edit required. |
| `src/test/*.test.ts` | — | No test covers `vendor-portal.ts` or the `/vendor` route | No edit required. Zero coverage pre-refactor means zero coverage to preserve. |

---

## R2 — Decision: delete `vendor-portal.ts` entirely

**Decision**: Delete the file. Do not leave behind a re-export stub or `@deprecated` wrapper.

**Rationale**:
1. **Zero unique logic.** `vendor-portal.getVendorDashboardData()` bundles four data queries (user, vendor profile, applications list, counts) into one camelCase response. `vendor-dashboard.ts` splits those into four dedicated functions (`getVendorDashboardData`, `getVendorProfile`, `getVendorApplicationsList`, `getVendorApplicationDetail`) that the `/vendor-dashboard/*` pages already consume. Nothing about the `vendor-portal` bundle is irrecoverable from the split API.
2. **Single caller, also deleted.** The only caller is `src/app/(vendor)/vendor/page.tsx`, which is part of the directory being deleted. After deletion, zero orphan imports exist.
3. **Return-shape incompatibility forecloses a naive re-export.** `vendor-portal.VendorDashboardResponse` is `{ success, error, data: { user, vendor, applications, counts } | null }` (camelCase, full vendor profile embedded). `vendor-dashboard.VendorDashboardData` is `{ counts, recentApplications } | null` (snake_case, minimal, no embedded profile). These are not aliases for the same shape; no `export { … } from './vendor-dashboard'` line preserves callers.
4. **Matches spec 001 precedent.** Spec 001 Decision 2 rejected "keep `isOrganizerOrAdmin` as a thin wrapper" for the same ambiguity-preservation reason. Leaving a deprecation stub would replay the original sin this refactor exists to end.

**Alternatives considered**:
- **Re-export stub (`export { getVendorDashboardData } from './vendor-dashboard'`).** Rejected per point 3 (shape incompatibility) and point 4 (ambiguity revival).
- **`@deprecated` wrapper transforming `VendorDashboardData | null` → `VendorDashboardResponse`.** Rejected: writing a shim to preserve a caller that is being deleted in the same PR is pure cost.

---

## R3 — Decision: task ordering — redirects first, deletion second

**Decision**: Within the PR, update the three destination-string references in a first commit, then delete the `/vendor` tree and `vendor-portal.ts` in a second commit.

**Rationale**:
1. **Every intermediate state is functional.** After commit 1, both `/vendor` and `/vendor-dashboard` exist; every sign-in path points at `/vendor-dashboard`. After commit 2, `/vendor` is gone; every sign-in path still points at `/vendor-dashboard`. No commit in between produces a 404 on sign-in.
2. **Bisectability.** If a regression is introduced by the refactor, `git bisect` can distinguish "broke when we changed the redirects" from "broke when we deleted the tree".
3. **Zero additional effort.** Same number of edits, different order. No rebase or re-test cost.

**Alternatives considered**:
- **Single squash commit.** Works fine for the final merged history but degrades the branch's own bisectability. Not preferred but acceptable.
- **Deletion first, then redirect updates.** Rejected: commit 1 would break sign-in (post-login redirect targets a non-existent URL for the span of one commit).

---

## R4 — Decision: downstream doc propagation — `CLAUDE.md` only

**Decision**: Patch `CLAUDE.md` (currently line 121; content-match preferred over line pin) in the same PR. No constitutional amendment; `docs/cleanup-roadmap.md` is optional post-merge housekeeping.

**Rationale**:
1. **Constitution scan is clean.** `grep -n "vendor" .specify/memory/constitution.md` returns zero matches. Principle I names example action files generically (`events.ts`, `applications.ts`) but does not name `vendor-portal.ts` or `vendor-dashboard.ts`. Removing `vendor-portal.ts` makes no constitutional line factually wrong.
2. **CLAUDE.md is operational doc, not governance.** Line 121 lists server-action files. After deletion, it references a deleted file. The fix is a one-token edit (drop "/ `vendor-portal.ts`").
3. **Cleanup-roadmap is a planning doc, not a live tracker.** Like `TASKS.md` (which spec 001 deliberately did not edit), marking Workstream 1 "complete" is bookkeeping, not correctness. MAY be included in the PR or deferred.
4. **No README, templates, or CI references.** Verified by grep.

**Alternatives considered**:
- **Skip `CLAUDE.md` edit, defer to next PR.** Rejected: governance rule in `.specify/memory/constitution.md` (§Governance, Amendments) says "Propagate any downstream edits required in `.specify/templates/*.md`, `CLAUDE.md`, or `README.md`" in the same PR as the change. The CLAUDE.md line becomes factually wrong the moment `vendor-portal.ts` is deleted.
- **MINOR constitution amendment re-emphasizing dead-code removal.** Rejected: the existing rule ("Commented-out code, dead exports, and half-finished abstractions MUST be removed before merge") already covers this case. Adding another example adds no normative force.

---

## R5 — Decision: scope guard for `vendor-dashboard.ts` authorization pattern

**Observation**: `vendor-dashboard.ts` does not call `requireRole()`. It scopes data via `auth.getUser()` + `user_profiles.vendor_id`, returning typed error discriminants (`'not_authenticated'`, `'no_vendor_profile'`, `'not_found'`, `'fetch_failed'`). Principle I (Code Quality) requires `requireRole()` "for any mutation or privileged read". A vendor reading their own applications is arguably not a privileged read — it's ownership-scoped, closer to RLS territory.

**Decision**: Do not modify `vendor-dashboard.ts` in this refactor. Any clarification or restructuring of the "ownership-scoped reads need what guard?" question belongs to a separate spec.

**Rationale**:
1. The refactor's scope is deletion of duplicates, not re-authorization of survivors.
2. Changing `vendor-dashboard.ts` would require migrating every consumer page (4 pages: dashboard home, applications list, application detail, profile edit) and potentially adding Vitest coverage per Principle II — a much larger footprint than the refactor warrants.
3. Workstream 2 (hardening pass in cleanup-roadmap) touches middleware and email; it is a more natural venue to revisit authorization conventions.

**Alternatives considered**:
- **Add `requireRole('vendor')` calls at the top of each `vendor-dashboard.ts` function in this PR.** Rejected: scope creep. Compliant with an arguably-clearer reading of Principle I but not required by the refactor's own acceptance criteria.

---

## R6 — Risks and mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A caller of `vendor-portal.ts` is missed | Very low | Grep inventory (R1) is exhaustive; confirmed single caller; FR-004 grep invariant locks post-refactor state |
| A destination reference to `/vendor` is missed | Low | Grep inventory (R1) enumerated all 7 sites (3 must-update + 4 resolved-by-deletion); FR-004 / SC-002 re-verify post-refactor |
| Middleware regression (vendor redirected to a non-existent route) | Very low | Middleware's `/dashboard` → `/vendor-dashboard` redirect is unchanged; middleware does not reference `/vendor` anywhere (verified by grep) |
| `auth.ts`'s `signIn` response-shape change inadvertently introduced | Low | FR-008 explicitly forbids shape changes; only the string value inside `redirectTo` changes |
| Deleting `getVendorApplications(email)` breaks a caller | Very low | Grep inventory confirms zero callers in `src/` |
| `CLAUDE.md` server-action-files line forgotten | Low | Explicit plan item (R4); pre-merge doc-propagation check in `quickstart.md` §4 |
| Typo in the replacement string (`/vendor-dashbaord`, etc.) | Very low | `npm run build` + manual smoke would catch a 404 immediately; grep verification in quickstart.md §2 looks for zero `/vendor'` hits after the edit |
| `loading.tsx` or `error.tsx` under `(vendor)/` is missed | N/A | Confirmed by `ls` that `(vendor)/` only contains `layout.tsx` and `vendor/page.tsx`; no orphan files |

---

**Output confirmation**: Zero `NEEDS CLARIFICATION` markers. All planning-phase decisions resolved. Ready for Phase 1.
