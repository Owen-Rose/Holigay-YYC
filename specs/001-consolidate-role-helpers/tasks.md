---

description: "Task list for consolidating duplicate role-check helpers"
---

# Tasks: Consolidate Duplicate Role-Check Helpers

**Input**: Design documents from `/specs/001-consolidate-role-helpers/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Constitutional Principle II REQUIRES tests for modified server actions. Spec FR-008 and FR-009 mandate a test-file rewrite plus a new hierarchy test. Test tasks are included below.

**Organization**: Grouped by user story. US1 = one canonical module exists, US2 = behavior preserved across callers, US3 = hierarchy path explicitly covered.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Next.js App Router layout. All code under `src/`. Tests under `src/test/`. Docs at repo root and `.specify/memory/`.

---

## Phase 1: Setup (Baseline Verification)

**Purpose**: Confirm pre-refactor baseline so any regression is attributable to the refactor, not pre-existing state.

- [X] T001 Run `npm run format:check && npm run lint && npm test && npm run build` on the current `001-consolidate-role-helpers` branch head to confirm green baseline; if anything fails, stop and resolve before proceeding.
- [X] T002 [P] Spot-check research.md §R1 caller inventory matches the live tree by running `grep -rn "isOrganizerOrAdmin\|from '@/lib/auth/roles'\|from '@/lib/actions/roles'" src/`. Expect approximately 20 matches; treat the per-file breakdown as a sanity reference, not a hard pass/fail gate. As of 2026-04-19 the breakdown is: 1 `isOrganizerOrAdmin` export declaration in `src/lib/auth/roles.ts:52`; 2 `isOrganizerOrAdmin` imports (`events.ts:4`, `applications.ts:11`); 6 `isOrganizerOrAdmin` call sites (`events.ts:93,172,227,270` + `applications.ts:833,973`); 4 other imports of `@/lib/actions/roles` (`role-context.tsx:4`, `team.ts:3`, `admin.ts:11`, `export.ts:4`); 1 test-file import line (`auth-roles.test.ts:2`) and 6 test-file internal references (lines 115, 118, 128, 140, 152, 158). If counts differ materially, reconcile with research.md before proceeding; line-number drift alone is acceptable since later tasks use content matching, not line indexing.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the canonical module. Every user-story task below depends on this.

**⚠️ CRITICAL**: No US1/US2/US3 work can begin until T003 is complete. While Phase 2 is in flight, the tree is temporarily red (`isOrganizerOrAdmin` imports no longer resolve). Phase 3 (US1) MUST land before any `npm test` / `npm run build` run.

- [X] T003 Rewrite `src/lib/auth/roles.ts` as the canonical auth module. Add `'use server'` as line 1 (the current throws-based file at this path does NOT have this directive; it must be added so client components like `role-context.tsx` can continue to invoke these helpers as server actions). Export `getCurrentUserRole(): Promise<RoleResponse>`, `requireRole(minimumRole: Role): Promise<RoleResponse>`, and `type RoleResponse = { success: boolean; error: string | null; data: { role: Role; userId: string } | null }`. Implementation copies the body logic from `src/lib/actions/roles.ts` (including `hasMinimumRole` hierarchy check and `PGRST116`→default-`vendor` handling), with three changes from the source: (a) add `'use server'` as line 1, (b) omit the `isOrganizerOrAdmin` export, (c) omit any `Role` re-export. Import `Role` and `hasMinimumRole` from `@/lib/constants/roles`. Do NOT export `isOrganizerOrAdmin`, do NOT re-export `Role`, do NOT retain the old throws-based signatures. Contract reference: `specs/001-consolidate-role-helpers/contracts/auth-module.md`.

**Checkpoint**: Canonical module exists at `src/lib/auth/roles.ts`. Callers still broken — proceed immediately to Phase 3.

---

## Phase 3: User Story 1 - Unambiguous Auth Helper for New Server Actions (Priority: P1) 🎯 MVP

**Goal**: Exactly one module provides `requireRole` and `getCurrentUserRole`. No caller imports from the deprecated path. `isOrganizerOrAdmin` is removed from the codebase.

**Independent Test**: Run `grep -rn "from '@/lib/actions/roles'" src/` and `grep -rn "isOrganizerOrAdmin" src/` — both return zero matches. `test ! -f src/lib/actions/roles.ts` passes. `grep -rn "from '@/lib/auth/roles'" src/` returns matches in ≥7 files.

### Implementation for User Story 1

- [X] T004 [P] [US1] Migrate `src/lib/actions/events.ts`: change import on line 4 from `import { isOrganizerOrAdmin } from '@/lib/auth/roles'` to `import { requireRole } from '@/lib/auth/roles'`. At lines 93, 172, 227, and 270 (verify by content match — the Edit tool keys on the `if (!(await isOrganizerOrAdmin())) {` pattern, not line index) replace the pattern `if (!(await isOrganizerOrAdmin())) { return { success: false, error: 'Unauthorized: insufficient role' } }` with `const auth = await requireRole('organizer'); if (!auth.success) { return { success: false, error: auth.error ?? 'Unauthorized: insufficient role' } }`. Preserve the existing return type at each call site (some return `{ success, error, id? }`, others `{ success, error }`).
- [X] T005 [P] [US1] Migrate `src/lib/actions/applications.ts`: change import on line 11 from `import { isOrganizerOrAdmin } from '@/lib/auth/roles'` to `import { requireRole } from '@/lib/auth/roles'`. At lines 833 and 973 (verify by content match as in T004) apply the same guard transformation as T004, preserving the original `UpdateApplicationResponse` and sibling response shapes.
- [X] T006 [P] [US1] Update import path in `src/lib/actions/team.ts` line 3 from `@/lib/actions/roles` to `@/lib/auth/roles`. Do not touch the body — `requireRole('admin')` semantics are unchanged.
- [X] T007 [P] [US1] Update import path in `src/lib/actions/export.ts` line 4 from `@/lib/actions/roles` to `@/lib/auth/roles`. Do not touch the body.
- [X] T008 [P] [US1] Update import path in `src/lib/actions/admin.ts` line 11 from `@/lib/actions/roles` to `@/lib/auth/roles`. Do not touch the two `requireRole('admin')` call sites at lines 65 and 136.
- [X] T009 [P] [US1] Update import path in `src/lib/context/role-context.tsx` line 4 from `@/lib/actions/roles` to `@/lib/auth/roles`. `'use client'` directive and component body remain unchanged; the two `await getCurrentUserRole()` calls continue to consume the `RoleResponse` shape.
- [X] T010 [US1] Delete `src/lib/actions/roles.ts`. Depends on T006, T007, T008, T009 completing (those files imported from it).
- [X] T011 [US1] Run grep verification from `specs/001-consolidate-role-helpers/quickstart.md` §2. All four commands must show the expected result (zero matches for old paths/helper/file, ≥7 matches for new path). Fix any stragglers before the checkpoint.

**Checkpoint**: User Story 1 delivered. Build may still be red (test file unchanged). Proceed to US2 without running `npm test` until T012 lands.

---

## Phase 4: User Story 2 - Role Enforcement Preserved Across Callers (Priority: P1)

**Goal**: Every previously-protected action still rejects the same roles. No action becomes permissive or crashes. All CI gates return to green.

**Independent Test**: `npm test` passes with 100% of pre-refactor tests green (updated to new signatures). `npm run build` and `npm run lint` complete with zero new warnings. Smoke-test paths A–D from `quickstart.md` §3 all behave as specified.

### Implementation for User Story 2

- [X] T012 [US2] Rewrite `src/test/auth-roles.test.ts` to match the canonical module's signatures. (a) Change import line 2 to `import { getCurrentUserRole, requireRole, type RoleResponse } from '@/lib/auth/roles'`. (b) Update the `getCurrentUserRole` suite to assert `RoleResponse` shape — e.g., unauthenticated returns `{ success: false, error: 'Not authenticated', data: null }`; authenticated returns `{ success: true, error: null, data: { role: 'organizer', userId: 'user-123' } }`; missing profile (PGRST116 error code) returns `{ success: true, data: { role: 'vendor', ... } }` per the response-based default. (c) Update the `requireRole` suite: change calls from array form `requireRole(['organizer', 'admin'])` to single-role form `requireRole('organizer')`, and change assertions from `.rejects.toThrow(...)` to `.resolves.toMatchObject({ success: false, error: ... })`. (d) Delete the `isOrganizerOrAdmin` describe block (lines 118–160) — its coverage is absorbed by the US3 hierarchy tests added in T017. Preserve the existing Supabase mocking harness (`mockGetUser`, `mockSelect`, `mockEq`, `mockSingle`) unchanged.
- [X] T013 [US2] Run `npm test`. All rewritten tests green. If failures, diagnose and fix — do NOT relax assertions to make them pass.
- [X] T014 [US2] Run `npm run build`. Zero new TypeScript errors or warnings compared to pre-refactor `main`. Depends on T013 (tests first, so if types are wrong the failure surfaces with line numbers).
- [X] T015 [US2] Run `npm run lint` and `npm run format:check`. Zero new lint or formatting issues.
- [X] T016 [US2] Execute manual smoke test per `quickstart.md` §3 Paths A (vendor), B (organizer), C (admin), D (unauthenticated). Each step's expected outcome must match observed behavior. Record any anomaly in the PR description before proceeding to US3.

**Checkpoint**: User Stories 1 AND 2 complete. Build, lint, tests all green. Behavior byte-identical to pre-refactor on the manual smoke paths.

---

## Phase 5: User Story 3 - Hierarchy Semantic Explicitly Tested (Priority: P2)

**Goal**: The role hierarchy substitution (allow-list → minimum-role) is proven by tests, not assumed.

**Independent Test**: `src/test/auth-roles.test.ts` contains a dedicated `describe` block (or appended cases) asserting: admin satisfies `requireRole('organizer')`, organizer satisfies `requireRole('organizer')`, vendor fails `requireRole('organizer')`, organizer fails `requireRole('admin')`. `npm test` passes.

### Implementation for User Story 3

- [X] T017 [US3] Add a `describe('requireRole hierarchy', ...)` block to `src/test/auth-roles.test.ts` with four cases following the existing AAA/mock pattern: (1) `admin` role mocked → `requireRole('organizer')` resolves to `{ success: true, data: { role: 'admin', userId: 'user-123' } }`; (2) `organizer` role mocked → `requireRole('organizer')` resolves to `{ success: true, data: { role: 'organizer', ... } }`; (3) `vendor` role mocked → `requireRole('organizer')` resolves to `{ success: false, error: 'Requires organizer role or higher', data: null }`; (4) `organizer` role mocked → `requireRole('admin')` resolves to `{ success: false, error: 'Requires admin role or higher', data: null }`. Use the same `mockGetUser` + `mockSingle` harness as the rest of the file.
- [X] T018 [US3] Run `npm test`. All hierarchy cases green; no other tests regress. This satisfies SC-003.

**Checkpoint**: All three user stories complete. Functional refactor is done. Only documentation propagation remains.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Propagate the refactor to governance and operational docs. Run the final acceptance gates.

- [X] T019 Update `CLAUDE.md` line 99: change `Server actions in \`src/lib/actions/\` validate role with \`requireRole()\` or \`isOrganizerOrAdmin()\` before mutations` to `Server actions in \`src/lib/actions/\` validate role with \`requireRole()\` before mutations`.
- [X] T020 Update `CLAUDE.md` line 200: change `\`src/lib/auth/roles.ts\` - \`getCurrentUserRole()\`, \`requireRole()\`, \`isOrganizerOrAdmin()\`` to `\`src/lib/auth/roles.ts\` - \`getCurrentUserRole()\`, \`requireRole()\``. Run sequentially after T019 to avoid Edit-tool collisions on the same file.
- [X] T021 Patch `.specify/memory/constitution.md` (PATCH amendment 1.0.0 → 1.0.1): (a) line 66: replace `Authorize via \`requireRole()\` / \`isOrganizerOrAdmin()\` (\`src/lib/auth/roles.ts\`)` with `Authorize via \`requireRole()\` (\`src/lib/auth/roles.ts\`)`; (b) line 198: replace `\`requireRole()\` / \`isOrganizerOrAdmin()\` guard` with `\`requireRole()\` guard`; (c) bump version footer `Version: 1.0.0` → `Version: 1.0.1`; (d) bump `Last Amended: 2026-04-18` → `Last Amended: <date the PR is merged, ISO YYYY-MM-DD>` (leave `Ratified` unchanged); if executing T021 same-day as PR merge, use today's date — otherwise update at merge time per constitution governance §Amendments; (e) update the Sync Impact Report HTML comment at the top of the file with a new amendment entry documenting the `isOrganizerOrAdmin` removal, naming the rationale (helper deleted in PR for feature 001-consolidate-role-helpers), and the classification (PATCH per research.md §R4). Use the same structure as the existing 2026-04-18 entry: a Version-change line with bump rationale, then Modified/Added/Removed sections, Templates-requiring-updates, Deferred items, and Acknowledged pre-existing violations as applicable. Do NOT edit any other constitution sections.
- [X] T022 Run the final CI gate chain locally: `npm run format:check && npm run lint && npm test && npm run build`. All four must be green. This is the hard gate before the PR is opened. This is a final pre-PR gate that includes the documentation changes from T019–T021; it is not a duplicate of T013–T015 (which were the post-functional-refactor signal before docs landed).
- [X] T023 Re-run `quickstart.md` §2 grep verification one more time to confirm no regression from docs edits. All four commands produce expected results.
- [X] T024 Walk through `quickstart.md` §6 Definition of Done checklist. Every item checked. If any item is unchecked, diagnose and repair before opening the PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001–T002)**: No dependencies. Run first.
- **Foundational (T003)**: Depends on T001–T002.
- **US1 (T004–T011)**: All depend on T003. Within US1, T004–T009 are [P] against each other. T010 depends on T006+T007+T008+T009. T011 depends on T004+T005+T010.
- **US2 (T012–T016)**: T012 depends on T003 (needs the new module surface). T013 depends on T012 AND T004+T005+T010 (the full caller migration so tests have a working app to test against). T014/T015 depend on T013. T016 depends on T014+T015.
- **US3 (T017–T018)**: T017 depends on T012. T018 depends on T017.
- **Polish (T019–T024)**: T019 and T020 both edit `CLAUDE.md` and run sequentially (T020 after T019) to avoid Edit-tool collisions. Both are independent of US1–US3 (docs only). T021 is independent. T022 depends on T019+T020+T021 (so doc edits are covered by the format/lint run). T023/T024 depend on T022.

### User Story Dependencies

- **US1 is the MVP**: Delivering T003–T011 alone produces a codebase where exactly one canonical module exists. Build/tests will be red until US2 lands — but the grep-based independent test for US1 passes.
- **US2 depends on US1**: You cannot migrate tests to the new signatures until the new module exports those signatures and all callers use them. But US2's full acceptance (green `npm test`) is where build goes green again.
- **US3 depends on US2**: Adds to the same test file T012 rewrites. If T017 is attempted before T012, the file is in a transient state that makes diffs confusing.

### Parallel Opportunities

- **T001 and T002** can run concurrently.
- **T004 through T009** are all [P] — six independent file edits. An AI agent should batch these in a single message with six tool calls.
- **T019 and T020** both edit `CLAUDE.md`. Run sequentially (not [P]) to avoid Edit-tool collisions on the same file.
- Within each test task (T012, T017), edits are sequential (one file, multiple sections).

---

## Parallel Example: User Story 1

```bash
# After T003 lands, launch these six caller migrations in parallel:
Task: "T004 Migrate src/lib/actions/events.ts — 4 isOrganizerOrAdmin call sites"
Task: "T005 Migrate src/lib/actions/applications.ts — 2 isOrganizerOrAdmin call sites"
Task: "T006 Update import path in src/lib/actions/team.ts"
Task: "T007 Update import path in src/lib/actions/export.ts"
Task: "T008 Update import path in src/lib/actions/admin.ts"
Task: "T009 Update import path in src/lib/context/role-context.tsx"
```

---

## Implementation Strategy

### MVP First (US1 only — "one canonical module exists")

1. Complete Phase 1: Setup (T001–T002).
2. Complete Phase 2: Foundational (T003).
3. Complete Phase 3: User Story 1 (T004–T011).
4. **STOP and VALIDATE**: Run `grep -rn "from '@/lib/actions/roles'" src/` and `grep -rn "isOrganizerOrAdmin" src/` — both zero. Confirm SC-001.
5. Note: build/tests are red until US2. For this specific refactor, MVP is a structural milestone, not a shippable state.

### Incremental Delivery

1. Phase 1 + Phase 2 → foundation laid.
2. US1 → structural consolidation done (SC-001).
3. US2 → green build + green tests + green smoke test (SC-002, SC-004, SC-005).
4. US3 → hierarchy path explicitly covered (SC-003).
5. Polish → docs and constitution aligned (SC-006). All gates pass (SC-004).

### Single-Committer Strategy (This Project)

One developer (or one AI agent in one session) executes Phase 1 → Phase 6 sequentially, batching [P] tasks into parallel tool calls where possible. No team parallelism required — the refactor is small enough that a single focused pass is the most efficient path. PR submitted after T024 passes.

---

## Notes

- [P] tasks = different files, no mutual dependencies.
- [Story] label maps tasks to spec user stories for traceability.
- The test file (`src/test/auth-roles.test.ts`) is touched twice: once in T012 (US2, signature rewrite) and once in T017 (US3, hierarchy cases appended). T017 MUST run after T012 completes.
- `TASKS.md` at the repo root is intentionally NOT edited by this refactor — its references to `isOrganizerOrAdmin()` are historical completed-task records (Epic 2.1), not forward-looking guidance. Editing them would rewrite history.
- `src/middleware.ts` is NOT edited. Out of scope per spec and plan.
- Commit cadence: a sensible split is two commits — one for the functional refactor (T003–T018) and one for doc/governance propagation (T019–T021). Alternatively, a single commit is fine given the scope. Use the task ID in the commit trailer per CLAUDE.md convention, e.g., `refactor(auth): consolidate role-check helpers [001-consolidate-role-helpers]`.
