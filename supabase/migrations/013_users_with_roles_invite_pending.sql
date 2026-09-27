-- Holigay Vendor Market - users_with_roles: invite_pending
-- Migration: 013_users_with_roles_invite_pending.sql
-- Spec: specs/009-organizer-invites/ (FR-023, FR-029; research R5, R20)
--
-- Adds one trailing column so the Team page can mark accounts that were invited
-- and have not accepted. The condition is the same one GoTrue uses to decide
-- whether an invitation may be re-sent (email_confirmed_at IS NULL), narrowed
-- by last_sign_in_at IS NULL so "pending" always also means "never signed in".
-- CREATE OR REPLACE VIEW may only append columns, so the 006 select is restated.

CREATE OR REPLACE VIEW public.users_with_roles AS
SELECT
  u.id,
  u.email::text AS email,
  COALESCE(p.role, 'vendor'::user_role) AS role,
  u.created_at,
  p.updated_at AS role_updated_at,
  (u.email_confirmed_at IS NULL AND u.last_sign_in_at IS NULL) AS invite_pending
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.id = u.id;

-- Close the anon read (research R20). Supabase's default privileges granted
-- anon and authenticated ALL on this view when 006 created it, and the view
-- runs as its owner, so anyone holding the public anon key could list every
-- account's email. anon loses every privilege; authenticated keeps only the
-- SELECT that 006 granted explicitly (the admin gate stays in the server
-- action). Asserted by src/test/security/invite-flow.test.ts.
REVOKE ALL ON public.users_with_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.users_with_roles FROM authenticated;
