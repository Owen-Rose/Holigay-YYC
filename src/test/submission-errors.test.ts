import { describe, it, expect } from 'vitest';
import {
  mapSubmissionError,
  DUPLICATE_APPLICATION_MESSAGE,
  INVALID_ANSWERS_MESSAGE,
} from '@/lib/submission/errors';

// =============================================================================
// mapSubmissionError — spec 006, T016 (research.md R2)
//
// Pure table test: SQLSTATE in, canned string out. The load-bearing property
// beyond the mapping itself is that nothing from the raw error leaks through.
// =============================================================================

describe('mapSubmissionError', () => {
  it.each([
    ['P0002', 'Event not found'],
    ['P0001', 'This event is not currently accepting applications'],
    ['P0003', DUPLICATE_APPLICATION_MESSAGE],
    ['P0004', INVALID_ANSWERS_MESSAGE],
    ['23505', 'Failed to create application'],
    ['23502', 'Failed to create application'],
    ['42501', 'Failed to create application'],
    ['', 'Failed to create application'],
  ])('maps %s to its canned message', (code, expected) => {
    expect(mapSubmissionError({ code })).toBe(expected);
  });

  it('falls back to the generic message for a null error', () => {
    expect(mapSubmissionError(null)).toBe('Failed to create application');
  });

  it('never forwards the raw error text', () => {
    const leaky = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "application_answers_pkey"',
    };

    const mapped = mapSubmissionError(leaky);

    expect(mapped).toBe('Failed to create application');
    expect(mapped).not.toContain('constraint');
    expect(mapped).not.toContain('application_answers_pkey');
  });
});
