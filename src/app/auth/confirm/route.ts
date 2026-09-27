import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /auth/confirm — turns an emailed one-time link into a signed-in session.
 *
 * Every auth email template (invite, recovery, signup, email change) points here.
 * The only side effect is `verifyOtp`, which writes the session cookies through the
 * cookie-backed server client. Nothing from the query string is ever logged.
 *
 * Contract: specs/009-organizer-invites/contracts/auth-confirm-route.md
 */

export const dynamic = 'force-dynamic';

const confirmQuerySchema = z.object({
  token_hash: z.string().min(1),
  type: z.enum(['invite', 'recovery', 'signup', 'email', 'email_change']),
  next: z.string().optional(),
});

type ConfirmType = z.infer<typeof confirmQuerySchema>['type'];

// String equality only — no prefix or origin matching (research R3).
const ALLOWED_NEXT = new Set(['/set-password', '/dashboard', '/vendor-dashboard']);

const KIND_DEFAULT: Record<ConfirmType, string> = {
  invite: '/set-password',
  recovery: '/set-password',
  signup: '/vendor-dashboard',
  email: '/vendor-dashboard',
  email_change: '/vendor-dashboard',
};

const LINK_INVALID = '/login?reason=link-invalid';

export async function GET(request: NextRequest) {
  const parsed = confirmQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));

  if (!parsed.success) {
    return NextResponse.redirect(new URL(LINK_INVALID, request.url));
  }

  const { token_hash, type, next } = parsed.data;
  const destination = next !== undefined && ALLOWED_NEXT.has(next) ? next : KIND_DEFAULT[type];

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    console.error('[auth/confirm] verify failed', error.code ?? error.name);
    return NextResponse.redirect(new URL(LINK_INVALID, request.url));
  }

  return NextResponse.redirect(new URL(destination, request.url));
}
