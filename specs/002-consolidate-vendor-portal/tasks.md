---

description: "Task list for consolidating duplicate vendor portals"
---

# Tasks: Consolidate Duplicate Vendor Portals

**Input**: Design documents from `/specs/002-consolidate-vendor-portal/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: This refactor deletes code with zero pre-refactor test coverage (spec.md Assumptions; plan.md Principle II check). **No new tests are required.** The existing Vitest suite (`src/test/auth-roles.test.ts`, `src/test/application-form.test.tsx`) is the regression guard.

**Organization**: Grouped by user story. US1 = exactly one vendor portal exists in the codebase; US2 = every vendor entry point lands on the canonical URL; US3 = all previously-working vendor functionality continues to work.

**Phase ordering note**: The spec presents User Story 1 (delete parallel implementation) first, but this tasks file executes User Story 2 (update redirect destinations) first — per `research.md` §R3 Decision 2. Redirects-first keeps every intermediate branch state functional: after the US2 commit, both `/vendor` and `/vendor-dashboard` exist and every sign-in path targets the canonical URL; after the US1 commit, the `/vendor` tree is deleted with no orphan redirects pointing at it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Next.js App Router layout. All code under `src/`. Tests under `src/test/`. Docs at repo root and `.specify/memory/`. Project instructions at `CLAUDE.md` (repo root).

---

## Phase 1: Setup (Baseline Verification)

**Purpose**: Confirm pre-refactor baseline so any regression is attributable to the refactor, not pre-existing state.

- [X] T001 Run `npm run format:check && npm run lint && npm test && npm run build` on the current `002-consolidate-vendor-portal` branch head to confirm a green baseline. If any gate is red before starting, stop and resolve before proceeding — a mid-refactor failure must be attributable to this refactor, not inherited state.
- [X] T002 [P] Spot-check `research.md` §R1 caller inventory against the live tree. Run: (a) `grep -rn "vendor-portal" src/` — expect 1 match at `src/app/(vendor)/vendor/page.tsx:2`; (b) `grep -rn "'/vendor'" src/` — expect 4 matches across `src/lib/actions/auth.ts:57`, `src/app/(auth)/login/page.tsx:29`, and `src/app/(vendor)/layout.tsx:30,137`; (c) `grep -rn "\"/vendor\"" src/` — expect 1 match at `src/app/unauthorized/page.tsx:54`; (d) `grep -rn "getVendorApplications(" src/ | grep -v "getVendorApplicationsList\|getVendorApplicationDetail"` — expect 1 match at `src/lib/actions/applications.ts:375`. If counts differ materially, reconcile with `research.md` §R1 before proceeding. Line-number drift alone is acceptable — later tasks use content matching, not line indexing.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No foundational work is required for this refactor. The canonical module (`src/lib/actions/vendor-dashboard.ts`) and canonical route tree (`src/app/vendor-dashboard/`) already exist and are not modified by this work. User-story phases can begin immediately after Phase 1.

---

## Phase 3: User Story 2 - Every Vendor Entry Point Lands on the Canonical URL (Priority: P1) 🎯

**Goal**: Every sign-in redirect, login-form fallback, and cross-link that previously pointed vendors at `/vendor` now points at `/vendor-dashboard`.

**Independent Test**: After T003–T005 complete, every destination string outside the `(vendor)/` subtree targets the canonical URL. Verifiable by: (1) `grep -rn "'/vendor'" src/` shows zero matches in `auth.ts`, `login/page.tsx`; (2) `grep -rn "\"/vendor\"" src/` shows zero matches in `unauthorized/page.tsx`; (3) signing in as a vendor during this transient state (with the `(vendor)/` tree still present but orphaned) reaches `/vendor-dashboard` on every path (fresh login, active-session `/login` visit, unauthorized-page link click). The residual `(vendor)/layout.tsx:30,137` matches remain until US1 deletes the tree.

### Implementation for User Story 2

- [X] T003 [P] [US2] Update the post-login redirect default in `src/lib/actions/auth.ts` at line 57 (content match: `let redirectTo = '/vendor'; // Default to vendor portal`). Change to: `let redirectTo = '/vendor-dashboard'; // Default to vendor dashboard`. Do NOT modify the function signature, the `signIn` response shape (`{ error, success, redirectTo }`), or any other logic in this file — FR-008 declares the response shape invariant for this refactor.
- [X] T004 [P] [US2] Update the login-form fallback in `src/app/(auth)/login/page.tsx` at line 29 (content match: `const redirectTo = explicitRedirect || result.redirectTo || '/vendor';`). Change the trailing fallback from `'/vendor'` to `'/vendor-dashboard'`. Also update the explanatory comment on line 26–27 so the phrase "fallback to /vendor" reads "fallback to /vendor-dashboard" — keep the rest of the comment unchanged.
- [X] T005 [P] [US2] Update the unauthorized-page link in `src/app/unauthorized/page.tsx` at line 54 (content match: `href="/vendor"`). Change to `href="/vendor-dashboard"`. Do NOT modify the button text ("Go to vendor portal") or the surrounding comment on line 52 — the destination is still semantically the vendor portal, just at the canonical URL. Preserve all Tailwind class names on line 55 verbatim.

**Checkpoint**: User Story 2 delivered. Every signed-in vendor now reaches `/vendor-dashboard` on every entry path. The `(vendor)/*` route tree is still present but orphaned (nothing routes there automatically). Proceed to User Story 1 to delete it.

---

## Phase 4: User Story 1 - Exactly One Vendor Portal Exists in the Codebase (Priority: P1)

**Goal**: The duplicate `src/app/(vendor)/` route tree and `src/lib/actions/vendor-portal.ts` module are deleted. The dead `getVendorApplications(email)` export at `applications.ts:375` is removed. `CLAUDE.md` is patched to stop referencing the deleted file.

**Independent Test**: After T006–T011 complete: `grep -rn "vendor-portal" src/` → zero matches; `grep -rn "'/vendor'" src/` → zero matches (the `(vendor)/layout.tsx` hits that remained after US2 are now resolved by deletion); `test ! -d "src/app/(vendor)"` AND `test ! -f "src/lib/actions/vendor-portal.ts"` both pass; `grep -rn "getVendorApplications(" src/` returns only matches for the distinct `getVendorApplicationsList` and `getVendorApplicationDetail` functions in `vendor-dashboard.ts`.

### Implementation for User Story 1

- [X] T006 [P] [US1] Delete `src/app/(vendor)/layout.tsx` entirely. This removes the parallel client-layout (`'use client'` directive, `RoleProvider` wrapper, teal color scheme, and the `/vendor`-targeted nav array). Verify with `test ! -f "src/app/(vendor)/layout.tsx"`.
- [X] T007 [P] [US1] Delete `src/app/(vendor)/vendor/page.tsx` entirely. This is the only caller of `src/lib/actions/vendor-portal.ts` (import at line 2 — confirmed by T002 grep). Verify with `test ! -f "src/app/(vendor)/vendor/page.tsx"`.
- [X] T008 [P] [US1] Delete `src/lib/actions/vendor-portal.ts` entirely (229 lines). After T007 deletes the only caller, this file has zero references in `src/`. Verify with `test ! -f "src/lib/actions/vendor-portal.ts"`. Note: parallelizable with T006/T007 because the deletions are independent file operations; if the implementer deletes in strict T006 → T007 → T008 order the result is identical.
- [X] T009 [P] [US1] Delete the dead export `getVendorApplications(email: string)` from `src/lib/actions/applications.ts`. The export starts at line 375 (content match: the JSDoc block beginning `/** * Fetches applications for a specific vendor by email` just above, followed by `export async function getVendorApplications(email: string) {`) and extends through the function's closing `}`. Delete both the JSDoc and the function body together (~40 lines total). Preserve every other export in the file untouched — this is a surgical dead-code removal. Verify with `grep -n "getVendorApplications(" src/lib/actions/applications.ts` returning zero matches.
- [X] T010 [P] [US1] Patch `CLAUDE.md`: locate the line in the "Server action files" list that reads ``- `vendor-dashboard.ts` / `vendor-portal.ts` - vendor-specific data fetching`` (content match — currently at line 121; the `.specify/scripts/bash/update-agent-context.sh` script run during `/speckit.plan` may shift line numbers). Replace with ``- `vendor-dashboard.ts` - vendor-specific data fetching``. No other `CLAUDE.md` edits are required by this refactor. Per governance in `.specify/memory/constitution.md` §Governance, downstream doc propagation lands in the same PR as the change.
- [X] T011 [US1] Run `quickstart.md` §2 grep and filesystem verification. All of the following must pass: (1) `grep -rn "vendor-portal" src/` → zero matches; (2) `grep -rn "'/vendor'" src/` → zero matches; (3) `grep -rn "\"/vendor\"" src/` → zero matches (excluding incidental `/vendor-dashboard` hits, which is why the quote boundaries matter); (4) `grep -rn "getVendorApplications(" src/ | grep -v "getVendorApplicationsList\|getVendorApplicationDetail"` → zero matches; (5) `test ! -d "src/app/(vendor)"` passes; (6) `test ! -f "src/lib/actions/vendor-portal.ts"` passes; (7) `grep -rn "from '@/lib/actions/vendor-dashboard'" src/` returns non-zero matches (the canonical import path is still in use). Depends on T006–T010 all completing.

**Checkpoint**: User Stories 1 AND 2 delivered. The functional refactor is done — exactly one vendor portal exists, and every entry point targets the canonical URL. Proceed to US3 to verify preserved functionality.

---

## Phase 5: User Story 3 - All Previously-Working Vendor Functionality Continues to Work (Priority: P2)

**Goal**: The four pages under `/vendor-dashboard/*` (home, applications list, application detail, profile edit) render and behave identically to pre-refactor. Middleware behavior and spec 001's three-role smoke-test continue to pass.

**Independent Test**: Execute `quickstart.md` §3 Paths A, B, C. Each expected outcome matches observed behavior. `npm run build` and `npm test` both complete green with zero new warnings vs. the T001 baseline.

### Implementation for User Story 3

- [X] T012 [US3] Run the CI gate chain: `npm run lint && npm test && npm run build`. (Note: required `rm -rf .next/` first — stale Next.js type-validator referenced the deleted `/vendor` route; clean rebuild succeeded with 19 routes vs. 20 pre-refactor.) All three must be green with zero new warnings or errors vs. the Phase 1 baseline (T001). A lint or type error here typically indicates an orphan import or a stale type reference to the deleted `vendor-portal.ts`. If a failure appears, diagnose root cause; do NOT relax assertions or skip tests to make them green.
- [ ] T013 [US3] Execute `quickstart.md` §3 Path A (vendor entry-point convergence smoke). Five sub-scenarios: (1) fresh login as a vendor → lands on `/vendor-dashboard`; (2) active vendor session visits `/login` directly → middleware redirects to `/vendor-dashboard`; (3) sign out, visit `/login?redirectTo=/vendor-dashboard/applications`, authenticate → lands on `/vendor-dashboard/applications`; (4) visit `/unauthorized` while signed in, click the "Go to vendor portal" button → lands on `/vendor-dashboard`; (5) visit `/vendor`, `/vendor/applications`, `/vendor/profile` directly → each returns 404 (no crash, no server error). Record any anomaly in the PR description; do not proceed until all five behave as specified.
- [ ] T014 [US3] Execute `quickstart.md` §3 Path B (preserved `/vendor-dashboard/*` functionality). Requires a vendor account linked to a vendor row with at least one submitted application in each of pending/approved/rejected status. Verify: (1) `/vendor-dashboard` shows correct counts and the five most-recent applications; (2) `/vendor-dashboard/applications` lists every application and the status filter tabs (All, Pending, Approved, Rejected, Waitlisted) correctly filter; (3) clicking into any application opens `/vendor-dashboard/applications/[id]` with event info, business info, application details, and attachments all rendering; (4) `/vendor-dashboard/profile` pre-fills the form with current values and a save persists and re-renders with the new values. Data values render identically to pre-refactor.
- [ ] T015 [US3] Execute `quickstart.md` §3 Path C (spec 001 regression gate, covers SC-007). Verify the three-role surface: (1) vendor cannot reach `/dashboard` (middleware redirects to `/vendor-dashboard`); (2) organizer can reach `/dashboard`, can create an event via `/dashboard/events/new`, can update an application status — all return `{ success: true }`; (3) organizer (not admin) attempting admin-only actions (e.g., `/dashboard/team` page, admin-page mutations) returns `{ success: false, error: 'Requires admin role or higher' }` or the pre-refactor equivalent. Confirms the auth-surface has not regressed.

**Checkpoint**: All three user stories delivered. All acceptance criteria SC-001 through SC-007 satisfied. Proceed to Polish for final PR prep.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final pre-PR gate and housekeeping.

- [X] T016 Run the final CI gate chain locally one more time, in the exact order CI enforces: `npm run format:check && npm run lint && npm test && npm run build`. All four must be green. This is the hard gate before the PR is opened. This run is not redundant with T012 because (a) it includes `format:check` (T012 did not), and (b) it runs after the `CLAUDE.md` doc propagation in T010 has landed — a formatter/linter could catch a markdown or stray-whitespace issue in the doc edit.
- [ ] T017 Walk through `quickstart.md` §6 Definition of Done checklist. Every item checked. If any item is unchecked, diagnose and repair before opening the PR.
- [X] T018 (Optional housekeeping) Update `docs/cleanup-roadmap.md` Workstream 1 heading (currently at line 16) with a status line such as `**Status**: Completed 2026-MM-DD (spec 002)`. Not required for PR merge per `research.md` §R4 Decision 3; include only if it fits the commit scope naturally (no separate commit needed).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001–T002)**: No dependencies.
- **Foundational**: No tasks — canonical module and canonical route tree already exist.
- **US2 (T003–T005)**: All [P] against each other (three independent files). All depend on Phase 1 (baseline confirmation).
- **US1 (T006–T011)**:
  - T006, T007, T008, T009, T010 are all [P] against each other (five independent file/export operations across different paths).
  - T011 depends on T006 + T007 + T008 + T009 + T010 (final grep invariant check).
  - Entire phase depends on US2 completing — per `research.md` §R3 Decision 2, redirects land before deletions for branch bisectability. (Note: the deletion phase and redirect phase could land in either order without breaking the final state; the ordering choice optimizes the *intermediate* branch states only.)
- **US3 (T012–T015)**: T012 depends on all of US1 + US2 (can't run test suite cleanly until the refactor is complete). T013–T015 depend on T012. Smoke-test paths can be interleaved by a single agent but each step within a path is sequential (one browser session).
- **Polish (T016–T018)**: T016 depends on US1 + US2 + US3 (every code/doc change must be in before the final gate). T017 depends on T016. T018 is independent but most naturally bundled with T016/T017.

### User Story Dependencies

- **US2 first, then US1** (see phase-ordering note at top). Rationale: post-US2 commit, sign-in redirects already point at `/vendor-dashboard` — safe even though `(vendor)/*` still exists; post-US1 commit, the `/vendor` tree is deleted with no stale redirects pointing at it. Every intermediate branch state is functional, making `git bisect` useful if a regression appears later.
- **US1 is the MVP-completion marker** — once the deletions land, the codebase-level outcome ("exactly one vendor portal exists") is achieved. This refactor's MVP is US1 + US2 *together*; US2 alone leaves dead code, and US1 alone breaks sign-in.
- **US3 depends on US1 + US2** — you cannot smoke-test "every entry point → canonical URL" until US2 lands, and you cannot smoke-test "deleted URLs return 404" until US1 lands.

### Parallel Opportunities

- **T001 and T002** can run concurrently (one runs CI gates, the other runs greps).
- **T003, T004, T005** — three independent file edits. Batch in a single message with three tool calls.
- **T006, T007, T008, T009, T010** — five independent file/doc edits. Batch in a single message with five tool calls. T011 must follow all five.
- **T013, T014, T015** — each is a manual browser walk-through; sequential for a single operator, parallelizable across a team.

---

## Parallel Example: User Story 2

```bash
# All three redirect updates are independent — batch them in one tool-call round:
Task: "T003 Update redirect default in src/lib/actions/auth.ts:57"
Task: "T004 Update login fallback in src/app/(auth)/login/page.tsx:29"
Task: "T005 Update link href in src/app/unauthorized/page.tsx:54"
```

## Parallel Example: User Story 1 (deletions)

```bash
# Five independent deletions/edits, batched in one tool-call round after US2 completes:
Task: "T006 Delete src/app/(vendor)/layout.tsx"
Task: "T007 Delete src/app/(vendor)/vendor/page.tsx"
Task: "T008 Delete src/lib/actions/vendor-portal.ts"
Task: "T009 Delete dead getVendorApplications(email) export in src/lib/actions/applications.ts"
Task: "T010 Patch CLAUDE.md line that references vendor-portal.ts"

# T011 (grep verification) runs after all five complete.
```

---

## Implementation Strategy

### MVP = US1 + US2 together (both P1)

For this refactor, User Stories 1 and 2 together form the MVP. Neither ships alone: US2 alone leaves dead code in `(vendor)/*` and `vendor-portal.ts`; US1 alone breaks sign-in (post-login redirect targets a 404). Land both in one PR with US3 verification before merge.

1. Complete Phase 1: Setup baseline (T001–T002).
2. Complete Phase 3: US2 redirects (T003–T005) — low-risk string updates first for bisectability.
3. Complete Phase 4: US1 deletions + dead-export + doc patch (T006–T011).
4. Complete Phase 5: US3 verification smoke (T012–T015).
5. Complete Phase 6: Polish (T016–T017), optional T018.
6. Open PR.

### Incremental Delivery (Commit Cadence)

Suggested commit split (per `research.md` §R3):

- **Commit 1** — `refactor(vendor-portal): redirect /vendor → /vendor-dashboard [002-consolidate-vendor-portal]` (covers T003–T005).
- **Commit 2** — `refactor(vendor-portal): delete parallel route tree, actions module, and dead export [002-consolidate-vendor-portal]` (covers T006–T011).
- **Commit 3 (optional)** — `docs: mark cleanup-roadmap Workstream 1 complete [002-consolidate-vendor-portal]` (covers T018).

Alternatively: squash all into one commit per project convention. The PR's merge commit message gets the `[002-consolidate-vendor-portal]` trailer per constitution §Development Workflow.

### Single-Committer Strategy (This Project)

One developer (or one AI agent in one session) executes Phase 1 → Phase 6 sequentially, batching [P] tasks into parallel tool calls. No team parallelism required — this refactor is small enough (eighteen tasks, mostly file deletions and three string edits) that a single focused session is the most efficient path. PR submitted after T017 passes.

---

## Notes

- **[P] tasks** = different files/paths, no mutual dependencies. Batchable in a single tool-call round.
- **[Story] labels** map tasks to spec user stories for traceability.
- **No new tests added.** `vendor-portal.ts`, `(vendor)/layout.tsx`, `(vendor)/vendor/page.tsx`, and `getVendorApplications(email)` all have zero pre-refactor coverage; their deletion is a pure subtraction with no coverage to preserve. The existing Vitest suite (`src/test/auth-roles.test.ts`, `src/test/application-form.test.tsx`) is the regression guard per `plan.md` Principle II check and spec `Assumptions`.
- **`src/lib/actions/vendor-dashboard.ts` is not modified** — its authorization pattern (scope via `user_profiles.vendor_id` instead of `requireRole()`) is out of scope per `research.md` §R5 and spec FR-005.
- **`src/middleware.ts` is not modified** — middleware already treats `/vendor-dashboard` as canonical (protected route, post-login target) and has no `/vendor` references (verified by grep). Spec FR-006 and plan Decision 4 lock this.
- **`src/lib/context/role-context.tsx` is not modified** — `RoleProvider`/`useRole` cleanup is a deferred follow-up per `research.md` §R2 and spec Assumptions. After the `(vendor)/layout.tsx` deletion lands, `RoleProvider` still has one consumer (`dashboard/layout.tsx` + `RoleBadge`), which is sufficient to keep it.
- **`auth.ts` response shape is not modified** — only the `redirectTo` string default value changes (`/vendor` → `/vendor-dashboard`). Full `{ success, error, data }` normalization of `signIn`/`signUp`/`signOut` is deferred per spec FR-008.
- **Commit trailer**: `[002-consolidate-vendor-portal]` per constitution §Development Workflow and spec 001 precedent.
