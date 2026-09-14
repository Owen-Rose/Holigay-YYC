import type { AnswerWithQuestion } from '@/lib/actions/applications';
import type { QuestionType } from '@/components/questionnaire/question-types';
import { AnswerRenderer } from '@/components/questionnaire/answer-renderer';
import { Card, CardTitle } from '@/components/ui/card';

type DynamicAnswersProps = {
  answers: AnswerWithQuestion[];
};

export function DynamicAnswers({ answers }: DynamicAnswersProps) {
  return (
    <Card>
      <CardTitle className="mb-4 font-semibold">Application Answers</CardTitle>
      <dl className="divide-border-subtle divide-y">
        {answers.map((a) => (
          <AnswerRenderer
            key={a.answerId}
            question={{
              id: a.question.id,
              label: a.question.label,
              type: a.question.type as QuestionType,
              options: Array.isArray(a.question.options)
                ? (a.question.options as { key: string; label: string }[])
                : null,
            }}
            rawValue={a.rawValue}
          />
        ))}
      </dl>
    </Card>
  );
}
