import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// SetPasswordForm — contracts/server-actions.md §setPassword (client).

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockSetPassword = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock('@/lib/actions/auth', () => ({
  setPassword: (...args: unknown[]) => mockSetPassword(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import { SetPasswordForm } from '@/components/auth/set-password-form';

beforeEach(() => {
  vi.clearAllMocks();
});

async function fill(password: string, confirmPassword: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('New password'), password);
  await user.type(screen.getByLabelText('Confirm password'), confirmPassword);
  await user.click(screen.getByRole('button', { name: 'Set password' }));
}

describe('SetPasswordForm', () => {
  it('renders two labelled password fields', () => {
    render(<SetPasswordForm />);

    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('type', 'password');
  });

  it('shows the mismatch error inline and does not call the action', async () => {
    render(<SetPasswordForm />);

    await fill('secret123', 'secret124');

    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('aria-invalid', 'true');
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  it('calls setPassword, toasts and navigates to the returned dashboard on success', async () => {
    mockSetPassword.mockResolvedValue({
      success: true,
      error: null,
      data: { redirectTo: '/dashboard' },
    });
    render(<SetPasswordForm />);

    await fill('secret123', 'secret123');

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
    expect(mockSetPassword).toHaveBeenCalledWith({
      password: 'secret123',
      confirmPassword: 'secret123',
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Password set');
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('toasts the action error verbatim and stays on the page', async () => {
    mockSetPassword.mockResolvedValue({
      success: false,
      error: 'New password should be different from the old password.',
      data: null,
    });
    render(<SetPasswordForm />);

    await fill('secret123', 'secret123');

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        'New password should be different from the old password.'
      )
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows the button as loading while the action is pending', async () => {
    let resolve: (value: unknown) => void = () => {};
    mockSetPassword.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<SetPasswordForm />);

    await fill('secret123', 'secret123');

    const button = screen.getByRole('button', { name: /Set(ting)? password/ });
    await waitFor(() => expect(button).toBeDisabled());
    resolve({ success: false, error: 'x', data: null });
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
