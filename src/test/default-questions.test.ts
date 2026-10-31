// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EVENT_QUESTIONS,
  buildDefaultQuestionnaire,
} from '@/lib/questionnaire/default-questions';
import { validateShowIfRules } from '@/lib/questionnaire/show-if';
import { questionnaireInputSchema } from '@/lib/validations/questionnaire';

// UAT2-3 / UAT2-4 (docs/handoffs/2026-10-31-vendor-uat-findings.md): every new
// event starts from this seed, so the organizers' booth options, the
// tables-and-lottery help text and the corner acknowledgement are pinned here.

const booth = DEFAULT_EVENT_QUESTIONS[0];
const ack = DEFAULT_EVENT_QUESTIONS[1];

describe('default booth preference question (UAT2-3)', () => {
  it('is first, required and single-select', () => {
    expect(booth.key).toBe('booth_preference');
    expect(booth.type).toBe('single_select');
    expect(booth.required).toBe(true);
    expect(booth.label).toBe('Booth Preference');
  });

  it('offers the five spaces in the agreed order with the agreed labels', () => {
    expect(booth.options).toEqual([
      {
        key: 'single_central',
        label: "Single space in central area (approximately 6'x6', one table is provided)",
      },
      {
        key: 'single_wall',
        label:
          "Single space on the wall (approximately 6'x6', one table is provided, access to power)",
      },
      {
        key: 'double_central',
        label: "Double space in central area (approximately 12'x6', two tables are provided)",
      },
      {
        key: 'double_wall',
        label:
          "Double space on the wall (approximately 12'x6', two tables are provided, access to power)",
      },
      {
        key: 'corner',
        label:
          "Corner space, lottery (approximately 10'x10', up to three tables are provided, access to power)",
      },
    ]);
  });

  it('carries the tables, chairs and lottery help text within the 500-character column', () => {
    expect(booth.help_text).toBe(
      "Tables are provided for every option and are approximately 6' long by 2' wide. Two chairs are provided for each single space. Only three corner spaces are available per event; if more than three vendors ask for one, corners are assigned by lottery draw, and anyone not drawn is moved to a double space on the wall."
    );
    expect(booth.help_text!.length).toBeLessThanOrEqual(500);
  });
});

describe('default corner acknowledgement (UAT2-4)', () => {
  it('is a required yes/no shown only when corner is chosen', () => {
    expect(ack.key).toBe('corner_lottery_acknowledgement');
    expect(ack.type).toBe('yes_no');
    expect(ack.required).toBe(true);
    expect(ack.label).toBe(
      "I understand that corner spaces are assigned by lottery, and that if my name isn't drawn my application will be changed to a double space on the wall."
    );
    expect(ack.show_if).toEqual({ question: 'booth_preference', value: 'corner' });
  });
});

describe('the rest of the seed', () => {
  it('keeps product categories and special requirements after the booth block', () => {
    expect(DEFAULT_EVENT_QUESTIONS.map((q) => q.key)).toEqual([
      'booth_preference',
      'corner_lottery_acknowledgement',
      'product_categories',
      'special_requirements',
    ]);
    expect(DEFAULT_EVENT_QUESTIONS[2].type).toBe('multi_select');
    expect(DEFAULT_EVENT_QUESTIONS[3].type).toBe('long_text');
  });
});

describe('buildDefaultQuestionnaire', () => {
  it('assigns a fresh unique id to every question on each call', () => {
    const a = buildDefaultQuestionnaire();
    const b = buildDefaultQuestionnaire();
    const ids = [...a, ...b].map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('resolves the acknowledgement show-if to the booth question id', () => {
    const payload = buildDefaultQuestionnaire();
    expect(payload[1].show_if).toEqual({
      questionId: payload[0].id,
      operator: 'equals',
      value: 'corner',
    });
    expect(payload[0].show_if).toBeNull();
    expect(payload[2].show_if).toBeNull();
  });

  it('is a valid questionnaire payload (show-if rules and option constraints)', () => {
    const payload = buildDefaultQuestionnaire();
    expect(
      validateShowIfRules(
        payload.map((q, position) => ({
          id: q.id,
          position,
          type: q.type,
          options: q.options,
          show_if: q.show_if,
        }))
      ).ok
    ).toBe(true);
    const parsed = questionnaireInputSchema.safeParse({
      eventId: '2b703c47-1a4f-451e-8d60-742537445195',
      questions: payload.map((q, position) => ({ ...q, position })),
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });
});
