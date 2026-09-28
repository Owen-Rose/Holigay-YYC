import { z } from 'zod';

// Roles an admin may invite (spec 010, FR-008). Admin is never invitable.
export const INVITE_ROLES = ['organizer', 'vendor'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

// Invite schema - the transform gives the trimmed, lower-cased address (FR-008)
export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Please enter a valid email address')),
  role: z.enum(INVITE_ROLES, { error: 'Please choose Organizer or Vendor' }).default('organizer'),
});

export type InviteInput = z.infer<typeof inviteSchema>;
