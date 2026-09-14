# Data Model: Consolidate Role-System Migrations

**Feature**: `004-consolidate-role-migrations`
**Type**: Schema consolidation — documents role-system DB objects before and after migration 007, not entity-relationship design

---

## Pre-007 expected state

Objects that should be present in any environment where migrations 001–006 have been applied (alphabetically):

### Tables

| Table | Source migration | Status | Notes |
|-------|-----------------|--------|-------|
| `public.user_profiles` | `003_user_profiles.sql` | **CANONICAL** | PK = `id UUID` refs `auth.users(id)` CASCADE; columns: `role user_role NOT NULL DEFAULT 'vendor'`, `vendor_id UUID` refs `vendors(id) SET NULL`, `created_at`, `updated_at` |
| `public.user_roles` | `003_user_roles.sql` | **SUPERSEDED** | PK = `id UUID`; columns: `user_id UUID UNIQUE` refs `auth.users(id)` CASCADE, `role TEXT CHECK IN ('vendor','organizer','admin') DEFAULT 'vendor'`, `created_at`, `updated_at`. App never writes to this table. Expected row count: 0. |

### Enum types

| Type | Source | Status |
|------|--------|--------|
| `public.user_role` | `003_user_profiles.sql` | **CANONICAL** — `ENUM ('vendor', 'organizer', 'admin')` |

### Functions

| Function signature | Returns | Language | Source | Status |
|-------------------|---------|----------|--------|--------|
| `public.get_user_role()` | `user_role` | `sql` — `STABLE SECURITY DEFINER` | `003_user_profiles.sql:86` | **CANONICAL** — reads `user_profiles.role WHERE id = auth.uid()` |
| `public.get_user_role(p_user_id UUID)` | `TEXT` | `plpgsql` — `SECURITY DEFINER` | `003_user_roles.sql:40` | **SUPERSEDED** — reads `user_roles` by `user_id`; defaults to `'vendor'` when `user_roles` is empty |
| `public.user_has_role(p_user_id UUID, p_required_role TEXT)` | `BOOLEAN` | `plpgsql` — `SECURITY DEFINER` | `003_user_roles.sql:56` | **SUPERSEDED** — calls `get_user_role(UUID)` internally; evaluates a role hierarchy (vendor=0, organizer=1, admin=2). Because `user_roles` is empty, always returns `FALSE` for any role above `'vendor'`. |

### Trigger functions

| Function | Used by | Source | Status |
|----------|---------|--------|--------|
| `public.handle_new_user()` | `on_auth_user_created` trigger on `auth.users` | `003_user_profiles.sql:47` | **CANONICAL** — inserts into `user_profiles`; optionally links `vendors.user_id` |

### Views

| View | Source | Status | Notes |
|------|--------|--------|-------|
| `public.users_with_roles` | `006_users_with_roles_view.sql` (overwrites `005_users_with_roles_view.sql`) | **CANONICAL** | JOINs `auth.users` with `user_profiles`; returns `id, email, role, created_at, role_updated_at` |

Note: `005_users_with_roles_view.sql` also created `public.users_with_roles` using `CREATE OR REPLACE VIEW`, but its definition joins `user_roles` (superseded). Because migrations apply alphabetically, 005's version runs first and 006's `CREATE OR REPLACE VIEW` overwrites it. The surviving definition in the DB joins `user_profiles` correctly.

### RLS policies — pre-007 (32 total)

**Canonical policies (24) — from `005_rbac_rls_policies.sql`** — all use `get_user_role()` (no-arg):

| Table | Policy name | CMD | Role |
|-------|------------|-----|------|
| events | `anon_select_active_events` | SELECT | anon |
| events | `authenticated_select_events` | SELECT | authenticated |
| events | `organizer_insert_events` | INSERT | authenticated |
| events | `organizer_update_events` | UPDATE | authenticated |
| events | `organizer_delete_events` | DELETE | authenticated |
| vendors | `anon_insert_vendors` | INSERT | anon |
| vendors | `anon_select_vendors` | SELECT | anon |
| vendors | `vendor_select_own` | SELECT | authenticated |
| vendors | `vendor_update_own` | UPDATE | authenticated |
| vendors | `organizer_insert_vendors` | INSERT | authenticated |
| vendors | `organizer_delete_vendors` | DELETE | authenticated |
| applications | `anon_insert_applications` | INSERT | anon |
| applications | `anon_select_applications` | SELECT | anon |
| applications | `authenticated_select_applications` | SELECT | authenticated |
| applications | `authenticated_insert_applications` | INSERT | authenticated |
| applications | `organizer_update_applications` | UPDATE | authenticated |
| applications | `organizer_delete_applications` | DELETE | authenticated |
| attachments | `anon_insert_attachments` | INSERT | anon |
| attachments | `anon_select_attachments` | SELECT | anon |
| attachments | `authenticated_select_attachments` | SELECT | authenticated |
| attachments | `authenticated_insert_attachments` | INSERT | authenticated |
| attachments | `organizer_delete_attachments` | DELETE | authenticated |
| user_profiles | `select_own_profile` | SELECT | authenticated |
| user_profiles | `admin_update_profiles` | UPDATE | authenticated |

**Superseded policies (8) — from `006_rbac_rls_updates.sql`** — all use `user_has_role(auth.uid(), 'organizer')` (always FALSE because `user_roles` is empty):

| Table | Policy name | CMD |
|-------|------------|-----|
| events | `Organizers can create events` | INSERT |
| events | `Organizers can update events` | UPDATE |
| events | `Organizers can delete events` | DELETE |
| applications | `Organizers can update applications` | UPDATE |
| applications | `Organizers can delete applications` | DELETE |
| vendors | `Organizers can update vendors` | UPDATE |
| vendors | `Organizers can delete vendors` | DELETE |
| attachments | `Organizers can delete attachments` | DELETE |

**Additional policies on `user_roles` table (6) — from `004_user_roles_rls.sql`** — cascade-drop when `user_roles` is dropped:

| Policy name | CMD |
|------------|-----|
| `Users can view own role` | SELECT |
| `Admins can view all roles` | SELECT |
| `Users can insert own role` | INSERT |
| `Admins can insert any role` | INSERT |
| `Admins can update any role` | UPDATE |
| `Admins can delete any role` | DELETE |

---

## Post-007 target state

### Tables

| Table | Status |
|-------|--------|
| `public.user_profiles` | **UNCHANGED** |
| `public.user_roles` | **DROPPED** (conditional on Phase A confirming row count = 0) |

### Enum types

| Type | Status |
|------|--------|
| `public.user_role` | **UNCHANGED** |

### Functions

| Function | Status |
|----------|--------|
| `public.get_user_role()` | **UNCHANGED** — the only surviving role-check helper |
| `public.get_user_role(p_user_id UUID)` | **DROPPED** |
| `public.user_has_role(p_user_id UUID, p_required_role TEXT)` | **DROPPED** |

### Views

| View | Status |
|------|--------|
| `public.users_with_roles` | **UNCHANGED** — 006's definition (joins `user_profiles`) already in force |

### RLS policies — post-007

24 policies from `005_rbac_rls_policies.sql` remain. The 8 policies from `006_rbac_rls_updates.sql` are **dropped**. See `contracts/rls-policies.md` for the complete post-007 policy specification.

---

## Delta table

| Object | Type | Pre-007 status | Post-007 status | Action |
|--------|------|---------------|-----------------|--------|
| `public.user_profiles` | TABLE | CANONICAL | CANONICAL | No change |
| `public.user_roles` | TABLE | SUPERSEDED | ABSENT | `DROP TABLE IF EXISTS user_roles CASCADE` (conditional) |
| `public.user_role` | ENUM | CANONICAL | CANONICAL | No change |
| `public.get_user_role()` | FUNCTION | CANONICAL | CANONICAL | No change |
| `public.get_user_role(UUID)` | FUNCTION | SUPERSEDED | ABSENT | `DROP FUNCTION IF EXISTS get_user_role(UUID)` |
| `public.user_has_role(UUID, TEXT)` | FUNCTION | SUPERSEDED | ABSENT | `DROP FUNCTION IF EXISTS user_has_role(UUID, TEXT)` |
| `public.users_with_roles` | VIEW | CANONICAL | CANONICAL | No change |
| 24 policies from `005_rbac_rls_policies.sql` | RLS POLICIES | CANONICAL | CANONICAL | No change |
| 8 policies from `006_rbac_rls_updates.sql` | RLS POLICIES | SUPERSEDED (always-FALSE) | ABSENT | `DROP POLICY IF EXISTS ... ON <table>` (×8) |
| 6 policies on `user_roles` from `004_user_roles_rls.sql` | RLS POLICIES | SUPERSEDED | ABSENT | Cascade-dropped with `DROP TABLE user_roles CASCADE`; no explicit DROP needed |
| `src/types/database.ts` (types for `user_roles`) | GENERATED FILE | Present | Absent | Removed by regenerating types after 007 applies |
