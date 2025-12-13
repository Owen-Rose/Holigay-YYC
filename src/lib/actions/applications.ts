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
