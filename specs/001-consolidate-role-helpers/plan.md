# Implementation Plan: Consolidate Duplicate Role-Check Helpers

**Branch**: `001-consolidate-role-helpers` | **Date**: 2026-04-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-consolidate-role-helpers/spec.md`

## Summary

Delete the throws-based auth helper (`src/lib/auth/roles.ts`), promote the response-based helper (`src/lib/actions/roles.ts`) to the canonical location (`src/lib/auth/roles.ts`), and migrate every caller. Six `isOrganizerOrAdmin()` call sites in `events.ts` / `applications.ts` collapse to `requireRole('organizer')` under the existing role hierarchy. Four existing callers of the surviving helper only change their import path. The test file is rewritten to match the surviving signature, and a hierarchy test is added.

Downstream propagation: constitution Principle I and PR checklist reference `isOrganizerOrAdmin()` — after removal, both references must be patched. CLAUDE.md has two matching references. A PATCH amendment (1.0.0 → 1.0.1) to the constitution is scoped within this refactor.

## Technical Context

**Language/Version**: TypeScript 5.x, strict mode (`tsconfig.json`)
**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/ssr`, Vitest, `@testing-library/react`
**Storage**: N/A — no schema or data changes
**Testing**: Vitest + jsdom (existing `src/test/auth-roles.test.ts` is rewritten, not replaced)
**Target Platform**: Next.js server runtime (not Edge — the surviving helper is already `'use server'`)
**Project Type**: Web application (Next.js App Router monorepo-style layout under `src/`)
**Performance Goals**: No change. Same number of `user_profiles` round-trips per call. No new `'use client'` files.
**Constraints**: Role enforcement behavior on every previously-protected route and action MUST be byte-identical to pre-refactor behavior. No new dependencies. No schema/RLS changes. Middleware is out of scope.
**Scale/Scope**: ~10 call-site migrations, 1 file move, 1 file delete, 1 test rewrite, 1 constitution patch, 2 CLAUDE.md line edits.

### Planning-phase decisions

**Decision 1 — Final module location: `src/lib/auth/roles.ts`.**

Rationale:
- Constitution Principle I (`.specify/memory/constitution.md:66`) already names `src/lib/auth/roles.ts` as the canonical location. Keeping that path minimizes constitutional churn (only the helper-name reference needs patching; the file-path reference stays correct).
- Semantic fit: `lib/auth/` is the natural home for role helpers. `lib/actions/` is for server actions scoped to a domain (events, applications, vendors) — a cross-cutting auth utility sits awkwardly there.
- `'use server'` directive is preserved on the moved file so `role-context.tsx` (client component) can continue to invoke `getCurrentUserRole` as a server action.

Trade-off: 4 callers (role-context, team, export, admin) must update their import path from `@/lib/actions/roles` to `@/lib/auth/roles`. This is a pure find-and-replace; no logic changes.

**Decision 2 — Drop `isOrganizerOrAdmin`, do not re-export.**

Rationale:
- Every current caller uses it as `if (!(await isOrganizerOrAdmin()))` — a boolean gate. Rewriting to `requireRole('organizer')` response-shape is a mechanical 4-line change per call site (already demonstrated by `team.ts`, `export.ts`, `admin.ts`).
- Keeping it as a thin wrapper adds a second public API surface for the same concept, which re-creates the original ambiguity problem this refactor exists to eliminate.
- The role-hierarchy argument is self-documenting at each call site: `requireRole('organizer')` makes the authorization floor legible; `isOrganizerOrAdmin()` hides it.

**Decision 3 — Constitution amendment: PATCH (1.0.0 → 1.0.1).**

Rationale:
- Two references to `isOrganizerOrAdmin()` exist: `constitution.md:66` (Principle I code list) and `constitution.md:198` (PR checklist). Both describe a helper that no longer exists.
- The intent of each rule ("guard every mutation at the top of the action body with a role check") is unchanged. Only the list of named helpers shrinks.
- This meets the constitution's own PATCH definition: "clarifications, wording fixes… non-semantic refinements." It does not remove or redefine a principle.
- A Sync Impact Report update at the top of the file is required; `Last Amended` bumps to 2026-04-19; `Ratified` stays 2026-04-18.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I — Code Quality & Type Safety (NON-NEGOTIABLE)

| Rule | Status |
|------|--------|
| TypeScript `strict: true` preserved | ✅ PASS — no compiler settings touched |
| No `any` / `@ts-ignore` / `@ts-expect-error` in production code | ✅ PASS — moved code already compliant; migrations retain typed `Role` |
| `src/types/database.ts` not hand-edited | ✅ PASS — N/A |
| Every server action validates input via Zod before DB call | ✅ PASS — caller bodies unchanged below the guard line |
| Every server action authorizes via `requireRole()` at top of body | ✅ PASS — refactor consolidates ON this rule; no action loses its guard |
| Server actions return `{ success, error, data }` | ✅ PASS — refactor makes every auth helper return this shape too |
| RLS enabled on user-data tables | ✅ PASS — N/A |
| Migrations append-only, numbered | ✅ PASS — N/A |
| CI gates (format → lint → test → build) green | ✅ PASS — target state |
| Commented-out code removed | ✅ PASS — old file fully deleted, not commented out |

### Principle II — Testing Standards

| Rule | Status |
|------|--------|
| `npm test` passes on PR | ✅ PASS — target state |
| New/modified server action has happy-path + auth-fail test | ✅ PASS — `auth-roles.test.ts` rewritten with both paths |
| Tests use AAA pattern, mock Supabase per `src/test/auth-roles.test.ts` | ✅ PASS — existing pattern preserved |
| React Testing Library component test for new/modified forms | ✅ PASS — N/A (no form changes) |
| `@testing-library/user-event` for interaction | ✅ PASS — N/A |

Hierarchy path test (FR-009, spec User Story 3) exceeds the minimum bar: adds a test case the codebase did not have before.

### Principle III — User Experience Consistency

| Rule | Status |
|------|--------|
| Tokens via `globals.css`, no inline hex | ✅ PASS — N/A (no UI changes) |
| Reuses `src/components/ui/` primitives | ✅ PASS — N/A |
| Form aria + `role="alert"` wiring | ✅ PASS — N/A |
| Mutations surface via Sonner toast or `error.tsx` | ✅ PASS — caller bodies (which handle toasts) are not touched below the guard |
| `loading.tsx` / `error.tsx` at data-fetching segments | ✅ PASS — N/A |
| 44×44 px interactive target size | ✅ PASS — N/A |

### Principle IV — Performance Requirements

| Rule | Status |
|------|--------|
| RSC-first; `'use client'` justified | ✅ PASS — no new client files |
| Middleware matcher untouched | ✅ PASS — explicitly out of scope |
| Mutations call `revalidatePath()` | ✅ PASS — caller bodies unchanged below guard; no new mutations |
| Images via `next/image` | ✅ PASS — N/A |
| Layout-imported deps justified | ✅ PASS — no new deps |
| LCP < 2.5s on `/`, `/login`, `/dashboard` | ✅ PASS — target state; no runtime cost added |

**Result: ✅ All gates pass.** Refactor strengthens Principle I compliance (removes a parallel helper pattern that didn't return `{ success, error, data }`). No justified violations. Complexity Tracking section below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-consolidate-role-helpers/
├── plan.md                        # This file
├── research.md                    # Phase 0 — caller inventory, location decision
├── data-model.md                  # Phase 1 — RoleResponse + Role contracts
├── quickstart.md                  # Phase 1 — verification runbook
├── contracts/
│   └── auth-module.md             # Phase 1 — canonical module public API
└── checklists/
    └── requirements.md            # From /speckit.specify
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── auth/
│   │   └── roles.ts               # REWRITTEN: canonical auth helpers (was throws-based)
│   ├── actions/
│   │   ├── roles.ts               # DELETED: content promoted to src/lib/auth/roles.ts
│   │   ├── events.ts              # EDIT: 4 isOrganizerOrAdmin → requireRole('organizer')
│   │   ├── applications.ts        # EDIT: 2 isOrganizerOrAdmin → requireRole('organizer')
│   │   ├── team.ts                # EDIT: import path @/lib/actions/roles → @/lib/auth/roles
│   │   ├── export.ts              # EDIT: import path swap
│   │   └── admin.ts               # EDIT: import path swap
│   ├── context/
│   │   └── role-context.tsx       # EDIT: import path swap
│   └── constants/
│       └── roles.ts               # UNCHANGED: Role type + hasMinimumRole stay here
├── middleware.ts                  # UNCHANGED: out of scope (separate spec)
└── test/
    └── auth-roles.test.ts         # REWRITTEN: new signatures, adds hierarchy test

.specify/memory/constitution.md    # PATCH AMENDMENT: remove isOrganizerOrAdmin references, bump 1.0.0 → 1.0.1
CLAUDE.md                          # EDIT: two lines (99, 200) — remove isOrganizerOrAdmin reference
```

**Structure Decision**: Existing Next.js App Router layout is retained. The refactor is a file move + caller migrations + doc propagation. No new directories. No new components. No new dependencies.

## Complexity Tracking

> Constitution Check passed with zero violations. This section intentionally left empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                              |
