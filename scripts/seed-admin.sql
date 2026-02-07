-- Promote a user to admin role by email address
--
-- Usage:
--   1. Sign up at /signup with the email you want as admin
--   2. Replace 'your-email@example.com' below with that email
--   3. Run this script in the Supabase SQL Editor (Dashboard > SQL Editor)
--
-- This updates the user_profiles row that was auto-created by the
-- handle_new_user trigger during signup.

-- ============================================
-- SET YOUR ADMIN EMAIL HERE
-- ============================================
UPDATE user_profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'your-email@example.com'
);

-- Verify the change
SELECT
  u.email,
  p.role,
  p.created_at
FROM user_profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'your-email@example.com';
