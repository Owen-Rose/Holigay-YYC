/**
 * Date and time formatting for display, export and email.
 *
 * Everything the app shows is for one marketplace in Calgary, so every helper
 * formats in `America/Edmonton` explicitly. Without that, server-rendered
 * pages and server actions format in the host's zone — UTC on Vercel — and a
 * 4:13 PM submission reads as 10:13 PM (UAT-4, 2026-09-27).
 *
 * Two kinds of value come out of the database and they must not share a
 * helper:
 *
 * - `date` columns (`events.event_date`, `events.application_deadline`) and
 *   questionnaire `date` answers are plain `YYYY-MM-DD` strings with no
 *   instant attached. `new Date('2026-12-01')` is *UTC midnight*, so formatting
 *   it in a zone west of UTC prints the previous day. `formatDateOnly` keeps
 *   the calendar day exactly as stored.
 * - `timestamptz` columns (`submitted_at`, `updated_at`, `uploaded_at`,
 *   `created_at`) are real instants and *should* move to local time.
 *   `formatDateTime` converts them to Edmonton.
 *
 * Pure functions, safe in server components, client components and server
 * actions alike; the explicit zone also keeps server and client output equal.
 */

export const APP_TIME_ZONE = 'America/Edmonton';

const LOCALE = 'en-US';

/** `Dec 15, 2026` — list rows, tables, CSV export. */
export const DATE_SHORT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/** `Sun, Dec 15, 2026` — detail pages. */
export const DATE_WEEKDAY: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/** `Sunday, December 15, 2026` — public pages and emails. */
export const DATE_LONG: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
};

/** `Sep 27, 2026, 4:13 PM` — submission and update stamps. */
export const DATE_TIME: Intl.DateTimeFormatOptions = {
  ...DATE_SHORT,
  hour: 'numeric',
  minute: '2-digit',
};

const DATE_ONLY_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Formats a Postgres `date` (`YYYY-MM-DD`) on exactly that calendar day.
 * Returns `''` for empty input and the raw string if it is not a date.
 */
export function formatDateOnly(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = DATE_SHORT
): string {
  if (!value) return '';
  const match = DATE_ONLY_PREFIX.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  // Build the day at UTC midnight and format it in UTC: the zone never moves it.
  const utcDay = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(utcDay.getTime())) return value;
  return utcDay.toLocaleDateString(LOCALE, { ...options, timeZone: 'UTC' });
}

/**
 * Formats a `timestamptz` instant in Edmonton local time.
 * Returns `''` for empty input and the raw string if it cannot be parsed.
 */
export function formatDateTime(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = DATE_TIME
): string {
  if (!value) return '';
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return value;
  return instant.toLocaleString(LOCALE, { ...options, timeZone: APP_TIME_ZONE });
}

/** Today's Edmonton calendar day as `YYYY-MM-DD` (export file names). */
export function todayDateOnly(now: Date = new Date()): string {
  // en-CA renders numeric dates as YYYY-MM-DD.
  return now.toLocaleDateString('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
