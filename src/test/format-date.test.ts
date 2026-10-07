import { describe, it, expect } from 'vitest';
import {
  APP_TIME_ZONE,
  DATE_LONG,
  DATE_SHORT,
  DATE_TIME,
  DATE_WEEKDAY,
  formatDateOnly,
  formatDateTime,
  todayDateOnly,
} from '@/lib/format-date';

// Every helper passes an explicit timeZone, so these expectations hold whatever
// TZ the machine or CI runner uses (UAT-4: Vercel renders in UTC).

describe('formatDateTime — timestamptz values rendered in Edmonton time', () => {
  it('uses America/Edmonton', () => {
    expect(APP_TIME_ZONE).toBe('America/Edmonton');
  });

  it('renders a UTC afternoon submission as the Calgary local time', () => {
    // The 2026-09-27 UAT run: 4:13 PM MDT was shown as 10:13 PM.
    expect(formatDateTime('2026-09-27T22:13:00Z')).toBe('Sep 27, 2026, 4:13 PM');
  });

  it('moves to the previous calendar day when UTC has already crossed midnight', () => {
    expect(formatDateTime('2026-10-07T03:30:00Z')).toBe('Oct 6, 2026, 9:30 PM');
  });

  it('honours standard time in winter', () => {
    expect(formatDateTime('2026-12-15T20:05:00Z')).toBe('Dec 15, 2026, 1:05 PM');
  });

  it('accepts a date-only preset for list views', () => {
    expect(formatDateTime('2026-10-07T03:30:00Z', DATE_SHORT)).toBe('Oct 6, 2026');
  });

  it('accepts Postgres timestamptz text with an offset', () => {
    expect(formatDateTime('2026-09-27 22:13:00+00', DATE_TIME)).toBe('Sep 27, 2026, 4:13 PM');
  });

  it('returns an empty string for null, undefined and empty input', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime(undefined)).toBe('');
    expect(formatDateTime('')).toBe('');
  });

  it('returns the raw value when it cannot be parsed', () => {
    expect(formatDateTime('not a date')).toBe('not a date');
  });
});

describe('formatDateOnly — Postgres date values never shift a day', () => {
  it('renders a YYYY-MM-DD value on that calendar day', () => {
    expect(formatDateOnly('2026-12-01')).toBe('Dec 1, 2026');
  });

  it('keeps New Year on New Year', () => {
    expect(formatDateOnly('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatDateOnly('2026-12-31')).toBe('Dec 31, 2026');
  });

  it('supports the weekday and long presets used on detail pages and in emails', () => {
    expect(formatDateOnly('2026-12-01', DATE_WEEKDAY)).toBe('Tue, Dec 1, 2026');
    expect(formatDateOnly('2026-12-01', DATE_LONG)).toBe('Tuesday, December 1, 2026');
  });

  it('supports single-part options for the landing-page date badge', () => {
    expect(formatDateOnly('2026-12-01', { month: 'short' })).toBe('Dec');
    expect(formatDateOnly('2026-12-01', { day: 'numeric' })).toBe('1');
    expect(formatDateOnly('2026-12-01', { year: 'numeric' })).toBe('2026');
  });

  it('ignores a time portion if one is present', () => {
    expect(formatDateOnly('2026-12-01T00:00:00')).toBe('Dec 1, 2026');
  });

  it('returns an empty string for null, undefined and empty input', () => {
    expect(formatDateOnly(null)).toBe('');
    expect(formatDateOnly(undefined)).toBe('');
    expect(formatDateOnly('')).toBe('');
  });

  it('returns the raw value when it is not a date', () => {
    expect(formatDateOnly('soon')).toBe('soon');
  });
});

describe('todayDateOnly — YYYY-MM-DD in Edmonton for file names', () => {
  it('matches the ISO date format', () => {
    expect(todayDateOnly()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses the Edmonton calendar day for a given instant', () => {
    expect(todayDateOnly(new Date('2026-10-07T03:30:00Z'))).toBe('2026-10-06');
  });
});
