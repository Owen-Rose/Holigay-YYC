import type { QuestionType } from '@/components/questionnaire/question-types';
import { coerceJsonbToAnswer } from '@/lib/questionnaire/answer-coercion';
import type { Json } from '@/types/database';

type AnswerRendererProps = {
  question: {
    id: string;
    label: string;
    type: QuestionType;
    options: { key: string; label: string }[] | null;
  };
  rawValue: Json;
};

function Pill({ text }: { text: string }) {
  return (
    <span className="bg-foreground/10 text-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
      {text}
    </span>
  );
}

export function AnswerRenderer({ question, rawValue }: AnswerRendererProps) {
  const answer = coerceJsonbToAnswer(rawValue, question.type);

  let valueNode: React.ReactNode;

  if (answer === null) {
    valueNode = <p>—</p>;
  } else if (answer.kind === 'text') {
    valueNode = <p>{answer.value}</p>;
  } else if (answer.kind === 'number') {
    valueNode = <p>{answer.value}</p>;
  } else if (answer.kind === 'date') {
    const formatted = new Date(answer.value + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    valueNode = <p>{formatted}</p>;
  } else if (answer.kind === 'choice') {
    const opt = question.options?.find((o) => o.key === answer.value);
    valueNode = (
      <div className="flex flex-wrap gap-1">
        <Pill text={opt?.label ?? answer.value} />
      </div>
    );
  } else if (answer.kind === 'choices') {
    valueNode = (
      <div className="flex flex-wrap gap-1">
        {answer.value.map((key) => {
          const opt = question.options?.find((o) => o.key === key);
          return <Pill key={key} text={opt?.label ?? key} />;
        })}
      </div>
    );
  } else if (answer.kind === 'boolean') {
    valueNode = (
      <span className="bg-foreground/10 text-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
        {answer.value ? 'Yes' : 'No'}
      </span>
    );
  } else if (answer.kind === 'file') {
    valueNode = (
      <a
        href={answer.path}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:text-primary-hover"
      >
        {answer.name}
      </a>
    );
  } else {
    // SC-007: unknown kind — plain text fallback
    valueNode = <p>—</p>;
  }

  return (
    <div className="py-2">
      <dt className="text-muted text-sm font-medium">{question.label}</dt>
      <dd className="text-foreground mt-1 text-sm">{valueNode}</dd>
    </div>
  );
}
