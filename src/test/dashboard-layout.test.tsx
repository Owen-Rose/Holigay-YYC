import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Every sidebar link must land on a real page — the Settings link pointed at
// /dashboard/settings, which never existed, and 404'd.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard',
}));

vi.mock('@/lib/actions/auth', () => ({
  signOut: vi.fn(),
}));

// Admin, so the admin-only link renders too.
vi.mock('@/lib/auth/roles', () => ({
  getCurrentUserRole: vi.fn().mockResolvedValue({
    success: true,
    error: null,
    data: { role: 'admin' },
  }),
}));

import DashboardLayout from '@/app/dashboard/layout';

describe('DashboardLayout sidebar', () => {
  it('links only to routes that have a page', async () => {
    render(<DashboardLayout>content</DashboardLayout>);

    await screen.findByRole('link', { name: 'User Management' });

    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('/dashboard'));

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(existsSync(join(process.cwd(), 'src/app', href, 'page.tsx')), href).toBe(true);
    }
  });

  it('has no Settings link', () => {
    render(<DashboardLayout>content</DashboardLayout>);

    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });
});
