# Phase 0 Research: Consolidate Duplicate Role-Check Helpers

**Date**: 2026-04-19
**Branch**: `001-consolidate-role-helpers`

No external research required — this is an internal TypeScript refactor. The "research" here is an exhaustive caller inventory and the resolution of the two planning-phase decisions the spec deferred.

---

## R1 — Caller inventory (authoritative migration surface)

### Callers of deprecated `src/lib/auth/roles.ts`

| File | Line(s) | Symbol used | Current shape | Target shape |
|------|---------|-------------|---------------|--------------|
| `src/lib/actions/events.ts` | 4 (import) | `isOrganizerOrAdmin` | import from `@/lib/auth/roles` | import `requireRole` from `@/lib/auth/roles` (same path, different symbol) |
| `src/lib/actions/events.ts` | 93 | `isOrganizerOrAdmin` | `if (!(await isOrganizerOrAdmin())) return { success: false, error: 'Unauthorized: insufficient role' }` | `const auth = await requireRole('organizer'); if (!auth.success) return { success: false, error: auth.error }` |
| `src/lib/actions/events.ts` | 176 | `isOrganizerOrAdmin` | same pattern | same migration |
| `src/lib/actions/events.ts` | 231 | `isOrganizerOrAdmin` | same pattern | same migration |
| `src/lib/actions/events.ts` | 276 | `isOrganizerOrAdmin` | same pattern | same migration |
| `src/lib/actions/applications.ts` | 14 (import) | `isOrganizerOrAdmin` | import from `@/lib/auth/roles` | import `requireRole` from `@/lib/auth/roles` |
| `src/lib/actions/applications.ts` | 840 | `isOrganizerOrAdmin` | same pattern | same migration |
| `src/lib/actions/applications.ts` | 983 | `isOrganizerOrAdmin` | same pattern | same migration |
| `src/test/auth-roles.test.ts` | 2, 79–160 | `getCurrentUserRole`, `requireRole`, `isOrganizerOrAdmin` | tests throws-based API | rewritten against response-based API; `isOrganizerOrAdmin` suite removed or replaced by equivalent `requireRole('organizer')` hierarchy tests |

**Total call sites to rewrite**: 6 guard sites + 2 imports + 1 test file.

### Callers of surviving (but relocating) `src/lib/actions/roles.ts`

| File | Line(s) | Symbol used | Change |
|------|---------|-------------|--------|
| `src/lib/context/role-context.tsx` | 4 | `getCurrentUserRole` | Import path `@/lib/actions/roles` → `@/lib/auth/roles` |
| `src/lib/actions/team.ts` | 3 | `requireRole` | Import path swap |
| `src/lib/actions/export.ts` | 4 | `requireRole` | Import path swap |
| `src/lib/actions/admin.ts` | 11 | `requireRole` | Import path swap |

**Total import paths to update**: 4 files.

### Non-src references

| File | Reference | Change |
|------|-----------|--------|
| `.specify/memory/constitution.md` | Line 66: `requireRole() / isOrganizerOrAdmin()` | Remove `/ isOrganizerOrAdmin()` (and update Sync Impact Report header) |
| `.specify/memory/constitution.md` | Line 198: PR checklist `requireRole() / isOrganizerOrAdmin()` | Same edit |
| `CLAUDE.md` | Line 99: "validate role with `requireRole()` or `isOrganizerOrAdmin()`" | Remove `or isOrganizerOrAdmin()` |
| `CLAUDE.md` | Line 200: lists all three helpers at `src/lib/auth/roles.ts` | Update to list only surviving helpers (`getCurrentUserRole`, `requireRole`) |
| `TASKS.md` | Lines 146, 149, 154, 192, 210: historical completed-task records referencing `isOrganizerOrAdmin()` | **Not modified.** These are historical records of completed work; editing them rewrites history. |

---

## R2 — Decision: keep canonical location at `src/lib/auth/roles.ts`

**Decision**: The surviving implementation is placed at `src/lib/auth/roles.ts` (overwriting the deleted throws-based file at that same path). The file `src/lib/actions/roles.ts` is deleted.

**Rationale**:
1. **Constitutional alignment.** `.specify/memory/constitution.md:66` already names `src/lib/auth/roles.ts` as the canonical auth-helper location. Moving TO this path means only the helper-name references need patching (two lines), not the file-path reference.
2. **Semantic fit.** `lib/auth/` is where authentication/authorization utilities belong. `lib/actions/` holds server actions scoped to a domain (events, applications, vendors, admin, team, export). A cross-cutting auth primitive is not domain-scoped.
3. **Import ergonomics.** Four callers (role-context, team, export, admin) switch from `@/lib/actions/roles` to `@/lib/auth/roles` — a mechanical find-and-replace, no logic changes.
4. **`'use server'` compatibility.** The directive is preserved on the moved file. Client-side `role-context.tsx` continues to invoke `getCurrentUserRole()` as a Next.js server action regardless of the file's physical location.

**Alternatives considered**:
- **Keep at `src/lib/actions/roles.ts`, delete `src/lib/auth/roles.ts`.** Rejected: semantically misleading (auth helper lodged among domain actions), and requires the constitutional reference to be repointed — arguably a bigger doc change than moving the file.
- **Rename to a third path** (e.g., `src/lib/auth/rbac.ts`, `src/lib/server/auth.ts`). Rejected: introduces a new convention in a refactor whose job is to reduce ambiguity, not invent new conventions.
- **Keep both files, deprecate one with a re-export.** Rejected: preserves the two-import-path ambiguity the refactor exists to eliminate. Also a half-finished abstraction per CLAUDE.md's "Don't add features… beyond what the task requires" guideline.

---

## R3 — Decision: remove `isOrganizerOrAdmin` entirely (no wrapper)

**Decision**: Delete `isOrganizerOrAdmin`. Every current caller migrates to `requireRole('organizer')` directly.

**Rationale**:
1. **Equivalence is provable.** `isOrganizerOrAdmin` returns `true` iff `role ∈ { 'organizer', 'admin' }`. Under the role hierarchy (`admin > organizer > vendor`), `hasMinimumRole(role, 'organizer')` returns `true` for exactly that same set. The substitution is semantically exact.
2. **Same mechanical migration at every site.** All 6 call sites share the identical transform (see R1 table). No per-site judgment required.
3. **Response shape unifies the pattern.** Every caller already returns `{ success: false, error: 'Unauthorized: insufficient role' }` on denial. Substituting `auth.error` ("`Requires organizer role or higher`") in place of the hardcoded string is a minor, acceptable message change — the caller can preserve the exact string if desired by falling back to `auth.error ?? 'Unauthorized: insufficient role'`.
4. **Avoids recreating the ambiguity.** A thin `isOrganizerOrAdmin` wrapper re-introduces two different ways to express the same gate. New contributors would again have to choose which to use.

**Error message handling**: Each migrated call site can either (a) surface `auth.error` verbatim, or (b) keep the original hardcoded string. Option (b) is preferred for backwards compatibility of any UI/test that asserts against the exact string. Planning chooses **(b)** for the 6 `isOrganizerOrAdmin` migrations to minimize blast radius.

**Alternatives considered**:
- **Keep as re-export from `src/lib/auth/roles.ts`.** Rejected per #4 above.
- **Keep as alias with hierarchy implementation.** Rejected: adds a second name for an already-named concept. Zero callers benefit.

---

## R4 — Decision: constitutional amendment classification

**Decision**: PATCH amendment (1.0.0 → 1.0.1).

**Rationale**:
- Two constitution lines reference `isOrganizerOrAdmin()` — which ceases to exist.
- The principle's intent ("guard every mutation at the top of the action body with a role check") is unchanged. Only the named helper list shrinks.
- This satisfies the constitution's own PATCH criteria: "clarifications, wording fixes, typo/formatting changes, non-semantic refinements."
- A Sync Impact Report update is required at the top of `constitution.md` (per governance rules).
- `Last Amended` bumps to 2026-04-19; `Ratified` stays 2026-04-18.

**Alternatives considered**:
- **MINOR (1.0.0 → 1.1.0).** Rejected: no new principle or material expansion of guidance. The rule pool is shrinking by one helper name, not growing.
- **Defer amendment as a TODO in the Sync Impact Report.** Rejected: the PR enacting this refactor is the correct place to propagate the doc change (governance rule "Propagate any downstream edits required… in the same PR"). Deferral creates a window where the constitution references a function that doesn't exist.

---

## R5 — Risks and mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A caller is missed | Low | Caller inventory (R1) is grep-exhaustive across `src/`; post-migration grep for old import paths must return zero matches (SC-001) |
| Error message changes break a test or UI assertion | Low | Migration choice (R3) keeps the hardcoded `'Unauthorized: insufficient role'` string at each call site |
| `'use server'` directive is dropped during file move | Medium | Explicit plan item: preserve `'use server'` at line 1 of the new `src/lib/auth/roles.ts` |
| Hierarchy semantic fails to match old allow-list in an edge case | Very low | FR-009 test explicitly verifies admin-passes-organizer-gate and organizer-fails-admin-gate |
| Constitution amendment is forgotten | Low | Plan explicitly lists constitution patch as a task; PR checklist will flag missing Sync Impact Report update |
| Middleware accidentally migrated too | Low | Explicit out-of-scope item in spec and plan; middleware file is not in the edit list |

---

**Output confirmation**: Zero `NEEDS CLARIFICATION` markers. All planning-phase decisions resolved. Ready for Phase 1.
