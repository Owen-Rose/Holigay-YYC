'use server';

/**
 * Admin Server Actions
 *
 * Server actions for admin-only operations like user management.
 * All actions in this file require admin role.
 */

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/actions/roles';
import type { Role } from '@/lib/constants/roles';

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

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Get all users with their roles.
 *
 * Requires admin role. Uses the users_with_roles database view which joins
 * auth.users with user_roles table.
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
  // This view joins auth.users with user_roles, defaulting to 'vendor' role
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
  const users: UserWithRole[] = (data || []).map((user) => ({
    id: user.id,
    email: user.email,
    role: user.role as Role,
    createdAt: user.created_at,
    roleUpdatedAt: user.role_updated_at,
  }));

  return {
    success: true,
    error: null,
    data: users,
  };
}
