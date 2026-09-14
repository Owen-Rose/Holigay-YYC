import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import * as React from 'react';
import ApplicationDetailPage from '@/app/dashboard/applications/[id]/page';
import VendorApplicationDetailPage from '@/app/vendor-dashboard/applications/[id]/page';
import type { ApplicationDetail } from '@/lib/actions/applications';
import type { VendorApplicationDetail } from '@/lib/actions/vendor-dashboard';

// =============================================================================
// Mocks
// =============================================================================

const mockGetApplicationById = vi.fn();
const mockGetVendorApplicationDetail = vi.fn();

vi.mock('@/lib/actions/applications', () => ({
  getApplicationById: (...args: unknown[]) => mockGetApplicationById(...args),
}));

vi.mock('@/lib/actions/vendor-dashboard', () => ({
  getVendorApplicationDetail: (...args: unknown[]) => mockGetVendorApplicationDetail(...args),
}));

vi.mock('@/app/dashboard/applications/[id]/status-buttons', () => ({
  StatusUpdateButtons: () => React.createElement('div', { 'data-testid': 'status-buttons' }),
}));

vi.mock('@/app/dashboard/applications/[id]/organizer-notes', () => ({
  OrganizerNotes: () => React.createElement('div', { 'data-testid': 'organizer-notes' }),
}));

vi.mock('@/app/dashboard/applications/[id]/attachments-list', () => ({
  AttachmentsList: () => React.createElement('div', { 'data-testid': 'attachments' }),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('notFound called');
  }),
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
// Fixtures
// =============================================================================

const LEGACY_APPLICATION: ApplicationDetail = {
  id: 'app-legacy',
  event_id: 'event-1',
  vendor_id: 'vendor-1',
  status: 'pending',
  submitted_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  booth_preference: 'indoor',
  product_categories: ['handmade_crafts', 'jewelry'],
  special_requirements: 'Need a corner spot',
  organizer_notes: null,
  vendor: {
    id: 'vendor-1',
    business_name: 'Artisan Crafts',
    contact_name: 'Jane Smith',
    email: 'jane@artisan.com',
    phone: null,
    website: null,
    description: null,
    user_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  event: {
    id: 'event-1',
    name: 'Holiday Market 2024',
    event_date: '2024-12-15',
    location: 'Calgary Convention Centre',
    description: null,
    application_deadline: '2024-12-01',
    max_vendors: 50,
    status: 'active',
  },
  attachments: [],
  dynamicAnswers: null,
};

const LEGACY_VENDOR_APPLICATION: VendorApplicationDetail = {
  id: 'app-legacy-v',
  status: 'pending',
  submitted_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  booth_preference: 'outdoor',
  product_categories: ['art'],
  special_requirements: 'Water access needed',
  vendor: {
    business_name: 'Fine Art Studio',
    contact_name: 'Alex Brown',
    email: 'alex@fineart.com',
    phone: null,
    website: null,
    description: null,
  },
  event: {
    id: 'event-1',
    name: 'Holiday Market 2024',
    event_date: '2024-12-15',
    location: 'Calgary',
    description: null,
    application_deadline: null,
    max_vendors: null,
    status: 'active',
  },
  attachments: [],
  dynamicAnswers: null,
};

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('ApplicationDetailPage — legacy application (no dynamicAnswers)', () => {
  beforeEach(() => {
    mockGetApplicationById.mockResolvedValue({
      success: true,
      error: null,
      data: LEGACY_APPLICATION,
    });
  });

  it('renders Booth Preference label', async () => {
    const page = await ApplicationDetailPage({ params: Promise.resolve({ id: 'app-legacy' }) });
    render(page as React.ReactElement);
    expect(screen.getByText('Booth Preference')).toBeInTheDocument();
  });

  it('renders Product Categories label', async () => {
    const page = await ApplicationDetailPage({ params: Promise.resolve({ id: 'app-legacy' }) });
    render(page as React.ReactElement);
    expect(screen.getByText('Product Categories')).toBeInTheDocument();
  });

  it('renders Special Requirements label', async () => {
    const page = await ApplicationDetailPage({ params: Promise.resolve({ id: 'app-legacy' }) });
    render(page as React.ReactElement);
    expect(screen.getByText('Special Requirements')).toBeInTheDocument();
  });
});

describe('VendorApplicationDetailPage — legacy application (no dynamicAnswers)', () => {
  beforeEach(() => {
    mockGetVendorApplicationDetail.mockResolvedValue({
      success: true,
      data: LEGACY_VENDOR_APPLICATION,
    });
  });

  it('renders Booth Preference label', async () => {
    const page = await VendorApplicationDetailPage({
      params: Promise.resolve({ id: 'app-legacy-v' }),
    });
    render(page as React.ReactElement);
    expect(screen.getByText('Booth Preference')).toBeInTheDocument();
  });

  it('renders Product Categories label', async () => {
    const page = await VendorApplicationDetailPage({
      params: Promise.resolve({ id: 'app-legacy-v' }),
    });
    render(page as React.ReactElement);
    expect(screen.getByText('Product Categories')).toBeInTheDocument();
  });

  it('renders Special Requirements label', async () => {
    const page = await VendorApplicationDetailPage({
      params: Promise.resolve({ id: 'app-legacy-v' }),
    });
    render(page as React.ReactElement);
    expect(screen.getByText('Special Requirements')).toBeInTheDocument();
  });
});
