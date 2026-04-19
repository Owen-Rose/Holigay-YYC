import { wrapEmailTemplate } from '../client';

// =============================================================================
// Types
// =============================================================================

/**
 * Data required to generate the application received email
 */
export type ApplicationReceivedEmailData = {
  /** Vendor's contact name */
  vendorName: string;
  /** Vendor's business name */
  businessName: string;
  /** Name of the event applied to */
  eventName: string;
  /** Date of the event (formatted string) */
  eventDate: string;
  /** Application ID for reference */
  applicationId: string;
};

/**
 * Generated email content with HTML and plain text versions
 */
export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

// =============================================================================
// Template
// =============================================================================

/**
 * Generates the "Application Received" confirmation email
 *
 * Sent immediately after a vendor submits their application.
 * Confirms receipt and sets expectations for next steps.
 *
 * @param data - Application and vendor details
 * @returns Email content with subject, HTML, and plain text
 *
 * @example
 * ```typescript
 * const email = applicationReceivedEmail({
 *   vendorName: 'Jane Smith',
 *   businessName: 'Handmade Treasures',
 *   eventName: 'Winter Holiday Market 2025',
 *   eventDate: 'December 15, 2025',
 *   applicationId: 'abc123',
 * })
 *
 * await sendEmail({
 *   to: 'vendor@example.com',
 *   subject: email.subject,
 *   html: email.html,
 *   text: email.text,
 * })
 * ```
 */
export function applicationReceivedEmail(data: ApplicationReceivedEmailData): EmailContent {
  const { vendorName, businessName, eventName, eventDate, applicationId } = data;

  const subject = `Application Received: ${eventName}`;

  // Build the inner content (will be wrapped by the template)
  const content = `
    <h2 style="margin-top: 0; color: #18181b;">
      Thank You for Your Application!
    </h2>

    <p>Hi ${escapeHtml(vendorName)},</p>

    <p>
      We've received your vendor application for <strong>${escapeHtml(businessName)}</strong>
      to participate in <strong>${escapeHtml(eventName)}</strong>.
    </p>

    <!-- Application Details Box -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0;">
      <tr>
        <td style="background-color: #f4f4f5; border-radius: 8px; padding: 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="padding-bottom: 12px;">
                <strong style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Event
                </strong><br>
                <span style="color: #18181b; font-size: 16px;">
                  ${escapeHtml(eventName)}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 12px;">
                <strong style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Event Date
                </strong><br>
                <span style="color: #18181b; font-size: 16px;">
                  ${escapeHtml(eventDate)}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 12px;">
                <strong style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Application Status
                </strong><br>
                <span style="display: inline-block; background-color: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 9999px; font-size: 14px; font-weight: 500;">
                  Pending Review
                </span>
              </td>
            </tr>
            <tr>
              <td>
                <strong style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Reference Number
                </strong><br>
                <span style="color: #18181b; font-size: 14px; font-family: monospace;">
                  ${escapeHtml(applicationId.slice(0, 8).toUpperCase())}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <h3 style="color: #18181b; margin-bottom: 12px;">What Happens Next?</h3>

    <ol style="margin: 0 0 24px 0; padding-left: 20px; color: #18181b;">
      <li style="margin-bottom: 8px;">
        Our team will review your application within the next few business days.
      </li>
      <li style="margin-bottom: 8px;">
        You'll receive an email notification when your application status is updated.
      </li>
      <li style="margin-bottom: 8px;">
        If approved, we'll send you additional details about booth setup and event logistics.
      </li>
    </ol>

    <p style="color: #71717a; font-size: 14px;">
      If you have any questions in the meantime, please don't hesitate to reach out
      by replying to this email.
    </p>

    <p style="margin-bottom: 0;">
      Best regards,<br>
      <strong>The Holigay Vendor Market Team</strong>
    </p>
  `;

  const html = wrapEmailTemplate(content, {
    previewText: `We've received your application for ${eventName}`,
  });

  const text = `
Thank You for Your Application!

Hi ${vendorName},

We've received your vendor application for ${businessName} to participate in ${eventName}.

APPLICATION DETAILS
-------------------
Event: ${eventName}
Event Date: ${eventDate}
Application Status: Pending Review
Reference Number: ${applicationId.slice(0, 8).toUpperCase()}

WHAT HAPPENS NEXT?
------------------
1. Our team will review your application within the next few business days.
2. You'll receive an email notification when your application status is updated.
3. If approved, we'll send you additional details about booth setup and event logistics.

If you have any questions in the meantime, please don't hesitate to reach out by replying to this email.

Best regards,
The Holigay Vendor Market Team
  `.trim();

  return { subject, html, text };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Escapes HTML special characters to prevent XSS in email content
 */
function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => escapeMap[char] || char);
}
