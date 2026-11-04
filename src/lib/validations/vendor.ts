import { z } from 'zod';
import { productLinkFieldsSchema } from './product-links';

// =============================================================================
// Vendor Profile Schema
// =============================================================================

/**
 * Schema for editing vendor profile information.
 * Email is excluded — it's displayed read-only since it's the identity link.
 * Spec 011: the product-link trio (Link 1 required) replaces phone and website.
 */
export const vendorProfileSchema = z
  .object({
    businessName: z
      .string()
      .min(2, 'Business name must be at least 2 characters')
      .max(100, 'Business name must be less than 100 characters'),
    contactName: z
      .string()
      .min(2, 'Contact name must be at least 2 characters')
      .max(100, 'Contact name must be less than 100 characters'),
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

export type VendorProfileInput = z.infer<typeof vendorProfileSchema>;
