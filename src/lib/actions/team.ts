'use server';

import { requireRole } from '@/lib/actions/roles';

// =============================================================================
// Types
// =============================================================================

export type InviteResponse = {
  success: boolean;
  error: string | null;
};

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Invite a new organizer by email.
 * Requires admin role. Validates email format server-side.
 *
 * TODO (Task 4.2.2): Wire up Supabase Admin API to actually send invites.
 */
export async function inviteOrganizer(email: string): Promise<InviteResponse> {
  // Require admin role
  const auth = await requireRole('admin');
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  // Server-side email validation
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { success: false, error: 'Please enter a valid email address' };
  }

  // Placeholder until Supabase Admin client is set up (Task 4.2.1/4.2.2)
  return {
    success: false,
    error: 'Email service is not configured yet. This feature requires the Supabase service role key.',
  };
}
