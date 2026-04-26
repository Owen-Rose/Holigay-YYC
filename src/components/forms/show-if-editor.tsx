'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';
import type { QuestionType } from '@/components/questionnaire/question-types';
import type { ShowIfRule } from '@/lib/questionnaire/show-if';

export type ShowIfSibling = {
  id?: string;
  type: QuestionType;
  label: string;
  options: { key: string; label: string }[];
};

interface ShowIfEditorProps {
  value: ShowIfRule | null;
  earlierSiblings: ShowIfSibling[];
  onChange: (rule: ShowIfRule | null) => void;
}

const YES_NO_VALUE_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

export function ShowIfEditor({ value, earlierSiblings, onChange }: ShowIfEditorProps) {
  const eligible = earlierSiblings.filter(
    (s) => s.id != null && (s.type === 'yes_no' || s.type === 'single_select'),
  );

  if (eligible.length === 0) return null;

  const enabled = value != null;

  function handleToggle(checked: boolean) {
    if (!checked) {
      onChange(null);
    } else {
      onChange({ questionId: eligible[0].id!, operator: 'equals', value: '' });
    }
  }

  function handleTriggerChange(newQuestionId: string) {
    onChange({ questionId: newQuestionId, operator: 'equals', value: '' });
  }

  function handleValueChange(newValue: string) {
    if (!value) return;
    onChange({ ...value, value: newValue });
  }

  const selectedTrigger = value ? eligible.find((s) => s.id === value.questionId) : null;

  return (
    <div className="border-border rounded-md border p-3 space-y-3">
      <Checkbox
        label="Show only if…"
        checked={enabled}
        onChange={(e) => handleToggle(e.target.checked)}
      />

      {value && (
        <div className="space-y-2 pl-8">
          <Select
            label="Question"
            value={value.questionId}
            options={eligible.map((s) => ({ value: s.id!, label: s.label || '(unlabelled)' }))}
            onChange={(e) => handleTriggerChange(e.target.value)}
          />

          <p className="text-muted text-sm">
            <span className="font-medium">Operator:</span> equals
          </p>

          {selectedTrigger?.type === 'yes_no' && (
            <Select
              label="Value"
              value={value.value}
              options={YES_NO_VALUE_OPTIONS}
              placeholder="Pick a value…"
              onChange={(e) => handleValueChange(e.target.value)}
            />
          )}

          {selectedTrigger?.type === 'single_select' && (
            <Select
              label="Value"
              value={value.value}
              options={selectedTrigger.options.map((o) => ({ value: o.key, label: o.label }))}
              placeholder={
                selectedTrigger.options.length === 0
                  ? '(no options on trigger question yet)'
                  : 'Pick a value…'
              }
              disabled={selectedTrigger.options.length === 0}
              onChange={(e) => handleValueChange(e.target.value)}
            />
          )}
        </div>
      )}
    </div>
  );
}
