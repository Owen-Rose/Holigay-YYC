import { z } from 'zod';
import { productLinkFieldsSchema } from './product-links';

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
] as const;

// Human-readable file type labels
export const FILE_TYPE_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG Image',
  'image/png': 'PNG Image',
  'image/gif': 'GIF Image',
  'image/webp': 'WebP Image',
  'application/pdf': 'PDF Document',
};

// File size limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
export const MAX_FILES = 5;

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
});

/**
 * Schema for multiple file attachments
 */
export const filesSchema = z
  .array(fileSchema)
  .max(MAX_FILES, `Maximum ${MAX_FILES} files allowed`)
  .optional();

// =============================================================================
// Vendor Information Schema
// =============================================================================

/**
 * Schema for vendor business information — the apply form's contact block.
 * Spec 011: the product-link trio (Link 1 required) replaces phone and website.
 */
export const vendorInfoSchema = z
  .object({
    businessName: z
      .string()
      .min(2, 'Business name must be at least 2 characters')
      .max(100, 'Business name must be less than 100 characters'),
    contactName: z
      .string()
      .min(2, 'Contact name must be at least 2 characters')
      .max(100, 'Contact name must be less than 100 characters'),
    // Trimmed and lower-cased so the stored vendor row matches the GoTrue
    // account (which is always lower-cased) and handle_new_user can link them.
    email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
    description: z
      .string()
      .max(1000, 'Description must be less than 1000 characters')
      .optional()
      .or(z.literal('')),
  })
  .extend(productLinkFieldsSchema.shape);

// =============================================================================
// TypeScript Types
// =============================================================================

export type FileInput = z.infer<typeof fileSchema>;
export type VendorInfo = z.infer<typeof vendorInfoSchema>;

// Allowed file type
export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number];
