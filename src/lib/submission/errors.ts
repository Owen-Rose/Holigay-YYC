// =============================================================================
// Submission error mapping — spec 006, T016
//
// `submit_public_application` signals every expected failure with a SQLSTATE
// (research.md R2); PostgREST surfaces it as `error.code`. Both public
// submission actions map that code — and nothing else — to a canned message.
//
// Raw `message`/`details`/`hint` must never reach an anonymous caller: they
// carry constraint names and RAISE text. Callers log the raw error with
// console.error and return only what this module hands back.
//
// Contract: specs/006-close-public-data-exposure/contracts/submit-public-application.md
// =============================================================================

import type { PostgrestError } from '@supabase/supabase-js';

/** Duplicate-application wording is user-visible and predates this spec (SC-005). */
export const DUPLICATE_APPLICATION_MESSAGE =
  'You have already submitted an application for this event';

/** Also used by the action-level unknown-question rejection (research.md R11). */
export const INVALID_ANSWERS_MESSAGE =
  'Your submission contained invalid answers. Please reload the page and try again.';

const GENERIC_MESSAGE = 'Failed to create application';

const MESSAGE_BY_CODE: Record<string, string> = {
  P0002: 'Event not found',
  P0001: 'This event is not currently accepting applications',
  P0003: DUPLICATE_APPLICATION_MESSAGE,
  P0004: INVALID_ANSWERS_MESSAGE,
};

/**
 * Maps a PostgREST error from `submit_public_application` to a user-facing
 * message. Unrecognized codes (constraint violations, transport failures)
 * collapse to the generic message.
 */
export function mapSubmissionError(error: Pick<PostgrestError, 'code'> | null): string {
  const code = error?.code;
  if (!code) return GENERIC_MESSAGE;
  return MESSAGE_BY_CODE[code] ?? GENERIC_MESSAGE;
}
