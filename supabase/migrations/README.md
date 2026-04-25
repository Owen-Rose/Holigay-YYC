# Supabase Migrations

Migrations apply in **alphabetical filename order**. Numerically-duplicated prefixes (two `003_*`, two `004_*`, two `005_*`, two `006_*`) are intentional in some pairs and historical in others — the table below names which is which.

## Authoritative migration file set

| File | Status | Notes |
|------|--------|-------|
| `001_initial_schema.sql` | Active | Core tables: `events`, `vendors`, `applications`, `attachments`. |
| `002_rls_policies.sql` | Active | Initial permissive RLS policies; later replaced by 005 / 006. |
| `003_user_profiles.sql` | **Active — canonical role system** | Defines `user_role` enum, `user_profiles` table, no-arg `get_user_role()` helper, `handle_new_user` trigger. |
| `003_user_roles.sql` | **Superseded by 007_role_system_cleanup.sql** | Alternate role-system design that was prototyped but abandoned. Ran in prod despite its "DO NOT RUN YET" header — file-name alphabetical order beats inline comments. Created the `user_roles` table, two-arg `get_user_role(uuid)`, and `user_has_role(uuid, text)`; 007 drops the functions and a follow-up spec drops the table. |
| `004_user_roles_rls.sql` | **Superseded by 007_role_system_cleanup.sql** | RLS policies for the superseded `user_roles` table. The 6 policies it creates depend on `user_has_role`; after 007 they are unevaluable, and they cascade away when `user_roles` is dropped in the follow-up spec. |
| `004_vendors_user_link.sql` | Active | Adds `vendors.user_id` and links vendors to `auth.users`. |
| `005_rbac_rls_policies.sql` | Active | The 24 canonical RLS policies on the main public tables, all routed through the no-arg `get_user_role()`. |
| `005_users_with_roles_view.sql` | **Superseded by `006_users_with_roles_view.sql`** | View joined the abandoned `user_roles` table. Overwritten at apply time by 006's `CREATE OR REPLACE VIEW`, which joins the canonical `user_profiles` instead. |
| `006_rbac_rls_updates.sql` | Active (but its policies are dropped by 007) | Drops the older "Authenticated users can …" policies from 002 and tries to replace them with `user_has_role(...)`-gated policies. The replacements are dropped by `007_role_system_cleanup.sql` because they read from the app-dead `user_roles` table; the 005 policies cover the same surface correctly. |
| `006_users_with_roles_view.sql` | Active | Canonical `users_with_roles` view joining `auth.users` and `user_profiles`. |
| `007_role_system_cleanup.sql` | Active — latest | Drops 006's 8 superseded policies, the two-arg `get_user_role(uuid)`, and `user_has_role(uuid, text)`. The `user_roles` table itself is left in place pending row reconciliation in a follow-up spec. See `specs/004-consolidate-role-migrations/`. |

## Why are the superseded files kept rather than deleted?

Constitution Principle I: migrations are append-only. The three superseded files (`003_user_roles.sql`, `004_user_roles_rls.sql`, `005_users_with_roles_view.sql`) ran in prod despite the original intent. Deleting them from the repo would break the traceability between the committed file set and what actually ran on prod. Migration 007 is the database-side fix; this README is the filesystem-side documentation.

## Adding a new migration

Use the next sequential prefix (`008_*`, `009_*`, …). Never edit a previously-applied migration file. To revise a schema decision, ship a forward migration that drops or replaces the affected objects.
