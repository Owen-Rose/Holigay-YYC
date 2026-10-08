import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Signup success copy — spec 009 research R15, US4 scenario 3; UAT-findings item 3.

vi.mock('@/lib/actions/auth', () => ({
  signUp: vi.fn().mockResolvedValue({ success: true, error: null }),
}));

import SignupPage from '@/app/(auth)/signup/page';
import { signUp } from '@/lib/actions/auth';

const CHECK_EMAIL_COPY =
  'Account created! Check your email for a confirmation link — clicking it will sign you in.';
const SIGNED_IN_COPY = "Account created! You're signed in.";

async function submitValidForm() {
  const user = userEvent.setup();
  render(<SignupPage />);
  await user.type(screen.getByLabelText('Email'), 'vendor@example.com');
  await user.type(screen.getByLabelText('Password'), 'secret123');
  await user.type(screen.getByLabelText('Confirm Password'), 'secret123');
  await user.click(screen.getByRole('button', { name: /sign up|create/i }));
}

describe('SignupPage header', () => {
  // UAT-findings item 9: the subtitle spoke to organizers ("manage vendor applications")
  // on a page only vendors can reach (organizers are invited, spec 009).
  it('addresses vendors, not organizers', () => {
    render(<SignupPage />);

    const subtitle = screen.getByText(
      'Create a vendor account to apply to events and track your applications.'
    );
    expect(subtitle).toBeInTheDocument();
    expect(screen.queryByText(/manage vendor applications/i)).not.toBeInTheDocument();
  });
});

describe('SignupPage success message', () => {
  it('describes the confirmation link and does not send the vendor to sign in', async () => {
    // Arrange: the action reports no session (the default mock has no message, so the
    // page falls back to the check-your-email copy — same as an older action would give).
    await submitValidForm();

    // Assert
    const message = await screen.findByText(CHECK_EMAIL_COPY);
    expect(within(message).queryByRole('link')).not.toBeInTheDocument();
    expect(message.closest('div')).not.toContainElement(
      screen.queryByRole('link', { name: /sign in/i })
    );
  });

  // UAT-findings item 3: the page shows what the action says happened, not a fixed line.
  it('shows the message the action returned', async () => {
    vi.mocked(signUp).mockResolvedValueOnce({
      success: true,
      error: null,
      message: SIGNED_IN_COPY,
    });

    await submitValidForm();

    expect(await screen.findByText(SIGNED_IN_COPY)).toBeInTheDocument();
    expect(screen.queryByText(CHECK_EMAIL_COPY)).not.toBeInTheDocument();
  });
});
