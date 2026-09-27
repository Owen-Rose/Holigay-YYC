import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

// Not in the middleware's authRoutes: it renders for signed-in visitors too (FR-019).
export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-foreground text-2xl font-bold">Reset your password</h1>
        <p className="text-muted mt-2 text-sm">
          Enter the email on your account and we&apos;ll send a link to choose a new password.
        </p>
      </div>

      <ForgotPasswordForm />

      <div className="text-center text-sm">
        <Link href="/login" className="text-primary hover:text-primary-hover font-medium">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
