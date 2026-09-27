import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ForgotPasswordForm — contracts/server-actions.md §requestPasswordReset (client).

const mockRequestPasswordReset = vi.fn();

vi.mock('@/lib/actions/auth', () => ({
  requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
}));

import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

const NEUTRAL_COPY = 'If that address has an account, a reset link is on its way.';

beforeEach(() => {
  vi.clearAllMocks();
});

async function submit(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));
}

describe('ForgotPasswordForm', () => {
  it('renders a labelled email field', () => {
    render(<ForgotPasswordForm />);

    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
  });

  it('shows an inline error for a malformed address and does not call the action', async () => {
    render(<ForgotPasswordForm />);

    await submit('not-an-email');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter a valid email address'
    );
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it('replaces the form with the neutral message on success', async () => {
    mockRequestPasswordReset.mockResolvedValue({ success: true, error: null, data: null });
    render(<ForgotPasswordForm />);

    await submit('someone@example.com');

    expect(await screen.findByText(NEUTRAL_COPY)).toBeInTheDocument();
    expect(mockRequestPasswordReset).toHaveBeenCalledWith({ email: 'someone@example.com' });
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('shows a server-side validation error inline', async () => {
    mockRequestPasswordReset.mockResolvedValue({
      success: false,
      error: 'Please enter a valid email address',
      data: null,
    });
    render(<ForgotPasswordForm />);

    await submit('someone@example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter a valid email address'
    );
    expect(screen.queryByText(NEUTRAL_COPY)).not.toBeInTheDocument();
  });

  it('shows the button as loading while the action is pending', async () => {
    let resolve: (value: unknown) => void = () => {};
    mockRequestPasswordReset.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ForgotPasswordForm />);

    await submit('someone@example.com');

    await waitFor(() => expect(screen.getByRole('button')).toBeDisabled());
    resolve({ success: true, error: null, data: null });
    expect(await screen.findByText(NEUTRAL_COPY)).toBeInTheDocument();
  });
});
