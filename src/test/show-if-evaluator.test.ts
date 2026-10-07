import { describe, it, expect } from 'vitest';
import { describeShowIf, evaluateShowIf, validateShowIfRules } from '@/lib/questionnaire/show-if';

// ============================================================
// evaluateShowIf
// ============================================================

describe('evaluateShowIf', () => {
  it('returns true when rule is null', () => {
    expect(evaluateShowIf(null, {})).toBe(true);
  });

  it('returns true when rule is undefined', () => {
    expect(evaluateShowIf(undefined, {})).toBe(true);
  });

  it('matches yes_no trigger when value is "true" and answer is true', () => {
    const answers = { q1: { kind: 'boolean', value: true } };
    expect(evaluateShowIf({ questionId: 'q1', operator: 'equals', value: 'true' }, answers)).toBe(
      true
    );
  });

  it('mismatches yes_no trigger when value is "true" but answer is false', () => {
    const answers = { q1: { kind: 'boolean', value: false } };
    expect(evaluateShowIf({ questionId: 'q1', operator: 'equals', value: 'true' }, answers)).toBe(
      false
    );
  });

  it('matches yes_no trigger when value is "false" and answer is false', () => {
    const answers = { q1: { kind: 'boolean', value: false } };
    expect(evaluateShowIf({ questionId: 'q1', operator: 'equals', value: 'false' }, answers)).toBe(
      true
    );
  });

  it('matches single_select trigger when option key equals rule value', () => {
    const answers = { q1: { kind: 'choice', value: 'indoor' } };
    expect(evaluateShowIf({ questionId: 'q1', operator: 'equals', value: 'indoor' }, answers)).toBe(
      true
    );
  });

  it('mismatches single_select trigger when option key differs from rule value', () => {
    const answers = { q1: { kind: 'choice', value: 'outdoor' } };
    expect(evaluateShowIf({ questionId: 'q1', operator: 'equals', value: 'indoor' }, answers)).toBe(
      false
    );
  });

  it('returns false for unsupported trigger kind', () => {
    const answers = { q1: { kind: 'text', value: 'hello' } };
    expect(evaluateShowIf({ questionId: 'q1', operator: 'equals', value: 'hello' }, answers)).toBe(
      false
    );
  });

  it('returns false when referenced question is not in answers', () => {
    expect(evaluateShowIf({ questionId: 'missing', operator: 'equals', value: 'x' }, {})).toBe(
      false
    );
  });
});

// ============================================================
// validateShowIfRules
// ============================================================

describe('validateShowIfRules', () => {
  it('returns ok when there are no show-if rules', () => {
    const questions = [
      { id: 'q1', position: 0, type: 'short_text' as const, show_if: null },
      { id: 'q2', position: 1, type: 'short_text' as const, show_if: null },
    ];
    expect(validateShowIfRules(questions)).toEqual({ ok: true, errors: [] });
  });

  it('returns ok for a valid backward reference', () => {
    const questions = [
      {
        id: 'q1',
        position: 0,
        type: 'yes_no' as const,
        options: null,
        show_if: null,
      },
      {
        id: 'q2',
        position: 1,
        type: 'short_text' as const,
        options: null,
        show_if: { questionId: 'q1', operator: 'equals' as const, value: 'true' },
      },
    ];
    expect(validateShowIfRules(questions)).toEqual({ ok: true, errors: [] });
  });

  it('rejects a forward reference (q1 points to q2 which has higher position)', () => {
    const questions = [
      {
        id: 'q1',
        position: 0,
        type: 'short_text' as const,
        options: null,
        show_if: { questionId: 'q2', operator: 'equals' as const, value: 'true' },
      },
      {
        id: 'q2',
        position: 1,
        type: 'yes_no' as const,
        options: null,
        show_if: null,
      },
    ];
    const result = validateShowIfRules(questions);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.questionId === 'q1')).toBe(true);
  });

  it('rejects a two-question cycle', () => {
    const questions = [
      {
        id: 'q1',
        position: 0,
        type: 'yes_no' as const,
        options: null,
        show_if: { questionId: 'q2', operator: 'equals' as const, value: 'true' },
      },
      {
        id: 'q2',
        position: 1,
        type: 'yes_no' as const,
        options: null,
        show_if: { questionId: 'q1', operator: 'equals' as const, value: 'true' },
      },
    ];
    const result = validateShowIfRules(questions);
    expect(result.ok).toBe(false);
  });

  it('rejects a three-question cycle', () => {
    const questions = [
      {
        id: 'q1',
        position: 0,
        type: 'yes_no' as const,
        options: null,
        show_if: { questionId: 'q3', operator: 'equals' as const, value: 'true' },
      },
      {
        id: 'q2',
        position: 1,
        type: 'yes_no' as const,
        options: null,
        show_if: { questionId: 'q1', operator: 'equals' as const, value: 'true' },
      },
      {
        id: 'q3',
        position: 2,
        type: 'yes_no' as const,
        options: null,
        show_if: { questionId: 'q2', operator: 'equals' as const, value: 'true' },
      },
    ];
    const result = validateShowIfRules(questions);
    expect(result.ok).toBe(false);
  });

  it('rejects a trigger of unsupported type (multi_select)', () => {
    const questions = [
      {
        id: 'q1',
        position: 0,
        type: 'multi_select' as const,
        options: [{ key: 'a' }, { key: 'b' }],
        show_if: null,
      },
      {
        id: 'q2',
        position: 1,
        type: 'short_text' as const,
        options: null,
        show_if: { questionId: 'q1', operator: 'equals' as const, value: 'a' },
      },
    ];
    const result = validateShowIfRules(questions);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.questionId === 'q2')).toBe(true);
  });

  it('rejects when single_select rule value is not a current option key', () => {
    const questions = [
      {
        id: 'q1',
        position: 0,
        type: 'single_select' as const,
        options: [{ key: 'indoor' }, { key: 'outdoor' }],
        show_if: null,
      },
      {
        id: 'q2',
        position: 1,
        type: 'short_text' as const,
        options: null,
        show_if: {
          questionId: 'q1',
          operator: 'equals' as const,
          value: 'rooftop', // not a valid option key
        },
      },
    ];
    const result = validateShowIfRules(questions);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.questionId === 'q2')).toBe(true);
  });

  it('rejects when yes_no rule value is not "true" or "false"', () => {
    const questions = [
      {
        id: 'q1',
        position: 0,
        type: 'yes_no' as const,
        options: null,
        show_if: null,
      },
      {
        id: 'q2',
        position: 1,
        type: 'short_text' as const,
        options: null,
        show_if: {
          questionId: 'q1',
          operator: 'equals' as const,
          value: 'maybe', // not "true" or "false"
        },
      },
    ];
    const result = validateShowIfRules(questions);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.questionId === 'q2')).toBe(true);
  });
});

// ============================================================
// describeShowIf
// ============================================================

describe('describeShowIf', () => {
  const questions = [
    { id: 'q1', type: 'yes_no' as const, label: 'Need power?', options: null },
    {
      id: 'q2',
      type: 'single_select' as const,
      label: 'Booth Preference',
      options: [
        { key: 'indoor', label: 'Indoor' },
        { key: 'outdoor', label: 'Outdoor' },
      ],
    },
    { id: 'q3', type: 'short_text' as const, label: 'Special Requirements', options: null },
  ];

  it('returns null without a rule', () => {
    expect(describeShowIf(null, questions)).toBeNull();
    expect(describeShowIf(undefined, questions)).toBeNull();
  });

  it('renders Yes / No for a yes_no trigger', () => {
    expect(describeShowIf({ questionId: 'q1', operator: 'equals', value: 'true' }, questions)).toBe(
      'Shown if Need power? = Yes'
    );
    expect(
      describeShowIf({ questionId: 'q1', operator: 'equals', value: 'false' }, questions)
    ).toBe('Shown if Need power? = No');
  });

  it('renders the option label for a single_select trigger', () => {
    expect(
      describeShowIf({ questionId: 'q2', operator: 'equals', value: 'outdoor' }, questions)
    ).toBe('Shown if Booth Preference = Outdoor');
  });

  it('falls back to the raw key when the option no longer exists', () => {
    expect(describeShowIf({ questionId: 'q2', operator: 'equals', value: 'tent' }, questions)).toBe(
      'Shown if Booth Preference = tent'
    );
  });

  it('falls back to "an earlier question" when the trigger is missing', () => {
    expect(
      describeShowIf({ questionId: 'gone', operator: 'equals', value: 'true' }, questions)
    ).toBe('Shown if an earlier question = true');
  });
});
