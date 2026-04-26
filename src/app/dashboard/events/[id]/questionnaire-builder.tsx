'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  QuestionEditor,
  type QuestionDraft,
  type QuestionOption,
} from '@/components/forms/question-editor';
import {
  addEventQuestion,
  updateEventQuestion,
  deleteEventQuestion,
  reorderEventQuestions,
} from '@/lib/actions/questionnaires';
import { seedEventQuestionnaireFromTemplate } from '@/lib/actions/templates';
import type { Database } from '@/types/database';

type EventQuestion = Database['public']['Tables']['event_questions']['Row'];

interface TemplateOption {
  id: string;
  name: string;
}

interface QuestionnaireBuilderProps {
  eventId: string;
  initialQuestions: EventQuestion[];
  isLocked: boolean;
  templates?: TemplateOption[];
  hasAnswers?: boolean;
}

function toQuestionDraft(q: EventQuestion): QuestionDraft {
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

export function QuestionnaireBuilder({
  eventId,
  initialQuestions,
  isLocked,
  templates = [],
  hasAnswers = false,
}: QuestionnaireBuilderProps) {
  const router = useRouter();
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    initialQuestions.map(toQuestionDraft),
  );
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [labelErrors, setLabelErrors] = useState<Record<number, string>>({});
  const initialOrderRef = useRef(initialQuestions.map((q) => q.id));
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [isSeedingTemplate, setIsSeedingTemplate] = useState(false);

  if (isLocked) {
    return (
      <div className="space-y-3">
        <p className="text-muted text-sm">
          This questionnaire is locked because the event has been published.
        </p>
        <ul className="space-y-2">
          {questions.map((q, i) => (
            <li key={q.id ?? i} className="text-foreground text-sm">
              {i + 1}. {q.label}
            </li>
          ))}
        </ul>
      </div>
    );
  }

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
    const q = questions[index];
    if (q.id) {
      setDeletedIds((prev) => [...prev, q.id!]);
    }
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
    const errors: Record<number, string> = {};
    questions.forEach((q, i) => {
      if (!q.label.trim()) errors[i] = 'Label is required';
    });
    if (Object.keys(errors).length > 0) {
      setLabelErrors(errors);
      return;
    }
    setLabelErrors({});
    setIsSaving(true);

    try {
      for (const id of deletedIds) {
        const result = await deleteEventQuestion(eventId, id);
        if (!result.success) {
          toast.error(result.error ?? 'Failed to delete question');
          return;
        }
      }

      for (const q of questions) {
        if (!q.id) continue;
        const result = await updateEventQuestion(eventId, q.id, {
          type: q.type,
          label: q.label,
          help_text: q.help_text || null,
          required: q.required,
          options: q.options.length ? q.options : null,
          show_if: null,
        });
        if (!result.success) {
          toast.error(result.error ?? 'Failed to update question');
          return;
        }
      }

      const addedIds: string[] = [];
      for (const q of questions) {
        if (q.id) continue;
        const result = await addEventQuestion(eventId, {
          type: q.type,
          label: q.label,
          help_text: q.help_text || null,
          required: q.required,
          options: q.options.length ? q.options : null,
          show_if: null,
        });
        if (!result.success) {
          toast.error(result.error ?? 'Failed to add question');
          return;
        }
        addedIds.push(result.data.id);
      }

      let newIdx = 0;
      const finalOrder = questions.map((q) => q.id ?? addedIds[newIdx++]);

      if (finalOrder.length > 0) {
        const result = await reorderEventQuestions(eventId, finalOrder);
        if (!result.success) {
          toast.error(result.error ?? 'Failed to reorder questions');
          return;
        }
      }

      toast.success('Questionnaire saved');
      setDeletedIds([]);
      initialOrderRef.current = finalOrder;

      let assignedIdx = 0;
      setQuestions((prev) =>
        prev.map((q) => (q.id ? q : { ...q, id: addedIds[assignedIdx++] })),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSeed() {
    if (!selectedTemplateId) return;
    setIsSeedingTemplate(true);
    try {
      const result = await seedEventQuestionnaireFromTemplate({
        eventId,
        templateId: selectedTemplateId,
        replaceExisting: false,
      });
      if (!result.success) {
        toast.error(result.error ?? 'Failed to seed template');
        return;
      }
      toast.success('Questions added from template');
      setSelectedTemplateId('');
      router.refresh();
    } finally {
      setIsSeedingTemplate(false);
    }
  }

  return (
    <div className="space-y-4">
      {templates.length > 0 && !isLocked && (
        <div className={hasAnswers ? 'pointer-events-none opacity-50' : ''}>
          <p className="text-foreground mb-2 text-sm font-medium">Seed from template</p>
          <div className="flex gap-2">
            <Select
              value={selectedTemplateId}
              options={templates.map((t) => ({ value: t.id, label: t.name }))}
              placeholder="Select a template…"
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="max-w-xs"
            />
            <Button
              variant="outline"
              type="button"
              disabled={!selectedTemplateId || isSeedingTemplate || hasAnswers}
              isLoading={isSeedingTemplate}
              onClick={handleSeed}
            >
              Seed
            </Button>
          </div>
          {hasAnswers && (
            <p className="text-muted mt-1 text-xs">
              Seeding is disabled because this event has received answers.
            </p>
          )}
        </div>
      )}

      {questions.map((q, i) => (
        <div key={q.id ?? `new-${i}`} className="flex gap-2 items-start">
          <div className="flex flex-col gap-1 pt-5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={i === 0}
              onClick={() => moveUp(i)}
              aria-label="Move question up"
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={i === questions.length - 1}
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

      <div className="flex gap-3 pt-2">
        <Button variant="outline" type="button" onClick={addQuestion}>
          Add question
        </Button>
        <Button type="button" onClick={handleSave} isLoading={isSaving} disabled={isSaving}>
          Save questionnaire
        </Button>
      </div>
    </div>
  );
}
