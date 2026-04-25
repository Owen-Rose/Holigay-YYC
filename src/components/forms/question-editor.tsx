'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type QuestionType,
} from '@/components/questionnaire/question-types';

export type QuestionOption = { key: string; label: string };

export type QuestionDraft = {
  id?: string;
  type: QuestionType;
  label: string;
  help_text: string;
  required: boolean;
  options: QuestionOption[];
  show_if: null;
};

const TYPE_SELECT_OPTIONS = QUESTION_TYPES.map((t) => ({
  value: t,
  label: QUESTION_TYPE_LABELS[t],
}));

const CHOICE_TYPES: QuestionType[] = ['single_select', 'multi_select'];

interface QuestionEditorProps {
  question: QuestionDraft;
  index: number;
  labelError?: string;
  onChange: (updated: QuestionDraft) => void;
  onDelete: () => void;
}

export function QuestionEditor({
  question,
  index,
  labelError,
  onChange,
  onDelete,
}: QuestionEditorProps) {
  const isChoiceType = CHOICE_TYPES.includes(question.type);

  function set<K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) {
    const updated = { ...question, [key]: value };
    if (!CHOICE_TYPES.includes(updated.type)) {
      updated.options = [];
    }
    onChange(updated);
  }

  function setOption(i: number, field: keyof QuestionOption, value: string) {
    const options = question.options.map((o, idx) =>
      idx === i ? { ...o, [field]: value } : o,
    );
    onChange({ ...question, options });
  }

  function addOption() {
    onChange({ ...question, options: [...question.options, { key: '', label: '' }] });
  }

  function removeOption(i: number) {
    onChange({ ...question, options: question.options.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="bg-surface-bright border-border rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted text-sm font-medium">Question {index + 1}</span>
        <Button variant="ghost" size="sm" type="button" onClick={onDelete}>
          Remove question
        </Button>
      </div>

      <Select
        label="Type"
        value={question.type}
        options={TYPE_SELECT_OPTIONS}
        onChange={(e) => set('type', e.target.value as QuestionType)}
      />

      <Input
        label="Label"
        value={question.label}
        error={labelError}
        placeholder="Question label"
        onChange={(e) => set('label', e.target.value)}
      />

      <Textarea
        label="Help text"
        value={question.help_text}
        placeholder="Optional helper text shown below the question"
        rows={2}
        onChange={(e) => set('help_text', e.target.value)}
      />

      <Checkbox
        label="Required"
        checked={question.required}
        onChange={(e) => set('required', e.target.checked)}
      />

      {isChoiceType && (
        <div className="space-y-2">
          <p className="text-foreground text-sm font-medium">Options</p>
          {question.options.map((opt, i) => (
            <div key={i} className="flex gap-2 items-start">
              <Input
                placeholder="Key (e.g. indoor)"
                value={opt.key}
                onChange={(e) => setOption(i, 'key', e.target.value)}
              />
              <Input
                placeholder="Label (e.g. Indoor)"
                value={opt.label}
                onChange={(e) => setOption(i, 'label', e.target.value)}
              />
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => removeOption(i)}
                className="mt-1 shrink-0"
              >
                Remove
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" type="button" onClick={addOption}>
            Add option
          </Button>
        </div>
      )}
    </div>
  );
}
