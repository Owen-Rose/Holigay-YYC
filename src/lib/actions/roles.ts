'use server';

import { createClient } from '@/lib/supabase/server';
import { hasMinimumRole, type Role } from '@/lib/constants/roles';

// Response type for role actions
export type RoleResponse = {
  success: boolean;
  error: string | null;
  data: {
    role: Role;
    userId: string;
  } | null;
};

/**
 * Get the current authenticated user's role.
 * Returns 'vendor' as default if no role is assigned.
 */
export async function getCurrentUserRole(): Promise<RoleResponse> {
  const supabase = await createClient();

  // Get current authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: 'Not authenticated',
      data: null,
    };
  }

  // Fetch role from user_profiles table (same table middleware reads from)
  const { data: roleData, error: roleError } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (roleError && roleError.code !== 'PGRST116') {
    // PGRST116 = no rows found, which is ok (default to vendor)
    // Any other error is unexpected
    return {
      success: false,
      error: 'Failed to fetch user role',
      data: null,
    };
  }

  // Return role, defaulting to 'vendor' if not found
  const role = (roleData?.role as Role) || 'vendor';

  return {
    success: true,
    error: null,
    data: {
      role,
      userId: user.id,
    },
  };
}

/**
 * Require a minimum role level for a server action.
 * Use at the start of protected server actions.
 *
 * @param minimumRole - The minimum role required (checks hierarchy)
 * @returns RoleResponse - success with user data, or error if unauthorized
 *
 * @example
 * export async function protectedAction() {
 *   const auth = await requireRole('organizer')
 *   if (!auth.success) {
 *     return { success: false, error: auth.error }
 *   }
 *   // User is authorized, proceed with action
 *   const { role, userId } = auth.data
 * }
 */
export async function requireRole(minimumRole: Role): Promise<RoleResponse> {
  // Get current user's role
  const result = await getCurrentUserRole();

  // Pass through auth errors
  if (!result.success) {
    return result;
  }

  // Check if user's role meets minimum requirement
  const { role, userId } = result.data!;

  if (!hasMinimumRole(role, minimumRole)) {
    return {
      success: false,
      error: `Requires ${minimumRole} role or higher`,
      data: null,
    };
  }

  // User is authorized
  return {
    success: true,
    error: null,
    data: {
      role,
      userId,
    },
  };
}
