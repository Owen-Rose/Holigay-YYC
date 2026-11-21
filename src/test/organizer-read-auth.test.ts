// @vitest-environment node
//
// Node, not jsdom: applications.ts imports the email client, whose env module
// refuses to load where `window` exists.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getApplications,
  getApplicationById,
  getApplicationCounts,
} from '@/lib/actions/applications';
import { getEvents, getEventById } from '@/lib/actions/events';
import { requireRole } from '@/lib/auth/roles';

// BL-21 (constitution I.2): organizer-facing reads authorize with
// requireRole('organizer') before touching the database. RLS stays the
// authority; this is the action-layer half of the two-layer rule.

vi.mock('@/lib/email/client', () => ({ sendEmail: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ requireRole: vi.fn() }));

type Result = { data: unknown; error: unknown; count?: number | null };

const fromCalls: string[] = [];
const results: Record<string, Result> = {};

function chain(table: string) {
  const settle = () => Promise.resolve(results[table] ?? { data: [], error: null });
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    in: () => c,
    or: () => c,
    order: () => c,
    range: () => c,
    single: settle,
    then: (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
      settle().then(onFulfilled, onRejected),
  };
  return c;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: (table: string) => {
      fromCalls.push(table);
      return chain(table);
    },
  })),
}));

const ORGANIZER = {
  success: true,
  error: null,
  data: { role: 'organizer' as const, userId: 'user-1' },
};
const DENIED = { success: false, error: 'Requires organizer role or higher', data: null };

const EVENT = {
  id: 'event-1',
  name: 'Winter Market',
  event_date: '2026-12-12',
  location: 'Hall',
  description: null,
  application_deadline: null,
  status: 'active',
  max_vendors: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

const APPLICATION = {
  id: 'app-1',
  event_id: 'event-1',
  vendor_id: 'vendor-1',
  status: 'pending',
  submitted_at: '2026-11-03T18:00:00Z',
  updated_at: '2026-11-03T18:00:00Z',
  organizer_notes: null,
  vendor: {
    id: 'vendor-1',
    business_name: 'Jane Crafts',
    contact_name: 'Jane Doe',
    email: 'jane@example.com',
    product_links: ['https://etsy.com/shop/x'],
    description: null,
    user_id: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  fromCalls.length = 0;
  for (const key of Object.keys(results)) delete results[key];
  vi.mocked(requireRole).mockResolvedValue(ORGANIZER);
});

describe('organizer reads refuse a caller below organizer', () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue(DENIED);
  });

  it('getApplications', async () => {
    expect(await getApplications()).toEqual(DENIED);
    expect(requireRole).toHaveBeenCalledWith('organizer');
    expect(fromCalls).toEqual([]);
  });

  it('getApplicationById', async () => {
    expect(await getApplicationById('app-1')).toEqual(DENIED);
    expect(requireRole).toHaveBeenCalledWith('organizer');
    expect(fromCalls).toEqual([]);
  });

  it('getApplicationCounts answers all zeros', async () => {
    expect(await getApplicationCounts()).toEqual({
      pending: 0,
      approved: 0,
      rejected: 0,
      waitlisted: 0,
      total: 0,
    });
    expect(requireRole).toHaveBeenCalledWith('organizer');
    expect(fromCalls).toEqual([]);
  });

  it('getEvents', async () => {
    expect(await getEvents()).toEqual(DENIED);
    expect(requireRole).toHaveBeenCalledWith('organizer');
    expect(fromCalls).toEqual([]);
  });

  it('getEventById', async () => {
    expect(await getEventById('event-1')).toEqual(DENIED);
    expect(requireRole).toHaveBeenCalledWith('organizer');
    expect(fromCalls).toEqual([]);
  });
});

describe('organizer reads answer an organizer', () => {
  it('getApplications returns the page with its pagination', async () => {
    results['applications'] = { data: [APPLICATION], error: null, count: 1 };

    const result = await getApplications();

    expect(result.success).toBe(true);
    expect(result.data!.applications.map((a) => a.id)).toEqual(['app-1']);
    expect(result.data!.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1,
    });
  });

  it('getApplicationCounts tallies by status', async () => {
    results['applications'] = {
      data: [{ status: 'pending' }, { status: 'approved' }, { status: 'pending' }],
      error: null,
    };

    expect(await getApplicationCounts()).toEqual({
      pending: 2,
      approved: 1,
      rejected: 0,
      waitlisted: 0,
      total: 3,
    });
  });

  it('getEvents attaches the application count to each event', async () => {
    results['events'] = { data: [EVENT], error: null };
    results['applications'] = {
      data: [{ event_id: 'event-1' }, { event_id: 'event-1' }],
      error: null,
    };

    const result = await getEvents();

    expect(result.success).toBe(true);
    expect(result.data).toEqual([{ ...EVENT, application_count: 2 }]);
  });

  it('getEventById returns the event', async () => {
    results['events'] = { data: EVENT, error: null };

    expect(await getEventById('event-1')).toEqual({ success: true, error: null, data: EVENT });
  });
});
