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

let mockInviteOnly = false;
vi.mock('@/lib/env-public', () => ({
  get inviteOnly() {
    return mockInviteOnly;
  },
}));

import LoginPage from '@/app/(auth)/login/page';

const LINK_INVALID_COPY =
  'That link has expired or was already used. Ask an admin to send a new invitation, or use Forgot password.';
const SESSION_REQUIRED_COPY = 'Please sign in first.';

beforeEach(() => {
  searchParams = new URLSearchParams();
  mockInviteOnly = false;
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

describe('LoginPage sign-up link — invite-only mode (spec 010)', () => {
  it('flag off: shows the Sign up link and Forgot password?', () => {
    render(<LoginPage />);

    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeInTheDocument();
  });

  it('flag on: hides the Sign up link and keeps Forgot password?', () => {
    mockInviteOnly = true;

    render(<LoginPage />);

    expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();
    expect(screen.queryByText(/have an account/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeInTheDocument();
  });
});
