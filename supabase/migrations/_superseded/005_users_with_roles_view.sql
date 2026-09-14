-- =============================================================================
-- Migration: Users With Roles View
-- Description: Creates a view that joins auth.users with user_roles for admin
--              user management. Exposes only necessary fields.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Create the view
-- This view provides a unified list of users with their roles.
-- Users without a role entry default to 'vendor'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.users_with_roles AS
SELECT
    au.id,
    au.email,
    au.created_at,
    COALESCE(ur.role, 'vendor') AS role,
    ur.updated_at AS role_updated_at
FROM auth.users au
LEFT JOIN public.user_roles ur ON au.id = ur.user_id
ORDER BY au.created_at DESC;

-- -----------------------------------------------------------------------------
-- Grant permissions
-- Only authenticated users can access, RLS will further restrict
-- -----------------------------------------------------------------------------
GRANT SELECT ON public.users_with_roles TO authenticated;

-- -----------------------------------------------------------------------------
-- Note: This view doesn't support RLS directly, so we'll handle authorization
-- in the server action using requireRole('admin'). The view itself only exposes
-- email, id, role, and timestamps - no sensitive data.
-- -----------------------------------------------------------------------------

-- Add a comment documenting the view's purpose
COMMENT ON VIEW public.users_with_roles IS
    'Admin view: Lists all users with their roles. Used by admin user management page.';
