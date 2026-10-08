import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Signup success copy — spec 009 research R15, US4 scenario 3.

vi.mock('@/lib/actions/auth', () => ({
  signUp: vi.fn().mockResolvedValue({ success: true, error: null }),
}));

import SignupPage from '@/app/(auth)/signup/page';

const SUCCESS_COPY =
  'Account created! Check your email for a confirmation link — clicking it will sign you in.';

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
    // Arrange
    const user = userEvent.setup();
    render(<SignupPage />);

    // Act
    await user.type(screen.getByLabelText('Email'), 'vendor@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.type(screen.getByLabelText('Confirm Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign up|create/i }));

    // Assert
    const message = await screen.findByText(SUCCESS_COPY);
    expect(within(message).queryByRole('link')).not.toBeInTheDocument();
    expect(message.closest('div')).not.toContainElement(
      screen.queryByRole('link', { name: /sign in/i })
    );
  });
});
