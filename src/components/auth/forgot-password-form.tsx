'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { requestPasswordReset } from '@/lib/actions/auth';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(data: ForgotPasswordInput) {
    try {
      const result = await requestPasswordReset(data);

      if (!result.success) {
        setError('email', { message: result.error ?? 'Please enter a valid email address' });
        return;
      }

      setSent(true);
    } catch (err) {
      setError('email', { message: 'An unexpected error occurred. Please try again.' });
      console.error('Password reset error:', err);
    }
  }

  // The same message whether or not the address has an account (FR-021)
  if (sent) {
    return (
      <div role="status" className="bg-primary/10 rounded-md p-4">
        <p className="text-foreground text-sm">
          If that address has an account, a reset link is on its way.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register('email')}
      />

      <Button type="submit" className="w-full" isLoading={isSubmitting}>
        {isSubmitting ? 'Sending...' : 'Send reset link'}
      </Button>
    </form>
  );
}
