# Contract: Post-007 RLS Policy Specification

**Feature**: `004-consolidate-role-migrations`
**Purpose**: Specifies the exact set of RLS policies that must exist on every public-schema table after migration 007 applies. This is the target state — 007's DROP and CREATE statements must produce this set.

Phase A's `pg_policies` dump is diffed against this document before 007 is authored. Any policy present in prod but absent here (or vice-versa) must be reconciled before 007 ships.

---

## How to read this document

- **SURVIVING**: Already created by `005_rbac_rls_policies.sql` using `get_user_role()`. Migration 007 does **not** touch these — they are correct as-is.
- **DROPPED BY 007**: Created by `006_rbac_rls_updates.sql` using `user_has_role(auth.uid(), ...)`. Migration 007 drops these with `DROP POLICY IF EXISTS`.

Post-007 total: **24 policies** across 5 tables.

---

## `events` — 5 policies

| Policy name | CMD | Role | `USING` / `WITH CHECK` | Status |
|------------|-----|------|------------------------|--------|
| `anon_select_active_events` | SELECT | anon | `USING (status = 'active')` | **SURVIVING** |
| `authenticated_select_events` | SELECT | authenticated | `USING (true)` | **SURVIVING** |
| `organizer_insert_events` | INSERT | authenticated | `WITH CHECK (get_user_role() IN ('organizer', 'admin'))` | **SURVIVING** |
| `organizer_update_events` | UPDATE | authenticated | `USING (get_user_role() IN ('organizer', 'admin'))` / `WITH CHECK (get_user_role() IN ('organizer', 'admin'))` | **SURVIVING** |
| `organizer_delete_events` | DELETE | authenticated | `USING (get_user_role() IN ('organizer', 'admin'))` | **SURVIVING** |
| `Organizers can create events` | INSERT | authenticated | `WITH CHECK (user_has_role(auth.uid(), 'organizer'))` | **DROPPED BY 007** |
| `Organizers can update events` | UPDATE | authenticated | `USING/WITH CHECK (user_has_role(auth.uid(), 'organizer'))` | **DROPPED BY 007** |
| `Organizers can delete events` | DELETE | authenticated | `USING (user_has_role(auth.uid(), 'organizer'))` | **DROPPED BY 007** |

---

## `vendors` — 6 policies

| Policy name | CMD | Role | `USING` / `WITH CHECK` | Status |
|------------|-----|------|------------------------|--------|
| `anon_insert_vendors` | INSERT | anon | `WITH CHECK (true)` | **SURVIVING** |
| `anon_select_vendors` | SELECT | anon | `USING (true)` | **SURVIVING** |
| `vendor_select_own` | SELECT | authenticated | `USING (user_id = auth.uid() OR get_user_role() IN ('organizer', 'admin'))` | **SURVIVING** |
| `vendor_update_own` | UPDATE | authenticated | `USING (user_id = auth.uid() OR get_user_role() IN ('organizer', 'admin'))` / same WITH CHECK | **SURVIVING** |
| `organizer_insert_vendors` | INSERT | authenticated | `WITH CHECK (get_user_role() IN ('organizer', 'admin'))` | **SURVIVING** |
| `organizer_delete_vendors` | DELETE | authenticated | `USING (get_user_role() IN ('organizer', 'admin'))` | **SURVIVING** |
| `Organizers can update vendors` | UPDATE | authenticated | `USING/WITH CHECK (user_has_role(auth.uid(), 'organizer'))` | **DROPPED BY 007** |
| `Organizers can delete vendors` | DELETE | authenticated | `USING (user_has_role(auth.uid(), 'organizer'))` | **DROPPED BY 007** |

---

## `applications` — 6 policies

| Policy name | CMD | Role | `USING` / `WITH CHECK` | Status |
|------------|-----|------|------------------------|--------|
| `anon_insert_applications` | INSERT | anon | `WITH CHECK (true)` | **SURVIVING** |
| `anon_select_applications` | SELECT | anon | `USING (true)` | **SURVIVING** |
| `authenticated_select_applications` | SELECT | authenticated | `USING (EXISTS (SELECT 1 FROM vendors WHERE vendors.id = applications.vendor_id AND vendors.user_id = auth.uid()) OR get_user_role() IN ('organizer', 'admin'))` | **SURVIVING** |
| `authenticated_insert_applications` | INSERT | authenticated | `WITH CHECK (EXISTS (...same vendor check...) OR get_user_role() IN ('organizer', 'admin'))` | **SURVIVING** |
| `organizer_update_applications` | UPDATE | authenticated | `USING (get_user_role() IN ('organizer', 'admin'))` / same WITH CHECK | **SURVIVING** |
| `organizer_delete_applications` | DELETE | authenticated | `USING (get_user_role() IN ('organizer', 'admin'))` | **SURVIVING** |
| `Organizers can update applications` | UPDATE | authenticated | `USING/WITH CHECK (user_has_role(auth.uid(), 'organizer'))` | **DROPPED BY 007** |
| `Organizers can delete applications` | DELETE | authenticated | `USING (user_has_role(auth.uid(), 'organizer'))` | **DROPPED BY 007** |

---

## `attachments` — 5 policies

| Policy name | CMD | Role | `USING` / `WITH CHECK` | Status |
|------------|-----|------|------------------------|--------|
| `anon_insert_attachments` | INSERT | anon | `WITH CHECK (true)` | **SURVIVING** |
| `anon_select_attachments` | SELECT | anon | `USING (true)` | **SURVIVING** |
| `authenticated_select_attachments` | SELECT | authenticated | `USING (EXISTS (SELECT 1 FROM applications JOIN vendors ON vendors.id = applications.vendor_id WHERE applications.id = attachments.application_id AND vendors.user_id = auth.uid()) OR get_user_role() IN ('organizer', 'admin'))` | **SURVIVING** |
| `authenticated_insert_attachments` | INSERT | authenticated | `WITH CHECK (...same EXISTS check...)` | **SURVIVING** |
| `organizer_delete_attachments` | DELETE | authenticated | `USING (get_user_role() IN ('organizer', 'admin'))` | **SURVIVING** |
| `Organizers can delete attachments` | DELETE | authenticated | `USING (user_has_role(auth.uid(), 'organizer'))` | **DROPPED BY 007** |

---

## `user_profiles` — 2 policies

| Policy name | CMD | Role | `USING` / `WITH CHECK` | Status |
|------------|-----|------|------------------------|--------|
| `select_own_profile` | SELECT | authenticated | `USING (id = auth.uid() OR get_user_role() = 'admin')` | **SURVIVING** |
| `admin_update_profiles` | UPDATE | authenticated | `USING (get_user_role() = 'admin')` / `WITH CHECK (get_user_role() = 'admin')` | **SURVIVING** |

---

## `user_roles` — 6 policies (cascade-dropped with the table)

These policies exist on the `user_roles` table and are created by `004_user_roles_rls.sql`. They are not enumerated in the post-007 target state — they disappear via `DROP TABLE user_roles CASCADE`. No explicit `DROP POLICY` statements are needed.

| Policy name | CMD | References |
|------------|-----|------------|
| `Users can view own role` | SELECT | `auth.uid() = user_id` |
| `Admins can view all roles` | SELECT | `user_has_role(auth.uid(), 'admin')` |
| `Users can insert own role` | INSERT | `user_id = auth.uid() AND role = 'vendor'` |
| `Admins can insert any role` | INSERT | `user_has_role(auth.uid(), 'admin')` |
| `Admins can update any role` | UPDATE | `user_has_role(auth.uid(), 'admin')` |
| `Admins can delete any role` | DELETE | `user_has_role(auth.uid(), 'admin')` |

**If `user_roles` is NOT dropped** (Phase A shows non-zero rows): The functions `user_has_role` and `get_user_role(UUID)` are still dropped by 007. The 6 policies on `user_roles` will reference a now-dropped function, making them broken at evaluation time. This is acceptable — `user_roles` is app-dead regardless, and the broken policies will cascade away in the follow-up migration that drops the table once rows are reconciled.

---

## Summary

| | Pre-007 | Post-007 |
|-|---------|----------|
| Policies on public tables (excluding `user_roles`) | 32 | **24** |
| Policies using `get_user_role()` | 24 | 24 |
| Policies using `user_has_role()` | 8 | **0** |
| `user_roles` table policies | 6 (cascade-dropped) | 0 |
