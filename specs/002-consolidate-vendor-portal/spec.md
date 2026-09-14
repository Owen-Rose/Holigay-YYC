# Feature Specification: Consolidate Duplicate Vendor Portals

**Feature Branch**: `002-consolidate-vendor-portal`
**Created**: 2026-04-21
**Status**: Draft
**Input**: User description: "Consolidate the two parallel vendor portals described in docs/cleanup-roadmap.md → Workstream 1. Keep /vendor-dashboard as canonical; delete /vendor and src/lib/actions/vendor-portal.ts. Model structure on specs/001-consolidate-role-helpers/."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Exactly one vendor portal exists in the codebase (Priority: P1)

A developer (or AI assistant) adding a vendor-facing feature opens the codebase and finds exactly one vendor route tree and exactly one vendor server-actions module. There is no parallel `/vendor/*` stub, no parallel `vendor-portal.ts` with a second `getVendorDashboardData` shape, and no ambiguity about which module to import.

**Why this priority**: This is the entire point of the refactor. The two current implementations diverged on return shape (`VendorDashboardResponse` vs `VendorDashboardData | null`, camelCase vs snake_case) which means TypeScript cannot catch a cross-wired import; any new vendor-facing feature has to be built in two places; the "wrong" surface drifts stale. Eliminating the duplicate removes the primary motivation.

**Independent Test**: Run `grep -rn "vendor-portal" src/` — expect zero matches. Confirm `src/app/(vendor)/` does not exist on disk. Open `src/lib/actions/` and observe that only `vendor-dashboard.ts` provides vendor data-fetching functions.

**Acceptance Scenarios**:

1. **Given** a developer is adding a new vendor-facing server action, **When** they search the codebase for vendor data-fetching helpers, **Then** they find exactly one module (`src/lib/actions/vendor-dashboard.ts`) exposing `getVendorDashboardData`, `getVendorApplicationsList`, `getVendorApplicationDetail`, and `getVendorProfile`.
2. **Given** the refactor is complete, **When** a grep runs for `vendor-portal`, **Then** zero matches remain in `src/`.
3. **Given** a developer is adding a new vendor-facing page, **When** they look for the vendor route tree, **Then** they find exactly one directory (`src/app/vendor-dashboard/`) and no `src/app/(vendor)/` sibling.

---

### User Story 2 - Every vendor entry point lands on the canonical URL (Priority: P1)

A signed-in vendor reaches `/vendor-dashboard` regardless of how they arrive: fresh login, the "vendor portal" link on the `/unauthorized` page, a direct visit to `/login` that redirects post-authentication, or a middleware bounce from an organizer-only route. No entry path leads to `/vendor/*` (which no longer exists).

**Why this priority**: A refactor that leaves dead URLs in post-login redirects, unauthorized-page links, or fallback paths produces a broken user experience — a vendor signs in and gets a 404. The user-visible convergence on the canonical URL is the acceptance half of the consolidation.

**Independent Test**: Walk every vendor entry point manually — fresh login, `/unauthorized` link click, middleware redirect from `/dashboard` — and confirm each lands on `/vendor-dashboard`. Run `grep -rn "'/vendor'" src/` and confirm zero unmigrated navigation destinations remain.

**Acceptance Scenarios**:

1. **Given** a vendor completes sign-in on the login form, **When** the post-login redirect fires, **Then** they land on `/vendor-dashboard` (not `/vendor`).
2. **Given** a signed-in vendor is shown the `/unauthorized` page after attempting a non-vendor route, **When** they click the vendor-portal link, **Then** they land on `/vendor-dashboard`.
3. **Given** a signed-in vendor visits `/login` directly, **When** the auth redirect fires, **Then** they land on `/vendor-dashboard` (preserving existing middleware behavior).
4. **Given** a signed-in vendor visits `/dashboard` directly, **When** middleware runs, **Then** they are redirected to `/vendor-dashboard` (preserving existing middleware behavior).

---

### User Story 3 - All previously-working vendor functionality continues to work (Priority: P2)

Every page currently reachable under `/vendor-dashboard/*` — dashboard home, applications list (including status filtering), application detail, profile edit — behaves identically after the refactor. A refactor that changes user-visible behavior is a regression.

**Why this priority**: The `/vendor-dashboard` surface is being preserved verbatim, so regression risk is low. This priority is P2 rather than P1 because it is an invariant guard rather than a new deliverable; if US1 and US2 are executed as specified, US3 follows from not modifying the canonical module. It is still explicitly tested.

**Independent Test**: Sign in as a vendor with at least one application. Verify (a) the dashboard home shows correct pending/approved/rejected counts and recent applications, (b) the applications list renders with the status filter tabs and correctly filters, (c) clicking an application opens the detail page with event info, business info, and attachments, (d) the profile page loads current values and saves edits.

**Acceptance Scenarios**:

1. **Given** a vendor has submitted applications in various statuses, **When** they load `/vendor-dashboard`, **Then** the status counts and recent applications render identically to pre-refactor.
2. **Given** a vendor is on `/vendor-dashboard/applications`, **When** they click a status filter tab, **Then** the list filters identically to pre-refactor.
3. **Given** a vendor clicks into an application, **When** the detail page loads, **Then** event info, business info, and attachments render identically to pre-refactor.
4. **Given** a vendor edits their profile, **When** they save, **Then** the update succeeds and the new values display identically to pre-refactor.

---

### Edge Cases

- **Direct URL access to `/vendor`, `/vendor/applications`, or `/vendor/profile` after deletion**: the request returns 404. Acceptable — this is a single-tenant dev-phase app with no public bookmarks; every authenticated vendor is guided to the canonical URL by middleware and the updated post-login default. No redirect stub is created (see Assumptions).
- **`unauthorized/page.tsx` link target**: the page is rendered when a user hits a role-mismatched route. Its "go to vendor portal" link MUST point to `/vendor-dashboard` (FR-003). If a signed-in vendor ever reaches `/unauthorized`, an upstream route guard has malfunctioned; the link is a fallback path, not a hot path.
- **Orphan imports of the deleted module**: the only caller of `src/lib/actions/vendor-portal.ts` today is `src/app/(vendor)/vendor/page.tsx`, which is also being deleted. No other import site exists (confirmed by grep). FR-004 locks the invariant post-refactor.
- **`signIn` server-action response shape**: the function currently returns `{ error, success, redirectTo }` with `redirectTo` defaulting to `/vendor`. This refactor changes the default string value from `/vendor` to `/vendor-dashboard` and does not modify the response shape. Callers of `signIn` need no update.
- **Dead export `getVendorApplications(email)` at `src/lib/actions/applications.ts:375`**: grep confirms zero callers in `src/`. Deletion is a pure subtraction with no call-site migration.
- **TypeScript `Role`, `VendorApplication`, `VendorDashboardData`, `VendorProfile` imports**: after `vendor-portal.ts` is deleted, the only remaining export site for the vendor-related types is `vendor-dashboard.ts`. Every current caller already imports from `vendor-dashboard.ts` (the single `vendor-portal.ts` caller is itself deleted), so no import rewrites beyond the deleted file are required.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The codebase MUST contain exactly one vendor route tree: `src/app/vendor-dashboard/*`. The directory `src/app/(vendor)/` (including `layout.tsx` and `vendor/page.tsx`) MUST be deleted entirely.
- **FR-002**: The module `src/lib/actions/vendor-portal.ts` MUST be deleted entirely.
- **FR-003**: Every reference to the path `/vendor` as a navigation destination MUST be updated to `/vendor-dashboard`. Specifically: the post-login redirect default at `src/lib/actions/auth.ts:57`, the fallback redirect at `src/app/(auth)/login/page.tsx:29`, and the link at `src/app/unauthorized/page.tsx:54`.
- **FR-004**: After the refactor, `grep -rn "vendor-portal" src/` MUST return zero matches. `grep -rn "'/vendor'" src/` MUST return zero destination references (path-equality string comparisons, if any remain, are the only legitimate matches and MUST be human-reviewed).
- **FR-005**: All functionality currently exposed under `/vendor-dashboard/*` — dashboard home, applications list with status filtering, application detail, profile edit — MUST behave identically after the refactor. No server-action signature or return shape in `src/lib/actions/vendor-dashboard.ts` is modified.
- **FR-006**: Middleware behavior (`src/middleware.ts`) MUST be unchanged. Vendors continue to be redirected from `/dashboard` to `/vendor-dashboard`; `/vendor-dashboard` remains in the protected-routes list; authenticated users on `/login` or `/signup` continue to be redirected to their role-appropriate dashboard.
- **FR-007**: The dead export `getVendorApplications(email)` at `src/lib/actions/applications.ts:375` MUST be deleted. Grep confirms zero callers; this is an opportunistic cleanup folded into this refactor per `docs/cleanup-roadmap.md` step 7.
- **FR-008**: The server-action **response shapes** in `src/lib/actions/auth.ts` MUST NOT be modified by this refactor. Only the `redirectTo` string default value changes (from `/vendor` to `/vendor-dashboard`). Full `{ success, error, data }` normalization of auth actions is explicitly out of scope and tracked separately (see Assumptions).
- **FR-009**: No new pages, routes, or server actions are created. This refactor is a pure subtraction (three files deleted, one dead export removed) plus three navigation-destination string updates.
- **FR-010**: `npm run lint`, `npm test`, and `npm run build` MUST all complete green after the refactor, with zero new warnings or errors compared to the pre-refactor baseline. Spec 001's three-role smoke-test scenarios (vendor cannot reach `/dashboard`; organizer can reach `/dashboard` and execute event/application actions; non-admin cannot execute admin-only actions) MUST continue to pass.

### Key Entities

- **Vendor portal route tree**: the single surviving vendor-facing UI surface, rooted at `src/app/vendor-dashboard/` and containing `layout.tsx`, `page.tsx`, `applications/page.tsx`, `applications/[id]/page.tsx`, and `profile/page.tsx`.
- **Vendor server-actions module**: the single surviving source of server-side vendor data-fetching, located at `src/lib/actions/vendor-dashboard.ts` and exposing `getVendorDashboardData`, `getVendorApplicationsList`, `getVendorApplicationDetail`, and `getVendorProfile`.
- **Vendor type surface**: the types `VendorDashboardData`, `VendorApplication`, `VendorApplicationDetail`, and `VendorProfile`, exported from `src/lib/actions/vendor-dashboard.ts` as the single type source for vendor data after the refactor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `grep -rn "vendor-portal" src/` returns zero matches (verifiable by command).
- **SC-002**: `grep -rn "'/vendor'" src/` returns zero destination-reference matches. Any remaining matches are path-equality string comparisons only, confirmed by human review.
- **SC-003**: The filesystem invariants `! -d src/app/\(vendor\)/` and `! -f src/lib/actions/vendor-portal.ts` both hold (verifiable by `ls`).
- **SC-004**: A vendor signing in from each entry point — fresh login form, `/unauthorized` page link, direct `/login` visit with active session — lands on `/vendor-dashboard` in every case (verifiable by manual walk-through).
- **SC-005**: Manual smoke test of the four preserved vendor pages (dashboard home, applications list with status filtering, application detail, profile edit) confirms unchanged behavior relative to pre-refactor. Data values (counts, statuses, attachments) render identically.
- **SC-006**: `npm run lint`, `npm test`, and `npm run build` complete with zero new warnings or errors compared to the pre-refactor baseline (verifiable by CI).
- **SC-007**: Spec 001's three-role smoke-test scenarios continue to pass: vendor cannot reach `/dashboard`; organizer can reach `/dashboard` and execute event/application actions; non-admin cannot execute admin-only actions (`/dashboard/team`, admin page). This is the regression gate for the broader auth surface.

## Assumptions

- **No redirect stub is created at `/vendor`.** The roadmap prescribes "delete entirely" (Workstream 1, step 1). This is a single-tenant dev-phase app; no known public bookmarks exist. Middleware's existing `/dashboard` → `/vendor-dashboard` redirect and the updated post-login default already guide every authenticated vendor to the canonical URL. Users hitting the bare `/vendor` path after deletion receive a 404.
- **`RoleProvider` / `useRole` cleanup is deferred to a follow-up.** Roadmap line 56 marks this "consider… otherwise leave it." After `src/app/(vendor)/layout.tsx` is deleted, RoleProvider still has one consumer (`src/app/dashboard/layout.tsx` plus `RoleBadge`). Replacing it with a server-layout prop is a separate, lower-priority refactor.
- **Response-shape normalization of `auth.ts` server actions is deferred.** `signIn`, `signUp`, `signOut` currently return `{ error, success, redirectTo }` instead of the constitution's `{ success, error, data }`. Normalizing those shapes requires touching every caller and is its own refactor. This spec changes only the `/vendor` → `/vendor-dashboard` path string within `signIn`; the response shape is unchanged.
- **`src/lib/actions/vendor-dashboard.ts`'s function surface is not modified.** Exploration confirmed that `src/lib/actions/vendor-portal.ts` contained zero unique logic: its single export (`getVendorDashboardData`) is already fully covered by the canonical module's split functions (`getVendorDashboardData`, `getVendorProfile`, `getVendorApplicationsList`, `getVendorApplicationDetail`). No behavior needs to be ported before deletion.
- **No new test files are added by this refactor.** The existing Vitest suite is the regression guard. `npm test` passing post-refactor is the acceptance bar (FR-010, SC-006). Middleware and email hardening tests belong to Workstream 2 (`docs/cleanup-roadmap.md`).
- **Rollback is a branch revert.** No database migration, no data backfill, no feature flag, no cleanup work. The refactor is a pure TypeScript and filesystem change.
- **The `Role` type and role-check helpers are unaffected.** Spec 001 consolidated those into `src/lib/auth/roles.ts` (or the canonical successor); this spec does not touch role-check logic. Any vendor-dashboard server action that calls a role helper continues to do so unchanged.
