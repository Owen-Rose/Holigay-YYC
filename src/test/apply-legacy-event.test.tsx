import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import ApplyPage from '@/app/(public)/apply/page';
import { getEventQuestionnaire } from '@/lib/actions/questionnaires';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('@/lib/actions/applications', () => ({
  getActiveEvents: vi.fn().mockResolvedValue([
    {
      id: 'event-legacy',
      name: 'Legacy Market',
      event_date: '2024-12-15',
      location: 'Calgary',
      description: null,
      application_deadline: '2099-12-01',
    },
  ]),
}));

vi.mock('@/lib/actions/questionnaires', () => ({
  getEventQuestionnaire: vi.fn().mockResolvedValue({
    success: true,
    error: null,
    data: null, // no questionnaire → legacy path
  }),
}));

vi.mock('@/app/(public)/apply/client', () => ({
  ApplicationPageClient: () =>
    React.createElement('div', { 'data-testid': 'legacy-form' }, 'Legacy Form'),
}));

const mockGetUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

vi.mock('@/app/(public)/apply/_components/dynamic-application-form', () => ({
  DynamicApplicationForm: ({ accountEmail }: { accountEmail: string | null }) =>
    React.createElement(
      'div',
      { 'data-testid': 'dynamic-form', 'data-account-email': String(accountEmail) },
      'Dynamic Form'
    ),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => React.createElement('a', { href, className }, children),
}));

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe('ApplyPage — legacy event (no questionnaire row)', () => {
  it('renders ApplicationPageClient when questionnaire is null', async () => {
    const pageElement = await ApplyPage({
      searchParams: Promise.resolve({ event_id: 'event-legacy' }),
    });
    render(pageElement);

    expect(screen.getByTestId('legacy-form')).toBeInTheDocument();
  });

  it('does not render DynamicApplicationForm when questionnaire is null', async () => {
    const pageElement = await ApplyPage({
      searchParams: Promise.resolve({ event_id: 'event-legacy' }),
    });
    render(pageElement);

    expect(screen.queryByTestId('dynamic-form')).not.toBeInTheDocument();
  });

  it('renders the event picker when no event_id is provided', async () => {
    const pageElement = await ApplyPage({
      searchParams: Promise.resolve({}),
    });
    render(pageElement);

    // Event picker shows the event name with an Apply link
    expect(screen.getByText('Legacy Market')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /apply/i })).toBeInTheDocument();
  });
});

describe('ApplyPage — account email (spec 011 FR-006)', () => {
  beforeEach(() => {
    vi.mocked(getEventQuestionnaire).mockResolvedValueOnce({
      success: true,
      error: null,
      data: { questionnaire: {}, questions: [] } as never,
    });
  });

  it('passes the signed-in address to the form', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'jane@example.com' } },
      error: null,
    });

    render(await ApplyPage({ searchParams: Promise.resolve({ event_id: 'event-legacy' }) }));

    expect(screen.getByTestId('dynamic-form')).toHaveAttribute(
      'data-account-email',
      'jane@example.com'
    );
  });

  it('passes null when signed out', async () => {
    render(await ApplyPage({ searchParams: Promise.resolve({ event_id: 'event-legacy' }) }));

    expect(screen.getByTestId('dynamic-form')).toHaveAttribute('data-account-email', 'null');
  });
});
