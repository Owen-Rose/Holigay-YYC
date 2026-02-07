'use server'

import { createClient } from '@/lib/supabase/server'

// =============================================================================
// Types
// =============================================================================

export type VendorApplication = {
  id: string
  status: string
  submitted_at: string
  event: {
    id: string
    name: string
    event_date: string
    location: string
  }
}

export type VendorDashboardData = {
  counts: {
    pending: number
    approved: number
    rejected: number
    total: number
  }
  recentApplications: VendorApplication[]
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Fetches dashboard data scoped to the current vendor.
 * Returns application counts and recent applications with event info.
 * Returns null if the user has no linked vendor profile.
 */
export async function getVendorDashboardData(): Promise<VendorDashboardData | null> {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Get vendor_id from user_profiles
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('vendor_id')
    .eq('id', user.id)
    .single()

  if (!profile?.vendor_id) return null

  const vendorId = profile.vendor_id

  // Fetch all applications for this vendor (status only, for counts)
  const { data: allApps, error: countError } = await supabase
    .from('applications')
    .select('status')
    .eq('vendor_id', vendorId)

  if (countError) {
    console.error('Error fetching vendor application counts:', countError)
  }

  const counts = { pending: 0, approved: 0, rejected: 0, total: 0 }
  for (const app of allApps || []) {
    counts.total++
    if (app.status === 'pending') counts.pending++
    else if (app.status === 'approved') counts.approved++
    else if (app.status === 'rejected') counts.rejected++
  }

  // Fetch recent 5 applications with event info
  const { data: recentApps, error: recentError } = await supabase
    .from('applications')
    .select(
      `
      id,
      status,
      submitted_at,
      event:events (
        id,
        name,
        event_date,
        location
      )
    `
    )
    .eq('vendor_id', vendorId)
    .order('submitted_at', { ascending: false })
    .limit(5)

  if (recentError) {
    console.error('Error fetching vendor recent applications:', recentError)
  }

  // Filter out any applications with missing event data
  const recentApplications: VendorApplication[] = (recentApps || [])
    .filter((app) => app.event !== null)
    .map((app) => ({
      id: app.id,
      status: app.status,
      submitted_at: app.submitted_at,
      event: app.event as VendorApplication['event'],
    }))

  return { counts, recentApplications }
}

// =============================================================================
// Vendor Applications List
// =============================================================================

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'waitlisted']

type VendorApplicationsListResult =
  | { success: true; data: VendorApplication[] }
  | { success: false; error: string; data: null }

/**
 * Fetches all applications for the current vendor, optionally filtered by status.
 * Returns null data if the user has no linked vendor profile.
 */
export async function getVendorApplicationsList(
  status?: string | null
): Promise<VendorApplicationsListResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'not_authenticated', data: null }
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('vendor_id')
    .eq('id', user.id)
    .single()

  if (!profile?.vendor_id) {
    return { success: false, error: 'no_vendor_profile', data: null }
  }

  let query = supabase
    .from('applications')
    .select(
      `
      id,
      status,
      submitted_at,
      event:events (
        id,
        name,
        event_date,
        location
      )
    `
    )
    .eq('vendor_id', profile.vendor_id)
    .order('submitted_at', { ascending: false })

  if (status && VALID_STATUSES.includes(status)) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching vendor applications list:', error)
    return { success: false, error: 'fetch_failed', data: null }
  }

  const applications: VendorApplication[] = (data || [])
    .filter((app) => app.event !== null)
    .map((app) => ({
      id: app.id,
      status: app.status,
      submitted_at: app.submitted_at,
      event: app.event as VendorApplication['event'],
    }))

  return { success: true, data: applications }
}

// =============================================================================
// Vendor Application Detail
// =============================================================================

export type VendorApplicationDetail = {
  id: string
  status: string
  submitted_at: string
  updated_at: string
  booth_preference: string | null
  product_categories: string[] | null
  special_requirements: string | null
  vendor: {
    business_name: string
    contact_name: string
    email: string
    phone: string | null
    website: string | null
    description: string | null
  }
  event: {
    id: string
    name: string
    event_date: string
    location: string
    description: string | null
    application_deadline: string | null
    max_vendors: number | null
    status: string
  }
  attachments: {
    id: string
    file_name: string
    file_path: string
    file_type: string
    file_size: number | null
    uploaded_at: string
  }[]
}

type VendorApplicationDetailResult =
  | { success: true; data: VendorApplicationDetail }
  | { success: false; error: 'not_authenticated' | 'no_vendor_profile' | 'not_found' | 'fetch_failed'; data: null }

/**
 * Fetches a single application with full details, scoped to the current vendor.
 * Verifies the application belongs to this vendor before returning data.
 * Excludes organizer_notes since this is a vendor-facing view.
 */
export async function getVendorApplicationDetail(
  applicationId: string
): Promise<VendorApplicationDetailResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'not_authenticated', data: null }
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('vendor_id')
    .eq('id', user.id)
    .single()

  if (!profile?.vendor_id) {
    return { success: false, error: 'no_vendor_profile', data: null }
  }

  // Fetch application with vendor and event data, scoped to this vendor
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select(
      `
      id,
      status,
      submitted_at,
      updated_at,
      booth_preference,
      product_categories,
      special_requirements,
      vendor:vendors (
        business_name,
        contact_name,
        email,
        phone,
        website,
        description
      ),
      event:events (
        id,
        name,
        event_date,
        location,
        description,
        application_deadline,
        max_vendors,
        status
      )
    `
    )
    .eq('id', applicationId)
    .eq('vendor_id', profile.vendor_id)
    .single()

  if (appError) {
    if (appError.code === 'PGRST116') {
      return { success: false, error: 'not_found', data: null }
    }
    console.error('Error fetching vendor application detail:', appError)
    return { success: false, error: 'fetch_failed', data: null }
  }

  if (!application?.vendor || !application?.event) {
    return { success: false, error: 'not_found', data: null }
  }

  // Fetch attachments for this application
  const { data: attachments, error: attachError } = await supabase
    .from('attachments')
    .select('id, file_name, file_path, file_type, file_size, uploaded_at')
    .eq('application_id', applicationId)
    .order('uploaded_at', { ascending: true })

  if (attachError) {
    console.error('Error fetching attachments:', attachError)
  }

  return {
    success: true,
    data: {
      id: application.id,
      status: application.status,
      submitted_at: application.submitted_at,
      updated_at: application.updated_at,
      booth_preference: application.booth_preference,
      product_categories: application.product_categories,
      special_requirements: application.special_requirements,
      vendor: application.vendor as VendorApplicationDetail['vendor'],
      event: application.event as VendorApplicationDetail['event'],
      attachments: attachments || [],
    },
  }
}
