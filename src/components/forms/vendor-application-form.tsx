'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  applicationFormSchema,
  type ApplicationFormInput,
  PRODUCT_CATEGORIES,
  CATEGORY_LABELS,
} from '@/lib/validations/application';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, type SelectOption } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FileUpload } from '@/components/ui/file-upload';

// =============================================================================
// Types
// =============================================================================

export interface Event {
  id: string;
  name: string;
  date: string;
}

export interface VendorApplicationFormProps {
  events: Event[];
  onSubmit: (data: ApplicationFormInput, files: File[]) => Promise<void>;
}

// =============================================================================
// Constants
// =============================================================================

const boothOptions: SelectOption[] = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'no_preference', label: 'No Preference' },
];

// =============================================================================
// Component
// =============================================================================

export function VendorApplicationForm({ events, onSubmit }: VendorApplicationFormProps) {
  // Files managed separately from form state (not in Zod schema)
  const [files, setFiles] = React.useState<File[]>([]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationFormInput>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: {
      businessName: '',
      contactName: '',
      email: '',
      phone: '',
      website: '',
      description: '',
      eventId: '',
      boothPreference: undefined,
      productCategories: [],
      specialRequirements: '',
    },
  });

  const selectedCategories = watch('productCategories') || [];

  const eventOptions: SelectOption[] = events.map((event) => ({
    value: event.id,
    label: `${event.name} - ${new Date(event.date).toLocaleDateString()}`,
  }));

  const handleFormSubmit = async (data: ApplicationFormInput) => {
    await onSubmit(data, files);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-8">
      {/* Vendor Information Section */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Business Information</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Business Name"
              placeholder="Your business name"
              error={errors.businessName?.message}
              {...register('businessName')}
            />
            <Input
              label="Contact Name"
              placeholder="Primary contact person"
              error={errors.contactName?.message}
              {...register('contactName')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Phone (optional)"
              type="tel"
              placeholder="(123) 456-7890"
              autoComplete="tel"
              error={errors.phone?.message}
              {...register('phone')}
            />
          </div>

          <Input
            label="Website (optional)"
            type="url"
            placeholder="https://www.yourbusiness.com"
            error={errors.website?.message}
            {...register('website')}
          />

          <Textarea
            label="Business Description (optional)"
            placeholder="Tell us about your business and what you sell..."
            hint="Max 1000 characters"
            error={errors.description?.message}
            {...register('description')}
          />
        </div>
      </section>

      {/* Event Selection Section */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Event Details</h2>
        <div className="space-y-4">
          <Select
            label="Select Event"
            placeholder="Choose an event to apply for"
            options={eventOptions}
            error={errors.eventId?.message}
            {...register('eventId')}
          />

          <Select
            label="Booth Preference (optional)"
            placeholder="Select your preference"
            options={boothOptions}
            error={errors.boothPreference?.message}
            {...register('boothPreference')}
          />
        </div>
      </section>

      {/* Product Categories Section */}
      <section>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Product Categories</h2>
        <p className="mb-4 text-sm text-gray-500">
          Select 1-5 categories that best describe your products.
        </p>
        {errors.productCategories && (
          <p className="mb-3 text-sm text-red-600" role="alert">
            {errors.productCategories.message}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_CATEGORIES.map((category) => (
            <Controller
              key={category}
              name="productCategories"
              control={control}
              render={({ field }) => (
                <Checkbox
                  label={CATEGORY_LABELS[category]}
                  checked={field.value?.includes(category)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const newValue = checked
                      ? [...(field.value || []), category]
                      : (field.value || []).filter((v) => v !== category);
                    field.onChange(newValue);
                  }}
                  disabled={
                    !selectedCategories.includes(category) && selectedCategories.length >= 5
                  }
                />
              )}
            />
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {selectedCategories.length}/5 categories selected
        </p>
      </section>

      {/* Special Requirements Section */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Additional Information</h2>
        <Textarea
          label="Special Requirements (optional)"
          placeholder="Let us know if you have any special requirements, such as electrical outlets, extra space, etc."
          hint="Max 500 characters"
          error={errors.specialRequirements?.message}
          {...register('specialRequirements')}
        />
      </section>

      {/* File Upload Section */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Product Photos</h2>
        <FileUpload
          label="Upload product photos (optional)"
          hint="Upload photos of your products to help us review your application"
          value={files}
          onChange={setFiles}
        />
      </section>

      {/* Submit Button */}
      <div className="flex justify-end border-t border-gray-200 pt-4">
        <Button type="submit" size="lg" isLoading={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit Application'}
        </Button>
      </div>
    </form>
  );
}
