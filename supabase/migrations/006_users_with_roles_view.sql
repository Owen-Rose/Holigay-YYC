-- Migration 006: Create users_with_roles view
-- Joins auth.users with user_profiles to provide email + role in one query.
-- Used by admin server actions for user management.
--
-- Security: The view runs as the owner (postgres) so it can access auth.users.
-- Application-layer admin role check is enforced in server actions before querying.

CREATE OR REPLACE VIEW public.users_with_roles AS
SELECT
  u.id,
  u.email::text AS email,
  COALESCE(p.role, 'vendor'::user_role) AS role,
  u.created_at,
  p.updated_at AS role_updated_at
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.id = u.id;

-- Grant read access (admin check happens in server actions)
GRANT SELECT ON public.users_with_roles TO authenticated;
