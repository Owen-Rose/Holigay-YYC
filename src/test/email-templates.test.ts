// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { applicationReceivedEmail, statusUpdateEmail } from '@/lib/email/templates';
import { APPLICATION_STATUSES } from '@/lib/constants/application-status';

// UAT-5: every vendor email is sent from a noreply@ address, so the copy must
// not invite a reply. There is no reply-to mailbox by decision (2026-10-06);
// vendors are pointed at the organizers instead.

const received = applicationReceivedEmail({
  vendorName: 'Sam',
  businessName: 'Candle Co',
  eventName: 'Holigay Market',
  eventDate: 'Tuesday, December 1, 2026',
  applicationId: '2b703c47-1a4f-451e-8d60-742537445195',
});

const statusEmails = APPLICATION_STATUSES.map((status) => ({
  status,
  content: statusUpdateEmail({
    vendorName: 'Sam',
    businessName: 'Candle Co',
    eventName: 'Holigay Market',
    eventDate: 'Tuesday, December 1, 2026',
    status,
    organizerNotes: 'Booth 12.',
  }),
}));

describe('email copy does not invite replies to the noreply sender (UAT-5)', () => {
  it('application-received never says to reply', () => {
    expect(received.html).not.toMatch(/reply/i);
    expect(received.text).not.toMatch(/reply/i);
  });

  it('application-received points vendors at the organizers', () => {
    expect(received.html).toMatch(/organizers/);
    expect(received.text).toMatch(/organizers/);
  });

  it.each(statusEmails)('status-update ($status) never says to reply', ({ content }) => {
    expect(content.html).not.toMatch(/reply/i);
    expect(content.text).not.toMatch(/reply/i);
  });

  it.each(statusEmails)(
    'status-update ($status) points vendors at the organizers',
    ({ content }) => {
      expect(content.html).toMatch(/organizers/);
      expect(content.text).toMatch(/organizers/);
    }
  );
});
