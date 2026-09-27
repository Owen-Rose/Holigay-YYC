import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Login page `reason` notices — contracts/auth-confirm-route.md §Login page notices.

let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock('@/lib/actions/auth', () => ({
  signIn: vi.fn(),
}));

import LoginPage from '@/app/(auth)/login/page';

const LINK_INVALID_COPY =
  'That link has expired or was already used. Ask an admin to send a new invitation, or use Forgot password.';
const SESSION_REQUIRED_COPY = 'Please sign in first.';

beforeEach(() => {
  searchParams = new URLSearchParams();
});

describe('LoginPage reason notices', () => {
  it.each([
    ['link-invalid', LINK_INVALID_COPY],
    ['session-required', SESSION_REQUIRED_COPY],
  ])('reason=%s shows its notice as a status message', (reason, copy) => {
    searchParams = new URLSearchParams({ reason });

    render(<LoginPage />);

    expect(screen.getByRole('status')).toHaveTextContent(copy);
  });

  it.each(['bogus', 'constructor', 'toString'])('shows no notice for reason=%s', (reason) => {
    searchParams = new URLSearchParams({ reason });

    render(<LoginPage />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows no notice without a reason', () => {
    render(<LoginPage />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('LoginPage links', () => {
  it('links to /forgot-password', () => {
    render(<LoginPage />);

    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password'
    );
  });
});
