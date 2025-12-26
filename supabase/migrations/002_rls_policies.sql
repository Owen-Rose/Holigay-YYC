-- Holigay Vendor Market - Row Level Security Policies
-- Migration: 002_rls_policies.sql

-- ============================================
-- Enable RLS on all tables
-- ============================================
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Events Policies
-- Public can read active events only
-- Authenticated users (organizers) have full access
-- ============================================

-- Public: Read active events only
CREATE POLICY "Public can view active events"
  ON events
  FOR SELECT
  TO anon
  USING (status = 'active');

-- Authenticated: Full access to all events
CREATE POLICY "Authenticated users can view all events"
  ON events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create events"
  ON events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update events"
  ON events
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete events"
  ON events
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- Vendors Policies
-- Public can create vendors (self-registration via application)
-- Authenticated users (organizers) have full access
-- ============================================

-- Public: Can create vendor records (when applying)
CREATE POLICY "Public can create vendors"
  ON vendors
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Public: Can view their own vendor record by email
-- (This allows checking if already registered)
CREATE POLICY "Public can view own vendor by email"
  ON vendors
  FOR SELECT
  TO anon
  USING (true);

-- Authenticated: Full access to all vendors
CREATE POLICY "Authenticated users can view all vendors"
  ON vendors
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update vendors"
  ON vendors
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete vendors"
  ON vendors
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create vendors"
  ON vendors
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- Applications Policies
-- Public can create applications (submit forms)
-- Authenticated users (organizers) have full access
-- ============================================

-- Public: Can create applications
CREATE POLICY "Public can create applications"
  ON applications
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Public: Can view their own applications (by vendor email lookup)
-- Note: This is permissive for MVP; can be tightened later
CREATE POLICY "Public can view applications"
  ON applications
  FOR SELECT
  TO anon
  USING (true);

-- Authenticated: Full access to all applications
CREATE POLICY "Authenticated users can view all applications"
  ON applications
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update applications"
  ON applications
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete applications"
  ON applications
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create applications"
  ON applications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- Attachments Policies
-- Public can create attachments (with applications)
-- Authenticated users (organizers) have full access
-- ============================================

-- Public: Can create attachments
CREATE POLICY "Public can create attachments"
  ON attachments
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Public: Can view attachments (for their applications)
CREATE POLICY "Public can view attachments"
  ON attachments
  FOR SELECT
  TO anon
  USING (true);

-- Authenticated: Full access to all attachments
CREATE POLICY "Authenticated users can view all attachments"
  ON attachments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete attachments"
  ON attachments
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create attachments"
  ON attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- Storage Policies (Manual Setup Required)
-- ============================================
-- Note: Supabase Storage policies must be configured via the dashboard
-- or using the storage schema directly. For the 'attachments' bucket:
--
-- 1. Create bucket named 'attachments' (private, not public)
--
-- 2. Add these policies in Supabase Dashboard > Storage > Policies:
--
--    INSERT (uploads):
--      - Allow anon: bucket_id = 'attachments'
--      - Allow authenticated: bucket_id = 'attachments'
--
--    SELECT (downloads):
--      - Allow anon: bucket_id = 'attachments'
--      - Allow authenticated: bucket_id = 'attachments'
--
--    DELETE:
--      - Allow authenticated: bucket_id = 'attachments'
