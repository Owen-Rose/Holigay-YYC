import { z } from 'zod';
import type { QuestionType } from '@/components/questionnaire/question-types';
import type { Json } from '@/types/database';

// =============================================================================
// AnswerValue — discriminated union matching R1 shapes from research.md
// =============================================================================

export type TextAnswer = { kind: 'text'; value: string };
export type NumberAnswer = { kind: 'number'; value: number };
export type DateAnswer = { kind: 'date'; value: string }; // ISO YYYY-MM-DD
export type ChoiceAnswer = { kind: 'choice'; value: string }; // single option key
export type ChoicesAnswer = { kind: 'choices'; value: string[] }; // ordered option keys
export type BooleanAnswer = { kind: 'boolean'; value: boolean };
export type FileAnswer = {
  kind: 'file';
  path: string;
  name: string;
  mimeType: string;
  size: number;
};

export type AnswerValue =
  | TextAnswer
  | NumberAnswer
  | DateAnswer
  | ChoiceAnswer
  | ChoicesAnswer
  | BooleanAnswer
  | FileAnswer;

// =============================================================================
// buildAnswersSchema
// Produces a per-questionnaire z.object keyed by question ID.
// Required questions must have a value; optional may be undefined.
// =============================================================================

type QuestionMeta = {
  id: string;
  type: QuestionType;
  required: boolean;
};

const textAnswerSchema = z.object({ kind: z.literal('text'), value: z.string() });
const numberAnswerSchema = z.object({ kind: z.literal('number'), value: z.number() });
const dateAnswerSchema = z.object({
  kind: z.literal('date'),
  value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
});
const choiceAnswerSchema = z.object({ kind: z.literal('choice'), value: z.string().min(1) });
const choicesAnswerSchema = z.object({ kind: z.literal('choices'), value: z.array(z.string()) });
const booleanAnswerSchema = z.object({ kind: z.literal('boolean'), value: z.boolean() });
const fileAnswerSchema = z.object({
  kind: z.literal('file'),
  path: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
});

const TEXT_TYPES: QuestionType[] = ['short_text', 'long_text', 'email', 'phone', 'url'];

function schemaForType(type: QuestionType) {
  if (TEXT_TYPES.includes(type)) return textAnswerSchema;
  if (type === 'number') return numberAnswerSchema;
  if (type === 'date') return dateAnswerSchema;
  if (type === 'single_select') return choiceAnswerSchema;
  if (type === 'multi_select') return choicesAnswerSchema;
  if (type === 'yes_no') return booleanAnswerSchema;
  if (type === 'file_upload') return fileAnswerSchema;
  // Exhaustive fallback — should not be reached with a valid QuestionType
  return z.never();
}

export function buildAnswersSchema(questions: QuestionMeta[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const q of questions) {
    const base = schemaForType(q.type);
    shape[q.id] = q.required ? base : base.optional();
  }
  return z.object(shape);
}

// =============================================================================
// coerceAnswerToJsonb
// Converts a typed AnswerValue to a plain JSON-serialisable object.
// The tagged shapes are already JSON-compatible; this is a narrow type cast.
// =============================================================================

export function coerceAnswerToJsonb(answer: AnswerValue): Json {
  return answer as unknown as Json;
}

// =============================================================================
// coerceJsonbToAnswer
// Converts a raw JSONB value back to a typed AnswerValue, guided by the
// question type. Returns null on parse failure so renderers can fall back.
// =============================================================================

export function coerceJsonbToAnswer(value: Json, type: QuestionType): AnswerValue | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;

  const raw = value as Record<string, Json>;
  const kind = raw['kind'];

  try {
    if (TEXT_TYPES.includes(type) && kind === 'text') {
      return textAnswerSchema.parse(raw);
    }
    if (type === 'number' && kind === 'number') {
      return numberAnswerSchema.parse(raw);
    }
    if (type === 'date' && kind === 'date') {
      return dateAnswerSchema.parse(raw);
    }
    if (type === 'single_select' && kind === 'choice') {
      return choiceAnswerSchema.parse(raw);
    }
    if (type === 'multi_select' && kind === 'choices') {
      return choicesAnswerSchema.parse(raw);
    }
    if (type === 'yes_no' && kind === 'boolean') {
      return booleanAnswerSchema.parse(raw);
    }
    if (type === 'file_upload' && kind === 'file') {
      return fileAnswerSchema.parse(raw);
    }
  } catch {
    // parse failure → fall back to null (renderer uses plain text via SC-007)
  }

  return null;
}
