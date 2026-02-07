import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

// Role type derived from the database enum
export type Role = Database['public']['Enums']['user_role']

/**
 * Returns the current authenticated user's role, or null if not authenticated
 * or no profile exists.
 */
export async function getCurrentUserRole(): Promise<Role | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Default to 'vendor' if profile exists but role is somehow missing,
  // or null if no profile at all
  return profile?.role ?? null
}

/**
 * Throws an error if the current user doesn't have one of the allowed roles.
 * Returns the user's role on success for downstream use.
 */
export async function requireRole(allowedRoles: Role[]): Promise<Role> {
  const role = await getCurrentUserRole()

  if (!role) {
    throw new Error('Not authenticated')
  }

  if (!allowedRoles.includes(role)) {
    throw new Error('Unauthorized: insufficient role')
  }

  return role
}

/**
 * Returns true if the current user is an organizer or admin.
 */
export async function isOrganizerOrAdmin(): Promise<boolean> {
  const role = await getCurrentUserRole()
  return role === 'organizer' || role === 'admin'
}
