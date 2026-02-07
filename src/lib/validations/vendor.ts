import { z } from 'zod'

// =============================================================================
// Custom Validators (same as application.ts for consistency)
// =============================================================================

const phoneRegex = /^(\+1)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/
const websiteRegex =
  /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/

// =============================================================================
// Vendor Profile Schema
// =============================================================================

/**
 * Schema for editing vendor profile information.
 * Email is excluded — it's displayed read-only since it's the identity link.
 */
export const vendorProfileSchema = z.object({
  businessName: z
    .string()
    .min(2, 'Business name must be at least 2 characters')
    .max(100, 'Business name must be less than 100 characters'),
  contactName: z
    .string()
    .min(2, 'Contact name must be at least 2 characters')
    .max(100, 'Contact name must be less than 100 characters'),
  phone: z
    .string()
    .regex(phoneRegex, 'Please enter a valid phone number')
    .optional()
    .or(z.literal('')),
  website: z
    .string()
    .regex(websiteRegex, 'Please enter a valid website URL')
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional()
    .or(z.literal('')),
})

// =============================================================================
// TypeScript Types
// =============================================================================

export type VendorProfileInput = z.infer<typeof vendorProfileSchema>
