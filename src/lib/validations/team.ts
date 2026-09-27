import { z } from 'zod';

// Invite schema - the transform gives the trimmed, lower-cased address (FR-008)
export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Please enter a valid email address')),
});

export type InviteInput = z.infer<typeof inviteSchema>;
