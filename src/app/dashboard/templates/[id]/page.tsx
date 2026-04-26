import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTemplate } from '@/lib/actions/templates';
import { TemplateBuilder } from './template-builder';

interface TemplateDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TemplateDetailPage({ params }: TemplateDetailPageProps) {
  const { id } = await params;

  const result = await getTemplate(id);

  if (!result.success) {
    notFound();
  }

  if (!result.data) {
    notFound();
  }

  const { template, questions } = result.data;

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
        <h1 className="text-foreground text-2xl font-bold">Edit Template</h1>
        <p className="text-muted mt-1 text-sm">
          Update <span className="font-medium">{template.name}</span>.
        </p>
      </div>

      <TemplateBuilder
        templateId={template.id}
        initialName={template.name}
        initialDescription={template.description}
        initialQuestions={questions}
      />
    </div>
  );
}
