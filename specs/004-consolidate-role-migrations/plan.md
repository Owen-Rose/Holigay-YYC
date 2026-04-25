# Implementation Plan: Consolidate Role-System Migrations

**Branch**: `003-migration-cleanup` | **Date**: 2026-04-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-consolidate-role-migrations/spec.md`

## Summary

Ship `supabase/migrations/007_role_system_cleanup.sql`, an append-only migration that drops the eight always-false RLS policies from `006_rbac_rls_updates.sql` (which read from the app-never-written `user_roles` table via `user_has_role(auth.uid(), ...)`) and the two superseded helper functions, leaving the 24 correct policies from `005_rbac_rls_policies.sql` as the sole enforcement layer. A Phase A read-only audit of prod and dev Supabase must be completed and recorded in `research.md` before any DROP statement is written, so every object targeted by 007 is attested against observed state rather than repo-inferred state.

## Technical Context

**Language/Version**: PostgreSQL 15 (Supabase hosted) — SQL DDL only; no TypeScript authored  
**Primary Dependencies**: Supabase CLI (`supabase db reset`, `supabase link`), `npm run db:types:dev`, `npm run db:types`  
**Storage**: Supabase PostgreSQL — `public.user_profiles` (canonical role table), `public.user_roles` (superseded; expected empty; targeted for drop)  
**Testing**: Manual smoke test (organizer CRUD on events, vendor blocked) + `npm run lint && npm test && npm run build`; no new automated tests per spec Assumption  
**Target Platform**: Supabase-hosted PostgreSQL (dev and prod); local Supabase via CLI for reset verification  
**Project Type**: Web-service schema migration (no new application code)  
**Performance Goals**: N/A — DDL-only migration; no query-path changes  
**Constraints**: Constitution Principle I — migrations are append-only; files 001–006 MUST NOT be edited. Constitution §II — RLS changes require a manual verification note in the PR (FR-012).  
**Scale/Scope**: ~6 public-schema tables, 32 policies pre-007 → 24 policies post-007, 3 functions → 1 function; 1 table dropped (conditional)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Principle | Status | Notes |
|------|-----------|--------|-------|
| Append-only migrations | Principle I — "Migrations MUST be append-only. Previously-applied migrations MUST NOT be edited." | ✅ **PASS** | 007 is a new file. Files 001–006 are untouched. The three superseded files (003_user_roles.sql, 004_user_roles_rls.sql, 005_users_with_roles_view.sql) are preserved with a README note per FR-011. |
| RLS change verification | §II — "RLS changes SHOULD include a manual verification note in the PR until a DB-integration harness exists." Treated as MUST for this feature per FR-012. | ✅ **PASS** | PR description must carry Phase A SQL outputs, 007's SQL, post-007 pg_policies dump, and smoke-test evidence. Checklist in contracts/migration-007.md. |
| No silent failures in high-stakes paths | Principle III | ✅ **PASS** | Migration 007 drops always-false policies, making the DB-layer enforcement honest. No silent successes remain in the role-check path. |

*Re-evaluation after Phase 1 design*: No new violations identified. IF EXISTS guards (R3-A) are deliberate, not a silent-failure path — Phase A provides the evidence that objects existed before the drops. The scope is unchanged from the spec.

## Project Structure

### Documentation (this feature)

```text
specs/004-consolidate-role-migrations/
├── plan.md              # This file
├── spec.md              # Feature specification (completed)
├── research.md          # Phase 0 output — source-of-mess analysis + Phase A query templates
├── data-model.md        # Phase 1 output — pre/post-007 schema state
├── quickstart.md        # Phase 1 output — 14-step implementation runbook
├── checklists/
│   └── requirements.md  # All 16 items checked ✅
└── contracts/
    ├── rls-policies.md  # Post-007 RLS policy target specification
    └── migration-007.md # Migration behavioral contract (preconditions, postconditions, rollback)
```

### Source Code (repository root)

```text
supabase/migrations/
├── 001_initial_schema.sql         # ACTIVE (unchanged)
├── 002_rls_policies.sql           # ACTIVE (unchanged)
├── 003_user_profiles.sql          # ACTIVE — canonical role system (unchanged)
├── 003_user_roles.sql             # SUPERSEDED — preserved per FR-011
├── 004_user_roles_rls.sql         # SUPERSEDED — preserved per FR-011
├── 004_vendors_user_link.sql      # ACTIVE (unchanged)
├── 005_rbac_rls_policies.sql      # ACTIVE — 24 canonical policies (unchanged)
├── 005_users_with_roles_view.sql  # SUPERSEDED — preserved per FR-011
├── 006_rbac_rls_updates.sql       # RUNS IN PROD — 8 superseded policies; dropped by 007
├── 006_users_with_roles_view.sql  # ACTIVE (unchanged)
├── 007_role_system_cleanup.sql    # NEW — the consolidation migration
└── README.md                      # NEW — marks superseded files per FR-011

src/types/
└── database.ts          # AUTO-GENERATED — regenerated after 007 applies; removes user_roles types
```

**Structure Decision**: Migrations-only change plus one regenerated file. No new source directories. The spec directory (`specs/004-consolidate-role-migrations/`) holds all planning artifacts; the implementation touches only `supabase/migrations/` and `src/types/database.ts`.

## Complexity Tracking

> *No Constitution violations requiring justification.*
