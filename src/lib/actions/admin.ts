'use server';

/**
 * Admin Server Actions
 *
 * Server actions for admin-only operations like user management.
 * All actions in this file require admin role.
 */

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/actions/roles';
import { ROLES, type Role } from '@/lib/constants/roles';

// =============================================================================
// Types
// =============================================================================

/**
 * User data returned from the users_with_roles view
 */
export type UserWithRole = {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  roleUpdatedAt: string | null;
};

/**
 * Response type for getUsers action
 */
export type GetUsersResponse = {
  success: boolean;
  error: string | null;
  data: UserWithRole[] | null;
};

/**
 * Response type for updateUserRole action
 */
export type UpdateRoleResponse = {
  success: boolean;
  error: string | null;
};

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Get all users with their roles.
 *
 * Requires admin role. Uses the users_with_roles database view which joins
 * auth.users with user_profiles table.
 *
 * @returns List of users with their roles, sorted by creation date (newest first)
 */
export async function getUsers(): Promise<GetUsersResponse> {
  // ---------------------------------------------------------------------------
  // Authorization: Require admin role
  // ---------------------------------------------------------------------------
  const auth = await requireRole('admin');
  if (!auth.success) {
    return {
      success: false,
      error: auth.error,
      data: null,
    };
  }

  const supabase = await createClient();

  // ---------------------------------------------------------------------------
  // Fetch users from the users_with_roles view
  // This view joins auth.users with user_profiles, defaulting to 'vendor' role
  // ---------------------------------------------------------------------------
  const { data, error } = await supabase
    .from('users_with_roles')
    .select('id, email, role, created_at, role_updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch users:', error.message);
    return {
      success: false,
      error: 'Failed to fetch users',
      data: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Transform to camelCase for frontend consistency
  // ---------------------------------------------------------------------------
  const users: UserWithRole[] = (data || [])
    .filter((user) => user.id && user.email)
    .map((user) => ({
      id: user.id!,
      email: user.email!,
      role: user.role as Role,
      createdAt: user.created_at!,
      roleUpdatedAt: user.role_updated_at,
    }));

  return {
    success: true,
    error: null,
    data: users,
  };
}

/**
 * Update a user's role.
 *
 * Requires admin role. Performs an upsert to handle users who don't have
 * a role entry yet (they would be treated as 'vendor' by default).
 *
 * Safety checks:
 * - Admins cannot demote themselves (prevents accidental lockout)
 * - Only valid roles are accepted
 *
 * @param userId - The ID of the user to update
 * @param newRole - The new role to assign
 * @returns Success/error response
 */
export async function updateUserRole(
  userId: string,
  newRole: Role
): Promise<UpdateRoleResponse> {
  // ---------------------------------------------------------------------------
  // Authorization: Require admin role
  // ---------------------------------------------------------------------------
  const auth = await requireRole('admin');
  if (!auth.success) {
    return {
      success: false,
      error: auth.error,
    };
  }

  // ---------------------------------------------------------------------------
  // Validate role
  // ---------------------------------------------------------------------------
  if (!ROLES.includes(newRole)) {
    return {
      success: false,
      error: `Invalid role: ${newRole}. Must be one of: ${ROLES.join(', ')}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Safety check: Prevent admin from demoting themselves
  // This prevents accidental admin lockout
  // ---------------------------------------------------------------------------
  if (auth.data?.userId === userId && newRole !== 'admin') {
    return {
      success: false,
      error: 'Cannot demote yourself. Ask another admin to change your role.',
    };
  }

  const supabase = await createClient();

  // ---------------------------------------------------------------------------
  // Update role in user_profiles (the table middleware and auth checks read from)
  // ---------------------------------------------------------------------------
  const { error } = await supabase
    .from('user_profiles')
    .update({ role: newRole })
    .eq('id', userId);

  if (error) {
    console.error('Failed to update user role:', error.message);
    return {
      success: false,
      error: 'Failed to update user role',
    };
  }

  return {
    success: true,
    error: null,
  };
}
