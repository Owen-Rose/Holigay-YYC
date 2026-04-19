'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SignupForm } from '@/components/auth/signup-form';
import { signUp } from '@/lib/actions/auth';
import type { SignupInput } from '@/lib/validations/auth';

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(data: SignupInput) {
    setError(null);
    setSuccess(false);

    try {
      const result = await signUp(data);

      if (result.error) {
        setError(result.error);
        return;
      }

      // Show success message - user may need to verify email
      setSuccess(true);
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error('Signup error:', err);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Create an account</h1>
        <p className="mt-2 text-sm text-gray-600">Sign up to manage vendor applications</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="rounded-md bg-green-50 p-4">
          <p className="text-sm text-green-700">
            Account created successfully! Please check your email to verify your account, then{' '}
            <Link href="/login" className="font-medium underline">
              sign in
            </Link>
            .
          </p>
        </div>
      )}

      {/* Signup Form */}
      {!success && <SignupForm onSubmit={handleSubmit} />}

      {/* Links */}
      <div className="text-center text-sm">
        <span className="text-gray-600">Already have an account? </span>
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
          Sign in
        </Link>
      </div>
    </div>
  );
}
