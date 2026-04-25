'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { QuestionInput } from '@/components/forms/question-input';
import { vendorInfoSchema } from '@/lib/validations/application';
import { evaluateShowIf, type ShowIfRule } from '@/lib/questionnaire/show-if';
import { submitDynamicApplication } from '@/lib/actions/answers';
import { uploadFile } from '@/lib/actions/upload';
import type { AnswerValue } from '@/lib/questionnaire/answer-coercion';
import type { Database } from '@/types/database';
import type { z } from 'zod';

type EventQuestion = Database['public']['Tables']['event_questions']['Row'];
type VendorFields = z.infer<typeof vendorInfoSchema>;

type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; applicationId: string };

interface DynamicApplicationFormProps {
  eventId: string;
  eventName: string;
  questions: EventQuestion[];
}

export function DynamicApplicationForm({
  eventId,
  eventName,
  questions,
}: DynamicApplicationFormProps) {
  const [state, setState] = React.useState<SubmissionState>({ status: 'idle' });
  const [answers, setAnswers] = React.useState<Record<string, AnswerValue | undefined>>({});
  const [pendingFiles, setPendingFiles] = React.useState<Record<string, File>>({});
  const [answerErrors, setAnswerErrors] = React.useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VendorFields>({
    resolver: zodResolver(vendorInfoSchema),
  });

  // Compute visible question set reactively from current answers
  const visibleQuestionIds = React.useMemo(() => {
    const visible = new Set<string>();
    const snapshot: Record<string, { kind: string; value: unknown } | undefined> = {};
    for (const q of questions) {
      const showIfRule = (q.show_if ?? null) as ShowIfRule | null;
      if (evaluateShowIf(showIfRule, snapshot)) {
        visible.add(q.id);
        const ans = answers[q.id];
        if (ans != null) {
          if (ans.kind === 'file') {
            snapshot[q.id] = { kind: 'file', value: undefined };
          } else {
            snapshot[q.id] = { kind: ans.kind, value: ans.value };
          }
        }
      }
    }
    return visible;
  }, [questions, answers]);

  const handleAnswer = (questionId: string, value: AnswerValue | undefined) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (value !== undefined) {
      setAnswerErrors((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
  };

  const handleFileSelect = (questionId: string, file: File | null) => {
    setPendingFiles((prev) => {
      const next = { ...prev };
      if (file) next[questionId] = file;
      else delete next[questionId];
      return next;
    });
  };

  const onSubmit = async (vendor: VendorFields) => {
    // Required check on visible questions
    const newErrors: Record<string, string> = {};
    for (const q of questions) {
      if (!visibleQuestionIds.has(q.id)) continue;
      if (!q.required) continue;
      if (!answers[q.id]) {
        newErrors[q.id] = `${q.label} is required`;
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setAnswerErrors(newErrors);
      return;
    }

    setState({ status: 'submitting' });

    // Upload pending files and build final answers
    const finalAnswers: Record<string, AnswerValue> = {};

    for (const q of questions) {
      if (!visibleQuestionIds.has(q.id)) continue;
      const ans = answers[q.id];
      if (!ans) continue;

      if (ans.kind === 'file') {
        const file = pendingFiles[q.id];
        if (!file) {
          toast.error(`File missing for "${q.label}"`);
          setState({ status: 'idle' });
          return;
        }
        const formData = new FormData();
        formData.append('file', file);
        const uploadResult = await uploadFile(formData);
        if (!uploadResult.success || !uploadResult.data) {
          toast.error(uploadResult.error ?? `Failed to upload file for "${q.label}"`);
          setState({ status: 'idle' });
          return;
        }
        finalAnswers[q.id] = {
          kind: 'file',
          path: uploadResult.data.filePath,
          name: uploadResult.data.fileName,
          mimeType: uploadResult.data.fileType,
          size: uploadResult.data.fileSize,
        };
      } else {
        finalAnswers[q.id] = ans;
      }
    }

    const answersPayload = Object.entries(finalAnswers).map(([questionId, value]) => ({
      questionId,
      value,
    }));

    const result = await submitDynamicApplication({ eventId, vendor, answers: answersPayload });

    if (!result.success) {
      toast.error(result.error ?? 'Failed to submit application');
      setState({ status: 'idle' });
      return;
    }

    setState({ status: 'success', applicationId: result.data!.applicationId });
  };

  if (state.status === 'success') {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
          <svg
            className="h-8 w-8 text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-foreground text-2xl font-bold">Application Submitted!</h2>
        <p className="text-muted mt-2">
          Thank you for applying to <strong>{eventName}</strong>. We&apos;ll review it and get back
          to you soon.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Application ID: {state.applicationId}
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Link
            href="/"
            className="bg-primary text-primary-foreground hover:bg-primary-hover focus:ring-primary/50 focus:ring-offset-background rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none"
          >
            Back to Home
          </Link>
          <button
            onClick={() => {
              setState({ status: 'idle' });
              setAnswers({});
              setPendingFiles({});
              setAnswerErrors({});
            }}
            className="border-border bg-surface text-foreground hover:bg-surface-bright focus:ring-primary/50 focus:ring-offset-background rounded-md border px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none"
          >
            Submit Another Application
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {/* Vendor contact fields */}
      <section className="space-y-4">
        <h2 className="text-foreground text-lg font-semibold">Business Information</h2>

        <Input
          label="Business Name *"
          {...register('businessName')}
          error={errors.businessName?.message}
          placeholder="Your business name"
        />
        <Input
          label="Contact Name *"
          {...register('contactName')}
          error={errors.contactName?.message}
          placeholder="Your full name"
        />
        <Input
          label="Email *"
          type="email"
          {...register('email')}
          error={errors.email?.message}
          placeholder="you@example.com"
        />
        <Input
          label="Phone"
          type="tel"
          {...register('phone')}
          error={errors.phone?.message}
          placeholder="(555) 123-4567"
        />
        <Input
          label="Website"
          type="url"
          {...register('website')}
          error={errors.website?.message}
          placeholder="https://yourbusiness.com"
        />
        <Textarea
          label="Business Description"
          {...register('description')}
          error={errors.description?.message}
          placeholder="Tell us about your business..."
        />
      </section>

      {/* Dynamic questions */}
      {questions.some((q) => visibleQuestionIds.has(q.id)) && (
        <section className="space-y-4">
          <h2 className="text-foreground text-lg font-semibold">Application Questions</h2>
          {questions
            .filter((q) => visibleQuestionIds.has(q.id))
            .map((q) => (
              <QuestionInput
                key={q.id}
                question={q}
                value={answers[q.id]}
                onChange={(v) => handleAnswer(q.id, v)}
                error={answerErrors[q.id]}
                onFileSelect={(file) => handleFileSelect(q.id, file)}
              />
            ))}
        </section>
      )}

      <Button
        type="submit"
        disabled={state.status === 'submitting'}
        className="w-full"
      >
        {state.status === 'submitting' ? 'Submitting…' : 'Submit Application'}
      </Button>
    </form>
  );
}
