/**
 * Email Templates
 *
 * Pre-built email templates for vendor application notifications.
 * Each template returns subject, HTML, and plain text content.
 *
 * @example
 * ```typescript
 * import { applicationReceivedEmail, statusUpdateEmail } from '@/lib/email/templates'
 * import { sendEmail } from '@/lib/email/client'
 *
 * // Send application confirmation
 * const confirmEmail = applicationReceivedEmail({
 *   vendorName: 'Jane',
 *   businessName: 'Crafts Co',
 *   eventName: 'Holiday Market',
 *   eventDate: 'Dec 15, 2025',
 *   applicationId: 'abc123',
 * })
 * await sendEmail({ to: 'vendor@example.com', ...confirmEmail })
 *
 * // Send status update
 * const updateEmail = statusUpdateEmail({
 *   vendorName: 'Jane',
 *   businessName: 'Crafts Co',
 *   eventName: 'Holiday Market',
 *   eventDate: 'Dec 15, 2025',
 *   status: 'approved',
 * })
 * await sendEmail({ to: 'vendor@example.com', ...updateEmail })
 * ```
 */

export {
  applicationReceivedEmail,
  type ApplicationReceivedEmailData,
  type EmailContent,
} from './application-received';

export { statusUpdateEmail, type StatusUpdateEmailData } from './status-update';
