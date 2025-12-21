import { NextRequest, NextResponse } from 'next/server'

import {
  applicationReceivedEmail,
  statusUpdateEmail,
} from '@/lib/email/templates'
import type { ApplicationStatus } from '@/lib/constants/application-status'

/**
 * Development-only email template preview endpoint
 *
 * Renders email templates in the browser for visual validation.
 * Useful for checking styling and content before sending real emails.
 *
 * Usage:
 *   GET /api/preview-email?template=application-received
 *   GET /api/preview-email?template=status-update&status=approved
 *   GET /api/preview-email?template=status-update&status=rejected
 *   GET /api/preview-email?template=status-update&status=waitlisted
 */

// Sample data for template previews
const SAMPLE_DATA = {
  vendorName: 'Sarah Johnson',
  businessName: 'Handcrafted Jewelry Co.',
  eventName: 'Winter Holiday Market 2025',
  eventDate: 'Saturday, December 20, 2025',
  applicationId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Security: Development-only
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const searchParams = request.nextUrl.searchParams
  const template = searchParams.get('template')
  const status = (searchParams.get('status') as ApplicationStatus) || 'approved'
  const notes = searchParams.get('notes')

  // Generate the appropriate template
  let emailContent: { subject: string; html: string; text: string }

  switch (template) {
    case 'application-received':
      emailContent = applicationReceivedEmail(SAMPLE_DATA)
      break

    case 'status-update':
      emailContent = statusUpdateEmail({
        ...SAMPLE_DATA,
        status,
        organizerNotes: notes || 'Looking forward to seeing your beautiful jewelry collection at the market!',
      })
      break

    default:
      // Return an index of available templates
      return new NextResponse(
        `
<!DOCTYPE html>
<html>
<head>
  <title>Email Template Preview</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; }
    h1 { color: #7c3aed; }
    a { color: #7c3aed; display: block; padding: 12px 0; }
    code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; }
    .section { margin: 24px 0; padding: 16px; background: #f9fafb; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>Email Template Previews</h1>
  <p>Select a template to preview. These are rendered with sample data.</p>

  <div class="section">
    <h2>Application Received</h2>
    <p>Sent when a vendor submits their application.</p>
    <a href="?template=application-received">→ Preview Application Received</a>
  </div>

  <div class="section">
    <h2>Status Update</h2>
    <p>Sent when an organizer changes the application status.</p>
    <a href="?template=status-update&status=approved">→ Preview: Approved</a>
    <a href="?template=status-update&status=rejected">→ Preview: Rejected</a>
    <a href="?template=status-update&status=waitlisted">→ Preview: Waitlisted</a>
    <a href="?template=status-update&status=pending">→ Preview: Pending</a>
  </div>

  <div class="section">
    <h2>Custom Options</h2>
    <p>Add <code>&notes=Your custom note</code> to status-update URLs to test organizer notes.</p>
  </div>
</body>
</html>
        `.trim(),
        {
          headers: { 'Content-Type': 'text/html' },
        }
      )
  }

  // Return the HTML email for browser preview
  return new NextResponse(emailContent.html, {
    headers: { 'Content-Type': 'text/html' },
  })
}
