'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { AnswerValue } from '@/lib/questionnaire/answer-coercion';
import type { Database } from '@/types/database';

type EventQuestion = Database['public']['Tables']['event_questions']['Row'];

export interface QuestionInputProps {
  question: EventQuestion;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | undefined) => void;
  error?: string;
  onFileSelect?: (file: File | null) => void;
}

function requiredLabel(label: string, required: boolean) {
  return required ? `${label} *` : label;
}

export function QuestionInput({
  question,
  value,
  onChange,
  error,
  onFileSelect,
}: QuestionInputProps) {
  const { type, label, help_text, required, options } = question;
  const hint = help_text ?? undefined;
  const displayLabel = requiredLabel(label, required);

  // ---------------------------------------------------------------------------
  // Text types
  // ---------------------------------------------------------------------------

  if (type === 'short_text') {
    return (
      <Input
        label={displayLabel}
        hint={hint}
        type="text"
        value={value?.kind === 'text' ? value.value : ''}
        onChange={(e) => onChange({ kind: 'text', value: e.target.value })}
        error={error}
        aria-required={required}
      />
    );
  }

  if (type === 'email') {
    return (
      <Input
        label={displayLabel}
        hint={hint}
        type="email"
        value={value?.kind === 'text' ? value.value : ''}
        onChange={(e) => onChange({ kind: 'text', value: e.target.value })}
        error={error}
        aria-required={required}
      />
    );
  }

  if (type === 'phone') {
    return (
      <Input
        label={displayLabel}
        hint={hint}
        type="tel"
        value={value?.kind === 'text' ? value.value : ''}
        onChange={(e) => onChange({ kind: 'text', value: e.target.value })}
        error={error}
        aria-required={required}
      />
    );
  }

  if (type === 'url') {
    return (
      <Input
        label={displayLabel}
        hint={hint}
        type="url"
        value={value?.kind === 'text' ? value.value : ''}
        onChange={(e) => onChange({ kind: 'text', value: e.target.value })}
        error={error}
        aria-required={required}
      />
    );
  }

  if (type === 'long_text') {
    return (
      <Textarea
        label={displayLabel}
        hint={hint}
        value={value?.kind === 'text' ? value.value : ''}
        onChange={(e) => onChange({ kind: 'text', value: e.target.value })}
        error={error}
        aria-required={required}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Number
  // ---------------------------------------------------------------------------

  if (type === 'number') {
    return (
      <Input
        label={displayLabel}
        hint={hint}
        type="number"
        value={value?.kind === 'number' ? String(value.value) : ''}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange({ kind: 'number', value: n });
          else onChange(undefined);
        }}
        error={error}
        aria-required={required}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Date
  // ---------------------------------------------------------------------------

  if (type === 'date') {
    return (
      <Input
        label={displayLabel}
        hint={hint}
        type="date"
        value={value?.kind === 'date' ? value.value : ''}
        onChange={(e) => onChange({ kind: 'date', value: e.target.value })}
        error={error}
        aria-required={required}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Single select
  // ---------------------------------------------------------------------------

  if (type === 'single_select') {
    const optList = (options as { key: string; label: string }[] | null) ?? [];
    return (
      <Select
        label={displayLabel}
        hint={hint}
        value={value?.kind === 'choice' ? value.value : ''}
        options={optList.map((o) => ({ value: o.key, label: o.label }))}
        placeholder="Select an option"
        onChange={(e) => {
          const v = e.target.value;
          if (v) onChange({ kind: 'choice', value: v });
          else onChange(undefined);
        }}
        error={error}
        aria-required={required}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Multi select — uses Checkbox component which renders proper <label> per option
  // ---------------------------------------------------------------------------

  if (type === 'multi_select') {
    const optList = (options as { key: string; label: string }[] | null) ?? [];
    const selectedKeys = value?.kind === 'choices' ? value.value : [];
    return (
      <fieldset>
        <legend className="text-foreground mb-2 text-sm font-medium">{displayLabel}</legend>
        {hint && <p className="text-muted mb-1 text-xs">{hint}</p>}
        <div className="space-y-1">
          {optList.map((opt) => (
            <Checkbox
              key={opt.key}
              label={opt.label}
              checked={selectedKeys.includes(opt.key)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...selectedKeys, opt.key]
                  : selectedKeys.filter((k) => k !== opt.key);
                onChange({ kind: 'choices', value: next });
              }}
            />
          ))}
        </div>
        {error && (
          <p className="mt-1 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </fieldset>
    );
  }

  // ---------------------------------------------------------------------------
  // Yes / No
  // ---------------------------------------------------------------------------

  if (type === 'yes_no') {
    const boolVal = value?.kind === 'boolean' ? value.value : null;
    return (
      <fieldset>
        <legend className="text-foreground mb-2 text-sm font-medium">{displayLabel}</legend>
        {hint && <p className="text-muted mb-1 text-xs">{hint}</p>}
        <div className="flex gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name={`yn-${question.id}`}
              value="true"
              checked={boolVal === true}
              onChange={() => onChange({ kind: 'boolean', value: true })}
              className="text-primary focus:ring-primary/50 h-4 w-4"
            />
            <span className="text-foreground">Yes</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name={`yn-${question.id}`}
              value="false"
              checked={boolVal === false}
              onChange={() => onChange({ kind: 'boolean', value: false })}
              className="text-primary focus:ring-primary/50 h-4 w-4"
            />
            <span className="text-foreground">No</span>
          </label>
        </div>
        {error && (
          <p className="mt-1 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </fieldset>
    );
  }

  // ---------------------------------------------------------------------------
  // File upload
  // ---------------------------------------------------------------------------

  if (type === 'file_upload') {
    const fileName = value?.kind === 'file' ? value.name : undefined;
    return (
      <div>
        <Input
          label={displayLabel}
          hint={hint}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) {
              onChange(undefined);
              onFileSelect?.(null);
              return;
            }
            onChange({
              kind: 'file',
              path: '',
              name: file.name,
              mimeType: file.type,
              size: file.size,
            });
            onFileSelect?.(file);
          }}
          error={error}
          aria-required={required}
        />
        {fileName && (
          <p className="text-muted mt-1 text-xs">Selected: {fileName}</p>
        )}
      </div>
    );
  }

  return null;
}
