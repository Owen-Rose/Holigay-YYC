'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/actions/roles';
import type { ApplicationFilters } from './applications';

// =============================================================================
// Types
// =============================================================================

/**
 * Response type for CSV export
 */
export type ExportCSVResponse = {
  success: boolean;
  error: string | null;
  data: {
    csv: string;
    filename: string;
    count: number;
  } | null;
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Escapes a value for CSV format
 * - Wraps in quotes if contains comma, quote, or newline
 * - Escapes internal quotes by doubling them
 */
function escapeCSVValue(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // Check if the value needs to be quoted
  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r')
  ) {
    // Escape quotes by doubling them and wrap in quotes
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Converts an array of values to a CSV row
 */
function toCSVRow(values: (string | null | undefined)[]): string {
  return values.map(escapeCSVValue).join(',');
}

/**
 * Formats a date string to a readable format
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Formats product categories array to a readable string
 */
function formatCategories(categories: string[] | null): string {
  if (!categories || categories.length === 0) return '';
  return categories.join('; ');
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Exports applications to CSV format
 *
 * This action:
 * 1. Fetches all applications matching the filters (no pagination limit)
 * 2. Joins vendor information
 * 3. Converts to CSV format with relevant columns
 * 4. Returns CSV string for download
 *
 * @param filters - Optional filter parameters (status, search, eventId)
 * @returns ExportCSVResponse with CSV string or error
 */
export async function exportApplicationsCSV(
  filters: ApplicationFilters = {}
): Promise<ExportCSVResponse> {
  // Require organizer role or higher to export applications
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return {
      success: false,
      error: auth.error,
      data: null,
    };
  }

  const supabase = await createClient();

  // Build the query for fetching all applications with vendor data
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
        description
      ),
      event:events (
        name
      )
    `
  );

  // Apply status filter
  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  // Apply event filter
  if (filters.eventId) {
    query = query.eq('event_id', filters.eventId);
  }

  // Apply search filter
  if (filters.search) {
    const searchTerm = `%${filters.search}%`;

    // Find matching vendor IDs
    const { data: matchingVendors, error: vendorSearchError } = await supabase
      .from('vendors')
      .select('id')
      .or(
        `business_name.ilike.${searchTerm},contact_name.ilike.${searchTerm},email.ilike.${searchTerm}`
      );

    if (vendorSearchError) {
      console.error('Error searching vendors:', vendorSearchError);
      return {
        success: false,
        error: 'Failed to search applications for export',
        data: null,
      };
    }

    const vendorIds = matchingVendors?.map((v) => v.id) || [];
    if (vendorIds.length === 0) {
      // No matching vendors, return empty CSV with headers
      const headers = [
        'Business Name',
        'Contact Name',
        'Email',
        'Phone',
        'Website',
        'Status',
        'Submitted Date',
        'Event',
        'Booth Preference',
        'Product Categories',
        'Special Requirements',
        'Organizer Notes',
        'Business Description',
      ];

      return {
        success: true,
        error: null,
        data: {
          csv: toCSVRow(headers),
          filename: `applications-export-${new Date().toISOString().split('T')[0]}.csv`,
          count: 0,
        },
      };
    }

    query = query.in('vendor_id', vendorIds);
  }

  // Order by submission date (newest first)
  query = query.order('submitted_at', { ascending: false });

  // Execute the query
  const { data: applications, error } = await query;

  if (error) {
    console.error('Error fetching applications for export:', error);
    return {
      success: false,
      error: 'Failed to fetch applications for export',
      data: null,
    };
  }

  // Define CSV headers
  const headers = [
    'Business Name',
    'Contact Name',
    'Email',
    'Phone',
    'Website',
    'Status',
    'Submitted Date',
    'Event',
    'Booth Preference',
    'Product Categories',
    'Special Requirements',
    'Organizer Notes',
    'Business Description',
  ];

  // Build CSV rows
  const rows: string[] = [toCSVRow(headers)];

  for (const app of applications || []) {
    // Skip if vendor data is missing
    if (!app.vendor) continue;

    const vendor = app.vendor as {
      business_name: string;
      contact_name: string;
      email: string;
      phone: string | null;
      website: string | null;
      description: string | null;
    };

    const event = app.event as { name: string } | null;

    const row = toCSVRow([
      vendor.business_name,
      vendor.contact_name,
      vendor.email,
      vendor.phone,
      vendor.website,
      app.status,
      formatDate(app.submitted_at),
      event?.name || '',
      app.booth_preference,
      formatCategories(app.product_categories),
      app.special_requirements,
      app.organizer_notes,
      vendor.description,
    ]);

    rows.push(row);
  }

  // Generate filename with current date
  const filename = `applications-export-${new Date().toISOString().split('T')[0]}.csv`;

  return {
    success: true,
    error: null,
    data: {
      csv: rows.join('\n'),
      filename,
      count: rows.length - 1, // Exclude header row from count
    },
  };
}
