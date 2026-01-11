'use server'

import { createClient } from '@/lib/supabase/server'
import type { Role } from '@/lib/constants/roles'

// Response type for role actions
export type RoleResponse = {
  success: boolean
  error: string | null
  data: {
    role: Role
    userId: string
  } | null
}

/**
 * Get the current authenticated user's role.
 * Returns 'vendor' as default if no role is assigned.
 */
export async function getCurrentUserRole(): Promise<RoleResponse> {
  const supabase = await createClient()

  // Get current authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      success: false,
      error: 'Not authenticated',
      data: null,
    }
  }

  // Fetch role from user_roles table
  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (roleError && roleError.code !== 'PGRST116') {
    // PGRST116 = no rows found, which is ok (default to vendor)
    // Any other error is unexpected
    return {
      success: false,
      error: 'Failed to fetch user role',
      data: null,
    }
  }

  // Return role, defaulting to 'vendor' if not found
  const role = (roleData?.role as Role) || 'vendor'

  return {
    success: true,
    error: null,
    data: {
      role,
      userId: user.id,
    },
  }
}
