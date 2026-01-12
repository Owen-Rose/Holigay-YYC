'use server';

/**
 * Vendor Portal Server Actions
 *
 * Server actions specifically for the vendor portal. These actions are
 * designed for authenticated vendors to view their own data.
 */

import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Types
// =============================================================================

/**
 * Vendor profile information
 */
export type VendorProfile = {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string | null;
  website: string | null;
  description: string | null;
};

/**
 * Application with event details for vendor view
 */
export type VendorApplication = {
  id: string;
  status: string;
  submittedAt: string;
  boothPreference: string | null;
  productCategories: string[] | null;
  event: {
    id: string;
    name: string;
    eventDate: string;
    location: string;
  } | null;
};

/**
 * Application counts grouped by status
 */
export type ApplicationCounts = {
  pending: number;
  approved: number;
  rejected: number;
  waitlisted: number;
  total: number;
};

/**
 * Response type for vendor dashboard data
 */
export type VendorDashboardResponse = {
  success: boolean;
  error: string | null;
  data: {
    user: {
      email: string;
    };
    vendor: VendorProfile | null;
    applications: VendorApplication[];
    counts: ApplicationCounts;
  } | null;
};

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Fetches all data needed for the vendor dashboard home page
 *
 * This action:
 * 1. Gets the current authenticated user
 * 2. Finds their vendor profile (if they've submitted applications before)
 * 3. Fetches their applications with event details
 * 4. Calculates application counts by status
 *
 * @returns VendorDashboardResponse with vendor profile, applications, and counts
 */
export async function getVendorDashboardData(): Promise<VendorDashboardResponse> {
  const supabase = await createClient();

  // ---------------------------------------------------------------------------
  // Step 1: Get current authenticated user
  // ---------------------------------------------------------------------------
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    return {
      success: false,
      error: 'Not authenticated',
      data: null,
    };
  }

  const userEmail = user.email;

  // ---------------------------------------------------------------------------
  // Step 2: Find vendor profile by user email
  // ---------------------------------------------------------------------------
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .select('id, business_name, contact_name, email, phone, website, description')
    .eq('email', userEmail)
    .single();

  // PGRST116 = no rows found, which is ok for new users
  if (vendorError && vendorError.code !== 'PGRST116') {
    console.error('Error fetching vendor profile:', vendorError);
    return {
      success: false,
      error: 'Failed to fetch vendor profile',
      data: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Step 3: Fetch applications if vendor exists
  // ---------------------------------------------------------------------------
  let applications: VendorApplication[] = [];
  const counts: ApplicationCounts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    waitlisted: 0,
    total: 0,
  };

  if (vendor) {
    const { data: appData, error: appError } = await supabase
      .from('applications')
      .select(
        `
        id,
        status,
        submitted_at,
        booth_preference,
        product_categories,
        event:events (
          id,
          name,
          event_date,
          location
        )
      `
      )
      .eq('vendor_id', vendor.id)
      .order('submitted_at', { ascending: false });

    if (appError) {
      console.error('Error fetching applications:', appError);
      // Don't fail completely - just return empty applications
    } else {
      // Transform to camelCase for frontend
      applications = (appData || []).map((app) => {
        // Handle the event join - Supabase returns it as an object
        const eventData = app.event as { id: string; name: string; event_date: string; location: string } | null;

        return {
          id: app.id,
          status: app.status,
          submittedAt: app.submitted_at,
          boothPreference: app.booth_preference,
          productCategories: app.product_categories,
          event: eventData
            ? {
                id: eventData.id,
                name: eventData.name,
                eventDate: eventData.event_date,
                location: eventData.location,
              }
            : null,
        };
      });

      // Calculate counts by status
      counts.total = applications.length;
      for (const app of applications) {
        if (app.status === 'pending') counts.pending++;
        else if (app.status === 'approved') counts.approved++;
        else if (app.status === 'rejected') counts.rejected++;
        else if (app.status === 'waitlisted') counts.waitlisted++;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Return dashboard data
  // ---------------------------------------------------------------------------
  return {
    success: true,
    error: null,
    data: {
      user: {
        email: userEmail,
      },
      vendor: vendor
        ? {
            id: vendor.id,
            businessName: vendor.business_name,
            contactName: vendor.contact_name,
            email: vendor.email,
            phone: vendor.phone,
            website: vendor.website,
            description: vendor.description,
          }
        : null,
      applications,
      counts,
    },
  };
}
