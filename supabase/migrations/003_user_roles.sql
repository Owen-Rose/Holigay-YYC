-- Holigay Vendor Market - User Roles for RBAC
-- Migration: 003_user_roles.sql
-- DO NOT RUN YET - This is prepared for Phase 9 RBAC implementation

-- ============================================
-- User Roles table
-- Links auth.users to application roles
-- One role per user (vendor, organizer, admin)
-- ============================================
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'vendor' CHECK (role IN ('vendor', 'organizer', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Each user can have only one role
  CONSTRAINT user_roles_user_id_unique UNIQUE (user_id)
);

-- ============================================
-- Indexes for common queries
-- ============================================
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- ============================================
-- Apply updated_at trigger
-- Uses existing function from 001_initial_schema.sql
-- ============================================
CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Helper Functions for Role Checks
-- ============================================

-- Get user's role, defaulting to 'vendor' if not found
-- This allows the app to treat unassigned users as vendors
CREATE OR REPLACE FUNCTION get_user_role(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM user_roles
  WHERE user_id = p_user_id;

  -- Default to 'vendor' if no role assigned
  RETURN COALESCE(v_role, 'vendor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has at least the required role level
-- Uses hierarchy: vendor(0) < organizer(1) < admin(2)
CREATE OR REPLACE FUNCTION user_has_role(p_user_id UUID, p_required_role TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_role TEXT;
  v_user_level INTEGER;
  v_required_level INTEGER;
BEGIN
  -- Get user's current role
  v_user_role := get_user_role(p_user_id);

  -- Map roles to hierarchy levels
  v_user_level := CASE v_user_role
    WHEN 'admin' THEN 2
    WHEN 'organizer' THEN 1
    WHEN 'vendor' THEN 0
    ELSE 0
  END;

  v_required_level := CASE p_required_role
    WHEN 'admin' THEN 2
    WHEN 'organizer' THEN 1
    WHEN 'vendor' THEN 0
    ELSE 0
  END;

  -- Check if user's level meets or exceeds required level
  RETURN v_user_level >= v_required_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE user_roles IS 'Maps authenticated users to their application role (vendor, organizer, admin)';
COMMENT ON COLUMN user_roles.user_id IS 'References auth.users - cascades on delete';
COMMENT ON COLUMN user_roles.role IS 'User role: vendor (default), organizer, or admin';
COMMENT ON FUNCTION get_user_role(UUID) IS 'Returns user role or vendor as default';
COMMENT ON FUNCTION user_has_role(UUID, TEXT) IS 'Checks if user meets minimum role requirement';
