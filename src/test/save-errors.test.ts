import { describe, it, expect } from 'vitest';
import { mapSaveQuestionnaireError } from '@/lib/questionnaire/save-errors';

describe('mapSaveQuestionnaireError', () => {
  it.each([
    ['42501', /permission/i],
    ['P0002', /not found/i],
    ['P0001', /published|locked/i],
    ['P0004', /invalid.*reload/i],
    ['23503', /already has answers/i],
  ])('maps %s to its canned message', (code, expected) => {
    expect(mapSaveQuestionnaireError({ code })).toMatch(expected);
  });

  it('collapses unknown codes and null to the generic message', () => {
    expect(mapSaveQuestionnaireError({ code: '23514' })).toBe('Failed to save questionnaire');
    expect(mapSaveQuestionnaireError(null)).toBe('Failed to save questionnaire');
  });

  it('never echoes the raw database message', () => {
    expect(
      mapSaveQuestionnaireError({
        code: 'P0004',
        message: 'Question belongs to another questionnaire',
      } as never)
    ).not.toMatch(/another questionnaire/);
  });
});
