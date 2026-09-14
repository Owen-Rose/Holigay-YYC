import { describe, it, expect } from 'vitest';
import { isAnswerEmpty, type AnswerValue } from '@/lib/questionnaire/answer-coercion';

// =============================================================================
// isAnswerEmpty — per-kind table (spec 006, FR-009 / research.md R10)
// =============================================================================

const EMPTY_CASES: Array<[string, AnswerValue]> = [
  ['text: empty string', { kind: 'text', value: '' }],
  ['text: whitespace only', { kind: 'text', value: '   \t\n ' }],
  ['choice: empty string', { kind: 'choice', value: '' }],
  ['date: empty string', { kind: 'date', value: '' }],
  ['choices: empty list', { kind: 'choices', value: [] }],
  [
    'file: unset path',
    { kind: 'file', path: '', name: 'photo.jpg', mimeType: 'image/jpeg', size: 1024 },
  ],
];

const NON_EMPTY_CASES: Array<[string, AnswerValue]> = [
  ['text: content', { kind: 'text', value: 'Handmade pottery' }],
  ['text: content with surrounding space', { kind: 'text', value: '  pottery  ' }],
  ['choice: option key', { kind: 'choice', value: 'option-a' }],
  ['date: ISO date', { kind: 'date', value: '2024-12-15' }],
  ['choices: one selection', { kind: 'choices', value: ['x'] }],
  [
    'file: uploaded path',
    { kind: 'file', path: '/uploads/x.jpg', name: 'x.jpg', mimeType: 'image/jpeg', size: 1024 },
  ],
  ['number: positive', { kind: 'number', value: 42 }],
  ['number: zero is an answer', { kind: 'number', value: 0 }],
  ['boolean: true', { kind: 'boolean', value: true }],
  ['boolean: false is an answer', { kind: 'boolean', value: false }],
];

describe('isAnswerEmpty', () => {
  it.each(EMPTY_CASES)('treats %s as empty', (_label, answer) => {
    expect(isAnswerEmpty(answer)).toBe(true);
  });

  it.each(NON_EMPTY_CASES)('treats %s as answered', (_label, answer) => {
    expect(isAnswerEmpty(answer)).toBe(false);
  });
});
