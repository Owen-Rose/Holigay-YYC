-- Holigay Vendor Market - User Profiles for RBAC
-- Migration: 003_user_profiles.sql
-- Creates user_profiles table to link auth.users to roles

-- ============================================
-- User Role Enum
-- Defines the three roles in the system
-- ============================================
CREATE TYPE user_role AS ENUM ('vendor', 'organizer', 'admin');

-- ============================================
-- User Profiles Table
-- Links auth.users to roles and vendor records
-- ============================================
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'vendor',
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE user_profiles IS 'Links auth.users to roles (vendor, organizer, admin) and optional vendor records';
COMMENT ON COLUMN user_profiles.id IS 'References auth.users(id) - user owns this profile';
COMMENT ON COLUMN user_profiles.role IS 'User role for RBAC - defaults to vendor on signup';
COMMENT ON COLUMN user_profiles.vendor_id IS 'Optional link to vendor record if user is a vendor';

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_user_profiles_role ON user_profiles(role);
CREATE INDEX idx_user_profiles_vendor_id ON user_profiles(vendor_id);

-- ============================================
-- Updated_at Trigger
-- Uses existing trigger function from 001_initial_schema
-- ============================================
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Enable RLS
-- Policies will be added in a later migration (005)
-- ============================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
