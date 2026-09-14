# Supabase Migrations

Active migrations live directly in `supabase/migrations/` and apply in alphabetical filename order. Files in the `_superseded/` subdirectory are preserved for history but **not** applied by `supabase db reset` (the CLI ignores subdirectories).

## Active migration set

| File | Notes |
|------|-------|
| `001_initial_schema.sql` | Core tables: `events`, `vendors`, `applications`, `attachments`. |
| `002_rls_policies.sql` | Initial permissive RLS policies; later replaced by 005. |
| `003_user_profiles.sql` | Canonical role system. Defines `user_role` enum, `user_profiles` table, no-arg `get_user_role()` helper, `handle_new_user` trigger. |
| `004_vendors_user_link.sql` | Adds `vendors.user_id` and links vendors to `auth.users`. |
| `005_rbac_rls_policies.sql` | The 24 canonical RLS policies on the main public tables, all routed through the no-arg `get_user_role()`. |
| `006_users_with_roles_view.sql` | Canonical `users_with_roles` view joining `auth.users` and `user_profiles`. |
| `007_role_system_cleanup.sql` | Drops the abandoned alternate role system: the two-arg `get_user_role(uuid)`, `user_has_role(uuid, text)`, the 4 admin policies on `user_roles` that depended on it, and the 8 policies from the (now-superseded) `006_rbac_rls_updates.sql`. See `specs/004-consolidate-role-migrations/`. |
| `008_drop_user_roles.sql` | Drops the residual `public.user_roles` table from prod. No-op in dev (table never existed) and in fresh local resets (003's superseded sibling no longer creates the table). See `docs/cleanup-roadmap.md` Workstream 5. |

## Superseded files (`_superseded/`)

Preserved for traceability, **not** applied by `supabase db reset`. Each ran in prod at some point under the old layout (alphabetical apply order ignored "DO NOT RUN YET" headers). Migrations 007 and 008 cleaned up their database-side artifacts.

| File | Why superseded |
|------|---------------|
| `_superseded/003_user_roles.sql` | Alternate role-system design that was prototyped but abandoned. Created the `user_roles` table, two-arg `get_user_role(uuid)`, and `user_has_role(uuid, text)`. All artifacts dropped by 007 and 008. |
| `_superseded/004_user_roles_rls.sql` | RLS policies for the superseded `user_roles` table. Cascaded away when 008 dropped the table. |
| `_superseded/005_users_with_roles_view.sql` | First attempt at the `users_with_roles` view; joined the abandoned `user_roles` table. Overwritten in prod by `006_users_with_roles_view.sql`'s `CREATE OR REPLACE VIEW`. |
| `_superseded/006_rbac_rls_updates.sql` | Created 8 RBAC policies that gated writes on `user_has_role(...)`. The function reads from the app-never-written `user_roles` table, so every check evaluated FALSE. The 005 policies covered the same surface correctly. All 8 policies dropped by 007. |

## Why kept rather than deleted?

Constitution Principle I: migrations are append-only. These four files ran on prod (the duplicate-numbered ordering meant the "DO NOT RUN YET" header was ignored). Deleting them from the repo would break the traceability between the committed file set and what actually ran on prod. Moving them into `_superseded/` keeps the history while letting `supabase db reset` work cleanly on fresh local instances.

## Adding a new migration

Use the next sequential prefix (`009_*`, `010_*`, …). Never edit a previously-applied migration file or a `_superseded/` file. To revise a schema decision, ship a forward migration that drops or replaces the affected objects.
