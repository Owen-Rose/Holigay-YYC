import { Resend } from 'resend'

// =============================================================================
// Configuration
// =============================================================================

/**
 * Default sender email address
 *
 * In development, Resend requires using their test domain (onboarding@resend.dev)
 * or a verified domain. For production, configure your own domain.
 *
 * @see https://resend.com/docs/dashboard/domains/introduction
 */
const DEFAULT_FROM_EMAIL =
  process.env.EMAIL_FROM_ADDRESS || 'Holigay Vendor Market <onboarding@resend.dev>'

/**
 * Initialize Resend client
 *
 * The client is lazily initialized to avoid errors when the API key is not set.
 * In development without an API key, email operations will be logged but not sent.
 */
let resendClient: Resend | null = null

function getResendClient(): Resend | null {
  if (resendClient) return resendClient

  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.warn(
      '[Email] RESEND_API_KEY is not set. Emails will be logged but not sent.'
    )
    return null
  }

  resendClient = new Resend(apiKey)
  return resendClient
}

// =============================================================================
// Types
// =============================================================================

/**
 * Options for sending an email
 */
export type EmailOptions = {
  /** Recipient email address(es) */
  to: string | string[]
  /** Email subject line */
  subject: string
  /** HTML content of the email */
  html: string
  /** Plain text fallback (optional, recommended for accessibility) */
  text?: string
  /** Sender email address (defaults to configured from address) */
  from?: string
  /** Reply-to address (optional) */
  replyTo?: string
  /** CC recipients (optional) */
  cc?: string | string[]
  /** BCC recipients (optional) */
  bcc?: string | string[]
}

/**
 * Result of an email send operation
 */
export type EmailResult = {
  /** Whether the email was sent successfully */
  success: boolean
  /** Resend message ID if successful */
  messageId: string | null
  /** Error message if failed */
  error: string | null
}

/**
 * Email log entry for development mode
 */
type EmailLogEntry = {
  timestamp: string
  to: string | string[]
  subject: string
  from: string
}

// =============================================================================
// Core Email Functions
// =============================================================================

/**
 * Sends an email using Resend
 *
 * This is the core email sending function. It handles:
 * - Graceful degradation when API key is not configured (logs instead of sending)
 * - Proper error handling with typed responses
 * - Default sender configuration
 *
 * @param options - Email options including recipient, subject, and content
 * @returns EmailResult indicating success or failure with details
 *
 * @example
 * ```typescript
 * const result = await sendEmail({
 *   to: 'vendor@example.com',
 *   subject: 'Application Received',
 *   html: '<h1>Thank you for applying!</h1>',
 *   text: 'Thank you for applying!',
 * })
 *
 * if (result.success) {
 *   console.log('Email sent:', result.messageId)
 * } else {
 *   console.error('Email failed:', result.error)
 * }
 * ```
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const { to, subject, html, text, from = DEFAULT_FROM_EMAIL, replyTo, cc, bcc } = options

  const resend = getResendClient()

  // Development fallback: log email instead of sending
  if (!resend) {
    const logEntry: EmailLogEntry = {
      timestamp: new Date().toISOString(),
      to,
      subject,
      from,
    }

    console.log('[Email] Would send email (no API key configured):')
    console.log(JSON.stringify(logEntry, null, 2))

    return {
      success: true,
      messageId: `dev-${Date.now()}`,
      error: null,
    }
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      replyTo,
      cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
      bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
    })

    if (error) {
      console.error('[Email] Resend API error:', error)
      return {
        success: false,
        messageId: null,
        error: error.message || 'Failed to send email',
      }
    }

    return {
      success: true,
      messageId: data?.id || null,
      error: null,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
    console.error('[Email] Unexpected error:', err)

    return {
      success: false,
      messageId: null,
      error: errorMessage,
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Checks if email sending is configured and available
 *
 * Useful for conditionally showing email-related features in the UI
 * or deciding whether to attempt email operations.
 *
 * @returns true if RESEND_API_KEY is configured
 */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

/**
 * Gets the configured sender email address
 *
 * @returns The configured from email address
 */
export function getDefaultFromEmail(): string {
  return DEFAULT_FROM_EMAIL
}

// =============================================================================
// Email Template Helpers
// =============================================================================

/**
 * Wraps email content in a consistent HTML template
 *
 * Provides:
 * - Responsive layout that works across email clients
 * - Consistent branding and styling
 * - Proper HTML email structure
 *
 * @param content - The main HTML content to wrap
 * @param options - Optional configuration for the template
 * @returns Complete HTML email string
 *
 * @example
 * ```typescript
 * const html = wrapEmailTemplate(
 *   '<h1>Hello!</h1><p>Your application was received.</p>',
 *   { previewText: 'Your application was received' }
 * )
 * ```
 */
export function wrapEmailTemplate(
  content: string,
  options: {
    /** Preview text shown in email clients */
    previewText?: string
  } = {}
): string {
  const { previewText } = options

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Holigay Vendor Market</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }

    /* Base styles */
    body {
      margin: 0 !important;
      padding: 0 !important;
      background-color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }

    /* Container */
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }

    /* Header */
    .email-header {
      background-color: #7c3aed;
      padding: 24px 32px;
      text-align: center;
    }
    .email-header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }

    /* Content */
    .email-content {
      padding: 32px;
      color: #18181b;
      line-height: 1.6;
    }
    .email-content h1, .email-content h2, .email-content h3 {
      color: #18181b;
      margin-top: 0;
    }
    .email-content p {
      margin: 0 0 16px 0;
    }
    .email-content a {
      color: #7c3aed;
    }

    /* Button */
    .email-button {
      display: inline-block;
      background-color: #7c3aed;
      color: #ffffff !important;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      margin: 16px 0;
    }
    .email-button:hover {
      background-color: #6d28d9;
    }

    /* Footer */
    .email-footer {
      padding: 24px 32px;
      text-align: center;
      color: #71717a;
      font-size: 14px;
      border-top: 1px solid #e4e4e7;
    }
    .email-footer a {
      color: #71717a;
    }

    /* Responsive */
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
      }
      .email-content, .email-header, .email-footer {
        padding: 20px !important;
      }
    }
  </style>
</head>
<body>
  ${previewText ? `<!--[if !mso]><!--><div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${previewText}</div><!--<![endif]-->` : ''}

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" class="email-container" cellspacing="0" cellpadding="0" border="0" width="600" align="center">
          <!-- Header -->
          <tr>
            <td class="email-header">
              <h1>Holigay Vendor Market</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="email-content">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="email-footer">
              <p style="margin: 0;">
                &copy; ${new Date().getFullYear()} Holigay Vendor Market. All rights reserved.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 12px;">
                This email was sent regarding your vendor application.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim()
}

/**
 * Converts HTML to plain text for email fallback
 *
 * Simple conversion that strips HTML tags. For production,
 * consider using a library like html-to-text for better results.
 *
 * @param html - HTML string to convert
 * @returns Plain text version of the content
 */
export function htmlToPlainText(html: string): string {
  return html
    // Remove style and script tags and their contents
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Replace common block elements with newlines
    .replace(/<\/?(div|p|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/\n\s*\n/g, '\n\n')
    .trim()
}
