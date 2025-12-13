'use server'

import { createClient } from '@/lib/supabase/server'
import {
  applicationSubmitSchema,
  type ApplicationSubmitInput,
} from '@/lib/validations/application'

// =============================================================================
// Types
// =============================================================================

/**
 * Response type for application submission
 */
export type ApplicationResponse = {
  success: boolean
  error: string | null
  data: {
    applicationId: string
    vendorId: string
  } | null
}

/**
 * Filter parameters for fetching applications
 */
export type ApplicationFilters = {
  status?: string | null
  search?: string | null
  eventId?: string | null
}

/**
 * Pagination parameters
 */
export type PaginationParams = {
  page?: number
  pageSize?: number
}

/**
 * Application with joined vendor data
 */
export type ApplicationWithVendor = {
  id: string
  event_id: string
  vendor_id: string
  status: string
  submitted_at: string
  updated_at: string
  booth_preference: string | null
  product_categories: string[] | null
  special_requirements: string | null
  organizer_notes: string | null
  vendor: {
    id: string
    business_name: string
    contact_name: string
    email: string
    phone: string | null
    website: string | null
    description: string | null
    created_at: string
    updated_at: string
  }
}

/**
 * Response type for paginated applications list
 */
export type GetApplicationsResponse = {
  success: boolean
  error: string | null
  data: {
    applications: ApplicationWithVendor[]
    pagination: {
      page: number
      pageSize: number
      totalCount: number
      totalPages: number
    }
  } | null
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Submits a vendor application for an event
 *
 * This action:
 * 1. Validates the input data
 * 2. Creates or finds an existing vendor by email
 * 3. Creates the application record
 * 4. Links any uploaded attachments to the application
 *
 * @param data - The validated application form data
 * @returns ApplicationResponse with IDs on success or error message on failure
 */
export async function submitApplication(
  data: ApplicationSubmitInput
): Promise<ApplicationResponse> {
  // Validate input
  const parsed = applicationSubmitSchema.safeParse(data)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
      data: null,
    }
  }

  const {
    businessName,
    contactName,
    email,
    phone,
    website,
    description,
    eventId,
    boothPreference,
    productCategories,
    specialRequirements,
    attachments,
  } = parsed.data

  const supabase = await createClient()

  // -------------------------------------------------------------------------
  // Step 1: Find or create vendor by email
  // -------------------------------------------------------------------------
  let vendorId: string

  // Check if vendor already exists with this email
  const { data: existingVendor, error: findError } = await supabase
    .from('vendors')
    .select('id')
    .eq('email', email)
    .single()

  if (findError && findError.code !== 'PGRST116') {
    // PGRST116 = no rows found, which is expected for new vendors
    console.error('Error finding vendor:', findError)
    return {
      success: false,
      error: 'Failed to check for existing vendor',
      data: null,
    }
  }

  if (existingVendor) {
    // Update existing vendor with latest info
    vendorId = existingVendor.id

    const { error: updateError } = await supabase
      .from('vendors')
      .update({
        business_name: businessName,
        contact_name: contactName,
        phone: phone || null,
        website: website || null,
        description: description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId)

    if (updateError) {
      console.error('Error updating vendor:', updateError)
      return {
        success: false,
        error: 'Failed to update vendor information',
        data: null,
      }
    }
  } else {
    // Create new vendor
    const { data: newVendor, error: createError } = await supabase
      .from('vendors')
      .insert({
        business_name: businessName,
        contact_name: contactName,
        email,
        phone: phone || null,
        website: website || null,
        description: description || null,
      })
      .select('id')
      .single()

    if (createError || !newVendor) {
      console.error('Error creating vendor:', createError)
      return {
        success: false,
        error: 'Failed to create vendor record',
        data: null,
      }
    }

    vendorId = newVendor.id
  }

  // -------------------------------------------------------------------------
  // Step 2: Check if vendor already applied to this event
  // -------------------------------------------------------------------------
  const { data: existingApplication, error: checkAppError } = await supabase
    .from('applications')
    .select('id')
    .eq('vendor_id', vendorId)
    .eq('event_id', eventId)
    .single()

  if (checkAppError && checkAppError.code !== 'PGRST116') {
    console.error('Error checking existing application:', checkAppError)
    return {
      success: false,
      error: 'Failed to check for existing application',
      data: null,
    }
  }

  if (existingApplication) {
    return {
      success: false,
      error: 'You have already submitted an application for this event',
      data: null,
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: Create application record
  // -------------------------------------------------------------------------
  const { data: application, error: appError } = await supabase
    .from('applications')
    .insert({
      vendor_id: vendorId,
      event_id: eventId,
      booth_preference: boothPreference || null,
      product_categories: productCategories,
      special_requirements: specialRequirements || null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (appError || !application) {
    console.error('Error creating application:', appError)
    return {
      success: false,
      error: 'Failed to create application',
      data: null,
    }
  }

  const applicationId = application.id

  // -------------------------------------------------------------------------
  // Step 4: Link attachments to application
  // -------------------------------------------------------------------------
  if (attachments && attachments.length > 0) {
    const attachmentRecords = attachments.map((attachment) => ({
      application_id: applicationId,
      file_name: attachment.fileName,
      file_path: attachment.filePath,
      file_type: attachment.fileType,
      file_size: attachment.fileSize || null,
    }))

    const { error: attachError } = await supabase
      .from('attachments')
      .insert(attachmentRecords)

    if (attachError) {
      console.error('Error linking attachments:', attachError)
      // Note: We don't fail the whole submission if attachments fail
      // The application is already created, so we just log the error
    }
  }

  // -------------------------------------------------------------------------
  // Success!
  // -------------------------------------------------------------------------
  return {
    success: true,
    error: null,
    data: {
      applicationId,
      vendorId,
    },
  }
}

/**
 * Fetches all active events that are accepting applications
 *
 * @returns List of events with status 'accepting_applications' or before deadline
 */
export async function getActiveEvents() {
  const supabase = await createClient()

  const { data: events, error } = await supabase
    .from('events')
    .select('id, name, event_date, location, description, application_deadline')
    .eq('status', 'accepting_applications')
    .gte('application_deadline', new Date().toISOString())
    .order('event_date', { ascending: true })

  if (error) {
    console.error('Error fetching active events:', error)
    return []
  }

  return events || []
}

/**
 * Fetches applications for a specific vendor by email
 *
 * @param email - The vendor's email address
 * @returns List of applications with event details
 */
export async function getVendorApplications(email: string) {
  const supabase = await createClient()

  // First find the vendor
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .select('id')
    .eq('email', email)
    .single()

  if (vendorError || !vendor) {
    return []
  }

  // Then get their applications with event info
  const { data: applications, error: appError } = await supabase
    .from('applications')
    .select(
      `
      id,
      status,
      submitted_at,
      booth_preference,
      product_categories,
      events (
        id,
        name,
        event_date,
        location
      )
    `
    )
    .eq('vendor_id', vendor.id)
    .order('submitted_at', { ascending: false })

  if (appError) {
    console.error('Error fetching applications:', appError)
    return []
  }

  return applications || []
}

/**
 * Fetches applications with filtering and pagination support
 *
 * This action:
 * 1. Joins vendor data with applications
 * 2. Filters by status, search term (business name, contact name, email)
 * 3. Supports pagination with configurable page size
 *
 * @param filters - Optional filter parameters (status, search, eventId)
 * @param pagination - Optional pagination parameters (page, pageSize)
 * @returns GetApplicationsResponse with paginated applications or error
 */
export async function getApplications(
  filters: ApplicationFilters = {},
  pagination: PaginationParams = {}
): Promise<GetApplicationsResponse> {
  const supabase = await createClient()

  // Pagination defaults
  const page = pagination.page ?? 1
  const pageSize = pagination.pageSize ?? 10
  const offset = (page - 1) * pageSize

  // Build the base query for fetching applications with vendor data
  let query = supabase.from('applications').select(
    `
      id,
      event_id,
      vendor_id,
      status,
      submitted_at,
      updated_at,
      booth_preference,
      product_categories,
      special_requirements,
      organizer_notes,
      vendor:vendors (
        id,
        business_name,
        contact_name,
        email,
        phone,
        website,
        description,
        created_at,
        updated_at
      )
    `,
    { count: 'exact' }
  )

  // Apply status filter
  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  // Apply event filter
  if (filters.eventId) {
    query = query.eq('event_id', filters.eventId)
  }

  // Apply search filter (searches across vendor business_name, contact_name, email)
  // Note: Supabase doesn't support OR across joined tables in a single query easily,
  // so we'll need to get vendor IDs first if searching
  if (filters.search) {
    const searchTerm = `%${filters.search}%`

    // First, find matching vendor IDs
    const { data: matchingVendors, error: vendorSearchError } = await supabase
      .from('vendors')
      .select('id')
      .or(
        `business_name.ilike.${searchTerm},contact_name.ilike.${searchTerm},email.ilike.${searchTerm}`
      )

    if (vendorSearchError) {
      console.error('Error searching vendors:', vendorSearchError)
      return {
        success: false,
        error: 'Failed to search applications',
        data: null,
      }
    }

    // Filter applications by matching vendor IDs
    const vendorIds = matchingVendors?.map((v) => v.id) || []
    if (vendorIds.length === 0) {
      // No matching vendors, return empty result
      return {
        success: true,
        error: null,
        data: {
          applications: [],
          pagination: {
            page,
            pageSize,
            totalCount: 0,
            totalPages: 0,
          },
        },
      }
    }

    query = query.in('vendor_id', vendorIds)
  }

  // Apply ordering (newest first)
  query = query.order('submitted_at', { ascending: false })

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1)

  // Execute the query
  const { data: applications, error, count } = await query

  if (error) {
    console.error('Error fetching applications:', error)
    return {
      success: false,
      error: 'Failed to fetch applications',
      data: null,
    }
  }

  // Transform the data to match our expected type
  // Supabase returns vendor as an array when using the join syntax, we need to flatten it
  const transformedApplications: ApplicationWithVendor[] = (applications || [])
    .filter((app) => app.vendor !== null)
    .map((app) => ({
      id: app.id,
      event_id: app.event_id,
      vendor_id: app.vendor_id,
      status: app.status,
      submitted_at: app.submitted_at,
      updated_at: app.updated_at,
      booth_preference: app.booth_preference,
      product_categories: app.product_categories,
      special_requirements: app.special_requirements,
      organizer_notes: app.organizer_notes,
      // Supabase returns the joined table as an object (not array) when the FK is unique per row
      vendor: app.vendor as ApplicationWithVendor['vendor'],
    }))

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  return {
    success: true,
    error: null,
    data: {
      applications: transformedApplications,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    },
  }
}

/**
 * Fetches application counts grouped by status
 *
 * Useful for dashboard summary cards
 *
 * @param eventId - Optional event ID to filter by
 * @returns Object with counts per status
 */
export async function getApplicationCounts(eventId?: string): Promise<{
  pending: number
  approved: number
  rejected: number
  waitlisted: number
  total: number
}> {
  const supabase = await createClient()

  let query = supabase.from('applications').select('status')

  if (eventId) {
    query = query.eq('event_id', eventId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching application counts:', error)
    return {
      pending: 0,
      approved: 0,
      rejected: 0,
      waitlisted: 0,
      total: 0,
    }
  }

  const counts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    waitlisted: 0,
    total: data?.length ?? 0,
  }

  for (const app of data || []) {
    const status = app.status as keyof typeof counts
    if (status in counts && status !== 'total') {
      counts[status]++
    }
  }

  return counts
}
