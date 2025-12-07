import { z } from 'zod'

// =============================================================================
// Constants
// =============================================================================

// Allowed file types for attachments
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
] as const

// Human-readable file type labels
export const FILE_TYPE_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG Image',
  'image/png': 'PNG Image',
  'image/gif': 'GIF Image',
  'image/webp': 'WebP Image',
  'application/pdf': 'PDF Document',
}

// File size limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes
export const MAX_FILES = 5

// Booth preference options
export const BOOTH_PREFERENCES = [
  'indoor',
  'outdoor',
  'no_preference',
] as const

// Product category options
export const PRODUCT_CATEGORIES = [
  'handmade_crafts',
  'jewelry',
  'clothing',
  'art',
  'food_beverages',
  'home_decor',
  'beauty_wellness',
  'vintage_antiques',
  'plants_flowers',
  'pet_products',
  'other',
] as const

// Human-readable category labels
export const CATEGORY_LABELS: Record<string, string> = {
  handmade_crafts: 'Handmade Crafts',
  jewelry: 'Jewelry & Accessories',
  clothing: 'Clothing & Apparel',
  art: 'Art & Prints',
  food_beverages: 'Food & Beverages',
  home_decor: 'Home Decor',
  beauty_wellness: 'Beauty & Wellness',
  vintage_antiques: 'Vintage & Antiques',
  plants_flowers: 'Plants & Flowers',
  pet_products: 'Pet Products',
  other: 'Other',
}

// =============================================================================
// Custom Validators
// =============================================================================

/**
 * Validates US phone number format
 * Accepts: (123) 456-7890, 123-456-7890, 123.456.7890, 1234567890
 */
const phoneRegex = /^(\+1)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/

/**
 * Validates URL format (optional protocol)
 */
const websiteRegex =
  /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/

// =============================================================================
// File Validation Schema
// =============================================================================

/**
 * Schema for validating a single file attachment
 * Note: Actual file upload validation happens server-side
 */
export const fileSchema = z.object({
  name: z.string().min(1, 'File name is required'),
  size: z
    .number()
    .max(MAX_FILE_SIZE, `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`),
  type: z.enum(ALLOWED_FILE_TYPES, {
    message: `File type must be one of: ${Object.values(FILE_TYPE_LABELS).join(', ')}`,
  }),
})

/**
 * Schema for multiple file attachments
 */
export const filesSchema = z
  .array(fileSchema)
  .max(MAX_FILES, `Maximum ${MAX_FILES} files allowed`)
  .optional()

// =============================================================================
// Vendor Information Schema
// =============================================================================

/**
 * Schema for vendor business information
 */
export const vendorInfoSchema = z.object({
  businessName: z
    .string()
    .min(2, 'Business name must be at least 2 characters')
    .max(100, 'Business name must be less than 100 characters'),
  contactName: z
    .string()
    .min(2, 'Contact name must be at least 2 characters')
    .max(100, 'Contact name must be less than 100 characters'),
  email: z.string().email('Please enter a valid email address'),
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
// Application Details Schema
// =============================================================================

/**
 * Schema for application-specific details
 */
export const applicationDetailsSchema = z.object({
  eventId: z.string().uuid('Please select a valid event'),
  boothPreference: z.enum(BOOTH_PREFERENCES).optional(),
  productCategories: z
    .array(z.enum(PRODUCT_CATEGORIES))
    .min(1, 'Please select at least one product category')
    .max(5, 'Please select no more than 5 categories'),
  specialRequirements: z
    .string()
    .max(500, 'Special requirements must be less than 500 characters')
    .optional()
    .or(z.literal('')),
})

// =============================================================================
// Complete Application Form Schema
// =============================================================================

/**
 * Complete schema for the vendor application form
 * Combines vendor info, application details, and file attachments
 */
export const applicationFormSchema = z.object({
  // Vendor Information
  businessName: vendorInfoSchema.shape.businessName,
  contactName: vendorInfoSchema.shape.contactName,
  email: vendorInfoSchema.shape.email,
  phone: vendorInfoSchema.shape.phone,
  website: vendorInfoSchema.shape.website,
  description: vendorInfoSchema.shape.description,

  // Application Details
  eventId: applicationDetailsSchema.shape.eventId,
  boothPreference: applicationDetailsSchema.shape.boothPreference,
  productCategories: applicationDetailsSchema.shape.productCategories,
  specialRequirements: applicationDetailsSchema.shape.specialRequirements,

  // File Attachments (validated separately during upload)
  // Files are handled as File objects in the form but validated on upload
})

// =============================================================================
// Server-Side Submission Schema
// =============================================================================

/**
 * Schema for server-side application submission
 * Includes uploaded file paths instead of File objects
 */
export const applicationSubmitSchema = applicationFormSchema.extend({
  attachments: z
    .array(
      z.object({
        fileName: z.string(),
        filePath: z.string(),
        fileType: z.string(),
        fileSize: z.number().optional(),
      })
    )
    .optional(),
})

// =============================================================================
// TypeScript Types
// =============================================================================

export type FileInput = z.infer<typeof fileSchema>
export type VendorInfo = z.infer<typeof vendorInfoSchema>
export type ApplicationDetails = z.infer<typeof applicationDetailsSchema>
export type ApplicationFormInput = z.infer<typeof applicationFormSchema>
export type ApplicationSubmitInput = z.infer<typeof applicationSubmitSchema>

// Booth preference type
export type BoothPreference = (typeof BOOTH_PREFERENCES)[number]

// Product category type
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

// Allowed file type
export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number]
