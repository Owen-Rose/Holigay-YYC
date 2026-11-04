'use server';

import { createClient } from '@/lib/supabase/server';
import { resolveVendorId } from '@/lib/vendor/resolve-vendor-id';
import { vendorProfileSchema, type VendorProfileInput } from '@/lib/validations/vendor';
import { compactProductLinks } from '@/lib/validations/product-links';

// =============================================================================
// Types
// =============================================================================

type UpdateVendorProfileResult = { success: true } | { success: false; error: string };

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Updates the current vendor's profile.
 * Validates input with Zod and ensures user can only update their own record.
 */
export async function updateVendorProfile(
  data: VendorProfileInput
): Promise<UpdateVendorProfileResult> {
  // Validate input
  const parsed = vendorProfileSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // The tied vendor scopes the update (tying it first if an untied row has the
  // account's address — spec 011 FR-001); RLS enforces the same scope.
  const vendorId = await resolveVendorId(supabase, user.id);
  if (!vendorId) {
    return { success: false, error: 'No vendor profile linked to your account' };
  }

  const { error } = await supabase
    .from('vendors')
    .update({
      business_name: parsed.data.businessName,
      contact_name: parsed.data.contactName,
      description: parsed.data.description || null,
      // Spec 011: the links replace phone and website (both columns kept, no longer written)
      product_links: compactProductLinks(parsed.data),
      updated_at: new Date().toISOString(),
    })
    .eq('id', vendorId);

  if (error) {
    console.error('Error updating vendor profile:', error);
    return { success: false, error: 'Failed to update profile' };
  }

  return { success: true };
}
