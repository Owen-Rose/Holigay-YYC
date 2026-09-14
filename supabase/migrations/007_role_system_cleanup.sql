-- Holigay Vendor Market - Role System Cleanup
-- Migration: 007_role_system_cleanup.sql
-- Spec: 004-consolidate-role-migrations
-- Behavioral contract: specs/004-consolidate-role-migrations/contracts/migration-007.md
-- Phase A research: specs/004-consolidate-role-migrations/research.md
--
-- Drops the abandoned alternate role system (006's policies that depend on
-- user_has_role; the two superseded role-helper functions). Leaves the
-- canonical 24 RLS policies from 005_rbac_rls_policies.sql in place — those
-- already use the no-arg get_user_role() defined in 003_user_profiles.sql.
--
-- Idempotency: every DROP uses IF EXISTS, so this migration applies cleanly
-- against environments whose state has drifted (per Phase A: prod has the
-- functions but not 006's policies; dev never had any of the alternate
-- objects; a fresh `supabase db reset` has all of them via alphabetical
-- migration apply order).

-- ============================================
-- Step 1 — Drop the 8 superseded policies from 006_rbac_rls_updates.sql
-- ============================================
-- These policies gate writes via user_has_role(auth.uid(), 'organizer'),
-- which reads from user_roles (an app-dead table). They are no-ops in the
-- live envs (Phase A confirmed they were not present in prod or dev) but
-- exist on a fresh local `db reset` where 006 applies alphabetically.
-- The canonical 005 policies (organizer_insert_events,
-- organizer_update_applications, etc.) remain in place and are sufficient.

DROP POLICY IF EXISTS "Organizers can create events" ON events;
DROP POLICY IF EXISTS "Organizers can update events" ON events;
DROP POLICY IF EXISTS "Organizers can delete events" ON events;

DROP POLICY IF EXISTS "Organizers can update applications" ON applications;
DROP POLICY IF EXISTS "Organizers can delete applications" ON applications;

DROP POLICY IF EXISTS "Organizers can update vendors" ON vendors;
DROP POLICY IF EXISTS "Organizers can delete vendors" ON vendors;

DROP POLICY IF EXISTS "Organizers can delete attachments" ON attachments;

-- ============================================
-- Step 2 — Drop the superseded two-arg get_user_role(UUID) function
-- ============================================
-- This variant returns TEXT and reads from user_roles. The canonical
-- no-arg get_user_role() returning user_role (defined in
-- 003_user_profiles.sql) is unaffected — PostgreSQL function overloads
-- are distinct objects resolved by argument signature.

DROP FUNCTION IF EXISTS public.get_user_role(UUID);

-- ============================================
-- Step 3 — Drop the 4 user_roles policies that depend on user_has_role,
--         then drop user_has_role(UUID, TEXT) itself
-- ============================================
-- PostgreSQL refuses to drop a function while any RLS policy still
-- references it (error 2BP01). The four "Admins can ..." policies on
-- user_roles (from 004_user_roles_rls.sql) reference user_has_role.
-- Drop them explicitly before dropping the function. The remaining two
-- policies on user_roles (Users can view own role, Users can insert
-- own role) use auth.uid() directly and cascade away later (008 drops
-- the table).
--
-- Explicit drops (rather than DROP FUNCTION ... CASCADE) are used here
-- so any unexpected dependency surfaces as a loud error instead of a
-- silent CASCADE removal.
--
-- AMENDMENT 2026-04-25 (Workstream 4): When the four superseded migrations
-- (003_user_roles.sql, 004_user_roles_rls.sql, 005_users_with_roles_view.sql,
-- 006_rbac_rls_updates.sql) were moved into supabase/migrations/_superseded/,
-- the user_roles table stopped being created on fresh `supabase db reset`.
-- The four DROP POLICY ... ON user_roles statements would then fail at parse
-- time (PostgreSQL needs the table to resolve the ON clause, even with
-- IF EXISTS on the policy). Wrapping them in a DO block with an existence
-- guard makes 007 idempotent across all three apply paths (prod, dev,
-- fresh local). This amendment is a functional no-op for prod and dev —
-- they've already executed 007 and their schema_migrations rows for version
-- 007 are already set. Only parse-time behavior on fresh applies changes.

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'user_roles'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can view all roles"   ON public.user_roles';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can insert any role"  ON public.user_roles';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can update any role"  ON public.user_roles';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can delete any role"  ON public.user_roles';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.user_has_role(UUID, TEXT);

-- ============================================
-- Step 4 — DROP TABLE user_roles CASCADE — DEFERRED
-- ============================================
-- Per FR-005, the DROP TABLE step is deferred because Phase A Query 4
-- showed prod has 1 row in user_roles (an admin role record from an
-- early bootstrap, see research.md §R2-B). A follow-up migration
-- (008_drop_user_roles.sql, in a separate spec) will reconcile the row
-- against user_profiles and drop the table once data work is complete.
--
-- Until then, user_roles remains in prod (and a fresh local db reset)
-- with its 6 now-broken policies. Dev never had the table, so this
-- step is a no-op there in any case.
