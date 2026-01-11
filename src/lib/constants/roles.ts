/**
 * Role-Based Access Control (RBAC) Constants
 *
 * Defines the application roles and their hierarchy.
 * Used throughout the app for permission checks.
 */

// Available roles in the system
export const ROLES = ['vendor', 'organizer', 'admin'] as const;

// TypeScript type derived from the ROLES array
export type Role = (typeof ROLES)[number];

// Role hierarchy for permission comparison
// Higher number = more permissions
export const ROLE_HIERARCHY: Record<Role, number> = {
  vendor: 0,
  organizer: 1,
  admin: 2,
};

/**
 * Check if a user's role meets the minimum required role level.
 *
 * @param userRole - The role the user currently has
 * @param requiredRole - The minimum role required for access
 * @returns true if userRole >= requiredRole in the hierarchy
 *
 * @example
 * hasMinimumRole('admin', 'organizer') // true - admin can do organizer tasks
 * hasMinimumRole('vendor', 'organizer') // false - vendor cannot do organizer tasks
 * hasMinimumRole('organizer', 'organizer') // true - exact match
 */
export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
