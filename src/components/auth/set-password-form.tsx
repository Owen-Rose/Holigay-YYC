'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { setPassword } from '@/lib/actions/auth';
import { setPasswordSchema, type SetPasswordInput } from '@/lib/validations/auth';

export function SetPasswordForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
  });

  async function onSubmit(data: SetPasswordInput) {
    try {
      const result = await setPassword(data);

      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Failed to set password');
        return;
      }

      toast.success('Password set');
      router.push(result.data.redirectTo);
      router.refresh();
    } catch (err) {
      toast.error('An unexpected error occurred. Please try again.');
      console.error('Set password error:', err);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 6 characters"
        error={errors.password?.message}
        {...register('password')}
      />

      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        placeholder="Enter the password again"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <Button type="submit" className="w-full" isLoading={isSubmitting}>
        {isSubmitting ? 'Setting password...' : 'Set password'}
      </Button>
    </form>
  );
}
