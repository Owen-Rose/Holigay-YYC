-- Holigay Vendor Market - Initial User Roles Seed
-- Seed: 001_initial_roles.sql
--
-- Run this in Supabase SQL Editor to assign initial roles.
-- Add more users as needed using the same INSERT pattern.

-- ============================================
-- Insert initial user roles
-- ============================================

-- Admin user (full access)
INSERT INTO user_roles (user_id, role)
VALUES (
  '22d56e26-3534-4bb9-9678-111d60a00c78',
  'admin'
)
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

-- ============================================
-- Add more users as needed:
-- ============================================
-- INSERT INTO user_roles (user_id, role)
-- VALUES ('user-uuid-here', 'organizer')
-- ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

-- ============================================
-- Verification query (run after inserts)
-- ============================================
-- SELECT ur.*, au.email
-- FROM user_roles ur
-- JOIN auth.users au ON ur.user_id = au.id
-- ORDER BY ur.role DESC;
