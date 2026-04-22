# Feature Specification: Consolidate Duplicate Role-Check Helpers

**Feature Branch**: `001-consolidate-role-helpers`
**Created**: 2026-04-19
**Status**: Draft
**Input**: User description: "Refactor: Consolidate duplicate role-check helpers into a single auth module."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unambiguous auth helper for new server actions (Priority: P1)

A developer (or AI assistant) writing a new role-gated server action opens the codebase and finds exactly one place to import role-check helpers. The import is obvious, the return contract is consistent with every other server action in the project (response object with `success`, `error`, `data`), and no try/catch is required to handle denial.

**Why this priority**: This is the entire point of the refactor. Two parallel implementations with different contracts create silent risk of auth bypass (unhandled throws become invisible 500s; forgotten response checks become silent pass-through). Eliminating the ambiguity removes the primary motivation.

**Independent Test**: Search the codebase for role-check imports. Exactly one canonical module exists. New code written against the project's established server-action conventions (response object) lines up with the auth helper without adaptation.

**Acceptance Scenarios**:

1. **Given** a developer is adding a new organizer-gated server action, **When** they look for a role helper, **Then** they find one canonical `requireRole` that returns the same `{ success, error, data }` shape their other actions return.
2. **Given** a developer imports the canonical helper, **When** they forget to check `!success`, **Then** the TypeScript signature makes the omission visible (nullable `data`) rather than silently bypassing the check.
3. **Given** the refactor is complete, **When** a grep runs for the old module path, **Then** zero unmigrated imports remain.

---

### User Story 2 - Role enforcement on every previously-protected action is preserved (Priority: P1)

Every route and server action that rejected a given role before the refactor still rejects that role after the refactor. No action becomes more permissive; no action becomes unreachable. Existing tests continue to pass (updated only to match the surviving signature, not the semantics).

**Why this priority**: A refactor that changes behavior is not a refactor — it's a regression. This must be protected with the same priority as the consolidation itself.

**Independent Test**: Run the existing test suite. Manually smoke-test the three role paths: vendor cannot reach `/dashboard`, organizer can reach the dashboard and organizer-gated actions, non-admin cannot execute admin-only actions (team invite, admin page).

**Acceptance Scenarios**:

1. **Given** a vendor is signed in, **When** they attempt an organizer-gated action, **Then** the action returns an unauthorized error response (not a crash, not success).
2. **Given** an organizer is signed in, **When** they attempt an organizer-gated action, **Then** the action proceeds and returns success.
3. **Given** an organizer is signed in, **When** they attempt an admin-only action, **Then** the action returns an unauthorized error response.
4. **Given** an unauthenticated user calls any protected server action, **When** the action runs, **Then** it returns an unauthorized error response rather than throwing.
5. **Given** the middleware's role-based redirects were in place before the refactor, **When** the refactor ships, **Then** middleware behavior is unchanged (vendor still redirected from `/dashboard`, non-admin still redirected from `/dashboard/team`, unauthenticated still redirected to `/login`).

---

### User Story 3 - Hierarchy semantic is explicitly tested (Priority: P2)

The surviving helper uses hierarchy-based role checks (`admin > organizer > vendor`). A test explicitly verifies that a higher role satisfies a lower-role requirement (admin passes an `organizer` gate) and that a lower role does not satisfy a higher-role requirement (vendor fails an `organizer` gate, organizer fails an `admin` gate).

**Why this priority**: The old allow-list helper encoded role sets explicitly (`['organizer', 'admin']`). The new hierarchy helper encodes them implicitly (`'organizer'` means "organizer or higher"). That substitution must be proven correct by tests, not just assumed.

**Independent Test**: Run the updated `auth-roles.test.ts`. At minimum three hierarchy assertions must exist: admin-satisfies-organizer-gate (pass), organizer-satisfies-organizer-gate (pass), vendor-fails-organizer-gate (reject).

**Acceptance Scenarios**:

1. **Given** a user with role `admin`, **When** a gate requires minimum role `organizer`, **Then** the check succeeds.
2. **Given** a user with role `organizer`, **When** a gate requires minimum role `admin`, **Then** the check fails with an unauthorized response.
3. **Given** a user with role `vendor`, **When** a gate requires minimum role `organizer`, **Then** the check fails with an unauthorized response.

---

### Edge Cases

- **Caller previously depended on the thrown error being uncaught** (surfacing as a 500). No such caller exists today: the six `isOrganizerOrAdmin()` call sites in `events.ts` and `applications.ts` all wrap the boolean in an `if` and return a structured error, so switching to response-shape is semantically equivalent.
- **Caller required a non-hierarchical role set** (e.g., "vendor OR admin but NOT organizer"). None exist. Every current allow-list usage is `['organizer', 'admin']`, which is the hierarchy floor at `organizer`. If a future caller needs a non-hierarchical set, it will be added then — not pre-built.
- **`role-context.tsx`** (client React context) already consumes the response-shape `getCurrentUserRole`. It must continue to receive the same response shape from the consolidated module.
- **Middleware** queries `user_profiles` directly and is out of scope. The consolidated helper must not be imported into middleware as part of this refactor (Edge runtime boundary risk belongs to a separate spec).
- **Missing `user_profiles` row**: the two old helpers diverge here — the throws-based helper returns `null` for "no profile", while the response-based helper defaults to `'vendor'`. The surviving behavior is the response-based default. No current caller relies on the `null` branch to distinguish "no profile" from "vendor role" (all old callers immediately coerce to authorized/unauthorized), so this is a safe consolidation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The codebase MUST expose exactly one module that provides `requireRole` and `getCurrentUserRole` for server-side role checks.
- **FR-002**: Both `requireRole` and `getCurrentUserRole` MUST return a response object of shape `{ success: boolean, error: string | null, data: { role, userId } | null }`, matching the convention used by every other server action in the codebase.
- **FR-003**: `requireRole` MUST accept a single minimum-role argument and use hierarchy comparison (`admin > organizer > vendor`) to decide authorization.
- **FR-004**: Every call site of the deprecated module (`src/lib/auth/roles.ts`) MUST be migrated to the canonical module: the four `isOrganizerOrAdmin()` calls in `src/lib/actions/events.ts`, the two in `src/lib/actions/applications.ts`, and the test file.
- **FR-005**: The deprecated module (`src/lib/auth/roles.ts`) MUST be deleted after all callers have been migrated.
- **FR-006**: Migrated callers MUST preserve their original authorization semantics: every call previously gated on `isOrganizerOrAdmin()` (allow-list `['organizer', 'admin']`) MUST be gated on `requireRole('organizer')` after migration, which is semantically equivalent under the role hierarchy.
- **FR-007**: Migrated callers that previously returned an error response on denial MUST continue to return an error response on denial — the helper's return contract change MUST NOT convert graceful errors into thrown exceptions or crashes.
- **FR-008**: The existing test file `src/test/auth-roles.test.ts` MUST be updated to test the surviving implementation's signature and contract, with no reduction in coverage of the three original behaviors (auth-check, authorized-pass, unauthorized-reject).
- **FR-009**: At least one new test MUST explicitly verify the hierarchy path: a higher role satisfying a lower-role gate, and a lower role failing a higher-role gate.
- **FR-010**: Middleware role-based redirects MUST continue to function unchanged. Middleware's inline `user_profiles` query is explicitly out of scope and MUST NOT be modified by this refactor.
- **FR-011**: The `isOrganizerOrAdmin` helper MUST be removed entirely. Every caller MUST convert to `requireRole('organizer')`. The re-export-as-thin-wrapper alternative was rejected at planning time (see plan.md Decision 2) because it re-creates the parallel-API ambiguity this refactor exists to eliminate.
- **FR-012**: The `Role` type MUST be imported from its existing location (`src/lib/constants/roles.ts`). No new `Role` type is introduced; the `Role` type re-exported from `src/lib/auth/roles.ts` disappears with the file.
- **FR-013**: `npm run build` and `npm run lint` MUST complete with zero new warnings or errors after the refactor.
- **FR-014**: A manual smoke test MUST confirm unchanged behavior across three scenarios: vendor redirects away from `/dashboard`, organizer reaches organizer-gated actions successfully, a non-admin user is rejected by admin-only actions.

### Key Entities

- **Role**: A string identifying a user's permission level — one of `vendor`, `organizer`, `admin`. Defined in `src/lib/constants/roles.ts`. Not modified by this refactor.
- **RoleResponse**: The response shape returned by both surviving helpers: `{ success, error, data: { role, userId } | null }`. Matches the server-action response pattern used elsewhere in the codebase.
- **Role hierarchy**: Total order `admin > organizer > vendor`. A user's role satisfies any gate at or below their level. Existing logic in `hasMinimumRole`; not modified by this refactor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Exactly one file in the codebase exports `requireRole` and `getCurrentUserRole` (verifiable by `grep`). The deprecated module path returns zero matches.
- **SC-002**: The full existing test suite (`npm test`) passes with 100% of pre-refactor tests green. No test is deleted to make it pass; tests whose signatures must change are updated, not removed.
- **SC-003**: At least one new test case explicitly covers the role hierarchy path (higher role satisfying lower-role gate).
- **SC-004**: `npm run build` and `npm run lint` report zero new warnings or errors compared to the pre-refactor baseline.
- **SC-005**: A manual smoke test across the three primary role paths (vendor, organizer, admin) confirms that every previously-protected route and action behaves identically to pre-refactor behavior. Specifically: vendor cannot reach `/dashboard`; organizer can reach `/dashboard` and execute event/application actions; non-admin cannot execute admin-only actions (`/dashboard/team`, admin page actions).
- **SC-006**: A future developer or AI assistant writing a new server action can identify the correct role helper on first attempt without consulting research, plan, or memory artifacts — verifiable by (a) the absence of any second import path (covered by SC-001's grep) and (b) `CLAUDE.md` and `.specify/memory/constitution.md` referencing only the surviving helpers.

## Assumptions

- The `RoleResponse` shape currently returned by `src/lib/actions/roles.ts` is the correct target shape. It matches the project's server-action convention and does not need further iteration during this refactor.
- No caller in the codebase requires a non-hierarchical role set (e.g., "vendor OR admin but NOT organizer"). Confirmed by enumerating all current callers: every allow-list usage is `['organizer', 'admin']`, which the hierarchy covers. If this assumption is broken later, adding an `allowedRoles` variant is a follow-up, not part of this refactor.
- Middleware (`src/middleware.ts`) continues to read `user_profiles` inline. Extracting a shared role-fetching helper usable from Edge runtime is a separate, future refactor and is deliberately out of scope.
- The default-to-`vendor` behavior when `user_profiles` is missing (response-based helper's current behavior) is acceptable and preserved. No existing caller relies on the throws-based helper's alternative `null`-for-missing-profile branch.
- The canonical module's final location (either `src/lib/auth/roles.ts` or `src/lib/actions/roles.ts`) is a planning decision. The spec does not pre-commit to either. Whichever location is chosen, all imports across the codebase point to that single location.
- No schema, RLS, or migration work is required. This is a pure TypeScript refactor with no database or runtime-configuration changes.
- Rollback is a branch revert. No data migration, no cleanup, no feature flag.
