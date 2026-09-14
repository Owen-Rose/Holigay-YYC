'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signupSchema, type SignupInput } from '@/lib/validations/auth';

interface SignupFormProps {
  onSubmit: (data: SignupInput) => Promise<void>;
}

export function SignupForm({ onSubmit }: SignupFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Email Field */}
      <div>
        <label htmlFor="email" className="text-foreground block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          className="border-border bg-surface text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/50 mt-1 block min-h-[44px] w-full rounded-md border px-3 py-2.5 shadow-sm focus:ring-1 focus:outline-none"
          placeholder="you@example.com"
        />
        {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email.message}</p>}
      </div>

      {/* Password Field */}
      <div>
        <label htmlFor="password" className="text-foreground block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          className="border-border bg-surface text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/50 mt-1 block min-h-[44px] w-full rounded-md border px-3 py-2.5 shadow-sm focus:ring-1 focus:outline-none"
          placeholder="Enter your password"
        />
        {errors.password && <p className="mt-1 text-sm text-red-400">{errors.password.message}</p>}
      </div>

      {/* Confirm Password Field */}
      <div>
        <label htmlFor="confirmPassword" className="text-foreground block text-sm font-medium">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register('confirmPassword')}
          className="border-border bg-surface text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/50 mt-1 block min-h-[44px] w-full rounded-md border px-3 py-2.5 shadow-sm focus:ring-1 focus:outline-none"
          placeholder="Confirm your password"
        />
        {errors.confirmPassword && (
          <p className="mt-1 text-sm text-red-400">{errors.confirmPassword.message}</p>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-primary text-primary-foreground hover:bg-primary-hover focus:ring-primary/50 focus:ring-offset-background min-h-[44px] w-full rounded-md px-4 py-2.5 font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? 'Creating account...' : 'Create Account'}
      </button>
    </form>
  );
}
