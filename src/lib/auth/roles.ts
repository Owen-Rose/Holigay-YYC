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

  const { data: roleData, error: roleError } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (roleError && roleError.code !== 'PGRST116') {
    // PGRST116 = no rows found, which is ok (default to vendor)
    return {
      success: false,
      error: 'Failed to fetch user role',
      data: null,
    };
  }

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
 */
export async function requireRole(minimumRole: Role): Promise<RoleResponse> {
  const result = await getCurrentUserRole();

  if (!result.success) {
    return result;
  }

  const { role, userId } = result.data!;

  if (!hasMinimumRole(role, minimumRole)) {
    return {
      success: false,
      error: `Requires ${minimumRole} role or higher`,
      data: null,
    };
  }

  return {
    success: true,
    error: null,
    data: {
      role,
      userId,
    },
  };
}
