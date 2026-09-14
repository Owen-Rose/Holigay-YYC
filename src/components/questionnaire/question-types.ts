export const QUESTION_TYPES = [
  'short_text',
  'long_text',
  'email',
  'phone',
  'url',
  'number',
  'date',
  'single_select',
  'multi_select',
  'yes_no',
  'file_upload',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: 'Short Text',
  long_text: 'Long Text',
  email: 'Email',
  phone: 'Phone',
  url: 'URL',
  number: 'Number',
  date: 'Date',
  single_select: 'Single Select',
  multi_select: 'Multi Select',
  yes_no: 'Yes / No',
  file_upload: 'File Upload',
};
