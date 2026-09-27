import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SetPasswordForm } from '@/components/auth/set-password-form';

// Reached signed in from an invite or recovery link via /auth/confirm, or directly
// by any signed-in user. Signed-out visitors are sent to /login with a notice.
export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?reason=session-required');
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-foreground text-2xl font-bold">Set your password</h1>
        <p className="text-muted mt-2 text-sm">
          Choose a password for your Holigay Vendor Market account.
        </p>
      </div>

      <SetPasswordForm />
    </div>
  );
}
