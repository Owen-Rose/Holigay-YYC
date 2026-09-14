// =============================================================================
// Questionnaire save error mapping — spec 005, Phase 11 (T058)
//
// `save_event_questionnaire` signals every expected failure with a SQLSTATE
// (migration 012 §2); PostgREST surfaces it as `error.code`. The action layer
// maps that code — and nothing else — to a canned message. Raw messages carry
// constraint names and RAISE text, so callers log them and return only this.
//
// Contract: specs/005-dynamic-questionnaires/contracts/questionnaire-actions.md
// =============================================================================

import type { PostgrestError } from '@supabase/supabase-js';

const GENERIC_MESSAGE = 'Failed to save questionnaire';

const MESSAGE_BY_CODE: Record<string, string> = {
  '42501': 'You do not have permission to edit this questionnaire',
  P0002: 'Event or template not found',
  P0001: 'This event has been published; its questionnaire is locked',
  P0004: 'Questionnaire payload is invalid. Reload the page and try again.',
  '23503': 'Cannot remove a question that already has answers',
};

/**
 * Maps a PostgREST error from `save_event_questionnaire` to a user-facing
 * message. Unrecognized codes (CHECK violations, transport failures) collapse
 * to the generic message.
 */
export function mapSaveQuestionnaireError(error: Pick<PostgrestError, 'code'> | null): string {
  const code = error?.code;
  if (!code) return GENERIC_MESSAGE;
  return MESSAGE_BY_CODE[code] ?? GENERIC_MESSAGE;
}
