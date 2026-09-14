-- Holigay Vendor Market - User Roles RLS Policies
-- Migration: 004_user_roles_rls.sql
-- DO NOT RUN YET - This is prepared for Phase 9 RBAC implementation
-- Requires 003_user_roles.sql to be applied first

-- ============================================
-- Enable RLS on user_roles table
-- ============================================
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SELECT Policies
-- Users can view their own role
-- Admins can view all roles
-- ============================================

-- Users can always see their own role
CREATE POLICY "Users can view own role"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all user roles (for admin management page)
-- Uses user_has_role() function from 003_user_roles.sql
CREATE POLICY "Admins can view all roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (user_has_role(auth.uid(), 'admin'));

-- ============================================
-- INSERT Policies
-- Authenticated users can insert their own role (during signup)
-- This allows the signup flow to assign 'vendor' role
-- ============================================

CREATE POLICY "Users can insert own role"
  ON user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'vendor'  -- New users can only self-assign vendor role
  );

-- Admins can insert roles for any user (for manual role assignment)
CREATE POLICY "Admins can insert any role"
  ON user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_has_role(auth.uid(), 'admin'));

-- ============================================
-- UPDATE Policies
-- Only admins can change roles
-- ============================================

CREATE POLICY "Admins can update any role"
  ON user_roles
  FOR UPDATE
  TO authenticated
  USING (user_has_role(auth.uid(), 'admin'))
  WITH CHECK (user_has_role(auth.uid(), 'admin'));

-- ============================================
-- DELETE Policies
-- Only admins can delete role assignments
-- (Typically not needed - roles cascade on user delete)
-- ============================================

CREATE POLICY "Admins can delete any role"
  ON user_roles
  FOR DELETE
  TO authenticated
  USING (user_has_role(auth.uid(), 'admin'));

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON POLICY "Users can view own role" ON user_roles IS 'Allows users to see their own role for UI display';
COMMENT ON POLICY "Admins can view all roles" ON user_roles IS 'Allows admins to see all roles for user management';
COMMENT ON POLICY "Users can insert own role" ON user_roles IS 'Allows new users to self-assign vendor role during signup';
COMMENT ON POLICY "Admins can insert any role" ON user_roles IS 'Allows admins to assign any role to users';
COMMENT ON POLICY "Admins can update any role" ON user_roles IS 'Allows admins to change user roles';
COMMENT ON POLICY "Admins can delete any role" ON user_roles IS 'Allows admins to remove role assignments';
