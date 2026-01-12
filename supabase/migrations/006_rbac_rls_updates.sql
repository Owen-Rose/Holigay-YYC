-- Holigay Vendor Market - RBAC RLS Policy Updates
-- Migration: 006_rbac_rls_updates.sql
-- Updates existing RLS policies to enforce role-based access control
-- Uses user_has_role() function from 003_user_roles.sql

-- ============================================
-- Events Policies (Role-Based Updates)
-- Public: Read active events only
-- Authenticated: Read all events
-- Organizer/Admin only: Create, update, delete
-- ============================================

-- Drop existing permissive authenticated policies for events
DROP POLICY IF EXISTS "Authenticated users can create events" ON events;
DROP POLICY IF EXISTS "Authenticated users can update events" ON events;
DROP POLICY IF EXISTS "Authenticated users can delete events" ON events;

-- Organizer+: Can create events
CREATE POLICY "Organizers can create events"
  ON events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_has_role(auth.uid(), 'organizer'));

-- Organizer+: Can update events
CREATE POLICY "Organizers can update events"
  ON events
  FOR UPDATE
  TO authenticated
  USING (user_has_role(auth.uid(), 'organizer'))
  WITH CHECK (user_has_role(auth.uid(), 'organizer'));

-- Organizer+: Can delete events
CREATE POLICY "Organizers can delete events"
  ON events
  FOR DELETE
  TO authenticated
  USING (user_has_role(auth.uid(), 'organizer'));

-- ============================================
-- Applications Policies (Role-Based Updates)
-- Public: Can create (submit applications)
-- Authenticated: Can create (logged-in vendors)
-- Organizer/Admin only: Update, delete
-- ============================================

-- Drop existing permissive authenticated policies for applications
DROP POLICY IF EXISTS "Authenticated users can update applications" ON applications;
DROP POLICY IF EXISTS "Authenticated users can delete applications" ON applications;

-- Organizer+: Can update applications (status changes, notes)
CREATE POLICY "Organizers can update applications"
  ON applications
  FOR UPDATE
  TO authenticated
  USING (user_has_role(auth.uid(), 'organizer'))
  WITH CHECK (user_has_role(auth.uid(), 'organizer'));

-- Organizer+: Can delete applications
CREATE POLICY "Organizers can delete applications"
  ON applications
  FOR DELETE
  TO authenticated
  USING (user_has_role(auth.uid(), 'organizer'));

-- ============================================
-- Vendors Policies (Role-Based Updates)
-- Public: Can create (self-registration)
-- All authenticated: Can read (vendors need to see their own)
-- Organizer/Admin only: Update, delete
-- ============================================

-- Drop existing permissive authenticated policies for vendors
DROP POLICY IF EXISTS "Authenticated users can update vendors" ON vendors;
DROP POLICY IF EXISTS "Authenticated users can delete vendors" ON vendors;

-- Organizer+: Can update vendors
CREATE POLICY "Organizers can update vendors"
  ON vendors
  FOR UPDATE
  TO authenticated
  USING (user_has_role(auth.uid(), 'organizer'))
  WITH CHECK (user_has_role(auth.uid(), 'organizer'));

-- Organizer+: Can delete vendors
CREATE POLICY "Organizers can delete vendors"
  ON vendors
  FOR DELETE
  TO authenticated
  USING (user_has_role(auth.uid(), 'organizer'));

-- ============================================
-- Attachments Policies (Role-Based Updates)
-- Public: Can create (with applications)
-- All authenticated: Can read
-- Organizer/Admin only: Delete
-- ============================================

-- Drop existing permissive authenticated delete policy for attachments
DROP POLICY IF EXISTS "Authenticated users can delete attachments" ON attachments;

-- Organizer+: Can delete attachments
CREATE POLICY "Organizers can delete attachments"
  ON attachments
  FOR DELETE
  TO authenticated
  USING (user_has_role(auth.uid(), 'organizer'));

-- ============================================
-- Policy Summary After Migration
-- ============================================
-- Events:
--   - Public SELECT: active events only (unchanged)
--   - Authenticated SELECT: all events (unchanged)
--   - INSERT/UPDATE/DELETE: organizer+ only (NEW)
--
-- Applications:
--   - Public SELECT: all (unchanged - permissive for MVP)
--   - Public INSERT: yes (unchanged)
--   - Authenticated SELECT/INSERT: yes (unchanged)
--   - UPDATE/DELETE: organizer+ only (NEW)
--
-- Vendors:
--   - Public SELECT/INSERT: yes (unchanged)
--   - Authenticated SELECT/INSERT: yes (unchanged)
--   - UPDATE/DELETE: organizer+ only (NEW)
--
-- Attachments:
--   - Public SELECT/INSERT: yes (unchanged)
--   - Authenticated SELECT/INSERT: yes (unchanged)
--   - DELETE: organizer+ only (NEW)
