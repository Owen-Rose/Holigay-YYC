import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  sendEmail,
  wrapEmailTemplate,
  isEmailConfigured,
  getDefaultFromEmail,
} from '@/lib/email/client'

// =============================================================================
// Configuration
// =============================================================================

/**
 * Development-only test endpoint for email functionality.
 *
 * This route is automatically disabled in production via NODE_ENV check.
 * It provides a simple way to verify email configuration during development.
 *
 * Usage:
 *   GET /api/test-email?to=your@email.com
 *
 * @see src/lib/email/client.ts for the underlying email implementation
 */

// =============================================================================
// Validation
// =============================================================================

/**
 * Query parameter validation schema
 *
 * Note: Zod 4 uses different syntax for required messages.
 * We use .min(1) to ensure the string is not empty.
 */
const querySchema = z.object({
  to: z
    .string()
    .min(1, 'Email address is required')
    .email('Please provide a valid email address'),
})

// =============================================================================
// Types
// =============================================================================

type TestEmailResponse = {
  success: boolean
  message?: string
  messageId?: string | null
  error?: string
  details?: {
    emailConfigured: boolean
    fromAddress: string
    timestamp: string
  }
}

// =============================================================================
// Route Handler
// =============================================================================

/**
 * GET /api/test-email
 *
 * Sends a test email to verify email configuration.
 * Only available in development mode.
 *
 * Query Parameters:
 *   - to: Recipient email address (required, must be valid email format)
 *
 * Responses:
 *   - 200: Email sent successfully
 *   - 400: Invalid email address
 *   - 404: Route not available (production mode)
 *   - 500: Server error during email send
 */
export async function GET(request: NextRequest): Promise<NextResponse<TestEmailResponse>> {
  // -------------------------------------------------------------------------
  // Security: Development-only guard
  // -------------------------------------------------------------------------
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: 'Not found' },
      { status: 404 }
    )
  }

  // -------------------------------------------------------------------------
  // Parse and validate query parameters
  // -------------------------------------------------------------------------
  const searchParams = request.nextUrl.searchParams
  const toParam = searchParams.get('to')

  const parseResult = querySchema.safeParse({ to: toParam })

  if (!parseResult.success) {
    const errorMessage = parseResult.error.issues[0]?.message || 'Invalid email address'
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: {
          emailConfigured: isEmailConfigured(),
          fromAddress: getDefaultFromEmail(),
          timestamp: new Date().toISOString(),
        },
      },
      { status: 400 }
    )
  }

  const { to } = parseResult.data

  // -------------------------------------------------------------------------
  // Build test email content
  // -------------------------------------------------------------------------
  const timestamp = new Date().toISOString()
  const configured = isEmailConfigured()

  const emailContent = `
    <h2>Email Test Successful!</h2>

    <p>This is a test email from your <strong>Holigay Vendor Market</strong> application.</p>

    <p>If you're reading this, your email configuration is working correctly.</p>

    <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
      <tr>
        <td style="padding: 12px; border: 1px solid #e4e4e7; background-color: #f4f4f5; font-weight: 600;">
          Sent To
        </td>
        <td style="padding: 12px; border: 1px solid #e4e4e7;">
          ${to}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #e4e4e7; background-color: #f4f4f5; font-weight: 600;">
          Timestamp
        </td>
        <td style="padding: 12px; border: 1px solid #e4e4e7;">
          ${timestamp}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #e4e4e7; background-color: #f4f4f5; font-weight: 600;">
          From Address
        </td>
        <td style="padding: 12px; border: 1px solid #e4e4e7;">
          ${getDefaultFromEmail()}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #e4e4e7; background-color: #f4f4f5; font-weight: 600;">
          API Key Configured
        </td>
        <td style="padding: 12px; border: 1px solid #e4e4e7;">
          ${configured ? 'Yes' : 'No (using console logging)'}
        </td>
      </tr>
    </table>

    <p style="color: #71717a; font-size: 14px;">
      This test email was triggered from the development API endpoint:<br>
      <code style="background-color: #f4f4f5; padding: 2px 6px; border-radius: 4px;">
        /api/test-email
      </code>
    </p>
  `

  const html = wrapEmailTemplate(emailContent, {
    previewText: 'Test email from Holigay Vendor Market - Your email is working!',
  })

  // -------------------------------------------------------------------------
  // Send the test email
  // -------------------------------------------------------------------------
  const result = await sendEmail({
    to,
    subject: 'Test Email from Holigay Vendor Market',
    html,
    text: `
Email Test Successful!

This is a test email from your Holigay Vendor Market application.

If you're reading this, your email configuration is working correctly.

Details:
- Sent To: ${to}
- Timestamp: ${timestamp}
- From Address: ${getDefaultFromEmail()}
- API Key Configured: ${configured ? 'Yes' : 'No (using console logging)'}

This test email was triggered from the development API endpoint: /api/test-email
    `.trim(),
  })

  // -------------------------------------------------------------------------
  // Return response
  // -------------------------------------------------------------------------
  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: result.error || 'Failed to send email',
        details: {
          emailConfigured: configured,
          fromAddress: getDefaultFromEmail(),
          timestamp,
        },
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    message: configured
      ? `Test email sent successfully to ${to}`
      : `Test email logged to console (no API key configured). Check your terminal.`,
    messageId: result.messageId,
    details: {
      emailConfigured: configured,
      fromAddress: getDefaultFromEmail(),
      timestamp,
    },
  })
}
