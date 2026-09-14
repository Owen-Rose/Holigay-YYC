# Implementation Plan: Consolidate Duplicate Vendor Portals

**Branch**: `002-consolidate-vendor-portal` | **Date**: 2026-04-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-consolidate-vendor-portal/spec.md`

## Summary

Delete the parallel `/vendor/*` portal (`src/app/(vendor)/layout.tsx` and `src/app/(vendor)/vendor/page.tsx`) and its server-actions module (`src/lib/actions/vendor-portal.ts`). Migrate three destination references (`src/lib/actions/auth.ts:57`, `src/app/(auth)/login/page.tsx:29`, `src/app/unauthorized/page.tsx:54`) from `/vendor` to `/vendor-dashboard`. Delete the dead export `getVendorApplications(email)` at `src/lib/actions/applications.ts:375` (folded in per cleanup-roadmap step 7). The canonical `/vendor-dashboard/*` route tree and `src/lib/actions/vendor-dashboard.ts` are not modified — prior exploration confirmed zero unique logic in `vendor-portal.ts` that must be ported before deletion.

Downstream propagation: `CLAUDE.md` line 121 (``vendor-dashboard.ts` / `vendor-portal.ts` - vendor-specific data fetching``) references the deleted file and must be patched in the same PR. No constitution amendment required — no principle references either route or module by name.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true` (`tsconfig.json` unchanged).
**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/ssr`, Vitest — all unchanged.
**Storage**: N/A — no schema, RLS, or data changes.
**Testing**: Vitest + jsdom. No new test files; existing suite (`src/test/auth-roles.test.ts`, `src/test/application-form.test.tsx`) is the regression guard.
**Target Platform**: Next.js server runtime (unchanged).
**Project Type**: Web application (Next.js App Router, `src/` monorepo-style).
**Performance Goals**: No change. Fewer files to compile; one fewer server-action module in the bundle.
**Constraints**: Middleware behavior byte-identical to pre-refactor. `vendor-dashboard.ts` function signatures byte-identical to pre-refactor. `auth.ts` response shape unchanged (only the redirect-path string value differs).
**Scale/Scope**: 2 files deleted + 1 file deleted + 1 dead export deleted + 3 one-line string edits + 1 CLAUDE.md line edit. ~5 commits' worth of work in one PR.

### Planning-phase decisions

**Decision 1 — Delete `vendor-portal.ts` entirely; do not keep as a re-export stub.**

Rationale:
- `vendor-portal.ts` has one caller (`src/app/(vendor)/vendor/page.tsx`, line 2 — verified by `grep -rn "vendor-portal" src/`). That caller is also being deleted.
- Agent exploration confirmed zero unique logic: every piece of data returned by `vendor-portal.getVendorDashboardData()` is already covered by the canonical module's split functions (`getVendorDashboardData`, `getVendorProfile`, `getVendorApplicationsList`, `getVendorApplicationDetail` in `vendor-dashboard.ts`).
- A re-export stub (`export { getVendorDashboardData } from './vendor-dashboard'`) would re-create the parallel-API ambiguity this refactor exists to eliminate — and the two `getVendorDashboardData` shapes are mutually incompatible (camelCase/snake_case, `VendorDashboardResponse` vs `VendorDashboardData | null`) so a naive re-export is also impossible.
- Mirrors spec 001 Decision 2 (drop `isOrganizerOrAdmin` entirely, don't re-export).

**Alternatives considered**:
- **Keep `vendor-portal.ts` as a deprecation stub with `@deprecated` JSDoc.** Rejected: CLAUDE.md's guidance (quoted from Claude's operating instructions in this repo: "Don't add features, refactor, or introduce abstractions beyond what the task requires") and Principle I ("half-finished abstractions MUST be removed before merge") both argue against leaving behind a dead stub.
- **Redirect stub at `/vendor` → `/vendor-dashboard` (HTTP 308 or Next.js `redirect()` in a page).** Rejected: roadmap step 1 prescribes "delete entirely"; single-tenant dev-phase app has no public bookmarks; middleware + post-login defaults already deliver every authenticated vendor to the canonical URL.

**Decision 2 — Task ordering: redirect-updates first, then deletions.**

Rationale:
- Updating the three `/vendor` → `/vendor-dashboard` string references (FR-003) in a commit before deletion means every intermediate commit leaves the app functional: during commit 1 both `/vendor` and `/vendor-dashboard` exist, and the new redirects already point at `/vendor-dashboard`; during commit 2 the `/vendor` tree is deleted but no destination reference points at it anymore.
- If we deleted first, commit 1 would break sign-in (post-login redirect targets a 404 for one commit). Even on a branch, this degrades bisectability.
- No additional effort — same number of edits, different order.

**Alternatives considered**:
- **Single atomic commit.** Acceptable but sacrifices bisectability. If the PR squash-merges, the final git log looks identical either way, but the branch itself is easier to debug with the split.

**Decision 3 — Downstream doc propagation: `CLAUDE.md` only, no constitution amendment.**

Rationale:
- Constitution (`.specify/memory/constitution.md`) references neither `/vendor` nor `vendor-portal.ts` by name. Principle I cites `src/lib/actions/` generically and names specific files only as examples. Nothing in the constitution becomes factually wrong after this refactor.
- `CLAUDE.md` line 121 reads: ``vendor-dashboard.ts` / `vendor-portal.ts` - vendor-specific data fetching``. After the refactor, this line references a deleted file. Fix to: ``vendor-dashboard.ts` - vendor-specific data fetching``.
- `docs/cleanup-roadmap.md` is the authoring document for this workstream. Marking Workstream 1 as "Completed" is appropriate but is a post-merge housekeeping edit (like spec 001 did not edit `TASKS.md`). Not in the core PR scope; MAY be included.
- No other markdown or config references either path.

**Alternatives considered**:
- **MINOR constitution amendment re-emphasizing dead-code removal with `vendor-portal.ts` as the example.** Rejected: the constitution's existing "dead exports… MUST be removed before merge" rule (Principle I) already covers this; citing one more example adds no normative force.

**Decision 4 — `vendor-dashboard.ts`'s existing authorization pattern is out of scope.**

Observation:
- `vendor-dashboard.ts` does not use `requireRole()` — it scopes all reads via `auth.getUser()` + `user_profiles.vendor_id`. These are reads-of-your-own-data, not privileged-reads in the role-hierarchy sense, so Principle I's "authorize via `requireRole()`… for any mutation or privileged read" arguably does not apply.
- Whether this pattern merits a constitutional clarification, a wrapper helper, or an inline `requireRole('vendor')` call at the top of each function is a separate question not raised by this refactor.

**Decision**: Do not modify `vendor-dashboard.ts`. Any authorization-pattern review belongs to a follow-up spec (Workstream 2 in cleanup-roadmap touches middleware; a future workstream could revisit vendor-scoped reads).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I — Code Quality & Type Safety (NON-NEGOTIABLE)

| Rule | Status |
|------|--------|
| TypeScript `strict: true` preserved | ✅ PASS — no compiler settings touched |
| No `any` / `@ts-ignore` / `@ts-expect-error` in production code | ✅ PASS — we are deleting code, not adding; surviving code already compliant |
| `src/types/database.ts` not hand-edited | ✅ PASS — N/A (no schema changes) |
| Every server action validates input via Zod before DB call | ✅ PASS — N/A (deleting an action, not adding one; surviving actions unchanged) |
| Every server action authorizes via `requireRole()` at top of body | ✅ PASS — N/A (see Decision 4 note; no pattern change) |
| Server actions return `{ success, error, data }` | ✅ PASS — `vendor-dashboard.ts` already compliant; `auth.ts` deviation is out of scope (spec FR-008) |
| RLS enabled on user-data tables | ✅ PASS — N/A |
| Migrations append-only, numbered | ✅ PASS — N/A |
| CI gates (format → lint → test → build) green | ✅ PASS — target state (FR-010, SC-006) |
| Commented-out code, dead exports removed before merge | ✅ PASS — `getVendorApplications(email)` dead export deleted (FR-007); no commented-out code introduced |

### Principle II — Testing Standards

| Rule | Status |
|------|--------|
| `npm test` passes on PR | ✅ PASS — target state (SC-006) |
| New/modified server action has happy-path + auth-fail test | ✅ PASS — N/A (no new or modified server actions; `getVendorApplications` deletion is a pure subtraction with zero existing coverage and zero callers) |
| Tests use AAA pattern, mock Supabase | ✅ PASS — N/A (no new tests) |
| React Testing Library component test for new/modified forms | ✅ PASS — N/A (no form changes) |
| `@testing-library/user-event` for interaction | ✅ PASS — N/A |

Note on test coverage: `vendor-portal.ts` and `/vendor` page had **zero** test coverage pre-refactor. Their deletion removes dead code, not tested code. Existing tests for preserved functionality (`src/test/auth-roles.test.ts`, `src/test/application-form.test.tsx`) continue to pass unchanged.

### Principle III — User Experience Consistency

| Rule | Status |
|------|--------|
| Tokens via `globals.css`, no inline hex | ✅ PASS — deletions only; no new color or typography introduced |
| Reuses `src/components/ui/` primitives | ✅ PASS — N/A |
| Form aria + `role="alert"` wiring | ✅ PASS — N/A |
| Mutations surface via Sonner toast or `error.tsx` | ✅ PASS — N/A (preserved routes already handle this) |
| `loading.tsx` / `error.tsx` at data-fetching segments | ✅ PASS — canonical `/vendor-dashboard/*` already has these; deleted `/vendor/*` had none to preserve |
| 44×44 px interactive target size | ✅ PASS — N/A |

### Principle IV — Performance Requirements

| Rule | Status |
|------|--------|
| RSC-first; `'use client'` justified | ✅ PASS — no new client files; we are deleting one (`(vendor)/layout.tsx` was `'use client'`) |
| Middleware matcher untouched | ✅ PASS — explicitly out of scope (FR-006) |
| Mutations call `revalidatePath()` | ✅ PASS — N/A (no new mutations; no mutation-inducing file touched) |
| Images via `next/image` | ✅ PASS — N/A |
| Layout-imported deps justified | ✅ PASS — no new deps |
| LCP < 2.5s on `/`, `/login`, `/dashboard` | ✅ PASS — deletion only; performance can only improve (one fewer client layout, one fewer module) |

**Result: ✅ All gates pass.** Refactor strengthens Principle I compliance by eliminating a duplicate-implementation that existed only because of historical drift, and by removing one confirmed dead export. No justified violations. Complexity Tracking section below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-consolidate-vendor-portal/
├── plan.md                        # This file
├── research.md                    # Phase 0 — caller inventory, planning decisions
├── data-model.md                  # Phase 1 — surviving vendor type surface
├── quickstart.md                  # Phase 1 — verification runbook (grep + smoke)
├── contracts/
│   └── vendor-dashboard-module.md # Phase 1 — canonical module public API
├── spec.md                        # From /speckit.specify
└── checklists/
    └── requirements.md            # From /speckit.specify
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (vendor)/                  # DELETED entirely
│   │   ├── layout.tsx             # DELETED: was client 'use client' layout w/ RoleProvider
│   │   └── vendor/
│   │       └── page.tsx           # DELETED: was the only caller of vendor-portal.ts
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx           # EDIT line 29: '/vendor' → '/vendor-dashboard'
│   ├── unauthorized/
│   │   └── page.tsx               # EDIT line 54: href="/vendor" → href="/vendor-dashboard"
│   └── vendor-dashboard/          # UNCHANGED: canonical surface
│       ├── layout.tsx             # UNCHANGED
│       ├── page.tsx               # UNCHANGED
│       ├── applications/
│       │   ├── page.tsx           # UNCHANGED
│       │   └── [id]/page.tsx      # UNCHANGED
│       └── profile/page.tsx       # UNCHANGED
├── lib/
│   ├── actions/
│   │   ├── vendor-portal.ts       # DELETED entirely (229 lines)
│   │   ├── vendor-dashboard.ts    # UNCHANGED: canonical module
│   │   ├── auth.ts                # EDIT line 57: '/vendor' → '/vendor-dashboard'
│   │   └── applications.ts        # EDIT: delete dead getVendorApplications(email) at line 375 (~40 lines)
│   └── context/
│       └── role-context.tsx       # UNCHANGED (still used by dashboard/layout.tsx; RoleProvider cleanup deferred)
└── middleware.ts                  # UNCHANGED: already treats /vendor-dashboard as canonical

CLAUDE.md                          # EDIT line 121: drop "/ vendor-portal.ts" reference (content-match, not line-pinned)
docs/cleanup-roadmap.md            # OPTIONAL: mark Workstream 1 complete (post-merge housekeeping)
```

**Structure Decision**: Existing Next.js App Router layout is retained. The refactor is a pure subtraction (1 directory deleted, 1 module deleted, 1 dead export deleted) plus 3 one-line destination-string updates plus 1 CLAUDE.md doc propagation. No new directories, no new components, no new dependencies, no new test files.

## Complexity Tracking

> Constitution Check passed with zero violations. This section intentionally left empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                              |
