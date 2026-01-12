'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';
import { signIn } from '@/lib/actions/auth';
import type { LoginInput } from '@/lib/validations/auth';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(data: LoginInput) {
    setError(null);

    try {
      const result = await signIn(data);

      if (result.error) {
        setError(result.error);
        return;
      }

      // Priority: explicit redirectTo param > role-based redirect > fallback to /vendor
      // This allows deep links (e.g., /login?redirectTo=/dashboard/applications/123) to work
      const explicitRedirect = searchParams.get('redirectTo');
      const redirectTo = explicitRedirect || result.redirectTo || '/vendor';
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error('Login error:', err);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="mt-2 text-sm text-gray-600">Sign in to access your organizer dashboard</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Login Form */}
      <LoginForm onSubmit={handleSubmit} />

      {/* Links */}
      <div className="text-center text-sm">
        <span className="text-gray-600">Don&apos;t have an account? </span>
        <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-500">
          Sign up
        </Link>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="mt-2 text-sm text-gray-600">Sign in to access your organizer dashboard</p>
      </div>
      <div className="animate-pulse space-y-4">
        <div className="h-10 rounded bg-gray-200" />
        <div className="h-10 rounded bg-gray-200" />
        <div className="h-10 rounded bg-gray-200" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}
