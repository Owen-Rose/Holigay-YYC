// @vitest-environment node
//
// Node, not jsdom: applications.ts imports the email client, whose env module
// refuses to load where `window` exists.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getActiveEvents } from '@/lib/actions/applications';

// BL-20: an active event with a blank deadline stays open, and the deadline (a
// DATE column) is compared with today's Edmonton calendar day, not a UTC instant.

vi.mock('@/lib/email/client', () => ({ sendEmail: vi.fn() }));

type Result = { data: unknown; error: unknown };

let result: Result;
const calls = { eq: [] as unknown[][], or: [] as string[], gte: [] as unknown[][] };

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (...args: unknown[]) => {
        calls.eq.push(args);
        return chain;
      },
      or: (filter: string) => {
        calls.or.push(filter);
        return chain;
      },
      gte: (...args: unknown[]) => {
        calls.gte.push(args);
        return chain;
      },
      order: () => Promise.resolve(result),
    };
    return { from: () => chain };
  }),
}));

const OPEN_EVENT = {
  id: 'event-1',
  name: 'Winter Market',
  event_date: '2026-12-12',
  location: 'Hall',
  description: null,
  application_deadline: null,
};

beforeEach(() => {
  // Only the clock: the Supabase mock resolves through real promises.
  vi.useFakeTimers({ toFake: ['Date'] });
  // 01:30 UTC on the 22nd is 18:30 on the 21st in Edmonton (MST, UTC-7).
  vi.setSystemTime(new Date('2026-11-22T01:30:00Z'));
  calls.eq.length = 0;
  calls.or.length = 0;
  calls.gte.length = 0;
  result = { data: [OPEN_EVENT], error: null };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getActiveEvents', () => {
  it('keeps active events whose deadline is blank or is today or later in Edmonton', async () => {
    await getActiveEvents();

    expect(calls.eq).toEqual([['status', 'active']]);
    expect(calls.or).toEqual(['application_deadline.is.null,application_deadline.gte.2026-11-21']);
    expect(calls.gte).toEqual([]);
  });

  it('returns the rows the query yields', async () => {
    expect(await getActiveEvents()).toEqual([OPEN_EVENT]);
  });

  it('returns an empty list when the read fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    result = { data: null, error: { message: 'boom' } };

    expect(await getActiveEvents()).toEqual([]);
    consoleError.mockRestore();
  });
});
