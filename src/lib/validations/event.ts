import { z } from 'zod'

// =============================================================================
// Constants
// =============================================================================

export const EVENT_STATUSES = ['draft', 'active', 'closed'] as const

export const EVENT_STATUS_LABELS: Record<(typeof EVENT_STATUSES)[number], string> = {
  draft: 'Draft',
  active: 'Active',
  closed: 'Closed',
}

// =============================================================================
// Event Form Schema
// =============================================================================

export const eventFormSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Event name must be at least 2 characters')
      .max(200, 'Event name must be less than 200 characters'),
    description: z
      .string()
      .max(2000, 'Description must be less than 2000 characters')
      .optional()
      .or(z.literal('')),
    eventDate: z.string().min(1, 'Event date is required'),
    location: z
      .string()
      .min(2, 'Location must be at least 2 characters')
      .max(200, 'Location must be less than 200 characters'),
    applicationDeadline: z.string().optional().or(z.literal('')),
    status: z.enum(EVENT_STATUSES, {
      message: 'Please select a valid status',
    }),
    maxVendors: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine(
        (val) => {
          if (!val || val === '') return true
          const num = parseInt(val, 10)
          return !isNaN(num) && num >= 1 && num <= 9999 && Number.isInteger(num)
        },
        { message: 'Must be a whole number between 1 and 9,999' }
      ),
  })
  .refine(
    (data) => {
      // If both dates are set, deadline must be before or on the event date
      if (data.applicationDeadline && data.eventDate) {
        return new Date(data.applicationDeadline) <= new Date(data.eventDate)
      }
      return true
    },
    {
      message: 'Application deadline must be on or before the event date',
      path: ['applicationDeadline'],
    }
  )

// =============================================================================
// TypeScript Types
// =============================================================================

export type EventFormInput = z.infer<typeof eventFormSchema>
