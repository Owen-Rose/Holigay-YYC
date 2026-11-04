import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportApplicationsCSV } from '@/lib/actions/export';
import { requireRole } from '@/lib/auth/roles';

// spec 011 contracts/server-actions-and-ui.md §7 and §14 row 9 (FR-014). The
// header list is spelled out here rather than imported: it is the acceptance
// criterion, and export.ts is a 'use server' module that may only export
// async functions.

const FR_014_HEADERS = [
  'Business Name',
  'Contact Name',
  'Email',
  'Link 1',
  'Link 2',
  'Link 3',
  'Status',
  'Submitted Date',
  'Event',
  'Organizer Notes',
  'Business Description',
];

type Result = { data: unknown; error: unknown };

let applicationsResult: Result;
let vendorSearchResult: Result;
const selects: Record<string, string> = {};

// Thenable chain: filters are ignored; awaiting it yields the table's result.
function chain(result: () => Result) {
  const c: Record<string, unknown> = {
    eq: () => c,
    in: () => c,
    or: () => c,
    order: () => c,
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return c;
}

vi.mock('@/lib/auth/roles', () => ({ requireRole: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        selects[table] = columns;
        return chain(() => (table === 'vendors' ? vendorSearchResult : applicationsResult));
      },
    }),
  })),
}));

const requireRoleMock = vi.mocked(requireRole);

const APPLICATION = {
  id: 'app-1',
  status: 'pending',
  submitted_at: '2026-11-03T18:00:00Z',
  organizer_notes: 'Strong fit',
  vendor: {
    business_name: 'Jane Crafts',
    contact_name: 'Jane Doe',
    email: 'jane@example.com',
    product_links: ['https://etsy.com/shop/x', 'https://instagram.com/x'],
    description: 'Candles',
  },
  event: { name: 'Winter Market' },
};

// Splits on commas outside double quotes; "" inside quotes is one quote.
function cells(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function rows(csv: string): string[][] {
  return csv.split('\n').map(cells);
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(selects)) delete selects[key];
  requireRoleMock.mockResolvedValue({
    success: true,
    error: null,
    data: { role: 'organizer', userId: 'user-1' },
  });
  applicationsResult = { data: [APPLICATION], error: null };
  vendorSearchResult = { data: [], error: null };
});

describe('exportApplicationsCSV', () => {
  it('emits the eleven FR-014 columns as the header row', async () => {
    const result = await exportApplicationsCSV();

    expect(result.success).toBe(true);
    expect(rows(result.data!.csv)[0]).toEqual(FR_014_HEADERS);
  });

  it('writes the links into Link 1–3 and leaves Link 3 blank for a vendor with two', async () => {
    const result = await exportApplicationsCSV();

    const [, row] = rows(result.data!.csv);
    expect(row!.slice(0, 6)).toEqual([
      'Jane Crafts',
      'Jane Doe',
      'jane@example.com',
      'https://etsy.com/shop/x',
      'https://instagram.com/x',
      '',
    ]);
    expect(row).toHaveLength(FR_014_HEADERS.length);
    expect(row![6]).toBe('pending');
    expect(row!.slice(8)).toEqual(['Winter Market', 'Strong fit', 'Candles']);
    expect(result.data!.count).toBe(1);
  });

  it('reads product_links and no longer reads phone, website or the fixed-form columns', async () => {
    await exportApplicationsCSV();

    const select = selects['applications']!;
    expect(select).toContain('product_links');
    for (const gone of [
      'phone',
      'website',
      'booth_preference',
      'product_categories',
      'special_requirements',
    ]) {
      expect(select).not.toContain(gone);
    }
  });

  it('uses the same header row when the search matches no vendor', async () => {
    const result = await exportApplicationsCSV({ search: 'nobody' });

    expect(result.success).toBe(true);
    expect(result.data!.count).toBe(0);
    expect(rows(result.data!.csv)).toEqual([FR_014_HEADERS]);
  });

  it('refuses a caller below organizer', async () => {
    requireRoleMock.mockResolvedValue({
      success: false,
      error: 'Requires organizer role or higher',
      data: null,
    });

    const result = await exportApplicationsCSV();

    expect(result).toEqual({
      success: false,
      error: 'Requires organizer role or higher',
      data: null,
    });
    expect(selects).toEqual({});
  });
});
