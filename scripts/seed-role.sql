-- Set a user's role by email address.
--
-- Usage:
--   1. The user must already exist in auth.users. Either they signed up at /signup
--      (the handle_new_user trigger auto-creates their user_profiles row with role
--      'vendor'), or an admin added them under Dashboard > Authentication > Users >
--      Add user, which auto-confirms the address and so needs no working SMTP.
--   2. Replace <role> with one of: vendor | organizer | admin
--      Replace BOTH occurrences of <email> with the user's address.
--   3. Run it in the Supabase SQL Editor (Dashboard > SQL Editor) on the project you
--      actually mean: dev and prod have separate user lists, and an account that exists
--      on one does not exist on the other.
--   4. The SELECT at the end must return exactly one row showing the new role. No row
--      means this project has no auth.users entry for that address — check for a typo,
--      and check which project the editor is pointed at.
--
-- The role lives in public.user_profiles, not in auth.users. `role` is the user_role
-- enum (migration 003), so an unedited <role> — or any value outside the three — fails
-- with `invalid input value for enum user_role` rather than storing nonsense.

-- ============================================
-- SET THE ROLE AND EMAIL HERE
-- ============================================
UPDATE user_profiles
SET role = '<role>'                -- vendor | organizer | admin
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = '<email>'
);

-- Verify the change: expect exactly one row, showing the role you just set.
SELECT
  u.email,
  p.role,
  p.created_at
FROM user_profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = '<email>';
