/**
 * Brand strings shared by the vendor emails and the public site.
 *
 * Both lines were set by the organizers in the October 2026 vendor-side UAT
 * (docs/handoffs/2026-10-31-vendor-uat-findings.md, UAT2-7). Editing them here
 * changes every email template, the email wrapper and the public footer at once.
 */

export const BRAND_NAME = 'Holigay Events YYC';

/** First line of the email sign-off. */
export const EMAIL_SIGN_OFF_CLOSING = 'Yours in Holigay Cheer,';

/** Second line of the email sign-off: the organizers (and Beans). */
export const EMAIL_SIGN_OFF_NAMES = 'Lauren, Sandy, Tony, and Beans';

export const FOOTER_TAGLINE = "Don't steal, that's not cool.";

/**
 * The copyright line shown in the email wrapper footer and the public site
 * footer. A literal © so the same string renders in JSX text and UTF-8 HTML.
 */
export function copyrightLine(year: number = new Date().getFullYear()): string {
  return `© ${year} ${BRAND_NAME}. ${FOOTER_TAGLINE}`;
}
