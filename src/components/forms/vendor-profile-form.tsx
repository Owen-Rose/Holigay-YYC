'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { vendorProfileSchema, type VendorProfileInput } from '@/lib/validations/vendor'
import { updateVendorProfile } from '@/lib/actions/vendors'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

// =============================================================================
// Types
// =============================================================================

interface VendorProfileFormProps {
  defaultValues: VendorProfileInput
  email: string // displayed read-only
}

// =============================================================================
// Form Component
// =============================================================================

export function VendorProfileForm({ defaultValues, email }: VendorProfileFormProps) {
  const [submitResult, setSubmitResult] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<VendorProfileInput>({
    resolver: zodResolver(vendorProfileSchema),
    defaultValues,
  })

  async function onSubmit(data: VendorProfileInput) {
    setSubmitResult(null)

    const result = await updateVendorProfile(data)

    if (result.success) {
      setSubmitResult({ type: 'success', message: 'Profile updated successfully.' })
    } else {
      setSubmitResult({ type: 'error', message: result.error })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Email (read-only) */}
      <Input label="Email" value={email} disabled hint="Email cannot be changed" />

      {/* Editable fields */}
      <Input
        label="Business Name"
        placeholder="Your business name"
        error={errors.businessName?.message}
        {...register('businessName')}
      />

      <Input
        label="Contact Name"
        placeholder="Your full name"
        error={errors.contactName?.message}
        {...register('contactName')}
      />

      <Input
        label="Phone"
        type="tel"
        placeholder="(123) 456-7890"
        error={errors.phone?.message}
        {...register('phone')}
      />

      <Input
        label="Website"
        placeholder="https://your-website.com"
        error={errors.website?.message}
        {...register('website')}
      />

      <Textarea
        label="Business Description"
        placeholder="Tell us about your business and products..."
        hint="Max 1000 characters"
        error={errors.description?.message}
        {...register('description')}
      />

      {/* Submit feedback */}
      {submitResult && (
        <div
          role="alert"
          className={`rounded-md p-3 text-sm ${
            submitResult.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {submitResult.message}
        </div>
      )}

      {/* Submit button */}
      <div className="flex justify-end">
        <Button type="submit" isLoading={isSubmitting} disabled={!isDirty}>
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}
