import { describe, it, expect } from 'vitest';
import { questionnaireInputSchema } from '@/lib/validations/questionnaire';

// Valid v4 UUIDs (Zod checks version + variant nibbles).
const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const yesNo = (id: string, position: number) => ({
  id,
  position,
  type: 'yes_no' as const,
  label: 'Need power?',
  required: false,
});

const dependent = (id: string, position: number, triggerId: string) => ({
  id,
  position,
  type: 'short_text' as const,
  label: 'Which appliances?',
  required: false,
  show_if: { questionId: triggerId, operator: 'equals' as const, value: 'true' },
});

describe('questionnaireInputSchema', () => {
  it('accepts a full questionnaire where a show_if points at an earlier new question', () => {
    const result = questionnaireInputSchema.safeParse({
      eventId: EVENT_ID,
      questions: [yesNo(ID_A, 0), dependent(ID_B, 1, ID_A)],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a show_if that references a later question (forward reference)', () => {
    const result = questionnaireInputSchema.safeParse({
      eventId: EVENT_ID,
      questions: [dependent(ID_B, 0, ID_A), yesNo(ID_A, 1)],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/does not exist or comes after/i);
  });

  it('rejects a show_if whose trigger is a multi_select', () => {
    const result = questionnaireInputSchema.safeParse({
      eventId: EVENT_ID,
      questions: [
        {
          id: ID_A,
          position: 0,
          type: 'multi_select',
          label: 'Categories',
          required: false,
          options: [{ key: 'a', label: 'A' }],
        },
        {
          ...dependent(ID_B, 1, ID_A),
          show_if: { questionId: ID_A, operator: 'equals', value: 'a' },
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/only yes_no and single_select/i);
  });

  it('rejects a select question without options', () => {
    const result = questionnaireInputSchema.safeParse({
      eventId: EVENT_ID,
      questions: [
        { id: ID_A, position: 0, type: 'single_select', label: 'Booth', required: false },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/options are required/i);
  });

  it('rejects more than 200 questions', () => {
    const questions = Array.from({ length: 201 }, (_, i) => ({
      position: i,
      type: 'short_text' as const,
      label: `Q${i}`,
      required: false,
    }));

    const result = questionnaireInputSchema.safeParse({ eventId: EVENT_ID, questions });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate question ids', () => {
    const result = questionnaireInputSchema.safeParse({
      eventId: EVENT_ID,
      questions: [yesNo(ID_A, 0), { ...yesNo(ID_A, 1), label: 'Again' }, yesNo(ID_C, 2)],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/duplicate question id/i);
  });

  it('still accepts questions without an id (caller assigns one)', () => {
    const result = questionnaireInputSchema.safeParse({
      eventId: EVENT_ID,
      questions: [{ position: 0, type: 'short_text', label: 'Booth name', required: false }],
    });

    expect(result.success).toBe(true);
  });
});
