-- Holigay Vendor Market - Link Vendors to Auth Users
-- Migration: 004_vendors_user_link.sql
-- Adds user_id to vendors so authenticated users can be linked to their vendor record

-- ============================================
-- Add user_id column to vendors table
-- Nullable because existing vendors applied before auth existed
-- ============================================
ALTER TABLE vendors
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for looking up a vendor by their auth user
CREATE INDEX idx_vendors_user_id ON vendors(user_id);
