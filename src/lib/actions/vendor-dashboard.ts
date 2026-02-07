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
