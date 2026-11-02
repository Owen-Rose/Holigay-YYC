import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import ApplyPage from '@/app/(public)/apply/page';
import { getEventQuestionnaire } from '@/lib/actions/questionnaires';

// Spec 011 FR-018: the fixed application form is gone, so an event without a
// questionnaire shows a not-accepting message instead of a form.

// =============================================================================
// Mocks
// =============================================================================

vi.mock('@/lib/actions/applications', () => ({
  getActiveEvents: vi.fn().mockResolvedValue([
    {
      id: 'event-1',
      name: 'Winter Market',
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
    data: null, // no questionnaire row
  }),
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

describe('ApplyPage — event without a questionnaire (spec 011 FR-018)', () => {
  it('shows the not-accepting message and the back link', async () => {
    render(await ApplyPage({ searchParams: Promise.resolve({ event_id: 'event-1' }) }));

    expect(
      screen.getByText('This event is not accepting applications right now.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Back to events' })).toHaveAttribute(
      'href',
      '/apply'
    );
  });

  it('renders no form', async () => {
    const { container } = render(
      await ApplyPage({ searchParams: Promise.resolve({ event_id: 'event-1' }) })
    );

    expect(screen.queryByTestId('dynamic-form')).not.toBeInTheDocument();
    expect(container.querySelector('form')).toBeNull();
  });

  it('renders the event picker when no event_id is provided', async () => {
    render(await ApplyPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText('Winter Market')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /apply/i })).toBeInTheDocument();
  });
});

describe('ApplyPage — event with a questionnaire, account email (spec 011 FR-006)', () => {
  beforeEach(() => {
    vi.mocked(getEventQuestionnaire).mockResolvedValueOnce({
      success: true,
      error: null,
      data: { questionnaire: {}, questions: [] } as never,
    });
  });

  it('renders the questionnaire form with the signed-in address', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'jane@example.com' } },
      error: null,
    });

    render(await ApplyPage({ searchParams: Promise.resolve({ event_id: 'event-1' }) }));

    expect(screen.getByTestId('dynamic-form')).toHaveAttribute(
      'data-account-email',
      'jane@example.com'
    );
    expect(
      screen.queryByText('This event is not accepting applications right now.')
    ).not.toBeInTheDocument();
  });

  it('passes null when signed out', async () => {
    render(await ApplyPage({ searchParams: Promise.resolve({ event_id: 'event-1' }) }));

    expect(screen.getByTestId('dynamic-form')).toHaveAttribute('data-account-email', 'null');
  });
});
