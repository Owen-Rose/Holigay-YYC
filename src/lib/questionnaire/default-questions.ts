import { CATEGORY_LABELS, PRODUCT_CATEGORIES } from '@/lib/validations/application';
import type { QuestionType } from '@/components/questionnaire/question-types';
import type { ShowIfRule } from '@/lib/questionnaire/show-if';

/**
 * The questions every new event starts with. Seeded once by
 * `create_event_with_default_questionnaire` (migration 014 reads `id` and
 * `show_if`); organizers edit the copy per event in the builder.
 *
 * The booth block (options, help text, corner acknowledgement) is the
 * organizers' wording from the October 2026 vendor UAT —
 * docs/handoffs/2026-10-31-vendor-uat-findings.md, UAT2-3 and UAT2-4.
 */
export type DefaultQuestion = {
  /** Stable name used only to express show-if references inside this seed. */
  key: string;
  type: QuestionType;
  label: string;
  help_text?: string;
  required: boolean;
  options?: { key: string; label: string }[];
  /** Shown only when the named earlier question has this option key chosen. */
  show_if?: { question: string; value: string };
};

export const BOOTH_OPTIONS = [
  {
    key: 'single_central',
    label: "Single space in central area (approximately 6'x6', one table is provided)",
  },
  {
    key: 'single_wall',
    label: "Single space on the wall (approximately 6'x6', one table is provided, access to power)",
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
] as const;

export const BOOTH_HELP_TEXT =
  "Tables are provided for every option and are approximately 6' long by 2' wide. Two chairs are provided for each single space. Only three corner spaces are available per event; if more than three vendors ask for one, corners are assigned by lottery draw, and anyone not drawn is moved to a double space on the wall.";

export const CORNER_ACKNOWLEDGEMENT_LABEL =
  "I understand that corner spaces are assigned by lottery, and that if my name isn't drawn my application will be changed to a double space on the wall.";

export const DEFAULT_EVENT_QUESTIONS: DefaultQuestion[] = [
  {
    key: 'booth_preference',
    type: 'single_select',
    label: 'Booth Preference',
    help_text: BOOTH_HELP_TEXT,
    required: true,
    options: BOOTH_OPTIONS.map((o) => ({ ...o })),
  },
  {
    key: 'corner_lottery_acknowledgement',
    type: 'yes_no',
    label: CORNER_ACKNOWLEDGEMENT_LABEL,
    required: true,
    show_if: { question: 'booth_preference', value: 'corner' },
  },
  {
    key: 'product_categories',
    type: 'multi_select',
    label: 'Product Categories',
    required: true,
    options: PRODUCT_CATEGORIES.map((key) => ({
      key,
      label: CATEGORY_LABELS[key] ?? key,
    })),
  },
  {
    key: 'special_requirements',
    type: 'long_text',
    label: 'Special Requirements',
    required: false,
  },
];

/** One element of the `questions` array handed to the seed RPC. */
export type SeedQuestion = {
  id: string;
  type: QuestionType;
  label: string;
  help_text: string | null;
  required: boolean;
  options: { key: string; label: string }[] | null;
  show_if: ShowIfRule | null;
};

/**
 * Turns the seed into the RPC payload: a fresh uuid per question (the RPC
 * inserts the given ids) and every `show_if` resolved from the seed key to the
 * trigger question's id. Array order is the questionnaire order.
 */
export function buildDefaultQuestionnaire(): SeedQuestion[] {
  const ids = new Map(DEFAULT_EVENT_QUESTIONS.map((q) => [q.key, crypto.randomUUID()]));

  return DEFAULT_EVENT_QUESTIONS.map((q) => {
    let show_if: ShowIfRule | null = null;
    if (q.show_if) {
      const questionId = ids.get(q.show_if.question);
      if (!questionId) {
        throw new Error(
          `Default question "${q.key}" show_if names unknown key "${q.show_if.question}"`
        );
      }
      show_if = { questionId, operator: 'equals', value: q.show_if.value };
    }
    return {
      id: ids.get(q.key)!,
      type: q.type,
      label: q.label,
      help_text: q.help_text ?? null,
      required: q.required,
      options: q.options ?? null,
      show_if,
    };
  });
}
