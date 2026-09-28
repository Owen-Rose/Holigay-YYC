'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { inviteSchema } from '@/lib/validations/team';
import { inviteOrganizerCore, type InviteResponse } from '@/lib/team/invite-organizer-core';

export type { InviteResponse };

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Invite a team member as an organizer or a vendor (default organizer), or
 * re-send a pending invitation, which keeps the stored role. Requires admin role. The Invite email template owns the link, so no
 * redirectTo is passed (contracts/email-templates.md §1).
 */
export async function inviteOrganizer(email: string, role?: string): Promise<InviteResponse> {
  const auth = await requireRole('admin');
  if (!auth.success) {
    return { success: false, error: auth.error, data: null };
  }

  const parsed = inviteSchema.safeParse({ email, role });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Please enter a valid email address',
      data: null,
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { success: false, error: 'Invites are not configured on this deployment', data: null };
  }

  const result = await inviteOrganizerCore(admin, parsed.data.email, parsed.data.role);

  if (result.success) {
    revalidatePath('/dashboard/team');
    revalidatePath('/dashboard/admin');
  }

  return result;
}
