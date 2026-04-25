import { z } from 'zod';
import { QUESTION_TYPES } from '@/components/questionnaire/question-types';
import { validateShowIfRules } from '@/lib/questionnaire/show-if';

// =============================================================================
// Primitive schemas
// =============================================================================

export const optionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
});

export const showIfInputSchema = z.object({
  questionId: z.string().uuid(),
  operator: z.literal('equals'),
  value: z.string(),
});

// =============================================================================
// questionInputSchema
// Single-question validation. Enforces:
//   - options required (non-empty) when type is single_select or multi_select
//   - option keys must be unique within the question
// =============================================================================

export const questionInputSchema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    label: z.string().trim().min(1).max(200),
    help_text: z.string().max(500).nullable().optional(),
    required: z.boolean().default(false),
    options: z.array(optionSchema).nullable().optional(),
    show_if: showIfInputSchema.nullable().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.type === 'single_select' || q.type === 'multi_select') {
      if (!q.options || q.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: `Options are required for ${q.type} questions`,
        });
      } else {
        const keys = q.options.map((o) => o.key);
        const unique = new Set(keys);
        if (unique.size !== keys.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['options'],
            message: 'Option keys must be unique',
          });
        }
      }
    }
  });

// =============================================================================
// answerValueSchema — discriminated union per R1 shapes
// =============================================================================

const textAnswerSchema = z.object({ kind: z.literal('text'), value: z.string() });
const numberAnswerSchema = z.object({ kind: z.literal('number'), value: z.number() });
const dateAnswerSchema = z.object({
  kind: z.literal('date'),
  value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const choiceAnswerSchema = z.object({ kind: z.literal('choice'), value: z.string().min(1) });
const choicesAnswerSchema = z.object({
  kind: z.literal('choices'),
  value: z.array(z.string()),
});
const booleanAnswerSchema = z.object({ kind: z.literal('boolean'), value: z.boolean() });
const fileAnswerSchema = z.object({
  kind: z.literal('file'),
  path: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
});

export const answerValueSchema = z.discriminatedUnion('kind', [
  textAnswerSchema,
  numberAnswerSchema,
  dateAnswerSchema,
  choiceAnswerSchema,
  choicesAnswerSchema,
  booleanAnswerSchema,
  fileAnswerSchema,
]);

export type AnswerValueInput = z.infer<typeof answerValueSchema>;

// =============================================================================
// templateInputSchema — for creating / updating a template with its questions
// Runs validateShowIfRules over the full question set in a top-level superRefine.
// =============================================================================

export const templateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).nullable().optional(),
    questions: z.array(
      questionInputSchema.extend({
        id: z.string().uuid().optional(), // present when updating existing questions
        position: z.number().int().min(0),
      }),
    ),
  })
  .superRefine((data, ctx) => {
    const result = validateShowIfRules(
      data.questions.map((q, i) => ({
        id: q.id ?? `__new_${i}`,
        position: q.position,
        type: q.type,
        options: q.options ?? null,
        show_if: q.show_if ?? null,
      })),
    );
    if (!result.ok) {
      for (const err of result.errors) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err.message,
        });
      }
    }
  });

export type TemplateInput = z.infer<typeof templateInputSchema>;

// =============================================================================
// questionnaireInputSchema — for validating a full event questionnaire update
// Same show-if rules pass applied to the complete set.
// =============================================================================

export const questionnaireInputSchema = z
  .object({
    eventId: z.string().uuid(),
    questions: z.array(
      questionInputSchema.extend({
        id: z.string().uuid().optional(),
        position: z.number().int().min(0),
      }),
    ),
  })
  .superRefine((data, ctx) => {
    const result = validateShowIfRules(
      data.questions.map((q, i) => ({
        id: q.id ?? `__new_${i}`,
        position: q.position,
        type: q.type,
        options: q.options ?? null,
        show_if: q.show_if ?? null,
      })),
    );
    if (!result.ok) {
      for (const err of result.errors) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err.message,
        });
      }
    }
  });

export type QuestionnaireInput = z.infer<typeof questionnaireInputSchema>;
