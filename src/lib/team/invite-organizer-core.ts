import type { AuthError, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { InviteRole } from '@/lib/validations/team';

// =============================================================================
// The Next-free core of inviteOrganizer (contracts/server-actions.md, steps a–f).
//
// Kept out of src/lib/actions/team.ts on purpose: every async export of a
// 'use server' module becomes a callable server action, and this function has
// no requireRole() of its own. The caller must already have passed
// requireRole('admin'). The security suite calls it directly with a
// generateLink-based sender (research R8).
// =============================================================================

export type InviteResponse = {
  success: boolean;
  error: string | null;
  data: { resent: boolean } | null;
};

export type InviteDeps = {
  /** Defaults to admin.auth.admin.inviteUserByEmail(email). The security suite injects a generateLink-based sender. */
  sendInvite?: (email: string) => Promise<{ data: { user: User | null }; error: AuthError | null }>;
};

export const EXISTING_ACCOUNT_MESSAGE =
  'That email already has an account. Change their role on the Admin page instead.';
const SEND_FAILED_MESSAGE = 'Failed to send invitation';

/**
 * Invite `email` with `role` (spec 010), or re-send a pending invitation. On a
 * re-send the role argument is ignored: the invitee keeps their stored role.
 */
export async function inviteOrganizerCore(
  admin: SupabaseClient<Database>,
  email: string,
  role: InviteRole,
  deps: InviteDeps = {}
): Promise<InviteResponse> {
  const sendInvite =
    deps.sendInvite ?? ((address: string) => admin.auth.admin.inviteUserByEmail(address));

  // a. Look the address up — the view covers every account, whatever its role
  const { data: existing, error: lookupError } = await admin
    .from('users_with_roles')
    .select('id, invite_pending')
    .eq('email', email)
    .maybeSingle();

  if (lookupError) {
    console.error('[inviteOrganizer] lookup', lookupError.code ?? lookupError.message);
    return { success: false, error: SEND_FAILED_MESSAGE, data: null };
  }

  // b. Anyone who has confirmed or signed in already has an account (FR-002)
  if (existing && existing.invite_pending !== true) {
    return { success: false, error: EXISTING_ACCOUNT_MESSAGE, data: null };
  }

  // c. Send (or re-send) the invitation
  const { data: sent, error: sendError } = await sendInvite(email);

  if (sendError) {
    if (sendError.code === 'email_exists') {
      return { success: false, error: EXISTING_ACCOUNT_MESSAGE, data: null };
    }
    console.error('[inviteOrganizer] send', sendError.code ?? sendError.message);
    return { success: false, error: SEND_FAILED_MESSAGE, data: null };
  }

  // d. A pending invitee keeps whatever role they already have (FR-003, FR-005)
  if (existing) {
    return { success: true, error: null, data: { resent: true } };
  }

  // e. New user: handle_new_user created them as a vendor; set the chosen role
  const userId = sent.user?.id;
  const { error: roleError } = userId
    ? await admin.from('user_profiles').update({ role }).eq('id', userId)
    : { error: { code: 'no_user', message: 'invite returned no user' } };

  if (roleError) {
    console.error('[inviteOrganizer] role', roleError.code ?? roleError.message);
    return {
      success: false,
      error: 'Invitation sent, but the role could not be set. Set it on the Admin page.',
      data: null,
    };
  }

  // f.
  return { success: true, error: null, data: { resent: false } };
}
