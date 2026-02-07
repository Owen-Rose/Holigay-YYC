-- Holigay Vendor Market - Role-Aware RLS Policies
-- Migration: 005_rbac_rls_policies.sql
-- Replaces permissive policies from 002 with role-based access control
--
-- Roles:
--   vendor          - own data only
--   organizer/admin - all data
--   anon            - public form submissions and active event viewing

-- ============================================
-- Drop all existing policies from 002
-- ============================================

-- Events
DROP POLICY IF EXISTS "Public can view active events" ON events;
DROP POLICY IF EXISTS "Authenticated users can view all events" ON events;
DROP POLICY IF EXISTS "Authenticated users can create events" ON events;
DROP POLICY IF EXISTS "Authenticated users can update events" ON events;
DROP POLICY IF EXISTS "Authenticated users can delete events" ON events;

-- Vendors
DROP POLICY IF EXISTS "Public can create vendors" ON vendors;
DROP POLICY IF EXISTS "Public can view own vendor by email" ON vendors;
DROP POLICY IF EXISTS "Authenticated users can view all vendors" ON vendors;
DROP POLICY IF EXISTS "Authenticated users can update vendors" ON vendors;
DROP POLICY IF EXISTS "Authenticated users can delete vendors" ON vendors;
DROP POLICY IF EXISTS "Authenticated users can create vendors" ON vendors;

-- Applications
DROP POLICY IF EXISTS "Public can create applications" ON applications;
DROP POLICY IF EXISTS "Public can view applications" ON applications;
DROP POLICY IF EXISTS "Authenticated users can view all applications" ON applications;
DROP POLICY IF EXISTS "Authenticated users can update applications" ON applications;
DROP POLICY IF EXISTS "Authenticated users can delete applications" ON applications;
DROP POLICY IF EXISTS "Authenticated users can create applications" ON applications;

-- Attachments
DROP POLICY IF EXISTS "Public can create attachments" ON attachments;
DROP POLICY IF EXISTS "Public can view attachments" ON attachments;
DROP POLICY IF EXISTS "Authenticated users can view all attachments" ON attachments;
DROP POLICY IF EXISTS "Authenticated users can delete attachments" ON attachments;
DROP POLICY IF EXISTS "Authenticated users can create attachments" ON attachments;


-- ============================================
-- Events Policies
-- Anon: read active events (public apply page)
-- Vendors: read all events (need to browse events to apply)
-- Organizers/Admins: full CRUD
-- ============================================

CREATE POLICY "anon_select_active_events"
  ON events FOR SELECT TO anon
  USING (status = 'active');

-- All authenticated users can view events
CREATE POLICY "authenticated_select_events"
  ON events FOR SELECT TO authenticated
  USING (true);

-- Only organizers and admins can manage events
CREATE POLICY "organizer_insert_events"
  ON events FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('organizer', 'admin'));

CREATE POLICY "organizer_update_events"
  ON events FOR UPDATE TO authenticated
  USING (get_user_role() IN ('organizer', 'admin'))
  WITH CHECK (get_user_role() IN ('organizer', 'admin'));

CREATE POLICY "organizer_delete_events"
  ON events FOR DELETE TO authenticated
  USING (get_user_role() IN ('organizer', 'admin'));


-- ============================================
-- Vendors Policies
-- Anon: create (public form) and read (check existing by email)
-- Vendors: read/update own record only
-- Organizers/Admins: full access
-- ============================================

-- Public application form needs to create vendor records
CREATE POLICY "anon_insert_vendors"
  ON vendors FOR INSERT TO anon
  WITH CHECK (true);

-- Public form checks if vendor already exists by email
CREATE POLICY "anon_select_vendors"
  ON vendors FOR SELECT TO anon
  USING (true);

-- Vendors can view their own record
CREATE POLICY "vendor_select_own"
  ON vendors FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR get_user_role() IN ('organizer', 'admin')
  );

-- Vendors can update their own record (profile editing)
CREATE POLICY "vendor_update_own"
  ON vendors FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR get_user_role() IN ('organizer', 'admin')
  )
  WITH CHECK (
    user_id = auth.uid()
    OR get_user_role() IN ('organizer', 'admin')
  );

-- Only organizers/admins can create vendor records when authenticated
CREATE POLICY "organizer_insert_vendors"
  ON vendors FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('organizer', 'admin'));

-- Only organizers/admins can delete vendors
CREATE POLICY "organizer_delete_vendors"
  ON vendors FOR DELETE TO authenticated
  USING (get_user_role() IN ('organizer', 'admin'));


-- ============================================
-- Applications Policies
-- Anon: create and read (public form flow)
-- Vendors: read own applications, create new ones
-- Organizers/Admins: full access
-- ============================================

-- Public form needs to submit applications
CREATE POLICY "anon_insert_applications"
  ON applications FOR INSERT TO anon
  WITH CHECK (true);

-- Public form checks for duplicate applications
CREATE POLICY "anon_select_applications"
  ON applications FOR SELECT TO anon
  USING (true);

-- Vendors see own applications; organizers/admins see all
CREATE POLICY "authenticated_select_applications"
  ON applications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = applications.vendor_id
        AND vendors.user_id = auth.uid()
    )
    OR get_user_role() IN ('organizer', 'admin')
  );

-- Vendors can submit applications when logged in
CREATE POLICY "authenticated_insert_applications"
  ON applications FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = applications.vendor_id
        AND vendors.user_id = auth.uid()
    )
    OR get_user_role() IN ('organizer', 'admin')
  );

-- Only organizers/admins can update applications (status changes, notes)
CREATE POLICY "organizer_update_applications"
  ON applications FOR UPDATE TO authenticated
  USING (get_user_role() IN ('organizer', 'admin'))
  WITH CHECK (get_user_role() IN ('organizer', 'admin'));

-- Only organizers/admins can delete applications
CREATE POLICY "organizer_delete_applications"
  ON applications FOR DELETE TO authenticated
  USING (get_user_role() IN ('organizer', 'admin'));


-- ============================================
-- Attachments Policies
-- Anon: create and read (public form uploads)
-- Vendors: read own attachments, create new ones
-- Organizers/Admins: full access
-- ============================================

-- Public form uploads
CREATE POLICY "anon_insert_attachments"
  ON attachments FOR INSERT TO anon
  WITH CHECK (true);

-- Public form can view uploaded attachments
CREATE POLICY "anon_select_attachments"
  ON attachments FOR SELECT TO anon
  USING (true);

-- Vendors see own attachments; organizers/admins see all
CREATE POLICY "authenticated_select_attachments"
  ON attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM applications
      JOIN vendors ON vendors.id = applications.vendor_id
      WHERE applications.id = attachments.application_id
        AND vendors.user_id = auth.uid()
    )
    OR get_user_role() IN ('organizer', 'admin')
  );

-- Vendors can upload attachments to their own applications
CREATE POLICY "authenticated_insert_attachments"
  ON attachments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM applications
      JOIN vendors ON vendors.id = applications.vendor_id
      WHERE applications.id = attachments.application_id
        AND vendors.user_id = auth.uid()
    )
    OR get_user_role() IN ('organizer', 'admin')
  );

-- Only organizers/admins can delete attachments
CREATE POLICY "organizer_delete_attachments"
  ON attachments FOR DELETE TO authenticated
  USING (get_user_role() IN ('organizer', 'admin'));


-- ============================================
-- User Profiles Policies
-- Users: read own profile
-- Admins: read/update all profiles
-- Insert: none (handle_new_user trigger uses SECURITY DEFINER, bypasses RLS)
-- ============================================

-- Users can read their own profile; admins can read all
CREATE POLICY "select_own_profile"
  ON user_profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- Only admins can update profiles (e.g. changing a user's role)
CREATE POLICY "admin_update_profiles"
  ON user_profiles FOR UPDATE TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');
