import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NoVendorProfile } from '@/components/vendor/no-vendor-profile';

// spec 011 FR-007, contracts/server-actions-and-ui.md §13

const mockGetUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const SENTENCE =
  'Applications are matched to the email address they were submitted with. You are signed in as jane@example.com.';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { email: 'jane@example.com' } }, error: null });
});

describe('NoVendorProfile', () => {
  it.each(['card', 'inline'] as const)(
    '%s variant names the signed-in address and links to /apply',
    async (variant) => {
      render(await NoVendorProfile({ variant }));

      expect(screen.getByText('No vendor profile linked')).toBeInTheDocument();
      const paragraph = screen.getByText(/Your account isn.t linked to a vendor yet\./);
      expect(paragraph.textContent).toBe(
        `Your account isn't linked to a vendor yet. ${SENTENCE} Submit an application to create your vendor profile.`
      );
      expect(screen.getByText('jane@example.com').tagName).toBe('STRONG');
      expect(screen.getByRole('link', { name: 'Submit an application' })).toHaveAttribute(
        'href',
        '/apply'
      );
    }
  );

  it('renders the heading as an h2 in the card variant only', async () => {
    const { unmount } = render(await NoVendorProfile({ variant: 'card' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'No vendor profile linked' })
    ).toBeInTheDocument();
    unmount();

    render(await NoVendorProfile({ variant: 'inline' }));
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('leaves out the signed-in sentence when there is no address', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    render(await NoVendorProfile({ variant: 'inline' }));

    expect(screen.queryByText(/You are signed in as/)).not.toBeInTheDocument();
    expect(screen.getByText(/Applications are matched to the email address/)).toBeInTheDocument();
  });
});
