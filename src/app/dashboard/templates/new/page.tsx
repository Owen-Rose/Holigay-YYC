import Link from 'next/link';
import { TemplateBuilder } from '../[id]/template-builder';

export default function NewTemplatePage() {
  return (
    <div>
      <div className="mb-8">
        <Link
          href="/dashboard/templates"
          className="text-muted hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
            />
          </svg>
          Back to Templates
        </Link>
        <h1 className="text-foreground text-2xl font-bold">New Template</h1>
        <p className="text-muted mt-1 text-sm">
          Build a reusable set of questions to seed into event questionnaires.
        </p>
      </div>

      <TemplateBuilder initialQuestions={[]} />
    </div>
  );
}
