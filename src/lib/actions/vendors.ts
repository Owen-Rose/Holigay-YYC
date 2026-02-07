'use server'

import { createClient } from '@/lib/supabase/server'
import { vendorProfileSchema, type VendorProfileInput } from '@/lib/validations/vendor'

// =============================================================================
// Types
// =============================================================================

export type VendorProfile = {
  id: string
  business_name: string
  contact_name: string
  email: string
  phone: string | null
  website: string | null
  description: string | null
}

type GetVendorProfileResult =
  | { success: true; data: VendorProfile }
  | { success: false; error: 'not_authenticated' | 'no_vendor_profile' | 'fetch_failed'; data: null }

type UpdateVendorProfileResult =
  | { success: true }
  | { success: false; error: string }

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Fetches the current vendor's profile, scoped to the authenticated user.
 */
export async function getVendorProfile(): Promise<GetVendorProfileResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'not_authenticated', data: null }
  }

  // Get vendor_id from user_profiles
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('vendor_id')
    .eq('id', user.id)
    .single()

  if (!profile?.vendor_id) {
    return { success: false, error: 'no_vendor_profile', data: null }
  }

  const { data: vendor, error } = await supabase
    .from('vendors')
    .select('id, business_name, contact_name, email, phone, website, description')
    .eq('id', profile.vendor_id)
    .single()

  if (error || !vendor) {
    console.error('Error fetching vendor profile:', error)
    return { success: false, error: 'fetch_failed', data: null }
  }

  return { success: true, data: vendor }
}

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
