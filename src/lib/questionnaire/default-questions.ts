import {
  BOOTH_PREFERENCES,
  CATEGORY_LABELS,
  PRODUCT_CATEGORIES,
} from '@/lib/validations/application';
import type { QuestionType } from '@/components/questionnaire/question-types';

type DefaultQuestion = {
  type: QuestionType;
  label: string;
  required: boolean;
  options?: { key: string; label: string }[];
};

const BOOTH_PREFERENCE_LABELS: Record<(typeof BOOTH_PREFERENCES)[number], string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  no_preference: 'No Preference',
};

export const DEFAULT_EVENT_QUESTIONS: DefaultQuestion[] = [
  {
    type: 'single_select',
    label: 'Booth Preference',
    required: true,
    options: BOOTH_PREFERENCES.map((key) => ({
      key,
      label: BOOTH_PREFERENCE_LABELS[key],
    })),
  },
  {
    type: 'multi_select',
    label: 'Product Categories',
    required: true,
    options: PRODUCT_CATEGORIES.map((key) => ({
      key,
      label: CATEGORY_LABELS[key] ?? key,
    })),
  },
  {
    type: 'long_text',
    label: 'Special Requirements',
    required: false,
  },
];
