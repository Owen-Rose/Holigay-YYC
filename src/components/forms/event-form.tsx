'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  eventFormSchema,
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  type EventFormInput,
} from '@/lib/validations/event';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

// =============================================================================
// Types
// =============================================================================

interface EventFormProps {
  /** Pre-filled values for edit mode */
  defaultValues?: EventFormInput;
  /** Called with validated data on submit */
  onSubmit: (data: EventFormInput) => Promise<{ success: boolean; error?: string }>;
  /** Controls button label and heading */
  mode?: 'create' | 'edit';
}

// =============================================================================
// Component
// =============================================================================

export function EventForm({ defaultValues, onSubmit, mode = 'create' }: EventFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EventFormInput>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: defaultValues ?? {
      name: '',
      description: '',
      eventDate: '',
      location: '',
      applicationDeadline: '',
      status: 'draft',
      maxVendors: '',
    },
  });

  async function handleFormSubmit(data: EventFormInput) {
    const result = await onSubmit(data);

    if (result.success) {
      toast.success(mode === 'create' ? 'Event created' : 'Event updated');
    } else {
      toast.error(result.error || 'Something went wrong');
    }
  }

  const statusOptions = EVENT_STATUSES.map((s) => ({
    value: s,
    label: EVENT_STATUS_LABELS[s],
  }));

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-8">
      {/* Event Details */}
      <section>
        <h2 className="text-foreground mb-4 text-lg font-semibold">Event Details</h2>
        <div className="space-y-4">
          <Input
            label="Event Name"
            placeholder="e.g. Summer Holigay Market 2026"
            error={errors.name?.message}
            {...register('name')}
          />

          <Textarea
            label="Description"
            placeholder="Describe the event, what vendors can expect, etc."
            hint="Optional — max 2000 characters"
            error={errors.description?.message}
            {...register('description')}
          />

          <Input
            label="Location"
            placeholder="e.g. Calgary Community Hall, 123 Main St"
            error={errors.location?.message}
            {...register('location')}
          />
        </div>
      </section>

      {/* Dates */}
      <section>
        <h2 className="text-foreground mb-4 text-lg font-semibold">Dates</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Event Date"
            type="date"
            error={errors.eventDate?.message}
            {...register('eventDate')}
          />

          <Input
            label="Application Deadline"
            type="date"
            hint="Optional — when vendor applications close"
            error={errors.applicationDeadline?.message}
            {...register('applicationDeadline')}
          />
        </div>
      </section>

      {/* Settings */}
      <section>
        <h2 className="text-foreground mb-4 text-lg font-semibold">Settings</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Status"
            options={statusOptions}
            error={errors.status?.message}
            {...register('status')}
          />

          <Input
            label="Max Vendors"
            type="number"
            placeholder="No limit"
            min={1}
            hint="Optional — maximum number of vendors"
            error={errors.maxVendors?.message}
            {...register('maxVendors')}
          />
        </div>
      </section>

      {/* Submit button */}
      <div className="border-border-subtle flex justify-end border-t pt-4">
        <Button type="submit" isLoading={isSubmitting} disabled={mode === 'edit' && !isDirty}>
          {isSubmitting
            ? mode === 'create'
              ? 'Creating...'
              : 'Saving...'
            : mode === 'create'
              ? 'Create Event'
              : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
