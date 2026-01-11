import { wrapEmailTemplate } from '../client';
import type { ApplicationStatus } from '@/lib/constants/application-status';

// =============================================================================
// Types
// =============================================================================

/**
 * Data required to generate the status update email
 */
export type StatusUpdateEmailData = {
  /** Vendor's contact name */
  vendorName: string;
  /** Vendor's business name */
  businessName: string;
  /** Name of the event */
  eventName: string;
  /** Date of the event (formatted string) */
  eventDate: string;
  /** The new application status */
  status: ApplicationStatus;
  /** Optional notes from the organizer */
  organizerNotes?: string | null;
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
// Status-specific content configuration
// =============================================================================

type StatusConfig = {
  /** Email subject line */
  subject: string;
  /** Main heading in the email */
  heading: string;
  /** Primary message paragraph */
  message: string;
  /** Background color for status badge */
  badgeColor: string;
  /** Text color for status badge */
  badgeTextColor: string;
  /** Display label for the status */
  statusLabel: string;
  /** Additional content shown after the main message */
  additionalContent?: string;
};

/**
 * Configuration for each application status
 */
const STATUS_CONFIG: Record<ApplicationStatus, StatusConfig> = {
  approved: {
    subject: 'Congratulations! Your Application Has Been Approved',
    heading: "Great News! You're In!",
    message:
      "We're thrilled to let you know that your vendor application has been approved. We can't wait to have you at the market!",
    badgeColor: '#dcfce7',
    badgeTextColor: '#166534',
    statusLabel: 'Approved',
    additionalContent: `
      <h3 style="color: #18181b; margin-bottom: 12px;">Next Steps</h3>
      <ol style="margin: 0 0 24px 0; padding-left: 20px; color: #18181b;">
        <li style="margin-bottom: 8px;">
          Mark your calendar for the event date.
        </li>
        <li style="margin-bottom: 8px;">
          Watch for a follow-up email with booth assignment and setup instructions.
        </li>
        <li style="margin-bottom: 8px;">
          Prepare your products and display materials.
        </li>
        <li style="margin-bottom: 8px;">
          If you have any questions, reply to this email.
        </li>
      </ol>
    `,
  },
  rejected: {
    subject: 'Application Update: Not Selected This Time',
    heading: 'Thank You for Applying',
    message:
      "After careful consideration, we regret to inform you that we're unable to offer you a vendor spot at this time. We received many wonderful applications and had to make difficult decisions.",
    badgeColor: '#fee2e2',
    badgeTextColor: '#991b1b',
    statusLabel: 'Not Selected',
    additionalContent: `
      <p style="color: #18181b;">
        Please don't be discouraged — we encourage you to apply for future events.
        Each market has different needs and themes, and we'd love to see your
        application again.
      </p>
    `,
  },
  waitlisted: {
    subject: "Application Update: You're on the Waitlist",
    heading: "You're on Our Waitlist",
    message:
      'Thank you for your patience! Your application has been placed on our waitlist. This means we loved your application but have reached our vendor capacity for this event.',
    badgeColor: '#fef3c7',
    badgeTextColor: '#92400e',
    statusLabel: 'Waitlisted',
    additionalContent: `
      <h3 style="color: #18181b; margin-bottom: 12px;">What This Means</h3>
      <ul style="margin: 0 0 24px 0; padding-left: 20px; color: #18181b;">
        <li style="margin-bottom: 8px;">
          If a spot opens up, we'll contact you immediately.
        </li>
        <li style="margin-bottom: 8px;">
          Waitlist positions are filled on a first-come, first-served basis.
        </li>
        <li style="margin-bottom: 8px;">
          We'll notify you either way before the event date.
        </li>
      </ul>
    `,
  },
  pending: {
    subject: 'Application Received: Under Review',
    heading: 'Your Application is Under Review',
    message:
      "Your application is currently being reviewed by our team. We'll notify you once a decision has been made.",
    badgeColor: '#fef3c7',
    badgeTextColor: '#92400e',
    statusLabel: 'Pending Review',
  },
};

// =============================================================================
// Template
// =============================================================================

/**
 * Generates a status update notification email
 *
 * Sent when an organizer updates the status of a vendor application.
 * Content is customized based on the new status (approved, rejected, waitlisted).
 *
 * @param data - Application details and new status
 * @returns Email content with subject, HTML, and plain text
 *
 * @example
 * ```typescript
 * const email = statusUpdateEmail({
 *   vendorName: 'Jane Smith',
 *   businessName: 'Handmade Treasures',
 *   eventName: 'Winter Holiday Market 2025',
 *   eventDate: 'December 15, 2025',
 *   status: 'approved',
 *   organizerNotes: 'Looking forward to your handmade jewelry collection!',
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
export function statusUpdateEmail(data: StatusUpdateEmailData): EmailContent {
  const { vendorName, businessName, eventName, eventDate, status, organizerNotes } = data;

  const config = STATUS_CONFIG[status];
  const subject = `${config.subject} - ${eventName}`;

  // Build the inner content
  const content = `
    <h2 style="margin-top: 0; color: #18181b;">
      ${escapeHtml(config.heading)}
    </h2>

    <p>Hi ${escapeHtml(vendorName)},</p>

    <p>${escapeHtml(config.message)}</p>

    <!-- Application Details Box -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0;">
      <tr>
        <td style="background-color: #f4f4f5; border-radius: 8px; padding: 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="padding-bottom: 12px;">
                <strong style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Business
                </strong><br>
                <span style="color: #18181b; font-size: 16px;">
                  ${escapeHtml(businessName)}
                </span>
              </td>
            </tr>
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
              <td>
                <strong style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Application Status
                </strong><br>
                <span style="display: inline-block; background-color: ${config.badgeColor}; color: ${config.badgeTextColor}; padding: 4px 12px; border-radius: 9999px; font-size: 14px; font-weight: 500;">
                  ${escapeHtml(config.statusLabel)}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${config.additionalContent || ''}

    ${
      organizerNotes
        ? `
      <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <strong style="color: #1e40af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
          Note from the Organizer
        </strong>
        <p style="color: #1e3a8a; margin: 8px 0 0 0;">
          ${escapeHtml(organizerNotes)}
        </p>
      </div>
    `
        : ''
    }

    <p style="color: #71717a; font-size: 14px;">
      If you have any questions, please don't hesitate to reply to this email.
    </p>

    <p style="margin-bottom: 0;">
      Best regards,<br>
      <strong>The Holigay Vendor Market Team</strong>
    </p>
  `;

  const html = wrapEmailTemplate(content, {
    previewText: `${config.heading} - ${eventName}`,
  });

  // Build plain text version
  const text = buildPlainText(data, config);

  return { subject, html, text };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Builds the plain text version of the status update email
 */
function buildPlainText(data: StatusUpdateEmailData, config: StatusConfig): string {
  const { vendorName, businessName, eventName, eventDate, status, organizerNotes } = data;

  let additionalText = '';

  if (status === 'approved') {
    additionalText = `
NEXT STEPS
----------
1. Mark your calendar for the event date.
2. Watch for a follow-up email with booth assignment and setup instructions.
3. Prepare your products and display materials.
4. If you have any questions, reply to this email.
`;
  } else if (status === 'waitlisted') {
    additionalText = `
WHAT THIS MEANS
---------------
- If a spot opens up, we'll contact you immediately.
- Waitlist positions are filled on a first-come, first-served basis.
- We'll notify you either way before the event date.
`;
  } else if (status === 'rejected') {
    additionalText = `
Please don't be discouraged — we encourage you to apply for future events.
Each market has different needs and themes, and we'd love to see your
application again.
`;
  }

  const notesSection = organizerNotes
    ? `
NOTE FROM THE ORGANIZER
-----------------------
${organizerNotes}
`
    : '';

  return `
${config.heading}

Hi ${vendorName},

${config.message}

APPLICATION DETAILS
-------------------
Business: ${businessName}
Event: ${eventName}
Event Date: ${eventDate}
Status: ${config.statusLabel}
${additionalText}${notesSection}
If you have any questions, please don't hesitate to reply to this email.

Best regards,
The Holigay Vendor Market Team
  `.trim();
}

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
