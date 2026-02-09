'use server'

import { createClient } from '@/lib/supabase/server'
import { vendorProfileSchema, type VendorProfileInput } from '@/lib/validations/vendor'

// =============================================================================
// Types
// =============================================================================

type UpdateVendorProfileResult =
  | { success: true }
  | { success: false; error: string }

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
  const parsed = vendorProfileSchema.safeParse(data)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Get vendor_id from user_profiles to scope the update
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('vendor_id')
    .eq('id', user.id)
    .single()

  if (!profile?.vendor_id) {
    return { success: false, error: 'No vendor profile linked to your account' }
  }

  const { error } = await supabase
    .from('vendors')
    .update({
      business_name: parsed.data.businessName,
      contact_name: parsed.data.contactName,
      phone: parsed.data.phone || null,
      website: parsed.data.website || null,
      description: parsed.data.description || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.vendor_id)

  if (error) {
    console.error('Error updating vendor profile:', error)
    return { success: false, error: 'Failed to update profile' }
  }

  return { success: true }
}
