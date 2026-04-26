'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  QuestionEditor,
  type QuestionDraft,
  type QuestionOption,
} from '@/components/forms/question-editor';
import { createTemplate, updateTemplate } from '@/lib/actions/templates';
import type { Database } from '@/types/database';

type TemplateQuestionRow = Database['public']['Tables']['template_questions']['Row'];

interface TemplateBuilderProps {
  templateId?: string;
  initialName?: string;
  initialDescription?: string | null;
  initialQuestions: TemplateQuestionRow[];
}

function toQuestionDraft(q: TemplateQuestionRow): QuestionDraft {
  return {
    id: q.id,
    type: q.type,
    label: q.label,
    help_text: q.help_text ?? '',
    required: q.required,
    options: (q.options as QuestionOption[] | null) ?? [],
    show_if: null,
  };
}

export function TemplateBuilder({
  templateId,
  initialName = '',
  initialDescription = '',
  initialQuestions,
}: TemplateBuilderProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    initialQuestions.map(toQuestionDraft),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [labelErrors, setLabelErrors] = useState<Record<number, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  function addQuestion() {
    setQuestions((prev) => [
      ...prev,
      { type: 'short_text', label: '', help_text: '', required: false, options: [], show_if: null },
    ]);
  }

  function updateQuestion(index: number, updated: QuestionDraft) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? updated : q)));
    if (labelErrors[index]) {
      setLabelErrors((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    }
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function moveUp(index: number) {
    if (index === 0) return;
    setQuestions((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    setQuestions((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  async function handleSave() {
    let hasErrors = false;

    if (!name.trim()) {
      setNameError('Template name is required');
      hasErrors = true;
    } else {
      setNameError(null);
    }

    const errors: Record<number, string> = {};
    questions.forEach((q, i) => {
      if (!q.label.trim()) errors[i] = 'Label is required';
    });
    if (Object.keys(errors).length > 0) {
      setLabelErrors(errors);
      hasErrors = true;
    } else {
      setLabelErrors({});
    }

    if (hasErrors) return;

    setSaveError(null);
    setIsSaving(true);

    try {
      const questionPayload = questions.map((q, i) => ({
        id: q.id,
        position: i,
        type: q.type,
        label: q.label,
        help_text: q.help_text || null,
        required: q.required,
        options: q.options.length ? q.options : null,
        show_if: null,
      }));

      if (templateId) {
        const result = await updateTemplate({
          id: templateId,
          name: name.trim(),
          description: description.trim() || null,
          questions: questionPayload,
        });
        if (!result.success) {
          setSaveError(result.error ?? 'Failed to save template');
          return;
        }
        toast.success('Template saved');
      } else {
        const result = await createTemplate({
          name: name.trim(),
          description: description.trim() || null,
          questions: questionPayload,
        });
        if (!result.success || !result.data) {
          setSaveError(result.error ?? 'Failed to create template');
          return;
        }
        router.push(`/dashboard/templates/${result.data.id}`);
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-border-subtle bg-surface rounded-lg border p-6 space-y-4">
        <h2 className="text-foreground text-lg font-semibold">Template Details</h2>
        <Input
          label="Name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          placeholder="e.g. Holiday Market Standard"
          error={nameError ?? undefined}
          disabled={isSaving}
        />
        <Textarea
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Briefly describe this template"
          rows={3}
          disabled={isSaving}
        />
      </div>

      <div className="border-border-subtle bg-surface rounded-lg border p-6">
        <h2 className="text-foreground mb-4 text-lg font-semibold">Questions</h2>

        <div className="space-y-4">
          {questions.map((q, i) => (
            <div key={q.id ?? `new-${i}`} className="flex items-start gap-2">
              <div className="flex shrink-0 flex-col gap-1 pt-5">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={i === 0 || isSaving}
                  onClick={() => moveUp(i)}
                  aria-label="Move question up"
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={i === questions.length - 1 || isSaving}
                  onClick={() => moveDown(i)}
                  aria-label="Move question down"
                >
                  ↓
                </Button>
              </div>
              <div className="flex-1">
                <QuestionEditor
                  question={q}
                  index={i}
                  labelError={labelErrors[i]}
                  onChange={(updated) => updateQuestion(i, updated)}
                  onDelete={() => removeQuestion(i)}
                />
              </div>
            </div>
          ))}
        </div>

        {saveError && (
          <p className="mt-4 text-sm text-red-400" role="alert">
            {saveError}
          </p>
        )}

        <div className="mt-4 flex gap-3 pt-2">
          <Button variant="outline" type="button" onClick={addQuestion} disabled={isSaving}>
            Add question
          </Button>
          <Button type="button" onClick={handleSave} isLoading={isSaving} disabled={isSaving}>
            {templateId ? 'Save template' : 'Create template'}
          </Button>
        </div>
      </div>
    </div>
  );
}
