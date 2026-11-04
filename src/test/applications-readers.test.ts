// @vitest-environment node
//
// Node, not jsdom: applications.ts imports the email client, whose env module
// refuses to load where `window` exists.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getApplicationById } from '@/lib/actions/applications';

// spec 011 contracts/server-actions-and-ui.md §6 and §14 (constitution II for
// the modified getApplicationById). The reader has no requireRole() call — RLS
// and the /dashboard middleware scope it — so its failure case is the one it
// has: the row is not visible (PGRST116) or the read errors.

vi.mock('@/lib/email/client', () => ({ sendEmail: vi.fn() }));

type Result = { data: unknown; error: unknown };

let applicationResult: Result;
const selects: Record<string, string> = {};

function chain(table: string) {
  const c: Record<string, unknown> = {
    eq: () => c,
    order: () => c,
    single: () => Promise.resolve(applicationResult),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null, table }).then(resolve, reject),
  };
  return c;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        selects[table] = columns;
        return chain(table);
      },
    }),
  })),
}));

const VENDOR = {
  id: 'vendor-1',
  business_name: 'Jane Crafts',
  contact_name: 'Jane Doe',
  email: 'jane@example.com',
  product_links: ['https://etsy.com/shop/x', 'https://instagram.com/x'],
  description: null,
  user_id: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

const APPLICATION_ROW = {
  id: 'app-1',
  event_id: 'event-1',
  vendor_id: 'vendor-1',
  status: 'pending',
  submitted_at: '2026-11-03T18:00:00Z',
  updated_at: '2026-11-03T18:00:00Z',
  organizer_notes: null,
  vendor: VENDOR,
  event: {
    id: 'event-1',
    name: 'Winter Market',
    event_date: '2026-12-12',
    location: 'Hall',
    description: null,
    application_deadline: null,
    max_vendors: null,
    status: 'active',
  },
};

const GONE = ['phone', 'website', 'booth_preference', 'product_categories', 'special_requirements'];

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(selects)) delete selects[key];
  applicationResult = { data: APPLICATION_ROW, error: null };
});

describe('getApplicationById', () => {
  it('maps the vendor product links onto the detail', async () => {
    const result = await getApplicationById('app-1');

    expect(result.success).toBe(true);
    expect(result.data!.vendor.product_links).toEqual([
      'https://etsy.com/shop/x',
      'https://instagram.com/x',
    ]);
    expect(result.data!.dynamicAnswers).toBeNull();
  });

  it('reads product_links and none of phone, website or the fixed-form columns', async () => {
    const result = await getApplicationById('app-1');

    expect(selects['applications']).toContain('product_links');
    for (const column of GONE) {
      expect(selects['applications']).not.toContain(column);
      expect(result.data).not.toHaveProperty(column);
    }
  });

  it('answers not found when the row is not visible', async () => {
    applicationResult = { data: null, error: { code: 'PGRST116', message: 'No rows' } };

    expect(await getApplicationById('app-1')).toEqual({
      success: false,
      error: 'Application not found',
      data: null,
    });
  });

  it('answers a generic failure when the read errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    applicationResult = { data: null, error: { code: '500', message: 'boom' } };

    expect(await getApplicationById('app-1')).toEqual({
      success: false,
      error: 'Failed to fetch application',
      data: null,
    });
    consoleError.mockRestore();
  });
});
